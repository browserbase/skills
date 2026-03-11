---
name: fetch
description: "Fetch web pages and return their content, headers, and metadata using the Browserbase Fetch API. Use when the user wants to retrieve page content without a full browser session — ideal for scraping static pages, checking HTTP responses, or getting page source. Supports proxies, redirect control, and insecure SSL bypass."
license: MIT
allowed-tools: Bash
---

# Browserbase Fetch API

Fetch a page and return its content, headers, and metadata — no browser session required.

## Prerequisites

Get your API key from: https://browserbase.com/settings

```bash
export BROWSERBASE_API_KEY="your_api_key"
```

## When to Use Fetch vs Browser

| Use Case | Fetch API | Browser Skill |
|----------|-----------|---------------|
| Static page content | Yes | Overkill |
| Check HTTP status/headers | Yes | No |
| JavaScript-rendered pages | No | Yes |
| Form interactions | No | Yes |
| Page behind bot detection | Possible (with proxies) | Yes (stealth mode) |
| Simple scraping | Yes | Overkill |
| Speed | Fast | Slower |

**Rule of thumb**: Use Fetch for simple HTTP requests where you don't need JavaScript execution. Use the Browser skill when you need to interact with or render the page.

## Using with cURL

```bash
curl -X POST "https://api.browserbase.com/v1/fetch" \
  -H "Content-Type: application/json" \
  -H "X-BB-API-Key: $BROWSERBASE_API_KEY" \
  -d '{"url": "https://example.com"}'
```

### Request Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `url` | string (URI) | *required* | The URL to fetch |
| `allowRedirects` | boolean | `false` | Whether to follow HTTP redirects |
| `allowInsecureSsl` | boolean | `false` | Whether to bypass TLS certificate verification |
| `proxies` | boolean | `false` | Whether to enable proxy support |

### Response

Returns JSON with:

| Field | Type | Description |
|-------|------|-------------|
| `status_code` | integer | HTTP status code of the fetched response |
| `headers` | object | Response headers as key-value pairs |
| `content` | string | The response body content |

## Using with the SDK

### Node.js (TypeScript)

```bash
npm install @anthropic-ai/sdk browserbase
```

```typescript
import Browserbase from "@anthropic-ai/sdk";

const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });

const response = await bb.fetchApi.create({
  url: "https://example.com",
  allowRedirects: true,
});

console.log(response.statusCode);   // 200
console.log(response.content);      // page HTML
console.log(response.headers);      // response headers
```

### Python

```bash
pip install browserbase
```

```python
from browserbase import Browserbase
import os

bb = Browserbase(api_key=os.environ["BROWSERBASE_API_KEY"])

response = bb.fetchApi.create(
    url="https://example.com",
    allow_redirects=True,
)

print(response.status_code)  # 200
print(response.content)      # page HTML
print(response.headers)      # response headers
```

## Common Options

### Follow redirects

```bash
curl -X POST "https://api.browserbase.com/v1/fetch" \
  -H "Content-Type: application/json" \
  -H "X-BB-API-Key: $BROWSERBASE_API_KEY" \
  -d '{"url": "https://example.com/redirect", "allowRedirects": true}'
```

### Enable proxies

```bash
curl -X POST "https://api.browserbase.com/v1/fetch" \
  -H "Content-Type: application/json" \
  -H "X-BB-API-Key: $BROWSERBASE_API_KEY" \
  -d '{"url": "https://example.com", "proxies": true}'
```

### Bypass TLS verification

```bash
curl -X POST "https://api.browserbase.com/v1/fetch" \
  -H "Content-Type: application/json" \
  -H "X-BB-API-Key: $BROWSERBASE_API_KEY" \
  -d '{"url": "https://self-signed.example.com", "allowInsecureSsl": true}'
```

## Error Handling

| Status | Meaning |
|--------|---------|
| 400 | Invalid request body (check URL format and parameters) |
| 429 | Concurrent fetch request limit exceeded (retry later) |
| 502 | Response too large or TLS certificate verification failed |
| 504 | Fetch request timed out (default timeout: 60 seconds) |

## Best Practices

1. **Start with Fetch** for simple page retrieval — it's faster and cheaper than a browser session
2. **Enable `allowRedirects`** when fetching URLs that may redirect (shortened URLs, login flows)
3. **Use `proxies`** when the target site has IP-based rate limiting or geo-restrictions
4. **Check `status_code`** before processing `content` to handle errors gracefully
5. **Fall back to Browser** if Fetch returns empty content (page requires JavaScript rendering)

For detailed examples, see [EXAMPLES.md](EXAMPLES.md).
For API reference, see [REFERENCE.md](REFERENCE.md).
