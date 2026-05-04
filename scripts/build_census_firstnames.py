#!/usr/bin/env python3
"""Build compact Census 2020 first-name lookup JSON from a CSV export.

The script is intentionally tolerant of common column names. Put a CSV at
raw/census/firstnames.csv, or pass a different file path as the first argument.
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "raw" / "census" / "firstnames.csv"
OUTPUT_PATH = ROOT / "data" / "census_firstnames.lookup.json"
SCHEMA = [
    "rank",
    "count",
    "prop100k",
    "countmale",
    "countfemale",
    "countwhite",
    "countblack",
    "countaian",
    "countapi",
    "count2prace",
    "counthispanic",
]

ALIASES = {
    "name": ["name", "firstname", "first_name", "first"],
    "rank": ["rank"],
    "count": ["count", "total", "n"],
    "prop100k": ["prop100k", "per100k", "pct100k", "rate100k"],
    "countmale": ["countmale", "male", "male_count"],
    "countfemale": ["countfemale", "female", "female_count"],
    "countwhite": ["countwhite", "white", "nh_white"],
    "countblack": ["countblack", "black", "nh_black"],
    "countaian": ["countaian", "aian", "nh_aian"],
    "countapi": ["countapi", "api", "asian_api", "nh_api"],
    "count2prace": ["count2prace", "two_or_more", "nh_two_or_more"],
    "counthispanic": ["counthispanic", "hispanic", "latino"],
}


def normalize_header(value: str) -> str:
    return "".join(char for char in value.strip().lower() if char.isalnum() or char == "_")


def find_column(headers: list[str], field: str) -> str | None:
    normalized = {normalize_header(header): header for header in headers}
    for alias in ALIASES[field]:
        key = normalize_header(alias)
        if key in normalized:
            return normalized[key]
    return None


def parse_number(value: str | None) -> int | float | None:
    if value is None:
        return None
    cleaned = value.strip().replace(",", "").replace("%", "")
    if not cleaned:
        return None
    number = float(cleaned)
    return int(number) if number.is_integer() else number


def main() -> None:
    input_path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_INPUT
    firstnames = {}

    with input_path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise SystemExit(f"No header row found in {input_path}")
        columns = {field: find_column(reader.fieldnames, field) for field in ["name", *SCHEMA]}
        if not columns["name"]:
            raise SystemExit("Could not find a first-name column")

        for row in reader:
            name = (row.get(columns["name"]) or "").strip().upper()
            if not name:
                continue
            firstnames[name] = [parse_number(row.get(columns[field])) if columns[field] else None for field in SCHEMA]

    payload = {"schema": SCHEMA, "firstnames": dict(sorted(firstnames.items()))}
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH} with {len(firstnames):,} first names")


if __name__ == "__main__":
    main()
