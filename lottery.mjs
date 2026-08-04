const DIGIT_COUNT = 6;
const DIGIT_RADIX = 10;
const UINT32_RANGE = 2 ** 32;

export class ModelDataError extends Error {
  constructor(message) {
    super(message);
    this.name = "ModelDataError";
  }
}

function isIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (match === null) {
    return false;
  }

  const [, year, month, day] = match;
  const parsed = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)),
  );
  return parsed.toISOString().slice(0, 10) === value;
}

function randomIndex(maxExclusive, randomSource) {
  const randomValue = new Uint32Array(1);
  const unbiasedLimit = UINT32_RANGE - (UINT32_RANGE % maxExclusive);

  do {
    randomSource.getRandomValues(randomValue);
  } while (randomValue[0] >= unbiasedLimit);

  return randomValue[0] % maxExclusive;
}

function sampleDigit(frequencies, randomSource) {
  const total = frequencies.reduce((sum, count) => sum + count, 0);
  let offset = randomIndex(total, randomSource);

  for (let digit = 0; digit < DIGIT_RADIX; digit += 1) {
    if (offset < frequencies[digit]) {
      return digit;
    }
    offset -= frequencies[digit];
  }

  throw new ModelDataError("Position frequencies do not contain a sample");
}

export function buildFirstPrizeModel(csvText) {
  const positions = Array.from({ length: DIGIT_COUNT }, () =>
    Array(DIGIT_RADIX).fill(0),
  );
  const dates = [];

  for (const row of csvText.split(/\r?\n/).slice(1)) {
    const firstSeparator = row.indexOf(",");
    const secondSeparator = row.indexOf(",", firstSeparator + 1);
    const date = row.slice(0, firstSeparator);
    const firstPrize = row.slice(firstSeparator + 1, secondSeparator);

    if (!isIsoDate(date) || !/^\d{6}$/.test(firstPrize)) {
      continue;
    }

    dates.push(date);
    Array.from(firstPrize, Number).forEach((digit, position) => {
      positions[position][digit] += 1;
    });
  }

  if (dates.length === 0) {
    throw new ModelDataError("No valid first-prize rows were found");
  }

  return Object.freeze({
    positions: Object.freeze(
      positions.map((frequencies) => Object.freeze(frequencies)),
    ),
    sampleCount: dates.length,
    startDate: dates[0],
    endDate: dates.at(-1),
  });
}

export function generateModelLotteryNumber(
  model,
  randomSource = globalThis.crypto,
) {
  return model.positions
    .map((frequencies) => sampleDigit(frequencies, randomSource))
    .join("");
}

export const DEFAULT_NEWS_BIAS_CAP = 0.15;

function isNewsletterValid(news) {
  return (
    news !== null &&
    typeof news === "object" &&
    Array.isArray(news.suggestedNumbers) &&
    news.suggestedNumbers.length > 0
  );
}

function isValidSuggestion(suggestion) {
  return (
    suggestion !== null &&
    typeof suggestion === "object" &&
    Array.isArray(suggestion.digits) &&
    suggestion.digits.every(
      (digit) => Number.isInteger(digit) && digit >= 0 && digit <= 9,
    ) &&
    typeof suggestion.weight === "number" &&
    Number.isFinite(suggestion.weight) &&
    suggestion.weight > 0 &&
    (suggestion.digits.length === 2 ||
      suggestion.digits.length === 3 ||
      suggestion.digits.length === 6)
  );
}

function startingPositionForSuggestionLength(length, totalPositions) {
  if (length === 6) {
    return 0;
  }
  if (length === 3) {
    return Math.max(0, totalPositions - 3);
  }
  if (length === 2) {
    return Math.max(0, totalPositions - 2);
  }
  return null;
}

export function applyNewsBias(model, news, options = {}) {
  const enabled = options.enabled !== false;
  const cap = Number.isFinite(options.cap) ? options.cap : DEFAULT_NEWS_BIAS_CAP;

  if (!enabled || !isNewsletterValid(news)) {
    return Object.freeze({
      positions: Object.freeze(
        model.positions.map((frequencies) =>
          Object.freeze(Array.from(frequencies)),
        ),
      ),
      sampleCount: model.sampleCount,
      startDate: model.startDate,
      endDate: model.endDate,
      newsInfluence: Object.freeze({
        applied: 0,
        capped: false,
        sources: 0,
        suggestions: 0,
      }),
    });
  }

  const biased = model.positions.map((frequencies) => Array.from(frequencies));
  const totalPositions = biased.length;

  for (const suggestion of news.suggestedNumbers) {
    if (!isValidSuggestion(suggestion)) {
      continue;
    }
    const start = startingPositionForSuggestionLength(
      suggestion.digits.length,
      totalPositions,
    );
    if (start === null) {
      continue;
    }
    for (let offset = 0; offset < suggestion.digits.length; offset += 1) {
      const positionIndex = start + offset;
      if (positionIndex < 0 || positionIndex >= totalPositions) {
        continue;
      }
      biased[positionIndex][suggestion.digits[offset]] += suggestion.weight;
    }
  }

  let capped = false;
  let maxApplied = 0;

  for (let position = 0; position < totalPositions; position += 1) {
    const original = model.positions[position];
    const originalTotal = original.reduce(
      (sum, count) => sum + count,
      0,
    );
    if (originalTotal === 0) {
      continue;
    }
    const biasAdded = biased[position].reduce(
      (sum, count) => sum + count,
      0,
    ) - originalTotal;
    if (biasAdded <= 0) {
      continue;
    }
    const maxAllowed = cap * originalTotal;
    if (biasAdded > maxAllowed) {
      const scale = maxAllowed / biasAdded;
      for (let digit = 0; digit < DIGIT_RADIX; digit += 1) {
        biased[position][digit] =
          original[digit] + (biased[position][digit] - original[digit]) * scale;
      }
      capped = true;
      maxApplied = Math.max(maxApplied, cap);
    } else {
      maxApplied = Math.max(maxApplied, biasAdded / originalTotal);
    }
  }

  return Object.freeze({
    positions: Object.freeze(biased.map((frequencies) => Object.freeze(frequencies))),
    sampleCount: model.sampleCount,
    startDate: model.startDate,
    endDate: model.endDate,
    newsInfluence: Object.freeze({
      applied: maxApplied,
      capped,
      sources:
        Array.isArray(news.sources) && news.sources.length > 0
          ? news.sources.length
          : 1,
      suggestions: news.suggestedNumbers.length,
    }),
  });
}
