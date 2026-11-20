---
name: war-gov-download-ufo-files-1oqbc9
title: Download War.gov UFO Files (Release 01 & 02)
description: >-
  Download the U.S. Department of War's UAP/UFO document bundles (Release 01
  ~1.2GB and Release 02 ~70MB) from war.gov/UFO/ through a Browserbase browser
  session with CDP download syncing, then verify the ZIP archives.
website: war.gov
category: government-records
tags:
  - government
  - uap
  - ufo
  - file-download
  - archive
  - war-gov
source: 'browserbase: agent-runtime 2026-06-09'
updated: '2026-06-09'
recommended_method: browser
alternative_methods:
  - method: fetch
    rationale: >-
      The lightweight Browserbase Fetch API returns 502 'response body exceeded
      the maximum allowed size' for both bundles — usable only for files under
      its body cap, which these are not.
  - method: cli
    rationale: >-
      Retrieval half of the flow is CLI: after the browser triggers and syncs
      the download, `browse cloud sessions downloads get <sid>` pulls the
      captured file as a wrapper ZIP.
verified: false
proxies: false
---
# Download UFO Files Release 01 & 02 (war.gov)

## Purpose

Download the two UAP/UFO **document bundles** published by the U.S. Department of War on its "Presidential Unsealing and Reporting System for UAP Encounters" page (`war.gov/UFO/`): **Release 01 Documents** (`Release_1.zip`, ~1.2 GB, 262 files) and **Release 02 Documents** (`release_02_document_bundle.zip`, ~70 MB). Both are publicly accessible ZIP archives of declassified PDFs/images. This skill retrieves the raw ZIPs and verifies them; it is read-only and never submits anything.

## When to Use

- A user wants the full Release 01 and/or Release 02 UAP **document** archives from war.gov pulled to local disk.
- Archival / bulk-ingest pipelines that need the original ZIPs (not individual PDFs).
- Re-validating that the official bundle URLs are still live and unchanged.
- NOT for the separate **video** bundles — those are large CloudFront-hosted archives (see Gotchas) and are out of scope here.

## Workflow

These ZIPs are too large for the lightweight Browserbase Fetch API (`browse cloud fetch` returns `502 The response body exceeded the maximum allowed size`). They must be pulled through a real browser session: the file downloads inside the session's Chrome, syncs to Browserbase session storage, and is retrieved as a ZIP-of-downloads via the sessions-downloads API. **A real Chrome session — even a bare one with no stealth — passes war.gov's WAF, so neither `--verified` nor `--proxies` is required** (verified across both files; see Gotchas for why the pre-run probe disagreed).

Direct, stable bundle URLs (no auth, no Content-Disposition; `application/zip`, HTTP 200):
- Release 01 Documents — `https://www.war.gov/medialink/ufo/bundle/Release_1.zip` (1,223,976,178 bytes)
- Release 02 Documents — `https://www.war.gov/medialink/ufo/052226/release_02/release_02_document_bundle.zip` (69,986,448 bytes)

1. **Create a bare keep-alive session.** No stealth flags needed:
   ```bash
   sid=$(browse cloud sessions create --keep-alive --timeout 2400 \
     | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
   ```
   Use a generous `--timeout` (e.g. 2400s) for Release 01 — the 1.2 GB transfer can run several minutes and the session must outlive it.

2. **Enable download syncing, then navigate to the ZIP.** Browserbase only syncs a download to session storage when CDP download behavior is set with `eventsEnabled: true` **before** the navigation. The `browse` CLI cannot send raw CDP commands, so use a tiny Node CDP client against the session's `connectUrl`:
   - Connect a WebSocket to `connectUrl` (from `browse cloud sessions get <sid>`).
   - Send `Browser.setDownloadBehavior` `{ behavior: "allow", downloadPath: "downloads", eventsEnabled: true }`.
   - `Target.attachToTarget` (flatten) the page target, `Page.enable`, then `Page.navigate` to the ZIP URL.
   - Wait for `Browser.downloadProgress` with `state: "completed"` (`receivedBytes === totalBytes`). The page itself stays on the prior URL — a ZIP triggers a *download*, not a navigation, so the title/URL won't change and `Page.navigate` may reject with `net::ERR_ABORTED`; that rejection is expected, not a failure.

3. **Wait for the sync, then retrieve.** After the in-browser download completes there is a propagation delay (~12–30 s, longer for 1.2 GB) before the file appears in session storage. Poll:
   ```bash
   browse cloud sessions downloads get "$sid" --output downloads.zip
   ```
   A 22-byte result means "nothing synced yet" — sleep and retry until the size jumps to the real bundle size. The returned `downloads.zip` is a **wrapper ZIP**: it contains the actual bundle renamed with a timestamp suffix, e.g. `Release_1-<epoch_ms>.zip`. Unzip one level to get the real bundle.

4. **Verify.** Unzip the wrapper, confirm the inner ZIP's byte size matches the expected `content-length`, and `unzip -l` it. Release 01 should list 262 entries under `Release_1/` (FBI photos + `*-HQ-*` document PDFs); Release 02 lists UAP PDFs under `release_02_document_bundle/` (DOE/CIA/DOW `*-UAP-*` files). The bundles include macOS `__MACOSX/` resource-fork entries — ignore them.

5. **Release the session:** `browse cloud sessions update "$sid" --status REQUEST_RELEASE`.

A reusable Node CDP downloader implementing step 2 is straightforward (~60 lines): get `connectUrl`, open a `WebSocket`, set download behavior, attach + navigate, resolve on `Browser.downloadProgress.state === "completed"`.

### Finding the links (optional discovery)

If the bundle URLs ever change, open `https://www.war.gov/UFO/` and read the anchor hrefs whose text matches `Download Release NN Documents`. Note the **Release 01 link lives in a hidden release-toggle tab** — on page load the "Release 02" tab is active, so the Release 01 document link is not visible until you click the `RELEASE 01` tab (or just read it straight from `document.querySelectorAll('a')`, since hidden anchors are still in the DOM).

## Site-Specific Gotchas

- **Bare browser works; the probe's 403 is a non-browser artifact.** A plain HTTP client (incl. the Browserbase Fetch API without proxies) gets `403` from war.gov's WAF — that is what the pre-run probe saw. A real headless Chrome session, even with **no** `--verified`/`--proxies`, loads the homepage and both ZIPs with `200`. So set `verified:false, proxies:false` honestly. If the WAF ever tightens, adding `--proxies`/`--verified` is the escalation, but it was not required here and `--proxies` would add per-GB bandwidth cost (painful on the 1.2 GB file).
- **Fetch API can't download these.** `browse cloud fetch <zip> --proxies` returns `502 The response body exceeded the maximum allowed size. Use a browser session to handle large responses.` Don't waste time on the Fetch path for the bundles.
- **Downloads do NOT sync unless `Browser.setDownloadBehavior(eventsEnabled:true)` is set first.** A plain `browse open <zip-url>` triggers the download in Chrome but Browserbase captures nothing — `downloads get` returns the empty 22-byte ZIP. The CDP download-behavior call is mandatory and must precede the navigation.
- **`downloads get` returns a wrapper ZIP, not the bundle directly.** The real archive is nested inside and renamed with a `-<epoch_ms>` suffix (`Release_1-1781017165599.zip`). Always unzip one level.
- **Sync is asynchronous.** Right after the in-browser download completes, `downloads get` can still return 22 bytes for 10–30 s. Poll with a delay; don't treat the first empty result as failure.
- **Release 01 is 1.2 GB.** Budget disk (~2.5 GB transient for wrapper + extracted inner), session timeout (`--timeout 2400`), and wall time (several minutes). The in-browser download is reliable end-to-end but slow.
- **Release 01 download link is in a hidden tab.** On `war.gov/UFO/` the Release 02 tab is selected by default; the Release 01 documents anchor is present in the DOM but `offsetParent === null` until the `RELEASE 01` tab is clicked. The direct URL is stable regardless, so prefer the hard-coded URL over scraping the visible tab.
- **Video bundles are a different host and out of scope.** The same page also offers "Download Release 0N Videos" — those point at CloudFront (`https://d34w7g4gy10iej.cloudfront.net/uapvideos.zip` ~1.3 GB, `uap052226.zip` ~5.6 GB), not war.gov. This skill targets only the two **document** bundles.
- **A CSV manifest exists** for Release 01 at `https://www.war.gov/Portals/1/Interactive/2026/UFO/uap-release001.csv` — handy for cross-checking the file list without unzipping 1.2 GB.

## Expected Output

A confirmation object per downloaded bundle (paths are local to wherever you unzipped):

```json
{
  "success": true,
  "verified": false,
  "proxies": false,
  "bundles": [
    {
      "release": "01",
      "label": "Download Release 01 Documents",
      "source_url": "https://www.war.gov/medialink/ufo/bundle/Release_1.zip",
      "content_type": "application/zip",
      "bytes": 1223976178,
      "inner_filename": "Release_1.zip",
      "entry_count": 262,
      "top_folder": "Release_1/",
      "valid_zip": true
    },
    {
      "release": "02",
      "label": "Download Release 02 Documents",
      "source_url": "https://www.war.gov/medialink/ufo/052226/release_02/release_02_document_bundle.zip",
      "content_type": "application/zip",
      "bytes": 69986448,
      "inner_filename": "release_02_document_bundle.zip",
      "top_folder": "release_02_document_bundle/",
      "valid_zip": true
    }
  ]
}
```

Failure shape (e.g. WAF tightened, or sync never produced a non-empty archive):

```json
{ "success": false, "release": "01", "error_reasoning": "downloads get returned 22-byte empty archive after 6 retries / 120s" }
```
