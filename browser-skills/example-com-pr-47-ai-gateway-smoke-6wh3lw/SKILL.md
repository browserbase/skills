---
name: example-com-pr-47-ai-gateway-smoke-6wh3lw
title: Verify example.com Main Heading
description: >-
  Fetches https://example.com and verifies its main <h1> reads 'Example Domain'.
  Minimal end-to-end smoke test using the Browserbase Fetch API.
website: example.com
category: testing
tags:
  - testing
  - smoke-test
  - fetch-api
  - static-html
  - example
source: 'community: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Live Browserbase session works but is overkill — example.com is pure
      server-rendered HTML with one <h1>. Use only when the Fetch API is
      unavailable on the host.
---
# Verify example.com Main Heading

## Purpose

Fetches `https://example.com` and verifies its main `<h1>` heading. Returns the heading text, the page title, and a boolean indicating whether the heading matches the canonical value `Example Domain`. Read-only; no auth, no forms, no JS execution required.

## When to Use

- Smoke-testing a Browserbase-based stack end-to-end (API key, network egress, parsing pipeline).
- Validating a new agent's HTTP fetch path against a stable, known-good HTML response.
- Demonstrating the minimal `recommended_method: api` honesty pattern (Fetch API beats live-browser for static HTML).
- Health-checking outbound connectivity in a CI/sandbox before exercising a more expensive site.

## Workflow

1. **Fetch the page via the Browserbase Fetch API** (optimal — no browser session needed):
   ```bash
   browse cloud fetch https://example.com --allow-redirects --output page.html
   ```
   Expected response: `{"ok": true, "statusCode": 200, "contentType": "text/html", "sizeBytes": ~528}`.

2. **Extract the first `<h1>` from the returned HTML.** A regex is sufficient because example.com's markup is hand-written, single-line, with exactly one `<h1>`:
   ```bash
   python3 -c "import re,sys; m=re.search(r'<h1[^>]*>(.*?)</h1>', open('page.html').read(), re.I|re.S); print(m.group(1).strip() if m else '')"
   ```

3. **Compare against the canonical value** `Example Domain`. If equal, return `{"verified": true, ...}`; otherwise return `{"verified": false, "heading": "<observed>"}` so the caller can investigate whether IANA changed the reference page.

4. **(Optional) Also extract `<title>`** for a secondary sanity check — it has the same value `Example Domain` and gives independent confirmation that the response wasn't a proxy error page.

### Browser fallback

If for any reason the Fetch API is unavailable, drive a Browserbase session:

```bash
sid=$(browse cloud sessions create --keep-alive | jq -r .id)
ws=$(browse cloud sessions debug "$sid" | jq -r .wsUrl)
browse open https://example.com --cdp "$ws" --wait load
browse get text "h1" --cdp "$ws"
browse screenshot --cdp "$ws" --out final.png
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

Stealth/proxies are **not** needed — example.com is IANA's reserved demo domain with no anti-bot infrastructure.

## Site-Specific Gotchas

- **The page is pure server-rendered HTML — there is no JS, no XHR, no SPA hydration.** Anyone reaching for a live browser to extract the H1 is over-engineering; the Fetch API returns the entire 528-byte document in one round trip.
- **Exactly one `<h1>`, hand-written single-line markup.** A naïve regex `<h1[^>]*>(.*?)</h1>` works reliably; you do not need an HTML parser. Don't over-build.
- **The canonical heading is `Example Domain`** (verified 2026-05-19 against the live IANA reference page). If you ever see something else, treat it as a signal that either (a) IANA changed the example template, or (b) you hit a captive-portal / proxy intercept page rather than the real origin.
- **`<title>` and `<h1>` have the same value.** Two independent fields you can cross-check for free.
- **Redirects.** Pass `--allow-redirects` to `browse cloud fetch` defensively — at the time of authoring, `https://example.com` returns 200 directly with no redirect, but some networks intercept and 30x.
- **CDP from restricted sandboxes.** The Browserbase CDP endpoints (`connect.browserbase.com`, `connect.usw2.browserbase.com`) are sometimes blocked even when `api.browserbase.com` is allowlisted. On such hosts the Fetch API path is the only viable route — another reason it's the recommended method here.
- **No site-specific anti-bot caveats observed.** No proxies, no stealth, no captcha, no user-agent fingerprinting. example.com is the canonical bare-friendly test domain.

## Expected Output

```json
{
  "url": "https://example.com",
  "status_code": 200,
  "content_type": "text/html",
  "size_bytes": 528,
  "title": "Example Domain",
  "heading": "Example Domain",
  "verified": true
}
```

On a mismatch (defensive shape):

```json
{
  "url": "https://example.com",
  "status_code": 200,
  "title": "Example Domain",
  "heading": "<observed-text>",
  "verified": false,
  "reason": "heading text differs from canonical 'Example Domain'"
}
```

On an upstream failure (Fetch API non-2xx, redirect loop, network block):

```json
{
  "url": "https://example.com",
  "status_code": 0,
  "verified": false,
  "reason": "fetch failed: <error>"
}
```
