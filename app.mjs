import {
  buildFirstPrizeModel,
  generateModelLotteryNumber,
  applyNewsBias,
} from "/lottery.mjs?v=3";

const MODEL_URL =
  "https://raw.githubusercontent.com/new4761/Thai_lottery_analysis/main/lottery_results.csv";
const NEWS_URL = "/news.json";
const DATA_SOURCE_URL = "https://github.com/new4761/Thai_lottery_analysis";
const DATA_SOURCE_LABEL = "new4761/Thai_lottery_analysis";

const output = document.querySelector("[data-number-output]");
const generateButton = document.querySelector("[data-generate]");
const copyButton = document.querySelector("[data-copy]");
const status = document.querySelector("[data-action-status]");
const modelStatus = document.querySelector("[data-model-status]");
const newsStatus = document.querySelector("[data-news-status]");
const newsToggle = document.querySelector("[data-news-toggle]");
const newsToggleLabel =
  newsToggle && "checked" in newsToggle ? newsToggle : null;

let historicModel = null;
let activeModel = null;
let news = null;

function formatDate(value) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
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

generateButton.addEventListener("click", () => {
  if (activeModel !== null) {
    showNumber(generateModelLotteryNumber(activeModel));
  }
});

if (newsToggleLabel) {
  newsToggleLabel.addEventListener("change", () => {
    rebuildActiveModel();
  });
}

copyButton.addEventListener("click", async () => {
  const number = output.dataset.value;

  try {
    await navigator.clipboard.writeText(number);
    status.textContent = "Number copied.";
  } catch {
    status.textContent =
      "Copy unavailable. Select the number and copy it manually.";
  }
});

async function loadModel() {
  try {
    const response = await fetch(MODEL_URL, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Historical data request failed with ${response.status}`);
    }

    historicModel = buildFirstPrizeModel(await response.text());
    renderModelStatus();
    rebuildActiveModel();
    generateButton.disabled = false;
    status.textContent = "Historical model ready.";
  } catch {
    modelStatus.textContent = "Historical model unavailable.";
    status.textContent = "Refresh the page to try loading the data again.";
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

await loadModel();
await loadNews();
rebuildActiveModel();