# What Antibot Examples

Common workflows for checking antibot and challenge-provider markers.

## Example 1: Check One Site

**User request**: "What antibot is on example.com?"

```bash
node scripts/detect.mjs example.com
```

Report the table directly. If the row says `no antibot detected`, phrase it as a best-effort result from a single HTTP probe.

## Example 2: Compare Multiple Sites

**User request**: "Check what antibot these sites use: nike.com, zocdoc.com, ticketmaster.com"

```bash
node scripts/detect.mjs nike.com,zocdoc.com,ticketmaster.com
```

or:

```bash
node scripts/detect.mjs nike.com zocdoc.com ticketmaster.com
```

Use the grouped table to compare vendors across targets. Multiple detections can appear for one URL when a page includes more than one protection or challenge provider.

## Example 3: Distinguish Errors From Clean Negatives

**User request**: "Tell me if this staging domain has bot protection."

```bash
node scripts/detect.mjs staging.example.invalid
```

If the detector prints an `ERROR` column, do not treat that as `no antibot detected`. Explain that the probe did not reach a usable response and include the error text.

## Example 4: Escalate To A Browser Session

**User request**: "It says Cloudflare. Can you get the actual page content?"

Use `what-antibot` to identify the likely protection layer, then switch to the `browser` skill for a real browser session:

```bash
browse env remote
browse open https://example.com
browse snapshot
```

If the target blocks simple fetches, a browser session with Browserbase stealth, proxies, and CAPTCHA solving is the right next step.
