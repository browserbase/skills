# Domain Firewall — API Reference

## Table of Contents

- [Architecture](#architecture)
- [Policy System](#policy-system)
- [Built-in Policies](#built-in-policies)
- [CDP APIs](#cdp-apis)
- [Stagehand APIs](#stagehand-apis)
- [Error Reasons](#error-reasons)
- [Resource Types](#resource-types)
- [Security Considerations](#security-considerations)

## Architecture

```
Stagehand.init()
       │
       ▼
page.sendCDP("Fetch.enable", { patterns: [{ urlPattern: "*" }] })
       │
       ▼
┌──────────────────────────────────────────────┐
│  session.on("Fetch.requestPaused", handler)  │  ← fires for EVERY request
└──────────────┬───────────────────────────────┘
               │
               ▼
       ┌───────────────┐     ┌───────────────────┐
       │ resourceType  │─No─▶│ Fetch.continue    │  (images, CSS, JS, fonts)
       │ == Document?  │     │ Request            │
       └───────┬───────┘     └───────────────────┘
               │ Yes
               ▼
   ┌───────────────────────────────────────────┐
   │         POLICY CHAIN EVALUATION           │
   │                                           │
   │  for each policy in config.policies:      │
   │    verdict = policy.evaluate({ domain })  │
   │    if verdict ≠ "abstain" → use it        │
   │                                           │
   │  if all abstain → use defaultVerdict      │
   └───────────────┬───────────────────────────┘
                   │
            ┌──────┴──────┐
            ▼             ▼
       "allow"         "deny"
            │             │
            ▼             ▼
    Fetch.continue  Fetch.failRequest
    Request         (BlockedByClient)
            │             │
            ▼             ▼
     Page loads     Page stays put
```

## Policy System

### Core Types

```typescript
type Verdict = "allow" | "deny" | "abstain";

interface NavigationRequest {
  /** Normalized domain (no www, lowercase) */
  domain: string;
  /** Full URL being navigated to */
  url: string;
}

interface FirewallPolicy {
  /** Human-readable name (appears in audit log's decidedBy field) */
  name: string;
  /** Evaluate a navigation request. Return "abstain" to defer to the next policy. */
  evaluate(req: NavigationRequest): Verdict | Promise<Verdict>;
}

interface FirewallConfig {
  /** Policies evaluated in order. First non-"abstain" verdict wins. */
  policies: FirewallPolicy[];
  /** Verdict when all policies abstain. Default: "deny". */
  defaultVerdict?: "allow" | "deny";
  /** Optional array to collect audit entries. */
  auditLog?: AuditEntry[];
}

interface AuditEntry {
  /** ISO timestamp (HH:MM:SS) */
  time: string;
  /** Normalized domain */
  domain: string;
  /** URL (truncated to 80 chars) */
  url: string;
  /** Disposition */
  action: "ALLOWED" | "BLOCKED";
  /** Which policy decided, or "default" if all abstained */
  decidedBy: string;
}
```

### evaluatePolicies

Internal function that runs the policy chain.

```typescript
async function evaluatePolicies(
  policies: FirewallPolicy[],
  req: NavigationRequest,
  defaultVerdict: "allow" | "deny",
): Promise<{ verdict: "allow" | "deny"; decidedBy: string }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `policies` | `FirewallPolicy[]` | Ordered array of policies |
| `req` | `NavigationRequest` | The navigation being evaluated |
| `defaultVerdict` | `"allow" \| "deny"` | Fallback when all policies abstain |

Returns `{ verdict, decidedBy }` — the final decision and which policy made it.

### installDomainFirewall

```typescript
async function installDomainFirewall(
  page: Page,
  config: FirewallConfig,
): Promise<void>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | `Page` | Stagehand page object (from `stagehand.context.pages()[0]`) |
| `config` | `FirewallConfig` | Policy chain, default verdict, and optional audit log |

## Built-in Policies

### allowlist(domains)

```typescript
function allowlist(domains: string[]): FirewallPolicy
```

Returns `"allow"` if the domain is in the list, `"abstain"` otherwise. Domains are lowercased on construction.

| Parameter | Type | Description |
|-----------|------|-------------|
| `domains` | `string[]` | List of allowed domains |

**Policy name**: `"allowlist"`

### denylist(domains)

```typescript
function denylist(domains: string[]): FirewallPolicy
```

Returns `"deny"` if the normalized domain is in the list, `"abstain"` otherwise.

| Parameter | Type | Description |
|-----------|------|-------------|
| `domains` | `string[]` | List of denied domains |

**Policy name**: `"denylist"`

### pattern(globs, verdict)

```typescript
function pattern(globs: string[], verdict: "allow" | "deny"): FirewallPolicy
```

Matches the domain against glob patterns. `*` matches any sequence of characters.

| Parameter | Type | Description |
|-----------|------|-------------|
| `globs` | `string[]` | Glob patterns to match against domains (e.g. `"*.github.com"`) |
| `verdict` | `"allow" \| "deny"` | Verdict to return on match |

**Policy name**: `"pattern:allow"` or `"pattern:deny"`

**Glob examples**:
- `"*.github.com"` — matches `raw.githubusercontent.com`? No. Matches `api.github.com`? Yes.
- `"*.org"` — matches any `.org` domain
- `"evil-*"` — matches `evil-site.com`, `evil-phishing.net`, etc.

### tld(rules)

```typescript
function tld(rules: Record<string, "allow" | "deny">): FirewallPolicy
```

Checks the domain's TLD against a rules map. Keys must include the leading dot (e.g. `".org"`).

| Parameter | Type | Description |
|-----------|------|-------------|
| `rules` | `Record<string, "allow" \| "deny">` | Map of TLD to verdict |

**Policy name**: `"tld"`

### interactive(handler, opts?)

```typescript
function interactive(
  handler: (req: NavigationRequest) => Promise<"allow" | "deny">,
  opts?: { timeoutMs?: number; onTimeout?: "allow" | "deny"; remember?: boolean },
): FirewallPolicy
```

Calls the async handler for a human (or automated) decision. The request is held at the CDP level until the handler resolves. **Remembers decisions by default** — approved and denied domains are cached for the session so the handler is only called once per domain.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `handler` | `(req) => Promise<"allow" \| "deny">` | — | Async function that returns a verdict |
| `opts.timeoutMs` | `number` | `30000` | Timeout in milliseconds |
| `opts.onTimeout` | `"allow" \| "deny"` | `"deny"` | Verdict if handler times out |
| `opts.remember` | `boolean` | `true` | Cache verdicts per domain for the session. Set `false` to prompt every navigation. |

**Policy name**: `"interactive"`

### Custom Policies

Any object matching `FirewallPolicy` works. Example:

```typescript
const businessHours: FirewallPolicy = {
  name: "business-hours",
  evaluate: (req) => {
    const hour = new Date().getHours();
    // Only allow browsing during business hours
    return hour >= 9 && hour < 17 ? "abstain" : "deny";
  },
};
```

## CDP APIs

### Fetch.enable

Start intercepting network requests.

```typescript
await page.sendCDP("Fetch.enable", {
  patterns: [{ urlPattern: "*" }],
});
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `patterns` | `RequestPattern[]` | No | Which requests to intercept. `[{ urlPattern: "*" }]` intercepts all. |
| `handleAuthRequests` | `boolean` | No | If `true`, `Fetch.authRequired` events fire for 401/407 responses. |

### Fetch.requestPaused (event)

Fired for each intercepted request. The request is **held** until you call `continueRequest` or `failRequest`.

```typescript
const session = page.getSessionForFrame(page.mainFrameId());
session.on("Fetch.requestPaused", async (params) => { ... });
```

| Field | Type | Description |
|-------|------|-------------|
| `requestId` | `string` | Unique ID for this paused request |
| `request.url` | `string` | The full URL being requested |
| `request.method` | `string` | HTTP method |
| `request.headers` | `object` | Request headers |
| `resourceType` | `string` | Resource type (see [Resource Types](#resource-types)) |
| `frameId` | `string` | The frame that initiated the request |

### Fetch.continueRequest

Resume a paused request.

```typescript
await page.sendCDP("Fetch.continueRequest", { requestId: params.requestId });
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `requestId` | `string` | Yes | ID from `Fetch.requestPaused` |
| `url` | `string` | No | Override the request URL |
| `method` | `string` | No | Override the HTTP method |
| `headers` | `HeaderEntry[]` | No | Override request headers |

### Fetch.failRequest

Reject a paused request.

```typescript
await page.sendCDP("Fetch.failRequest", {
  requestId: params.requestId,
  errorReason: "BlockedByClient",
});
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `requestId` | `string` | Yes | ID from `Fetch.requestPaused` |
| `errorReason` | `string` | Yes | One of the [error reasons](#error-reasons) |

## Stagehand APIs

### page.sendCDP(method, params?)

Send any Chrome DevTools Protocol command.

| Parameter | Type | Description |
|-----------|------|-------------|
| `method` | `string` | CDP method name (e.g. `"Fetch.enable"`) |
| `params` | `object` | Method parameters (optional) |

### page.getSessionForFrame(frameId)

Get the CDP session for a given frame. Supports `.on(event, handler)` for CDP events.

| Parameter | Type | Description |
|-----------|------|-------------|
| `frameId` | `string` | Frame ID from `page.mainFrameId()` |

### page.mainFrameId()

Returns the frame ID of the page's main frame. No parameters.

## Error Reasons

Valid values for `errorReason` in `Fetch.failRequest`:

| Value | Recommended Use |
|-------|-----------------|
| `BlockedByClient` | **Default for domain firewall.** Client chose to block. |
| `AccessDenied` | Access denied (CORS, permissions). |
| `Failed` | Generic network failure. |
| `Aborted` | Request aborted. |
| `TimedOut` | Request timed out. |
| `ConnectionRefused` | Connection refused. |
| `NameNotResolved` | DNS resolution failed. |
| `InternetDisconnected` | No internet connection. |
| `AddressUnreachable` | Address unreachable. |
| `BlockedByResponse` | Blocked by response headers. |

## Resource Types

The domain firewall filters to `Document` only — all other types pass through.

| Type | Description | Firewall Action |
|------|-------------|-----------------|
| `Document` | Page navigations (HTML documents) | **Evaluate policy chain** |
| `Stylesheet` | CSS files | Pass through |
| `Image` | Images | Pass through |
| `Media` | Audio/video | Pass through |
| `Font` | Web fonts | Pass through |
| `Script` | JavaScript files | Pass through |
| `XHR` | XMLHttpRequest | Pass through |
| `Fetch` | Fetch API requests | Pass through |
| `WebSocket` | WebSocket connections | Pass through |
| `Other` | Unclassified | Pass through |

## Security Considerations

### Why Fetch.enable is the right layer

| Approach | Catches goto() | Catches link clicks | Catches redirects | Catches JS navigation |
|----------|---------------|--------------------|--------------------|----------------------|
| App-level URL check before `goto()` | Yes | No | No | No |
| `page.on("request")` (Playwright) | Yes | Yes | Some | Some |
| **`Fetch.enable` (CDP)** | **Yes** | **Yes** | **Yes** | **Yes** |

### Limitations

- **Same-origin iframes**: Navigations within iframes may use a different frame ID. Install the firewall on each frame if needed.
- **Service workers**: Requests handled entirely by a service worker may not trigger `Fetch.requestPaused`.
- **Session lifecycle**: The CDP session is tied to the frame. If the page crashes, reinstall the firewall.
- **Policy evaluation time**: The `interactive` policy holds the request while waiting for a human. Implement timeouts for production use.
