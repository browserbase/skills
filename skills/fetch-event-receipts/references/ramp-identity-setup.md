# Set up the standalone Ramp receipt identity

Read this before the first live demo or whenever the isolated agent login has
expired.

## Availability and ownership

Ramp currently describes standalone agents as limited early access. If an admin
cannot see **Company > Agents**, stop and request enablement
through <https://agents.ramp.com/> or `agents@ramp.com`. Never include a Client
secret or token in that request.

A standalone agent belongs to the business, receives permissions explicitly
assigned by an admin, has an accountable human owner, and is attributed as the
actor in supported Ramp activity. This is different from ordinary `ramp auth
login`, which acts on behalf of the human who completed browser OAuth.

## One-time admin setup

Require a Ramp admin. In **Roles & Permissions**, create:

```text
Role: Receipt Cleanup Agent Role
Permission: Review and edit transactions
```

Ramp includes **View transactions and reimbursements** as the visibility
dependency. Do not add card controls, bill permissions, approval-policy access,
payment access, or unrelated administrative permissions.

In **Company > Agents**, create:

```text
Agent: <admin-approved receipt-agent display name>
Job: Match final DoorDash catering receipts to exact card transactions and attach them.
Role: Receipt Cleanup Agent Role
Boundary: Cannot spend, approve, pay, edit policy, or operate outside confirmed receipt cleanup.
```

Save the Client ID and Client secret in approved secure storage. The Client ID
is not secret; the Client secret must never enter chat, shell history, source
code, a plaintext file, or recorded terminal output.

Official onboarding instructions:
<https://agents.ramp.com/skills/ramp-onboard-standalone-agent>

## CLI capability check

The standalone flow requires Ramp CLI 0.2.24 or newer; that is the release whose
auth and receipt schemas this skill validated:

```bash
ramp --version
ramp auth login --help
ramp agent list --help
```

The login help must expose `--client-id`; the agent resource may be conditional
on preview enablement. If the CLI is stale, explain that updating changes the
local installation and ask before running `ramp update`. Do not broaden Ramp
permissions to work around a missing command.

Help text is not the final compatibility proof. Before a live upload, the skill's
receipt helper must complete its no-write `--dry_run` and show the expected
`/developer/v1/agent-tools/upload-receipt-file` endpoint, intended transaction
UUID, MIME type, and redacted base64 field.

Before login, an admin must open **Company > Agents**, select the intended
receipt agent, and confirm its display name, active status, accountable owner,
`Receipt Cleanup Agent Role`, and non-secret Client ID against the approved
provisioning record. Preserve that verified display name as the expected actor
for the run. A standalone credential cannot assume it may list the business's
agents; treat `ramp agent list` as optional rather than an identity-proof
prerequisite. Directory naming and scopes are not identity proof. Do not use the
admin's human session for the receipt run.

For a recorded demo, capture this setup surface separately if it contains no
unapproved private data. It proves the identity and permissions, not that the
identity performed a later receipt upload.

## Isolated runtime login

Every command for the standalone identity uses its own config directory:

```bash
ramp_agent_config_home="$HOME/.config/ramp-agents/catering-receipt-agent"
```

That directory is a stable local alias, not the Ramp activity display name.
After a demo upload, the attributed Ramp activity actor must match the
admin-verified agent (Ramp may render it as `<display name> (Agent)`).

Open a private local terminal prompt where the user can enter the Client secret
without echo. The authentication call is:

```bash
RAMP_CLIENT_SECRET="$secret" \
XDG_CONFIG_HOME="$ramp_agent_config_home" \
ramp --env production auth login \
  --client-id "$RAMP_CLIENT_ID" \
  --scope transactions:read \
  --scope receipts:write
```

Do not ask the user to paste the secret into chat or a visible command. Hold it
only for the login process, then unset it. Verify the isolated identity without
touching the operator's personal CLI state:

```bash
XDG_CONFIG_HOME="$ramp_agent_config_home" \
ramp --env production auth status
```

Then run one small read-only transaction query under the same prefix. A
successful auth status alone proves neither the expected identity nor permission
correctness. For the demo, perform a fresh client-credential login with the
exact Client ID verified above instead of relying only on cached config state.
If the principal cannot be tied back to that login, stop before reads or writes.

Standalone-agent access tokens do not refresh automatically. When an unattended
or long-running runtime receives an auth-expiry error, repeat the client-
credential login through the secure secret mechanism; do not fall back to the
operator's personal Ramp session.
