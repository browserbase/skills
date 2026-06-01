#!/usr/bin/env node

/**
 * inbox.mjs — Throwaway email inbox for an autobrowse loop.
 *
 * Talks directly to AgentMail (https://api.agentmail.to/v0) using an
 * AGENTMAIL_API_KEY from the environment. The inner agent never sees the key —
 * it only ever receives the inbox address and shells out to these commands.
 *
 * Commands:
 *   create    --workspace <dir> --task <name>
 *   wait-otp  --workspace <dir> --task <name> --from <sender> --within <sec> [--regex <re>]
 *   wait-link --workspace <dir> --task <name> --from <sender> --within <sec> [--match <substr>]
 *   latest    --workspace <dir> --task <name>
 *   release   --workspace <dir> --task <name>
 *
 * Env:
 *   AGENTMAIL_API_KEY  required — get a free key at https://agentmail.to.
 *                      Browserbase deployments inject a pooled key; regular
 *                      users provide their own.
 */

import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";

const AGENTMAIL_BASE = "https://api.agentmail.to/v0";
const POLL_INTERVAL_MS = 3000;
const DEFAULT_OTP_RE = "\\b\\d{4,8}\\b";
// Anchor extraction: real verification links are <a href> CTAs. Pulling hrefs
// (rather than every URL in the body) skips open-tracking pixels, which are
// <img src=...gif> — the bug that made wait-link return a useless p.gif.
// Capture the href and the visible link text so --match can target either.
const ANCHOR_RE = /<a\b[^>]*\shref\s*=\s*["']([^"']+)["'][^>]*>(.*?)<\/a>/gis;
const URL_RE = /https?:\/\/[^\s"'<>)]+/g;
// Links that are never the verification target, even if they're real anchors.
const REJECT_LINK_RE =
  /unsubscribe|list-manage|mailto:|tel:|notification-settings|\/preferences|\.gif(\?|$)|\/p\.gif|^#/i;

// Throwaway inboxes carry this local-part prefix so sweep-on-create only ever
// reclaims our own inboxes — never a human/primary inbox on the same account.
const INBOX_PREFIX = "ab-";
const STALE_INBOX_MS = 60 * 60 * 1000; // reclaim abandoned inboxes older than 1h

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

function apiKey() {
  const key = process.env.AGENTMAIL_API_KEY;
  if (!key) {
    die(
      "AGENTMAIL_API_KEY is not set — get a free key at https://agentmail.to " +
        "and add it to your .env (Browserbase deployments inject a pooled key).",
    );
  }
  return key;
}

async function agentMail(method, apiPath, { body } = {}) {
  const res = await fetch(`${AGENTMAIL_BASE}${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${apiPath} → ${res.status}: ${JSON.stringify(json)}`);
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

function localPart(inboxId) {
  return String(inboxId || "").split("@")[0] ?? "";
}

// Delete throwaway inboxes that outlived a loop (e.g. it crashed before
// releasing). Best-effort: never blocks minting a new inbox. Only touches
// `ab-`-prefixed inboxes we can confidently date as stale.
async function sweepStaleInboxes() {
  try {
    const body = await agentMail("GET", "/inboxes");
    const inboxes = Array.isArray(body?.inboxes) ? body.inboxes : [];
    const cutoff = Date.now() - STALE_INBOX_MS;
    await Promise.all(
      inboxes.map(async (inbox) => {
        const id = String(inbox.inbox_id ?? inbox.email ?? "");
        if (!id || !localPart(id).startsWith(INBOX_PREFIX)) return;
        const created = inbox.created_at ? Date.parse(inbox.created_at) : NaN;
        if (!Number.isFinite(created) || created > cutoff) return;
        await agentMail("DELETE", `/inboxes/${encodeURIComponent(id)}`).catch(() => {});
      }),
    );
  } catch {
    // swallow — sweeping is a courtesy, not a correctness requirement
  }
}

async function cmdCreate(workspace, task) {
  const file = stateFile(workspace, task);
  // Release any inbox this task already tracks before minting a new one.
  // Sweep alone won't catch it (it's <1h old), and overwriting .inbox.json
  // below would orphan it — leaked AND no longer reachable by `release`.
  if (fs.existsSync(file)) {
    try {
      const { inbox_id: prev } = JSON.parse(fs.readFileSync(file, "utf-8"));
      if (prev) await agentMail("DELETE", `/inboxes/${encodeURIComponent(prev)}`).catch(() => {});
    } catch {
      // unreadable state file — fall through; sweep is the backstop
    }
  }
  await sweepStaleInboxes();
  const username = `${INBOX_PREFIX}${randomBytes(5).toString("hex")}`;
  const inbox = await agentMail("POST", "/inboxes", {
    body: { username, display_name: "Autobrowse" },
  });
  const inbox_id = inbox.inbox_id ?? inbox.email;
  if (!inbox_id) die(`AgentMail returned no inbox_id: ${JSON.stringify(inbox)}`, 1);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ email: inbox_id, inbox_id }, null, 2));
  // The agent reads stdout — print only the address.
  console.log(inbox_id);
}

// Prefer AgentMail's cleaned `extracted_*` fields, falling back to raw. The
// list endpoint omits all of these (body only exists on the single-message
// fetch), which is why callers must fetch the full message — see pollInbox.
function partsOf(msg) {
  return {
    subject: msg.subject ?? "",
    text: msg.extracted_text ?? msg.text ?? "",
    html: msg.extracted_html ?? msg.html ?? "",
  };
}

function stripTags(html) {
  return String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// Pull candidate verification links from an email body as {href, text} pairs:
// anchors first (the real CTAs), then any bare URLs in the text as a fallback.
// Tracking pixels and unsubscribe/footer links are filtered out.
function linksFrom(parts) {
  const out = [];
  let m;
  ANCHOR_RE.lastIndex = 0;
  while ((m = ANCHOR_RE.exec(parts.html)) !== null) {
    out.push({ href: m[1], text: stripTags(m[2]) });
  }
  for (const u of String(parts.text).match(URL_RE) || []) out.push({ href: u, text: "" });
  return out.filter((l) => l.href && !REJECT_LINK_RE.test(l.href));
}

// Poll the inbox until `extract(parts)` returns a truthy value or the deadline
// passes. List payloads may omit the body, so for each candidate we try the
// list item first, then fall back to fetching the full message.
async function pollInbox(enc, from, within, extract) {
  const deadline = Date.now() + within * 1000;
  while (Date.now() < deadline) {
    // include_spam — verification emails to a brand-new throwaway inbox
    // frequently get spam-flagged; we want everything that lands here.
    const body = await agentMail(
      "GET",
      `/inboxes/${enc}/messages?limit=20&include_spam=true`,
    ).catch(() => null);
    const messages = asMessages(body);
    const matches = from ? messages.filter((m) => senderOf(m).includes(from)) : messages;

    for (const msg of matches) {
      let found = extract(partsOf(msg));
      if (!found && msg.message_id) {
        const full = await agentMail(
          "GET",
          `/inboxes/${enc}/messages/${encodeURIComponent(msg.message_id)}`,
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
    const links = linksFrom(p);
    if (!links.length) return null;
    // With --match, match against the href OR the visible link text (so
    // `--match "sign in"` finds the CTA even when its href is a tracking
    // redirect). Without it, take the first real link — emails lead with the
    // CTA. browse open follows any tracking redirect to the real page.
    const hit = match
      ? links.find(
          (l) => l.href.toLowerCase().includes(match) || l.text.toLowerCase().includes(match),
        )
      : links[0];
    return hit ? hit.href : null;
  });

  if (url) return void console.log(url);
  die(`no matching link within ${within}s (from: ${from || "any"}, match: ${match || "any"})`, 2);
}

async function cmdLatest(workspace, task) {
  const { inbox_id } = readState(workspace, task);
  const enc = encodeURIComponent(inbox_id);
  const body = await agentMail("GET", `/inboxes/${enc}/messages?limit=1&include_spam=true`);
  const [summary] = asMessages(body);
  if (!summary) return void console.log("null");
  // The list summary has no text/html body — fetch the full message so the
  // caller can actually read it (subject, from, text, html, links).
  const full = summary.message_id
    ? await agentMail(
        "GET",
        `/inboxes/${enc}/messages/${encodeURIComponent(summary.message_id)}`,
      ).catch(() => summary)
    : summary;
  console.log(JSON.stringify(full, null, 2));
}

async function cmdRelease(workspace, task) {
  const file = stateFile(workspace, task);
  if (!fs.existsSync(file)) return; // nothing to release
  try {
    const { inbox_id } = JSON.parse(fs.readFileSync(file, "utf-8"));
    if (inbox_id) {
      // 404 → already gone; treat any failure as best-effort.
      await agentMail("DELETE", `/inboxes/${encodeURIComponent(inbox_id)}`).catch(() => {});
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
