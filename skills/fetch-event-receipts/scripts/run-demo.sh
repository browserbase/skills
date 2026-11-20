#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
export BROWSE_DISABLE_UPDATE_CHECK=1 NO_COLOR=1 RAMP_DISABLE_UPDATE_CHECK=1

skill_root="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
demo_registry="${HOME}/.config/fetch-event-receipts/demo-targets.json"
ramp_config_home="${HOME}/.config/ramp-agents/catering-receipt-agent"
target_date="" amount_hint_minor="" amount_tolerance_minor="" attach=false

usage() {
  printf '%s\n' 'Usage: run-demo.sh --date YYYY-MM-DD --amount-hint-minor CENTS --amount-tolerance-minor CENTS [--attach] [--demo-registry ABSOLUTE_PATH]'
}

while (($#)); do
  case "$1" in
    --date) target_date="${2:-}"; shift 2 ;;
    --amount-hint-minor) amount_hint_minor="${2:-}"; shift 2 ;;
    --amount-tolerance-minor) amount_tolerance_minor="${2:-}"; shift 2 ;;
    --attach) attach=true; shift ;;
    --demo-registry) demo_registry="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done

[[ "$target_date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { printf 'Stopped: provide the date as YYYY-MM-DD.\n' >&2; exit 2; }
[[ "$amount_hint_minor" =~ ^[0-9]+$ && "$amount_tolerance_minor" =~ ^[0-9]+$ ]] || { printf 'Stopped: amount hint and tolerance must be integer cents.\n' >&2; exit 2; }
[[ "$demo_registry" = /* && -f "$demo_registry" && ! -L "$demo_registry" ]] || { printf 'Stopped: the private demo target registry is unavailable.\n' >&2; exit 1; }

run_dir="$(mktemp -d "${TMPDIR:-/tmp}/fetch-event-receipt.XXXXXX")"
chmod 700 "$run_dir"
run_log="$run_dir/run.log"
session_id_file="$run_dir/browserbase-session-id"
viewer_ready_file="$run_dir/viewer-ready.json"
receipt_pdf="$run_dir/doordash-receipt.pdf"
: >"$session_id_file"
chmod 600 "$session_id_file"
viewer_pid="" browserbase_session_id="" driver_session="" receipt_base64="" stage="setup"

cleanup() {
  local exit_code=$?
  trap - EXIT ERR INT TERM
  unset receipt_base64
  [[ -z "$driver_session" ]] || browse stop --session "$driver_session" >>"$run_log" 2>&1 || true
  [[ -z "$browserbase_session_id" ]] || browse cloud sessions update "$browserbase_session_id" --status REQUEST_RELEASE >>"$run_log" 2>&1 || true
  : >"$session_id_file"
  if [[ -n "$viewer_pid" ]] && kill -0 "$viewer_pid" 2>/dev/null; then kill "$viewer_pid" 2>/dev/null || true; wait "$viewer_pid" 2>/dev/null || true; fi
  ((exit_code == 0)) || printf 'Stopped at %s. No automatic retry was attempted.\n' "$stage" >&2
  exit "$exit_code"
}
trap cleanup EXIT ERR INT TERM

last_json() { sed -n '/^[[:space:]]*[{[]/,$p' | jq -s 'if length > 0 then .[-1] else error("missing JSON response") end'; }

load_env_value() {
  local key="$1" env_file="$2" value
  value="$(awk -v key="$key" '$0 ~ "^[[:space:]]*(export[[:space:]]+)?" key "=" { sub("^[[:space:]]*(export[[:space:]]+)?" key "=", ""); print; exit }' "$env_file")"
  if [[ "$value" == \"*\" && "$value" == *\" ]]; then value="${value:1:${#value}-2}"; fi
  if [[ "$value" == \'*\' && "$value" == *\' ]]; then value="${value:1:${#value}-2}"; fi
  [[ -n "$value" ]] || return 1
  printf -v "$key" '%s' "$value"
  case "$key" in
    BROWSERBASE_API_KEY) export BROWSERBASE_API_KEY ;;
    BROWSERBASE_PROJECT_ID) export BROWSERBASE_PROJECT_ID ;;
  esac
}

target_record="$(jq -cer --arg date "$target_date" --argjson hint "$amount_hint_minor" --argjson tolerance "$amount_tolerance_minor" '
  [.targets[] | select((.merchant | ascii_downcase) == "doordash" and .date == $date and .amount_hint_minor == $hint and .amount_tolerance_minor == $tolerance)]
  | if length == 1 then .[0] else error("demo target is not unique") end
' "$demo_registry")" || { printf 'Stopped: the demo request did not resolve to exactly one configured target.\n' >&2; exit 1; }
transaction_uuid="$(jq -er '.transaction_uuid | select(type == "string" and length > 0)' <<<"$target_record")"
doordash_order_url="$(jq -er '.order_url | select(type == "string") | select(test("^https://www\\.doordash\\.com/orders/[0-9A-Fa-f-]{36}/?$"))' <<<"$target_record")"

if [[ -z "${BROWSERBASE_API_KEY:-}" || -z "${BROWSERBASE_PROJECT_ID:-}" ]]; then
  browserbase_env_file="$(jq -er '.browserbase_env_file // empty' "$demo_registry")" || true
  [[ -n "${browserbase_env_file:-}" && "$browserbase_env_file" = /* && -f "$browserbase_env_file" && ! -L "$browserbase_env_file" ]] || { printf 'Stopped: Browserbase credentials are not configured for this demo.\n' >&2; exit 1; }
  [[ -n "${BROWSERBASE_API_KEY:-}" ]] || load_env_value BROWSERBASE_API_KEY "$browserbase_env_file"
  [[ -n "${BROWSERBASE_PROJECT_ID:-}" ]] || load_env_value BROWSERBASE_PROJECT_ID "$browserbase_env_file"
fi
command -v browse >/dev/null; command -v ramp >/dev/null; command -v jq >/dev/null; command -v node >/dev/null

stage="Ramp transaction resolution"
printf '[1/5] Ramp — resolving the matching transaction.\n'
ramp_get_payload="$(jq -cn --arg id "$transaction_uuid" --arg rationale 'Verify the DoorDash transaction before fetching its receipt.' '{id:$id,rationale:$rationale}')"
ramp_detail_raw="$(XDG_CONFIG_HOME="$ramp_config_home" ramp --env production --agent transactions get --json "$ramp_get_payload" 2>>"$run_log")"
ramp_detail="$(last_json <<<"$ramp_detail_raw")"
transaction_record="$(jq -cer --arg id "$transaction_uuid" '[.. | objects | select(.id? == $id) | select(.amount_decimal? != null and .merchant_name? != null and .currency? != null)] | unique_by(.id) | if length == 1 then .[0] else error("transaction response was not unique") end' <<<"$ramp_detail")"
target_amount_minor="$(jq -er '.amount_decimal | select(type == "string" and test("^[0-9]+(\\.[0-9]{1,2})?$")) | split(".") as $parts | (($parts[0] | tonumber) * 100) + (((($parts[1] // "") + "00")[0:2]) | tonumber)' <<<"$transaction_record")"
target_merchant="$(jq -er '.merchant_name | ascii_downcase' <<<"$transaction_record")"
target_currency="$(jq -er '.currency' <<<"$transaction_record")"
amount_min=$((amount_hint_minor - amount_tolerance_minor)); amount_max=$((amount_hint_minor + amount_tolerance_minor))
[[ "$target_merchant" == *doordash* && "$target_currency" == "USD" && "$target_amount_minor" -ge "$amount_min" && "$target_amount_minor" -le "$amount_max" ]] || { printf 'Stopped: the configured Ramp transaction does not match the requested window.\n' >&2; exit 1; }

if $attach; then
  ramp_list_raw="$(XDG_CONFIG_HOME="$ramp_config_home" ramp --env production --agent transactions list --rationale 'Verify receipt attachment state for the exact demo transaction.' --transactions_to_retrieve all_transactions_across_entire_business --from_date "$target_date" --to_date "$target_date" --state cleared --page_size 50 --reason_memo_merchant_or_user_name_text_search DOORDASH 2>>"$run_log")"
  ramp_list="$(last_json <<<"$ramp_list_raw")"
  receipt_arrays="$(jq -cer --arg id "$transaction_uuid" '[.. | objects | select((.transaction_uuid? // .id? // "") == $id) | select((.receipt_uuids? | type) == "array") | .receipt_uuids] | unique | if length == 1 then . else error("receipt state unavailable") end' <<<"$ramp_list")" || { printf 'Stopped: Ramp did not return a unique receipt state.\n' >&2; exit 1; }
  [[ "$(jq -r '.[0] | length' <<<"$receipt_arrays")" == "0" ]] || { printf 'Stopped: Ramp already has a receipt. Remove it before recording.\n' >&2; exit 1; }
fi
printf '      Matched exactly $%s on %s.\n' "$(jq -nr --argjson cents "$target_amount_minor" '$cents / 100 | tostring')" "$target_date"

stage="Browserbase session creation"
node "$skill_root/scripts/live-view.mjs" --session-id-file "$session_id_file" --ready-file "$viewer_ready_file" --port 0 >"$run_dir/viewer.log" 2>&1 &
viewer_pid=$!
for _ in {1..100}; do [[ -s "$viewer_ready_file" ]] && break; kill -0 "$viewer_pid" 2>/dev/null || break; sleep 0.05; done
[[ -s "$viewer_ready_file" ]] || { printf 'Stopped: the local live viewer did not start.\n' >&2; exit 1; }
viewer_url="$(jq -er '.url' "$viewer_ready_file")"; open "$viewer_url" >/dev/null 2>&1 || true
printf '[2/5] Browserbase — starting the recorded DoorDash session.\n'
session_raw="$(browse cloud sessions create --context-id catering-agent --persist --timeout 900 --no-log-session --record-session --body '{"userMetadata":{"workflow":"fetch-event-receipts"}}' 2>>"$run_log")"
session_json="$(last_json <<<"$session_raw")"
browserbase_session_id="$(jq -er '.id' <<<"$session_json")"
connect_url="$(jq -er '.connectUrl | select(test("^wss?://"))' <<<"$session_json")"
printf '%s\n' "$browserbase_session_id" >"$session_id_file"; chmod 600 "$session_id_file"
browserbase_session_url="https://www.browserbase.com/sessions/$browserbase_session_id"
printf '      Live view: %s\n' "$browserbase_session_url"

stage="DoorDash order retrieval"
printf '[3/5] DoorDash — opening the matching completed order.\n'
driver_session="event-receipt-${browserbase_session_id%%-*}"
browse open https://www.doordash.com --cdp "$connect_url" --session "$driver_session" >>"$run_log" 2>&1
browse open "$doordash_order_url" --session "$driver_session" --wait domcontentloaded --timeout 30000 >>"$run_log" 2>&1

stage="receipt PDF creation"
printf '[4/5] Receipt — printing the DoorDash order to PDF.\n'
driver_status_raw="$(browse status --session "$driver_session" 2>>"$run_log")"; driver_status="$(last_json <<<"$driver_status_raw")"
target_id="$(jq -er '.selectedTargetId' <<<"$driver_status")"
print_result="$(BROWSERBASE_CONNECT_URL="$connect_url" node "$skill_root/scripts/print-doordash-receipt.mjs" --target-id "$target_id" --output "$receipt_pdf" 2>>"$run_log")"
jq -e '.ok == true' <<<"$print_result" >/dev/null

ramp_transaction_url="https://app.ramp.com/details/transactions/$transaction_uuid"
if $attach; then
  stage="Ramp receipt attachment"
  printf '[5/5] Ramp — attaching the receipt.\n'
  receipt_base64="$(base64 <"$receipt_pdf" | tr -d '\r\n')"
  upload_raw="$(XDG_CONFIG_HOME="$ramp_config_home" ramp --env production --no-input --agent receipts upload --content_type application/pdf --filename doordash-receipt.pdf --file_content_base64 "$receipt_base64" --transaction_uuid "$transaction_uuid" --rationale 'Attach the matched DoorDash receipt to the verified Ramp transaction.' 2>>"$run_log")"
  unset receipt_base64
  upload_json="$(last_json <<<"$upload_raw")"
  receipt_uuid="$(jq -er '.data[0] | select(.attached_to_transaction == true) | .receipt_uuid | select(type == "string" and length > 0)' <<<"$upload_json")"
  result_status="attached"
else
  printf '[5/5] Done — receipt retrieved; no Ramp write requested.\n'
  receipt_uuid=""; result_status="retrieved_only"
fi

open "$ramp_transaction_url" >/dev/null 2>&1 || true

jq -cn --arg status "$result_status" --arg ramp_transaction_url "$ramp_transaction_url" --arg browserbase_session_url "$browserbase_session_url" --arg receipt_pdf "$receipt_pdf" --arg receipt_uuid "$receipt_uuid" '{status:$status,ramp_transaction_url:$ramp_transaction_url,browserbase_session_url:$browserbase_session_url,receipt_pdf:$receipt_pdf} + if $receipt_uuid == "" then {} else {receipt_uuid:$receipt_uuid} end'
