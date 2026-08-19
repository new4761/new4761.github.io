import {
  buildFirstPrizeModel,
  generateModelLotteryNumber,
  applyNewsBias,
  filterRecentNewsSuggestions,
} from "/lottery.mjs?v=7";

const MODEL_URLS = [
  "/lottery_results.csv",
  "https://raw.githubusercontent.com/new4761/Thai_lottery_analysis/main/lottery_results.csv",
];
const NEWS_URL = "/news.json";
const DIGIT_COUNT = 6;
const DIGIT_RADIX = 10;
const DATA_SOURCE_URL = "https://github.com/new4761/Thai_lottery_analysis";
const DATA_SOURCE_LABEL = "new4761/Thai_lottery_analysis";
const FALLBACK_SAMPLE_COUNT = 120;
const MODEL_FETCH_TIMEOUT_MS = 6000;
const NEWS_FETCH_TIMEOUT_MS = 6000;
const NEWS_CACHE_KEY = "lottery_news_cache_v2";
const NEWS_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const output = document.querySelector("[data-number-output]");
const generateButton = document.querySelector("[data-generate]");
const copyButton = document.querySelector("[data-copy]");
const status = document.querySelector("[data-action-status]");
const modelStatus = document.querySelector("[data-model-status]");
const newsStatus = document.querySelector("[data-news-status]");
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

async function fetchWithTimeout(resource, options = {}, timeoutMs = 6000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new DOMException("Request timed out", "TimeoutError"));
  }, timeoutMs);

  try {
    return await fetch(resource, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatStaleMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "cache updated recently";
  }
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) {
    return `cache updated ${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  return `cache updated ${hours}h ago`;
}

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function isNewsSuggestionLike(suggestion) {
  if (!suggestion || typeof suggestion !== "object") {
    return false;
  }
  if (!Array.isArray(suggestion.digits) || suggestion.digits.length === 0) {
    return false;
  }
  const validLength =
    suggestion.digits.length === 2 ||
    suggestion.digits.length === 3 ||
    suggestion.digits.length === 6;
  if (!validLength) {
    return false;
  }
  const hasDigits = suggestion.digits.every((digit) => {
    const normalized = Number(digit);
    return Number.isInteger(normalized) && normalized >= 0 && normalized <= 9;
  });
  const normalizedWeight = Number(suggestion.weight);
  return hasDigits && Number.isFinite(normalizedWeight) && normalizedWeight > 0;
}

function sanitizeNewsPayload(rawNews) {
  if (rawNews === null || typeof rawNews !== "object") {
    return { news: null, validation: { malformedNews: true } };
  }
  if (!Array.isArray(rawNews.suggestedNumbers)) {
    return { news: null, validation: { malformedNews: true } };
  }

  const validation = {
    malformedSuggestionCount: 0,
    source: "local",
  };
  const sanitizedSuggestions = [];

  for (const suggestion of rawNews.suggestedNumbers) {
    if (!isNewsSuggestionLike(suggestion)) {
      validation.malformedSuggestionCount += 1;
      continue;
    }

    sanitizedSuggestions.push({
      ...suggestion,
      digits: suggestion.digits.map((digit) => Number(digit)),
      weight: Number(suggestion.weight),
    });
  }

  return {
    news: {
      ...rawNews,
      suggestedNumbers: sanitizedSuggestions,
    },
    validation,
  };
}

function readNewsCache() {
  try {
    const raw = localStorage.getItem(NEWS_CACHE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !parsed.payload ||
      !Array.isArray(parsed.payload.suggestedNumbers)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeNewsCache(payload) {
  try {
    localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore cache write failures in restricted browser contexts.
  }
}

function isNewsCacheUsable(cache) {
  return (
    cache &&
    Number.isFinite(cache.savedAt) &&
    Date.now() - cache.savedAt <= NEWS_CACHE_MAX_AGE_MS &&
    cache.payload &&
    typeof cache.payload === "object" &&
    Array.isArray(cache.payload.suggestedNumbers)
  );
}

function decorateNewsWithCacheMeta(newsPayload, cacheMeta = null) {
  if (!newsPayload || typeof newsPayload !== "object") {
    return;
  }
  if (cacheMeta) {
    newsPayload._cache = cacheMeta;
  } else {
    delete newsPayload._cache;
  }
}

function applyNewsPayload(parsed, cacheMeta = null, fallbackCache = null) {
  const sanitized = sanitizeNewsPayload(parsed);
  if (sanitized.news === null) {
    news = fallbackCache || null;
    return;
  }

  const filtered = filterRecentNews(sanitized.news);
  filtered._validation = {
    ...sanitized.validation,
    malformedSuggestionCount: sanitized.validation.malformedSuggestionCount,
  };
  decorateNewsWithCacheMeta(filtered, cacheMeta);
  news = filtered;
}

function filterRecentNews(rawNews) {
  return filterRecentNewsSuggestions(rawNews, { staleDays: 30 });
}

function describeNewsInfluence(influence) {
  if (influence.applied === 0) {
    return null;
  }
  const fraction = (influence.applied * 100).toFixed(influence.capped ? 0 : 1);
  const sourceCount = influence.sources || 0;
  const uniqueSuggestions = influence.suggestions || 0;
  const rawSuggestions =
    Number.isFinite(influence.rawSuggestions) && influence.rawSuggestions > 0
      ? influence.rawSuggestions
      : uniqueSuggestions;
  const duplicateInfo =
    rawSuggestions > uniqueSuggestions
      ? ` (merged from ${rawSuggestions} raw suggestions)`
      : "";
  return `adding ${fraction}% weight${
    influence.capped ? " (capped at 15%)" : ""
  } across ${sourceCount} source${
    sourceCount === 1 ? "" : "s"
  } and ${influence.suggestions} suggestion${
    uniqueSuggestions === 1 ? "" : "s"
  }${duplicateInfo}`;
}

function describeNewsState() {
  if (!news || !Array.isArray(news.suggestedNumbers) || news.suggestedNumbers.length === 0) {
    const cacheMeta = news && news._cache && Number.isFinite(news._cache.staleMs)
      ? ` · ${formatStaleMs(news._cache.staleMs)}`
      : "";
    const staleFilter = news && news._staleFilter;
    if (staleFilter && staleFilter.applied && staleFilter.removedCount > 0) {
      const reason = staleFilter.reason
        ? ` (${staleFilter.reason})`
        : "";
      return `News data removed ${staleFilter.removedCount} stale suggestion${
        staleFilter.removedCount === 1 ? "" : "s"
      } — pure-history mode${reason}.${cacheMeta}`;
    }
    const cacheSource = news && news._cache && news._cache.source;
    if (cacheSource === "fallback-cache" || cacheSource === "304-not-modified") {
      const label =
        cacheSource === "304-not-modified"
          ? "cached payload (304)"
          : "cached payload fallback";
      return `News payload loaded from ${label}, but no active suggestions — pure-history mode.${cacheMeta}`;
    }
    return "News data unavailable — pure-history mode.";
  }
  const staleFilter = news._staleFilter;
  const staleSuffix =
    staleFilter && staleFilter.applied && staleFilter.removedCount > 0
      ? ` (filtered out ${staleFilter.removedCount} older suggestions)`
      : "";
  const hoursSince = news.freshness && Number.isFinite(news.freshness.hoursSinceLastDraw)
    ? Math.round(news.freshness.hoursSinceLastDraw)
    : null;
  const recency = hoursSince !== null && hoursSince >= 0
    ? `most recent Thaiger draw ${hoursSince}h ago`
    : "recent Thaiger draw available";
  const malformedSuffix =
    news._validation &&
    news._validation.malformedSuggestionCount > 0
      ? ` · ${news._validation.malformedSuggestionCount} malformed suggestion${
          news._validation.malformedSuggestionCount === 1 ? "" : "s"
        } removed`
      : "";
  const cacheSuffix =
    news._cache && news._cache.source
      ? ` · ${news._cache.source} · ${formatStaleMs(news._cache.staleMs || 0)}`
      : "";
  return `${news.suggestedNumbers.length} suggestion${
    news.suggestedNumbers.length === 1 ? "" : "s"
  }${malformedSuffix} · ${recency}${staleSuffix}${cacheSuffix}`;
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
  const positions = Array.from({ length: DIGIT_COUNT }, () =>
    Array.from({ length: DIGIT_RADIX }, () => 1),
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

generateButton.addEventListener("click", () => {
  if (activeModel === null) {
    return;
  }
  const count = pickCount();
  if (count === 1) {
    const single = generateModelLotteryNumber(activeModel);
    showNumber(single);
    renderPickList([]);
    return;
  }
  const picks = [];
  for (let i = 0; i < count; i += 1) {
    picks.push(generateModelLotteryNumber(activeModel));
  }
  showNumber(picks[0]);
  renderPickList(picks);
  status.textContent = `${count} numbers generated.`;
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
      const response = await fetchWithTimeout(
        modelUrl,
        {},
        MODEL_FETCH_TIMEOUT_MS,
      );

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
  try {
    await loadModel();
    markModelReady();
  } catch {
    setFallbackModel();
  }

  await loadNews();
  rebuildActiveModel();
}

async function loadNews() {
  const cachedNews = readNewsCache();
  const headers = {};

  if (cachedNews && cachedNews.etag) {
    headers["If-None-Match"] = cachedNews.etag;
  }
  if (cachedNews && cachedNews.lastModified) {
    headers["If-Modified-Since"] = cachedNews.lastModified;
  }

  try {
    const response = await fetchWithTimeout(
      NEWS_URL,
      headers,
      NEWS_FETCH_TIMEOUT_MS,
    );

    if (response.status === 304) {
      if (isNewsCacheUsable(cachedNews)) {
        news = JSON.parse(JSON.stringify(cachedNews.payload));
        decorateNewsWithCacheMeta(news, {
          source: "304-not-modified",
          staleMs: Math.max(0, Date.now() - (cachedNews.savedAt || 0)),
        });
      } else {
        news = null;
      }
      return;
    }

    if (!response.ok) {
      if (cachedNews && isNewsCacheUsable(cachedNews)) {
        news = JSON.parse(JSON.stringify(cachedNews.payload));
        decorateNewsWithCacheMeta(news, {
          source: "fallback-cache",
          staleMs: Math.max(0, Date.now() - (cachedNews.savedAt || 0)),
        });
      } else {
        news = null;
      }
      return;
    }

    const text = await response.text();
    const responseHash = hashText(text);

    if (
      cachedNews &&
      cachedNews.hash === responseHash &&
      cachedNews.payload &&
      Array.isArray(cachedNews.payload.suggestedNumbers)
    ) {
      news = JSON.parse(JSON.stringify(cachedNews.payload));
      decorateNewsWithCacheMeta(news, {
        source: "hash-match",
        hash: responseHash,
        staleMs: Math.max(0, Date.now() - (cachedNews.savedAt || 0)),
      });
      return;
    }

    const parsed = JSON.parse(text);
    applyNewsPayload(parsed, {
      source: "downloaded",
    });

    if (!news && cachedNews && isNewsCacheUsable(cachedNews)) {
      news = JSON.parse(JSON.stringify(cachedNews.payload));
      decorateNewsWithCacheMeta(news, {
        source: "fallback-cache",
        staleMs: Math.max(0, Date.now() - (cachedNews.savedAt || 0)),
      });
      return;
    }

    writeNewsCache({
      savedAt: Date.now(),
      hash: responseHash,
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      payload: news,
    });
  } catch {
    if (cachedNews && isNewsCacheUsable(cachedNews)) {
      news = JSON.parse(JSON.stringify(cachedNews.payload));
      decorateNewsWithCacheMeta(news, {
        source: "fallback-cache",
        staleMs: Math.max(0, Date.now() - (cachedNews.savedAt || 0)),
      });
    } else {
      news = null;
    }
  }
}

initialize();
