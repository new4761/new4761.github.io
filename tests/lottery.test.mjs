import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFirstPrizeModel,
  generateModelLotteryNumber,
  applyNewsBias,
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

function uniformModel() {
  const positions = Array.from({ length: 6 }, () =>
    Array.from({ length: 10 }, () => 100),
  );
  return {
    positions,
    sampleCount: 600,
    startDate: "2024-01-01",
    endDate: "2024-12-16",
  };
}

test("applyNewsBias respects the 15% cap on suffix positions", () => {
  // Given: a uniform model (100 per digit per position; originalTotal=1000)
  // and a heavy 3-digit suggestion that would push bias to 200 — over the cap.
  const model = uniformModel();
  const news = {
    fetchedAt: "2026-08-04T10:00:00Z",
    sources: [{ id: "thaiger" }],
    suggestedNumbers: [
      { digits: [0, 0, 1], weight: 200, source: "test" },
    ],
  };

  // When
  const biased = applyNewsBias(model, news);

  // Then
  assert.equal(biased.newsInfluence.applied, 0.15);
  assert.equal(biased.newsInfluence.capped, true);
  // Prefix positions (0, 1, 2) are NOT modified by a 3-digit suggestion.
  assert.deepEqual(biased.positions[0], model.positions[0]);
  assert.deepEqual(biased.positions[1], model.positions[1]);
  assert.deepEqual(biased.positions[2], model.positions[2]);
  // Suffix positions (3, 4, 5) receive exactly 150 weight on one digit (cap).
  assert.equal(biased.positions[3][0], 250);
  assert.equal(biased.positions[3][1], 100);
  assert.equal(biased.positions[4][0], 250);
  assert.equal(biased.positions[5][1], 250);
  assert.equal(biased.positions[5][0], 100);
});

test("applyNewsBias with disabled toggle returns pure-history model", () => {
  // Given
  const model = uniformModel();
  const news = {
    fetchedAt: "2026-08-04T10:00:00Z",
    sources: [{ id: "thaiger" }],
    suggestedNumbers: [
      { digits: [1, 2, 3], weight: 1000, source: "test" },
    ],
  };

  // When toggle is off
  const disabled = applyNewsBias(model, news, { enabled: false });

  // Then disabled matches the original model exactly.
  assert.deepEqual(disabled.positions, model.positions);
  assert.equal(disabled.newsInfluence.applied, 0);
  assert.equal(disabled.newsInfluence.capped, false);
  assert.equal(disabled.newsInfluence.suggestions, 0);

  // And the same news WITH bias enabled must modify positions.
  const enabled = applyNewsBias(model, news);
  let changed = false;
  for (let p = 0; p < model.positions.length && !changed; p += 1) {
    if (
      model.positions[p].some(
        (count, digit) => enabled.positions[p][digit] !== count,
      )
    ) {
      changed = true;
    }
  }
  assert.ok(changed, "enabled applyNewsBias must modify at least one position");
  assert.ok(enabled.newsInfluence.applied > 0);
});

test("applyNewsBias with empty, null, or malformed news falls back to pure history", () => {
  // Given
  const model = uniformModel();

  // When
  const empty = applyNewsBias(model, { suggestedNumbers: [] });
  const nullLike = applyNewsBias(model, null);
  const malformed = applyNewsBias(model, "not an object");
  const undefinedLike = applyNewsBias(model, undefined);

  // Then all variants match the original model.
  assert.deepEqual(empty.positions, model.positions);
  assert.deepEqual(nullLike.positions, model.positions);
  assert.deepEqual(malformed.positions, model.positions);
  assert.deepEqual(undefinedLike.positions, model.positions);

  // And each reports zero news influence.
  assert.equal(empty.newsInfluence.applied, 0);
  assert.equal(nullLike.newsInfluence.applied, 0);
  assert.equal(malformed.newsInfluence.applied, 0);
  assert.equal(undefinedLike.newsInfluence.applied, 0);
});

test("applyNewsBias with 6-digit suggestion biases every position, capped at 15%", () => {
  // Given
  const model = uniformModel();
  const hugeBias = 100_000;
  const news = {
    fetchedAt: "2026-08-04T10:00:00Z",
    sources: [{ id: "thaiger" }],
    suggestedNumbers: [
      { digits: [1, 2, 3, 4, 5, 6], weight: hugeBias, source: "test" },
    ],
  };

  // When
  const biased = applyNewsBias(model, news);

  // Then each position reports 15% (capped).
  assert.equal(biased.newsInfluence.applied, 0.15);
  assert.equal(biased.newsInfluence.capped, true);
  // Each prefix position should now have weight 150 added on its suggested digit.
  // bias added = 100,000 (single digit), original total = 1,000 → cap of 150 → scale = 0.0015.
  // Final: biased[pos][suggested] = 100 + 100_000 * 0.0015 = 100 + 150 = 250.
  assert.equal(biased.positions[0][1], 250);
  assert.equal(biased.positions[1][2], 250);
  assert.equal(biased.positions[2][3], 250);
  assert.equal(biased.positions[3][4], 250);
  assert.equal(biased.positions[4][5], 250);
  assert.equal(biased.positions[5][6], 250);
  // Non-suggested digits stay at 100.
  assert.equal(biased.positions[0][0], 100);
  assert.equal(biased.positions[5][0], 100);
});
