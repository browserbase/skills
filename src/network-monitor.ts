import { Stagehand } from '@browserbasehq/stagehand';
import { findLocalChrome } from './browser-utils.js';
import { spawn } from 'child_process';
import { join } from 'path';
import { writeFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

interface NetworkRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
  timestamp: string;
}

interface NetworkResponse {
  url: string;
  status: number;
  headers: Record<string, string>;
  body?: string;
  timestamp: string;
}

const capturedRequests: NetworkRequest[] = [];
const capturedResponses: NetworkResponse[] = [];

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: npx tsx src/network-monitor.ts <url>');
    process.exit(1);
  }

  const chromePath = findLocalChrome();
  if (!chromePath) {
    throw new Error('Could not find Chrome installation');
  }

  const cdpPort = 9223; // Use different port to avoid conflicts
  const tempUserDataDir = join(process.cwd(), '.chrome-profile-monitor');

  // Launch Chrome
  const chromeProcess = spawn(chromePath, [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${tempUserDataDir}`,
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  // Wait for Chrome to be ready
  let chromeReady = false;
  for (let i = 0; i < 50; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
      if (response.ok) {
        chromeReady = true;
        break;
      }
    } catch (error) {
      // Still waiting
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  if (!chromeReady) {
    throw new Error('Chrome failed to start');
  }

  console.log('Chrome started, initializing Stagehand...');

  // Initialize Stagehand
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 0,
    model: "anthropic/claude-haiku-4-5-20251001",
    localBrowserLaunchOptions: {
      cdpUrl: `http://localhost:${cdpPort}`,
    },
  });

  await stagehand.init();
  const page = stagehand.context.pages()[0];

  // Connect directly to CDP endpoint
  const client = stagehand.context.pages()[0].mainFrame().session;

  // Enable network tracking
  await client.send('Network.enable');

  console.log('Network monitoring enabled');

  // Listen to network requests
  client.on('Network.requestWillBeSent', (params: any) => {
    const request = params.request;

    // Only capture API calls (not images, fonts, etc.)
    if (request.url.includes('/api/') ||
        request.url.includes('.json') ||
        request.url.match(/graphql|trpc|rpc/i)) {

      capturedRequests.push({
        url: request.url,
        method: request.method,
        headers: request.headers,
        postData: request.postData,
        timestamp: new Date().toISOString(),
      });

      console.log(`\n[REQUEST] ${request.method} ${request.url}`);
      if (request.postData) {
        console.log(`[BODY] ${request.postData.substring(0, 200)}...`);
      }
    }
  });

  // Listen to network responses
  client.on('Network.responseReceived', async (params: any) => {
    const response = params.response;

    // Only capture API responses
    if (response.url.includes('/api/') ||
        response.url.includes('.json') ||
        response.url.match(/graphql|trpc|rpc/i)) {

      try {
        // Get response body
        const bodyResponse = await client.send<{ body: string; base64Encoded: boolean }>('Network.getResponseBody', {
          requestId: params.requestId,
        });

        capturedResponses.push({
          url: response.url,
          status: response.status,
          headers: response.headers,
          body: bodyResponse.body,
          timestamp: new Date().toISOString(),
        });

        console.log(`\n[RESPONSE] ${response.status} ${response.url}`);
        console.log(`[BODY] ${bodyResponse.body.substring(0, 200)}...`);
      } catch (error) {
        // Body might not be available for all responses
      }
    }
  });

  console.log(`\nNavigating to ${url}...`);
  await page.goto(url, { waitUntil: 'networkidle' });

  console.log('\nNavigation complete. Waiting 10 seconds for additional requests...');
  await new Promise(resolve => setTimeout(resolve, 10000));

  // Save captured data
  const outputFile = join(process.cwd(), 'network-capture.json');
  writeFileSync(outputFile, JSON.stringify({
    requests: capturedRequests,
    responses: capturedResponses,
  }, null, 2));

  console.log(`\n\nCaptured ${capturedRequests.length} requests and ${capturedResponses.length} responses`);
  console.log(`Saved to: ${outputFile}`);

  await stagehand.close();
  chromeProcess.kill();
}

main().catch(console.error);
