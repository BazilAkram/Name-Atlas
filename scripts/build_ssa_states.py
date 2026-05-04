#!/usr/bin/env python3
"""Build compact per-year state SSA first-name JSON from state-level files."""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INPUT_DIR = ROOT / "raw" / "ssa" / "state"
OUTPUT_DIR = ROOT / "data" / "states"
SCHEMA = ["count", "rank", "ratePer100k"]


def iter_source_files() -> list[Path]:
    return sorted(
        path for path in INPUT_DIR.rglob("*")
        if path.is_file() and path.suffix.lower() in {".txt", ".csv"}
    )


def main() -> None:
    rows_by_year_state_sex: dict[tuple[int, str, str], list[tuple[str, int]]] = defaultdict(list)
    visible_totals: dict[tuple[int, str, str], int] = defaultdict(int)

    for path in iter_source_files():
        with path.open(newline="", encoding="utf-8") as handle:
            reader = csv.reader(handle)
            for row in reader:
                if len(row) < 5 or row[0].lower() == "state":
                    continue
                state, sex, year_text, name, count_text = row[:5]
                year = int(year_text)
                sex = sex.upper()
                state = state.upper()
                count = int(count_text)
                key = (year, state, sex)
                rows_by_year_state_sex[key].append((name.upper(), count))
                visible_totals[key] += count

    yearly_payloads: dict[int, dict] = {}

    for (year, state_abbr, sex), rows in sorted(rows_by_year_state_sex.items()):
        payload = yearly_payloads.setdefault(year, {"schema": SCHEMA, "year": year, "names": {}})
        ranked = sorted(rows, key=lambda item: (-item[1], item[0]))
        total = visible_totals[(year, state_abbr, sex)]
        for index, (name, count) in enumerate(ranked, start=1):
            rate = round((count / total) * 100000, 3) if total else None
            name_entry = payload["names"].setdefault(name, {"M": {}, "F": {}})
            name_entry.setdefault(sex, {})[state_abbr] = [count, index, rate]

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    years = sorted(yearly_payloads)
    for year in years:
        output_path = OUTPUT_DIR / f"{year}.json"
        output_path.write_text(json.dumps(yearly_payloads[year], separators=(",", ":")), encoding="utf-8")
        print(f"Wrote {output_path}")

    index_path = OUTPUT_DIR / "index.json"
    index_path.write_text(json.dumps({"years": sorted(years, reverse=True)}, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {index_path}")


if __name__ == "__main__":
    main()
