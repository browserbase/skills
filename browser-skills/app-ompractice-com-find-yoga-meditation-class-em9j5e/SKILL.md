---
name: app-ompractice-com-find-yoga-meditation-class-em9j5e
title: Ompractice Find Yoga/Meditation Class
description: >-
  Find upcoming live yoga, meditation, tai chi, breathwork, and movement classes
  on Ompractice that match a user's interests, availability, experience level,
  intensity preference, and class-length preference. Uses Ompractice's
  unauthenticated DRF API at api.ompractice.com. Read-only — does not book.
website: app.ompractice.com
category: wellness
tags:
  - wellness
  - yoga
  - meditation
  - fitness
  - scheduling
  - read-only
  - drf-api
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Falls back to driving app.ompractice.com/schedule and operating the Filter
      Classes modal (EXPERIENCE LEVEL / CLASS LENGTH slider / CLASS TYPE /
      STUDENTS audience / INTENSITY) when the API is unreachable. Costs ~25
      actions vs one HTTP request, so only used when API path fails. No
      stealth/proxy required either way.
verified: true
proxies: true
---
# Ompractice Find Yoga/Meditation Class

## Purpose

Given a user's interests (style, audience), availability window (date/time range and class length), and experience level, return a ranked list of upcoming live online yoga / meditation / movement classes on Ompractice that match. Each result includes class title, start time, duration, teacher, recommended experience level, intensity, tags, enrolment count, membership requirement, and the canonical join URL (`https://app.ompractice.com/c/{slug}?classId={id}`). **Read-only — never books or pays.** Booking requires an authenticated Ompractice membership and is a separate skill.

## When to Use

- "Find me a gentle beginner meditation class this week before 9pm Pacific."
- "Suggest a 30-minute vinyasa flow tomorrow morning suitable for someone with some experience."
- "What chair-yoga or seated classes are on tap in the next 3 days for an arthritis-friendly intensity?"
- Any flow that needs to surface live, scheduled Ompractice class instances matched against user preferences. **On-demand video recommendation is a separate concern — this skill is for the live class schedule only.**

## Workflow

The Ompractice public REST API (Django REST Framework on Heroku at `api.ompractice.com`) exposes the same data the schedule page consumes — **no auth, no cookies, no anti-bot, no residential proxy required**. Lead with the API. Drive the browser only if you also need to *book* (a different skill) or visualise filter state.

### 1. Fetch upcoming classes for a date window

```
GET https://api.ompractice.com/api/v1/classes/
    ?start_date=<ISO-8601 with Z>
    &end_date=<ISO-8601 with Z>
    &ended=false
    &format=json
```

- `start_date` / `end_date` are millisecond-precision ISO-8601 UTC timestamps (e.g. `2026-05-19T07:00:00.000Z`). The official client uses the local midnight of "today" through "today + 7d" as default. **The `start_date` / `end_date` pair is the only date-filter shape the backend honors** — Django ORM-style `start__gte=`, generic `from=`, `start_after=` etc. are silently accepted and ignored (the query returns the full 22,438-record historical dump). See gotcha.
- `ended=false` excludes classes whose `end` is in the past — required, otherwise stale records show up.
- `format=json` is **mandatory** — without it, DRF content-negotiates to the browsable HTML API (`text/html`, ~5× larger and unparseable as JSON).

Response is a **flat JSON array** of class instances (not `{count, results}` like the unfiltered endpoint). Each item:

```jsonc
{
  "id": 31970,                            // canonical class instance ID — used in the URL
  "slug": "yoga-nidra-allison-jeraci-tuesday",
  "title": "Yoga Nidra",
  "short_desc": "...",
  "description": "...",                   // HTML allowed in body
  "type": 0,                              // 0=regular live class, 3=members-only / specialty
  "exp_lvl": "none",                      // "none" | "some" | "lots"
  "intensity": 1,                         // 0..20 numeric — see mapping below
  "duration": 30,                         // minutes
  "start": "2026-05-20T00:30:00Z",        // ISO UTC
  "end": "2026-05-20T01:00:00Z",
  "timezone": "America/New_York",         // teacher's tz; the start/end above are UTC
  "is_cancelled": false,
  "has_substitute": false,
  "requires_membership": true,
  "max_capacity": 100,
  "enrolled": 7,
  "teacher": { "id": 195, "slug": "allison-jeraci", "user": {"first_name":"Allison","last_name":"Jeraci",...}, "bio_short": "...", "photo_headshot": "https://...s3.amazonaws.com/...", ... },
  "tags": [ {"id":40, "name":"Meditation", "category":"MOVE", "display_to_public":true}, ... ],
  "recommended_props": "yoga mat, two blocks, blanket, bolster or pillow",
  "youtube_video": "",
  "main_photo": "...",
  "group_id": 4421
}
```

### 2. Filter client-side

The backend has no other filter params for the date-window endpoint — all other filtering happens client-side on the returned array.

| User intent | Field on item | Match logic |
|---|---|---|
| Interest / class style (e.g. "Meditation", "Power Yoga", "Yin", "Restorative", "Tai Chi", "Breathwork", "Sound Bowls", "Yoga Nidra", "iRest", "Pilates", "Barre", "Qigong", "Strength Training", "Mobility / Stretching", "Cardio Focus", "Core", "Functional Movement", "Joint Mobility", "Gentle Flow", "Decompress & Rest", "Chair") | `tags[].name` where `tags[].category == "MOVE"` | substring or exact match on `name` |
| Audience (e.g. "Great for Beginners", "Back Care", "Prenatal", "Arthritis", "Bone Strength", "Pelvic Health", "Good Sleep", "Accessibility", "Kids", "Seated", "Standing", "Veterans-Only", "Balance / Fall Prevention", "Sports Mobility", "Great for Visual Learners") | `tags[].name` where `tags[].category == "AUDI"` | exact match |
| Experience level | `exp_lvl` | `"none"` for absolute beginners, `"some"` for some prior practice, `"lots"` for experienced. To allow "up to my level," include all values at or below the user's stated level (e.g. user says "some" → accept `none` AND `some`). |
| Intensity | `intensity` (0..20 numeric) | Map UI labels: **Gentle** → `intensity ∈ {0,1,2}` (sub-labels: Gentle Still=0, Gentle Restful=1, Gentle Seated/Slow=2-3); **Moderate** → `{3,4}`; **Vigorous** → `{10}`; **Sweaty** → `{20}`. Distribution observed in a 14-day window: 0:14, 1:14, 2:2, 3:20, 4:62, 10:60, 20:10. |
| Class length | `duration` (minutes) | `min_minutes ≤ duration ≤ max_minutes`. Schedule UI's slider ranges 0–180. |
| Time-of-day availability | `start` (ISO UTC), `end` | Convert to user's tz, then test against their availability window. The `timezone` field is the *teacher's* zone, not the user's. |
| Skip cancelled | `is_cancelled` | reject if true |
| Skip full classes | `enrolled` vs `max_capacity` | optional: drop if `enrolled >= max_capacity` |
| Member-required vs open | `requires_membership` | If the user isn't a member, you can still return these — but flag them so the agent surfaces the membership requirement. As of this writing **every** class in the public schedule has `requires_membership: true`, so this is informational rather than filtering. |

### 3. Rank

A simple recommended scoring is fine — there's no popularity / rating signal in the response. Suggested ordering:
1. Filter to matches as above.
2. Sort ascending by `start` (soonest first).
3. Tie-break by ascending `enrolled / max_capacity` (less crowded preferred) or by intensity proximity to the requested level.

### 4. Emit the join URL

Canonical user-facing URL for a class:
```
https://app.ompractice.com/c/{slug}?classId={id}
```
Both `{slug}` (from the `slug` field) and `?classId={id}` (from the `id` field) are required — visiting `/c/{slug}` alone may resolve to a different *recurring* instance.

### 5. (Optional) Enrich with public catalog data

If you also need the full set of tags or teacher bios:
- `GET https://api.ompractice.com/api/v1/tags/?categories=AUDI,MOVE&format=json` — 38 tags total across MOVE / AUDI / OUTC categories (the schedule UI only renders MOVE+AUDI, but OUTC tags exist e.g. "Digestive Health", "Veterans-Only").
- `GET https://api.ompractice.com/api/v1/teachers/?format=json` (paginated, `?limit=N&offset=M`) — 56 teachers total with bios, photos, social handles. `/teachers/all/` returns the same data without pagination.

### Browser fallback

Only needed if the API is down or you have to demonstrate the user-visible filter UI. Stealth + proxy NOT required for app.ompractice.com (no anti-bot observed).

1. `browse open https://app.ompractice.com/schedule --remote` — server-side renders the next 7 days of classes as `/c/{slug}?classId={id}` anchors.
2. Click **"Filter Classes"** button (top of the schedule heading). A modal opens with sections: TEACHERS (dropdown), EXPERIENCE LEVEL (3 checkboxes), CLASS LENGTH (0–180 min dual-thumb slider), CLASS TYPE (~20 checkboxes including hierarchical Meditation→{iRest, Sound Bowls, Yoga Nidra} and Yoga→{Chair, Decompress & Rest, Gentle Flow, Power Yoga, Restorative, Yin}), STUDENTS / audience (~14 checkboxes), INTENSITY (Gentle / Moderate / Vigorous / Sweaty with sub-options).
3. Tick desired filters → click **"Show Classes"** at the bottom of the modal.
4. The filtered set re-renders in the main page; each class card has an `href` to `/c/{slug}?classId={id}` — harvest those, plus the visible title / teacher name / start time string per card.

Use the API path unless you're specifically asked to use the UI. The browser path costs ~25–30 actions and ~10 seconds of wait time for the same data the API returns in one HTTP request.

## Site-Specific Gotchas

- **No anti-bot.** Plain `curl` / `fetch` works against `api.ompractice.com` from any IP — no `--verified`, no `--proxies`, no Cloudflare / Akamai. Verified with `browse cloud fetch` both with and without `--proxies`.
- **`?format=json` is mandatory.** Without it the DRF API returns the browsable HTML viewer, which is ~5× larger than the JSON response and unparseable. Set `Accept: application/json` header instead if you prefer header negotiation.
- **`start_date` / `end_date` are the ONLY date filter shape.** Django ORM filters (`start__gte`, `start__lte`), generic params (`from=`, `start_after=`, `date_after=`), and the `ordering=start` param are silently ignored — the unfiltered `/classes/` endpoint returns the full 22,438-record historical dump regardless. Use the date-window pair, or you'll be paginating through 5+ years of expired classes.
- **`ended=false` is required.** Without it, the date-window query includes classes whose `end` time has already passed today — useful for "what just ran" recap but not for upcoming-class discovery.
- **The unfiltered `/classes/` endpoint exposes a sentinel year `0206`.** When sorted, recurring-template records surface with `start: "0206-03-22T17:26:02Z"` — these are placeholder dates for recurrence sources, not real instances. The date-window endpoint excludes them automatically; if you ever query without dates, filter `r['start'][:4] >= '2020'` defensively.
- **`/api/v1/` root returns 401 with a `WWW-Authenticate: JWT realm="api"` header**, suggesting the API is JWT-gated. It's not — sub-resources `/classes/`, `/teachers/`, `/tags/` are unauthenticated. The 401 is just on the DRF root index view. Don't be misled into hunting for JWT credentials.
- **`tags=meditation` filter shape → HTTP 500.** Don't pass a tag name as the filter; the backend coerces to int and crashes. Filter client-side after fetching the date window.
- **`type` is a sparse enum.** Across an upcoming-week sample only `type=0` (regular) and `type=3` (special / members-only specialty class) appear; `type=1` is reserved for one-off events e.g. "SPECIAL CLASS: Spring Equinox Community Gathering". Don't filter by `type` unless the user explicitly says "special events."
- **`exp_lvl: "lots"` exists but is rare in upcoming weeks.** A 14-day window observed only `none` (132) and `some` (50). Treat `lots` as a valid value to allow for, not to assume.
- **`intensity` is numeric, not a label.** The UI shows "Gentle / Moderate / Vigorous / Sweaty" but the data is `0..20`. Mapping: Gentle→{0,1,2}, Moderate→{3,4}, Vigorous→{10}, Sweaty→{20}. Values are sparse — only 7 distinct numeric levels observed.
- **`requires_membership: true` for 100% of upcoming live classes.** This skill returns recommendations; booking still requires the user to subscribe. Surface that requirement in the agent's reply.
- **Timezone confusion.** `start` and `end` are UTC. `timezone` is the *teacher's* IANA zone, not the user's — useful for displaying "the teacher is in EDT" but don't subtract it to localize for the user. Always convert UTC `start` to the user's stated tz before showing.
- **Class URL needs both slug AND classId.** `/c/{slug}?classId={id}` — both required because the same class series (slug) recurs weekly with different `classId`s. Linking to `/c/{slug}` alone resolves to the next upcoming occurrence which may not be the one matched.
- **The `/teachers/all/` route returns unpaginated JSON; the default `/teachers/` route returns DRF-paginated `{count, next, previous, results}`.** Pick the right one based on whether you need the whole roster or just a page.
- **No `_next/data/<buildId>/schedule.json` static route.** The Next.js frontend (build id `m6qOAtPhrnC_VqU5RVFrz` as of 2026-05-19) doesn't expose a JSON server-component data URL for the schedule page — it server-renders the HTML with an embedded API fetch and hydrates from there. Don't bother probing `_next/data/` for the JSON; go to `api.ompractice.com` directly.
- **`is_cancelled: true` instances still appear in the date-window response.** Filter them out client-side.
- **`has_substitute: true` means the listed teacher will be replaced for that occurrence.** Surface this to the user — the actual teacher in-class will differ from `teacher.user.first_name + last_name`.

## Expected Output

```json
{
  "success": true,
  "query": {
    "interests": ["Meditation"],
    "experience_level": "none",
    "intensity": ["Gentle"],
    "duration_min": 15,
    "duration_max": 45,
    "window_start": "2026-05-19T14:00:00Z",
    "window_end": "2026-05-26T14:00:00Z",
    "user_timezone": "America/Los_Angeles"
  },
  "total_matching": 5,
  "classes": [
    {
      "id": 32123,
      "title": "Silent Meditation",
      "teacher": "Beth Ciesco",
      "teacher_slug": "beth-ciesco",
      "start_utc": "2026-05-20T17:15:00Z",
      "start_local": "2026-05-20T10:15:00-07:00",
      "duration_minutes": 15,
      "experience_level": "none",
      "intensity": 1,
      "intensity_label": "Gentle",
      "tags": ["Meditation"],
      "tags_audience": [],
      "requires_membership": true,
      "is_cancelled": false,
      "has_substitute": false,
      "enrolled": 3,
      "max_capacity": 100,
      "recommended_props": "comfortable cushion or chair",
      "short_desc": "...",
      "url": "https://app.ompractice.com/c/silent-meditation-beth-ciesco-wednesday?classId=32123"
    }
    // ... up to N matches sorted by start ascending
  ],
  "membership_note": "All Ompractice live classes require an active membership to attend. This skill returns recommendations only and does not book or pay."
}
```

If nothing matches, return:

```json
{
  "success": true,
  "query": {...},
  "total_matching": 0,
  "classes": [],
  "suggestion": "No classes matched. Try widening the date window, relaxing the intensity/level filter, or removing some interest tags."
}
```

If the API request fails (rare — no anti-bot, no auth):

```json
{
  "success": false,
  "reason": "api_error",
  "status_code": 502,
  "message": "Upstream api.ompractice.com responded 502; retry in 30s."
}
```
