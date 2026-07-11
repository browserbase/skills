#!/usr/bin/env python3
"""Browserbase Agents API CLI — create agents, trigger runs, poll to completion.

Zero dependencies (Python 3.8+ stdlib only).

Auth: set BROWSERBASE_API_KEY in the environment, or pass --api-key.

Commands:
  create        Create a reusable agent from a JSON payload file
  update        Update an existing agent (partial body)
  run           Trigger a run (against an agent or ad-hoc)
  get           Fetch a run's status and result
  poll          Poll a run until it reaches a terminal state
  messages      Fetch a run's step-by-step transcript
  list-agents   List agents on the account
  list-runs     List runs (filter by agent / status)
  downloads     List files downloaded during a run's session
  delete        Delete an agent

Examples:
  bb_agents.py create --file agent.json
  bb_agents.py run --agent-id <id> --task "Search for %query%" \
      --var query="wireless earbuds" --var max_pages=1 --proxies
  bb_agents.py poll <runId>
  bb_agents.py messages <runId>
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.browserbase.com/v1"
TERMINAL = {"COMPLETED", "FAILED", "STOPPED", "TIMED_OUT"}


def request(method, path, api_key, body=None, params=None):
    url = f"{API}{path}"
    if params:
        url += "?" + urllib.parse.urlencode({k: v for k, v in params.items() if v})
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"x-bb-api-key": api_key, "Content-Type": "application/json"},
        method=method,
    )
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code} {method} {path}: {e.read().decode()[:1000]}")


def parse_vars(pairs):
    """--var key=value [--var-desc key='hint'] -> variables object."""
    out = {}
    for pair in pairs or []:
        if "=" not in pair:
            sys.exit(f"--var must be key=value, got: {pair}")
        k, v = pair.split("=", 1)
        out[k] = {"value": v}
    return out


def cmd_create(args, key):
    payload = json.load(open(args.file))
    agent = request("POST", "/agents", key, body=payload)
    print(json.dumps(agent, indent=2))


def cmd_update(args, key):
    payload = json.load(open(args.file))
    agent = request("POST", f"/agents/{args.agent_id}", key, body=payload)
    print(json.dumps(agent, indent=2))


def cmd_run(args, key):
    body = {"task": args.task}
    if args.agent_id:
        body["agentId"] = args.agent_id
    variables = parse_vars(args.var)
    if variables:
        body["variables"] = variables
    if args.schema_file:
        body["resultSchema"] = json.load(open(args.schema_file))
    settings = {}
    if args.proxies:
        settings["proxies"] = True
    if args.verified:
        settings["verified"] = True
    if args.context_id:
        settings["context"] = {"id": args.context_id, "persist": args.persist_context}
    if settings:
        body["browserSettings"] = settings
    run = request("POST", "/agents/runs", key, body=body)
    print(json.dumps(run, indent=2))
    if args.wait:
        poll(run["runId"], key, args.interval, args.timeout)


def cmd_get(args, key):
    print(json.dumps(request("GET", f"/agents/runs/{args.run_id}", key), indent=2))


def poll(run_id, key, interval, timeout):
    deadline = time.time() + timeout
    while time.time() < deadline:
        run = request("GET", f"/agents/runs/{run_id}", key)
        status = run.get("status")
        print(f"{time.strftime('%H:%M:%S')} {status}", file=sys.stderr)
        if status in TERMINAL:
            print(json.dumps(run, indent=2))
            return run
        time.sleep(interval)
    sys.exit(f"Timed out after {timeout}s waiting for run {run_id}")


def cmd_poll(args, key):
    poll(args.run_id, key, args.interval, args.timeout)


def cmd_messages(args, key):
    params = {"since": args.since} if args.since else None
    msgs = request("GET", f"/agents/runs/{args.run_id}/messages", key, params=params)
    print(json.dumps(msgs, indent=2))


def cmd_list_agents(args, key):
    print(json.dumps(request("GET", "/agents", key, params={"cursor": args.cursor}), indent=2))


def cmd_list_runs(args, key):
    params = {"agentId": args.agent_id, "status": args.status,
              "limit": args.limit, "cursor": args.cursor}
    print(json.dumps(request("GET", "/agents/runs", key, params=params), indent=2))


def cmd_downloads(args, key):
    print(json.dumps(request("GET", "/downloads", key, params={"sessionId": args.session_id}), indent=2))


def cmd_delete(args, key):
    request("DELETE", f"/agents/{args.agent_id}", key)
    print(f"Deleted agent {args.agent_id}")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--api-key", default=os.environ.get("BROWSERBASE_API_KEY"))
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("create", help="Create an agent from a JSON payload file")
    s.add_argument("--file", required=True, help="JSON file: {name, systemPrompt, resultSchema}")
    s.set_defaults(fn=cmd_create)

    s = sub.add_parser("update", help="Update an agent (partial body)")
    s.add_argument("agent_id")
    s.add_argument("--file", required=True)
    s.set_defaults(fn=cmd_update)

    s = sub.add_parser("run", help="Trigger a run")
    s.add_argument("--agent-id", help="Omit for an ad-hoc run")
    s.add_argument("--task", required=True)
    s.add_argument("--var", action="append", help="key=value, repeatable; referenced as %%key%% in prompts")
    s.add_argument("--schema-file", help="Per-run resultSchema override (JSON file)")
    s.add_argument("--proxies", action="store_true")
    s.add_argument("--verified", action="store_true")
    s.add_argument("--context-id")
    s.add_argument("--persist-context", action="store_true")
    s.add_argument("--wait", action="store_true", help="Poll to completion after starting")
    s.add_argument("--interval", type=int, default=10)
    s.add_argument("--timeout", type=int, default=1800)
    s.set_defaults(fn=cmd_run)

    s = sub.add_parser("get", help="Fetch a run")
    s.add_argument("run_id")
    s.set_defaults(fn=cmd_get)

    s = sub.add_parser("poll", help="Poll a run until terminal")
    s.add_argument("run_id")
    s.add_argument("--interval", type=int, default=10)
    s.add_argument("--timeout", type=int, default=1800)
    s.set_defaults(fn=cmd_poll)

    s = sub.add_parser("messages", help="Fetch run transcript")
    s.add_argument("run_id")
    s.add_argument("--since", help="Message ID cursor (nextSince from previous call)")
    s.set_defaults(fn=cmd_messages)

    s = sub.add_parser("list-agents")
    s.add_argument("--cursor")
    s.set_defaults(fn=cmd_list_agents)

    s = sub.add_parser("list-runs")
    s.add_argument("--agent-id")
    s.add_argument("--status", choices=sorted(TERMINAL | {"PENDING", "RUNNING"}))
    s.add_argument("--limit", type=int, default=20)
    s.add_argument("--cursor")
    s.set_defaults(fn=cmd_list_runs)

    s = sub.add_parser("downloads", help="List files from a run's session")
    s.add_argument("session_id")
    s.set_defaults(fn=cmd_downloads)

    s = sub.add_parser("delete", help="Delete an agent")
    s.add_argument("agent_id")
    s.set_defaults(fn=cmd_delete)

    args = p.parse_args()
    if not args.api_key:
        sys.exit("Set BROWSERBASE_API_KEY or pass --api-key")
    args.fn(args, args.api_key)


if __name__ == "__main__":
    main()
