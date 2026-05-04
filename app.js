const DATA_PATHS = {
  national: "data/national.lookup.json",
  census: "data/census_firstnames.lookup.json",
  stateIndex: "data/states/index.json",
  map: "data/maps/us-states.svg"
};

const DEFAULT_NAMES = ["Edward", "Esther", "Leo", "Laura", "Kevin", "Kelly", "Jordan", "Cecil", "Cynthia", "Oliver", "Olivia", "Alexa", "Anakin", "Maverick", "Zelda"];

const STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia"
};

const STATE_ABBRS = new Set(Object.keys(STATE_NAMES));

const state = {
  national: null,
  census: null,
  stateYears: [2023],
  stateDataByYear: new Map(),
  currentName: "AMIR",
  nationalRangeKey: "",
  nationalRangeManual: false,
  lastAutoSexName: ""
};

const els = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  syncThemeToggle();
  bindEvents();
  await loadInitialData();
  setRandomDefaultName();
  await loadMap();
  populateYearSelect();
  await renderCurrentName();
}

function cacheElements() {
  els.form = document.querySelector("#search-form");
  els.themeToggle = document.querySelector("#theme-toggle");
  els.nameInput = document.querySelector("#name-input");
  els.nationalSex = document.querySelector("#national-sex");
  els.nationalStartYear = document.querySelector("#national-start-year");
  els.nationalEndYear = document.querySelector("#national-end-year");
  els.rangeCaption = document.querySelector("#range-caption");
  els.mapYear = document.querySelector("#map-year");
  els.mapSex = document.querySelector("#map-sex");
  els.mapMetric = document.querySelector("#map-metric");
  els.status = document.querySelector("#status");
  els.summarySubtitle = document.querySelector("#summary-subtitle");
  els.summaryStats = document.querySelector("#summary-stats");
  els.countChart = document.querySelector("#count-chart");
  els.rankChart = document.querySelector("#rank-chart");
  els.mapContainer = document.querySelector("#map-container");
  els.mapCaption = document.querySelector("#map-caption");
  els.mapLegend = document.querySelector("#map-legend");
  els.censusProfile = document.querySelector("#census-profile");
  els.tooltip = document.querySelector("#tooltip");
}

function bindEvents() {
  els.themeToggle.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    setTheme(nextTheme, true);
  });

  els.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    state.currentName = normalizeName(els.nameInput.value);
    state.nationalRangeManual = false;
    applyDominantSexForName(state.currentName);
    await renderCurrentName();
  });

  els.nationalSex.addEventListener("change", () => {
    renderCurrentName();
  });

  [els.nationalStartYear, els.nationalEndYear].forEach((control) => {
    control.addEventListener("change", () => {
      state.nationalRangeManual = true;
      renderCurrentName();
    });
  });

  [els.mapYear, els.mapSex, els.mapMetric].forEach((control) => {
    control.addEventListener("change", () => renderCurrentName());
  });
}

async function loadInitialData() {
  const [national, census, yearIndex] = await Promise.all([
    fetchJson(DATA_PATHS.national, true),
    fetchJson(DATA_PATHS.census, false),
    fetchJson(DATA_PATHS.stateIndex, false)
  ]);

  state.national = national || { schema: [], names: {} };
  state.census = census || { schema: [], firstnames: {} };
  if (yearIndex?.years?.length) {
    state.stateYears = yearIndex.years.slice().sort((a, b) => b - a);
  }
}

function setRandomDefaultName() {
  const names = state.national.defaultNames?.length ? state.national.defaultNames : DEFAULT_NAMES;
  const pick = window.NAMEATLAS_INITIAL_NAME || names[Math.floor(Math.random() * names.length)];
  state.currentName = normalizeName(pick);
  const displayName = toTitleCase(state.currentName);
  els.nameInput.value = displayName;
  els.nameInput.placeholder = displayName;
  applyDominantSexForName(state.currentName);
}

function setTheme(theme, persist) {
  const normalized = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = normalized;
  if (persist) {
    try {
      localStorage.setItem("nameatlas-theme", normalized);
    } catch (_error) {
      // Theme persistence is optional; private browsing can block storage.
    }
  }
  syncThemeToggle();
}

function syncThemeToggle() {
  const isDark = document.documentElement.dataset.theme === "dark";
  els.themeToggle.setAttribute("aria-pressed", String(isDark));
  els.themeToggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
  els.themeToggle.title = isDark ? "Switch to light mode" : "Switch to dark mode";
}

async function loadMap() {
  try {
    const response = await fetch(DATA_PATHS.map);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    els.mapContainer.innerHTML = await response.text();
    els.mapContainer.querySelectorAll("[data-state], path[id], path[class], circle[class]").forEach((node) => {
      const abbr = getStateAbbrFromMapNode(node);
      if (!abbr) return;
      node.classList.add("map-state", "missing");
      node.dataset.state = abbr;
      node.setAttribute("aria-label", STATE_NAMES[abbr] || abbr);
      node.addEventListener("mousemove", (event) => showStateTooltip(event, abbr));
      node.addEventListener("mouseleave", hideTooltip);
      node.addEventListener("click", (event) => event.preventDefault());
    });
  } catch (error) {
    els.mapContainer.innerHTML = `<div class="empty">State map could not be loaded from ${DATA_PATHS.map}.</div>`;
    console.warn(error);
  }
}

function getStateAbbrFromMapNode(node) {
  const explicit = (node.dataset.state || node.id || "").toUpperCase();
  if (STATE_ABBRS.has(explicit)) return explicit;

  for (const className of node.classList) {
    const candidate = className.toUpperCase();
    if (STATE_ABBRS.has(candidate)) return candidate;
  }
  return null;
}

function populateYearSelect() {
  els.mapYear.innerHTML = state.stateYears
    .map((year) => `<option value="${year}">${year}</option>`)
    .join("");
}

async function renderCurrentName() {
  const name = normalizeName(state.currentName || els.nameInput.value);
  state.currentName = name;
  els.nameInput.value = toTitleCase(name);
  if (state.lastAutoSexName !== name) {
    applyDominantSexForName(name);
  }

  const nationalEntry = state.national.names?.[name];
  const censusEntry = state.census.firstnames?.[name];

  const hasNational = !!nationalEntry && ["M", "F"].some((sex) => nationalEntry[sex]?.length);
  const hasCensus = !!censusEntry;
  const nationalNote = getNationalNote();
  if (!name) {
    setStatus("Enter a first name to search.");
  } else if (!hasNational && !hasCensus) {
    setStatus(`No data found for <strong>${escapeHtml(toTitleCase(name))}</strong>. Missing names may be suppressed, unavailable, or absent from the bundled data files.`);
  } else {
    const parts = [];
    if (hasNational) parts.push("SSA newborn data");
    if (hasCensus) parts.push("Census profile");
    setStatus(`Showing ${parts.join(" and ")} for <strong>${escapeHtml(toTitleCase(name))}</strong>. ${escapeHtml(nationalNote)}`);
  }

  setupNationalYearControls(name, nationalEntry);
  renderSummary(name, nationalEntry);
  renderNationalCharts(name, nationalEntry);
  await renderMap(name);
  renderCensus(name, censusEntry);
}

function getNationalNote() {
  const note = state.national.meta?.nationalCountsNote || "";
  if (note.toLowerCase().includes("official")) {
    return "National charts use official SSA national public rows.";
  }
  if (note.toLowerCase().includes("approximate")) {
    return "National charts are aggregated from visible state rows and are approximate.";
  }
  return "National charts use loaded SSA public rows.";
}

function applyDominantSexForName(name) {
  const dominantSex = getDominantSex(name);
  if (!dominantSex) return;
  els.nationalSex.value = dominantSex;
  els.mapSex.value = dominantSex;
  state.lastAutoSexName = name;
}

function getDominantSex(name) {
  const entry = state.national.names?.[name];
  if (!entry) return null;
  const maleTotal = sum((entry.M || []).map((row) => rowToObject(state.national.schema, row).count || 0));
  const femaleTotal = sum((entry.F || []).map((row) => rowToObject(state.national.schema, row).count || 0));
  const total = maleTotal + femaleTotal;
  if (!total) return null;
  const minorityShare = Math.min(maleTotal, femaleTotal) / total;
  if (total >= 1000 && minorityShare >= 0.1) return "Both";
  if (maleTotal === femaleTotal) return "Both";
  return maleTotal > femaleTotal ? "M" : "F";
}

function setupNationalYearControls(name, nationalEntry) {
  const sexMode = els.nationalSex.value;
  const rows = nationalEntry ? getAllNationalRows(nationalEntry, sexMode) : [];
  const firstYear = min(rows.map((row) => row.year));
  const lastYear = max(rows.map((row) => row.year));
  const rangeKey = name;

  els.nationalStartYear.disabled = !firstYear;
  els.nationalEndYear.disabled = !lastYear;

  if (!firstYear || !lastYear) {
    els.nationalStartYear.value = "";
    els.nationalEndYear.value = "";
    els.rangeCaption.textContent = "No national chart range available for this selection.";
    state.nationalRangeKey = rangeKey;
    return;
  }

  [els.nationalStartYear, els.nationalEndYear].forEach((control) => {
    control.min = String(firstYear);
    control.max = String(lastYear);
  });

  if (state.nationalRangeKey !== rangeKey || !state.nationalRangeManual) {
    els.nationalStartYear.value = String(firstYear);
    els.nationalEndYear.value = String(lastYear);
    state.nationalRangeKey = rangeKey;
  } else {
    const range = getSelectedNationalRange();
    const clampedStart = Math.max(firstYear, Math.min(lastYear, range?.start ?? firstYear));
    const clampedEnd = Math.max(firstYear, Math.min(lastYear, range?.end ?? lastYear));
    els.nationalStartYear.value = String(Math.min(clampedStart, clampedEnd));
    els.nationalEndYear.value = String(Math.max(clampedStart, clampedEnd));
  }

  els.rangeCaption.textContent = `Available ${firstYear}-${lastYear} for ${sexMode}.`;
}

function getSelectedNationalRange() {
  const start = Number(els.nationalStartYear.value);
  const end = Number(els.nationalEndYear.value);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return {
    start: Math.min(start, end),
    end: Math.max(start, end)
  };
}

function getAllNationalRows(entry, sexMode) {
  const schema = state.national.schema;
  const sexes = sexMode === "Both" ? ["M", "F"] : [sexMode];
  return sexes.flatMap((sex) =>
    (entry[sex] || [])
      .map((row) => ({ sex, ...rowToObject(schema, row) }))
      .filter((row) => isFiniteNumber(row.year))
  );
}

function renderSummary(name, nationalEntry) {
  const sexMode = els.nationalSex.value;
  const selectedRange = getSelectedNationalRange();
  els.summarySubtitle.textContent = nationalEntry
    ? `${getNationalNote()} Totals are cumulative SSA birth records since 1880; chart points are single-year counts.`
    : "No national SSA data found for this name.";

  if (!nationalEntry) {
    els.summaryStats.innerHTML = `<div class="empty">No national trend data found. Try a name present in the loaded JSON, or rebuild the data files from SSA raw data.</div>`;
    return;
  }

  const rows = getAllNationalRows(nationalEntry, "Both");
  const selectedRows = selectedRange
    ? getAllNationalRows(nationalEntry, sexMode).filter((row) => row.year >= selectedRange.start && row.year <= selectedRange.end)
    : [];
  const countRows = rows.filter((row) => isFiniteNumber(row.count));
  const rankRows = rows.filter((row) => isFiniteNumber(row.rank));
  const latestYear = max(countRows.map((row) => row.year));
  const latestRows = countRows.filter((row) => row.year === latestYear);
  const total = sum(countRows.map((row) => row.count));
  const peakCount = maxBy(countRows, (row) => row.count);
  const peakRank = minBy(rankRows, (row) => row.rank);

  const latestText = latestRows.length
    ? latestRows.map((row) => `${row.sex}: ${formatNumber(row.count)}${row.rank ? `, rank ${formatNumber(row.rank)}` : ""}`).join(" | ")
    : "Unavailable";

  const stats = [
    ["First recorded", min(countRows.map((row) => row.year)) ?? "Unavailable"],
    ["Latest recorded", latestYear ?? "Unavailable"],
    ["Total births since 1880", formatNumber(total)],
    ["Chart-range births", selectedRows.length ? formatNumber(sum(selectedRows.map((row) => row.count))) : "Unavailable"],
    ["Peak single-year count", peakCount ? `${formatNumber(peakCount.count)} in ${peakCount.year} (${peakCount.sex})` : "Unavailable"],
    ["Best rank", peakRank ? `#${formatNumber(peakRank.rank)} in ${peakRank.year} (${peakRank.sex})` : "Unavailable"],
    ["Latest count/rank", latestText],
    ["M total since 1880", formatNumber(sum((nationalEntry.M || []).map((row) => rowToObject(state.national.schema, row).count || 0)))],
    ["F total since 1880", formatNumber(sum((nationalEntry.F || []).map((row) => rowToObject(state.national.schema, row).count || 0)))],
    ["Chart range", selectedRange ? `${selectedRange.start}-${selectedRange.end}` : "Unavailable"]
  ];

  els.summaryStats.innerHTML = stats.map(([label, value]) => `
    <div class="stat">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(String(value))}</dd>
    </div>
  `).join("");
}

function renderNationalCharts(name, nationalEntry) {
  const sexMode = els.nationalSex.value;
  if (!nationalEntry) {
    els.countChart.innerHTML = `<div class="empty">No count chart available for ${escapeHtml(toTitleCase(name))}.</div>`;
    els.rankChart.innerHTML = `<div class="empty">No rank chart available for ${escapeHtml(toTitleCase(name))}.</div>`;
    return;
  }

  const selectedRange = getSelectedNationalRange();
  const series = buildNationalSeries(nationalEntry, sexMode, selectedRange);
  renderLineChart(els.countChart, series, {
    field: "count",
    empty: `No count data available for ${toTitleCase(name)}.`,
    yLabel: "Births",
    invertY: false
  });
  renderLineChart(els.rankChart, series, {
    field: "rank",
    empty: `No rank data available for ${toTitleCase(name)}.`,
    yLabel: "Rank",
    invertY: true
  });
}

function buildNationalSeries(entry, sexMode, selectedRange) {
  const schema = state.national.schema;
  const sexes = sexMode === "Both" ? ["M", "F"] : [sexMode];
  return sexes.map((sex) => ({
    sex,
    label: sex === "M" ? "M" : "F",
    values: (entry[sex] || [])
      .map((row) => rowToObject(schema, row))
      .filter((row) => isFiniteNumber(row.year))
      .filter((row) => !selectedRange || (row.year >= selectedRange.start && row.year <= selectedRange.end))
  })).filter((series) => series.values.length);
}

function renderLineChart(container, series, options) {
  const allValues = series.flatMap((item) =>
    item.values.filter((row) => isFiniteNumber(row[options.field]))
  );
  if (!allValues.length) {
    container.innerHTML = `<div class="empty">${escapeHtml(options.empty)}</div>`;
    return;
  }

  const width = 720;
  const height = 300;
  const margin = { top: 22, right: 22, bottom: 44, left: 58 };
  const years = allValues.map((row) => row.year);
  const minYear = min(years);
  const maxYear = max(years);
  let minY = min(allValues.map((row) => row[options.field]));
  let maxY = max(allValues.map((row) => row[options.field]));
  if (minY === maxY) {
    minY = Math.max(0, minY - 1);
    maxY += 1;
  }
  if (!options.invertY && minY > 0) minY = 0;

  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const x = (year) => margin.left + ((year - minYear) / Math.max(1, maxYear - minYear)) * plotW;
  const y = (value) => {
    const ratio = (value - minY) / Math.max(1, maxY - minY);
    return options.invertY
      ? margin.top + ratio * plotH
      : margin.top + (1 - ratio) * plotH;
  };

  const ticks = makeTicks(minY, maxY, 4);
  const yearTicks = makeYearTicks(minYear, maxYear);
  const grid = ticks.map((tick) => `
    <line class="grid-line" x1="${margin.left}" y1="${y(tick)}" x2="${width - margin.right}" y2="${y(tick)}"></line>
    <text class="axis-label" x="${margin.left - 10}" y="${y(tick) + 4}" text-anchor="end">${formatCompact(tick)}</text>
  `).join("");
  const xLabels = yearTicks.map((tick) => `
    <text class="axis-label" x="${x(tick)}" y="${height - 16}" text-anchor="middle">${tick}</text>
  `).join("");
  const paths = series.map((item) => {
    const rows = item.values.filter((row) => isFiniteNumber(row[options.field]));
    const d = rows.map((row, index) => `${index === 0 ? "M" : "L"} ${x(row.year).toFixed(2)} ${y(row[options.field]).toFixed(2)}`).join(" ");
    const points = rows.map((row) => `<circle class="point-${item.sex.toLowerCase()}" cx="${x(row.year)}" cy="${y(row[options.field])}" r="3"><title>${item.sex} ${row.year}: ${formatNumber(row[options.field])}</title></circle>`).join("");
    return `<path class="series-${item.sex.toLowerCase()}" d="${d}"></path>${points}`;
  }).join("");
  const legend = series.map((item) => `<span><span class="legend-swatch series-${item.sex.toLowerCase()}"></span>${item.label}</span>`).join("");

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" aria-hidden="true">
      ${grid}
      <line class="axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>
      <line class="axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>
      ${xLabels}
      <text class="axis-label" x="${margin.left}" y="14">${escapeHtml(options.yLabel)}</text>
      ${paths}
    </svg>
    <div class="chart-legend">${legend}</div>
  `;
}

async function renderMap(name) {
  const year = Number(els.mapYear.value || state.stateYears[0]);
  const stateData = await loadStateYear(year);
  const paths = els.mapContainer.querySelectorAll(".map-state[data-state]");
  const metric = els.mapMetric.value;
  const sex = els.mapSex.value;
  els.mapCaption.textContent = `${toTitleCase(name)}, ${sex}, ${year}, ${metricLabel(metric)}. Missing states are not shown, suppressed, or unavailable.`;

  if (!paths.length) return;

  const valuesByState = {};
  const displayByState = {};
  paths.forEach((path) => {
    const abbr = path.dataset.state;
    const value = getStateMetric(stateData, name, sex, abbr, metric);
    valuesByState[abbr] = value;
    displayByState[abbr] = getStateDisplay(stateData, name, sex, abbr);
  });

  const numericValues = Object.values(valuesByState).filter(isFiniteNumber);
  const bins = makeBins(numericValues, metric === "rank");

  paths.forEach((path) => {
    const abbr = path.dataset.state;
    path.classList.remove("missing", "bucket-0", "bucket-1", "bucket-2", "bucket-3", "bucket-4");
    const value = valuesByState[abbr];
    const bucket = getBucket(value, bins, metric === "rank");
    path.classList.add(bucket == null ? "missing" : `bucket-${bucket}`);
    path.dataset.value = isFiniteNumber(value) ? String(value) : "";
    path.dataset.count = displayByState[abbr]?.count ?? "";
    path.dataset.rank = displayByState[abbr]?.rank ?? "";
    path.dataset.rate = displayByState[abbr]?.ratePer100k ?? "";
  });

  renderMapLegend(bins, metric);
}

async function loadStateYear(year) {
  if (state.stateDataByYear.has(year)) return state.stateDataByYear.get(year);
  const data = await fetchJson(`data/states/${year}.json`, false);
  const fallback = data || { schema: [], year, names: {} };
  state.stateDataByYear.set(year, fallback);
  return fallback;
}

function getStateDisplay(stateData, name, sexMode, abbr) {
  const entry = stateData.names?.[name];
  if (!entry) return null;
  const schema = stateData.schema || [];
  if (sexMode !== "Both") {
    const row = entry[sexMode]?.[abbr];
    return row ? rowToObject(schema, row) : null;
  }

  const m = entry.M?.[abbr] ? rowToObject(schema, entry.M[abbr]) : null;
  const f = entry.F?.[abbr] ? rowToObject(schema, entry.F[abbr]) : null;
  if (!m && !f) return null;
  return {
    count: (m?.count || 0) + (f?.count || 0),
    rank: null,
    ratePer100k: null
  };
}

function getStateMetric(stateData, name, sex, abbr, metric) {
  const display = getStateDisplay(stateData, name, sex, abbr);
  return display?.[metric] ?? null;
}

function showStateTooltip(event, abbr) {
  const path = event.currentTarget;
  const metric = els.mapMetric.value;
  const name = toTitleCase(state.currentName);
  const year = els.mapYear.value;
  const sex = els.mapSex.value;
  const count = path.dataset.count;
  const rank = path.dataset.rank;
  const rate = path.dataset.rate;
  const hasData = count || rank || rate;

  els.tooltip.hidden = false;
  els.tooltip.innerHTML = hasData ? `
    <strong>${escapeHtml(STATE_NAMES[abbr] || abbr)} (${abbr})</strong>
    ${escapeHtml(name)} | ${escapeHtml(sex)} | ${escapeHtml(year)}<br>
    Count: ${count ? escapeHtml(formatNumber(Number(count))) : "unavailable"}<br>
    Rank: ${rank ? `#${escapeHtml(formatNumber(Number(rank)))}` : "unavailable"}<br>
    Rate: ${rate ? `${escapeHtml(formatNumber(Number(rate), 1))} per 100k` : "unavailable"}<br>
    Metric shown: ${escapeHtml(metricLabel(metric))}
  ` : `
    <strong>${escapeHtml(STATE_NAMES[abbr] || abbr)} (${abbr})</strong>
    ${escapeHtml(name)} | ${escapeHtml(sex)} | ${escapeHtml(year)}<br>
    Not shown / fewer than 5 / unavailable.
  `;

  const x = event.clientX ?? path.getBoundingClientRect().left;
  const y = event.clientY ?? path.getBoundingClientRect().top;
  els.tooltip.style.left = `${Math.min(window.innerWidth - 280, x + 14)}px`;
  els.tooltip.style.top = `${Math.max(8, y + 14)}px`;
}

function hideTooltip() {
  els.tooltip.hidden = true;
}

function renderMapLegend(bins, metric) {
  if (!bins.length) {
    els.mapLegend.innerHTML = `<span class="legend-item"><span class="legend-box missing"></span>No state values loaded</span>`;
    return;
  }
  const labels = bins.map((bin, index) => {
    const range = metric === "rank"
      ? `#${formatCompact(bin.max)} to #${formatCompact(bin.min)}`
      : `${formatCompact(bin.min)}-${formatCompact(bin.max)}`;
    return `<span class="legend-item"><span class="legend-box bucket-${index}"></span>${range}</span>`;
  }).join("");
  els.mapLegend.innerHTML = `${labels}<span class="legend-item"><span class="legend-box missing"></span>Missing/suppressed</span>`;
}

function renderCensus(name, entry) {
  if (!entry) {
    els.censusProfile.innerHTML = `<div class="empty">No Census first-name profile found for ${escapeHtml(toTitleCase(name))}.</div>`;
    return;
  }

  const profile = rowToObject(state.census.schema, entry);
  const sexTotal = (profile.countmale || 0) + (profile.countfemale || 0);
  const raceRows = [
    ["Non-Hispanic White", profile.countwhite],
    ["Non-Hispanic Black", profile.countblack],
    ["Non-Hispanic AIAN", profile.countaian],
    ["Non-Hispanic Asian / NHPI", profile.countapi],
    ["Non-Hispanic Two or More", profile.count2prace],
    ["Hispanic / Latino", profile.counthispanic]
  ].filter(([, value]) => isFiniteNumber(value));
  const raceTotal = sum(raceRows.map(([, value]) => value));

  const sexBars = [
    ["Male", profile.countmale, sexTotal, "male"],
    ["Female", profile.countfemale, sexTotal, "female"]
  ].filter(([, value]) => isFiniteNumber(value));
  const raceBars = raceRows.map(([label, value]) => [label, value, raceTotal, "race"]);

  els.censusProfile.innerHTML = `
    <div class="profile-grid">
      <div class="profile-facts">
        ${fact("Total people", formatNumber(profile.count))}
        ${fact("Rank", profile.rank ? `#${formatNumber(profile.rank)}` : "Unavailable")}
        ${fact("Occurrences per 100k", isFiniteNumber(profile.prop100k) ? formatNumber(profile.prop100k, 2) : "Unavailable")}
      </div>
      <div class="bar-list">
        ${renderBars(sexBars)}
        ${renderBars(raceBars)}
      </div>
    </div>
  `;
}

function fact(label, value) {
  return `<div class="fact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function renderBars(rows) {
  return rows.map(([label, value, total, kind]) => {
    const pct = total > 0 ? (value / total) * 100 : 0;
    const width = Math.max(0, Math.min(100, pct));
    const visibleWidth = width > 0 && width < 0.8 ? 0.8 : width;
    const fillClass = kind === "female" ? " female" : kind === "race" ? " race" : " male";
    return `
      <div class="bar-row">
        <span>${escapeHtml(label)}</span>
        <span class="bar-track"><span class="bar-fill${fillClass}" style="width: ${visibleWidth}%"></span></span>
        <strong>${formatNumber(pct, 1)}%</strong>
      </div>
    `;
  }).join("");
}

async function fetchJson(path, required) {
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } catch (error) {
    console.warn(`Could not load ${path}`, error);
    if (required) setStatus(`Could not load required data file <strong>${escapeHtml(path)}</strong>. Serve the site with python -m http.server; file:// fetches are blocked by browsers.`);
    return null;
  }
}

function rowToObject(schema, row) {
  return Object.fromEntries((schema || []).map((key, index) => [key, row[index] ?? null]));
}

function makeBins(values, lowerIsBetter) {
  const clean = values.filter(isFiniteNumber).sort((a, b) => a - b);
  if (!clean.length) return [];
  const bins = [];
  for (let i = 0; i < 5; i += 1) {
    const start = Math.floor((i / 5) * clean.length);
    const end = Math.min(clean.length - 1, Math.floor(((i + 1) / 5) * clean.length) - 1);
    bins.push({ min: clean[start], max: clean[Math.max(start, end)] });
  }
  return lowerIsBetter ? bins.reverse() : bins;
}

function getBucket(value, bins, lowerIsBetter) {
  if (!isFiniteNumber(value) || !bins.length) return null;
  if (lowerIsBetter) {
    const sorted = bins.map((bin, index) => ({ ...bin, index })).sort((a, b) => a.min - b.min);
    const found = sorted.find((bin) => value >= bin.min && value <= bin.max);
    return found ? 4 - sorted.indexOf(found) : null;
  }
  const foundIndex = bins.findIndex((bin) => value >= bin.min && value <= bin.max);
  return foundIndex === -1 ? null : foundIndex;
}

function makeTicks(minValue, maxValue, count) {
  const ticks = [];
  const step = (maxValue - minValue) / count;
  for (let i = 0; i <= count; i += 1) ticks.push(minValue + step * i);
  return ticks;
}

function makeYearTicks(minYear, maxYear) {
  if (minYear === maxYear) return [minYear];
  const span = maxYear - minYear;
  const step = span > 30 ? 10 : span > 12 ? 5 : span > 6 ? 2 : 1;
  const ticks = [];
  for (let year = minYear; year <= maxYear; year += step) ticks.push(year);
  if (!ticks.includes(maxYear)) ticks.push(maxYear);
  return ticks;
}

function metricLabel(metric) {
  return {
    count: "Count",
    rank: "Rank",
    ratePer100k: "Rate per 100k births"
  }[metric] || metric;
}

function normalizeName(value) {
  return String(value || "").trim().toUpperCase();
}

function toTitleCase(value) {
  const lower = String(value || "").toLowerCase();
  return lower ? lower[0].toUpperCase() + lower.slice(1) : "";
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function min(values) {
  const clean = values.filter(isFiniteNumber);
  return clean.length ? Math.min(...clean) : null;
}

function max(values) {
  const clean = values.filter(isFiniteNumber);
  return clean.length ? Math.max(...clean) : null;
}

function maxBy(rows, getter) {
  return rows.reduce((best, row) => (!best || getter(row) > getter(best) ? row : best), null);
}

function minBy(rows, getter) {
  return rows.reduce((best, row) => (!best || getter(row) < getter(best) ? row : best), null);
}

function formatNumber(value, digits = 0) {
  if (!isFiniteNumber(value)) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  }).format(value);
}

function formatCompact(value) {
  if (!isFiniteNumber(value)) return "n/a";
  return new Intl.NumberFormat("en-US", {
    notation: Math.abs(value) >= 10000 ? "compact" : "standard",
    maximumFractionDigits: value < 10 ? 1 : 0
  }).format(value);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function setStatus(html) {
  els.status.innerHTML = html;
}
