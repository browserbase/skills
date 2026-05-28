#!/usr/bin/env node
/**
 * browser-tunnel launcher
 *
 * Creates a Browserbase cloud session that can reach a localhost port via an
 * auth-gated cloudflared quick tunnel. Outputs connection details as JSON,
 * stays alive until SIGINT, then cleans up.
 *
 * Usage:
 *   node launch.mjs --port 3000
 *   node launch.mjs --port 5173 --host 127.0.0.1 --env dev
 *
 * Required env: BROWSERBASE_API_KEY
 * Optional env: BROWSERBASE_PROJECT_ID (defaults to the first project on the account)
 *
 * Output (stdout, single JSON line then "---READY---" sentinel):
 *   {
 *     "tunnelUrl":   "https://random.trycloudflare.com",
 *     "secret":      "uuid",
 *     "headerName":  "X-Tunnel-Auth",
 *     "sessionId":   "...",
 *     "connectUrl":  "wss://connect.browserbase.com/...",
 *     "debugUrl":    "https://...",
 *     "dashboardUrl":"https://www.browserbase.com/sessions/..."
 *   }
 *   ---READY---
 *
 * The process keeps running. Send SIGINT (Ctrl-C) to stop everything.
 */

import http from "node:http";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

// ─── Args ────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { port: null, host: "127.0.0.1", env: "prod" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port") out.port = Number(argv[++i]);
    else if (a === "--host") out.host = argv[++i];
    else if (a === "--env") out.env = argv[++i];
    else if (a === "--help" || a === "-h") {
      console.error("Usage: launch.mjs --port <n> [--host 127.0.0.1] [--env prod|dev]");
      process.exit(0);
    }
  }
  return out;
}

const { port, host, env } = parseArgs(process.argv);
if (!port || Number.isNaN(port)) {
  console.error("ERROR: --port <n> is required");
  process.exit(2);
}

const BB_API_KEY = process.env.BROWSERBASE_API_KEY;
if (!BB_API_KEY) {
  console.error("ERROR: BROWSERBASE_API_KEY must be set");
  process.exit(2);
}

const BB_API_BASE =
  env === "dev" ? "https://api.dev.browserbase.com" : "https://api.browserbase.com";
const BB_DASH_BASE =
  env === "dev" ? "https://www.dev.browserbase.com" : "https://www.browserbase.com";

// Project ID is optional — if unset, use the first project on the account.
let BB_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID;
if (!BB_PROJECT_ID) {
  const projRes = await fetch(`${BB_API_BASE}/v1/projects`, {
    headers: { "x-bb-api-key": BB_API_KEY },
  });
  if (!projRes.ok) {
    console.error(`ERROR: could not list projects (${projRes.status} ${await projRes.text()})`);
    process.exit(1);
  }
  const projects = await projRes.json();
  BB_PROJECT_ID = Array.isArray(projects) ? projects[0]?.id : projects?.data?.[0]?.id;
  if (!BB_PROJECT_ID) {
    console.error("ERROR: no Browserbase projects found for this API key");
    process.exit(1);
  }
  console.error(`[bb] using project ${BB_PROJECT_ID} (set BROWSERBASE_PROJECT_ID to override)`);
}

const SECRET = randomUUID();
const HEADER = "X-Tunnel-Auth";

// ─── Auth-gated local HTTP proxy ─────────────────────────────────────────────
// Sits between cloudflared edge and the user's localhost:<port>.
// Requires header X-Tunnel-Auth == SECRET. Forwards request+body, streams response.
const proxy = http.createServer((req, res) => {
  if (req.headers[HEADER.toLowerCase()] !== SECRET) {
    res.writeHead(401, { "content-type": "text/plain" });
    res.end("unauthorized: missing or invalid tunnel auth header\n");
    return;
  }
  const headers = { ...req.headers };
  // strip the auth header before forwarding so the dev server never sees it
  delete headers[HEADER.toLowerCase()];
  // rewrite Host so the upstream sees what it expects
  headers.host = `${host}:${port}`;

  const upstream = http.request(
    { host, port, method: req.method, path: req.url, headers },
    (upRes) => {
      res.writeHead(upRes.statusCode || 502, upRes.headers);
      upRes.pipe(res);
    }
  );
  upstream.on("error", (err) => {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end(`upstream error: ${err.message}\n`);
  });
  req.pipe(upstream);
});

// WebSocket upgrade passthrough (auth-gated)
proxy.on("upgrade", (req, clientSocket, head) => {
  if (req.headers[HEADER.toLowerCase()] !== SECRET) {
    clientSocket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    clientSocket.destroy();
    return;
  }
  const headers = { ...req.headers };
  delete headers[HEADER.toLowerCase()];
  headers.host = `${host}:${port}`;

  const upstream = http.request({ host, port, method: req.method, path: req.url, headers });
  upstream.on("upgrade", (upRes, upstreamSocket, upHead) => {
    clientSocket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
        Object.entries(upRes.headers)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join("\r\n") +
        "\r\n\r\n"
    );
    // Forward any buffered bytes that arrived with the handshake, in both
    // directions, before wiring up the bidirectional pipe. `head` is the
    // client's trailing buffer (already consumed from clientSocket, so pipe
    // won't re-emit it); `upHead` is the upstream's.
    if (upHead?.length) clientSocket.write(upHead);
    if (head?.length) upstreamSocket.write(head);
    upstreamSocket.pipe(clientSocket).pipe(upstreamSocket);
  });
  upstream.on("error", () => clientSocket.destroy());
  upstream.end();
});

// listen on a random free port (0)
await new Promise((resolve, reject) => {
  proxy.listen(0, "127.0.0.1", resolve);
  proxy.on("error", reject);
});
const proxyPort = proxy.address().port;
console.error(`[proxy] auth-gated proxy listening on 127.0.0.1:${proxyPort} -> ${host}:${port}`);

// ─── cloudflared quick tunnel ────────────────────────────────────────────────
console.error(`[cloudflared] starting quick tunnel...`);
const cf = spawn(
  "cloudflared",
  ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${proxyPort}`],
  { stdio: ["ignore", "pipe", "pipe"] }
);

const tunnelUrl = await new Promise((resolve, reject) => {
  let buf = "";
  const onChunk = (chunk) => {
    buf += chunk.toString();
    const m = buf.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m) {
      cf.stdout.off("data", onChunk);
      cf.stderr.off("data", onChunk);
      resolve(m[0]);
    }
  };
  cf.stdout.on("data", onChunk);
  cf.stderr.on("data", onChunk);
  cf.on("exit", (code) => reject(new Error(`cloudflared exited (code ${code}) before URL was found`)));
  setTimeout(() => reject(new Error("timed out waiting for cloudflared URL")), 30_000);
});
console.error(`[cloudflared] tunnel URL: ${tunnelUrl}`);

// ─── Create Browserbase session ──────────────────────────────────────────────
console.error(`[bb] creating session on ${BB_API_BASE}...`);
const bbRes = await fetch(`${BB_API_BASE}/v1/sessions`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-bb-api-key": BB_API_KEY },
  body: JSON.stringify({ projectId: BB_PROJECT_ID }),
});
if (!bbRes.ok) {
  const text = await bbRes.text();
  console.error(`[bb] failed to create session: ${bbRes.status} ${text}`);
  cf.kill("SIGINT");
  proxy.close();
  process.exit(1);
}
const session = await bbRes.json();
console.error(`[bb] session: ${session.id}`);

// ─── Emit connection JSON on stdout ─────────────────────────────────────────
const output = {
  tunnelUrl,
  secret: SECRET,
  headerName: HEADER,
  sessionId: session.id,
  connectUrl: session.connectUrl,
  debugUrl: session.seleniumRemoteUrl || null,
  dashboardUrl: `${BB_DASH_BASE}/sessions/${session.id}`,
  localPort: port,
  proxyPort,
};
process.stdout.write(JSON.stringify(output) + "\n");
process.stdout.write("---READY---\n");

// ─── Cleanup on exit ─────────────────────────────────────────────────────────
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error(`\n[shutdown] received ${signal}, cleaning up...`);

  // Local cleanup first — these are instant and must happen even if the BB API
  // is slow or unreachable, so nothing lingers after Ctrl-C.
  cf.kill("SIGINT");
  proxy.close();

  // Hard safety net: never let a hanging release request keep us alive.
  const hardExit = setTimeout(() => process.exit(0), 3000);
  hardExit.unref?.();

  // Time-box the release so a slow API can't block the (already-done) cleanup.
  try {
    await fetch(`${BB_API_BASE}/v1/sessions/${session.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-bb-api-key": BB_API_KEY },
      body: JSON.stringify({ status: "REQUEST_RELEASE", projectId: BB_PROJECT_ID }),
      signal: AbortSignal.timeout(2500),
    });
    console.error("[shutdown] BB session released");
  } catch (e) {
    console.error("[shutdown] release error:", e.message);
  }
  clearTimeout(hardExit);
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
cf.on("exit", (code) => {
  console.error(`[cloudflared] exited with code ${code}`);
  if (!shuttingDown) shutdown("cloudflared-exit");
});
