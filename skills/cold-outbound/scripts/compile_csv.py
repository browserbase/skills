#!/usr/bin/env python3
"""
Compile enrichment batch JSON files into a deduplicated, scored CSV.
Usage: python compile_csv.py <tmp_dir> <company_name> <date>
"""

import csv
import json
import glob
import os
import re
import sys
from collections import Counter

STRIP_SUFFIXES = re.compile(
    r"\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|gmbh|ag|sa|sas|bv|pty|plc|nv|se|ab)\.?\b",
    re.IGNORECASE,
)


def normalize_name(name: str) -> str:
    """Normalize company name for deduplication."""
    name = name.lower().strip()
    name = STRIP_SUFFIXES.sub("", name)
    name = re.sub(r"[^a-z0-9 ]", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


def load_batches(tmp_dir: str) -> list[dict]:
    """Load all enrichment batch files and extract company records."""
    pattern = os.path.join(tmp_dir, "cold_enrichment_batch_*.json")
    files = sorted(glob.glob(pattern))

    if not files:
        print(f"No batch files found matching {pattern}", file=sys.stderr)
        return []

    records = []
    for f in files:
        try:
            with open(f) as fh:
                data = json.load(fh)
            # Handle both array format and { results: [...] } format
            if isinstance(data, list):
                records.extend(data)
            elif isinstance(data, dict) and "results" in data:
                records.extend(data["results"])
            else:
                print(f"Warning: unexpected format in {f}", file=sys.stderr)
        except (json.JSONDecodeError, IOError) as e:
            print(f"Warning: skipping {f}: {e}", file=sys.stderr)

    return records


def deduplicate(records: list[dict]) -> tuple[list[dict], int]:
    """Deduplicate by normalized company name, keeping highest ICP score."""
    seen: dict[str, dict] = {}

    for rec in records:
        name = rec.get("company_name", "")
        key = normalize_name(name)
        if not key:
            continue

        score = int(rec.get("icp_fit_score", 0))
        existing = seen.get(key)
        if existing is None or score > int(existing.get("icp_fit_score", 0)):
            seen[key] = rec

    deduped = sorted(seen.values(), key=lambda r: int(r.get("icp_fit_score", 0)), reverse=True)
    removed = len(records) - len(deduped)
    return deduped, removed


def write_csv(records: list[dict], output_path: str) -> list[str]:
    """Write records to CSV, return column names used."""
    if not records:
        return []

    # Collect all keys across records, with priority columns first
    priority = [
        "company_name", "website", "product_description",
        "icp_fit_score", "icp_fit_reasoning", "personalized_email",
    ]
    all_keys = set()
    for r in records:
        all_keys.update(r.keys())

    # Remove internal fields
    all_keys.discard("fetch_method")

    columns = [k for k in priority if k in all_keys]
    columns += sorted(k for k in all_keys if k not in priority)

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=columns, quoting=csv.QUOTE_ALL, extrasaction="ignore")
        writer.writeheader()
        for rec in records:
            # Join any array fields with pipe delimiter
            row = {}
            for k in columns:
                val = rec.get(k, "")
                if isinstance(val, list):
                    val = " | ".join(str(v) for v in val)
                row[k] = val
            writer.writerow(row)

    return columns


def score_distribution(records: list[dict]) -> dict:
    """Calculate ICP score distribution across bands."""
    bands = {"high_8_10": 0, "medium_5_7": 0, "low_1_4": 0}
    for rec in records:
        score = int(rec.get("icp_fit_score", 0))
        if score >= 8:
            bands["high_8_10"] += 1
        elif score >= 5:
            bands["medium_5_7"] += 1
        else:
            bands["low_1_4"] += 1
    return bands


def main():
    if len(sys.argv) < 4:
        print("Usage: python compile_csv.py <tmp_dir> <company_name> <date> [--no-cleanup]", file=sys.stderr)
        sys.exit(1)

    tmp_dir = sys.argv[1]
    company_name = sys.argv[2]
    date_str = sys.argv[3]
    no_cleanup = "--no-cleanup" in sys.argv

    # Load and process
    records = load_batches(tmp_dir)
    if not records:
        print(json.dumps({"error": "No records found", "total_leads": 0}))
        sys.exit(0)

    deduped, removed = deduplicate(records)

    # Write CSV
    safe_name = re.sub(r"[^a-zA-Z0-9_-]", "_", company_name)
    output_file = f"{safe_name}_outbound_{date_str}.csv"
    columns = write_csv(deduped, output_file)

    # Summary
    summary = {
        "total_leads": len(deduped),
        "duplicates_removed": removed,
        "score_distribution": score_distribution(deduped),
        "columns": columns,
        "output_file": output_file,
    }

    print(json.dumps(summary, indent=2))

    # Cleanup batch files (skip with --no-cleanup for interim compilations)
    if not no_cleanup:
        for pattern_name in ["cold_enrichment_batch_*.json", "cold_discovery_batch_*.json", "cold_final_batch_*.json"]:
            for f in glob.glob(os.path.join(tmp_dir, pattern_name)):
                os.remove(f)


if __name__ == "__main__":
    main()
