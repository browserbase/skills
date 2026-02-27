#!/usr/bin/env node

const DEFAULT_API_BASE = process.env.BROWSERBASE_API_BASE_URL || "https://api.browserbase.com";

function usage() {
  console.error(
    [
      "Usage:",
      "  node scripts/browserbase-session.mjs create [options]",
      "  node scripts/browserbase-session.mjs close --session-id <id> [options]",
      "",
      "Create options:",
      "  --api-key <key>                 Browserbase API key (or BROWSERBASE_API_KEY)",
      "  --project-id <id>               Browserbase project ID (or BROWSERBASE_PROJECT_ID)",
      "  --proxies <true|false>          Enable proxies",
      "  --advanced-stealth <true|false> Enable advanced stealth",
      "  --keep-alive <true|false>       Keep session alive on Browserbase",
      "  --format <json|shell|url>       Output format (default: json)",
      "  --api-base-url <url>            API base URL (default: https://api.browserbase.com)",
      "",
      "Close options:",
      "  --session-id <id>               Session ID to close (required)",
      "  --project-id <id>               Browserbase project ID (optional, or BROWSERBASE_PROJECT_ID)",
      "  --api-key <key>                 Browserbase API key (or BROWSERBASE_API_KEY)",
      "  --api-base-url <url>            API base URL",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      out._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function parseBool(value, name) {
  if (value === undefined) return undefined;
  if (value === true || value === false) return value;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`Invalid boolean for --${name}: ${value}`);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

async function createSession(args) {
  const apiKey = args["api-key"] || process.env.BROWSERBASE_API_KEY;
  const projectId = args["project-id"] || process.env.BROWSERBASE_PROJECT_ID;
  const format = String(args.format || "json").toLowerCase();
  const apiBaseUrl = String(args["api-base-url"] || DEFAULT_API_BASE).replace(/\/$/, "");

  if (!apiKey) throw new Error("Missing API key. Set --api-key or BROWSERBASE_API_KEY.");
  if (!projectId) throw new Error("Missing project ID. Set --project-id or BROWSERBASE_PROJECT_ID.");
  if (!["json", "shell", "url"].includes(format)) {
    throw new Error(`Invalid --format: ${format}`);
  }

  const proxies = parseBool(args.proxies, "proxies");
  const advancedStealth = parseBool(args["advanced-stealth"], "advanced-stealth");
  const keepAlive = parseBool(args["keep-alive"], "keep-alive");

  const payload = { projectId };
  if (proxies !== undefined) payload.proxies = proxies;
  if (keepAlive !== undefined) payload.keepAlive = keepAlive;
  if (advancedStealth !== undefined) {
    payload.browserSettings = { advancedStealth };
  }

  const response = await fetch(`${apiBaseUrl}/v1/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-BB-API-Key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create session (${response.status}): ${text || response.statusText}`);
  }

  const data = await response.json();
  const sessionId = data.id;
  const connectUrl = data.connectUrl;

  if (!sessionId || !connectUrl) {
    throw new Error("Browserbase response missing id or connectUrl.");
  }

  const output = {
    sessionId,
    connectUrl,
    debuggerUrl: `https://www.browserbase.com/sessions/${sessionId}`,
  };

  if (format === "url") {
    console.log(output.connectUrl);
    return;
  }

  if (format === "shell") {
    console.log(`export BROWSERBASE_SESSION_ID=${shellQuote(output.sessionId)}`);
    console.log(`export BROWSERBASE_CDP_URL=${shellQuote(output.connectUrl)}`);
    console.log(`export BROWSERBASE_DEBUGGER_URL=${shellQuote(output.debuggerUrl)}`);
    return;
  }

  console.log(JSON.stringify(output, null, 2));
}

async function closeSession(args) {
  const apiKey = args["api-key"] || process.env.BROWSERBASE_API_KEY;
  const sessionId = args["session-id"] || args.sessionId;
  const projectId = args["project-id"] || process.env.BROWSERBASE_PROJECT_ID;
  const apiBaseUrl = String(args["api-base-url"] || DEFAULT_API_BASE).replace(/\/$/, "");

  if (!apiKey) throw new Error("Missing API key. Set --api-key or BROWSERBASE_API_KEY.");
  if (!sessionId) throw new Error("Missing session ID. Set --session-id <id>.");

  // Current Browserbase API supports session release via POST /v1/sessions/{id}.
  const releasePayload = { status: "REQUEST_RELEASE" };
  if (projectId) releasePayload.projectId = projectId;

  let response = await fetch(`${apiBaseUrl}/v1/sessions/${encodeURIComponent(sessionId)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-BB-API-Key": apiKey,
    },
    body: JSON.stringify(releasePayload),
  });

  // Backward-compat fallback if the API still expects DELETE.
  if (!response.ok && [404, 405].includes(response.status)) {
    response = await fetch(`${apiBaseUrl}/v1/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
      headers: {
        "X-BB-API-Key": apiKey,
      },
    });
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to close session (${response.status}): ${text || response.statusText}`);
  }

  const data = await response.json().catch(() => ({}));
  console.log(
    JSON.stringify(
      {
        closed: true,
        sessionId,
        status: data?.status ?? "REQUESTED",
      },
      null,
      2,
    ),
  );
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    usage();
    process.exit(argv.length === 0 ? 1 : 0);
  }

  const [command, ...rest] = argv;
  const args = parseArgs(rest);

  if (command === "create") {
    await createSession(args);
    return;
  }
  if (command === "close") {
    await closeSession(args);
    return;
  }

  usage();
  process.exit(1);
}

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exit(1);
});
