#!/usr/bin/env node
// what-antibot: single-request antibot fingerprinting.
//
// Sends one Node fetch GET per target URL with a Chrome-like user agent, then
// runs pattern detection across HTML, response headers, and Set-Cookie values.
// Same-origin script assets are scanned only to surface Shape Security markers.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

const NAV_HEADERS = {
  "user-agent": UA,
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "accept-language": "en-US,en;q=0.9",
  "accept-encoding": "gzip, deflate, br",
  "upgrade-insecure-requests": "1",
  "sec-ch-ua": '"Not(A:Brand";v="8", "Chromium";v="135", "Google Chrome";v="135"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "sec-fetch-site": "none",
  "sec-fetch-mode": "navigate",
  "sec-fetch-user": "?1",
  "sec-fetch-dest": "document",
};

function scriptHeaders(referer) {
  return {
    "user-agent": UA,
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9",
    "accept-encoding": "gzip, deflate, br",
    "sec-ch-ua": '"Not(A:Brand";v="8", "Chromium";v="135", "Google Chrome";v="135"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "no-cors",
    "sec-fetch-dest": "script",
    referer,
  };
}

function normalizeURL(raw) {
  let value = (raw || "").trim();
  if (!value) throw new Error("URL is required");
  if (value.includes("://") && !value.startsWith("http://") && !value.startsWith("https://")) {
    throw new Error("invalid URL scheme");
  }
  if (!value.startsWith("http://") && !value.startsWith("https://")) {
    value = "https://" + value;
  }
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("invalid URL scheme");
  }
  if (!url.host) throw new Error("invalid URL host");
  return url.toString();
}

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
  cloudflare: ["cf_clearance", "__cfruid"],
  cloudflareWaf: ["__cf_bm"],
  imperva: ["reese84", "utmvc", "incap_"],
  akamai: ["_abck", "bm_sv", "bm_sz", "ak_bmsc", "bm_mi", "bm_s"],
  perimeterx: ["_px2", "_px3", "_pxhd", "_pxff_"],
  datadome: ["datadome", "dd_cookie_test_"],
  hcaptcha: ["hc_accessibility"],
  recaptcha: ["_GRECAPTCHA"],
  kasada: ["x-kpsdk-ct"],
  anubis: ["techaro.lol-anubis-cookie-verification"],
};

const SHAPE_ASSET_PATTERNS = [
  /"[a-zA-Z0-9+/_-]{40,}={0,2}"\s*,\s*"[a-zA-Z0-9+/=_-]{40,}"\s*,\s*\[[^\]]*\]\s*,\s*\[\s*\d{7,10}(?:\s*,\s*\d{7,10}){7}\s*\]/,
];

const RECAPTCHA_SITEKEY_RE = /^6L[a-zA-Z0-9_-]{38,}$/;
const RECAPTCHA_RENDER_RE = /(?:api\.js|api2\/api\.js|enterprise\.js)[^"']*[?&]render=(6L[^&"'\s]*)/i;
const HTML_TAG_RE = /<[^>]*>/g;
const SCRIPT_SRC_RE = /<script[^>]+src\s*=\s*["']([^"']+)["']/gi;

function anyRegex(value, patterns) {
  return patterns.some((re) => re.test(value));
}

function anyCookieContains(cookies, names) {
  return cookies.some((cookie) => {
    const normalizedCookie = cookie.toLowerCase();
    return names.some((name) => normalizedCookie.includes(name.toLowerCase()));
  });
}

function detectRecaptchaVersion(html) {
  const content = html.toLowerCase();
  const stripped = html.replace(HTML_TAG_RE, "").toLowerCase();
  const renderMatch = html.match(RECAPTCHA_RENDER_RE);

  if (renderMatch && RECAPTCHA_SITEKEY_RE.test(renderMatch[1])) return "recaptcha v3";

  const hasBadge = content.includes("grecaptcha-badge");
  const executeWithAction = /grecaptcha\.execute\([^,)]+,\s*\{\s*action\s*:/i;
  if (executeWithAction.test(stripped)) return "recaptcha v3";

  if (content.includes('data-size="invisible"') || content.includes("data-size='invisible'")) {
    return "recaptcha v2 invisible";
  }

  const hasRecaptchaScript =
    content.includes("recaptcha/api.js") ||
    content.includes("recaptcha/enterprise.js") ||
    content.includes("gstatic.com/recaptcha");

  if (hasBadge && !executeWithAction.test(stripped)) {
    if (/grecaptcha\.execute\([^)]*\)/i.test(stripped)) return "recaptcha v2 invisible";
    if (hasRecaptchaScript) return "recaptcha v3";
  }

  if (content.includes("g-recaptcha") || content.includes('class="g-recaptcha"')) return "recaptcha v2";
  if (content.includes("grecaptcha.render(")) return "recaptcha v2";

  return "recaptcha v2";
}

function detectAntibot(html, headers, cookies) {
  const detected = [];
  const headerStr = Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n")
    .toLowerCase();
  const cookieStr = cookies.join(" ").toLowerCase();
  const search = `${html.toLowerCase()} ${headerStr} ${cookieStr}`;

  if (
    anyRegex(search, PATTERNS.cloudflare) ||
    anyCookieContains(cookies, COOKIE_NAMES.cloudflare) ||
    headerStr.includes("server: cloudflare")
  ) {
    detected.push({ antibot: "cloudflare" });
  }
  if (anyRegex(search, PATTERNS.cloudflareWaf) || anyCookieContains(cookies, COOKIE_NAMES.cloudflareWaf)) {
    detected.push({ antibot: "cloudflare waf" });
  }
  if (anyRegex(search, PATTERNS.imperva) || anyCookieContains(cookies, COOKIE_NAMES.imperva)) {
    detected.push({ antibot: "incapsula" });
  }
  if (anyRegex(search, PATTERNS.akamai) || anyCookieContains(cookies, COOKIE_NAMES.akamai)) {
    detected.push({ antibot: "akamai" });
  }
  if (anyRegex(search, PATTERNS.perimeterx) || anyCookieContains(cookies, COOKIE_NAMES.perimeterx)) {
    detected.push({ antibot: "perimeterx" });
  }
  if (anyRegex(search, PATTERNS.datadome) || anyCookieContains(cookies, COOKIE_NAMES.datadome)) {
    detected.push({ antibot: "datadome" });
  }

  const hasHCaptcha = anyRegex(search, PATTERNS.hcaptcha) || anyCookieContains(cookies, COOKIE_NAMES.hcaptcha);
  if (hasHCaptcha) {
    const sitekeyRe = /data-sitekey=["']([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})["']/i;
    const match = search.match(sitekeyRe);
    detected.push(match ? { antibot: "hcaptcha", additionalContext: [`sitekey=${match[1]}`] } : { antibot: "hcaptcha" });
  }

  const hcaptchaLoaded = anyRegex(search, PATTERNS.hcaptchaStrong);
  const recaptchaDetected = hcaptchaLoaded
    ? anyRegex(search, PATTERNS.recaptchaStrong) || anyCookieContains(cookies, COOKIE_NAMES.recaptcha)
    : anyRegex(search, PATTERNS.recaptcha) || anyCookieContains(cookies, COOKIE_NAMES.recaptcha);
  if (recaptchaDetected) detected.push({ antibot: detectRecaptchaVersion(html) });

  if (
    anyRegex(search, PATTERNS.kasada) ||
    anyCookieContains(cookies, COOKIE_NAMES.kasada) ||
    search.includes("kpsdk") ||
    search.includes("kp_uuid")
  ) {
    detected.push({ antibot: "kasada" });
  }

  if (anyRegex(search, PATTERNS.anubis) || anyCookieContains(cookies, COOKIE_NAMES.anubis)) {
    detected.push({ antibot: "anubis" });
  }

  return detected;
}

function extractScriptURLs(html, baseURL, max = 10) {
  const base = new URL(baseURL);
  const seen = new Set();
  const urls = [];
  let match;

  while ((match = SCRIPT_SRC_RE.exec(html)) !== null) {
    const src = match[1].trim();
    if (!src || src.startsWith("data:")) continue;

    let resolved;
    try {
      resolved = new URL(src, base);
    } catch {
      continue;
    }

    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
    if (resolved.origin !== base.origin) continue;

    const absoluteURL = resolved.toString();
    if (seen.has(absoluteURL)) continue;

    seen.add(absoluteURL);
    urls.push(absoluteURL);
    if (urls.length >= max) break;
  }

  return urls;
}

async function fetchAsset(url, referer) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 5000);

  try {
    const res = await fetch(url, {
      headers: scriptHeaders(referer),
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

async function detectAssetLevel(html, baseURL) {
  const urls = extractScriptURLs(html, baseURL, 10);
  if (urls.length === 0) return [];

  const bodies = await Promise.all(urls.map((url) => fetchAsset(url, baseURL)));
  const combined = bodies.join("\n");
  if (anyRegex(combined, SHAPE_ASSET_PATTERNS)) {
    return [{ antibot: "shape security" }];
  }
  return [];
}

function getSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const setCookie = headers.get("set-cookie");
  return setCookie ? [setCookie] : [];
}

async function probe(rawURL) {
  let target;
  try {
    target = normalizeURL(rawURL);
  } catch (error) {
    return { url: rawURL, status: "", antibots: [], context: {}, error: error.message };
  }

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 15000);

  let res;
  try {
    res = await fetch(target, {
      headers: NAV_HEADERS,
      signal: ctrl.signal,
      redirect: "follow",
    });
  } catch (error) {
    clearTimeout(timeout);
    return { url: target, status: "", antibots: [], context: {}, error: `fetch failed: ${error.message}` };
  }
  clearTimeout(timeout);

  const headers = {};
  for (const [key, value] of res.headers.entries()) {
    headers[key] = value;
  }

  let html = "";
  try {
    html = await res.text();
  } catch (error) {
    return { url: res.url || target, status: res.status, antibots: [], context: {}, error: `body read failed: ${error.message}` };
  }

  const cookies = getSetCookies(res.headers);
  const pageDetections = detectAntibot(html, headers, cookies);
  const assetDetections = await detectAssetLevel(html, res.url || target);
  const allDetections = [...pageDetections, ...assetDetections];

  const antibots = [];
  const context = {};
  for (const detection of allDetections) {
    antibots.push(detection.antibot);
    if (detection.additionalContext?.length > 0) {
      context[detection.antibot] = detection.additionalContext;
    }
  }

  return {
    url: res.url || target,
    status: res.status,
    antibots: [...new Set(antibots)],
    context,
    error: "",
  };
}

const NONE_LABEL = "no antibot detected";

function flattenRow(row) {
  const antibots = row.antibots.join(", ");
  return {
    url: row.url,
    status: row.status === "" ? "" : String(row.status),
    antibots: antibots || (row.error ? "probe failed" : NONE_LABEL),
    context: Object.entries(row.context)
      .map(([key, values]) => `${key}: ${values.join(", ")}`)
      .join("; "),
    error: row.error || "",
  };
}

function rowsToTable(rows) {
  const flatRows = rows.map(flattenRow);
  const cols = [
    { key: "url", label: "URL" },
    { key: "status", label: "STATUS" },
    { key: "antibots", label: "ANTIBOTS" },
  ];

  if (flatRows.some((row) => row.context)) cols.push({ key: "context", label: "CONTEXT" });
  if (flatRows.some((row) => row.error)) cols.push({ key: "error", label: "ERROR" });

  const widths = cols.map((col) => Math.max(col.label.length, ...flatRows.map((row) => row[col.key].length)));
  const pad = (value, width) => value + " ".repeat(width - value.length);
  const separator = "  ";

  const lines = [
    cols.map((col, index) => pad(col.label, widths[index])).join(separator),
    widths.map((width) => "-".repeat(width)).join(separator),
  ];

  for (const row of flatRows) {
    lines.push(cols.map((col, index) => pad(row[col.key], widths[index])).join(separator));
  }

  return lines.join("\n") + "\n";
}

function usage() {
  return "Usage: node scripts/detect.mjs <url1>[,<url2>,...] [url3 ...]";
}

function parseArgs(argv) {
  const urls = [];
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      return { help: true, urls };
    }
    if (arg.startsWith("--")) {
      throw new Error(`unknown option: ${arg}`);
    }
    for (const part of arg.split(",")) {
      const url = part.trim();
      if (url) urls.push(url);
    }
  }
  return { help: false, urls };
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exit(2);
  }

  if (opts.help) {
    console.log(usage());
    return;
  }

  if (opts.urls.length === 0) {
    console.error(usage());
    process.exit(2);
  }

  const results = await Promise.all(opts.urls.map((url) => probe(url)));
  process.stdout.write(rowsToTable(results));
}

main().catch((error) => {
  console.error(`Unexpected error: ${error.stack || error.message}`);
  process.exit(1);
});
