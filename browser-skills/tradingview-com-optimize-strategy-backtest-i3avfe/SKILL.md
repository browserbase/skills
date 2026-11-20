---
name: tradingview-com-optimize-strategy-backtest-i3avfe
title: TradingView Strategy Backtest Optimizer
description: >-
  Iteratively optimize a Pine Script strategy in TradingView: paste code into
  the Pine Editor, compile onto the chart, read Strategy Tester metrics, and
  tune inputs to minimize Max Equity Drawdown while maximizing Net Return.
  Requires an authenticated TradingView session.
website: tradingview.com
category: trading
tags:
  - trading
  - backtesting
  - pine-script
  - optimization
  - finance
  - read-only
  - auth-required
source: 'browserbase: agent-runtime 2026-06-10'
updated: '2026-06-10'
recommended_method: browser
alternative_methods:
  - method: browser
    rationale: >-
      The Pine Editor and Strategy Tester have no public API, URL deep-link, or
      MCP — the chart is the only surface. A bare remote session loads it (no
      anti-bot), but compiling any custom script onto the chart is gated behind
      TradingView sign-in, so a pre-authenticated browser context is mandatory.
verified: false
proxies: false
---
# TradingView Strategy Backtest Optimizer

## Purpose

Drive the TradingView web chart end-to-end to iteratively optimize a Pine Script® strategy: open the Pine Editor, replace its contents with your strategy code, compile it onto the chart, read the Strategy Tester's backtest metrics, adjust the strategy's inputs, and repeat — searching for a parameter set that **minimizes Max Equity Drawdown** while **maximizing Net Return**. This is an agentic optimization loop, not a one-shot extraction: each iteration produces a (params → metrics) data point, and the agent does coordinate/grid search across the strategy's inputs to converge on the best risk-adjusted configuration.

**Read-only with respect to the user's account** (never Publish, never Save to the public library, never place a real Trade) — but it *does* require an authenticated TradingView session, because compiling any custom script onto the chart is gated behind sign-in.

## When to Use

- "Backtest this Pine strategy on AAPL/BTCUSD/ES and tune it for the best return-to-drawdown ratio."
- "Find MA-length + stop-loss settings that keep max drawdown under X% while staying net-profitable."
- Sweeping a strategy's `input.*` parameters and recording Net Profit / Max Equity Drawdown for each combination.
- Any flow that needs Strategy Tester metrics for a custom script. (Built-in indicator screening is a different, lighter task.)

## Workflow

`recommended_method: browser`. There is **no public API, URL deep-link, or MCP** for the Pine Editor or Strategy Tester — the chart is a heavyweight canvas/WebSocket app and the only surface. A bare (no-proxy, no-stealth) remote session loads the chart fine; no anti-bot was encountered. The one hard precondition is **authentication** (see Gotchas — every "Add to chart" path triggers a sign-in wall for a guest).

### 0. Precondition: be logged in

Reuse an authenticated browser context (persisted cookies / `browse cloud contexts`, or a session that has already completed TradingView sign-in). A guest session can open the chart and the Pine Editor and paste code, but **cannot compile a script onto the chart** — see Gotchas. Without a logged-in session this task cannot reach a single backtest metric.

### 1. Open the chart

```bash
sid=$(browse cloud sessions create --keep-alive | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$sid"
browse open "https://www.tradingview.com/chart/" --remote
browse wait load --remote
# the canvas keeps streaming; give it a few seconds
sleep 5
```

Set the symbol/timeframe you want to backtest on *before* adding the strategy (top-left symbol search + the interval button, e.g. `button: 1 day`). The Strategy Tester backtests against whatever symbol+interval is loaded.

### 2. Open the Pine Editor

The editor is a right-rail toggle, **not** a bottom-footer tab on the default layout. `browse snapshot` and find `button: Pine` (the right-side icon rail) and click it:

```bash
browse snapshot --remote          # locate `button: Pine`
browse click "@<ref-for-Pine>" --remote
sleep 3
```

The editor opens with a default `//@version=6 / indicator("My script") / plot(close)` stub. The editable area is a Monaco editor exposed as `textbox: Editor content;Press Alt+F1 for Accessibility Options.`

### 3. Replace the editor contents via clipboard paste (do NOT type)

`window.monaco` is **not** exposed on the page, so you cannot `setValue()` the model directly. Typing char-by-char corrupts code (Monaco auto-indents and auto-closes brackets). The reliable method is **clipboard paste**, which preserves indentation exactly (verified):

```bash
# 1. put your Pine source on the clipboard (base64 dodges shell-quoting hell)
B64=$(base64 -w0 my_strategy.pine)
browse eval "navigator.clipboard.writeText(atob('$B64')).then(()=>'ok')" --remote
# 2. focus editor, select-all, paste
browse click "@<ref-for-Editor-content>" --remote
browse press "ControlOrMeta+a" --remote
browse press "ControlOrMeta+v" --remote
sleep 1
```

Your script **must declare `strategy(...)`, not `indicator(...)`** — only `strategy` scripts produce Strategy Tester output. A solid optimizable baseline:

```pine
//@version=6
strategy("DD-Opt MA Cross", overlay=true, initial_capital=10000, default_qty_type=strategy.percent_of_equity, default_qty_value=100, commission_type=strategy.commission.percent, commission_value=0.05)
fastLen  = input.int(20, "Fast MA")
slowLen  = input.int(50, "Slow MA")
stopPerc = input.float(5.0, "Stop Loss %") / 100.0
fast = ta.sma(close, fastLen)
slow = ta.sma(close, slowLen)
if ta.crossover(fast, slow)
    strategy.entry("Long", strategy.long)
if ta.crossunder(fast, slow)
    strategy.close("Long")
strategy.exit("SL", "Long", stop=strategy.position_avg_price * (1.0 - stopPerc))
```

Exposing your tuning levers as `input.*` is what enables the fast loop in step 6.

### 4. Compile onto the chart

```bash
browse snapshot --remote          # locate `button: Add to chart`
browse click "@<ref-for-Add-to-chart>" --remote   # or: browse press "ControlOrMeta+Enter"
sleep 4
```

If a compile error exists, the editor's bottom console shows a red error line — read it, fix the source, re-paste (step 3), re-add. **If you are not logged in, this is where a "Sign in" modal appears instead** (Google/Email). Authenticate, then retry.

### 5. Read the Strategy Tester metrics

Once a strategy is on the chart, a **Strategy Tester** panel/footer-tab appears. Open it and read the Overview tab. The metrics that matter for this task:

- **Net Profit / Total P&L** (absolute and % of initial capital) → the "high net return" objective.
- **Max Equity Drawdown** (labeled "Max Drawdown" / "Max equity drawdown", absolute and %) → the "low drawdown" objective.
- Supporting: Total Closed Trades, Percent Profitable, Profit Factor.

Extract with `browse get text body --remote` (or scope to the tester panel) and parse the labeled numbers. Screenshot the Overview for the record.

### 6. Optimize: adjust → re-run → keep the best

Define a single scalar objective so the search is well-posed. Recommended: **return-to-drawdown ratio = Net Profit % ÷ Max Equity Drawdown %** (maximize), optionally with a hard constraint like "Max DD% ≤ 20". Then do coordinate/grid search over the inputs:

1. Pick one input to vary (e.g. `Stop Loss %`).
2. **Change it via the chart's Inputs dialog, not by re-editing code** — far faster: click the strategy name in the chart legend → gear/Settings → **Inputs** tab → change the value → OK. The backtest re-runs automatically. (Re-pasting code in the editor also works but re-compiles the whole script.)
3. Re-read step 5's metrics; record `(params, net_profit_pct, max_dd_pct, ratio)`.
4. Move to the next value / next input. Keep the best-scoring configuration.

Effective levers for **lowering Max Equity Drawdown** without killing return:
- **Tighten the stop-loss** (`stopPerc`) — directly caps per-trade loss; the single biggest DD lever.
- **Add a trend filter** (e.g. only go long when `close > ta.sma(close, 200)`) — cuts counter-trend whipsaw losses.
- **Reduce position size** (`default_qty_value` < 100% of equity) — scales DD down proportionally.
- **Add a take-profit / ATR-based trailing stop** to lock gains.
- **Widen/narrow MA lengths** — longer slow MA = fewer, higher-conviction trades = usually lower DD but lower trade count.

Stop when the objective plateaus across a full pass of input changes. **Guard against overfitting**: validate the winning params on a second symbol or timeframe before reporting; report that the result is in-sample if you didn't.

### 7. Release

```bash
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **AUTH IS A HARD GATE on "Add to chart".** Verified in this build run on a guest session: both the **Add to chart** button and the **Ctrl/Cmd+Enter** shortcut immediately raise a TradingView "Sign in" modal (Continue with Google / Email). A guest can open the chart, open the Pine Editor, and paste/edit code, but **cannot compile a script onto the chart and therefore cannot reach a single Strategy Tester metric.** This task requires a pre-authenticated session. *(Everything from step 4 onward was documented from TradingView product behavior and not exercised in the build run, because no account was available — verify exact metric label strings on your first authenticated run.)*
- **No anti-bot on the chart itself.** A **bare** remote session (no `--proxies`, no `--verified`) loaded `https://www.tradingview.com/chart/` cleanly and ran the editor — `verified:false, proxies:false`. The homepage 301-redirects to `www`; open `www.tradingview.com/chart/` directly.
- **`window.monaco` is undefined.** The Pine Editor is Monaco-based but the global is not exposed, so you cannot `monaco.editor.getModels()[0].setValue(code)`. Use clipboard paste.
- **Never type code char-by-char.** Monaco auto-indents and auto-inserts closing brackets/quotes; typing a multi-line script mangles it. **Clipboard paste (`Ctrl+A` then `Ctrl+V`) preserves indentation exactly** — verified, the pasted 15-line script kept its `if`-body indentation. `navigator.clipboard.writeText()` works inside Browserbase sessions (clipboard read/write permission is granted).
- **The Pine Editor is a right-rail toggle, not a bottom footer tab** on the default chart layout. Look for `button: Pine` in the right icon rail. (The bottom footer only exposes `Screeners`/`Pine` shortcut buttons.) The **Strategy Tester** tab only materializes *after* a strategy is successfully added to the chart.
- **`strategy(...)` vs `indicator(...)`.** The default editor stub is an `indicator`, which produces NO backtest. Your script must declare `strategy(...)` or the Strategy Tester stays empty.
- **Set symbol + interval BEFORE adding the strategy.** The backtest runs against the currently loaded symbol/timeframe; changing them after re-runs the test (good for cross-validation, but be deliberate).
- **Prefer the Inputs dialog over code edits for the optimization loop.** Re-pasting code recompiles the whole script; changing `input.*` values via the chart legend → Settings → Inputs re-runs the backtest much faster. This is why your tuning levers should be `input.*` parameters.
- **Free-tier backtest depth is limited** (bars available depend on plan; "Deep Backtesting" is a paid feature). Net Profit / Max DD are computed only over the visible/available history — keep the symbol+interval fixed across an optimization pass so comparisons are apples-to-apples.
- **Don't Publish or Save.** "Publish script" pushes to the public library and "Save script" writes to the user's account — neither is needed to backtest. Stay read-only.
- **Metric label naming has drifted.** Older UI: "Net Profit" / "Max Drawdown"; newer Overview: "Total P&L" / "Max equity drawdown". Match on the substring, not an exact string, and capture both the absolute and the `%` value.

## Expected Output

The optimizer returns the best configuration found plus the search log. Two shapes:

```json
// Success — authenticated, loop converged
{
  "success": true,
  "symbol": "NASDAQ:AAPL",
  "interval": "1D",
  "objective": "net_profit_pct / max_equity_drawdown_pct",
  "best": {
    "inputs": { "Fast MA": 20, "Slow MA": 100, "Stop Loss %": 3.0 },
    "net_profit_abs": 4120.50,
    "net_profit_pct": 41.21,
    "max_equity_drawdown_abs": 1180.00,
    "max_equity_drawdown_pct": 9.84,
    "return_to_drawdown": 4.19,
    "total_closed_trades": 37,
    "percent_profitable": 51.35,
    "profit_factor": 1.92
  },
  "iterations": [
    { "inputs": { "Fast MA": 20, "Slow MA": 50, "Stop Loss %": 5.0 }, "net_profit_pct": 28.4, "max_equity_drawdown_pct": 17.2, "return_to_drawdown": 1.65 },
    { "inputs": { "Fast MA": 20, "Slow MA": 100, "Stop Loss %": 5.0 }, "net_profit_pct": 35.1, "max_equity_drawdown_pct": 12.0, "return_to_drawdown": 2.93 },
    { "inputs": { "Fast MA": 20, "Slow MA": 100, "Stop Loss %": 3.0 }, "net_profit_pct": 41.21, "max_equity_drawdown_pct": 9.84, "return_to_drawdown": 4.19 }
  ],
  "in_sample_only": true
}

// Blocked — no authenticated session available
{
  "success": false,
  "reason": "auth_required",
  "detail": "Add to chart triggers a TradingView sign-in modal; guest sessions cannot compile a strategy or read Strategy Tester metrics. Provide a logged-in browser context."
}
```
