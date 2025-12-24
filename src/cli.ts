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
    console.error('Error: No authentication method available.');
    console.error('\n🔑 Option 1: API key');
    console.error('   export ANTHROPIC_API_KEY="your-api-key"');
    console.error('\n📋 Option 2: Claude subscription (OAuth)');
    console.error('   claude setup-token');
    console.error('\n🔌 Option 3: CLIProxyAPI');
    console.error(`   Start proxy on ${PROXY_URL}`);
    process.exit(1);
  }

  if (process.env.DEBUG) {
    console.error(useProxy 
      ? `🔌 Using CLIProxyAPI at ${PROXY_URL}`
      : apiKeyResult?.source === 'claude-code' 
        ? '🔐 Using Claude Code subscription token from keychain'
        : '🔑 Using ANTHROPIC_API_KEY from environment');
  }

  const DEFAULT_MODEL = "anthropic/claude-haiku-4-5-20251001";
  const modelConfig = useProxy
    ? { modelName: DEFAULT_MODEL, baseURL: PROXY_URL + "/v1", apiKey: "sk-proxy" }
    : { modelName: DEFAULT_MODEL, apiKey: apiKeyResult!.apiKey };

  stagehandInstance = new Stagehand({
    env: "LOCAL",
    verbose: 0,
    model: modelConfig as any,
    localBrowserLaunchOptions: {
      executablePath: chromePath,
      headless: false,
      args: ['--window-position=-9999,-9999', '--window-size=1280,900'],
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
    const screenshotPath = await takeScreenshot(page, PLUGIN_ROOT);
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
    const screenshotPath = await takeScreenshot(page, PLUGIN_ROOT);
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

    const screenshotPath = await takeScreenshot(page, PLUGIN_ROOT);
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
    const screenshotPath = await takeScreenshot(page, PLUGIN_ROOT);
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

async function screenshot() {
  try {
    const { page } = await initBrowser();
    const screenshotPath = await takeScreenshot(page, PLUGIN_ROOT);
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

async function main() {
  prepareChromeProfile(PLUGIN_ROOT);

  const args = process.argv.slice(2);
  const command = args[0];

  try {
    let result: { success: boolean; [key: string]: any };

    switch (command) {
      case 'navigate':
        if (args.length < 2) {
          throw new Error('Usage: browser navigate <url>');
        }
        result = await navigate(args[1]);
        break;

      case 'act':
        if (args.length < 2) {
          throw new Error('Usage: browser act "<action>"');
        }
        result = await act(args.slice(1).join(' '));
        break;

      case 'extract':
        if (args.length < 2) {
          throw new Error('Usage: browser extract "<instruction>" [\'{"field": "type"}\']');
        }
        const instruction = args[1];
        const schema = args[2] ? JSON.parse(args[2]) : undefined;
        result = await extract(instruction, schema);
        break;

      case 'observe':
        if (args.length < 2) {
          throw new Error('Usage: browser observe "<query>"');
        }
        result = await observe(args.slice(1).join(' '));
        break;

      case 'screenshot':
        result = await screenshot();
        break;

      case 'close':
        await closeBrowser();
        result = { success: true, message: 'Browser closed' };
        break;

      default:
        throw new Error(`Unknown command: ${command}\nAvailable commands: navigate, act, extract, observe, screenshot, close`);
    }

    console.log(JSON.stringify(result, null, 2));
    await closeBrowser();
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

process.on('SIGINT', async () => {
  await closeBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeBrowser();
  process.exit(0);
});

main().catch(console.error);
