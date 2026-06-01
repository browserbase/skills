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
 * Required env: BROWSERBASE_API_KEY (scoped to a single project; no project ID needed)
 *
 * Output (stdout, single JSON line then "---READY---" sentinel):
 *   {
 *     "tunnelUrl":   "https://random.trycloudflare.com",
 *     "authUrl":     "https://random.trycloudflare.com/?__tunnel=uuid",
 *     "secret":      "uuid",
 *     "headerName":  "X-Tunnel-Auth",
 *     "sessionId":   "...",
 *     "connectUrl":  "wss://connect.browserbase.com/...",
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

// Each API key is scoped to exactly one project, so we never ask the user for a
// project ID — we omit projectId on session create (the API derives it from the
// key) and read session.projectId back from the response for the later release.
let projectId = null;

const SECRET = randomUUID();
const HEADER = "X-Tunnel-Auth";
const COOKIE = "bb_tunnel_auth";
const QUERY = "__tunnel";

// A request is authed if it carries the secret as any of:
//   (a) the X-Tunnel-Auth header — used by Playwright/Stagehand via CDP
//   (b) the bb_tunnel_auth cookie — set by us on the first authed response, then
//       replayed by the browser on every same-origin request (incl. subresources)
//   (c) the ?__tunnel=<secret> query param — the entry point for browser drivers
//       (e.g. `browse open <authUrl>`): the first navigation carries it, we set
//       the cookie, and everything after rides the cookie
//   (d) HTTP Basic auth whose password == SECRET — handy for curl debugging
// Returns how it authed so we can strip exactly the credential we consumed.
// NOTE: credentials embedded in the URL (https://user:pass@host) are NOT used —
// Chrome strips them on CDP navigation, so they never reach us. Hence the cookie.
function authVia(req) {
  if (req.headers[HEADER.toLowerCase()] === SECRET) return "header";

  const cookie = req.headers["cookie"];
  if (cookie) {
    const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
    if (m && m[1] === SECRET) return "cookie";
  }

  try {
    if (new URL(req.url, "http://x").searchParams.get(QUERY) === SECRET) return "query";
  } catch {}

  const auth = req.headers["authorization"];
  if (auth && auth.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
      if (decoded.slice(decoded.indexOf(":") + 1) === SECRET) return "basic";
    } catch {}
  }
  return null;
}

// Strip whichever credential(s) we consumed and our query param, so the dev
// server never sees the tunnel secret. Returns the rewritten upstream path.
function sanitize(req, via) {
  const headers = { ...req.headers };
  delete headers[HEADER.toLowerCase()];
  if (via === "basic") delete headers["authorization"];
  if (headers["cookie"]) {
    const kept = headers["cookie"]
      .split(/;\s*/)
      .filter((c) => !c.startsWith(`${COOKIE}=`))
      .join("; ");
    if (kept) headers["cookie"] = kept;
    else delete headers["cookie"];
  }
  headers.host = `${host}:${port}`;

  let path = req.url;
  try {
    const u = new URL(req.url, "http://x");
    if (u.searchParams.has(QUERY)) {
      u.searchParams.delete(QUERY);
      path = u.pathname + u.search + u.hash;
    }
  } catch {}
  return { headers, path };
}

// Append our auth cookie to an upstream response's headers (preserving any
// Set-Cookie the app already sent), so the browser carries the secret onward.
function withAuthCookie(upHeaders) {
  const out = { ...upHeaders };
  const existing = out["set-cookie"] || [];
  out["set-cookie"] = [
    ...(Array.isArray(existing) ? existing : [existing]),
    `${COOKIE}=${SECRET}; Path=/; HttpOnly; Secure; SameSite=Lax`,
  ];
  return out;
}

// ─── Auth-gated local HTTP proxy ─────────────────────────────────────────────
// Sits between cloudflared edge and the user's localhost:<port>.
// Requires the secret (cookie, ?__tunnel query, X-Tunnel-Auth header, or Basic
// password). Forwards request+body, streams response, and plants the auth cookie.
const proxy = http.createServer((req, res) => {
  const via = authVia(req);
  if (!via) {
    res.writeHead(401, { "content-type": "text/plain" });
    res.end("unauthorized: missing or invalid tunnel auth\n");
    return;
  }
  const { headers, path } = sanitize(req, via);

  const upstream = http.request(
    { host, port, method: req.method, path, headers },
    (upRes) => {
      res.writeHead(upRes.statusCode || 502, withAuthCookie(upRes.headers));
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
  const via = authVia(req);
  if (!via) {
    clientSocket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    clientSocket.destroy();
    return;
  }
  const { headers, path } = sanitize(req, via);

  const upstream = http.request({ host, port, method: req.method, path, headers });
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
      cleanup();
      resolve(m[0]);
    }
  };
  const onExit = (code) =>
    reject(new Error(`cloudflared exited (code ${code}) before URL was found`));
  const timer = setTimeout(() => {
    cleanup();
    reject(new Error("timed out waiting for cloudflared URL"));
  }, 30_000);
  function cleanup() {
    clearTimeout(timer);
    cf.stdout.off("data", onChunk);
    cf.stderr.off("data", onChunk);
    cf.off("exit", onExit);
  }
  cf.stdout.on("data", onChunk);
  cf.stderr.on("data", onChunk);
  cf.on("exit", onExit);
});
console.error(`[cloudflared] tunnel URL: ${tunnelUrl}`);

// ─── Cleanup on exit ─────────────────────────────────────────────────────────
// Defined and wired up *before* session creation so that a cloudflared crash or
// a Ctrl-C during that window still tears everything down. `session` may still
// be null at that point — the release call is guarded accordingly.
let session = null;
let shuttingDown = false;
async function shutdown(signal, code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error(`\n[shutdown] received ${signal}, cleaning up...`);

  // Local cleanup first — these are instant and must happen even if the BB API
  // is slow or unreachable, so nothing lingers after Ctrl-C.
  cf.kill("SIGINT");
  proxy.close();

  // Hard safety net: never let a hanging release request keep us alive.
  const hardExit = setTimeout(() => process.exit(code), 3000);
  hardExit.unref?.();

  // Release the BB session if we got far enough to create one. Time-boxed so a
  // slow API can't block the (already-done) local cleanup.
  if (session?.id) {
    try {
      await fetch(`${BB_API_BASE}/v1/sessions/${session.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-bb-api-key": BB_API_KEY },
        body: JSON.stringify({ status: "REQUEST_RELEASE", projectId }),
        signal: AbortSignal.timeout(2500),
      });
      console.error("[shutdown] BB session released");
    } catch (e) {
      console.error("[shutdown] release error:", e.message);
    }
  }
  clearTimeout(hardExit);
  process.exit(code);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
// A cloudflared exit means the tunnel is dead — tear everything down. Registered
// here (not after session creation) so an exit during the create window, when
// the tunnel-URL promise's own exit listener has already been removed, still
// triggers cleanup instead of silently emitting a dead tunnel URL.
cf.on("exit", (code) => {
  console.error(`[cloudflared] exited with code ${code}`);
  if (!shuttingDown) shutdown("cloudflared-exit");
});

// ─── Create Browserbase session ──────────────────────────────────────────────
// No projectId sent — the API key is scoped to one project, so the API derives
// it from the key. We read session.projectId back for the later release call.
console.error(`[bb] creating session on ${BB_API_BASE}...`);
const bbRes = await fetch(`${BB_API_BASE}/v1/sessions`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-bb-api-key": BB_API_KEY },
  body: JSON.stringify({}),
});
if (!bbRes.ok) {
  const text = await bbRes.text();
  console.error(`[bb] failed to create session: ${bbRes.status} ${text}`);
  await shutdown("create-failed", 1);
}
session = await bbRes.json();
projectId = session.projectId || null;
console.error(`[bb] session: ${session.id} (project ${projectId})`);

// ─── Emit connection JSON on stdout ─────────────────────────────────────────
// authUrl carries the secret as a query param. The first navigation authenticates
// on it; the proxy then plants the bb_tunnel_auth cookie, so every subsequent
// request (subresources, XHR/fetch) authenticates via the cookie — no header
// injection, and it survives Chrome stripping URL credentials.
const authUrl = `${tunnelUrl}/?${QUERY}=${SECRET}`;
const output = {
  tunnelUrl,
  authUrl,
  secret: SECRET,
  headerName: HEADER,
  sessionId: session.id,
  connectUrl: session.connectUrl,
  dashboardUrl: `${BB_DASH_BASE}/sessions/${session.id}`,
  localPort: port,
  proxyPort,
};
process.stdout.write(JSON.stringify(output) + "\n");
process.stdout.write("---READY---\n");

// The process now stays alive on the open proxy/cloudflared handles until a
// signal (or a cloudflared exit) triggers shutdown(), wired up above.
