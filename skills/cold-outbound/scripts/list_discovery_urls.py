#!/usr/bin/env python3
"""
List deduplicated URLs from discovery batch files.
Reads all /tmp/cold_discovery_batch_*.json files and outputs one URL per line,
deduplicated by domain. This prevents the main agent from needing to read
or merge raw JSON batch files.

Usage: python list_discovery_urls.py <tmp_dir>
"""

import json
import glob
import os
import sys
from urllib.parse import urlparse


def extract_domain(url: str) -> str:
    """Extract domain from URL, stripping www. prefix."""
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        if domain.startswith("www."):
            domain = domain[4:]
        return domain
    except Exception:
        return url.lower()


def main():
    if len(sys.argv) < 2:
        print("Usage: python list_discovery_urls.py <tmp_dir>", file=sys.stderr)
        sys.exit(1)

    tmp_dir = sys.argv[1]
    pattern = os.path.join(tmp_dir, "cold_discovery_batch_*.json")
    files = sorted(glob.glob(pattern))

    if not files:
        print(f"No discovery batch files found matching {pattern}", file=sys.stderr)
        sys.exit(0)

    seen_domains = set()
    urls_out = []

    for f in files:
        try:
            with open(f) as fh:
                data = json.load(fh)
            if not isinstance(data, list):
                print(f"Warning: unexpected format in {f}", file=sys.stderr)
                continue
            for item in data:
                url = item.get("url", "")
                if not url:
                    continue
                domain = extract_domain(url)
                if domain and domain not in seen_domains:
                    seen_domains.add(domain)
                    urls_out.append(url)
        except (json.JSONDecodeError, IOError) as e:
            print(f"Warning: skipping {f}: {e}", file=sys.stderr)

    # Output one URL per line
    for url in urls_out:
        print(url)

    # Summary to stderr so it doesn't mix with URL output
    print(f"\n{len(urls_out)} unique URLs from {len(files)} batch files", file=sys.stderr)


if __name__ == "__main__":
    main()
