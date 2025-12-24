import { existsSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { platform } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';

// Retrieve Claude Code API key from system keychain
export function getClaudeCodeApiKey(): string | null {
  try {
    if (platform() === 'darwin') {
      const result = execSync(
        'security find-generic-password -s "Claude Code" -w 2>/dev/null',
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();
      if (result && result.startsWith('sk-ant-')) {
        return result;
      }
    } else if (platform() === 'win32') {
      try {
        const psCommand = `$cred = Get-StoredCredential -Target "Claude Code" -ErrorAction SilentlyContinue; if ($cred) { $cred.GetNetworkCredential().Password }`;
        const result = execSync(`powershell -Command "${psCommand}"`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe']
        }).trim();
        if (result && result.startsWith('sk-ant-')) {
          return result;
        }
      } catch {}
    } else {
      // Linux
      const configPaths = [
        join(process.env.HOME || '', '.claude', 'credentials'),
        join(process.env.HOME || '', '.config', 'claude-code', 'credentials'),
        join(process.env.XDG_CONFIG_HOME || join(process.env.HOME || '', '.config'), 'claude-code', 'credentials'),
      ];
      for (const configPath of configPaths) {
        if (existsSync(configPath)) {
          try {
            const content = readFileSync(configPath, 'utf-8').trim();
            if (content.startsWith('sk-ant-')) {
              return content;
            }
            const parsed = JSON.parse(content);
            if (parsed.apiKey && parsed.apiKey.startsWith('sk-ant-')) {
              return parsed.apiKey;
            }
          } catch {}
        }
      }
      try {
        const result = execSync(
          'secret-tool lookup service "Claude Code" 2>/dev/null',
          { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
        ).trim();
        if (result && result.startsWith('sk-ant-')) {
          return result;
        }
      } catch {}
    }
  } catch {}
  return null;
}

// Get API key from env or Claude Code keychain
export function getAnthropicApiKey(): { apiKey: string; source: 'env' | 'claude-code' } | null {
  if (process.env.ANTHROPIC_API_KEY) {
    return { apiKey: process.env.ANTHROPIC_API_KEY, source: 'env' };
  }
  const claudeCodeKey = getClaudeCodeApiKey();
  if (claudeCodeKey) {
    return { apiKey: claudeCodeKey, source: 'claude-code' };
  }
  return null;
}

/**
 * Finds the local Chrome installation path based on the operating system
 * @returns The path to the Chrome executable, or undefined if not found
 */
export function findLocalChrome(): string | undefined {
  const systemPlatform = platform();
  const chromePaths: string[] = [];

  if (systemPlatform === 'darwin') {
    // macOS paths
    chromePaths.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      `${process.env.HOME}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
      `${process.env.HOME}/Applications/Chromium.app/Contents/MacOS/Chromium`
    );
  } else if (systemPlatform === 'win32') {
    // Windows paths
    chromePaths.push(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
      'C:\\Program Files\\Chromium\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Chromium\\Application\\chrome.exe'
    );
  } else {
    // Linux paths
    chromePaths.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
      '/usr/local/bin/google-chrome',
      '/usr/local/bin/chromium',
      '/opt/google/chrome/chrome',
      '/opt/google/chrome/google-chrome'
    );
  }

  // Find the first existing Chrome installation
  for (const path of chromePaths) {
    if (path && existsSync(path)) {
      return path;
    }
  }

  return undefined;
}

/**
 * Gets the Chrome user data directory path based on the operating system
 * @returns The path to Chrome's user data directory, or undefined if not found
 */
export function getChromeUserDataDir(): string | undefined {
  const systemPlatform = platform();

  if (systemPlatform === 'darwin') {
    return `${process.env.HOME}/Library/Application Support/Google/Chrome`;
  } else if (systemPlatform === 'win32') {
    return `${process.env.LOCALAPPDATA}\\Google\\Chrome\\User Data`;
  } else {
    // Linux
    return `${process.env.HOME}/.config/google-chrome`;
  }
}

/**
 * Prepares the Chrome profile by copying it to .chrome-profile directory (first run only)
 * This should be called before initializing Stagehand to avoid timeouts
 * @param pluginRoot The root directory of the plugin
 */
export function prepareChromeProfile(pluginRoot: string) {
  const sourceUserDataDir = getChromeUserDataDir();
  const tempUserDataDir = join(pluginRoot, '.chrome-profile');

  // Only copy if the temp directory doesn't exist yet
  if (!existsSync(tempUserDataDir)) {
    const dim = '\x1b[2m';
    const reset = '\x1b[0m';

    // Show copying message
    console.log(`${dim}Copying Chrome profile to .chrome-profile/ (this may take a minute)...${reset}`);

    mkdirSync(tempUserDataDir, { recursive: true });

    // Copy the Default profile directory (contains cookies, local storage, etc.)
    const sourceDefaultProfile = join(sourceUserDataDir!, 'Default');
    const destDefaultProfile = join(tempUserDataDir, 'Default');

    if (existsSync(sourceDefaultProfile)) {
      cpSync(sourceDefaultProfile, destDefaultProfile, { recursive: true });
      console.log(`${dim}✓ Profile copied successfully${reset}\n`);
    } else {
      console.log(`${dim}No existing profile found, using fresh profile${reset}\n`);
    }
  }
}

// Take screenshot using page's screenshot method
export async function takeScreenshot(page: any, pluginRoot: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotDir = join(pluginRoot, 'agent/browser_screenshots');
  const screenshotPath = join(screenshotDir, `screenshot-${timestamp}.png`);

  // Create directory if it doesn't exist
  if (!existsSync(screenshotDir)) {
    mkdirSync(screenshotDir, { recursive: true });
  }

  // Use page.screenshot() which returns a Buffer
  const buffer = await page.screenshot({ type: 'png' });
  
  // Resize if needed
  const sharp = (await import('sharp')).default;
  const image = sharp(buffer);
  const metadata = await image.metadata();
  const { width, height } = metadata;

  let finalBuffer: Buffer = buffer;

  // Only resize if image exceeds 2000x2000
  if (width && height && (width > 2000 || height > 2000)) {
    finalBuffer = await sharp(buffer)
      .resize(2000, 2000, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .png()
      .toBuffer();
  }

  writeFileSync(screenshotPath, finalBuffer);
  return screenshotPath;
}
