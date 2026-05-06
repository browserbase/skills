#!/usr/bin/env node
// what-antibot — single-request antibot fingerprinting.
//
// Sends one Node `fetch` GET per target URL with a Chrome 135 macOS UA, then
// runs pattern detection across the HTML body, response headers, and
// Set-Cookie values. Optionally fetches same-origin <script src=...> assets
// to surface asset-level signals (Shape Security). Prints a clean table.
//
// Usage:
//   node scripts/detect.mjs <url1>[,<url2>,...]

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
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
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
// Per-URL probe
// ---------------------------------------------------------------------------

async function probe(rawURL) {
  let target;
  try {
    target = normalizeURL(rawURL);
  } catch (e) {
    return { url: rawURL, status: '', antibots: [], context: {}, error: e.message };
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);

  let res;
  try {
    res = await fetch(target, { headers: NAV_HEADERS, signal: ctrl.signal, redirect: 'follow' });
  } catch (e) {
    clearTimeout(t);
    return { url: target, status: '', antibots: [], context: {}, error: `fetch failed: ${e.message}` };
  }
  clearTimeout(t);

  const headers = {};
  for (const [k, v] of res.headers.entries()) headers[k] = v;

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

  return {
    url: res.url || target,
    status: res.status,
    antibots: [...new Set(antibots)],
    context,
    error: '',
  };
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const NONE_LABEL = 'no antibot detected';

function flattenRow(r) {
  return {
    url: r.url,
    status: r.status === '' ? '' : String(r.status),
    antibots: r.antibots.join(', ') || NONE_LABEL,
    context: Object.entries(r.context)
      .map(([k, v]) => `${k}: ${v.join(', ')}`)
      .join('; '),
    error: r.error || '',
  };
}

function rowsToTable(rows) {
  const flat = rows.map(flattenRow);
  const cols = [
    { key: 'url', label: 'URL' },
    { key: 'status', label: 'STATUS' },
    { key: 'antibots', label: 'ANTIBOTS' },
  ];
  const hasContext = flat.some(r => r.context);
  const hasError = flat.some(r => r.error);
  if (hasContext) cols.push({ key: 'context', label: 'CONTEXT' });
  if (hasError) cols.push({ key: 'error', label: 'ERROR' });

  const widths = cols.map(c => Math.max(c.label.length, ...flat.map(r => r[c.key].length)));
  const pad = (s, w) => s + ' '.repeat(w - s.length);
  const sep = '  ';

  const lines = [];
  lines.push(cols.map((c, i) => pad(c.label, widths[i])).join(sep));
  lines.push(widths.map(w => '─'.repeat(w)).join(sep));
  for (const r of flat) {
    lines.push(cols.map((c, i) => pad(r[c.key], widths[i])).join(sep));
  }
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const urls = [];
  for (const a of argv) {
    if (a.startsWith('--')) continue;
    for (const part of a.split(',')) {
      const u = part.trim();
      if (u) urls.push(u);
    }
  }
  return { urls };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.urls.length === 0) {
    console.error('Usage: node scripts/detect.mjs <url1>[,<url2>,...]');
    process.exit(2);
  }

  const results = await Promise.all(opts.urls.map(probe));
  process.stdout.write(rowsToTable(results));
}

main().catch(e => {
  console.error(`Unexpected error: ${e.stack || e.message}`);
  process.exit(1);
});
