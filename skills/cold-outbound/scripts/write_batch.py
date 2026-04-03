#!/usr/bin/env python3
"""
Write batch JSON data to a file. Reads JSON from stdin, writes to the specified output path.
Prevents subagents from needing inline Python (which triggers shell security prompts).

Usage: echo '{"batch_id": 1, "results": [...]}' | python3 write_batch.py /tmp/cold_enrichment_batch_1.json
   Or: python3 write_batch.py /tmp/cold_enrichment_batch_1.json < /tmp/data.json
"""

import json
import sys


def main():
    if len(sys.argv) < 2:
        print("Usage: echo '{...}' | python3 write_batch.py <output_path>", file=sys.stderr)
        sys.exit(1)

    output_path = sys.argv[1]

    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON on stdin: {e}", file=sys.stderr)
        sys.exit(1)

    with open(output_path, "w") as f:
        json.dump(data, f, indent=2)

    # Report what was written
    if isinstance(data, list):
        count = len(data)
    elif isinstance(data, dict) and "results" in data:
        count = len(data["results"])
    else:
        count = 1

    print(f"Written {count} results to {output_path}")


if __name__ == "__main__":
    main()
