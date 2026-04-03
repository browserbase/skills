// Smart fetch with Browserbase Fetch API fast-path and Stagehand browser fallback.
// Usage: npx tsx bb_smart_fetch.ts --url "https://example.com" [--output /tmp/result.json] [--raw]
// --raw: Output raw text content instead of structured JSON (useful for llms.txt, sitemap.xml)

import Browserbase from "@browserbasehq/sdk";
import { z } from "zod";
import { writeFileSync } from "fs";
import { chromium } from "playwright";

// ============= CONFIGURATION =============

const MIN_CONTENT_LENGTH = 500;
const MIN_TEXT_DENSITY = 0.05;

const JS_REQUIRED_PATTERNS = [
  /enable javascript/i,
  /javascript is (required|disabled|not enabled)/i,
  /please enable javascript/i,
  /this (site|page|app) requires javascript/i,
  /checking your browser/i,
  /<noscript>[^<]{200,}/i,
];

const CompanyDataSchema = z.object({
  company_name: z.string().describe("The company name"),
  product_description: z.string().describe("What the company does in 1-2 sentences"),
  industry: z.string().describe("The industry or vertical"),
  target_audience: z.string().describe("Who the company sells to"),
  key_features: z.array(z.string()).describe("Top 3-5 product features or capabilities"),
  employee_estimate: z.string().optional().describe("Estimated employee count or range"),
  funding_info: z.string().optional().describe("Funding stage or amount if mentioned"),
  headquarters: z.string().optional().describe("Company location if mentioned"),
});

// ============= HELPERS =============

function parseArgs(argv: string[]): { url: string; output?: string; raw: boolean } {
  const args = argv.slice(2);
  let url = "";
  let output: string | undefined;
  let raw = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--url":
        url = args[++i];
        break;
      case "--output":
        output = args[++i];
        break;
      case "--raw":
        raw = true;
        break;
    }
  }

  if (!url) {
    console.error('Usage: npx tsx bb_smart_fetch.ts --url "https://example.com" [--output path.json] [--raw]');
    process.exit(1);
  }

  return { url, output, raw };
}

function needsBrowserFallback(content: string, statusCode: number): string | null {
  if (statusCode < 200 || statusCode >= 300) {
    return `non-2xx status (${statusCode})`;
  }
  if (content.length < MIN_CONTENT_LENGTH) {
    return `content too short (${content.length} < ${MIN_CONTENT_LENGTH} chars)`;
  }
  for (const pattern of JS_REQUIRED_PATTERNS) {
    if (pattern.test(content)) {
      return `JS-required pattern: ${pattern}`;
    }
  }
  const textOnly = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const density = textOnly.length / content.length;
  if (density < MIN_TEXT_DENSITY) {
    return `text density too low (${(density * 100).toFixed(1)}%)`;
  }
  return null;
}

function extractFromHtml(html: string, url: string): z.infer<typeof CompanyDataSchema> {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : new URL(url).hostname;

  const metaDesc =
    html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i)?.[1] ||
    "";

  const ogDesc =
    html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
    "";

  const ogTitle =
    html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
    "";

  // Extract visible text for context
  const textOnly = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 3000);

  const description = metaDesc || ogDesc || textOnly.slice(0, 200);
  const companyName = ogTitle || title.split(/[|\-–—]/)[0].trim();

  return {
    company_name: companyName,
    product_description: description,
    industry: "Unknown",
    target_audience: "Unknown",
    key_features: [],
    employee_estimate: undefined,
    funding_info: undefined,
    headquarters: undefined,
  };
}

// ============= FETCH STRATEGIES =============

async function tryFetchApi(url: string): Promise<{ content: string; statusCode: number } | null> {
  const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY! });

  console.error("[fetch] Attempting lightweight fetch...");
  try {
    const data = await bb.fetchAPI.create({ url, allowRedirects: true });
    console.error(`[fetch] Got response: status=${data.statusCode}, length=${data.content.length}`);

    const fallbackReason = needsBrowserFallback(data.content, data.statusCode);
    if (fallbackReason) {
      console.error(`[fetch] Not usable — ${fallbackReason}`);
      return null;
    }
    return { content: data.content, statusCode: data.statusCode };
  } catch (error: any) {
    console.error(`[fetch] Failed: ${error.message || error}`);
    return null;
  }
}

async function fetchWithBrowser(url: string): Promise<string> {
  console.error("[browser] Creating Browserbase session...");
  const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY! });

  const session = await bb.sessions.create({
    proxies: true,
    browserSettings: {
      advancedStealth: true,
      blockAds: true,
      solveCaptchas: true,
    },
  });

  console.error(`[browser] Session: ${session.id}`);
  const browser = await chromium.connectOverCDP(session.connectUrl);

  try {
    const context = browser.contexts()[0];
    const page = context.pages()[0];
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    // Wait for JS to settle
    await page.waitForTimeout(2000);
    const html = await page.content();
    console.error(`[browser] Got rendered HTML: ${html.length} chars`);
    return html;
  } finally {
    await browser.close();
    console.error("[browser] Session closed");
  }
}

// ============= MAIN =============

async function main() {
  const { url, output, raw } = parseArgs(process.argv);

  if (!process.env.BROWSERBASE_API_KEY) {
    console.error("Error: BROWSERBASE_API_KEY environment variable is required");
    process.exit(1);
  }

  console.error(`[smart_fetch] Target: ${url}${raw ? " (raw mode)" : ""}`);

  // Try fast path first
  const fetchResult = await tryFetchApi(url);

  let content: string;
  let fetchMethod: string;

  if (fetchResult) {
    content = fetchResult.content;
    fetchMethod = "fetch_api";
  } else {
    // Fall back to browser
    console.error("[smart_fetch] Falling back to browser...");
    content = await fetchWithBrowser(url);
    fetchMethod = "browser";
  }

  // Raw mode: output the content as-is (useful for llms.txt, sitemap.xml, etc.)
  if (raw) {
    console.error(`[smart_fetch] Raw mode — ${content.length} chars via ${fetchMethod}`);
    const out = content;
    if (output) {
      writeFileSync(output, out, "utf-8");
      console.error(`[smart_fetch] Written to ${output}`);
    } else {
      console.log(out);
    }
    return;
  }

  // Structured mode: parse HTML into company data
  console.error(`[smart_fetch] Fetch API succeeded, parsing HTML...`);
  const result = extractFromHtml(content, url);
  const payload = JSON.stringify({ ...result, website: url, fetch_method: fetchMethod }, null, 2);

  if (output) {
    writeFileSync(output, payload, "utf-8");
    console.error(`[smart_fetch] Written to ${output}`);
  } else {
    console.log(payload);
  }
}

main().catch((err) => {
  console.error("[smart_fetch] Error:", err.message || err);
  process.exit(1);
});
