#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  access,
  chmod,
  lstat,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SKILL_DIR = path.dirname(path.dirname(SCRIPT_PATH));
const HTML_PATH = path.join(SKILL_DIR, "assets", "live-view.html");
const JS_PATH = path.join(SKILL_DIR, "assets", "live-view.js");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SESSION_FILE_BYTES = 128;

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!["--session-id-file", "--ready-file", "--port"].includes(argument)) {
      throw new Error("Unknown argument.");
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error("Argument value is required.");
    values[argument.slice(2)] = value;
    index += 1;
  }
  return values;
}

function required(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} is required.`);
  return value;
}

async function validateParent(filePath, writable = false) {
  if (!path.isAbsolute(filePath) || /[\r\n]/u.test(filePath)) {
    throw new Error("File paths must be absolute and contain no control characters.");
  }
  const parent = path.dirname(filePath);
  const parentInfo = await lstat(parent);
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink()) {
    throw new Error("File parent must be a directory, not a symlink.");
  }
  await access(parent, writable ? fsConstants.W_OK : fsConstants.R_OK);
}

async function readPrivateFile(filePath, maxBytes) {
  let info;
  try {
    info = await lstat(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) return null;
  if (typeof process.getuid === "function" && info.uid !== process.getuid()) return null;
  if ((info.mode & 0o077) !== 0 || info.size > maxBytes) return null;
  return readFile(filePath, "utf8");
}

function extractJsonObject(output) {
  for (let start = output.indexOf("{"); start >= 0; start = output.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < output.length; index += 1) {
      const character = output[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(output.slice(start, index + 1));
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}

function allowedLiveUrl(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 8192) return null;
  try {
    const candidate = new URL(value);
    const allowedHost = candidate.hostname === "browserbase.com" || candidate.hostname.endsWith(".browserbase.com");
    if (candidate.protocol !== "https:" || !allowedHost || candidate.username || candidate.password) return null;
    return candidate.href;
  } catch {
    return null;
  }
}

function selectLiveUrl(payload) {
  const pages = Array.isArray(payload?.pages) ? payload.pages : [];
  const page = pages.find((candidate) => candidate?.url && candidate.url !== "about:blank") || pages[0];
  return allowedLiveUrl(page?.debuggerFullscreenUrl || payload?.debuggerFullscreenUrl);
}

async function resolveLiveUrl(sessionId, signal) {
  const browseBinary = process.env.BROWSE_BIN || "browse";
  try {
    const { stdout } = await execFileAsync(
      browseBinary,
      ["cloud", "sessions", "debug", sessionId],
      {
        env: { ...process.env, BROWSE_DISABLE_UPDATE_CHECK: "1", NO_COLOR: "1" },
        maxBuffer: 1024 * 1024,
        signal,
        timeout: 10_000,
        windowsHide: true,
      },
    );
    return selectLiveUrl(extractJsonObject(stdout));
  } catch {
    return null;
  }
}

async function atomicReadyWrite(readyPath, value) {
  const temporary = `${readyPath}.${process.pid}.tmp`;
  const contents = `${JSON.stringify(value)}\n`;
  await writeFile(temporary, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, readyPath);
  await chmod(readyPath, 0o600);
}

function baseHeaders(contentType, csp) {
  return {
    "cache-control": "no-store, max-age=0",
    "content-type": contentType,
    "content-security-policy": csp,
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  };
}

function tokenMatches(candidate, expected) {
  if (typeof candidate !== "string" || candidate.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sessionIdPath = required(args["session-id-file"], "session-id-file");
  const readyPath = required(args["ready-file"], "ready-file");
  const port = args.port === undefined ? 0 : Number(args.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("port must be an integer from 0 through 65535.");

  await validateParent(sessionIdPath);
  await validateParent(readyPath, true);
  try {
    const readyInfo = await lstat(readyPath);
    if (!readyInfo.isFile() || readyInfo.isSymbolicLink() || readyInfo.nlink !== 1) {
      throw new Error("ready-file must be a regular file, not a symlink.");
    }
    if (typeof process.getuid === "function" && readyInfo.uid !== process.getuid()) {
      throw new Error("ready-file must be owned by the current user.");
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const [html, clientScript] = await Promise.all([
    readFile(HTML_PATH, "utf8"),
    readFile(JS_PATH, "utf8"),
  ]);
  const styleSource = html.match(/<style>([\s\S]*?)<\/style>/u)?.[1];
  if (styleSource === undefined) throw new Error("Viewer stylesheet is missing.");
  const styleHash = createHash("sha256").update(styleSource).digest("base64");
  const csp = [
    "default-src 'self'",
    "base-uri 'none'",
    "connect-src 'self'",
    "font-src 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "frame-src 'self' https://browserbase.com https://*.browserbase.com",
    "img-src 'self'",
    "object-src 'none'",
    "script-src 'self'",
    `style-src 'sha256-${styleHash}'`,
  ].join("; ");
  const accessToken = randomBytes(32).toString("hex");

  let sessionId = null;
  let liveUrl = null;
  let liveRevision = 0;
  let liveStatus = "waiting";
  let resolving = false;
  let resolverAbortController = null;
  let stopping = false;

  const pollSession = async () => {
    if (resolving || stopping) return;
    let contents;
    try {
      contents = await readPrivateFile(sessionIdPath, MAX_SESSION_FILE_BYTES);
    } catch {
      sessionId = null;
      liveUrl = null;
      liveStatus = "unavailable";
      return;
    }
    const candidate = contents?.trim() || "";
    if (!UUID_PATTERN.test(candidate)) {
      sessionId = null;
      liveUrl = null;
      liveStatus = candidate ? "unavailable" : "waiting";
      return;
    }
    // The debug endpoint may mint a new `?t=` capability token on every call.
    // Resolving again for the same active session would make that token-only
    // URL change look like a new Live View and reload the iframe every poll.
    if (candidate === sessionId && liveUrl) {
      liveStatus = "ready";
      return;
    }
    if (candidate !== sessionId) {
      sessionId = candidate;
      liveUrl = null;
      liveStatus = "connecting";
    }
    resolving = true;
    resolverAbortController = new AbortController();
    const resolved = await resolveLiveUrl(candidate, resolverAbortController.signal);
    resolverAbortController = null;
    resolving = false;
    if (candidate !== sessionId || stopping) return;
    if (resolved) {
      if (resolved !== liveUrl) liveRevision += 1;
      liveUrl = resolved;
      liveStatus = "ready";
    } else if (!liveUrl) {
      liveStatus = "connecting";
    }
  };

  const server = createServer((request, response) => {
    void (async () => {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { ...baseHeaders("text/plain; charset=utf-8", csp), allow: "GET, HEAD" });
        response.end(request.method === "HEAD" ? undefined : "Method not allowed");
        return;
      }

      const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
      const cookieToken = (request.headers.cookie || "")
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("receipt_viewer="))
        ?.slice("receipt_viewer=".length);
      const queryAuthorized = tokenMatches(requestUrl.searchParams.get("token"), accessToken);
      const authorized = queryAuthorized || tokenMatches(cookieToken, accessToken);
      const authHeaders = queryAuthorized
        ? { "set-cookie": `receipt_viewer=${accessToken}; HttpOnly; SameSite=Strict; Path=/` }
        : {};
      const send = (status, headers, body) => {
        response.writeHead(status, { ...headers, ...authHeaders });
        response.end(request.method === "HEAD" ? undefined : body);
      };

      if (requestUrl.pathname !== "/health" && !authorized) {
        send(404, baseHeaders("text/plain; charset=utf-8", csp), "Not found");
        return;
      }

      if (requestUrl.pathname === "/") {
        send(200, baseHeaders("text/html; charset=utf-8", csp), html);
        return;
      }
      if (requestUrl.pathname === "/live-view.js") {
        send(200, baseHeaders("text/javascript; charset=utf-8", csp), clientScript);
        return;
      }
      if (requestUrl.pathname === "/health") {
        send(200, baseHeaders("application/json; charset=utf-8", csp), JSON.stringify({ ok: true }));
        return;
      }
      if (requestUrl.pathname === "/state") {
        send(200, baseHeaders("application/json; charset=utf-8", csp), JSON.stringify({
          live_ready: liveStatus === "ready",
          live_revision: liveRevision,
          live_status: liveStatus,
        }));
        return;
      }
      if (requestUrl.pathname === "/live") {
        if (!liveUrl) {
          send(503, baseHeaders("text/plain; charset=utf-8", csp), "Live browser is connecting.");
          return;
        }
        response.writeHead(302, {
          ...baseHeaders("text/plain; charset=utf-8", csp),
          location: liveUrl,
        });
        response.end();
        return;
      }
      send(404, baseHeaders("text/plain; charset=utf-8", csp), "Not found");
    })().catch(() => {
      if (!response.headersSent) {
        response.writeHead(500, baseHeaders("application/json; charset=utf-8", csp));
      }
      response.end(JSON.stringify({ ok: false }));
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Viewer did not bind to a local TCP port.");
  await atomicReadyWrite(readyPath, {
    url: `http://127.0.0.1:${address.port}/?token=${accessToken}`,
    state_url: `http://127.0.0.1:${address.port}/state?token=${accessToken}`,
    pid: process.pid,
  });

  await pollSession();
  const timer = setInterval(() => {
    void pollSession();
  }, 2000);
  timer.unref();

  const stop = () => {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    resolverAbortController?.abort();
    server.close(() => {
      void rm(readyPath, { force: true }).finally(() => process.exit(0));
    });
    setTimeout(() => {
      void rm(readyPath, { force: true }).finally(() => process.exit(0));
    }, 2000).unref();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

main().catch(() => {
  process.stderr.write("Receipt demo viewer failed to start.\n");
  process.exit(1);
});
