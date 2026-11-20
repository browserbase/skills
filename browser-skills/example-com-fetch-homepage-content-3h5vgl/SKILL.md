---
name: example-com-fetch-homepage-content-3h5vgl
title: Fetch example.com Homepage Content
description: >-
  Fetch the example.com homepage and return its h1 heading, first paragraph
  text, and the trailing 'Learn more' link as structured JSON. Read-only, no
  auth, no anti-bot.
website: example.com
category: reference
tags:
  - reference
  - fetch
  - html-parse
  - smoke-test
  - iana
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Works identically (browse open + browse get markdown body returns the same
      content cleanly), but spinning up a cloud session is ~2 orders of
      magnitude more expensive than a single HTTP fetch for a fully
      server-rendered static page. Only worth using if your harness has no HTTP
      fetch primitive or you specifically need a visual screenshot.
verified: false
proxies: false
---
# Fetch example.com Homepage Content

## Purpose
Read-only extraction of the [example.com](https://example.com) homepage and return its `h1` heading text and the first paragraph text (and, optionally, the trailing "Learn more" link). `example.com` is the IANA-reserved illustrative domain whose homepage is a single static HTML document served by Cloudflare — no JavaScript rendering, no anti-bot, no authentication. The optimal path is a raw HTTP fetch and a minimal HTML parse; a browser session is not required.

## When to Use
- An agent needs a known-stable, zero-friction target to smoke-test its fetch + parse pipeline end to end.
- A documentation, tutorial, or eval harness needs the canonical "hello world" web payload returned in a normalized shape.
- A connectivity / DNS / TLS check needs to confirm not just that `example.com` is reachable but that the expected document body is being served (e.g. detecting a captive portal or middlebox interception).
- A demo wants to show a JSON-shaped extraction of `h1` + lead paragraph from any URL, using example.com as the safe reference input.

## Workflow

The recommended path is a single HTTP fetch. example.com serves a complete, server-rendered HTML document — there is nothing for a browser to do that `curl`-equivalent tooling cannot.

1. **Fetch the page** with `browse cloud fetch`. No `--proxies`, no `--verified`, no session needed:
   ```bash
   browse cloud fetch https://example.com
   ```
   The response is a JSON envelope; the `content` field holds the raw HTML and `statusCode` should be `200`.

2. **Parse the HTML** for the two required fields. The document structure is stable: a single `<h1>` inside a `<div>`, followed by two `<p>` elements (the descriptive paragraph and a paragraph containing only the "Learn more" `<a>`). Any minimal parser works — examples:
   - Node: `cheerio` → `$('h1').text()` and `$('p').first().text()`.
   - Python: `BeautifulSoup` → `soup.h1.get_text(strip=True)` and `soup.find('p').get_text(strip=True)`.
   - Regex (acceptable because the document is hand-authored and stable): `/<h1>([^<]+)<\/h1>/` and `/<p>([^<]+)<\/p>/`.

3. **Normalize whitespace** on the extracted strings (collapse runs of whitespace, strip leading/trailing) before returning. The served HTML is minified onto a single line, so naive substring extraction will not have stray newlines, but downstream consumers should still be defensive.

4. **Return** the structured shape shown in [Expected Output](#expected-output).

### Browser fallback

Only worth using if your harness has no HTTP-fetch primitive at all, or if you want a visual screenshot for a marketplace card. Cost is ~2 orders of magnitude higher than `browse cloud fetch` (cloud session spin-up dominates).

```bash
sid=$(browse cloud sessions create --keep-alive | jq -r .id)
export BROWSE_SESSION="$sid"
browse open https://example.com --remote
browse get markdown body --remote
# {"markdown":"# Example Domain\n\nThis domain is for use in documentation examples without needing permission. Avoid use in operations.\n\n[Learn more](https://iana.org/domains/example)"}
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

The `browse get markdown body` output is already cleanly normalized; split on `\n\n` to separate the heading line from the first paragraph.

## Site-Specific Gotchas

- **The page text is not historical-museum content** — it changed. The widely-quoted older version that began "This domain is for use in illustrative examples in documents…" is **no longer** what's served. As of `Last-Modified: Thu, 14 May 2026 05:31:28 GMT`, the lead paragraph reads: *"This domain is for use in documentation examples without needing permission. Avoid use in operations."* Do **not** hardcode the paragraph text in tests — extract it at runtime, or your skill will silently rot the next time IANA updates the copy.
- **Cloudflare edge caching is aggressive** (`Cf-Cache-Status: HIT`, `Age` header in the tens of thousands of seconds is normal). The `Last-Modified` header is therefore the authoritative freshness signal, not `Date`. If you need to detect a content change, compare `Last-Modified` rather than re-fetching on a timer.
- **Allowed methods are `GET, HEAD` only** (`Allow: GET, HEAD`). Do not waste retries on `POST` / `OPTIONS`; the origin will refuse them.
- **No `robots.txt` enforcement and no rate limiting observed** at single-digit requests per minute. This is the IANA reference domain, intentionally permissive for documentation use. Do not abuse it (do not use it as a load-test target — there are dedicated services for that).
- **`example.com`, `example.org`, `example.net`, and `example.edu`** all serve the same payload from the same infrastructure. If your skill is generalized for "IANA example domains", treat them interchangeably; only the host header in the request differs.
- **The page does NOT include the host string `example.com` in its visible body** — only the title (`<title>Example Domain</title>`) and the `h1` (`Example Domain`) name the page. Do not assume the body contains the domain literal.
- **There is no API** in the conventional sense. The HTML document itself is the API. Do not waste iterations probing for `/api/`, `/v1/`, GraphQL, or sitemaps — none exist.
- **`Content-Encoding: br`** (Brotli) is returned by default. `browse cloud fetch` and modern HTTP clients decode this transparently; raw `socket`-level clients will need to advertise `Accept-Encoding: identity` if they cannot decode Brotli.

## Expected Output

```json
{
  "url": "https://example.com",
  "status": 200,
  "fetched_at": "2026-05-19T00:00:43Z",
  "last_modified": "2026-05-14T05:31:28Z",
  "title": "Example Domain",
  "h1": "Example Domain",
  "first_paragraph": "This domain is for use in documentation examples without needing permission. Avoid use in operations.",
  "learn_more_url": "https://iana.org/domains/example"
}
```

If you cannot reach the origin (DNS failure, TLS failure, captive portal returning a non-`Example Domain` body), return an error shape rather than fabricated content:

```json
{
  "url": "https://example.com",
  "status": 0,
  "error": "fetch_failed",
  "error_detail": "ENOTFOUND example.com"
}
```

If you reach the origin but the document shape has drifted (no `h1`, or zero `p` elements found), return a partial-success shape with the raw HTML attached for debugging — never silently substitute defaults:

```json
{
  "url": "https://example.com",
  "status": 200,
  "h1": null,
  "first_paragraph": null,
  "error": "unexpected_document_shape",
  "raw_html": "<!doctype html>..."
}
```
