#!/usr/bin/env node

/**
 * inbox.mjs — Throwaway email inbox for an autobrowse loop.
 *
 * Talks to the browse.sh inbox-provisioning endpoint, which proxies AgentMail
 * with a Browserbase-owned key. The agent never sees an AgentMail credential —
 * only the inbox address and these commands.
 *
 * Commands:
 *   create    --workspace <dir> --task <name>
 *   wait-otp  --workspace <dir> --task <name> --from <sender> --within <sec> [--regex <re>]
 *   wait-link --workspace <dir> --task <name> --from <sender> --within <sec> [--match <substr>]
 *   latest    --workspace <dir> --task <name>
 *   release   --workspace <dir> --task <name>
 *
 * Env:
 *   BROWSE_SH_URL             default https://browse.sh
 *   BROWSE_SH_WEBHOOK_SECRET  required — authenticates to the endpoint
 */

import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";

const BASE_URL = (process.env.BROWSE_SH_URL || "https://browse.sh").replace(/\/$/, "");
const WEBHOOK_SECRET = process.env.BROWSE_SH_WEBHOOK_SECRET;
const POLL_INTERVAL_MS = 3000;
const DEFAULT_OTP_RE = "\\b\\d{4,8}\\b";
// URLs in HTML emails live inside href="..." — the char class stops at the
// closing quote / angle bracket, so this captures the bare URL cleanly.
const URL_RE = /https?:\/\/[^\s"'<>)]+/g;

function getArg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function die(msg, code = 1) {
  console.error(`inbox: ${msg}`);
  process.exit(code);
}

function stateFile(workspace, task) {
  if (!task) die("--task <name> is required");
  return path.join(path.resolve(workspace || "autobrowse"), "tasks", task, ".inbox.json");
}

function readState(workspace, task) {
  const file = stateFile(workspace, task);
  if (!fs.existsSync(file)) {
    die(`no inbox for task "${task}" — run \`inbox.mjs create\` first`, 1);
  }
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function endpointHeaders() {
  if (!WEBHOOK_SECRET) {
    die("BROWSE_SH_WEBHOOK_SECRET is not set — cannot reach the inbox endpoint");
  }
  return { "Content-Type": "application/json", "x-webhook-secret": WEBHOOK_SECRET };
}

async function api(method, urlPath, { body } = {}) {
  const res = await fetch(`${BASE_URL}${urlPath}`, {
    method,
    headers: endpointHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${urlPath} → ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

function stripHtml(html) {
  return String(html || "").replace(/<[^>]+>/g, " ");
}

// Normalize whatever the list endpoint returns into a plain message array.
function asMessages(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.messages)) return body.messages;
  return [];
}

function senderOf(msg) {
  return String(msg.from ?? msg.sender ?? "").toLowerCase();
}

async function cmdCreate(workspace, task) {
  const file = stateFile(workspace, task);
  const { email, inbox_id } = await api("POST", "/api/skills/inboxes");
  if (!email || !inbox_id) die("endpoint returned no inbox", 1);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ email, inbox_id }, null, 2));
  // The agent reads stdout — print only the address.
  console.log(email);
}

function partsOf(msg) {
  return { subject: msg.subject ?? "", text: msg.text ?? "", html: msg.html ?? "" };
}

// Poll the inbox until `extract(parts)` returns a truthy value or the deadline
// passes. List payloads may omit the body, so for each candidate we try the
// list item first, then fall back to fetching the full message.
async function pollInbox(enc, from, within, extract) {
  const deadline = Date.now() + within * 1000;
  while (Date.now() < deadline) {
    // include_spam — verification emails to a brand-new throwaway inbox
    // frequently get spam-flagged; we want everything that lands here.
    const body = await api(
      "GET",
      `/api/skills/inboxes/${enc}/messages?limit=20&include_spam=true`,
    ).catch(() => null);
    const messages = asMessages(body);
    const matches = from ? messages.filter((m) => senderOf(m).includes(from)) : messages;

    for (const msg of matches) {
      let found = extract(partsOf(msg));
      if (!found && msg.message_id) {
        const full = await api(
          "GET",
          `/api/skills/inboxes/${enc}/messages?message_id=${encodeURIComponent(msg.message_id)}`,
        ).catch(() => null);
        if (full) found = extract(partsOf(full));
      }
      if (found) return found;
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return null;
}

async function cmdWaitOtp(workspace, task) {
  const { inbox_id } = readState(workspace, task);
  const from = (getArg("from") || "").toLowerCase();
  const within = parseInt(getArg("within", "60"), 10);
  const re = new RegExp(getArg("regex", DEFAULT_OTP_RE));

  const code = await pollInbox(encodeURIComponent(inbox_id), from, within, (p) => {
    const m = `${p.subject}\n${p.text}\n${stripHtml(p.html)}`.match(re);
    return m ? m[0] : null;
  });

  if (code) return void console.log(code);
  die(`no matching email within ${within}s (from filter: ${from || "any"})`, 2);
}

async function cmdWaitLink(workspace, task) {
  const { inbox_id } = readState(workspace, task);
  const from = (getArg("from") || "").toLowerCase();
  const within = parseInt(getArg("within", "60"), 10);
  const match = (getArg("match") || "").toLowerCase();

  const url = await pollInbox(encodeURIComponent(inbox_id), from, within, (p) => {
    // Search raw html (hrefs) plus text; pick the first URL containing --match.
    const urls = `${p.text}\n${p.html}`.match(URL_RE) || [];
    return (match ? urls.find((u) => u.toLowerCase().includes(match)) : urls[0]) || null;
  });

  if (url) return void console.log(url);
  die(`no matching link within ${within}s (from: ${from || "any"}, match: ${match || "any"})`, 2);
}

async function cmdLatest(workspace, task) {
  const { inbox_id } = readState(workspace, task);
  const enc = encodeURIComponent(inbox_id);
  const body = await api("GET", `/api/skills/inboxes/${enc}/messages?limit=1&include_spam=true`);
  const [msg] = asMessages(body);
  console.log(JSON.stringify(msg ?? null, null, 2));
}

async function cmdRelease(workspace, task) {
  const file = stateFile(workspace, task);
  if (!fs.existsSync(file)) return; // nothing to release
  try {
    const { inbox_id } = JSON.parse(fs.readFileSync(file, "utf-8"));
    if (inbox_id) {
      await api("DELETE", `/api/skills/inboxes?inbox_id=${encodeURIComponent(inbox_id)}`).catch(
        () => {},
      );
    }
  } catch {
    // best-effort
  } finally {
    fs.rmSync(file, { force: true });
  }
}

async function main() {
  const command = process.argv[2];
  const workspace = getArg("workspace", "autobrowse");
  const task = getArg("task");

  switch (command) {
    case "create":
      return cmdCreate(workspace, task);
    case "wait-otp":
      return cmdWaitOtp(workspace, task);
    case "wait-link":
      return cmdWaitLink(workspace, task);
    case "latest":
      return cmdLatest(workspace, task);
    case "release":
      return cmdRelease(workspace, task);
    default:
      die(`unknown command "${command ?? ""}" — use create | wait-otp | wait-link | latest | release`);
  }
}

main().catch((err) => die(err.message, 1));
