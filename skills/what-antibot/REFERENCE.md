# What Antibot Reference

Technical reference for the bundled detector.

## Command

```bash
node scripts/detect.mjs <url1>[,<url2>,...] [url3 ...]
```

### Arguments

| Argument | Description |
|----------|-------------|
| URL values | One or more HTTP(S) URLs. Comma-delimited values and positional arguments may be mixed. |
| Scheme | Optional. Inputs without `http://` or `https://` are normalized to `https://`. |

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Probe completed and printed a table. Individual rows may still contain fetch errors. |
| 2 | No URLs were provided or argument parsing failed. |
| 1 | An unexpected detector error escaped the main handler. |

## Output Columns

| Column | Description |
|--------|-------------|
| `URL` | Final response URL when available, including redirects. Invalid inputs keep the raw input. |
| `STATUS` | HTTP status code for successful fetches. Blank when URL parsing or fetch failed. |
| `ANTIBOTS` | Comma-separated vendor detections, `no antibot detected`, or `probe failed` when the row has an error and no detections. |
| `CONTEXT` | Optional. Extra details such as extracted site keys. |
| `ERROR` | Optional. URL parsing or fetch error text. |

## Detection Flow

1. Normalize each input URL.
2. Fetch each target with Chrome-like navigation headers and a Chrome 135 macOS user agent.
3. Read the HTML body, response headers, and `Set-Cookie` values.
4. Run vendor-specific regex and cookie-name checks across the combined signal set.
5. Extract up to 10 same-origin `<script src="...">` assets and scan them for the Shape Security inline payload pattern.
6. Print one row per target.

## Supported Signals

| Vendor | Signals |
|--------|---------|
| Cloudflare | `cf-ray`, `cf_clearance`, `__cfruid`, `server: cloudflare`, challenge payload markers |
| Cloudflare WAF | `__cf_bm` |
| Akamai | `_abck`, `bm_sv`, `bm_sz`, `ak_bmsc`, `bmak`, `bm_mi`, `bm_s`, `akamai` |
| Imperva / Incapsula | `imperva`, `incapsula`, `reese84`, `utmvc`, `incap_` |
| PerimeterX | `_px2`, `_px3`, `_pxhd`, `_pxff_`, `pxchk`, `pxInit` |
| DataDome | `datadome`, `dd_cookie_test_`, `geo-captcha-delivery`, `DD_RUM`, `dd_captcha` |
| Kasada | `KPSDK`, `KPSDK.configure`, `x-kpsdk-ct`, `kpsdk`, `kp_uuid` |
| Anubis | `/.within.website/x/cmd/anubis/`, `techaro.lol-anubis-cookie-verification` |
| reCAPTCHA | `google.com/recaptcha`, `gstatic.com/recaptcha`, `g-recaptcha`, `_GRECAPTCHA`, `grecaptcha.execute`, `g-recaptcha-response` |
| hCaptcha | `hcaptcha`, `js.hcaptcha.com`, `h-captcha`, `data-hcaptcha-site-key`, `hc_accessibility` |
| Shape Security | Characteristic same-origin script asset payload pattern |

## reCAPTCHA Version Heuristics

The detector reports `recaptcha v3`, `recaptcha v2 invisible`, or `recaptcha v2` when it can infer the version from:

- `render=` query parameters containing a valid site key
- `grecaptcha.execute(..., { action: ... })`
- `grecaptcha-badge`
- `data-size="invisible"`
- `g-recaptcha` markup
- `grecaptcha.render(...)`

When the page only exposes weak reCAPTCHA markers, the detector defaults to `recaptcha v2`.

## Limitations

- The detector sends HTTP requests, not browser navigations. It does not execute JavaScript.
- Node `fetch` does not mimic Chrome's TLS fingerprint, HTTP/2 behavior, or browser cache state.
- Sites may serve region-, IP-, cookie-, or bot-score-specific responses.
- Some pages include CAPTCHA libraries for optional flows even when they are not actively challenging the current request.
- "No antibot detected" means no supported marker appeared in this probe; it is not a guarantee that the site has no bot protection.
