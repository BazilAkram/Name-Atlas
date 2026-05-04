# NameAtlas

NameAtlas is a lightweight static GitHub Pages app for exploring U.S. baby first-name trends and first-name demographics.

It uses only browser-native frontend files:

- `index.html`
- `style.css`
- `app.js`
- compact static JSON files in `data/`
- a static SVG state map in `data/maps/us-states.svg`

There is no backend, no database, no framework, and no build step for the deployed app.

## Run Locally

Browser `fetch()` calls usually fail from `file://`, so serve the folder locally:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

The bundled static database uses real data for all names present in the prepared SSA and Census source files. The random starting names are `Edward`, `Esther`, `Leo`, `Laura`, `Kevin`, `Kelly`, and `Jordan`; one is selected each time the page loads.

## Rebuild Data

Download raw SSA and Census source files into `raw/`.

SSA national files:

```text
raw/ssa/national/yob2023.txt
raw/ssa/national/yob2022.txt
...
```

SSA state files:

```text
raw/ssa/state/
```

Rows should have:

```text
state,sex,year,name,count
```

Then run:

```bash
python scripts/build_ssa_national.py
python scripts/build_ssa_states.py
```

The deployed all-name database can be rebuilt with:

```bash
python scripts/build_nameatlas_data.py
```

This curated builder needs `pandas` and `openpyxl` for the Census Excel files.

That script expects SSA state CSV files in `raw/ssa/state/` with columns:

```text
State,Gender,Year,Name,Count
```

It also expects the Census 2020 first-name workbooks:

```text
raw/census/Names2020_FirstNames_Sex.xlsx
raw/census/Names2020_FirstNames_RaceHispanic.xlsx
```

For Census first-name data, place a CSV at:

```text
raw/census/firstnames.csv
```

Then run:

```bash
python scripts/build_census_firstnames.py
```

You can also pass a different Census CSV path:

```bash
python scripts/build_census_firstnames.py path/to/firstnames.csv
```

## Deploy To GitHub Pages

Commit the static files and enable GitHub Pages for the repository branch in GitHub settings. Because the app uses relative paths such as `fetch("data/national.lookup.json")`, it can run from a project page path like:

```text
https://USERNAME.github.io/REPO_NAME/
```

## Data Caveats

SSA newborn data is based on Social Security card applications. State data is by state of birth, not current residence. Names and cells with fewer than 5 births are suppressed for privacy, so missing state/year/name entries mean "not shown / suppressed / fewer than 5 / unavailable," not necessarily true zero.

The bundled national trend JSON is built from the official SSA national public rows when `raw/ssa/national/names.zip` is present. The state map uses real state-level public rows. Rates are approximate when calculated from public rows because suppressed rows are not included in visible totals.

Census first-name profiles, when available, describe all people with that first name in the 2020 Census. They should not be read as demographics of newborns receiving that name.
