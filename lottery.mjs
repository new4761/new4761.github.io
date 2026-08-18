const DIGIT_COUNT = 6;
const DIGIT_RADIX = 10;
const UINT32_RANGE = 2 ** 32;
export const DEFAULT_NEWS_STALE_DAYS = 30;
const DEFAULT_NEWS_SOURCE_LABEL = "unknown";

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

function parseNewsDate(value) {
  if (typeof value !== "string") {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

export function filterRecentNewsSuggestions(rawNews, options = {}) {
  const staleDays =
    Number.isFinite(options.staleDays) && options.staleDays >= 0
      ? options.staleDays
      : DEFAULT_NEWS_STALE_DAYS;

  if (
    rawNews === null ||
    typeof rawNews !== "object" ||
    !Array.isArray(rawNews.suggestedNumbers) ||
    rawNews.suggestedNumbers.length === 0
  ) {
    return rawNews;
  }

  const freshnessHours =
    rawNews.freshness && Number.isFinite(rawNews.freshness.hoursSinceLastDraw)
      ? Number(rawNews.freshness.hoursSinceLastDraw)
      : null;

  if (
    freshnessHours !== null &&
    freshnessHours > staleDays * 24 &&
    rawNews.suggestedNumbers.length > 0
  ) {
    return {
      ...rawNews,
      suggestedNumbers: [],
      _staleFilter: {
        applied: true,
        removedCount: rawNews.suggestedNumbers.length,
        staleDays,
        latestDate: null,
        reason: `freshness older than ${staleDays} days`,
      },
    };
  }

  let latest = Number.NEGATIVE_INFINITY;
  for (const suggestion of rawNews.suggestedNumbers) {
    if (!suggestion || typeof suggestion !== "object") {
      continue;
    }
    const ts = parseNewsDate(suggestion.drawDate);
    if (ts !== null && ts > latest) {
      latest = ts;
    }
  }

  if (!Number.isFinite(latest)) {
    return rawNews;
  }

  const staleCutoff = latest - staleDays * 24 * 60 * 60 * 1000;
  const filteredSuggestions = rawNews.suggestedNumbers.filter((suggestion) => {
    if (!suggestion || typeof suggestion !== "object") {
      return false;
    }
    const ts = parseNewsDate(suggestion.drawDate);
    return ts !== null && ts >= staleCutoff && ts <= latest;
  });

  if (filteredSuggestions.length === rawNews.suggestedNumbers.length) {
    return rawNews;
  }

  return {
    ...rawNews,
    suggestedNumbers: filteredSuggestions,
    _staleFilter: {
      applied: true,
      removedCount: rawNews.suggestedNumbers.length - filteredSuggestions.length,
      latestDate: new Date(latest).toISOString().slice(0, 10),
      staleDays,
    },
  };
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
    endDate: dates[dates.length - 1],
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

function getNewsSourceId(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed.toLowerCase();
    }
  }

  if (value !== null && typeof value === "object") {
    if (typeof value.id === "string" && value.id.trim().length > 0) {
      return value.id.trim().toLowerCase();
    }
    if (typeof value.name === "string" && value.name.trim().length > 0) {
      return value.name.trim().toLowerCase();
    }
  }

  return DEFAULT_NEWS_SOURCE_LABEL;
}

function aggregateNewsSuggestions(suggestions) {
  const aggregated = new Map();
  const sources = new Set();

  for (const suggestion of suggestions) {
    if (!isValidSuggestion(suggestion)) {
      continue;
    }
    const source = suggestion.source;
    const sourceId = getNewsSourceId(source);
    const key = `${sourceId}:${suggestion.digits.join(".")}`;
    sources.add(sourceId);

    const existing = aggregated.get(key);
    if (!existing || suggestion.weight > existing.weight) {
      aggregated.set(key, {
        source,
        sourceId,
        digits: suggestion.digits,
        weight: suggestion.weight,
      });
    }
  }

  return {
    suggestions: [...aggregated.values()],
    sourceCount: sources.size,
  };
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
  const aggregate = aggregateNewsSuggestions(news.suggestedNumbers);
  const sourceCount =
    Array.isArray(news.sources) && news.sources.length > 0
      ? news.sources.length
      : aggregate.sourceCount;
  const totalPositions = biased.length;

  for (const suggestion of aggregate.suggestions) {
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
      sources: sourceCount,
      suggestions: aggregate.suggestions.length,
    }),
  });
}
