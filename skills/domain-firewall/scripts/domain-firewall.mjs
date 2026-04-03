#!/usr/bin/env node

/**
 * domain-firewall.mjs — Protect a Browserbase session with domain policies
 *
 * Connects to a live Browserbase session via CDP WebSocket and intercepts
 * all navigations, enforcing allowlist/denylist policies at the protocol level.
 *
 * Usage:
 *   node domain-firewall.mjs --session-id <id> --allowlist "example.com,github.com"
 *   node domain-firewall.mjs --session-id <id> --denylist "evil.com" --default allow
 *
 * Environment:
 *   BROWSERBASE_API_KEY    Required for session debug URL lookup
 */

import { execSync } from "node:child_process";
import WebSocket from "ws";

// =============================================================================
// CLI argument parsing
// =============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    sessionId: null,
    cdpUrl: null,
    allowlist: [],
    denylist: [],
    defaultVerdict: "deny",
    quiet: false,
    json: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--session-id":
        opts.sessionId = args[++i];
        break;
      case "--cdp-url":
        opts.cdpUrl = args[++i];
        break;
      case "--allowlist":
        opts.allowlist = args[++i].split(",").map((d) => normalizeDomain(d.trim()));
        break;
      case "--denylist":
        opts.denylist = args[++i].split(",").map((d) => normalizeDomain(d.trim()));
        break;
      case "--default":
        opts.defaultVerdict = args[++i];
        break;
      case "--quiet":
        opts.quiet = true;
        break;
      case "--json":
        opts.json = true;
        break;
      case "--help":
      case "-h":
        console.log(`
domain-firewall — Protect a browser session with domain policies

Usage:
  node domain-firewall.mjs --session-id <id> [options]
  node domain-firewall.mjs --cdp-url <ws://...> [options]

Options:
  --session-id <id>      Browserbase session ID
  --cdp-url <url>        Direct CDP WebSocket URL (for local Chrome)
  --allowlist <domains>  Comma-separated allowed domains
  --denylist <domains>   Comma-separated denied domains
  --default <verdict>    Default verdict: allow or deny (default: deny)
  --quiet                Suppress per-request logging
  --json                 Log events as JSON lines
  --help                 Show this help

Environment:
  BROWSERBASE_API_KEY    Required when using --session-id
`);
        process.exit(0);
    }
  }

  if (!opts.sessionId && !opts.cdpUrl) {
    console.error("[firewall] Error: --session-id or --cdp-url is required");
    process.exit(1);
  }

  return opts;
}

// =============================================================================
// Domain helpers
// =============================================================================

function normalizeDomain(hostname) {
  return hostname.replace(/^www\./, "").toLowerCase();
}

function ts() {
  return new Date().toISOString().substring(11, 19);
}

// =============================================================================
// Policy evaluation
// =============================================================================

function evaluate(domain, opts) {
  // Denylist takes priority
  if (opts.denylist.length > 0 && opts.denylist.includes(domain)) {
    return { action: "BLOCKED", policy: "denylist" };
  }

  // If allowlist is specified, only listed domains pass
  if (opts.allowlist.length > 0) {
    if (opts.allowlist.includes(domain)) {
      return { action: "ALLOWED", policy: "allowlist" };
    }
    // Not on allowlist → use default
    return {
      action: opts.defaultVerdict === "allow" ? "ALLOWED" : "BLOCKED",
      policy: "default",
    };
  }

  // No allowlist set → use default verdict
  return {
    action: opts.defaultVerdict === "allow" ? "ALLOWED" : "BLOCKED",
    policy: "default",
  };
}

// =============================================================================
// CDP WebSocket URL resolution
// =============================================================================

function getCDPUrl(sessionId) {
  try {
    const raw = execSync(`bb sessions debug ${sessionId}`, {
      encoding: "utf-8",
      timeout: 15000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const data = JSON.parse(raw.trim());

    // Prefer page-level target (required for Fetch interception)
    if (data.pages && data.pages[0]?.debuggerUrl) {
      const debugUrl = data.pages[0].debuggerUrl;
      // Extract wss:// URL from the inspector URL query param
      const match = debugUrl.match(/wss=([^&?]+)/);
      if (match) {
        return "wss://" + match[1];
      }
    }

    // Fallback to browser-level target
    if (data.wsUrl) return data.wsUrl;

    throw new Error("No CDP URL found in debug response");
  } catch (e) {
    console.error(`[firewall] Failed to get CDP URL for session ${sessionId}`);
    console.error(`[firewall] ${e.message}`);
    console.error("[firewall] Make sure the session is RUNNING and bb CLI is installed.");
    process.exit(1);
  }
}

// =============================================================================
// CDP WebSocket client
// =============================================================================

function connectCDP(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

function createCDPClient(ws) {
  const client = {
    _nextId: 1,
    _pending: new Map(),
    send(method, params = {}) {
      const id = client._nextId++;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve) => {
        client._pending.set(id, resolve);
      });
    },
  };

  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id && client._pending.has(msg.id)) {
      client._pending.get(msg.id)(msg.result || msg.error);
      client._pending.delete(msg.id);
    }
  });

  return client;
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const opts = parseArgs();

  // 1. Resolve CDP URL
  let wsUrl;
  if (opts.cdpUrl) {
    console.error(`[firewall] Connecting to ${opts.cdpUrl}...`);
    wsUrl = opts.cdpUrl;
  } else {
    if (!process.env.BROWSERBASE_API_KEY) {
      console.error("[firewall] Error: BROWSERBASE_API_KEY not set.");
      process.exit(1);
    }
    console.error(`[firewall] Connecting to session ${opts.sessionId}...`);
    wsUrl = getCDPUrl(opts.sessionId);
  }

  // 2. Connect via WebSocket
  const ws = await connectCDP(wsUrl);
  const cdp = createCDPClient(ws);
  console.error(`[firewall] Connected.`);

  // If connected to a browser-level target, attach to the first page
  // This avoids conflicts when another client (browse CLI) already holds the page target
  let cdpSessionId = null;
  if (wsUrl.includes("/devtools/browser/")) {
    const targets = await cdp.send("Target.getTargets");
    const page = targets?.targetInfos?.find((t) => t.type === "page");
    if (page) {
      const attached = await cdp.send("Target.attachToTarget", {
        targetId: page.targetId,
        flatten: true,
      });
      cdpSessionId = attached.sessionId;
      console.error(`[firewall] Attached to page target.`);
    }
  }

  // Wrap cdp.send to include sessionId when attached via browser target
  const sendCDP = (method, params = {}) => {
    if (cdpSessionId) {
      const id = cdp._nextId++;
      ws.send(JSON.stringify({ id, method, params, sessionId: cdpSessionId }));
      return new Promise((resolve) => cdp._pending.set(id, resolve));
    }
    return cdp.send(method, params);
  };

  // Log policy config
  if (opts.allowlist.length > 0) {
    console.error(`[firewall] Allowlist: ${opts.allowlist.join(", ")}`);
  }
  if (opts.denylist.length > 0) {
    console.error(`[firewall] Denylist: ${opts.denylist.join(", ")}`);
  }
  console.error(`[firewall] Default: ${opts.defaultVerdict}`);
  console.error(`[firewall] Listening for navigations...\n`);

  // 3. Enable Fetch interception
  await sendCDP("Fetch.enable", { patterns: [{ urlPattern: "*" }] });

  // 4. Handle intercepted requests
  ws.on("message", async (raw) => {
    const msg = JSON.parse(raw.toString());
    // Match events from our attached session or direct page connection
    if (msg.method !== "Fetch.requestPaused") return;
    if (cdpSessionId && msg.sessionId !== cdpSessionId) return;

    const params = msg.params;
    const url = params.request?.url || "";
    const resourceType = params.resourceType || "";

    // Pass through non-Document resources
    if (resourceType !== "Document" && resourceType !== "") {
      await sendCDP("Fetch.continueRequest", { requestId: params.requestId });
      return;
    }

    // Pass through internal URLs
    if (url.startsWith("chrome") || url.startsWith("about:") || url.startsWith("data:")) {
      await sendCDP("Fetch.continueRequest", { requestId: params.requestId });
      return;
    }

    // Extract domain
    let domain;
    try {
      domain = normalizeDomain(new URL(url).hostname);
    } catch {
      await sendCDP("Fetch.continueRequest", { requestId: params.requestId });
      return;
    }

    // Evaluate policy
    try {
      const result = evaluate(domain, opts);

      if (result.action === "ALLOWED") {
        await sendCDP("Fetch.continueRequest", { requestId: params.requestId });
      } else {
        await sendCDP("Fetch.failRequest", {
          requestId: params.requestId,
          errorReason: "BlockedByClient",
        });
      }

      // Log
      if (!opts.quiet) {
        if (opts.json) {
          console.log(
            JSON.stringify({
              time: ts(),
              domain,
              url: url.substring(0, 120),
              action: result.action,
              policy: result.policy,
            })
          );
        } else {
          const tag = result.action === "ALLOWED" ? "ALLOWED" : "BLOCKED";
          const pad = tag === "ALLOWED" ? " " : "";
          console.log(
            `[${ts()}] ${tag}${pad} ${domain.padEnd(30)} (${result.policy})`
          );
        }
      }
    } catch (err) {
      // Fail-closed: deny on error to avoid hanging the browser
      await sendCDP("Fetch.failRequest", {
        requestId: params.requestId,
        errorReason: "BlockedByClient",
      });
      if (!opts.quiet) {
        console.log(`[${ts()}] BLOCKED ${domain.padEnd(30)} (error: ${err.message})`);
      }
    }
  });

  // 5. Graceful shutdown
  const cleanup = async () => {
    console.error("\n[firewall] Shutting down...");
    try {
      await sendCDP("Fetch.disable");
    } catch {}
    ws.close();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  ws.on("close", () => {
    console.error("[firewall] Session ended.");
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(`[firewall] Fatal: ${err.message}`);
  process.exit(1);
});
