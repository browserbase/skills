# Browser Automation Skill

A skill for seamlessly enabling **[Claude Code](https://docs.claude.com/en/docs/claude-code/overview)** to interface with a browser using **[Stagehand](https://github.com/browserbase/stagehand)** (AI browser automation framework). Because Stagehand accepts natural language instructions, it's significantly more context-efficient than native Playwright while providing more features built for automation.

## Installation

On Claude Code, to add the marketplace, simply run:

```bash
/plugin marketplace add browserbase/agent-browse
```

Then install the plugin:

```bash
/plugin install browser-automation@browser-tools
```

If you prefer the manual interface:
1. On Claude Code, type `/plugin`
2. Select option `3. Add marketplace`
3. Enter the marketplace source: `browserbase/agent-browse`
4. Press enter to select the `browser-automation` plugin
5. Hit enter again to `Install now`
6. **Restart Claude Code** for changes to take effect

## Setup

Choose one of these authentication methods:

### Option 1: API Key
```bash
export ANTHROPIC_API_KEY="your-api-key"
```

### Option 2: Claude Subscription (OAuth)
If you have Claude Pro/Max:
```bash
claude setup-token
```

### Option 3: CLIProxyAPI
Run a local proxy that handles authentication. Useful when integrating with AI coding agents (Droid, Amp, OpenCode, etc.).

```bash
# CLIProxyAPI listens on http://localhost:8317 by default
# Set a custom URL with:
export CLIPROXY_URL="http://localhost:8317"
```

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