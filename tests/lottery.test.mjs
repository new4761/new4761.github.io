import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFirstPrizeModel,
  generateModelLotteryNumber,
} from "../lottery.mjs";

function sourceFrom(bytes) {
  let index = 0;

  return {
    getRandomValues(target) {
      target[0] = bytes[index];
      index += 1;
      return target;
    },
  };
}

const fixtureCsv = `date,first,second
2024-01-01,012345,111111
2024-01-16,112345,222222
not-a-date,888888,333333
2024-02-01,912340,444444
2024-02-16,12345,555555`;

test("builds positional frequencies from valid first-prize rows", () => {
  // Given
  const expectedFirstPosition = [1, 1, 0, 0, 0, 0, 0, 0, 0, 1];

  // When
  const model = buildFirstPrizeModel(fixtureCsv);

  // Then
  assert.deepEqual(model.positions[0], expectedFirstPosition);
  assert.equal(model.sampleCount, 3);
  assert.equal(model.startDate, "2024-01-01");
  assert.equal(model.endDate, "2024-02-01");
});

test("samples each digit from its historical position", () => {
  // Given
  const positions = Array.from({ length: 6 }, () => [
    1, 1, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);
  const model = {
    positions,
    sampleCount: 2,
    startDate: "2024-01-01",
    endDate: "2024-01-16",
  };
  const randomSource = sourceFrom([0, 1, 0, 1, 0, 1]);

  // When
  const result = generateModelLotteryNumber(model, randomSource);

  // Then
  assert.equal(result, "010101");
});

test("retries values outside the unbiased model range", () => {
  // Given
  const positions = Array.from({ length: 6 }, () => [
    1, 1, 1, 0, 0, 0, 0, 0, 0, 0,
  ]);
  const model = {
    positions,
    sampleCount: 3,
    startDate: "2024-01-01",
    endDate: "2024-02-01",
  };
  const randomSource = sourceFrom([4_294_967_295, 2, 0, 0, 0, 0, 0]);

  // When
  const result = generateModelLotteryNumber(model, randomSource);

  // Then
  assert.equal(result, "200000");
});
