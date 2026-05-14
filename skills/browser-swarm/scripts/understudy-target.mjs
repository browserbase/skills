#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function usage() {
  return `Usage:
  understudy-target.mjs --cdp-url <ws-url> list
  understudy-target.mjs --cdp-url <ws-url> newpage [url]
  understudy-target.mjs --cdp-url <ws-url> --target-id <id> title
  understudy-target.mjs --cdp-url <ws-url> --target-id <id> text [selector]
  understudy-target.mjs --cdp-url <ws-url> --target-id <id> click <selector>
  understudy-target.mjs --cdp-url <ws-url> --target-id <id> fill <selector> <value>
  understudy-target.mjs --cdp-url <ws-url> --target-id <id> press <key>
  understudy-target.mjs --cdp-url <ws-url> --target-id <id> goto <url>
  understudy-target.mjs --cdp-url <ws-url> --target-id <id> screenshot <path>

Options:
  --cdp-url <ws-url>          Browser-level CDP websocket. Also reads BROWSER_SWARM_CDP_URL or CDP_URL.
  --target-id <id>            Chrome target id / Understudy page id to own.
  --url-includes <text>       Select the first page whose URL includes text.
  --title-includes <text>     Select the first page whose title includes text.
  --stagehand-import <spec>   Import specifier or path for @browserbasehq/stagehand.
  --full-page                 Capture a full-page screenshot.
`;
}

function parseArgs(argv) {
  const opts = {
    cdpUrl: process.env.BROWSER_SWARM_CDP_URL || process.env.CDP_URL,
    stagehandImport: "@browserbasehq/stagehand",
    fullPage: false,
  };
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (arg === "--full-page") {
      opts.fullPage = true;
    } else if (arg === "--cdp-url") {
      opts.cdpUrl = argv[++i];
    } else if (arg === "--target-id" || arg === "--page-id") {
      opts.targetId = argv[++i];
    } else if (arg === "--url-includes") {
      opts.urlIncludes = argv[++i];
    } else if (arg === "--title-includes") {
      opts.titleIncludes = argv[++i];
    } else if (arg === "--stagehand-import") {
      opts.stagehandImport = argv[++i];
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  opts.command = positional[0] || "list";
  opts.args = positional.slice(1);
  return opts;
}

async function importStagehand(spec) {
  if (spec.startsWith("file:")) {
    return import(spec);
  }
  if (spec.startsWith("/") || spec.startsWith(".")) {
    return import(pathToFileURL(path.resolve(spec)).href);
  }
  return import(spec);
}

async function pageInfo(page, index) {
  let title = "";
  try {
    title = await page.title();
  } catch {
    title = "";
  }
  return {
    index,
    targetId: page.targetId(),
    url: page.url(),
    title,
  };
}

async function selectPage(context, opts) {
  const pages = context.pages();

  if (opts.targetId) {
    const page = pages.find((candidate) => candidate.targetId() === opts.targetId);
    if (!page) {
      throw new Error(`No page found for targetId=${opts.targetId}`);
    }
    return page;
  }

  if (opts.urlIncludes) {
    const page = pages.find((candidate) => candidate.url().includes(opts.urlIncludes));
    if (!page) {
      throw new Error(`No page URL includes ${JSON.stringify(opts.urlIncludes)}`);
    }
    return page;
  }

  if (opts.titleIncludes) {
    for (const page of pages) {
      const info = await pageInfo(page);
      if (info.title.includes(opts.titleIncludes)) return page;
    }
    throw new Error(`No page title includes ${JSON.stringify(opts.titleIncludes)}`);
  }

  throw new Error("Pass --target-id, --url-includes, or --title-includes for this command");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(usage());
    return;
  }
  if (!opts.cdpUrl) {
    throw new Error("Missing --cdp-url, BROWSER_SWARM_CDP_URL, or CDP_URL");
  }

  const { Stagehand } = await importStagehand(opts.stagehandImport);
  const stagehand = new Stagehand({
    env: "LOCAL",
    localBrowserLaunchOptions: {
      cdpUrl: opts.cdpUrl,
      connectTimeoutMs: 10000,
    },
    disablePino: true,
    verbose: 0,
  });

  await stagehand.init();
  if (opts.command === "list") {
    const pages = await Promise.all(stagehand.context.pages().map(pageInfo));
    console.log(JSON.stringify({ ok: true, pages }, null, 2));
    return;
  }

  if (opts.command === "newpage") {
    const page = await stagehand.context.newPage(opts.args[0] || "about:blank");
    console.log(
      JSON.stringify(
        {
          ok: true,
          command: opts.command,
          result: await pageInfo(page),
        },
        null,
        2,
      ),
    );
    return;
  }

  const page = await selectPage(stagehand.context, opts);
  let result;

  switch (opts.command) {
    case "title":
      result = await pageInfo(page);
      break;
    case "url":
      result = { targetId: page.targetId(), url: page.url() };
      break;
    case "goto": {
      const [url] = opts.args;
      if (!url) throw new Error("goto requires <url>");
      await page.goto(url, { waitUntil: "domcontentloaded", timeoutMs: 30000 });
      result = await pageInfo(page);
      break;
    }
    case "click": {
      const [selector] = opts.args;
      if (!selector) throw new Error("click requires <selector>");
      await page.deepLocator(selector).click();
      result = { clicked: true, selector };
      break;
    }
    case "fill": {
      const [selector, ...valueParts] = opts.args;
      if (!selector || valueParts.length === 0) {
        throw new Error("fill requires <selector> <value>");
      }
      const value = valueParts.join(" ");
      await page.deepLocator(selector).fill(value);
      result = { filled: true, selector, value };
      break;
    }
    case "type": {
      const [selector, ...textParts] = opts.args;
      if (!selector || textParts.length === 0) {
        throw new Error("type requires <selector> <text>");
      }
      const text = textParts.join(" ");
      await page.deepLocator(selector).type(text);
      result = { typed: true, selector, text };
      break;
    }
    case "press": {
      const [key] = opts.args;
      if (!key) throw new Error("press requires <key>");
      await page.keyPress(key);
      result = { pressed: key };
      break;
    }
    case "text": {
      const selector = opts.args[0] || "body";
      const text = await page.deepLocator(selector).innerText();
      result = { selector, text };
      break;
    }
    case "html": {
      const selector = opts.args[0] || "body";
      const html = await page.deepLocator(selector).innerHtml();
      result = { selector, html };
      break;
    }
    case "screenshot": {
      const [outPath] = opts.args;
      if (!outPath) throw new Error("screenshot requires <path>");
      const buffer = await page.screenshot({ fullPage: opts.fullPage });
      await writeFile(outPath, buffer);
      result = { screenshot: outPath, fullPage: opts.fullPage };
      break;
    }
    default:
      throw new Error(`Unknown command: ${opts.command}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        command: opts.command,
        targetId: page.targetId(),
        url: page.url(),
        result,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
