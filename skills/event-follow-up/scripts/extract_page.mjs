#!/usr/bin/env node
// Extract structured page content for company research.
// Fetches via `bb fetch` (raw HTML to a temp file), pulls title + meta tags
// + visible body text, and auto-falls back to `bb browse` when content is thin.
//
// Usage: node extract_page.mjs <url> [--max-chars N]
// Output (stdout): structured block consumable by a research subagent.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const THIN_CONTENT_THRESHOLD = 200; // body chars under this → JS-rendered, fall back

function parseArgs(argv) {
  const args = { url: null, maxChars: 3000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--max-chars") args.maxChars = parseInt(argv[++i], 10);
    else if (!args.url) args.url = a;
  }
  if (!args.url) {
    console.error("Usage: extract_page.mjs <url> [--max-chars N]");
    process.exit(2);
  }
  return args;
}

function bbFetch(url, outFile) {
  execFileSync("bb", ["fetch", "--allow-redirects", url, "--output", outFile], {
    stdio: ["ignore", "ignore", "ignore"],
  });
}

function bbBrowseMarkdown(url) {
  try {
    execFileSync("bb", ["browse", "--headless", "open", url], {
      stdio: ["ignore", "ignore", "ignore"],
      timeout: 90000,
    });
    const out = execFileSync("bb", ["browse", "--headless", "get", "markdown"], {
      encoding: "utf8",
      timeout: 90000,
      maxBuffer: 50 * 1024 * 1024,
    });
    // bb browse prints banners (e.g. "Update available...") before the JSON blob.
    // Find the first '{' and try to JSON.parse from there.
    const start = out.indexOf("{");
    if (start < 0) return "";
    try {
      const parsed = JSON.parse(out.slice(start));
      if (parsed && typeof parsed.markdown === "string") return parsed.markdown;
    } catch {
      // Fallback: extract "markdown": "..." with a lenient regex that handles
      // escaped quotes and newlines.
      const m = out.slice(start).match(/"markdown"\s*:\s*"((?:\\.|[^"\\])*)"/s);
      if (m) {
        try { return JSON.parse(`"${m[1]}"`); } catch { return m[1]; }
      }
    }
    return "";
  } catch (err) {
    return "";
  }
}

function extractMeta(html, name, attr = "name") {
  const re = new RegExp(
    `<meta\\s+${attr}=["']${name}["']\\s+content=["']([^"']*)["']`,
    "i"
  );
  const re2 = new RegExp(
    `<meta\\s+content=["']([^"']*)["']\\s+${attr}=["']${name}["']`,
    "i"
  );
  const m = html.match(re) || html.match(re2);
  return m ? m[1].trim() : "";
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1].trim() : "";
}

function extractVisibleText(html, maxChars) {
  // Multi-line aware script/style removal.
  let s = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#[0-9]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s.slice(0, maxChars);
}

function extractHeadings(html, limit = 10) {
  const re = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html)) && out.length < limit) {
    const text = m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (text) out.push(text);
  }
  return out;
}

function main() {
  const { url, maxChars } = parseArgs(process.argv.slice(2));
  const dir = mkdtempSync(join(tmpdir(), "extract_page_"));
  const htmlFile = join(dir, "page.html");

  let html = "";
  let fetchOk = false;
  try {
    bbFetch(url, htmlFile);
    html = readFileSync(htmlFile, "utf8");
    fetchOk = true;
  } catch (err) {
    console.error(`[extract_page] bb fetch failed: ${err.message}`);
  }

  const title = extractTitle(html);
  const metaDesc = extractMeta(html, "description");
  const ogTitle = extractMeta(html, "og:title", "property");
  const ogDesc = extractMeta(html, "og:description", "property");
  const headings = extractHeadings(html);
  let body = extractVisibleText(html, maxChars);

  // Thin content → JS-rendered SPA → fall back to bb browse.
  let fallbackUsed = false;
  if (body.length < THIN_CONTENT_THRESHOLD) {
    const md = bbBrowseMarkdown(url);
    if (md && md.length > body.length) {
      body = md.replace(/\s+/g, " ").slice(0, maxChars);
      fallbackUsed = true;
    }
  }

  rmSync(dir, { recursive: true, force: true });

  // Structured output for subagent to read.
  const lines = [
    `URL: ${url}`,
    `FETCH_OK: ${fetchOk}`,
    `FALLBACK_TO_BROWSE: ${fallbackUsed}`,
    `TITLE: ${title}`,
    `META_DESCRIPTION: ${metaDesc}`,
    `OG_TITLE: ${ogTitle}`,
    `OG_DESCRIPTION: ${ogDesc}`,
    `HEADINGS: ${headings.join(" | ")}`,
    `BODY_CHARS: ${body.length}`,
    `BODY:`,
    body,
  ];
  process.stdout.write(lines.join("\n") + "\n");
}

main();
