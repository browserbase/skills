# AutoBrowse Reference

## evaluate.mjs flags

```bash
node ${CLAUDE_SKILL_DIR}/scripts/evaluate.mjs --task <name> [options]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--task <name>` | required | Task name — matches `tasks/<name>/` directory |
| `--env local\|remote` | `local` | Browser environment |
| `--provider anthropic\|openai` | `anthropic` | Model provider for the inner agent |
| `--model <model>` | provider-specific | Model for the inner agent (`claude-sonnet-4-6` for Anthropic, `gpt-4.1` for OpenAI-compatible) |
| `--run-number N` | auto-increment | Force a specific run number |

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTOBROWSE_PROVIDER` | No | `anthropic` or `openai`; same as `--provider` |
| `AUTOBROWSE_MODEL` | No | Default model when `--model` is omitted |
| `ANTHROPIC_API_KEY` | Anthropic only | Claude API key |
| `OPENAI_API_KEY` | OpenAI-compatible only | API key for OpenAI, OpenRouter, LiteLLM, etc. |
| `OPENAI_BASE_URL` | No | OpenAI-compatible `/v1` base URL; defaults to `https://api.openai.com/v1` |
| `OPENAI_ORGANIZATION` | No | Optional OpenAI organization header |
| `OPENAI_SITE_URL` | No | Optional `HTTP-Referer` header for gateways such as OpenRouter |
| `OPENAI_APP_NAME` | No | Optional `X-Title` header for gateways such as OpenRouter |
| `BROWSERBASE_API_KEY` | Remote only | Browserbase API key |
| `BROWSERBASE_PROJECT_ID` | Remote only | Browserbase project ID |

## Trace artifacts

Each run writes to `traces/<task>/run-NNN/`:

| File | Description |
|------|-------------|
| `summary.md` | Duration, cost, turn-by-turn decision log, final output |
| `trace.json` | Full tool call log — every command and response |
| `messages.json` | Raw normalized message history |
| `screenshots/` | Visual captures saved during the run |

`traces/<task>/latest` is a symlink to the most recent run.

## Models

| Model | Cost | Best for |
|-------|------|----------|
| `claude-sonnet-4-6` | $$ | Default — good balance of speed and accuracy |
| `claude-opus-4-6` | $$$$ | Hardest tasks, complex multi-step workflows |
| `claude-haiku-4-5-20251001` | $ | Simple tasks, high-volume iteration |
| `gpt-4.1` | $$ | Default for OpenAI-compatible mode |
| `gpt-4.1-mini` | $ | Lower-cost OpenAI-compatible iteration |

## Skill lifecycle

```
task.md        → input (you write this, don't edit after)
strategy.md    → working file (auto-improved each iteration)
skill.md       → output (graduated from strategy.md when ready to ship)
```

A task is ready to graduate when it passes on 2+ of the last 3 consecutive runs.
