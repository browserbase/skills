# Browserbase Skills

A set of skills for enabling **[Claude Code](https://docs.claude.com/en/docs/claude-code/overview)** to work with Browserbase through browser automation and the official `bb` CLI.

## Skills

This plugin includes the following skills (see `skills/` for details):

| Skill | Description |
|-------|-------------|
| [autobrowse](skills/autobrowse/SKILL.md) | Self-improving browser automation that reads traces and iteratively hardens task-specific navigation skills until they pass reliably |
| [browser](skills/browser/SKILL.md) | Automate web browser interactions via CLI commands — supports remote Browserbase sessions with anti-bot stealth, CAPTCHA solving, and residential proxies |
| [browser-trace](skills/browser-trace/SKILL.md) | Capture a full DevTools-protocol trace (CDP firehose, screenshots, DOM dumps) alongside any browser automation, then bisect the stream into per-page searchable buckets |
| [browserbase-cli](skills/browserbase-cli/SKILL.md) | Use the official `bb` CLI for Browserbase Functions and platform API workflows including sessions, projects, contexts, extensions, fetch, and dashboard |
| [company-research](skills/company-research/SKILL.md) | Discover and deeply research ICP-fit companies with Browserbase Search API, then compile scored research reports and CSVs |
| [cookie-sync](skills/cookie-sync/SKILL.md) | Sync cookies from local Chrome to a Browserbase persistent context so the browse CLI can access authenticated sites |
| [event-prospecting](skills/event-prospecting/SKILL.md) | Turn conference speaker or sponsor pages into ranked outreach leads by filtering companies against an ICP and researching matched people |
| [fetch](skills/fetch/SKILL.md) | Fetch HTML or JSON from static pages without a browser session — inspect status codes, headers, follow redirects |
| [functions](skills/functions/SKILL.md) | Deploy serverless browser automation to Browserbase cloud using the `bb` CLI |
| [search](skills/search/SKILL.md) | Search the web and return structured results (titles, URLs, metadata) without a browser session |
| [ui-test](skills/ui-test/SKILL.md) | AI-powered adversarial UI testing — analyzes git diffs to test changes, or explores the full app to find bugs |

## Installation

To install the skill to popular coding agents:

```bash
$ npx skills add browserbase/skills
```

### Claude Code

On Claude Code, to add the marketplace, simply run:

```bash
/plugin marketplace add browserbase/skills
```

Then install the plugin:

```bash
/plugin install browse@browserbase
```

If you prefer the manual interface:
1. On Claude Code, type `/plugin`
2. Select option `3. Add marketplace`
3. Enter the marketplace source: `browserbase/skills`
4. Press enter to select the `browse` plugin
5. Hit enter again to `Install now`
6. **Restart Claude Code** for changes to take effect

## Usage

Once installed, you can ask Claude to browse or use the Browserbase CLI:
- *"Go to Hacker News, get the top post comments, and summarize them "*
- *"QA test http://localhost:3000 and fix any bugs you encounter"*
- *"Order me a pizza, you're already signed in on Doordash"*
- *"Use `bb` to list my Browserbase projects and show the output as JSON"*
- *"Initialize a new Browserbase Function with `bb functions init` and explain the next commands"*

Claude will handle the rest.

For local and localhost work, `browse env local` now starts a clean isolated browser by default. Use `browse env local --auto-connect` when the agent should reuse your existing local Chrome session, cookies, or login state.

## Troubleshooting

### Chrome not found

Install Chrome for your platform:
- **macOS** or **Windows**: https://www.google.com/chrome/
- **Linux**: `sudo apt install google-chrome-stable`

### Profile refresh

To refresh cookies from your main Chrome profile:
```bash
rm -rf .chrome-profile
```

## Resources

- [Stagehand Documentation](https://github.com/browserbase/stagehand)
- [Claude Code Skills](https://support.claude.com/en/articles/12512176-what-are-skills)
