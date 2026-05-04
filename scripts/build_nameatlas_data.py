#!/usr/bin/env python3
"""Build the deployed NameAtlas JSON.

The seven ``DEFAULT_NAMES`` only control the random landing-page selection.
The generated lookup files include every name present in the raw sources.

Preferred inputs:
- raw/ssa/national/names.zip or raw/ssa/national/yobYYYY.txt
- raw/ssa/state/namesbystate.zip or raw/ssa/state/*.csv
- raw/census/Names2020_FirstNames_Sex.xlsx
- raw/census/Names2020_FirstNames_RaceHispanic.xlsx
"""

from __future__ import annotations

import csv
import json
import re
import zipfile
from collections import defaultdict
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
STATE_DIR = ROOT / "raw" / "ssa" / "state"
CENSUS_DIR = ROOT / "raw" / "census"
DATA_DIR = ROOT / "data"
STATE_OUTPUT_DIR = DATA_DIR / "states"

DEFAULT_NAMES = ["Edward", "Esther", "Leo", "Laura", "Kevin", "Kelly", "Jordan"]
NATIONAL_SCHEMA = ["year", "count", "rank", "ratePer100k"]
STATE_SCHEMA = ["count", "rank", "ratePer100k"]
CENSUS_SCHEMA = [
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


def compact_write(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")


def clean_state_outputs() -> None:
    STATE_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for path in STATE_OUTPUT_DIR.glob("*.json"):
        path.unlink()


def parse_year_from_yob_name(name: str) -> int | None:
    match = re.search(r"yob(\d{4})", name, re.IGNORECASE)
    return int(match.group(1)) if match else None


def iter_national_rows():
    zip_path = ROOT / "raw" / "ssa" / "national" / "names.zip"
    if zip_path.exists():
        with zipfile.ZipFile(zip_path) as archive:
            for member in sorted(archive.namelist()):
                year = parse_year_from_yob_name(member)
                if year is None:
                    continue
                with archive.open(member) as handle:
                    reader = csv.reader(line.decode("utf-8") for line in handle)
                    for name, sex, count_text in reader:
                        yield year, sex.upper(), name.upper(), int(count_text)
        return

    for path in sorted((ROOT / "raw" / "ssa" / "national").glob("yob*.txt")):
        year = parse_year_from_yob_name(path.name)
        if year is None:
            continue
        with path.open(newline="", encoding="utf-8") as handle:
            for name, sex, count_text in csv.reader(handle):
                yield year, sex.upper(), name.upper(), int(count_text)


def iter_state_rows():
    zip_path = STATE_DIR / "namesbystate.zip"
    if zip_path.exists():
        with zipfile.ZipFile(zip_path) as archive:
            for member in sorted(archive.namelist()):
                if not member.lower().endswith((".txt", ".csv")):
                    continue
                with archive.open(member) as handle:
                    reader = csv.reader(line.decode("utf-8") for line in handle)
                    for row in reader:
                        if len(row) < 5 or row[0].lower() == "state":
                            continue
                        state, sex, year_text, name, count_text = row[:5]
                        yield int(year_text), state.upper(), sex.upper(), name.upper(), int(count_text)
        return

    source_paths = sorted(STATE_DIR.glob("*.csv"))
    if not source_paths:
        raise SystemExit(f"No state CSV files or namesbystate.zip found in {STATE_DIR}")

    for path in source_paths:
        with path.open(newline="", encoding="utf-8-sig") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                state = (row.get("State") or row.get("state") or "").upper()
                sex = (row.get("Gender") or row.get("Sex") or row.get("sex") or "").upper()
                year = int(row.get("Year") or row.get("year"))
                name = (row.get("Name") or row.get("name") or "").upper()
                count = int(row.get("Count") or row.get("count"))
                yield year, state, sex, name, count


def build_national_from_official_rows() -> bool:
    rows_by_year_sex: dict[tuple[int, str], list[tuple[str, int]]] = defaultdict(list)
    totals: dict[tuple[int, str], int] = defaultdict(int)

    row_count = 0
    for year, sex, name, count in iter_national_rows():
        row_count += 1
        rows_by_year_sex[(year, sex)].append((name, count))
        totals[(year, sex)] += count

    if not row_count:
        return False

    names: dict[str, dict[str, list[list[float | int | None]]]] = defaultdict(lambda: {"M": [], "F": []})
    for (year, sex), rows in sorted(rows_by_year_sex.items()):
        total = totals[(year, sex)]
        for rank, (name, count) in enumerate(sorted(rows, key=lambda item: (-item[1], item[0])), start=1):
            rate = round((count / total) * 100000, 3) if total else None
            names[name].setdefault(sex, []).append([year, count, rank, rate])

    compact_write(
        DATA_DIR / "national.lookup.json",
        {
            "schema": NATIONAL_SCHEMA,
            "defaultNames": DEFAULT_NAMES,
            "meta": {
                "source": "SSA national public rows",
                "latestYear": max(year for year, _sex in rows_by_year_sex),
                "nationalCountsNote": "Official SSA national public rows.",
            },
            "names": dict(sorted(names.items())),
        },
    )
    return True


def build_national_from_state_aggregates(national_counts, national_totals) -> None:
    names: dict[str, dict[str, list[list[float | int | None]]]] = defaultdict(lambda: {"M": [], "F": []})

    by_year_sex: dict[tuple[int, str], list[tuple[str, int]]] = defaultdict(list)
    for (year, sex, name), count in national_counts.items():
        by_year_sex[(year, sex)].append((name, count))

    for (year, sex), rows in sorted(by_year_sex.items()):
        total = national_totals[(year, sex)]
        for rank, (name, count) in enumerate(sorted(rows, key=lambda item: (-item[1], item[0])), start=1):
            rate = round((count / total) * 100000, 3) if total else None
            names[name].setdefault(sex, []).append([year, count, rank, rate])

    compact_write(
        DATA_DIR / "national.lookup.json",
        {
            "schema": NATIONAL_SCHEMA,
            "defaultNames": DEFAULT_NAMES,
            "meta": {
                "source": "SSA state-level public rows, aggregated by NameAtlas",
                "latestYear": max(year for year, _sex, _name in national_counts),
                "nationalCountsNote": "Approximate: national trends are summed from visible state rows, so suppressed state cells are not included.",
            },
            "names": dict(sorted(names.items())),
        },
    )


def build_ssa() -> list[int]:
    state_rows: dict[tuple[int, str, str], list[tuple[str, int]]] = defaultdict(list)
    state_totals: dict[tuple[int, str, str], int] = defaultdict(int)
    national_counts: dict[tuple[int, str, str], int] = defaultdict(int)
    national_totals: dict[tuple[int, str], int] = defaultdict(int)

    for year, state, sex, name, count in iter_state_rows():
        national_counts[(year, sex, name)] += count
        national_totals[(year, sex)] += count
        state_rows[(year, state, sex)].append((name, count))
        state_totals[(year, state, sex)] += count

    clean_state_outputs()
    yearly_payloads: dict[int, dict] = {}

    for (year, state, sex), rows in sorted(state_rows.items()):
        total = state_totals[(year, state, sex)]
        payload = yearly_payloads.setdefault(
            year,
            {
                "schema": STATE_SCHEMA,
                "year": year,
                "meta": {
                    "source": "SSA state-level public rows",
                    "rateNote": "Rates use visible public rows as the denominator and are approximate.",
                },
                "names": {},
            },
        )
        for rank, (name, count) in enumerate(sorted(rows, key=lambda item: (-item[1], item[0])), start=1):
            rate = round((count / total) * 100000, 3) if total else None
            name_entry = payload["names"].setdefault(name, {"M": {}, "F": {}})
            name_entry[sex][state] = [count, rank, rate]

    years = sorted(yearly_payloads)
    for year in years:
        compact_write(STATE_OUTPUT_DIR / f"{year}.json", yearly_payloads[year])

    compact_write(STATE_OUTPUT_DIR / "index.json", {"years": sorted(years, reverse=True)})
    if not build_national_from_official_rows():
        build_national_from_state_aggregates(national_counts, national_totals)
    return years


def read_census_sheet(path: Path) -> pd.DataFrame:
    return pd.read_excel(path, header=2).rename(columns=lambda col: str(col).strip())


def build_census() -> None:
    sex_path = CENSUS_DIR / "Names2020_FirstNames_Sex.xlsx"
    race_path = CENSUS_DIR / "Names2020_FirstNames_RaceHispanic.xlsx"
    if not sex_path.exists() or not race_path.exists():
        raise SystemExit("Missing Census first-name workbooks in raw/census")

    sex_df = read_census_sheet(sex_path)
    race_df = read_census_sheet(race_path)

    sex_by_name = {str(row["FIRST NAME"]).upper(): row for _, row in sex_df.iterrows()}
    race_by_name = {str(row["FIRST NAME"]).upper(): row for _, row in race_df.iterrows()}

    firstnames = {}
    for name in sorted(set(sex_by_name) | set(race_by_name)):
        sex_row = sex_by_name.get(name)
        race_row = race_by_name.get(name)
        if sex_row is None and race_row is None:
            continue
        rank = value_from(sex_row, "RANK") or value_from(race_row, "RANK")
        count = value_from(sex_row, "FREQUENCY (COUNT)") or value_from(race_row, "FREQUENCY (COUNT)")
        prop100k = value_from(sex_row, "PROPORTION PER 100,000 POPULATION") or value_from(
            race_row,
            "PROPORTION PER 100,000 POPULATION",
        )
        firstnames[name] = [
            rank,
            count,
            prop100k,
            value_from(sex_row, "MALE"),
            value_from(sex_row, "FEMALE"),
            value_from(race_row, "NON-HISPANIC OR LATINO WHITE ALONE"),
            value_from(race_row, "NON-HISPANIC OR LATINO BLACK OR AFRICAN AMERICAN ALONE"),
            value_from(race_row, "NON-HISPANIC OR LATINO AMERICAN INDIAN AND ALASKA NATIVE ALONE"),
            value_from(race_row, "NON-HISPANIC OR LATINO ASIAN AND NATIVE HAWAIIAN AND OTHER PACIFIC ISLANDER ALONE"),
            value_from(race_row, "NON-HISPANIC OR LATINO TWO OR MORE RACES"),
            value_from(race_row, "HISPANIC OR LATINO ORIGIN"),
        ]

    compact_write(
        DATA_DIR / "census_firstnames.lookup.json",
        {
            "schema": CENSUS_SCHEMA,
            "defaultNames": DEFAULT_NAMES,
            "meta": {"source": "U.S. Census Bureau 2020 first-name tables"},
            "firstnames": firstnames,
        },
    )


def value_from(row, column: str):
    if row is None:
        return None
    value = row.get(column)
    if pd.isna(value):
        return None
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def main() -> None:
    years = build_ssa()
    build_census()
    national = json.loads((DATA_DIR / "national.lookup.json").read_text(encoding="utf-8"))
    census = json.loads((DATA_DIR / "census_firstnames.lookup.json").read_text(encoding="utf-8"))
    print(f"Wrote NameAtlas national data for {len(national['names']):,} names.")
    print(f"Wrote NameAtlas Census data for {len(census['firstnames']):,} first names.")
    print(f"Wrote state map data for {len(years)} state years.")
    print(f"Latest SSA-derived state year: {max(years)}")


if __name__ == "__main__":
    main()
