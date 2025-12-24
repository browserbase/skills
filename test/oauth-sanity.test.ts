#!/usr/bin/env node
/**
 * OAuth Sanity Test
 * 
 * Verifies that browser automation works with Claude via CLIProxyAPI or API key.
 * Uses Browserbase's blog page directly (avoids Google CAPTCHA).
 * Expected: Paul Klein is CEO/co-founder of Browserbase.
 * 
 * Prerequisites:
 * - Node.js 22 (not 25+)
 * - Either: ANTHROPIC_API_KEY set, or CLIProxyAPI running on port 8317
 * 
 * Run: node dist/test/oauth-sanity.test.js
 */

import { Stagehand } from '@browserbasehq/stagehand';

const EXPECTED_NAME = 'Paul Klein';
const PROXY_URL = process.env.CLIPROXY_URL || 'http://localhost:8317';

async function getModelConfig(): Promise<{ modelName: string; baseURL?: string; apiKey: string }> {
  // Try direct API key first
  if (process.env.ANTHROPIC_API_KEY) {
    console.log('Using ANTHROPIC_API_KEY');
    return {
      modelName: 'anthropic/claude-sonnet-4-20250514',
      apiKey: process.env.ANTHROPIC_API_KEY,
    };
  }

  // Try CLIProxyAPI
  try {
    const response = await fetch(`${PROXY_URL}/v1/models`);
    if (response.ok) {
      console.log('Using CLIProxyAPI at', PROXY_URL);
      return {
        modelName: 'anthropic/claude-sonnet-4-20250514',
        baseURL: PROXY_URL + '/v1',
        apiKey: 'sk-proxy',
      };
    }
  } catch {}

  throw new Error('No API key or CLIProxyAPI available. Set ANTHROPIC_API_KEY or start CLIProxyAPI.');
}

async function testBrowserAutomation(): Promise<boolean> {
  console.log('Sanity Test: Extract CEO from Browserbase about page\n');

  const modelConfig = await getModelConfig();

  const stagehand = new Stagehand({
    env: 'LOCAL',
    verbose: 0,
    model: modelConfig as any,
    localBrowserLaunchOptions: {
      headless: true,
    },
  });

  try {
    await stagehand.init();
    const page = await stagehand.context.awaitActivePage();
    console.log('✓ Browser initialized');

    await page.goto('https://www.browserbase.com/blog/series-b-and-beyond');
    console.log('✓ Navigated to Browserbase blog');

    await new Promise(r => setTimeout(r, 1000));

    const result = await stagehand.extract('Who is the CEO or co-founder of Browserbase? Just the name.');
    const extraction = (result as any).extraction || '';
    console.log(`✓ Extracted: "${extraction}"`);

    await stagehand.close();

    const passed = extraction.toLowerCase().includes(EXPECTED_NAME.toLowerCase());

    console.log('\n' + '='.repeat(50));
    if (passed) {
      console.log(`✅ PASSED: Found "${EXPECTED_NAME}"`);
    } else {
      console.log(`❌ FAILED: Expected "${EXPECTED_NAME}", got "${extraction}"`);
    }
    console.log('='.repeat(50));

    return passed;
  } catch (error) {
    console.error('❌ Test failed:', (error as Error).message);
    await stagehand.close().catch(() => {});
    return false;
  }
}

testBrowserAutomation()
  .then(passed => process.exit(passed ? 0 : 1))
  .catch(e => {
    console.error('❌', e.message);
    process.exit(1);
  });
