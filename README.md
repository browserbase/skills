# Browserbase Skills

A set of skills for enabling **[Claude Code](https://docs.claude.com/en/docs/claude-code/overview)** to work with Browserbase through browser automation and the official `browse` CLI.

## Skills

This plugin includes the following skills (see `skills/` for details):

| Skill | Description |
|-------|-------------|
| [browser](skills/browser/SKILL.md) | Automate web browser interactions via CLI commands — supports remote Browserbase sessions with Browserbase Identity, Verified browsers, CAPTCHA solving, and residential proxies |
| [browserbase-cli](skills/browserbase-cli/SKILL.md) | Use the official `browse` CLI for Browserbase Functions and platform API workflows including sessions, projects, contexts, extensions, fetch, and dashboard |
| [functions](skills/functions/SKILL.md) | Deploy serverless browser automation to Browserbase cloud using the `browse` CLI |
| [browser-trace](skills/browser-trace/SKILL.md) | Capture a full DevTools-protocol trace (CDP firehose, screenshots, DOM dumps) alongside any browser automation, then bisect the stream into per-page searchable buckets |
| [browser-to-api](skills/browser-to-api/SKILL.md) | Turn a website's observable HTTP traffic into a best-effort OpenAPI 3.1 spec by analyzing a `browser-trace` capture |
| [autobrowse](skills/autobrowse/SKILL.md) | Self-improving browser automation — iteratively runs a browsing task, reads the trace, and improves the navigation skill until it reliably passes |
| [safe-browser](skills/safe-browser/SKILL.md) | Build local Claude Agent SDK browser agents whose only browser capability is a CDP-gated `safe_browser` tool with domain allowlist enforcement |
| [cookie-sync](skills/cookie-sync/SKILL.md) | Sync cookies from local Chrome to a Browserbase persistent context so the browse CLI can access authenticated sites |
| [fetch](skills/fetch/SKILL.md) | Fetch HTML or JSON from static pages without a browser session — inspect status codes, headers, follow redirects |
| [search](skills/search/SKILL.md) | Search the web and return structured results (titles, URLs, metadata) without a browser session |
| [ui-test](skills/ui-test/SKILL.md) | AI-powered adversarial UI testing — analyzes git diffs to test changes, or explores the full app to find bugs |
| [agent-experience](skills/agent-experience/SKILL.md) | Audit how agent-friendly a product, SDK, or docs site is — drops Claude subagents at it with tiny prompts, captures their traces, and scores setup friction, speed, error recovery, and doc quality |
| [company-research](skills/company-research/SKILL.md) | Discover target companies matching your ICP using the Browserbase Search API, deep-research each one, and score fit into a research report and CSV |
| [event-prospecting](skills/event-prospecting/SKILL.md) | Extract speakers from a conference page, filter their companies against your ICP, and deep-research the best-fit people into a person-first prospecting report |

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
- *"Use `browse` to list my Browserbase projects and show the output as JSON"*
- *"Initialize a new Browserbase Function with `browse functions init` and explain the next commands"*
- *"Use safe-browser to build a Hacker News scraper that only stays on the main site"*

Claude will handle the rest.

For local and localhost work, pass `--local` on the first browser command (for example, `browse open http://localhost:3000 --local`) to start a clean isolated browser. Use `--auto-connect` when the agent should reuse your existing local Chrome session, cookies, or login state.

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
