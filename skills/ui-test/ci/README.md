# ui-test CI Integration

Run adversarial UI testing automatically on every PR that touches frontend files.

## Architecture

```
PR opened → preview deploys (Vercel/Netlify) → GitHub Action triggers
  → Claude Code (headless, --print mode) reads diff, plans tests
  → browse CLI → Browserbase cloud browser tests the preview URL
  → results posted as PR comment + HTML report uploaded as artifact
```

## Setup

### 1. Copy the workflow

```bash
cp skills/ui-test/ci/ui-test.yml .github/workflows/ui-test.yml
```

### 2. Add secrets

In your repo settings → Secrets and variables → Actions:

| Secret | Required | Description |
|--------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `BROWSERBASE_API_KEY` | Yes | Browserbase API key for cloud browsers |

### 3. Configure preview deploy detection

The workflow defaults to **Vercel** preview detection. Edit the `wait-for-preview` job in `ui-test.yml` if you use Netlify, Cloudflare Pages, or a custom preview system. See the commented alternatives in the file.

### 4. (Optional) Configure variables

In repo settings → Secrets and variables → Actions → Variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `UI_TEST_MODE` | `light` | `light` = 2 agents, 20 steps each. `full` = 4 agents, 40 steps each |
| `UI_TEST_MAX_TOKENS` | `100000` | Max token budget per run |

## How it works

1. **Gate** — `paths-filter` checks if the PR touches UI files (`.tsx`, `.css`, etc.). Skips entirely if no UI changes.
2. **Wait** — Waits for the preview deployment to be ready (up to 5 minutes).
3. **Test** — `run-ui-test.sh` invokes Claude Code in `--print` mode with:
   - The git diff of changed UI files
   - The preview URL
   - Mode-specific instructions (light vs full)
4. **Report** — Posts a summary comment on the PR and uploads the HTML report as a GitHub Actions artifact.
5. **Gate** — Exits non-zero if any test failed, so you can make it a required check.

## Local testing

Test the CI flow locally before deploying to GitHub Actions:

```bash
skills/ui-test/ci/run-ui-test.sh \
  --url http://localhost:3000 \
  --local \
  --mode light
```

The `--local` flag skips the diff gate (no PR needed) and uses `browse env local` instead of remote. Results go to `.context/ui-test-summary.md`.

## Cost estimate

| Mode | Agents | Steps/agent | Estimated cost |
|------|--------|-------------|----------------|
| `light` | 2 | 20 | ~$0.50–$2 per run |
| `full` | 4 | 40 | ~$2–$5 per run |

These are rough estimates. Actual cost depends on diff size and number of pages tested.

## Customization

### Only run on labeled PRs

Add a condition to the workflow:

```yaml
on:
  pull_request:
    types: [labeled]

jobs:
  check-ui-changes:
    if: contains(github.event.pull_request.labels.*.name, 'ui-test')
```

### Adjust file filters

Edit the `paths-filter` step in `ui-test.yml` to match your project structure.

### Fail threshold

By default, any STEP_FAIL causes a non-zero exit. To allow a pass rate threshold instead, modify the exit code logic in `run-ui-test.sh`.
