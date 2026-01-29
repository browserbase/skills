---
description: Install the browse and bb CLIs required for browser automation
---

# Setup Browse CLI

Install the required CLIs for browser automation:

```bash
npm install -g @browserbasehq/browse-cli @browserbasehq/sdk-functions
```

After installation, verify they work:

```bash
browse --version
bb --version
```

Then set your Browserbase credentials:

```bash
export BROWSERBASE_API_KEY="your_api_key"
export BROWSERBASE_PROJECT_ID="your_project_id"
```

Get credentials from: https://browserbase.com/settings
