import {
  buildFirstPrizeModel,
  generateModelLotteryNumber,
  applyNewsBias,
} from "/lottery.mjs?v=9";

const MODEL_URLS = [
  "/lottery_results.csv",
  "https://raw.githubusercontent.com/new4761/Thai_lottery_analysis/main/lottery_results.csv",
];
const NEWS_URL = "/news.json";
const DATA_SOURCE_META_URL = "/lottery_results.csv.meta.json";
const DATA_SOURCE_URL = "https://github.com/new4761/Thai_lottery_analysis";
const DATA_SOURCE_LABEL = "new4761/Thai_lottery_analysis";
const FALLBACK_SAMPLE_COUNT = 120;
const FALLBACK_DIGIT_COUNT = 6;
const FALLBACK_RADIX = 10;
const MAX_ATTEMPTS_PER_PICK = 1_000;
const RECENT_PICK_HISTORY_KEY = "lottery_recent_picks";
const MAX_RECENT_PICK_HISTORY = 25;
const MAX_RECENT_SUFFIX_HISTORY = 25;

const output = document.querySelector("[data-number-output]");
const generateButton = document.querySelector("[data-generate]");
const copyButton = document.querySelector("[data-copy]");
const status = document.querySelector("[data-action-status]");
const modelStatus = document.querySelector("[data-model-status]");
const newsStatus = document.querySelector("[data-news-status]");
const dataSourceStatus = document.querySelector("[data-data-source-status]");
const newsToggle = document.querySelector("[data-news-toggle]");
const newsToggleLabel =
  newsToggle && "checked" in newsToggle ? newsToggle : null;
const newsPanel = document.querySelector("[data-news-panel]");
const newsPicksContainer = document.querySelector("[data-news-picks]");
const pickCountSelect = document.querySelector("[data-pick-count]");
const pickList = document.querySelector("[data-pick-list]");

let historicModel = null;
let activeModel = null;
let news = null;
let recentPickHistory = [];

function loadRecentPickHistory() {
  try {
    const raw = globalThis.localStorage.getItem(RECENT_PICK_HISTORY_KEY);
    if (raw === null) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((value) => /^\d{6}$/.test(value)).slice(0, MAX_RECENT_PICK_HISTORY);
  } catch {
    return [];
  }
}

function saveRecentPickHistory(picks) {
  try {
    globalThis.localStorage.setItem(
      RECENT_PICK_HISTORY_KEY,
      JSON.stringify(picks),
    );
  } catch {
    // localStorage may be unavailable or full; generation still works without history.
  }
}

function recordRecentPicks(picks) {
  const next = [...picks, ...recentPickHistory].filter(
    (value, index, self) => /^\d{6}$/.test(value) && self.indexOf(value) === index,
  );
  recentPickHistory = next.slice(0, MAX_RECENT_PICK_HISTORY);
  saveRecentPickHistory(recentPickHistory);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function buildSet(values, extract) {
  const set = new Set();
  for (const value of values) {
    if (!/^[0-9]{6}$/.test(value)) {
      continue;
    }
    set.add(extract(value));
    if (set.size >= MAX_RECENT_SUFFIX_HISTORY) {
      break;
    }
  }
  return set;
}

function humanRelativeTime(isoDate) {
  const timestamp = Date.parse(isoDate);
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  const diffMs = Date.now() - timestamp;
  const absMinutes = Math.max(1, Math.floor(Math.abs(diffMs) / (1000 * 60)));

  if (absMinutes < 60) {
    return `${absMinutes} minute${absMinutes === 1 ? "" : "s"} ago`;
  }
  const absHours = Math.floor(absMinutes / 60);
  if (absHours < 24) {
    return `${absHours} hour${absHours === 1 ? "" : "s"} ago`;
  }
  const absDays = Math.floor(absHours / 24);
  if (absDays < 7) {
    return `${absDays} day${absDays === 1 ? "" : "s"} ago`;
  }
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(timestamp);
}

function renderDataSourceStatus(meta) {
  if (!dataSourceStatus) {
    return;
  }
  if (!meta || typeof meta !== "object") {
    dataSourceStatus.textContent = "Data sync metadata unavailable.";
    return;
  }
  const syncedAtLabel = humanRelativeTime(meta.syncedAt);
  const updatedAtLabel = humanRelativeTime(meta.sourceUpdatedAt);
  const sourceLabel = updatedAtLabel
    ? `source updated ${updatedAtLabel}`
    : "source update time unavailable";

  if (syncedAtLabel) {
    dataSourceStatus.textContent = `Lottery data synced ${syncedAtLabel}; ${sourceLabel}.`;
  } else {
    dataSourceStatus.textContent = `Lottery data source synced; ${sourceLabel}.`;
  }
}

function describeNewsInfluence(influence) {
  if (influence.applied === 0) {
    return null;
  }
  const fraction = (influence.applied * 100).toFixed(influence.capped ? 0 : 1);
  return `adding ${fraction}% weight${
    influence.capped ? " (capped at 15%)" : ""
  } across ${influence.sources} source${
    influence.sources === 1 ? "" : "s"
  } and ${influence.suggestions} suggestion${
    influence.suggestions === 1 ? "" : "s"
  }`;
}

function describeNewsState() {
  if (!news || !Array.isArray(news.suggestedNumbers) || news.suggestedNumbers.length === 0) {
    return "News data unavailable — pure-history mode.";
  }
  const hoursSince = news.freshness && Number.isFinite(news.freshness.hoursSinceLastDraw)
    ? Math.round(news.freshness.hoursSinceLastDraw)
    : null;
  const recency = hoursSince !== null && hoursSince >= 0
    ? `most recent Thaiger draw ${hoursSince}h ago`
    : "recent Thaiger draw available";
  return `${news.suggestedNumbers.length} suggestion${
    news.suggestedNumbers.length === 1 ? "" : "s"
  } · ${recency}`;
}

function renderModelStatus() {
  if (historicModel === null) {
    return;
  }
  modelStatus.textContent = `Model ready: ${historicModel.sampleCount} first-prize draws · ${formatDate(
    historicModel.startDate,
  )}–${formatDate(historicModel.endDate)}.`;
}

function buildFallbackModel() {
  const positions = Array.from({ length: FALLBACK_DIGIT_COUNT }, () =>
    Array.from({ length: FALLBACK_RADIX }, () => 1),
  );
  return Object.freeze({
    positions: Object.freeze(positions.map((frequencies) => Object.freeze(frequencies))),
    sampleCount: FALLBACK_SAMPLE_COUNT,
    startDate: "2010-03-01",
    endDate: "2010-03-01",
  });
}

function renderNewsPanel() {
  if (!newsPanel || !newsPicksContainer) {
    return;
  }
  const hasValidNews =
    news && Array.isArray(news.suggestedNumbers) && news.suggestedNumbers.length > 0;
  if (!hasValidNews) {
    newsPanel.hidden = true;
    newsPicksContainer.replaceChildren();
    return;
  }
  newsPanel.hidden = false;
  const byDate = new Map();
  for (const suggestion of news.suggestedNumbers) {
    const key = suggestion.drawDate ?? "unknown";
    if (!byDate.has(key)) {
      byDate.set(key, []);
    }
    byDate.get(key).push(suggestion);
  }
  const sortedDates = [...byDate.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  const fragment = document.createDocumentFragment();
  for (const date of sortedDates) {
    const suggestions = byDate.get(date);
    const row = document.createElement("div");
    row.className = "news-pick-row";
    const heading = document.createElement("p");
    heading.className = "news-pick-date";
    heading.textContent = date === "unknown" ? "Unattributed picks" : `Draw ${formatDate(date)}`;
    row.appendChild(heading);
    const chips = document.createElement("div");
    chips.className = "news-pick-chips";
    for (const suggestion of suggestions) {
      const chip = document.createElement("span");
      chip.className = `news-pick-chip news-pick-chip--${suggestion.source ?? "unknown"}`;
      chip.textContent = suggestion.digits.join("");
      const weight = document.createElement("span");
      weight.className = "news-pick-weight";
      weight.textContent = suggestion.weight.toFixed(2);
      chip.appendChild(weight);
      chips.appendChild(chip);
    }
    row.appendChild(chips);
    fragment.appendChild(row);
  }
  newsPicksContainer.replaceChildren(fragment);
}

function renderNewsStatus() {
  if (!newsToggleLabel) {
    return;
  }
  const enabled = newsToggleLabel.checked;
  if (!news || !Array.isArray(news.suggestedNumbers) || news.suggestedNumbers.length === 0) {
    newsStatus.textContent = describeNewsState();
    return;
  }
  const influence = activeModel && activeModel.newsInfluence;
  if (!enabled) {
    newsStatus.textContent = `${describeNewsState()} — news influence disabled (pure-history mode).`;
    return;
  }
  const description = describeNewsInfluence(influence);
  newsStatus.textContent = description
    ? `${describeNewsState()} — ${description}.`
    : `${describeNewsState()} — no weight applied yet.`;
}

function rebuildActiveModel() {
  if (historicModel === null) {
    return;
  }
  const enabled = newsToggleLabel ? newsToggleLabel.checked : true;
  activeModel = applyNewsBias(historicModel, news, { enabled });
  renderNewsStatus();
  renderNewsPanel();
}

function showNumber(number) {
  const digits = Array.from(output.children);

  digits.forEach((digit, index) => {
    digit.textContent = number[index];
  });

  output.dataset.value = number;
  output.setAttribute("aria-label", `Generated lottery number ${number}`);
  output.classList.remove("is-generated");
  requestAnimationFrame(() => output.classList.add("is-generated"));
  copyButton.disabled = false;
  status.textContent = "New number generated.";
}

function pickCount() {
  if (!pickCountSelect) {
    return 1;
  }
  const value = Number.parseInt(pickCountSelect.value, 10);
  return Number.isFinite(value) && value >= 1 ? value : 1;
}

function renderPickList(picks) {
  if (!pickList) {
    return;
  }
  pickList.replaceChildren();
  if (picks.length === 0) {
    pickList.hidden = true;
    return;
  }
  pickList.hidden = false;
  const fragment = document.createDocumentFragment();
  picks.forEach((pick) => {
    const li = document.createElement("li");
    li.className = "pick-list-item";
    li.textContent = pick;
    fragment.appendChild(li);
  });
  pickList.appendChild(fragment);
}

function generatePicks(model, count, randomSource = globalThis.crypto) {
  if (!Number.isInteger(count) || count <= 0) {
    return [];
  }

  const seen = new Set();
  const picks = [];
  const recentSet = new Set(recentPickHistory);
  const recentSuffix3 = buildSet(recentPickHistory, (value) => value.slice(3));
  const recentSuffix2 = buildSet(recentPickHistory, (value) => value.slice(4));
  const seenSuffix3 = new Set();
  const seenSuffix2 = new Set();

  for (let i = 0; i < count; i += 1) {
    let candidate;
    let attempts = 0;
    let rejectCandidate = true;

    do {
      candidate = generateModelLotteryNumber(model, randomSource);
      attempts += 1;

      const repeatsFull = recentSet.has(candidate) || seen.has(candidate);
      const repeatsSuffix = seenSuffix3.has(candidate.slice(3))
        || seenSuffix2.has(candidate.slice(4))
        || recentSuffix3.has(candidate.slice(3))
        || recentSuffix2.has(candidate.slice(4));

      rejectCandidate = repeatsFull || repeatsSuffix;
      if (!rejectCandidate) {
        break;
      }
    } while (attempts < MAX_ATTEMPTS_PER_PICK);

    seen.add(candidate);
    recentSet.add(candidate);
    seenSuffix3.add(candidate.slice(3));
    seenSuffix2.add(candidate.slice(4));
    picks.push(candidate);
  }

  return picks;
}

generateButton.addEventListener("click", () => {
  if (activeModel === null) {
    return;
  }
  const count = pickCount();
  const picks = generatePicks(activeModel, count);
  if (picks.length === 0) {
    return;
  }

  showNumber(picks[0]);
  renderPickList(picks.length > 1 ? picks.slice(1) : []);
  recordRecentPicks(picks);
  status.textContent =
    picks.length === 1 ? "1 number generated." : `${picks.length} numbers generated.`;
});

if (newsToggleLabel) {
  newsToggleLabel.addEventListener("change", () => {
    rebuildActiveModel();
  });
}

copyButton.addEventListener("click", async () => {
  const primary = output.dataset.value;
  if (!primary) {
    return;
  }
  const picks = [];
  if (pickList && !pickList.hidden) {
    pickList.querySelectorAll(".pick-list-item").forEach((li) => {
      picks.push(li.textContent.trim());
    });
  }
  const text = picks.length > 0 ? [primary, ...picks].join("\n") : primary;

  try {
    await navigator.clipboard.writeText(text);
    status.textContent =
      picks.length > 0
        ? `${picks.length + 1} numbers copied.`
        : "Number copied.";
  } catch {
    status.textContent =
      "Copy unavailable. Select the number and copy it manually.";
  }
});

async function loadModel() {
  let lastError = null;

  for (const modelUrl of MODEL_URLS) {
    try {
      const response = await fetch(modelUrl, { cache: "no-store" });

      if (!response.ok) {
        throw new Error(`Historical data request failed with ${response.status}`);
      }

      historicModel = buildFirstPrizeModel(await response.text());
      return;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError !== null) {
    console.error(lastError);
  }

  throw new Error("Historical model unavailable");
}

function setFallbackModel() {
  historicModel = buildFallbackModel();
  renderModelStatus();
  rebuildActiveModel();
  generateButton.disabled = false;
  newsStatus.textContent =
    "News data unavailable — running offline fallback model.";
  status.textContent =
    "Could not load historical data. Generator running with fallback model.";
}

function markModelReady() {
  renderModelStatus();
  rebuildActiveModel();
  generateButton.disabled = false;
  status.textContent = "Historical model ready.";
}

async function initialize() {
  recentPickHistory = loadRecentPickHistory();
  await loadDataSourceMetadata();

  try {
    await loadModel();
    markModelReady();
  } catch {
    setFallbackModel();
  }

  await loadNews();
  rebuildActiveModel();
}

async function loadDataSourceMetadata() {
  if (!dataSourceStatus) {
    return;
  }

  try {
    const response = await fetch(DATA_SOURCE_META_URL, { cache: "no-store" });

    if (!response.ok) {
      dataSourceStatus.textContent = "Data sync metadata unavailable.";
      return;
    }
    const parsed = await response.json();
    renderDataSourceStatus(parsed);
  } catch {
    dataSourceStatus.textContent = "Data sync metadata unavailable.";
  }
}

async function loadNews() {
  try {
    const response = await fetch(NEWS_URL, { cache: "no-store" });

    if (!response.ok) {
      return;
    }
    const parsed = await response.json();
    if (parsed && typeof parsed === "object") {
      news = parsed;
    }
  } catch {
    // Network or parse failure — silently fall back to pure-history mode.
    news = null;
  }
}

initialize();
