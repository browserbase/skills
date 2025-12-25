#!/usr/bin/env node
import { Stagehand } from '@browserbasehq/stagehand';
import { existsSync, mkdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { findLocalChrome, prepareChromeProfile, takeScreenshot, getAnthropicApiKey } from './browser-utils.js';
import { z } from 'zod';
import dotenv from 'dotenv';

if (!import.meta.url) {
  console.error('Error: This script must be run as an ES module');
  console.error('Ensure your package.json has "type": "module" and Node.js version is 14+');
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = resolve(__dirname, '..', '..');

dotenv.config({ path: join(PLUGIN_ROOT, '.env'), quiet: true });

const PROXY_URL = process.env.CLIPROXY_URL || 'http://localhost:8317';
let useProxy = false;

async function checkProxyAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${PROXY_URL}/v1/models`, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch {
    return false;
  }
}

const apiKeyResult = getAnthropicApiKey();

let stagehandInstance: Stagehand | null = null;
let currentPage: any = null;

import { spawn, ChildProcess } from 'child_process';

const CDP_PORT = 9222;
let chromeProcess: ChildProcess | null = null;

interface BrowserConfig {
  headless?: boolean;
  screenshotDir?: string;
  model?: string;
}

function loadConfig(): BrowserConfig {
  const configPath = join(PLUGIN_ROOT, '.browser-config.json');
  try {
    if (existsSync(configPath)) {
      return JSON.parse(require('fs').readFileSync(configPath, 'utf-8'));
    }
  } catch {}
  return {};
}

const config = loadConfig();
let headlessMode = config.headless ?? false;
const screenshotDir = config.screenshotDir;
const DEFAULT_MODEL = "anthropic/claude-haiku-4-5-20251001";
const modelName = config.model ?? DEFAULT_MODEL;

async function ensureChromeRunning(chromePath: string): Promise<string> {
  const httpUrl = `http://127.0.0.1:${CDP_PORT}`;
  
  try {
    const response = await fetch(`${httpUrl}/json/version`, { signal: AbortSignal.timeout(1000) });
    if (response.ok) {
      const data = await response.json();
      if (process.env.DEBUG) console.error('🔗 Reusing existing Chrome on port', CDP_PORT);
      return data.webSocketDebuggerUrl;
    }
  } catch {}

  const userDataDir = join(PLUGIN_ROOT, '.chrome-profile');
  if (process.env.DEBUG) console.error('🚀 Launching Chrome on port', CDP_PORT);
  
  const chromeArgs = [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
  ];
  
  if (headlessMode) {
    chromeArgs.push('--headless=new');
  } else {
    chromeArgs.push('--window-position=-9999,-9999');
  }
  
  chromeProcess = spawn(chromePath, chromeArgs, { detached: true, stdio: 'ignore' });
  chromeProcess.unref();

  for (let i = 0; i < 30; i++) {
    try {
      const response = await fetch(`${httpUrl}/json/version`, { signal: AbortSignal.timeout(500) });
      if (response.ok) {
        const data = await response.json();
        return data.webSocketDebuggerUrl;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Chrome failed to start');
}

async function initBrowser() {
  if (stagehandInstance) {
    return { stagehand: stagehandInstance, page: currentPage };
  }

  const chromePath = findLocalChrome();
  if (!chromePath) {
    throw new Error('Could not find Chrome installation');
  }

  useProxy = await checkProxyAvailable();
  
  if (!useProxy && !apiKeyResult) {
    console.error('Error: No Anthropic API key found and CLIProxyAPI not running.');
    console.error('\n🔌 Option 1: Start CLIProxyAPI (RECOMMENDED)');
    console.error('   Run CLIProxyAPI on localhost:8317');
    console.error('\n📋 Option 2: Use your Claude subscription');
    console.error('   If you have Claude Pro/Max, run: claude setup-token');
    console.error('   This will store your subscription token in the system keychain.');
    console.error('\n🔑 Option 3: Use an API key');
    console.error('   Export in terminal: export ANTHROPIC_API_KEY="your-api-key"');
    console.error('   Or create a .env file with: ANTHROPIC_API_KEY="your-api-key"');
    process.exit(1);
  }

  if (process.env.DEBUG) {
    console.error(useProxy 
      ? `🔌 Using CLIProxyAPI at ${PROXY_URL}`
      : apiKeyResult?.source === 'claude-code' 
        ? '🔐 Using Claude Code subscription token from keychain'
        : '🔑 Using ANTHROPIC_API_KEY from environment');
  }

  const modelConfig = useProxy
    ? { modelName, baseURL: PROXY_URL + "/v1", apiKey: "sk-proxy" }
    : { modelName, apiKey: apiKeyResult!.apiKey };

  const cdpUrl = await ensureChromeRunning(chromePath);

  stagehandInstance = new Stagehand({
    env: "LOCAL",
    verbose: 0,
    model: modelConfig as any,
    localBrowserLaunchOptions: {
      cdpUrl,
      headless: headlessMode,
    },
  });

  await stagehandInstance.init();
  currentPage = await stagehandInstance.context.awaitActivePage();

  return { stagehand: stagehandInstance, page: currentPage };
}

async function closeBrowser() {
  if (stagehandInstance) {
    try {
      await stagehandInstance.close();
    } catch (error) {
      console.error('Error closing Stagehand:', error instanceof Error ? error.message : String(error));
    }
    stagehandInstance = null;
    currentPage = null;
  }
}

async function navigate(url: string) {
  try {
    const { page } = await initBrowser();
    await page.goto(url);
    const screenshotPath = await takeScreenshot(page, PLUGIN_ROOT, false, screenshotDir);
    return {
      success: true,
      message: `Successfully navigated to ${url}`,
      screenshot: screenshotPath
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function act(action: string) {
  try {
    const { stagehand, page } = await initBrowser();
    await stagehand.act(action);
    const screenshotPath = await takeScreenshot(page, PLUGIN_ROOT, false, screenshotDir);
    return {
      success: true,
      message: `Successfully performed action: ${action}`,
      screenshot: screenshotPath
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function extract(instruction: string, schema?: Record<string, string>) {
  try {
    const { stagehand, page } = await initBrowser();

    let zodSchemaObject;

    if (schema) {
      try {
        const zodSchema: Record<string, any> = {};
        let hasValidTypes = true;

        for (const [key, type] of Object.entries(schema)) {
          switch (type) {
            case "string":
              zodSchema[key] = z.string();
              break;
            case "number":
              zodSchema[key] = z.number();
              break;
            case "boolean":
              zodSchema[key] = z.boolean();
              break;
            default:
              console.error(`Warning: Unsupported schema type "${type}" for field "${key}". Proceeding without schema validation.`);
              hasValidTypes = false;
              break;
          }
        }

        if (hasValidTypes && Object.keys(zodSchema).length > 0) {
          zodSchemaObject = z.object(zodSchema);
        }
      } catch (schemaError) {
        console.error('Warning: Failed to convert schema. Proceeding without schema validation:',
          schemaError instanceof Error ? schemaError.message : String(schemaError));
      }
    }

    const result = zodSchemaObject 
      ? await stagehand.extract(instruction, zodSchemaObject)
      : await stagehand.extract(instruction);

    const screenshotPath = await takeScreenshot(page, PLUGIN_ROOT, false, screenshotDir);
    return {
      success: true,
      message: `Successfully extracted data: ${JSON.stringify(result)}`,
      screenshot: screenshotPath
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function observe(query: string) {
  try {
    const { stagehand, page } = await initBrowser();
    const actions = await stagehand.observe(query);
    const screenshotPath = await takeScreenshot(page, PLUGIN_ROOT, false, screenshotDir);
    return {
      success: true,
      message: `Successfully observed: ${JSON.stringify(actions)}`,
      screenshot: screenshotPath
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function screenshot(fullPage: boolean = false) {
  try {
    const { page } = await initBrowser();
    const screenshotPath = await takeScreenshot(page, PLUGIN_ROOT, fullPage, screenshotDir);
    return {
      success: true,
      screenshot: screenshotPath
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

import { Command } from 'commander';

async function runCommand(fn: () => Promise<any>, keepOpen: boolean) {
  try {
    const result = await fn();
    console.log(JSON.stringify(result, null, 2));
    if (!keepOpen) await closeBrowser();
    process.exit(0);
  } catch (error) {
    await closeBrowser();
    console.error(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, null, 2));
    process.exit(1);
  }
}

async function main() {
  prepareChromeProfile(PLUGIN_ROOT);

  const program = new Command()
    .name('browser')
    .description('Browser automation CLI powered by Stagehand')
    .version('1.0.0')
    .option('--headless', 'Run browser in headless mode')
    .hook('preAction', (thisCommand) => {
      const opts = thisCommand.opts();
      if (opts.headless) {
        headlessMode = true;
      }
    });

  program
    .command('navigate <url>')
    .description('Navigate to a URL')
    .option('-k, --keep-open', 'Keep browser open after command')
    .action((url, opts) => runCommand(() => navigate(url), opts.keepOpen));

  program
    .command('act <action>')
    .description('Perform an action using natural language')
    .option('-k, --keep-open', 'Keep browser open after command')
    .action((action, opts) => runCommand(() => act(action), opts.keepOpen));

  program
    .command('extract <instruction>')
    .description('Extract data from the page')
    .argument('[schema]', 'Optional JSON schema for extraction')
    .option('-k, --keep-open', 'Keep browser open after command')
    .action((instruction, schema, opts) => {
      const parsedSchema = schema ? JSON.parse(schema) : undefined;
      runCommand(() => extract(instruction, parsedSchema), opts.keepOpen);
    });

  program
    .command('observe <query>')
    .description('Observe page elements matching a query')
    .option('-k, --keep-open', 'Keep browser open after command')
    .action((query, opts) => runCommand(() => observe(query), opts.keepOpen));

  program
    .command('screenshot')
    .description('Take a screenshot of the current page')
    .option('-k, --keep-open', 'Keep browser open after command')
    .option('-f, --full-page', 'Capture the full page, not just the viewport')
    .action((opts) => runCommand(() => screenshot(opts.fullPage), opts.keepOpen));

  program
    .command('close')
    .description('Close the browser')
    .action(() => runCommand(async () => {
      await closeBrowser();
      return { success: true, message: 'Browser closed' };
    }, true));

  await program.parseAsync(process.argv);
}

process.on('SIGINT', async () => {
  await closeBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeBrowser();
  process.exit(0);
});

main().catch(console.error);
