# Browserbase Fetch API Reference

## Table of Contents

- [Endpoint](#endpoint)
- [Authentication](#authentication)
- [Request](#request)
- [Response](#response)
- [Error Responses](#error-responses)
- [SDK Reference](#sdk-reference)
- [Configuration](#configuration)

## Endpoint

```
POST https://api.browserbase.com/v1/fetch
```

Fetch a page and return its content, headers, and metadata.

## Authentication

All requests require the `X-BB-API-Key` header:

```bash
curl -X POST "https://api.browserbase.com/v1/fetch" \
  -H "X-BB-API-Key: $BROWSERBASE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

Get your API key from https://browserbase.com/settings.

## Request

**Content-Type:** `application/json`

### Body Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `url` | `string` (URI format) | Yes | — | The URL to fetch |
| `allowRedirects` | `boolean` | No | `false` | Whether to follow HTTP redirects |
| `allowInsecureSsl` | `boolean` | No | `false` | Whether to bypass TLS certificate verification |
| `proxies` | `boolean` | No | `false` | Whether to enable proxy support for the request |

### Minimal Request

```bash
curl -X POST "https://api.browserbase.com/v1/fetch" \
  -H "Content-Type: application/json" \
  -H "X-BB-API-Key: $BROWSERBASE_API_KEY" \
  -d '{"url": "https://example.com"}'
```

### Full Request

```bash
curl -X POST "https://api.browserbase.com/v1/fetch" \
  -H "Content-Type: application/json" \
  -H "X-BB-API-Key: $BROWSERBASE_API_KEY" \
  -d '{
    "url": "https://example.com",
    "allowRedirects": true,
    "allowInsecureSsl": false,
    "proxies": true
  }'
```

## Response

### 200 OK

Successful fetch. Returns:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier for the fetch request |
| `statusCode` | `integer` | HTTP status code of the fetched response |
| `headers` | `object` (string → string) | Response headers as key-value pairs |
| `content` | `string` | The response body content |
| `contentType` | `string` | The MIME type of the response |
| `encoding` | `string` | The character encoding of the response |

**Example response:**

```json
{
  "id": "abc123",
  "statusCode": 200,
  "headers": {
    "content-type": "text/html; charset=utf-8",
    "server": "nginx"
  },
  "content": "<!DOCTYPE html><html>...</html>",
  "contentType": "text/html",
  "encoding": "utf-8"
}
```

## Error Responses

### 400 Bad Request

Invalid request body. Check that `url` is a valid URI and parameters are correct types.

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Invalid URL format"
}
```

### 429 Too Many Requests

Concurrent fetch request limit exceeded. Wait and retry.

```json
{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "Concurrent fetch request limit exceeded"
}
```

### 502 Bad Gateway

The fetched response was too large or TLS certificate verification failed.

```json
{
  "statusCode": 502,
  "error": "Bad Gateway",
  "message": "TLS certificate verification failed"
}
```

**Fix**: Use `allowInsecureSsl: true` if the TLS error is expected (e.g., self-signed certificate). For oversized responses, fetch a more specific URL or use the Browser skill to extract specific content.

### 504 Gateway Timeout

The fetch request timed out. Default timeout is 60 seconds.

```json
{
  "statusCode": 504,
  "error": "Gateway Timeout",
  "message": "Fetch request timed out"
}
```

**Fix**: Check that the URL is reachable. If the target server is slow, consider using the Browser skill which has longer timeouts.

## SDK Reference

### Node.js / TypeScript

```typescript
import { Browserbase } from "@browserbasehq/sdk";

const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });

// Basic fetch
const response = await bb.fetchAPI.create({
  url: "https://example.com",
});

// With all options
const response = await bb.fetchAPI.create({
  url: "https://example.com",
  allowRedirects: true,
  allowInsecureSsl: false,
  proxies: true,
});

// Access response fields
response.id;          // string
response.statusCode;  // number
response.headers;     // Record<string, string>
response.content;     // string
response.contentType; // string
response.encoding;    // string
```

### Python

```python
from browserbase import Browserbase
import os

bb = Browserbase(api_key=os.environ["BROWSERBASE_API_KEY"])

# Basic fetch
response = bb.fetch_api.create(url="https://example.com")

# With all options
response = bb.fetch_api.create(
    url="https://example.com",
    allow_redirects=True,
    allow_insecure_ssl=False,
    proxies=True,
)

# Access response fields
response.status_code   # int
response.headers       # dict[str, str]
response.content       # str
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BROWSERBASE_API_KEY` | Yes | API key from https://browserbase.com/settings |

### Timeouts

The Fetch API has a default timeout of 60 seconds. This is not configurable per-request. If you need longer timeouts, use the Browser skill.

### Rate Limits

Concurrent fetch requests are limited per account. If you hit 429 errors, reduce concurrency or contact support for higher limits.
