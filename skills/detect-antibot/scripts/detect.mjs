#!/usr/bin/env node
// detect-antibot — single-request antibot fingerprinting.
//
// Sends one Node `fetch` GET to the target URL with a Chrome 135 macOS UA,
// then runs pattern detection across the HTML body, response headers, and
// Set-Cookie values. Optionally fetches same-origin <script src=...> assets
// to surface asset-level signals (Shape Security). Writes an HTML report
// summarizing the result.
//
// Usage:
//   node scripts/detect.mjs <url> [--report <path>] [--no-report] [--open]

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { tmpdir } from 'os';
import { spawn } from 'child_process';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

const NAV_HEADERS = {
  'user-agent': UA,
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'accept-language': 'en-US,en;q=0.9',
  'accept-encoding': 'gzip, deflate, br',
  'upgrade-insecure-requests': '1',
  'sec-ch-ua': '"Not(A:Brand";v="8", "Chromium";v="135", "Google Chrome";v="135"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-site': 'none',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-user': '?1',
  'sec-fetch-dest': 'document',
};

function scriptHeaders(referer) {
  return {
    'user-agent': UA,
    'accept': '*/*',
    'accept-language': 'en-US,en;q=0.9',
    'accept-encoding': 'gzip, deflate, br',
    'sec-ch-ua': '"Not(A:Brand";v="8", "Chromium";v="135", "Google Chrome";v="135"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-mode': 'no-cors',
    'sec-fetch-dest': 'script',
    referer,
  };
}

function normalizeURL(raw) {
  raw = (raw || '').trim();
  if (!raw) throw new Error('URL is required');
  if (raw.includes('://') && !raw.startsWith('http://') && !raw.startsWith('https://')) {
    throw new Error('invalid URL scheme');
  }
  if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
    raw = 'https://' + raw;
  }
  const u = new URL(raw);
  if (u.scheme !== 'http' && u.scheme !== 'https' && u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('invalid URL scheme');
  }
  if (!u.host) throw new Error('invalid URL host');
  return u.toString();
}

// ---------------------------------------------------------------------------
// Patterns (ported from go/services/whatantibot/detection.go)
// ---------------------------------------------------------------------------

const PATTERNS = {
  cloudflare: [/cf-ray/i, /__cfruid/i, /_cf_chl_opt/i, /cf_clearance/i, /cf-beacon/i],
  cloudflareWaf: [/__cf_bm/i],
  imperva: [/imperva/i, /incapsula/i, /reese84/i, /utmvc/i, /incap_/i],
  akamai: [/akamai/i, /_abck/i, /bm_sv/i, /bm_sz/i, /ak_bmsc/i, /bmak/i, /bm_mi/i, /\bbm_s\b/i],
  perimeterx: [/perimeterx/i, /pxchk/i, /_px3/i, /_pxhd/i, /_pxff_/i, /pxInit/i],
  datadome: [/datadome/i, /geo-captcha-delivery/i, /dd_cookie_test_/i, /DD_RUM/i, /dd_captcha/i],
  recaptcha: [
    /\brecaptcha\b/i,
    /google\.com\/recaptcha/i,
    /_grecaptcha_ready/i,
    /g-recaptcha/i,
    /data-sitekey/i,
    /Anti-fraud and anti-abuse applications only/i,
    /api\.js\?render=/i,
    /recaptcha\/api\.js/i,
    /recaptcha\/enterprise\.js/i,
    /gstatic\.com\/recaptcha/i,
    /g-recaptcha-response/i,
    /grecaptcha\.execute/i,
    /grecaptcha\.render/i,
    /_GRECAPTCHA/i,
  ],
  recaptchaStrong: [
    /google\.com\/recaptcha/i,
    /gstatic\.com\/recaptcha/i,
    /recaptcha\/api\.js/i,
    /recaptcha\/enterprise\.js/i,
    /g-recaptcha-response/i,
  ],
  hcaptcha: [/hcaptcha/i, /https:\/\/hcaptcha\.com\/license/i, /h-captcha/i, /data-hcaptcha-site-key/i, /hc_accessibility/i],
  hcaptchaStrong: [/js\.hcaptcha\.com/i, /class=["']h-captcha["']/i, /data-hcaptcha-site-key/i, /hcaptcha\.com\/license/i],
  kasada: [/KPSDK/i, /KPSDK\.configure/i, /x-kpsdk-ct/i, /kasada/i, /kpsdk/i, /_kpsdk/i, /kpsdk-ct/i],
  anubis: [/\/\.within\.website\/x\/cmd\/anubis\//i],
};

const COOKIE_NAMES = {
  cloudflare: ['cf_clearance', '__cfruid'],
  cloudflareWaf: ['__cf_bm'],
  imperva: ['reese84', 'utmvc', 'incap_'],
  akamai: ['_abck', 'bm_sv', 'bm_sz', 'ak_bmsc', 'bm_mi', 'bm_s'],
  perimeterx: ['_px2', '_px3', '_pxhd', '_pxff_'],
  datadome: ['datadome', 'dd_cookie_test_'],
  hcaptcha: ['hc_accessibility'],
  recaptcha: ['_GRECAPTCHA'],
  kasada: ['x-kpsdk-ct'],
  anubis: ['techaro.lol-anubis-cookie-verification'],
};

// Shape Security inline payload signature.
const SHAPE_ASSET_PATTERNS = [
  /"[a-zA-Z0-9+/_-]{40,}={0,2}"\s*,\s*"[a-zA-Z0-9+/=_-]{40,}"\s*,\s*\[[^\]]*\]\s*,\s*\[\s*\d{7,10}(?:\s*,\s*\d{7,10}){7}\s*\]/,
];

const RECAPTCHA_SITEKEY_RE = /^6L[a-zA-Z0-9_-]{38,}$/;
const RECAPTCHA_RENDER_RE = /(?:api\.js|api2\/api\.js|enterprise\.js)[^"']*[?&]render=(6L[^&"'\s]*)/i;
const HTML_TAG_RE = /<[^>]*>/g;
const SCRIPT_SRC_RE = /<script[^>]+src\s*=\s*["']([^"']+)["']/gi;

function anyRegex(s, patterns) {
  return patterns.some(re => re.test(s));
}

function anyCookieContains(cookies, names) {
  return cookies.some(c => {
    const lc = c.toLowerCase();
    return names.some(n => lc.includes(n.toLowerCase()));
  });
}

function detectRecaptchaVersion(html) {
  const content = html.toLowerCase();
  const stripped = html.replace(HTML_TAG_RE, '').toLowerCase();

  const m = html.match(RECAPTCHA_RENDER_RE);
  if (m && RECAPTCHA_SITEKEY_RE.test(m[1])) return 'recaptcha v3';

  const hasBadge = content.includes('grecaptcha-badge');
  const executeWithAction = /grecaptcha\.execute\([^,)]+,\s*\{\s*action\s*:/i;
  if (executeWithAction.test(stripped)) return 'recaptcha v3';

  if (content.includes('data-size="invisible"') || content.includes("data-size='invisible'")) {
    return 'recaptcha v2 invisible';
  }

  const hasRecaptchaScript =
    content.includes('recaptcha/api.js') ||
    content.includes('recaptcha/enterprise.js') ||
    content.includes('gstatic.com/recaptcha');

  if (hasBadge && !executeWithAction.test(stripped)) {
    if (/grecaptcha\.execute\([^)]*\)/i.test(stripped)) return 'recaptcha v2 invisible';
    if (hasRecaptchaScript) return 'recaptcha v3';
  }

  if (content.includes('g-recaptcha') || content.includes('class="g-recaptcha"')) return 'recaptcha v2';
  if (content.includes('grecaptcha.render(')) return 'recaptcha v2';

  return 'recaptcha v2';
}

function detectAntibot(html, headers, cookies) {
  const detected = [];
  const headerStr = Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\n').toLowerCase();
  const cookieStr = cookies.join(' ').toLowerCase();
  const search = html.toLowerCase() + ' ' + headerStr + ' ' + cookieStr;

  if (anyRegex(search, PATTERNS.cloudflare) || anyCookieContains(cookies, COOKIE_NAMES.cloudflare) || headerStr.includes('server: cloudflare')) {
    detected.push({ antibot: 'cloudflare' });
  }
  if (anyRegex(search, PATTERNS.cloudflareWaf) || anyCookieContains(cookies, COOKIE_NAMES.cloudflareWaf)) {
    detected.push({ antibot: 'cloudflare waf' });
  }
  if (anyRegex(search, PATTERNS.imperva) || anyCookieContains(cookies, COOKIE_NAMES.imperva)) {
    detected.push({ antibot: 'incapsula' });
  }
  if (anyRegex(search, PATTERNS.akamai) || anyCookieContains(cookies, COOKIE_NAMES.akamai)) {
    detected.push({ antibot: 'akamai' });
  }
  if (anyRegex(search, PATTERNS.perimeterx) || anyCookieContains(cookies, COOKIE_NAMES.perimeterx)) {
    detected.push({ antibot: 'perimeterx' });
  }
  if (anyRegex(search, PATTERNS.datadome) || anyCookieContains(cookies, COOKIE_NAMES.datadome)) {
    detected.push({ antibot: 'datadome' });
  }

  const hasHCaptcha = anyRegex(search, PATTERNS.hcaptcha) || anyCookieContains(cookies, COOKIE_NAMES.hcaptcha);
  if (hasHCaptcha) {
    const sitekeyRe = /data-sitekey="([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/;
    const m = search.match(sitekeyRe);
    detected.push(m ? { antibot: 'hcaptcha', additionalContext: [`sitekey=${m[1]}`] } : { antibot: 'hcaptcha' });
  }

  const hcaptchaLoaded = anyRegex(search, PATTERNS.hcaptchaStrong);
  let recaptchaDetected;
  if (hcaptchaLoaded) {
    recaptchaDetected = anyRegex(search, PATTERNS.recaptchaStrong) || anyCookieContains(cookies, COOKIE_NAMES.recaptcha);
  } else {
    recaptchaDetected = anyRegex(search, PATTERNS.recaptcha) || anyCookieContains(cookies, COOKIE_NAMES.recaptcha);
  }
  if (recaptchaDetected) detected.push({ antibot: detectRecaptchaVersion(html) });

  if (
    anyRegex(search, PATTERNS.kasada) ||
    anyCookieContains(cookies, COOKIE_NAMES.kasada) ||
    search.includes('kpsdk') ||
    search.includes('kp_uuid')
  ) {
    detected.push({ antibot: 'kasada' });
  }

  if (anyRegex(search, PATTERNS.anubis) || anyCookieContains(cookies, COOKIE_NAMES.anubis)) {
    detected.push({ antibot: 'anubis' });
  }

  return detected;
}

// ---------------------------------------------------------------------------
// Asset-level (Shape Security)
// ---------------------------------------------------------------------------

function extractScriptURLs(html, baseURL, max = 10) {
  const base = new URL(baseURL);
  const seen = new Set();
  const urls = [];
  let m;
  while ((m = SCRIPT_SRC_RE.exec(html)) !== null) {
    const src = m[1].trim();
    if (!src || src.startsWith('data:')) continue;
    let resolved;
    try {
      resolved = new URL(src, base);
    } catch {
      continue;
    }
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue;
    // Same-origin only — Shape payloads ship from the protected site, not third parties.
    if (resolved.origin !== base.origin) continue;
    const abs = resolved.toString();
    if (seen.has(abs)) continue;
    seen.add(abs);
    urls.push(abs);
    if (urls.length >= max) break;
  }
  return urls;
}

async function fetchAsset(url, referer) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, { headers: scriptHeaders(referer), signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  } finally {
    clearTimeout(t);
  }
}

async function detectAssetLevel(html, baseURL) {
  const urls = extractScriptURLs(html, baseURL, 10);
  if (urls.length === 0) return [];
  const bodies = await Promise.all(urls.map(u => fetchAsset(u, baseURL)));
  const combined = bodies.join('\n');
  const detected = [];
  if (anyRegex(combined, SHAPE_ASSET_PATTERNS)) detected.push({ antibot: 'shape security' });
  return detected;
}

// ---------------------------------------------------------------------------
// HTML report
// ---------------------------------------------------------------------------

const ANTIBOT_META = {
  cloudflare: { label: 'Cloudflare', color: '#f6821f' },
  'cloudflare waf': { label: 'Cloudflare WAF', color: '#f48120' },
  akamai: { label: 'Akamai', color: '#0099cc' },
  incapsula: { label: 'Imperva / Incapsula', color: '#ff5a3c' },
  perimeterx: { label: 'PerimeterX (HUMAN)', color: '#0a2540' },
  datadome: { label: 'DataDome', color: '#1f2bff' },
  hcaptcha: { label: 'hCaptcha', color: '#00838f' },
  'recaptcha v2': { label: 'reCAPTCHA v2', color: '#4285f4' },
  'recaptcha v2 invisible': { label: 'reCAPTCHA v2 (invisible)', color: '#4285f4' },
  'recaptcha v3': { label: 'reCAPTCHA v3', color: '#1a73e8' },
  kasada: { label: 'Kasada', color: '#7d2bff' },
  anubis: { label: 'Anubis', color: '#3b3b3b' },
  'shape security': { label: 'Shape Security (F5)', color: '#e21d38' },
};

function escapeHTML(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderReport({ url, status, antibots, context }) {
  const ts = new Date().toISOString();
  const hostname = (() => { try { return new URL(url).hostname; } catch { return url; } })();

  const cards = antibots.length === 0
    ? `<div class="empty">No antibot detected on this page.</div>`
    : antibots.map(name => {
        const meta = ANTIBOT_META[name] || { label: name, color: '#444' };
        const ctxLines = (context[name] || []).map(c => `<li>${escapeHTML(c)}</li>`).join('');
        return `
          <div class="card" style="border-left-color:${meta.color}">
            <div class="card-header">
              <span class="dot" style="background:${meta.color}"></span>
              <span class="name">${escapeHTML(meta.label)}</span>
            </div>
            ${ctxLines ? `<ul class="ctx">${ctxLines}</ul>` : ''}
          </div>`;
      }).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Antibot detection — ${escapeHTML(hostname)}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #fafafa;
    color: #1c1c1c;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #0d0d0f; color: #e8e8ea; }
    .card, header, .meta { background: #17171a; border-color: #2a2a2e; }
    .empty { background: #17171a; border-color: #2a2a2e; }
    a { color: #6aa9ff; }
  }
  main { max-width: 820px; margin: 40px auto; padding: 0 20px; }
  header {
    background: #fff;
    border: 1px solid #e6e6e8;
    border-radius: 14px;
    padding: 24px 28px;
    margin-bottom: 20px;
  }
  h1 { margin: 0 0 6px; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
  .url { word-break: break-all; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 13px; opacity: 0.85; }
  .meta {
    margin-top: 14px;
    display: flex;
    gap: 18px;
    flex-wrap: wrap;
    font-size: 13px;
    color: #555;
  }
  @media (prefers-color-scheme: dark) { .meta { color: #aaa; } }
  .meta span b { font-weight: 600; color: inherit; }
  .grid { display: grid; gap: 12px; }
  .card {
    background: #fff;
    border: 1px solid #e6e6e8;
    border-left: 4px solid #888;
    border-radius: 12px;
    padding: 16px 20px;
  }
  .card-header { display: flex; align-items: center; gap: 10px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .name { font-weight: 600; font-size: 16px; }
  ul.ctx { margin: 10px 0 0; padding-left: 20px; font-size: 13px; opacity: 0.85; }
  ul.ctx li { font-family: ui-monospace, "SF Mono", Menlo, monospace; }
  .empty {
    background: #fff;
    border: 1px dashed #d4d4d6;
    border-radius: 12px;
    padding: 30px;
    text-align: center;
    color: #777;
  }
  footer { margin-top: 24px; font-size: 12px; opacity: 0.6; text-align: center; }
</style>
</head>
<body>
<main>
  <header>
    <h1>Antibot Detection Report</h1>
    <div class="url"><a href="${escapeHTML(url)}" target="_blank" rel="noreferrer">${escapeHTML(url)}</a></div>
    <div class="meta">
      <span><b>HTTP status:</b> ${escapeHTML(String(status))}</span>
      <span><b>Detected:</b> ${antibots.length}</span>
      <span><b>Generated:</b> ${escapeHTML(ts)}</span>
    </div>
  </header>
  <div class="grid">
    ${cards}
  </div>
  <footer>Generated by /detect-antibot · single Node fetch · Chrome 135 macOS UA</footer>
</main>
</body>
</html>`;
}

function openInBrowser(path) {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start'
    : 'xdg-open';
  spawn(cmd, [path], { stdio: 'ignore', detached: true }).unref();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { url: null, report: null, writeReport: true, open: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--report' && argv[i + 1]) { out.report = argv[++i]; }
    else if (a === '--no-report') { out.writeReport = false; }
    else if (a === '--open') { out.open = true; }
    else if (!out.url) { out.url = a; }
  }
  return out;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const raw = opts.url;
  if (!raw) {
    console.error('Usage: node scripts/detect.mjs <url> [--report <path>] [--no-report] [--open]');
    process.exit(2);
  }

  let target;
  try {
    target = normalizeURL(raw);
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(2);
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);

  let res;
  try {
    res = await fetch(target, { headers: NAV_HEADERS, signal: ctrl.signal, redirect: 'follow' });
  } catch (e) {
    clearTimeout(t);
    console.error(JSON.stringify({ url: target, error: `fetch failed: ${e.message}` }, null, 2));
    process.exit(1);
  }
  clearTimeout(t);

  const headers = {};
  for (const [k, v] of res.headers.entries()) headers[k] = v;

  // getSetCookie() returns the array of raw Set-Cookie headers; fall back to the merged header for older runtimes.
  let cookies = [];
  if (typeof res.headers.getSetCookie === 'function') {
    cookies = res.headers.getSetCookie();
  } else {
    const sc = res.headers.get('set-cookie');
    if (sc) cookies = [sc];
  }

  const html = await res.text();

  const pageDetections = detectAntibot(html, headers, cookies);
  const assetDetections = await detectAssetLevel(html, res.url || target);
  const all = [...pageDetections, ...assetDetections];

  const antibots = [];
  const context = {};
  for (const d of all) {
    antibots.push(d.antibot);
    if (d.additionalContext && d.additionalContext.length > 0) {
      context[d.antibot] = d.additionalContext;
    }
  }

  const out = {
    url: res.url || target,
    status: res.status,
    antibots: [...new Set(antibots)],
    context,
  };

  console.log(JSON.stringify(out, null, 2));

  if (opts.writeReport) {
    const host = (() => { try { return new URL(out.url).hostname.replace(/^www\./, ''); } catch { return 'site'; } })();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultPath = resolve(tmpdir(), `antibot-${host}-${ts}.html`);
    const reportPath = opts.report ? resolve(opts.report) : defaultPath;
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, renderReport(out));
    console.log(`\nReport: ${reportPath}`);
    if (opts.open) openInBrowser(reportPath);
  }
}

main().catch(e => {
  console.error(`Unexpected error: ${e.stack || e.message}`);
  process.exit(1);
});
