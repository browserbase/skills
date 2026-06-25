# Examples: browser-use → Stagehand

Before/after pairs showing the migration patterns. Each "before" is a browser-use (Python) script;
each "after" is its Stagehand v3 (TypeScript) rewrite on Browserbase. Illustrative — validate
against your real site and tighten the `act(...)` prompts to the actual on-page labels.

See [SKILL.md](SKILL.md) for the workflow, [the guide](references/guide.md) for the philosophy +
feature mapping, and [references/determinism.md](references/determinism.md) for the decision framework.

## Running an "after" example

```bash
npm install @browserbasehq/stagehand zod
npm install -D tsx dotenv
```

`.env`:
```bash
BROWSERBASE_API_KEY=...
BROWSERBASE_PROJECT_ID=...
ANTHROPIC_API_KEY=...   # or OPENAI_API_KEY, matching the model string in the file
```

```bash
npx tsx example.ts
```

Swap `env: "BROWSERBASE"` for `env: "LOCAL"` (with Chrome installed) to run locally during dev.

---

## 1. Simple task

A fully-agentic task becomes a deterministic `page.goto` + one `act()` — no agent loop.

**Before — browser-use**
```python
import asyncio

from browser_use import Agent, ChatAnthropic


async def main() -> None:
    agent = Agent(
        task="Go to Hacker News (news.ycombinator.com) and open the top story",
        llm=ChatAnthropic(model="claude-sonnet-4-6"),
    )
    history = await agent.run(max_steps=20)
    print(history.final_result())


if __name__ == "__main__":
    asyncio.run(main())
```

**After — Stagehand v3**
```typescript
import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";

async function main() {
  const stagehand = new Stagehand({
    env: "BROWSERBASE", // use "LOCAL" for local dev with a real Chrome
    model: "anthropic/claude-sonnet-4-6",
  });
  await stagehand.init();
  try {
    const page = stagehand.context.pages()[0];

    await page.goto("https://news.ycombinator.com"); // deterministic
    await stagehand.act("click the top story's title link"); // AI: markup varies

    console.log("Opened:", page.url());
  } finally {
    await stagehand.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

---

## 2. Structured extraction

A Pydantic `output_model_schema` becomes a zod `extract()` — no agent loop, just navigate then read.

**Before — browser-use**
```python
import asyncio

from pydantic import BaseModel

from browser_use import Agent, ChatOpenAI


class Story(BaseModel):
    title: str
    points: int
    comments: int


class TopStories(BaseModel):
    stories: list[Story]


async def main() -> None:
    agent = Agent(
        task="Go to Hacker News and return the top 5 stories with title, points, and comment count",
        llm=ChatOpenAI(model="gpt-5"),
        output_model_schema=TopStories,
    )
    history = await agent.run()
    data = history.structured_output  # TopStories instance
    for story in data.stories:
        print(story.title, story.points, story.comments)


if __name__ == "__main__":
    asyncio.run(main())
```

**After — Stagehand v3**
```typescript
import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";

async function main() {
  const stagehand = new Stagehand({ env: "BROWSERBASE", model: "openai/gpt-5" });
  await stagehand.init();
  try {
    const page = stagehand.context.pages()[0];
    await page.goto("https://news.ycombinator.com");
    await page.waitForLoadState("domcontentloaded"); // settle before the AI snapshot

    const stories = await stagehand.extract(
      "extract the top 5 stories with their title, points, and comment count",
      z.array(
        z.object({
          title: z.string(),
          points: z.number(),
          comments: z.number().describe("number of comments"),
        }),
      ),
    );

    for (const s of stories) console.log(s.title, s.points, s.comments);
  } finally {
    await stagehand.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

---

## 3. Login with sensitive data

`sensitive_data` → `variables` (secrets never reach the LLM). The known form is driven with
deterministic `act()` steps. `allowed_domains` has no direct Stagehand equivalent — replace it with
a `page.url()` host check. For repeat runs, reuse a Browserbase **Context** to skip re-login.

**Before — browser-use**
```python
import asyncio
import os

from browser_use import Agent, Browser, ChatAnthropic


async def main() -> None:
    sensitive_data = {
        "https://example.com": {
            "x_user": os.environ["APP_USER"],
            "x_pass": os.environ["APP_PASS"],
        }
    }
    agent = Agent(
        task="Log into example.com using username x_user and password x_pass, then open the dashboard",
        llm=ChatAnthropic(model="claude-sonnet-4-6"),
        sensitive_data=sensitive_data,
        use_vision=False,  # don't leak secrets via screenshots
        browser=Browser(allowed_domains=["https://*.example.com"]),
    )
    await agent.run()


if __name__ == "__main__":
    asyncio.run(main())
```

**After — Stagehand v3**
```typescript
import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";

async function main() {
  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    model: "anthropic/claude-sonnet-4-6",
    // Reuse auth across runs with a Context:
    // browserbaseSessionCreateParams: {
    //   projectId: process.env.BROWSERBASE_PROJECT_ID!,
    //   browserSettings: { context: { id: process.env.BB_CONTEXT_ID!, persist: true } },
    // },
  });
  await stagehand.init();
  try {
    const page = stagehand.context.pages()[0];
    await page.goto("https://example.com/login");

    await stagehand.act("type %username% into the email field", {
      variables: { username: process.env.APP_USER! },
    });
    await stagehand.act("type %password% into the password field", {
      variables: { password: process.env.APP_PASS! },
    });
    await stagehand.act("click the sign in button");

    await page.waitForLoadState("domcontentloaded");

    // Best-effort stand-in for allowed_domains=["https://*.example.com"]. browser-use
    // enforces the allow-list across the ENTIRE run; a host check only covers the moment
    // it runs, so call it after *every* navigation — not just sign-in. For real continuous
    // enforcement use Browserbase proxy domain rules (api-mapping §5); this throw is only a
    // tripwire and is flagged "needs human review" in the migration summary.
    const assertAllowedHost = () => {
      const host = new URL(page.url()).hostname;
      if (host !== "example.com" && !host.endsWith(".example.com")) {
        throw new Error(`navigated off the allow-list: ${page.url()}`);
      }
    };
    assertAllowedHost();
    console.log("Logged in:", page.url());

    // Second half of the task ("…then open the dashboard") — don't stop at login.
    await stagehand.act("open the dashboard");
    await page.waitForLoadState("domcontentloaded");
    assertAllowedHost(); // re-check: the guardrail must cover this navigation too
    console.log("Dashboard:", page.url());
  } finally {
    await stagehand.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```
