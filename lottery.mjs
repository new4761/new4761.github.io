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
