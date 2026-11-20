---
name: github-com-get-pr-review-st0euo
title: GitHub Pull Request Review Extraction
description: >-
  Extract a normalized JSON snapshot of a GitHub pull request — metadata,
  ordered review timeline, per-file diff annotations with inline review comments
  (outdated + resolved flags), and check-run / status-context results —
  primarily via the GitHub REST API with a rendered-HTML fallback for UI-only
  signals. Read-only.
website: github.com
category: developer-tools
tags:
  - github
  - pull-request
  - code-review
  - read-only
  - rest-api
  - graphql
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods:
  - method: api
    rationale: >-
      Primary path. 7 parallel REST calls per PR. No auth needed for public
      repos (60 req/h, ~6 PRs/h). With auth, 5000 req/h and full coverage.
      Single-call alternative: one GraphQL query covers the same surface plus
      reviewThreads.isResolved and closingIssuesReferences which REST does not
      expose.
  - method: browser
    rationale: >-
      Fallback only for the resolved/outdated UI signals (data-resolved
      attribute on thread containers) and the rendered merge/out-of-date
      banners. Use browse cloud fetch --proxies; a remote Browserbase session is
      strictly slower and adds no coverage versus the Fetch API.
  - method: cli
    rationale: >-
      gh CLI wraps the same REST endpoints (gh pr view --json, gh api).
      Functionally equivalent to the REST path when an auth token is configured.
verified: false
proxies: true
---
# GitHub Pull Request Review Extraction

## Purpose

Given a GitHub pull request URL (or `owner/repo#number` slug), return a single normalized JSON document containing PR metadata, the full ordered review timeline, per-file diff annotations with inline review comments, and the latest check-run / status-context results. Read-only — never click Merge, Close, Approve, Request-changes, Comment, Resolve-conversation, or any other mutation control on the rendered page, and never POST to a mutating REST/GraphQL endpoint.

## When to Use

- Building a CR-summary or auto-review-digest for an inbox of open PRs.
- Snapshotting a PR's full review state for audit / compliance / retrospective use.
- Diffing two PRs (e.g., before/after a rebase) to see which review threads went stale.
- Anywhere you'd otherwise scrape `github.com/.../pull/N` HTML — the public REST API returns 99% of what the rendered page shows, faster and structurally.

## Workflow

GitHub's public **REST API** at `api.github.com` covers everything except thread-`isResolved` and `isCollapsed`, and resolves to 7 cheap, parallelizable HTTP calls per PR. **No browser, no anti-bot, no proxies required.** Use the browser/Browserbase Fetch fallback only when (a) you need the `resolved` / `outdated` UI signals that REST does not expose, (b) the repo is private and the available auth token cannot reach it, or (c) GraphQL is unavailable and the REST rate-limit budget is exhausted.

### 1. Parse the input

Accept all four input shapes and reduce to `{owner, repo, number, anchor_review_id?}`:

| Input | Parse |
|---|---|
| `https://github.com/<o>/<r>/pull/<n>` | `o`, `r`, `n` |
| `https://github.com/<o>/<r>/pull/<n>/files` | same; ignore `/files` |
| `https://github.com/<o>/<r>/pull/<n>#pullrequestreview-<id>` | same + `anchor_review_id` |
| `<o>/<r>#<n>` slug | `o`, `r`, `n` |

### 2. Authenticate (optional but strongly recommended)

Unauthenticated rate-limit is **60 requests / hour** on the `core` resource and **0** on GraphQL — enough for ~6 PRs/hour at the 7-calls-per-PR rate below. Authenticated raises this to **5 000/hour** (`Authorization: Bearer <token>`). Any of the following tokens works:

- Classic PAT with `repo` scope (private) or no scope (public).
- Fine-grained PAT with `pull_requests:read` + `contents:read` on the target repo.
- GitHub App installation token (must be installed on the target repo).

For private repos, an auth wall without a usable token is an immediate `candidate` ship — REST returns `404 Not Found` (NOT 403) to disguise the existence of the repo. Detect this by asserting `repos/{o}/{r}` returns 200 with `private: true` after auth is attached.

### 3. Fetch the 7 endpoints in parallel

Endpoint base: `https://api.github.com`. Send `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, and `User-Agent: <your-agent-name>` (UA is required and a missing UA returns 403). Paginate every list endpoint via the `Link: <...>; rel="next"` header; the implicit default is 30 per page, max 100 via `per_page=100`.

| # | Endpoint | What it returns |
|---|---|---|
| 1 | `GET /repos/{o}/{r}/pulls/{n}` | PR metadata: number, title, body, state, draft, merged, mergeable, mergeable_state, created/updated/closed/merged_at, base/head (ref + sha + repo slug), user (author), labels, assignees, requested_reviewers (users), requested_teams, milestone, commits, additions, deletions, changed_files, html_url, merge_commit_sha |
| 2 | `GET /repos/{o}/{r}/pulls/{n}/reviews?per_page=100` | All review submissions (top-level only — no inline children): id, user, state, body, submitted_at, commit_id |
| 3 | `GET /repos/{o}/{r}/pulls/{n}/comments?per_page=100` | All inline review comments: id, pull_request_review_id, user, body, path, line, side, start_line, start_side, original_line, original_position, position, diff_hunk, commit_id, original_commit_id, in_reply_to_id, created_at, updated_at, html_url |
| 4 | `GET /repos/{o}/{r}/issues/{n}/comments?per_page=100` | Top-level conversation comments (sit under the issue/PR resource, NOT the pulls resource): id, user, body, created_at, updated_at, html_url |
| 5 | `GET /repos/{o}/{r}/issues/{n}/timeline?per_page=100` | Full event timeline: `committed`, `reviewed`, `commented`, `labeled`/`unlabeled`, `assigned`/`unassigned`, `review_requested`/`review_request_removed`, `ready_for_review`, `convert_to_draft`, `head_ref_force_pushed`, `head_ref_deleted`, `head_ref_restored`, `closed`, `reopened`, `merged`, `referenced`, `cross-referenced`, `mentioned`, `subscribed`, `renamed`, `milestoned`, `demilestoned`, `pinned`, `unpinned`, `locked`, `unlocked`, `deployed`, `deployment_environment_changed`, `auto_merge_enabled`/`disabled`, `connected`/`disconnected` (linked-issue events), `marked_as_duplicate`, `unmarked_as_duplicate`. |
| 6 | `GET /repos/{o}/{r}/pulls/{n}/files?per_page=100` | Per-file diff: filename, previous_filename (renames), status (`added`, `removed`, `modified`, `renamed`, `copied`, `changed`, `unchanged`), additions, deletions, changes, patch (unified-diff hunks for that file), blob_url, sha |
| 7a | `GET /repos/{o}/{r}/commits/{head_sha}/check-runs?per_page=100` | Modern check-runs: name, status (`queued`, `in_progress`, `completed`), conclusion (`success`, `failure`, `neutral`, `cancelled`, `skipped`, `timed_out`, `action_required`), html_url, started_at, completed_at, app.slug, output.title/summary |
| 7b | `GET /repos/{o}/{r}/commits/{head_sha}/status` | Legacy combined-status contexts (Travis, Circle, etc.): state (`error`, `failure`, `pending`, `success`), context, description, target_url, statuses[], combined `state` |

Call 1 first to learn `head.sha`, then fan out the rest. Calls 7a + 7b are both required for a complete picture: GitHub Actions writes to check-runs, third-party CIs may still write to the legacy combined-status surface, and many repos have both. Merge by `name`/`context` if you need to dedupe.

### 4. Assemble the timeline

The `/issues/{n}/timeline` endpoint already returns events in chronological order, but it does **not** carry the full payload for review submissions (only `event: "reviewed"` with `state` + `submitted_at` + `actor`) or for inline review comments (each `commented` entry is a top-level issue comment, not an inline review comment). Merge as follows:

1. Walk `timeline` and emit one event per item, keeping its natural `event` value as `type`.
2. For each `reviewed` event, look up the matching `pulls/{n}/reviews` entry by `id` (`timeline[i].id` matches `reviews[j].id`) to attach `body` and the list of inline `comments` whose `pull_request_review_id` equals that review's id. The inline-comment list comes from `pulls/{n}/comments`.
3. For each `commented` event, look up the matching `issues/{n}/comments` entry by `id` to attach the full `body` and edit metadata.
4. `cross-referenced` and `connected`/`disconnected` events carry **linked-issue / linked-PR** signals — there is no separate "linked issues" REST endpoint. A `connected` event with `source.issue.pull_request === undefined` is a linked issue; `pull_request !== undefined` is a linked PR. `disconnected` undoes a prior `connected`. Closing-keyword references in the PR body (`closes #N`, `fixes #N`) also surface as `connected` after the PR is merged; **do not** re-parse the PR body for closing keywords — let timeline events be the source of truth (post-merge they include keyword-derived links automatically).
5. Sort merged events by `created_at` ascending if you mix sources.

### 5. Assemble per-file annotations

For each `files[i]` from call 6:

- `file.path = files[i].filename`; if `files[i].status === "renamed"`, also record `file.previous_path = files[i].previous_filename`.
- Parse `files[i].patch` into hunks. Each hunk header has the form `@@ -<old_start>,<old_len> +<new_start>,<new_len> @@ <section_header>`. Each subsequent line is a context line (` `), addition (`+`), or deletion (`-`).
- Attach inline review comments by matching `comments[j].path === file.path` AND (active comments) `comments[j].position !== null`, OR (outdated comments) `comments[j].original_position` against the original commit's diff position.
- The **resolved** state of a thread is *not* in REST. A REST-only assembly should mark every inline comment as `resolved: null` (unknown). To populate `resolved`, either (a) call GraphQL `pullRequest(number: N) { reviewThreads(first: 100) { nodes { isResolved isCollapsed comments(first: 100) { nodes { databaseId } } } } }` (requires auth), or (b) use the browser-fallback path in step 7 below.

### 6. Output

Emit the consolidated JSON per the schema in "Expected Output". Record which fields came from REST vs the rendered page in a top-level `_provenance` block (e.g., `{ "resolved_flags": "api-graphql" | "html-fallback" | "unavailable" }`) so downstream consumers know how confident to be.

### 7. Browser fallback (Browserbase Fetch)

Use this **only** when (a) you need `resolved` / `outdated` UI flags and GraphQL isn't available, (b) you need to see the rendered "out-of-date branch" / merge-conflict banner that REST's `mergeable_state` summarizes coarsely, or (c) you need to render suggested-changes blocks that came in via inline-comment ```suggestion fences and want them post-applied to the diff.

The rendered HTML for `https://github.com/<o>/<r>/pull/<n>` is fetchable through `browse cloud fetch <url> --proxies` (~600 KB). **Do not** use a remote Browserbase session for this — the Fetch API is sufficient and ~50× cheaper. The relevant DOM markers:

- `data-resolved="true|false"` attribute on each `js-resolvable-timeline-thread-container` element. Sibling `data-deferred-content-url="/<o>/<r>/pull/<n>/threads/<thread_id>?..."` carries the GraphQL thread node id; sibling `data-hidden-comment-ids="<csv-of-comment-ids>"` lists the **inline review comment IDs** (matches `pulls/{n}/comments[i].id`) inside that thread. This is how you bridge REST comment-ids → thread.isResolved.
- `is-outdated` class on a comment container, OR `position: null` + non-null `original_position` on the REST inline comment, OR the rendered text `Outdated`/`Show outdated`. Treat any of these as `outdated: true`.
- `js-suggested-changes-blob` / class `suggested-change` on a code-suggestion block — the suggested replacement text appears in the comment body between ` ```suggestion ` and ` ``` ` fences (this is available via REST directly, no browser needed to parse).
- `branch-action-state-clean | dirty | unstable | unknown | blocked` on the merge-status container — the rendered equivalent of `pulls/{n}.mergeable_state`.
- `<div class="merged-banner">` / `<div class="branch-action-item branch-action-state-…">` for the merge / out-of-date banners.

### 8. GraphQL alternative (one call, requires auth)

When auth is available and REST's missing-fields are problematic, the entire payload is one `pullRequest` query against `https://api.github.com/graphql`. Key fields beyond REST:

- `reviewThreads(first:100) { nodes { isResolved isCollapsed path line startLine diffSide comments(first:100) { nodes { databaseId author { login } body createdAt updatedAt outdated } } } }`
- `closingIssuesReferences(first:50) { nodes { number title repository { nameWithOwner } } }` — definitive linked-issue list, post-merge or pre-merge.
- `mergeStateStatus` — finer-grained than REST's `mergeable_state`: `CLEAN | DIRTY | BLOCKED | BEHIND | DRAFT | HAS_HOOKS | UNKNOWN | UNSTABLE`.
- `latestReviews(first:100) { nodes { author { login } state submittedAt body } }` — already deduped to the *latest* review submission per author, which REST does not provide.

GraphQL cost is **1 point per query** regardless of the number of nodes returned (within paginate limits), versus 7+ REST calls. Prefer GraphQL when auth is available; the REST flow above is the unauth fallback.

## Site-Specific Gotchas

- **Unauthenticated rate-limit is 60 requests/hour on the entire `core` resource, shared across all repos.** A typical PR costs 7 calls (more if reviews/comments/files paginate), so plan ~6 PRs/hour without auth. The `X-RateLimit-Remaining` header on every response tells you exactly how much you've used; check it before fanning out.
- **`User-Agent` header is mandatory** and a missing one returns `403 Forbidden`, not a more diagnostic error.
- **Private repos return 404, not 403, to anonymous callers.** Detect by attempting `repos/{o}/{r}` first with the available token; if that returns 200, the PR endpoint will too. If it returns 404 even with a token, the token lacks access — ship as `candidate` and document the auth wall.
- **`mergeable` is computed lazily.** The first call to `pulls/{n}` may return `mergeable: null` while GitHub schedules a test-merge. Retry once after 1–2 seconds; if still null, surface as `unknown`. The companion `mergeable_state` value (`clean`, `dirty`, `unstable`, `blocked`, `behind`, `draft`, `has_hooks`, `unknown`) is more granular than `mergeable` and is usually populated even when `mergeable` is null.
- **`state` is `open | closed` — NOT `merged` and NOT `draft`.** Determine merge state from the `merged` boolean field on the PR object, and draft state from `draft: true`. Many naïve clients treat `state` as a tri-state and miss merged-vs-just-closed.
- **PR-level conversation comments live under the `issues` resource, not `pulls`.** `GET /repos/{o}/{r}/pulls/{n}/comments` returns inline review comments only. Forgetting this is the most common single-endpoint mistake.
- **Review submissions with `state: COMMENTED` and empty `body` are normal.** They are containers for inline comments — emit them as part of the timeline but don't drop them as "empty noise."
- **Inline-comment `position: null` means the comment is *outdated* — anchored to a line that no longer exists in the current head.** Use `original_position` + `original_commit_id` + `diff_hunk` to render an outdated comment at its historical line. There is no explicit `outdated: true` field in REST; the null `position` IS the signal.
- **Inline-comment `pull_request_review_id` ties each comment to its parent review submission.** When the parent is a `COMMENTED` review with no body, that's a single-comment drive-by review — completely normal, common in active codebases.
- **REST has no `resolved` / `isResolved` field on review comments or review threads.** This is the single most painful API gap. The two reliable sources: (a) GraphQL `pullRequest.reviewThreads.nodes.isResolved` (requires auth); (b) rendered HTML `data-resolved="true|false"` on the thread container (Browserbase Fetch path). Do not infer "resolved" from "no replies after N hours" or from `in_reply_to_id` patterns — neither is correlated.
- **`pulls/{n}/files` truncates patches over ~5 000 lines per file** (`patch` becomes `null` even when `additions + deletions > 0`). It also truncates the file list at **3 000 files** total — `files` array maxes there even with pagination. For very large PRs, fall back to `repos/{o}/{r}/compare/{base.sha}...{head.sha}` which returns the full diff in a single response (subject to the same truncation but expressed at the response level via `files` and `truncated: true`).
- **Timeline events for `committed` carry the commit message and SHA but NOT the file changes** — call `pulls/{n}/commits` separately if you need per-commit deltas. Most callers don't.
- **`head.repo` is `null` when the source fork has been deleted** (common on old merged PRs). The `head.ref` and `head.sha` are still populated; just don't expect `head.repo.full_name` to exist.
- **Force-pushes appear as `head_ref_force_pushed` events** carrying `before_sha` and `after_sha`. Inline comments anchored to the `before_sha` become outdated post-force-push (REST surface: `position: null`, `original_commit_id: <before_sha>`).
- **Check-runs vs status-contexts split.** GitHub Actions and the modern Checks API write to `commits/{sha}/check-runs`. Older third-party CIs (Travis, CircleCI ≤ v1, custom webhooks) still write to the legacy `commits/{sha}/status` endpoint. **Always query both** and merge by `name`/`context`; treating either as the sole truth misses CI signals routinely.
- **The `mockingbird` preview header on the timeline endpoint is no longer required** — `Accept: application/vnd.github.mockingbird-preview+json` works but `application/vnd.github+json` returns the same data. Default works.
- **GraphQL is rate-limited separately** (5 000 points/hour authenticated; 0 unauthenticated). A `pullRequest` query is 1 point regardless of node count. Strongly preferred over REST when you have auth.
- **Reviewer "approved" state is *per-submission*, not *per-user*.** The same reviewer can approve, then submit a follow-up `COMMENTED` review without re-approving. The PR-level "approved by N" rendered on the UI reflects the *latest* submission state per user — GraphQL `latestReviews` gives you that; REST `pulls/{n}/reviews` returns every submission in order and you have to dedupe by `user.id` taking the last entry.
- **Suggested-changes blocks are plain markdown inside the comment body**: a fenced code block tagged ` ```suggestion `. No special API field — parse the comment body for the fence, and treat each ```suggestion``` block as a replacement for the lines anchored by the comment (`line`/`start_line` on the inline comment). The rendered "Apply suggested changes" button is UI-only and not a separate object.
- **`closes #N` / `fixes #N` keyword parsing of the PR body is unreliable as a "linked issues" source.** Use the timeline `connected` / `disconnected` events instead — they're authoritative and survive body edits. Post-merge, GitHub auto-creates `connected` events from the keywords, so you don't need to re-parse anyway.
- **The OpenGraph card endpoint `opengraph.githubassets.com/<cache-key>/<o>/<r>/pull/<n>`** returns a 1200×600 PNG summary of the PR (title, author, comments/reviews/files counts, +/− line counts, commit count) without any auth. Useful for marketplace thumbnails and quick previews; **not** a substitute for the structured JSON above. Rate-limited via the `<cache-key>` path component — vary it per request, and prefer `--proxies` on the Browserbase Fetch (we saw `429 Too Many Requests` on bare-IP fetches but `200 OK` through residential proxies).
- **No browser-driven Browserbase session is needed for any of this.** The REST API + `browse cloud fetch --proxies` (for the rendered-HTML fallback) covers 100% of the surface. Spinning up a `--remote` session and navigating the page is strictly slower, costlier, and adds zero coverage versus the Fetch API.

## Expected Output

```json
{
  "input": {
    "owner": "vercel",
    "repo": "next.js",
    "number": 33240,
    "anchor_review_id": null
  },
  "pull_request": {
    "number": 33240,
    "title": "Relay Support in Rust Compiler",
    "html_url": "https://github.com/vercel/next.js/pull/33240",
    "state": "closed",
    "draft": false,
    "merged": true,
    "mergeable": null,
    "mergeable_state": "unknown",
    "merge_commit_sha": "abc123…",
    "created_at": "2022-01-13T03:55:00Z",
    "updated_at": "2022-01-25T14:02:11Z",
    "closed_at": "2022-01-25T14:02:09Z",
    "merged_at": "2022-01-25T14:02:09Z",
    "author": {
      "login": "tbezman",
      "avatar_url": "https://avatars.githubusercontent.com/u/6754223?v=4",
      "html_url": "https://github.com/tbezman"
    },
    "base": { "repo": "vercel/next.js", "ref": "canary", "sha": "…" },
    "head": { "repo": "tbezman/next.js", "ref": "relay-plugin", "sha": "464dd97…" },
    "labels": [{ "name": "type: next", "color": "…" }],
    "assignees": [],
    "requested_reviewers": { "users": [], "teams": [] },
    "linked_issues": [{ "owner": "vercel", "repo": "next.js", "number": 30000, "title": "…" }],
    "milestone": null,
    "stats": { "commits": 46, "additions": 2424, "deletions": 141, "changed_files": 35 }
  },
  "timeline": [
    {
      "type": "committed",
      "actor": "tbezman",
      "timestamp": "2022-01-12T02:37:07Z",
      "payload": { "sha": "2aaa426…", "message": "Add support for relay compiler imports" }
    },
    {
      "type": "review",
      "actor": "timneutkens",
      "timestamp": "2022-01-13T13:07:45Z",
      "payload": {
        "review_id": 851227831,
        "state": "approved",
        "body": "LGTM",
        "comments": [
          {
            "id": 783613597,
            "path": "package.json",
            "line": 150,
            "side": "RIGHT",
            "body": "nit: alphabetize",
            "outdated": false,
            "resolved": true,
            "diff_hunk": "@@ -59,6 +59,7 @@…"
          }
        ]
      }
    },
    {
      "type": "head_ref_force_pushed",
      "actor": "tbezman",
      "timestamp": "2022-01-15T10:11:22Z",
      "payload": { "before_sha": "…", "after_sha": "…" }
    },
    {
      "type": "merged",
      "actor": "timneutkens",
      "timestamp": "2022-01-25T14:02:09Z",
      "payload": { "commit_sha": "abc123…" }
    }
  ],
  "files": [
    {
      "path": "docs/advanced-features/compiler.md",
      "previous_path": null,
      "status": "modified",
      "additions": 13,
      "deletions": 0,
      "hunks": [
        {
          "header": "@@ -94,6 +94,19 @@ const customJestConfig = {",
          "old_start": 94, "old_lines": 6, "new_start": 94, "new_lines": 19,
          "lines": [
            { "side": "context", "old": 94, "new": 94, "text": " const customJestConfig = {" },
            { "side": "add",     "old": null, "new": 95, "text": "### Relay" }
          ]
        }
      ],
      "inline_comments": [
        {
          "id": 783613597,
          "author": "timneutkens",
          "body": "nit: alphabetize",
          "line": 150, "side": "RIGHT",
          "outdated": false, "resolved": true,
          "created_at": "2022-01-13T13:08:11Z"
        }
      ]
    }
  ],
  "checks": [
    {
      "name": "build",
      "kind": "check_run",
      "status": "completed",
      "conclusion": "success",
      "required": null,
      "details_url": "https://github.com/vercel/next.js/runs/12345",
      "head_sha": "464dd97…",
      "app": "github-actions"
    },
    {
      "name": "ci/circleci: test",
      "kind": "status_context",
      "status": "completed",
      "conclusion": "success",
      "required": null,
      "details_url": "https://circleci.com/…",
      "head_sha": "464dd97…",
      "app": null
    }
  ],
  "_provenance": {
    "metadata":         "rest:GET /repos/{o}/{r}/pulls/{n}",
    "reviews":          "rest:GET /repos/{o}/{r}/pulls/{n}/reviews",
    "inline_comments":  "rest:GET /repos/{o}/{r}/pulls/{n}/comments",
    "issue_comments":   "rest:GET /repos/{o}/{r}/issues/{n}/comments",
    "timeline":         "rest:GET /repos/{o}/{r}/issues/{n}/timeline",
    "files":            "rest:GET /repos/{o}/{r}/pulls/{n}/files",
    "checks":           "rest:GET /repos/{o}/{r}/commits/{sha}/check-runs + /status",
    "resolved_flags":   "graphql:pullRequest.reviewThreads.isResolved | html-fallback | unavailable",
    "linked_issues":    "rest:timeline.connected | graphql:closingIssuesReferences"
  }
}
```

### Alternate output shapes

- **Auth-walled private repo** (token cannot reach):
  ```json
  { "success": false, "reason": "auth_required", "owner": "...", "repo": "...", "number": ... }
  ```
- **PR does not exist**:
  ```json
  { "success": false, "reason": "not_found", "owner": "...", "repo": "...", "number": ... }
  ```
- **Rate-limit exhausted before assembly completed**:
  ```json
  { "success": false, "reason": "rate_limited", "retry_after_seconds": 3600, "partial": { ... } }
  ```
