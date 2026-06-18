# Contributing

This repo is Browserbase's public collection of agent skills — the skills we ship to users via `npx skills add browserbase/skills` and the Claude Code plugin marketplace. Every skill must meet the standards below; CI enforces the machine-checkable ones.

## Skill anatomy

Each skill lives in `skills/<name>/`:

```
skills/<name>/
├── SKILL.md        # required — frontmatter + instructions
├── LICENSE.txt     # required — MIT, Browserbase, Inc.
├── REFERENCE.md    # optional — full API/flag reference
├── EXAMPLES.md     # optional — worked examples
├── references/     # optional — additional docs loaded on demand
└── scripts/        # optional — helper scripts
```

Keep `SKILL.md` focused on what the agent needs to act (under ~500 lines). Move exhaustive flag tables, schemas, and edge cases into `REFERENCE.md` or `references/` — agents load those on demand (progressive disclosure). Don't add a "When to use" body section that repeats the frontmatter description.

## Required frontmatter

| Field | Required | Rules |
|-------|----------|-------|
| `name` | yes | Must equal the directory name |
| `description` | yes | Non-empty, max 1024 chars. Third person, states what the skill does *and* when to use it, with concrete triggers — see the [agentskills.io spec](https://agentskills.io/specification) |
| `license` | yes | Exactly `MIT` |
| `compatibility` | recommended | Runtime requirements: CLIs, env vars, Node version |
| `allowed-tools` | recommended | Tools the skill needs, e.g. `Bash Read Grep` |

Example:

```yaml
---
name: browser-trace
description: Capture a full DevTools-protocol trace of any browser automation — CDP firehose, screenshots, and DOM dumps — then bisect the stream into per-page searchable buckets. Use when the user wants to debug a failed run, audit network/console/DOM activity, or attach a trace to an in-progress session.
license: MIT
compatibility: "Requires Node 18+ and the browse CLI (`npm install -g browse`)."
allowed-tools: Bash, Read, Grep
---
```

## License

Every skill dir must contain a `LICENSE.txt` with the MIT license and the copyright line `Copyright (c) 2026 Browserbase, Inc.` — contributions are accepted under these terms. Copy one from an existing skill.

## README table

Add a row for your skill to the table in `README.md`, linking `skills/<name>/SKILL.md`. CI fails on missing rows and on rows pointing at skills that no longer exist.

## Scripts

- Prefer zero-dependency `.mjs` scripts using only `node:` builtins.
- A `package.json` is allowed when dependencies are genuinely needed.
- Never commit secrets, `.env*` files, `node_modules/`, `setup.json`, or personal local paths (e.g. `/Users/<you>/...`).

## Evals

Add an `evals/evals.json` with a few realistic prompts and expected behaviors so the skill can be regression-tested — see [evaluating skills](https://agentskills.io/skill-creation/evaluating-skills).

## What reviewers check that CI can't

- **Commands actually work** — every documented command must exist and run against the real CLI. Test them; don't document from memory.
- **Description quality** — would an agent reading only the description know when to fire this skill?
- **Progressive disclosure** — SKILL.md is lean; depth lives in REFERENCE.md/references/.
- **No redundancy** — no body section restating the frontmatter description.

## Validate locally

```bash
node scripts/validate-skills.mjs                 # all skills
node scripts/validate-skills.mjs --skill <name>  # just yours
```

CI runs the same script on every PR; errors fail the build, warnings don't.
