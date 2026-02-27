# Browserbase Skills

A set of skills for seamlessly enabling **[Claude Code](https://docs.claude.com/en/docs/claude-code/overview)** to interface with a browser using **[Stagehand](https://github.com/browserbase/stagehand)** (AI browser automation framework).

## Skills

This plugin includes the following skills (see `skills/` for details):

| Skill | Description |
|-------|-------------|
| [browser](skills/browser/SKILL.md) | Automate web browser interactions via CLI commands — supports remote Browserbase sessions with anti-bot stealth, CAPTCHA solving, and residential proxies |
| [agent-browser-remote](skills/agent-browser-remote/SKILL.md) | Use Agent Browser with Browserbase remote CDP sessions when local browsing hits CAPTCHAs, anti-bot checks, or JavaScript-heavy sites |
| [browser-fleet](skills/browser-fleet/SKILL.md) | Orchestrate high-volume browser work via sub-agent fanout with clear decomposition, retries, and cleanup patterns |
| [functions](skills/functions/SKILL.md) | Deploy serverless browser automation to Browserbase cloud using the `bb` CLI |

## Installation

On Claude Code, to add the marketplace, simply run:

```bash
/plugin marketplace add browserbase/agent-browse
```

Then install the plugin:

```bash
/plugin install agent-browse@browserbase
```

If you prefer the manual interface:
1. On Claude Code, type `/plugin`
2. Select option `3. Add marketplace`
3. Enter the marketplace source: `browserbase/agent-browse`
4. Press enter to select the `agent-browse` plugin
5. Hit enter again to `Install now`
6. **Restart Claude Code** for changes to take effect

## Usage

Once installed, just ask Claude to browse:
- *"Go to Hacker News, get the top post comments, and summarize them "*
- *"QA test http://localhost:3000 and fix any bugs you encounter"*
- *"Order me a pizza, you're already signed in on Doordash"*

Claude will handle the rest.

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
