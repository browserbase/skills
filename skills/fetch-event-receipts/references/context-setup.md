# Set up the `catering-agent` Browserbase context

Read this only when the named context is missing, stale, or logged out.

## Important distinction

The Browse CLI name `catering-agent` is a local alias for an opaque Browserbase
context UUID. The alias is stored on the machine running the CLI; it is not a
server-side display name.

Current Browse CLI releases support naming directly:

```bash
browse cloud contexts create --name catering-agent
```

If someone already created the context and shared its UUID privately, save the
local alias without creating another context:

```bash
browse cloud contexts add catering-agent <context-uuid>
```

Do not put the UUID in source code, a public issue, a PR, or a recording.

## Option A: seed logins in a Browserbase session

Create one persistent session and attach the Browse driver. Use the same lock as
normal runs so setup cannot overlap a receipt fetch. Run this entire option in
one long-lived Bash process; do not split its trap and commands across shell
calls:

```bash
context_lock_dir="${TMPDIR:-/tmp}/fetch-event-receipts-catering-agent.lock"
mkdir "$context_lock_dir" 2>/dev/null || {
  printf '%s\n' 'catering-agent is already in use or needs stale-lock review' >&2
  exit 1
}
setup_session_id=''
setup_driver_started=false
setup_cleanup_complete=false

cleanup_context_setup() {
  setup_status=$?
  trap - EXIT HUP INT TERM
  if [[ "$setup_cleanup_complete" != true ]]; then
    if [[ "$setup_driver_started" == true ]]; then
      browse stop --session catering-context-setup >/dev/null 2>&1 || true
    fi
    if [[ -n "$setup_session_id" ]]; then
      browse cloud sessions update "$setup_session_id" \
        --status REQUEST_RELEASE >/dev/null 2>&1 || true
      setup_remote_status=''
      for attempt in {1..30}; do
        setup_remote_status="$(
          browse cloud sessions get "$setup_session_id" 2>/dev/null \
            | sed -n '/^{/,$p' \
            | jq -r '.status // empty'
        )"
        [[ "$setup_remote_status" == COMPLETED ]] && break
        sleep 2
      done
      if [[ "$setup_remote_status" != COMPLETED ]]; then
        printf '%s\n' 'context_setup_cleanup_unconfirmed' >&2
        setup_status=1
      fi
    fi
    if [[ -z "$setup_session_id" || "${setup_remote_status:-}" == COMPLETED ]]; then
      rmdir "$context_lock_dir" 2>/dev/null || setup_status=1
    fi
  fi
  unset setup_connect_url setup_json setup_output
  exit "$setup_status"
}
trap cleanup_context_setup EXIT HUP INT TERM

if setup_output="$(browse cloud sessions create \
  --context-id catering-agent \
  --persist \
  --timeout 900 \
  --no-record-session \
  --no-log-session 2>&1)"; then
  setup_create_status=0
else
  setup_create_status=$?
fi
setup_json="$(printf '%s\n' "$setup_output" | sed -n '/^{/,$p')"
setup_session_id="$(jq -r '
  .id
  | select(type == "string")
  | select(test("^[0-9a-fA-F-]{36}$"))
' <<<"$setup_json" 2>/dev/null || true)"
if ((setup_create_status != 0)); then
  printf '%s\n' 'Browserbase context-setup session creation failed.' >&2
  exit "$setup_create_status"
fi
jq -e '
  (.id | type == "string" and test("^[0-9a-fA-F-]{36}$")) and
  (.connectUrl | type == "string" and test("^wss?://"))
' <<<"$setup_json" >/dev/null || exit 1

setup_session_id="$(jq -r '.id' <<<"$setup_json")"
setup_connect_url="$(jq -r '.connectUrl' <<<"$setup_json")"

browse open https://www.doordash.com \
  --cdp "$setup_connect_url" \
  --session catering-context-setup
setup_driver_started=true
```

Use `browse cloud sessions debug "$setup_session_id"` to obtain the live-view
URL and open it only after confirming it begins with `https://`. The user, not
the agent, completes passwords, SSO, CAPTCHA, and multifactor authentication in
that live view.

Verify DoorDash by navigating to its order/receipt page and confirming
authenticated account content is visible. Do not record account names,
addresses, or order details as setup evidence.

When the DoorDash login is verified, exit the long-lived shell normally. Its
registered trap stops the local driver, requests remote release, polls for
`COMPLETED`, and removes the lock only after that terminal state:

```bash
exit 0
```

Only `COMPLETED` proves the remote session released and context persistence
finished. Disable recordings during login setup so a replay cannot capture
credentials or one-time authentication screens. If cleanup cannot be confirmed,
the trap keeps the lock for stale-lock review.

## Option B: seed from local Chrome with `$cookie-sync`

Use `$cookie-sync` when the user is already logged into DoorDash in a debuggable
local Chrome. Sync only this domain:

```text
doordash.com
```

For a new sync, save the returned Browserbase context UUID under the requested
name:

```bash
browse cloud contexts add catering-agent <returned-context-uuid>
```

To refresh an existing context, resolve `catering-agent` privately and pass the
real UUID to cookie-sync's `--context` option. Do not echo the UUID into public
logs or artifacts.

## Operating rule for the shared context

Keep sessions sequential, use a consistent proxy geography if one is
introduced, and expect DoorDash to expire its login state even though the
Browserbase context itself persists.

Skill runs enforce an atomic local lock so only one session can use the shared
context at a time.

Ramp is not stored in this context. Follow
[ramp-identity-setup.md](ramp-identity-setup.md) separately and keep the
standalone Ramp agent's CLI state isolated from personal Ramp authentication.
