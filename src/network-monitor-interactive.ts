import { Stagehand } from '@browserbasehq/stagehand';
import { findLocalChrome } from './browser-utils.js';
import { spawn } from 'child_process';
import { join } from 'path';
import { writeFileSync } from 'fs';
import dotenv from 'dotenv';
import CDP from 'chrome-remote-interface';
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
  const url = process.argv[2] || 'https://app.circleback.ai';

  const chromePath = findLocalChrome();
  if (!chromePath) {
    throw new Error('Could not find Chrome installation');
  }

  const cdpPort = 9224; // Different port
  const tempUserDataDir = join(process.cwd(), '.chrome-profile'); // Use your actual profile

  // Launch Chrome with your profile
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

  console.log('Chrome started with your profile...');

  // Initialize Stagehand
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    model: "claude-haiku-4-5-20251001",
    localBrowserLaunchOptions: {
      cdpUrl: `http://localhost:${cdpPort}`,
    },
  });

  await stagehand.init();
  const page = stagehand.context.pages()[0];

  // Connect directly to CDP endpoint
  const client = await CDP({ port: cdpPort });

  // Enable network tracking
  await client.Network.enable();

  console.log('Network monitoring enabled\n');

  // Listen to network requests
  client.Network.requestWillBeSent((params: any) => {
    const request = params.request;

    // Capture all API calls
    if (request.url.includes('circleback.ai/api/') ||
        request.url.includes('circleback.ai/trpc/')) {

      capturedRequests.push({
        url: request.url,
        method: request.method,
        headers: request.headers,
        postData: request.postData,
        timestamp: new Date().toISOString(),
      });

      console.log(`[${request.method}] ${request.url}`);
      if (request.postData) {
        try {
          const parsed = JSON.parse(request.postData);
          console.log(`  Body: ${JSON.stringify(parsed, null, 2).substring(0, 300)}`);
        } catch {
          console.log(`  Body: ${request.postData.substring(0, 200)}`);
        }
      }
    }
  });

  // Listen to network responses
  client.Network.responseReceived(async (params: any) => {
    const response = params.response;

    // Capture API responses
    if (response.url.includes('circleback.ai/api/') ||
        response.url.includes('circleback.ai/trpc/')) {

      try {
        const bodyResponse = await client.Network.getResponseBody({
          requestId: params.requestId,
        });

        capturedResponses.push({
          url: response.url,
          status: response.status,
          headers: response.headers,
          body: bodyResponse.body,
          timestamp: new Date().toISOString(),
        });

        console.log(`  -> ${response.status}`);
        if (bodyResponse.body) {
          try {
            const parsed = JSON.parse(bodyResponse.body);
            console.log(`  Response: ${JSON.stringify(parsed, null, 2).substring(0, 300)}\n`);
          } catch {
            console.log(`  Response: ${bodyResponse.body.substring(0, 200)}\n`);
          }
        }
      } catch (error) {
        // Body might not be available
      }
    }
  });

  console.log(`Navigating to ${url}...\n`);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeoutMs: 15000 });
    console.log('Page loaded!\n');
  } catch (error) {
    console.log('Page load timeout, but continuing...\n');
  }

  // Wait for API calls
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Try to navigate to meetings page if logged in
  try {
    console.log('Attempting to navigate to meetings...\n');
    await page.goto('https://app.circleback.ai/meetings', { waitUntil: 'domcontentloaded', timeoutMs: 15000 });
    await new Promise(resolve => setTimeout(resolve, 5000));
  } catch (error) {
    console.log('Could not navigate to meetings page\n');
  }

  // Save captured data
  const outputFile = join(process.cwd(), 'network-capture-interactive.json');
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
