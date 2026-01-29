# Browserbase Skills

Claude skill files for browser automation with Browserbase.

## Installation

```
/plugin install browserbase/skills
```

This will automatically install the required CLIs:
- `@browserbasehq/browse-cli` - Browser automation commands
- `@browserbasehq/sdk-functions` - Function dev/deploy commands

## Skills

- **[skills/browse/](./skills/browse/SKILL.md)** - Main skill: Browser automation CLI
- **[skills/browser-automation/](./skills/browser-automation/SKILL.md)** - Detailed automation reference
- **[skills/auth/](./skills/auth/SKILL.md)** - Authentication flows
- **[skills/fix/](./skills/fix/SKILL.md)** - Debugging and fixing automations
- **[skills/functions/](./skills/functions/SKILL.md)** - Deploying Browserbase Functions

## Quick Start

```bash
# Navigate to a URL
browse open https://example.com

# Get page structure with element refs
browse snapshot -c

# Click/fill using refs
browse click @0-5
browse fill @0-3 "search query"

# Take screenshot
browse screenshot page.png
```

## Usage

Add these skill files to your Claude project or Cursor rules to enable browser automation capabilities.
