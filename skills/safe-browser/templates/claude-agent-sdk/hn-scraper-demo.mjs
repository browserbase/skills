import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { z } from "zod";
import {
  createSdkMcpServer,
  query,
  tool,
} from "@anthropic-ai/claude-agent-sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnvIfPresent(resolve(__dirname, ".env"));
if (process.env.HOME) {
  loadEnvIfPresent(resolve(process.env.HOME, "Developer/scratchpad/.env"));
}

const allowlist = new Set(["news.ycombinator.com"]);
const startUrl = "https://news.ycombinator.com/";
const artifactsDir = resolve(__dirname, "artifacts");
const auditLog = [];
const toolLog = [];
const cdpCommandLog = [];

let browser;
let page;
let cdp;
let lastAllowedUrl = startUrl;

function loadEnvIfPresent(path) {
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const [, key, value] = match;
      if (!process.env[key]) {
        process.env[key] = value.replace(/^['"]|['"]$/g, "");
      }
    }
  } catch {
    // Optional local env file.
  }
}

function normalizeHost(url) {
  const parsed = new URL(url);
  return parsed.hostname.toLowerCase().replace(/^www\./, "");
}

function isInternalUrl(url) {
  return (
    url.startsWith("about:") ||
    url.startsWith("chrome:") ||
    url.startsWith("devtools:") ||
    url.startsWith("data:")
  );
}

function toAbsoluteUrl(href) {
  if (!href) return null;
  try {
    return new URL(href, "https://news.ycombinator.com/").href;
  } catch {
    return null;
  }
}

function waitForAuditEntry(url, startIndex = 0, timeoutMs = 6000) {
  const existing = auditLog.slice(startIndex).find((entry) => entry.url === url);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const entry = auditLog.slice(startIndex).find((item) => item.url === url);
      if (entry) {
        clearInterval(timer);
        resolve(entry);
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`Timed out waiting for CDP Fetch interception of ${url}`));
      }
    }, 50);
  });
}

async function setupBrowser() {
  const headless = process.env.SAFE_BROWSER_HEADLESS !== "false";
  browser = await chromium.launch({ headless });
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  cdp = await page.context().newCDPSession(page);

  cdp.on("Fetch.requestPaused", async (params) => {
    const url = params.request?.url ?? "";
    const baseEntry = {
      time: new Date().toISOString(),
      requestId: params.requestId,
      url,
      resourceType: params.resourceType,
      cdpEvent: "Fetch.requestPaused",
    };

    try {
      if (isInternalUrl(url)) {
        await cdp.send("Fetch.continueRequest", { requestId: params.requestId });
        auditLog.push({
          ...baseEntry,
          host: null,
          verdict: "allowed",
          reason: "Internal browser URL",
          cdpDecision: "Fetch.continueRequest",
          networkContinued: true,
        });
        return;
      }

      const host = normalizeHost(url);
      if (allowlist.has(host)) {
        await cdp.send("Fetch.continueRequest", { requestId: params.requestId });
        auditLog.push({
          ...baseEntry,
          host,
          verdict: "allowed",
          reason: "Domain is in allowlist",
          cdpDecision: "Fetch.continueRequest",
          networkContinued: true,
        });
        return;
      }

      await cdp.send("Fetch.failRequest", {
        requestId: params.requestId,
        errorReason: "BlockedByClient",
      });
      auditLog.push({
        ...baseEntry,
        host,
        verdict: "blocked",
        reason: `Domain is not in allowlist: ${Array.from(allowlist).join(", ")}`,
        cdpDecision: "Fetch.failRequest",
        networkContinued: false,
      });
    } catch (error) {
      auditLog.push({
        ...baseEntry,
        host: null,
        verdict: "blocked",
        reason: `Firewall handler error: ${error.message}`,
        cdpDecision: "Fetch.failRequest",
        networkContinued: false,
      });

      try {
        await cdp.send("Fetch.failRequest", {
          requestId: params.requestId,
          errorReason: "BlockedByClient",
        });
      } catch {
        // The request may already be resolved.
      }
    }
  });

  cdpCommandLog.push({
    method: "Fetch.enable",
    params: { patterns: [{ urlPattern: "*" }] },
  });
  await cdp.send("Fetch.enable", {
    patterns: [{ urlPattern: "*" }],
  });
}

async function teardownBrowser() {
  if (browser) await browser.close();
}

async function navigateWithCdp(url) {
  const auditStart = auditLog.length;
  cdpCommandLog.push({ method: "Page.navigate", params: { url } });
  await cdp.send("Page.navigate", { url });
  const entry = await waitForAuditEntry(url, auditStart);

  if (entry.verdict === "allowed") {
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
    lastAllowedUrl = page.url();
  } else {
    const restoreAuditStart = auditLog.length;
    cdpCommandLog.push({
      method: "Page.navigate",
      params: { url: lastAllowedUrl },
      reason: "restore_after_block",
    });
    await cdp.send("Page.navigate", { url: lastAllowedUrl });
    await waitForAuditEntry(lastAllowedUrl, restoreAuditStart).catch(() => null);
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
  }

  return {
    action: "goto",
    url,
    host: entry.host,
    verdict: entry.verdict,
    reason: entry.reason,
    cdpMethod: "Page.navigate",
    cdpDecision: entry.cdpDecision,
    networkContinued: entry.networkContinued,
    currentUrl: page.url(),
    restoredTo: entry.verdict === "blocked" ? page.url() : null,
  };
}

async function extractFrontPage(limit = 10) {
  const stories = await page.$$eval("tr.athing", (rows, maxRows) => {
    return rows.slice(0, maxRows).map((row) => {
      const titleLink = row.querySelector(".titleline > a");
      const subtext = row.nextElementSibling?.querySelector(".subtext");
      const subtextLinks = Array.from(subtext?.querySelectorAll("a") ?? []);
      const commentsLink =
        subtextLinks.find((link) => /comments?/i.test(link.textContent ?? "")) ??
        subtextLinks.find((link) => link.getAttribute("href")?.startsWith("item?id="));

      return {
        id: row.getAttribute("id"),
        rank: row.querySelector(".rank")?.textContent?.trim() ?? null,
        title: titleLink?.textContent?.trim() ?? null,
        url: titleLink?.getAttribute("href") ?? null,
        site: row.querySelector(".sitestr")?.textContent?.trim() ?? null,
        score: subtext?.querySelector(".score")?.textContent?.trim() ?? null,
        user: subtext?.querySelector(".hnuser")?.textContent?.trim() ?? null,
        age: subtext?.querySelector(".age")?.textContent?.trim() ?? null,
        commentsUrl: commentsLink?.getAttribute("href") ?? null,
        commentsText: commentsLink?.textContent?.trim() ?? null,
      };
    });
  }, limit);

  const normalizedStories = stories.map((story) => {
    const url = toAbsoluteUrl(story.url);
    const commentsUrl = toAbsoluteUrl(story.commentsUrl);
    const host = url ? normalizeHost(url) : null;
    return {
      ...story,
      url,
      host,
      isExternal: Boolean(host && !allowlist.has(host)),
      commentsUrl,
    };
  });

  return {
    currentUrl: page.url(),
    storyCount: normalizedStories.length,
    stories: normalizedStories,
    firstInternalCommentsUrl:
      normalizedStories.find((story) => story.commentsUrl?.includes("news.ycombinator.com/item?id="))
        ?.commentsUrl ?? null,
    firstExternalUrl: normalizedStories.find((story) => story.isExternal)?.url ?? null,
  };
}

async function extractComments(limit = 5) {
  const comments = await page.$$eval(".athing.comtr", (rows, maxRows) => {
    return rows.slice(0, maxRows).map((row) => ({
      id: row.getAttribute("id"),
      user: row.querySelector(".hnuser")?.textContent?.trim() ?? null,
      age: row.querySelector(".age")?.textContent?.trim() ?? null,
      text: row.querySelector(".commtext")?.textContent?.replace(/\s+/g, " ").trim() ?? null,
    }));
  }, limit);

  return {
    currentUrl: page.url(),
    commentCount: comments.length,
    comments,
  };
}

const safeBrowserTool = tool(
  "safe_browser",
  "Only browser capability. It owns local Chromium/CDP and enforces the domain allowlist before requests reach the network.",
  {
    action: z.enum([
      "goto",
      "extract_front_page",
      "extract_comments",
      "current_url",
      "audit_log",
    ]),
    url: z.string().optional().describe("Absolute URL for goto."),
    limit: z.number().int().positive().max(30).optional().describe("Maximum items to extract."),
  },
  async ({ action, url, limit }) => {
    let result;

    if (action === "goto") {
      if (!url) {
        result = { action, verdict: "blocked", reason: "Missing url" };
      } else {
        result = await navigateWithCdp(url);
      }
    } else if (action === "extract_front_page") {
      result = await extractFrontPage(limit ?? 10);
    } else if (action === "extract_comments") {
      result = await extractComments(limit ?? 5);
    } else if (action === "current_url") {
      result = { currentUrl: page.url() };
    } else if (action === "audit_log") {
      result = { auditLog };
    } else {
      result = { action, verdict: "blocked", reason: "Unsupported action" };
    }

    toolLog.push({ action, input: { url, limit }, result });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
  {
    annotations: {
      title: "Safe Browser",
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    alwaysLoad: true,
  }
);

const safeBrowserServer = createSdkMcpServer({
  name: "safe_browser_policy",
  version: "0.1.0",
  tools: [safeBrowserTool],
  alwaysLoad: true,
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function writeArtifacts(resultText) {
  await mkdir(artifactsDir, { recursive: true });
  await writeFile(resolve(artifactsDir, "result.md"), resultText ?? "", "utf8");
  await writeFile(resolve(artifactsDir, "audit-log.json"), JSON.stringify(auditLog, null, 2), "utf8");
  await writeFile(resolve(artifactsDir, "tool-log.json"), JSON.stringify(toolLog, null, 2), "utf8");
  await writeFile(resolve(artifactsDir, "cdp-command-log.json"), JSON.stringify(cdpCommandLog, null, 2), "utf8");
  await page.screenshot({ path: resolve(artifactsDir, "final-page.png"), fullPage: true });
}

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY is missing. Put it in .env or export it.");
}

try {
  await setupBrowser();

  const messages = [];
  for await (const message of query({
    prompt: [
      "Use safe_browser to build a Hacker News scrape while staying on the main site.",
      `1. Go to ${startUrl}.`,
      "2. Extract the first 10 front-page stories.",
      "3. Visit the first internal Hacker News comments page from those stories.",
      "4. Extract the first 5 comments.",
      "5. Then deliberately attempt to visit the first external story URL from the front page.",
      "6. Report the story count, comment count, external URL attempted, and whether CDP blocked it.",
      "If there is no external story URL, attempt https://example.com/ as the blocked control.",
    ].join("\n"),
    options: {
      cwd: __dirname,
      env: {
        ...process.env,
        CLAUDE_AGENT_SDK_CLIENT_APP: "safe-browser-hn-demo/0.1.0",
      },
      systemPrompt: [
        "You are a constrained browser agent.",
        "You have exactly one browser capability: the safe_browser MCP tool.",
        "Use only safe_browser for browsing, extraction, and audit inspection.",
        "safe_browser enforces an allowlist with CDP Fetch interception.",
        "Do not claim a navigation succeeded unless safe_browser says verdict allowed.",
        "You must attempt the off-domain URL through safe_browser so the policy can prove it blocks.",
      ].join(" "),
      mcpServers: {
        safe_browser_policy: safeBrowserServer,
      },
      tools: [],
      allowedTools: ["mcp__safe_browser_policy__safe_browser"],
      permissionMode: "dontAsk",
      canUseTool: async (toolName, input) => {
        if (
          toolName === "safe_browser" ||
          toolName === "mcp__safe_browser_policy__safe_browser" ||
          toolName.endsWith("__safe_browser")
        ) {
          return { behavior: "allow", updatedInput: input };
        }

        return {
          behavior: "deny",
          message: `Only safe_browser is available in this constrained demo. Denied: ${toolName}`,
        };
      },
      maxTurns: 8,
      maxBudgetUsd: 0.75,
      persistSession: false,
      stderr: (data) => {
        const text = String(data);
        if (text.trim()) process.stderr.write(text);
      },
    },
  })) {
    messages.push(message);
  }

  const resultMessage = [...messages].reverse().find((message) => message.type === "result");
  const resultText = resultMessage?.result ?? "";
  await writeArtifacts(resultText);

  const allowedHnNavigation = auditLog.find(
    (entry) => entry.verdict === "allowed" && entry.host === "news.ycombinator.com"
  );
  const frontPageExtract = toolLog.find((entry) => entry.action === "extract_front_page")?.result;
  const commentsExtract = toolLog.find((entry) => entry.action === "extract_comments")?.result;
  const blockedExternal = auditLog.find(
    (entry) =>
      entry.verdict === "blocked" &&
      entry.cdpDecision === "Fetch.failRequest" &&
      entry.host !== "news.ycombinator.com"
  );
  const finalHost = normalizeHost(page.url());

  assert(allowedHnNavigation, "Expected an allowed HN navigation in the audit log.");
  assert(frontPageExtract?.storyCount > 0, "Expected at least one extracted HN story.");
  assert(commentsExtract?.commentCount >= 0, "Expected comments extraction to run.");
  assert(blockedExternal, "Expected one blocked off-domain request.");
  assert(finalHost === "news.ycombinator.com", `Expected final browser host to stay on HN, got ${finalHost}.`);

  console.log("PASS safe-browser Hacker News demo");
  console.log(`Stories extracted: ${frontPageExtract.storyCount}`);
  console.log(`Comments extracted: ${commentsExtract.commentCount}`);
  console.log(`Blocked URL: ${blockedExternal.url}`);
  console.log(`CDP decision: ${blockedExternal.cdpDecision}`);
  console.log(`Final browser URL: ${page.url()}`);
  console.log("Artifacts:");
  console.log(`- ${resolve(artifactsDir, "result.md")}`);
  console.log(`- ${resolve(artifactsDir, "audit-log.json")}`);
  console.log(`- ${resolve(artifactsDir, "tool-log.json")}`);
  console.log(`- ${resolve(artifactsDir, "cdp-command-log.json")}`);
  console.log(`- ${resolve(artifactsDir, "final-page.png")}`);
} finally {
  await teardownBrowser();
}
