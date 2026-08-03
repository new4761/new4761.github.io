import {
  buildFirstPrizeModel,
  generateModelLotteryNumber,
} from "/lottery.mjs?v=2";

const MODEL_URL =
  "https://raw.githubusercontent.com/new4761/Thai_lottery_analysis/main/lottery_results.csv";

const output = document.querySelector("[data-number-output]");
const generateButton = document.querySelector("[data-generate]");
const copyButton = document.querySelector("[data-copy]");
const status = document.querySelector("[data-action-status]");
const modelStatus = document.querySelector("[data-model-status]");
let model = null;

function formatDate(value) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
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
  if (model !== null) {
    showNumber(generateModelLotteryNumber(model));
  }
});

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

    model = buildFirstPrizeModel(await response.text());
    modelStatus.textContent = `Model ready: ${model.sampleCount} first-prize draws · ${formatDate(model.startDate)}–${formatDate(model.endDate)}.`;
    generateButton.disabled = false;
    status.textContent = "Historical model ready.";
  } catch {
    modelStatus.textContent = "Historical model unavailable.";
    status.textContent = "Refresh the page to try loading the data again.";
  }
}

await loadModel();
