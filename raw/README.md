# Raw Data

Place downloaded source files here before running the local build scripts.

## SSA National Names

Put files named like `yob2023.txt` in:

```text
raw/ssa/national/
```

Each row should be:

```text
name,sex,count
```

## SSA State Names

Put state-level `.txt` or `.csv` files in:

```text
raw/ssa/state/
```

Rows should be:

```text
state,sex,year,name,count
```

The curated NameAtlas builder also accepts CSV files with:

```text
State,Gender,Year,Name,Count
```

The initial database was built from a public CC0 mirror of SSA state rows at:

```text
https://huggingface.co/datasets/snad-space/us-names-by-state
```

## Census First Names

Put the Census first-name CSV at:

```text
raw/census/firstnames.csv
```

The Census builder accepts common column names for rank, count, occurrences per 100k, sex counts, and race/Hispanic-origin counts.

For the curated NameAtlas builder, use the official Census 2020 workbooks:

```text
Names2020_FirstNames_Sex.xlsx
Names2020_FirstNames_RaceHispanic.xlsx
```
