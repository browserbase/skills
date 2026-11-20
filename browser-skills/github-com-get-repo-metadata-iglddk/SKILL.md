---
name: github-com-get-repo-metadata-iglddk
title: GitHub Repository Metadata
description: >-
  Given a GitHub repo reference (URL, owner/repo slug, deep tree/blob URL, or
  owner URL), return the repository's core metadata, latest release, license,
  language breakdown, top contributors, README, and health signals as structured
  JSON. Read-only.
website: github.com
category: developer-tools
tags:
  - github
  - git
  - metadata
  - rest-api
  - developer-tools
  - read-only
  - open-source
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods:
  - method: mcp
    rationale: >-
      GitHub publishes an official MCP server (github/github-mcp-server) that
      wraps the same REST endpoints with consistent naming, transparent auth,
      and built-in redirect/User-Agent handling. Prefer it when the calling
      environment has the MCP server attached.
  - method: browser
    rationale: >-
      Fallback for unauthenticated rate-limit exhaustion (60 req/hour per
      outbound IP). HTML path is materially worse: star/fork/watcher counts,
      language bar percentages, latest commit, and contributors are all
      React-rendered and absent from the static HTML response (curl -fetched
      HTML contains only the About box, topics, and license link). A real
      browser session with JS execution and post-load hydration wait is
      required, not just curl.
verified: false
proxies: false
---
# GitHub Repository Metadata

## Purpose

Given a GitHub repo reference (full URL, `owner/repo` slug, deep `tree/{branch}/{path}` URL, or bare owner URL), return the repository's core metadata as structured JSON: identity (full name, description, homepage, default branch), social signals (stars, forks, watchers, open issues, open PRs), code shape (primary language + per-language byte breakdown), provenance (created/pushed/updated dates, latest commit on default branch, repo size), licensing (SPDX id + license file URL), distribution (latest release with assets, GitHub Pages URL, topics), people (top contributors, owner profile), health files (CoC, contributing, security policy, funding), and the README (base64 + raw). Owner URLs return a paginated, filterable repo list for that owner. Deep `tree/.../path` URLs add path-content listings to the repo-level payload. Read-only — never clicks Star, Watch, Fork, or any mutation control.

## When to Use

- Repo-card / "About this project" enrichment in dashboards, search results, or chat assistants.
- Bulk repo intelligence — scoring an org's portfolio by activity / language / license.
- Resolving an `owner/repo` to a canonical full payload before downstream operations.
- "What's the latest release of X?" / "What license does Y use?" / "Who are the top contributors to Z?" lookups.
- Listing an org or user's public repos with filters (type, language, sort).

## Workflow

GitHub exposes a first-class public REST API at `api.github.com` that returns every field above in **clean JSON** with **no anti-bot, no auth required for public data, no cookies, no stealth, no proxy**. The browser is shipped as a per-the-browser-harness-pattern fallback for one specific failure mode: **unauthenticated rate-limit exhaustion (60 req/hour per outbound IP)**. The HTML path is materially worse — many counts (stars, forks, watchers, language bar percentages) are React-rendered and absent from the static HTML response, so a real browser session is required, not just `curl`. Lead with the API; only fall back when 403'd by rate limit.

### 1. Normalize the input

Accept any of:

| Input shape | Parse |
|---|---|
| `owner/repo` | `owner=owner, repo=repo` |
| `https://github.com/owner/repo` (with optional trailing `/`) | same |
| `https://github.com/owner/repo.git` | strip `.git` |
| `https://github.com/owner/repo/tree/{branch}/{path...}` | `owner, repo, branch, path` (also fetch path contents in step 7) |
| `https://github.com/owner/repo/blob/{branch}/{file}` | treat like `tree/` but fetch the blob, not a directory listing |
| `https://github.com/owner` (no second segment) | owner-listing mode — skip steps 2–7, run step 8 |

URL-decode any encoded segments. Lowercase `owner` and `repo` for the request (GitHub is case-insensitive for these; the API echoes back the canonical case).

### 2. Repo-level metadata — single call

```
GET https://api.github.com/repos/{owner}/{repo}
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2022-11-28
User-Agent: <descriptive-agent-id>
```

A `User-Agent` is **required** by GitHub or the call 403s with "Request forbidden by administrative rules." Use a descriptive identifier (e.g. `browse-sh-github-metadata/1.0`).

Returns ~140 fields. Map directly:

| Output field | API path |
|---|---|
| `full_name` | `.full_name` |
| `description` | `.description` |
| `homepage` | `.homepage` |
| `default_branch` | `.default_branch` |
| `is_fork` | `.fork` |
| `parent` (when fork) | `.parent.full_name` (only present on a follow-up GET when `?` ... actually present on this same call's `.parent` when `.fork === true`) |
| `is_archived` | `.archived` |
| `is_template` | `.is_template` |
| `visibility` | `.visibility` ("public" only from unauth) |
| `stars` | `.stargazers_count` |
| `forks` | `.forks_count` |
| `watchers` | `.subscribers_count` (NOT `.watchers_count` — see gotcha) |
| `open_issues_plus_prs` | `.open_issues_count` (includes PRs — see gotcha for splitting) |
| `size_kb` | `.size` |
| `created_at` | `.created_at` |
| `pushed_at` | `.pushed_at` |
| `updated_at` | `.updated_at` |
| `license.spdx_id` | `.license.spdx_id` |
| `license.name` | `.license.name` |
| `topics` | `.topics` (array of strings) |
| `primary_language` | `.language` |
| `html_url` | `.html_url` |
| `has_pages` | `.has_pages` (boolean — fetch `/pages` in step 6 if true) |

### 3. Per-language byte breakdown

```
GET https://api.github.com/repos/{owner}/{repo}/languages
```

Returns `{ "JavaScript": 37953343, "TypeScript": 22036924, ... }` — byte counts per language. Compute percentages client-side: `pct = bytes / sum(bytes) * 100`. The API does **not** return percentages directly.

### 4. Latest commit on default branch

```
GET https://api.github.com/repos/{owner}/{repo}/commits/{default_branch}
```

Returns `.sha`, `.commit.message`, `.commit.author.date` (ISO 8601), `.commit.author.name`, `.commit.author.email`, `.author.login` (account-linked login, may differ from commit-trailer name). Pass `?per_page=1` to `/commits` if you'd rather query without supplying the branch name explicitly.

### 5. Latest release (with assets)

```
GET https://api.github.com/repos/{owner}/{repo}/releases/latest
```

Returns `.tag_name`, `.name`, `.published_at`, `.body` (Markdown), `.html_url`, and `.assets[]` (each asset has `.name`, `.size`, `.download_count`, `.browser_download_url`, `.content_type`). **404 is normal** — many repos have tags but no published release. Treat 404 as `latest_release: null` and optionally fall back to `/tags?per_page=1` for the most-recent git tag.

### 6. Health files, license body, README, pages, contributors

Run these in parallel — they're independent:

```
GET /repos/{owner}/{repo}/community/profile   # health_percentage, files{} pointers to CoC/contributing/security/license/issue_template/pull_request_template/readme
GET /repos/{owner}/{repo}/license              # license file: name, path, spdx, content (base64), download_url
GET /repos/{owner}/{repo}/readme               # README: name, path, size, content (base64), download_url, html_url
GET /repos/{owner}/{repo}/pages                # GitHub Pages config (only call if .has_pages === true; else 404)
GET /repos/{owner}/{repo}/contributors?per_page=30  # array of contributors with .login, .html_url, .contributions, .avatar_url
GET /repos/{owner}/{repo}/contents/.github/FUNDING.yml  # funding sources (404 if not set)
```

The README/license `content` field is **base64-encoded** with embedded newlines (every 60 chars). Decode with `atob(content.replace(/\n/g, ''))` (JS) or `base64.b64decode(content)` (Python). Alternatively, follow `.download_url` for the raw bytes from `raw.githubusercontent.com` — bypasses base64 and doesn't count against `core` rate limit (it's served from a different host).

For funding sources, the YAML at `.github/FUNDING.yml` has keys like `github: [user1, user2]`, `patreon: handle`, `open_collective: name`, `ko_fi: handle`, `tidelift: platform-name/pkg`, `community_bridge: project`, `liberapay: handle`, `issuehunt: handle`, `lfx_crowdfunding: project`, `polar: handle`, `buy_me_a_coffee: handle`, `thanks_dev: handle`, `custom: [url1, url2]`. Parse the decoded body.

### 7. Path contents (when input was a `tree/.../path` URL)

```
GET https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={branch}
```

Returns an array of `{name, path, type ("file"|"dir"|"symlink"|"submodule"), size, sha, html_url, download_url}` entries. For a blob (`blob/{branch}/{file}` input), this returns a single object with `.content` (base64). Recurse into subdirs only on caller request — the API limits a single response to 1000 entries.

### 8. Owner mode (input was `https://github.com/{owner}`)

First resolve owner type:

```
GET https://api.github.com/users/{owner}    # works for BOTH users and orgs; returns .type = "User" | "Organization"
```

Then list their repos with the requested filters:

```
GET /users/{owner}/repos?type={all|owner|member}&sort={created|updated|pushed|full_name}&direction={asc|desc}&per_page={1..100}&page={N}
```

Or — for organizations only, which also accepts the legacy filter values from the GitHub UI:

```
GET /orgs/{owner}/repos?type={all|public|private|forks|sources|member}&sort=...&direction=...
```

The org endpoint's `type` accepts `forks` / `sources` / `member` (UI's "Repo type" filter), while the user endpoint's `type` is more limited. To filter by **language**, fetch a page and post-filter on `.language === "<X>"` — the REST API has **no server-side language filter** for repo lists (the GitHub UI does it via the `/search/repositories` endpoint with `q=user:owner+language:X`, which has a different rate limit).

For pagination, use `Link` response header's `rel="next"` and `rel="last"` URLs — `per_page=100` is the max; default is 30.

### 9. Open-PR count (split from `open_issues_count`)

`.open_issues_count` on the repo object is **issues + PRs combined**. To split:

```
GET https://api.github.com/repos/{owner}/{repo}/pulls?state=open&per_page=1
# Read the response Link header: rel="last" URL has &page={N}; that N === open_pr_count
```

Then `open_issues = open_issues_count - open_pr_count`. The Link-header trick is preferred over `/search/issues?q=...is:pr+is:open` because the latter uses the **search API rate limit** (10/min for code_search, 30/hour for unauth users on `/search/issues`), which exhausts much faster than core.

### Browser fallback

Trigger when **all three** of these are true:
1. `core` rate-limit `x-ratelimit-remaining: 0` AND `x-ratelimit-reset` is more than ~5 minutes away.
2. The skill must succeed *now* (the caller can't wait for the reset).
3. No `Authorization: Bearer <token>` is available (an auth token raises the limit 83× to 5,000/hr — almost always preferable to falling back to HTML).

Steps:

1. **Stealth is not required** but `--proxies` (residential) is helpful if the unauth IP is itself blocked (rare; GitHub doesn't anti-bot the public web UI for read traffic). A bare session is usually fine.
2. **Open `https://github.com/{owner}/{repo}`**, `wait load`, `wait timeout 1500` for React hydration of the social-count chips. Without that wait, stargazer/fork counts are still in skeleton state.
3. **Sidebar `About` box** — the description, homepage URL, topics, and license name are in the **static HTML** under `<h2 …>About</h2>` (selector: `h2.h4` containing "About") followed by `<p class="f4 tmp-my-3">{description}</p>` and topic anchors (`a.topic-tag.topic-tag-link[href^="/topics/"]`).
4. **Star / fork / watcher counts** — `[data-view-component="true"][href="/{owner}/{repo}/stargazers"] strong`, `.../forks`, `.../watchers`. **NOT in static HTML — requires real browser DOM.** Counts on the listing page are abbreviated ("140k") — for exact values, follow the link to `/stargazers` and read the page-header count, or read the title attribute on the chip (sometimes "140,234" full).
5. **Language bar** — `div[aria-label="Language: ..."]` spans below the About box, each with `style="width: XX.X%"`. Map each span's `aria-label` to `{language, percent}`.
6. **Latest commit** — top of the file listing: `div[data-testid="latest-commit"]` (selector class is volatile across GitHub redesigns; fall back to the `<a>` whose href matches `/{owner}/{repo}/commit/[0-9a-f]{40}`).
7. **Default branch** — `summary[id^="branch-picker-trigger-button"]` or the `data-branch` attribute on the branch-picker `<button>`.
8. **Releases** — sidebar "Releases" section, anchor `href="/{owner}/{repo}/releases/tag/{tag}"`. The latest release publish date is a `<relative-time>` element; read `datetime` attr for the ISO 8601 value, not `textContent` (which is humanized like "2 days ago").
9. **Contributors** — sidebar "Contributors" section gives the count and top ~14 avatars; for the full list browse to `/{owner}/{repo}/graphs/contributors`.
10. **README** — `<article id="readme">` rendered HTML, OR navigate to `/{owner}/{repo}/raw/{default_branch}/README.md` (case-sensitive — try `README.md`, `readme.md`, `README.rst`, `README.markdown` in order) and read the raw bytes.

The browser path costs **~6–10x** more turns than the API path (the API is one call for 80% of the fields; the browser needs separate navigations for stars-exact / contributors-full / language-bar / releases / readme). Use it **only** when API quota is exhausted.

## Site-Specific Gotchas

- **`User-Agent` header is mandatory.** API calls without `User-Agent` return 403 with "Request forbidden by administrative rules." Use a descriptive UA like `browse-sh-github-metadata/1.0`. Some libraries set it automatically; if you're using bare `fetch` or `curl --no-default-headers`, set it explicitly.
- **60 req/hour unauthenticated, per outbound IP.** `x-ratelimit-limit: 60`, `x-ratelimit-remaining: N`, `x-ratelimit-used: U`, `x-ratelimit-reset: <epoch>` headers are on every response. One full repo payload (steps 2–6) is ~6–8 calls. With auth (`Authorization: Bearer {token}`) the limit is 5,000/hour — **always include a token when one is available**, even for "just one lookup", because rate limits aggregate across calls from the same egress IP and you don't control who else shares it.
- **Search API has a separate, tighter limit.** `/search/*` endpoints are 30/hour unauthenticated, 30/min authenticated. Do NOT use `/search/issues` for routine field extraction — use the `Link rel="last"` pagination trick on `/issues` / `/pulls` instead.
- **GraphQL requires auth.** `api.github.com/graphql` returns 401 from unauth. Don't bother for the public-data path.
- **Conditional GETs (`If-None-Match: <etag>` → 304) do not consume rate-limit quota.** Every JSON response carries a strong `ETag`; cache and replay. Especially valuable for the repo object, which changes only on push.
- **`.open_issues_count` includes PRs.** Issues and PRs share the same numbering space on GitHub. To split: paginate `/pulls?state=open&per_page=1` and read `Link: <...&page=N>; rel="last"`; that N is the open PR count. Then `open_issues = open_issues_count - open_pr_count`.
- **`.watchers_count` is NOT watchers — it aliases `.stargazers_count`.** A long-standing GitHub API quirk. The actual watch count (people subscribed to notifications) is `.subscribers_count`. Use that.
- **`/repos/{owner}/{repo}/releases/latest` 404s when the repo has no published GitHub Release**, even if it has git tags. Treat 404 as `latest_release: null` and optionally fall back to `/tags?per_page=1` (returns the most recent tag in **alphabetical descending** order by default, NOT chronological — sort by tagged commit date if you need temporal ordering).
- **README `content` is base64 with embedded newlines.** `atob(content)` fails until you strip `\n`: `atob(content.replace(/\n/g, ''))`. Or follow `.download_url` to get raw bytes from `raw.githubusercontent.com` (no base64, no rate-limit charge).
- **README filename is not always `README.md`.** Common variants: `readme.md` (lowercase), `README.rst` (reST), `README.markdown`, `README.adoc` (AsciiDoc), or no extension. The `/readme` endpoint auto-discovers the canonical one; trust its `.name`/`.download_url` rather than guessing.
- **`/community/profile` returns `null` for files the repo doesn't ship.** `.files.security_policy === null` means no `SECURITY.md`. `.files.code_of_conduct.key === "none"` means a placeholder was detected but no actual file. Check both `.files.{kind}` and `.files.{kind}_file` — they're separate (one is metadata pointing to a recognized template, the other is the literal file).
- **`.github/FUNDING.yml` returns 404 if not configured** — that's the signal for "no funding sources", not an error.
- **GitHub Pages 404s when not enabled.** `.has_pages: true` on the repo object means a `/pages` call will succeed; `false` means skip the call (don't waste a request).
- **`.fork: true` repos have a `.parent` and `.source` field on the same GET response.** `.parent` is the immediate upstream; `.source` is the ultimate root of the fork chain (may equal `.parent`).
- **`.language` (primary) is not always the language with the most bytes.** GitHub uses a Linguist-derived heuristic that can demote vendored / generated / docs paths. The `/languages` endpoint is the authoritative byte breakdown; `.language` is best-effort for display.
- **`Cache-Control: max-age=60, s-maxage=60`** on every response. The data is refreshed at most once per minute on GitHub's edge; consecutive requests within 60s may return identical bodies (and identical `ETag`). Don't poll faster than 60s for "live" updates.
- **Repo redirects.** Renamed/transferred repos return 301 with `Location: https://api.github.com/repositories/{id}`. Follow the redirect (or hit `/repositories/{id}` directly if you have the numeric id) — the underlying `.full_name` reflects the new owner/name.
- **Private and deleted repos return 404** from unauth, not 401. There's no way from unauth response alone to distinguish "doesn't exist" from "exists but private". Treat both as `not_found`.
- **`/users/{owner}` works for both user and org accounts** and returns `.type: "User"` or `.type: "Organization"`. `/orgs/{owner}` only works for orgs (404 on user); `/users/{owner}/repos` works for both; `/orgs/{owner}/repos` only for orgs. When unsure, start with `/users/{owner}` to discover the type, then route to the right repo-list endpoint.
- **`per_page` max is 100.** Lists default to 30/page. Always send `per_page=100` for fewer round-trips. Paginate via `Link` header.
- **HTML repo page is heavily React-rendered.** `curl https://github.com/{owner}/{repo}` returns static HTML containing the About box, topics, and license link **but NOT** the star/fork/watcher counts (skeleton placeholders), language bar percentages, latest-commit info, or contributor avatars. Browser fallback requires a real DOM with JS executed and a `wait timeout 1500ms` after `wait load` for hydration.
- **GitHub Topics tagger.** Topics returned by `/repos/{owner}/{repo}` are exactly what shows under the description on the HTML page. The dedicated `/topics` endpoint (with `Accept: application/vnd.github+json`) returns the same `{names: [...]}` list — but is **redundant** with `.topics` on the main response. Skip it.
- **Avatar URLs include `?v=N` versioning.** Append `&s=460` (or 80, 200, 460) to size them server-side. Without `s=` they're full-resolution (~400 KB each).
- **MCP fast-path:** GitHub publishes an official MCP server (`github/github-mcp-server`) that wraps these endpoints with consistent param naming and built-in auth. If the calling environment already has the GitHub MCP server attached, prefer it over hand-rolling REST calls — same data, no rate-limit budgeting code, and the MCP server handles redirects and the `User-Agent` requirement transparently.

## Expected Output

### Repo mode (input was `owner/repo` or repo URL)

```json
{
  "mode": "repo",
  "owner": {
    "login": "vercel",
    "type": "Organization",
    "name": "Vercel",
    "bio": "Agentic infrastructure for every app and agent.",
    "blog": "https://vercel.com",
    "location": null,
    "company": null,
    "email": null,
    "twitter": "vercel",
    "is_verified_org": true,
    "avatar_url": "https://avatars.githubusercontent.com/u/14985020?v=4",
    "followers": 28362,
    "public_repos": 232,
    "public_gists": 0,
    "created_at": "2015-10-05T19:40:30Z",
    "html_url": "https://github.com/vercel"
  },
  "repo": {
    "full_name": "vercel/next.js",
    "description": "The React Framework",
    "homepage": "https://nextjs.org",
    "html_url": "https://github.com/vercel/next.js",
    "default_branch": "canary",
    "primary_language": "JavaScript",
    "languages": [
      { "name": "JavaScript", "bytes": 37953343, "percent": 52.43 },
      { "name": "TypeScript", "bytes": 22036924, "percent": 30.44 },
      { "name": "Rust",       "bytes":  9799856, "percent": 13.54 }
    ],
    "stars": 132845,
    "forks": 29013,
    "watchers": 1582,
    "open_issues": 3201,
    "open_prs": 1810,
    "size_kb": 6432104,
    "is_fork": false,
    "is_archived": false,
    "is_template": false,
    "visibility": "public",
    "topics": ["react", "nextjs", "vercel", "ssg", "..."],
    "license": {
      "spdx_id": "MIT",
      "name": "MIT License",
      "html_url": "https://github.com/vercel/next.js/blob/canary/license.md"
    },
    "created_at": "2016-10-05T01:32:38Z",
    "pushed_at": "2026-05-18T15:50:37Z",
    "updated_at": "2026-05-18T15:50:50Z",
    "latest_commit": {
      "sha": "15d2272c8ccdd34bef15ab2a46eccd27d1574691",
      "message": "Distinguish in-navigation errors in the instant error overlay (#93843)",
      "date": "2026-05-18T15:50:37Z",
      "author_login": "aurorascharff",
      "author_name": "Aurora Scharff"
    },
    "latest_release": {
      "tag": "v16.2.6",
      "name": "v16.2.6",
      "published_at": "2026-05-15T22:00:00Z",
      "html_url": "https://github.com/vercel/next.js/releases/tag/v16.2.6",
      "body": "...release notes markdown...",
      "assets": [
        { "name": "next-swc-x86_64-unknown-linux-gnu.tar.gz", "size": 14523890, "download_count": 1290, "download_url": "https://github.com/vercel/next.js/releases/download/v16.2.6/...", "content_type": "application/gzip" }
      ]
    },
    "readme": {
      "name": "readme.md",
      "path": "readme.md",
      "size": 3212,
      "raw_url": "https://raw.githubusercontent.com/vercel/next.js/canary/readme.md",
      "raw": "<div align=\"center\">\n  <a href=\"https://nextjs.org\">\n...",
      "rendered_html_url": "https://github.com/vercel/next.js/blob/canary/readme.md"
    },
    "health": {
      "health_percentage": 87,
      "code_of_conduct": "https://github.com/vercel/next.js/blob/canary/CODE_OF_CONDUCT.md",
      "contributing": "https://github.com/vercel/next.js/blob/canary/contributing.md",
      "security_policy": null,
      "pull_request_template": "https://github.com/vercel/next.js/blob/canary/.github/pull_request_template.md",
      "issue_template": null
    },
    "funding": null,
    "pages_url": null,
    "top_contributors": [
      { "login": "ijjk",        "html_url": "https://github.com/ijjk",        "contributions": 4521, "avatar_url": "https://avatars.githubusercontent.com/u/22380829?v=4" },
      { "login": "timneutkens",  "html_url": "https://github.com/timneutkens", "contributions": 3987, "avatar_url": "..." }
    ]
  },
  "source": "rest-api",
  "rate_limit_remaining": 41
}
```

### Repo + path mode (input was `tree/{branch}/{path}` URL)

Same as repo mode, plus:

```json
"path": {
  "ref": "canary",
  "path": "packages",
  "type": "dir",
  "entries": [
    { "name": "create-next-app", "type": "dir",  "size": 0,    "html_url": "https://github.com/vercel/next.js/tree/canary/packages/create-next-app", "download_url": null },
    { "name": "next",            "type": "dir",  "size": 0,    "html_url": "https://github.com/vercel/next.js/tree/canary/packages/next",            "download_url": null },
    { "name": "README.md",       "type": "file", "size": 1842, "html_url": "https://github.com/vercel/next.js/blob/canary/packages/README.md",       "download_url": "https://raw.githubusercontent.com/vercel/next.js/canary/packages/README.md" }
  ]
}
```

### Owner-listing mode (input was `https://github.com/{owner}` — no repo segment)

```json
{
  "mode": "owner",
  "owner": { "...same shape as repo-mode `.owner`..." },
  "filters": {
    "type": "public",
    "language": null,
    "sort": "updated",
    "direction": "desc",
    "per_page": 100,
    "page": 1
  },
  "pagination": {
    "page": 1,
    "per_page": 100,
    "total_pages": 3,
    "next_page": 2
  },
  "repos": [
    {
      "full_name": "vercel/turborepo",
      "description": "Build system optimized for JavaScript and TypeScript, written in Rust",
      "primary_language": "Rust",
      "stars": 28341,
      "forks": 2103,
      "is_fork": false,
      "is_archived": false,
      "pushed_at": "2026-05-18T11:22:09Z",
      "html_url": "https://github.com/vercel/turborepo",
      "license_spdx": "MPL-2.0",
      "topics": ["monorepo", "build-system", "rust"]
    }
  ],
  "source": "rest-api",
  "rate_limit_remaining": 28
}
```

### Not-found / private / deleted

```json
{ "mode": "repo", "success": false, "reason": "not_found", "input": "owner/repo-or-url" }
```

(Unauth cannot distinguish private from deleted — both return 404. Report as `not_found`.)

### Rate-limit-exhausted-and-no-fallback

```json
{
  "mode": "repo",
  "success": false,
  "reason": "rate_limited",
  "rate_limit_reset_epoch": 1779131066,
  "rate_limit_reset_iso": "2026-05-18T19:24:26Z",
  "hint": "Re-run with Authorization: Bearer <token> for 5000 req/hour, wait for reset, or use the browser fallback path."
}
```
