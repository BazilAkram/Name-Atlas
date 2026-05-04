#!/usr/bin/env python3
"""Build compact national SSA first-name JSON from yobYYYY.txt files."""

from __future__ import annotations

import csv
import json
import re
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INPUT_DIR = ROOT / "raw" / "ssa" / "national"
OUTPUT_PATH = ROOT / "data" / "national.lookup.json"
SCHEMA = ["year", "count", "rank", "ratePer100k"]


def parse_year(path: Path) -> int | None:
    match = re.search(r"yob(\d{4})", path.name, re.IGNORECASE)
    return int(match.group(1)) if match else None


def main() -> None:
    rows_by_year_sex: dict[tuple[int, str], list[tuple[str, int]]] = defaultdict(list)
    visible_totals: dict[tuple[int, str], int] = defaultdict(int)

    for path in sorted(INPUT_DIR.glob("yob*.txt")):
        year = parse_year(path)
        if year is None:
            continue
        with path.open(newline="", encoding="utf-8") as handle:
            for name, sex, count_text in csv.reader(handle):
                sex = sex.upper()
                count = int(count_text)
                key = (year, sex)
                rows_by_year_sex[key].append((name.upper(), count))
                visible_totals[key] += count

    names: dict[str, dict[str, list[list[float | int | None]]]] = defaultdict(lambda: {"M": [], "F": []})

    for (year, sex), rows in sorted(rows_by_year_sex.items()):
        ranked = sorted(rows, key=lambda item: (-item[1], item[0]))
        total = visible_totals[(year, sex)]
        for index, (name, count) in enumerate(ranked, start=1):
            rate = round((count / total) * 100000, 3) if total else None
            names[name].setdefault(sex, []).append([year, count, index, rate])

    payload = {
        "schema": SCHEMA,
        "names": {name: value for name, value in sorted(names.items())},
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH} with {len(payload['names']):,} names")


if __name__ == "__main__":
    main()
