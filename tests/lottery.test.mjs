import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFirstPrizeModel,
  generateModelLotteryNumber,
  applyNewsBias,
  filterRecentNewsSuggestions,
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

test("applyNewsBias with overlapping suggestions on the same suffix digit caps aggregate at 15%", () => {
  // Two length-3 suggestions [1,0,0] and [1,2,3] both target position 3 digit 1
  // (200 added to that single position-digit pair). Other positions get bias
  // on different digits, so each position's biasAdded = 200 too, but spread
  // thin. Original: 100 per digit per position, cap = 15% × 1000 = 150.
  // Expected: each bias over 150 is scaled to exactly 150, so every biased
  // position's biased digit ends up at 250 (100 original + 150 capped bias).
  const model = uniformModel();
  const news = {
    fetchedAt: "2026-08-04T10:00:00Z",
    sources: [{ id: "test" }],
    suggestedNumbers: [
      { digits: [1, 0, 0], weight: 100, source: "test" },
      { digits: [1, 2, 3], weight: 100, source: "test" },
    ],
  };

  // When
  const biased = applyNewsBias(model, news);

  // Then
  // Position 3: digit 1 got 200 added (overlap), capped to 150.
  assert.equal(biased.positions[3][1], 250, "position 3 digit 1 cap-scaled to original + 150");
  assert.equal(biased.positions[3][0], 100, "position 3 digit 0 untouched");
  assert.equal(biased.positions[3][2], 100, "position 3 digit 2 untouched");
  // Position 4: digits 0 and 2 each got 100 added — biasAdded = 200 > cap 150.
  // Scale 0.75: digit 0 = 100 + 100*0.75 = 175; digit 2 = 175.
  assert.equal(biased.positions[4][0], 175);
  assert.equal(biased.positions[4][2], 175);
  assert.equal(biased.positions[4][1], 100);
  // Position 5: digits 0 and 3 each got 100 added — same shape as position 4.
  assert.equal(biased.positions[5][0], 175);
  assert.equal(biased.positions[5][3], 175);
  // maxApplied reported at the full 15% (each position hit the cap).
  assert.equal(biased.newsInfluence.applied, 0.15);
  assert.equal(biased.newsInfluence.capped, true);
});

test("applyNewsBias aggregate bias never exceeds 15% within float tolerance under 100-suggestion stress", () => {
  // 100 suggestions all [1,0,0] weight 10 → position 3 digit 1 gets 1000 added.
  // Original total per position = 1000 (100 × 10 digits). cap = 150.
  // Capped scale 0.15 → biased[3][1] = 100 + 1000*0.15 = 250.
  // Position 3 total weight = 1000 + 150 = 1150.
  //
  // This is the adversarial-shape argument: even when many suggestions pile
  // onto the same position-digit pair, the proportion of news-weighted
  // probability never exceeds 15% / (100% + 15%) ≈ 15% of the position.
  const model = uniformModel();
  const suggestions = [];
  for (let i = 0; i < 100; i += 1) {
    suggestions.push({ digits: [1, 0, 0], weight: 10, source: "stress" });
  }
  const news = {
    fetchedAt: "2026-08-04T10:00:00Z",
    sources: [{ id: "stress" }],
    suggestedNumbers: suggestions,
  };

  // When
  const biased = applyNewsBias(model, news);

  // Then
  assert.ok(
    Math.abs(biased.positions[3][1] - 250) < 1e-9,
    `position 3 digit 1 should be 250 (capped to +150). Got ${biased.positions[3][1]}`,
  );
  const positionTotal = biased.positions[3].reduce((sum, n) => sum + n, 0);
  assert.ok(
    Math.abs(positionTotal - 1150) < 1e-9,
    `position 3 total weight = 1150 (1000 original + 150 capped bias). Got ${positionTotal}`,
  );
  assert.equal(biased.newsInfluence.applied, 0.15);
  assert.equal(biased.newsInfluence.capped, true);
});

test("applyNewsBias uses max weight for duplicate suggestions from the same source", () => {
  // Duplicate entries from one source for identical suggestion patterns should not
  // be double counted; only the strongest suggestion is kept.
  const model = uniformModel();
  const news = {
    fetchedAt: "2026-08-04T10:00:00Z",
    sources: [{ id: "thaiger" }],
    suggestedNumbers: [
      { digits: [1, 0, 0], weight: 100, source: "thaiger" },
      { digits: [1, 0, 0], weight: 100, source: "thaiger" },
      { digits: [1, 0, 0], weight: 20, source: "thaiger" },
      { digits: [9, 9], weight: 8, source: "thaiger" },
    ],
  };

  // When
  const biased = applyNewsBias(model, news);

  // Then
  // Only two unique suggestion keys are kept: 1,0,0 and 9,9.
  assert.equal(biased.newsInfluence.suggestions, 2);
  assert.equal(biased.newsInfluence.capped, false);
  assert.equal(biased.newsInfluence.applied, 0.1);
  // Position 3 adds +100 on digit 1 only (not +300), so total is 200.
  assert.equal(biased.positions[3][1], 200);
  // 9 appears in positions 4 and 5; not enough to cap.
  assert.equal(biased.positions[4][9], 108);
  assert.equal(biased.positions[5][9], 108);
});

test("filterRecentNewsSuggestions keeps suggestions inside freshness window", () => {
  // Given
  const news = {
    suggestedNumbers: [
      { digits: [1, 2, 3], weight: 1, drawDate: "2026-08-16" },
      { digits: [4, 5, 6], weight: 1, drawDate: "2026-07-01" },
      { digits: [9, 8, 7], weight: 1, drawDate: "2026-08-05" },
    ],
  };

  // When
  const filtered = filterRecentNewsSuggestions(news, { staleDays: 14 });

  // Then
  assert.equal(filtered.suggestedNumbers.length, 2);
  assert.equal(filtered._staleFilter.applied, true);
  assert.equal(filtered._staleFilter.removedCount, 1);
  const dates = filtered.suggestedNumbers
    .map((suggestion) => suggestion.drawDate)
    .sort();
  assert.deepEqual(dates, ["2026-08-05", "2026-08-16"]);
});

test("filterRecentNewsSuggestions disables all suggestions when freshness is stale", () => {
  // Given
  const news = {
    freshness: { hoursSinceLastDraw: 500 },
    suggestedNumbers: [
      { digits: [0, 0, 4], weight: 1, drawDate: "2026-08-16" },
      { digits: [1, 1], weight: 1, drawDate: "2026-08-15" },
    ],
  };

  // When
  const filtered = filterRecentNewsSuggestions(news, { staleDays: 14 });

  // Then
  assert.equal(filtered.suggestedNumbers.length, 0);
  assert.equal(filtered._staleFilter.applied, true);
  assert.equal(filtered._staleFilter.removedCount, 2);
  assert.ok(filtered._staleFilter.reason.includes("freshness"));
});
