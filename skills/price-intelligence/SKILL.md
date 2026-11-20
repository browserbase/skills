---
name: price-intelligence
description: Compares an arbitrary user-supplied item across Amazon, Target, Walmart, Best Buy, and eBay in parallel paid browser sessions, displays the live searches in a local grid, and recommends the cheapest eligible exact match. Use when the user asks for a live multi-retailer price comparison, wants the cheapest place to buy a product, or invokes price-intelligence with an item.
license: MIT
compatibility: "Requires Node.js 20+, the browse CLI, Tempo CLI with the request and wallet extensions, a funded Tempo wallet, and network access. Opening the local viewer automatically requires a desktop browser."
allowed-tools: Bash Read Grep Agent
---

# Price Intelligence

Run a paid five-retailer comparison for the exact item in the current request. End with a recommendation and direct product link; never proceed to checkout or purchase the retail item.

## Guardrails

- Require a non-empty item query. If it is missing, ask for the item and stop.
- Preserve the user's wording. Do not substitute a remembered product, silently add a model, or narrow the requested condition.
- Before creating sessions, disclose that the standard run authorizes up to `0.02 USDC.e` for each of five sessions (`0.10 USDC.e` principal total) plus network fees. Ask for confirmation unless the current request explicitly authorizes that paid run.
- Never print or return the Tempo wallet response, Browserbase API key, MPP response, session identifiers, `connectUrl`, `liveUrl`, debugger URL, cookies, or authentication tokens.
- Treat every connection and live-view URL as a secret capability URL. Keep it inside the controller state and local viewer only.
- Never request fewer than five minutes. The standard comparison uses five ten-minute sessions.
- Do not buy the retail item. Checkout requires a separate, explicit user request after this skill has finished and cleaned up.

## 1. Resolve the controller and check prerequisites

Set `SKILL_DIR` to the absolute directory containing this `SKILL.md`, then define the controller path:

```bash
SKILL_DIR="<absolute-path-to-price-intelligence>"
PRICE_INTELLIGENCE_CONTROLLER="$SKILL_DIR/scripts/controller.mjs"
```

Verify the public dependencies without printing wallet identity or secrets:

```bash
node --version
browse --version
tempo request --version
tempo wallet --version
```

If a dependency is missing, tell the user which command is unavailable and stop. Do not install payment or wallet software without permission.

## 2. Start five paid browsers

After the payment confirmation described above, launch the controller asynchronously:

```bash
node "$PRICE_INTELLIGENCE_CONTROLLER" start \
  --minutes 10 \
  --count 5 <<'PRICE_INTELLIGENCE_START'
{"item":"<JSON-escaped exact user-supplied item>"}
PRICE_INTELLIGENCE_START
```

Keep the heredoc delimiter single-quoted and serialize the item as valid one-line JSON. Never interpolate the item into a shell argument: product text can contain shell metacharacters.

Use the host shell's background or asynchronous execution mode. Do not append `&`, pipe through `head` or `tail`, or redirect stdout. Preserve the background task/session handle so new output can be polled.

Relay only these safe progress lines:

- each `[payment n/5] ... confirmed` line;
- the `[payments] Complete` line;
- the `[browsers]` attachment phase;
- the localhost `Live comparison: http://127.0.0.1:...` address.

If startup produces no new output for 15 seconds, inspect safe status instead of guessing:

```bash
node "$PRICE_INTELLIGENCE_CONTROLLER" status --run current
```

The controller does not discover or load `.env` files. It gives payment and browser subprocesses a minimal environment containing platform basics, proxy/certificate settings, and only `TEMPO_`, `BROWSERBASE_`, or `BB_` configuration; unrelated exported credentials are excluded. Advanced users can set `TEMPO_BIN` or `BROWSE_BIN` explicitly before starting the run.

Never restart a partially paid run. The controller rejects a second active run; inspect it with `status` and clean up that run before retrying.

## 3. Search the five retailers in parallel

Wait for startup to print the viewer address and exit successfully. Assign one worker to each existing Browse session, using parallel agents when available and independent batches otherwise:

| Slot | Retailer | Browse session |
| --- | --- | --- |
| 1 | Amazon | `price-intel-amazon` |
| 2 | Target | `price-intel-target` |
| 3 | Walmart | `price-intel-walmart` |
| 4 | Best Buy | `price-intel-bestbuy` |
| 5 | eBay | `price-intel-ebay` |

Give each worker only the exact item query, retailer, slot, Browse session name, controller path, and recording contract below. Tell every worker:

- Do not invoke this skill.
- Do not create, purchase, attach, or stop browser sessions.
- Operate only the assigned Browse session and record exactly one result.
- Include `--session <assigned-session>` on every `browse` command. Do not pass `--remote`, `--local`, or `--cdp` because the controller already attached the daemon.

Each worker must:

1. Open its retailer's trusted HTTPS homepage through the controller's stdin-safe browser action:

   ```bash
   node "$PRICE_INTELLIGENCE_CONTROLLER" browse --run current <<'PRICE_INTELLIGENCE_BROWSE'
   {"session":"<assigned-session>","action":"open","url":"<JSON-escaped HTTPS URL>"}
   PRICE_INTELLIGENCE_BROWSE
   ```

2. Use only read-only `browse snapshot` and `browse get` commands with the assigned static session name. Enter the item through the controller so it never becomes shell code:

   ```bash
   node "$PRICE_INTELLIGENCE_CONTROLLER" browse --run current <<'PRICE_INTELLIGENCE_BROWSE'
   {"session":"<assigned-session>","action":"fill","selector":"<snapshot-ref>","value":"<JSON-escaped exact item>","pressEnter":true}
   PRICE_INTELLIGENCE_BROWSE
   ```

   Use the same `open` action for every page-derived URL; do not navigate with a direct `browse open` or `browse click`. Do not interpolate user input, page text, selectors, or URLs into shell arguments. The controller passes decoded fields directly as process arguments, accepts only `open` and `fill`, and rejects a URL outside the assigned retailer's domain.

3. Identify the closest exact product rather than an accessory, sponsored near-match, bundle, or different model.
4. Capture the direct product URL, visible item price, currency, condition, seller, and availability.
5. Set `eligible=true` only when the listing is an exact enough match, currently purchasable, in the requested condition, and sold by the retailer or a marketplace seller with credible visible history.
6. Try one sensible alternate path after an anti-bot or loading failure, then record the failure instead of looping.
7. Record one result as valid one-line JSON through the quoted heredoc:

```bash
node "$PRICE_INTELLIGENCE_CONTROLLER" record --run current <<'PRICE_INTELLIGENCE_RESULT'
{"slot":<slot>,"price":<number-or-null>,"currency":"USD","availability":"<in_stock|out_of_stock|backordered|blocked|unknown>","exactMatch":<true|false>,"eligible":<true|false>,"condition":"<new|used|refurbished|unknown>","seller":"<JSON-escaped seller or empty>","title":"<JSON-escaped title or empty>","url":"<JSON-escaped direct HTTPS product URL or empty>","evidence":"<JSON-escaped short factual sentence>","error":"<JSON-escaped short error or empty>"}
PRICE_INTELLIGENCE_RESULT
```

The controller rejects an eligible result unless it is an exact match, `in_stock`, priced in USD, and has a direct HTTPS URL on the assigned retailer's domain. This is also rechecked when ranking, so inconsistent or off-retailer data cannot become the recommendation.

The localhost grid polls these result files and updates while the workers search.

## 4. Report and clean up

After all five workers record a result, run:

```bash
node "$PRICE_INTELLIGENCE_CONTROLLER" report --run current
```

`report` prints the comparison, chooses the lowest-priced eligible exact match, stops the five Browse daemons, deletes the paid MPP sessions, stops the localhost viewer, and scrubs stored capability URLs. Successfully deleted session identifiers are removed; a failed deletion keeps only the private gateway ID needed for `stop` to retry.

If the payment provider returns malformed data without any usable session identifier, the controller cannot target a session for deletion. It retains that response in the mode-restricted run directory for diagnosis, reports `stopped_with_warning`, and allows future runs instead of permanently locking the skill. Tell the user to inspect their provider dashboard for an unidentified session; never print the retained response.

Show the stdout table and cleanup confirmation. Return the recommended retailer and direct product link. If no exact purchasable result exists, say so rather than promoting an out-of-stock, uncertain, or ineligible listing.

The controller does not close the user's native viewer tab; the disconnected localhost page can be closed manually.

## 5. Clean up an aborted run

If startup or searching is interrupted before `report` completes, run:

```bash
node "$PRICE_INTELLIGENCE_CONTROLLER" stop --run current
```

Do not leave paid sessions active and do not ask whether cleanup is desired.

## Invocation syntax

- Claude Code: `/price-intelligence <item>`
- Codex: `$price-intelligence <item>`

Codex reserves slash commands for built-ins, so `$price-intelligence` is the Codex spelling.
