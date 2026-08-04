import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { scrapeFromHtml, extractDraws, stripHtml } from "../scripts/scrape-news.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, "fixtures", "thaiger-snapshot.html");
const FIXTURE_HTML = readFileSync(FIXTURE_PATH, "utf8");

test("stripHtml removes tags, scripts, styles, and collapses whitespace", () => {
  const sample = `
    <html>
      <head><style>.x{color:red}</style></head>
      <body>
        <script>var x = 1;</script>
        <p>Hello&nbsp;world &amp; goodbye</p>
        <!-- comment -->
      </body>
    </html>
  `;
  const stripped = stripHtml(sample);
  assert.ok(!stripped.includes("<"), "no tags remain");
  assert.ok(!stripped.includes("color:red"), "no CSS remains");
  assert.ok(!stripped.includes("var x"), "no JS remains");
  assert.ok(!stripped.includes("comment"), "no HTML comments remain");
  assert.ok(stripped.includes("Hello world & goodbye"));
  assert.ok(!stripped.includes("  "), "whitespace collapsed");
});

test("extractDraws parses the saved Thaiger fixture and returns draws in newest-first order", () => {
  const text = stripHtml(FIXTURE_HTML);
  const draws = extractDraws(text);

  assert.ok(draws.length >= 5, `expected ≥5 draws, got ${draws.length}`);
  assert.equal(draws[0].date, "2026-08-01", "first draw is the freshest homepage headline");
  assert.equal(draws[0].firstPrize, "932479");
  assert.deepEqual(draws[0].first3, ["413", "672"]);
  assert.deepEqual(draws[0].last3, ["154", "039"]);
  assert.equal(draws[0].last2, "69");
  // Archive list draws follow in chronological-descending order.
  assert.equal(draws[1].date, "2026-07-16");
  assert.equal(draws[1].firstPrize, "639214");
  assert.equal(draws[2].date, "2026-07-01");
  assert.equal(draws[3].date, "2026-06-16");
  assert.equal(draws[4].date, "2026-06-01");
});

test("scrapeFromHtml builds a complete news.json-shaped object from the fixture", () => {
  const fixedTimestamp = "2026-08-04T10:00:00Z";
  const news = scrapeFromHtml(FIXTURE_HTML, { fetchedAt: fixedTimestamp });

  assert.equal(news.fetchedAt, fixedTimestamp);
  assert.ok(Array.isArray(news.sources));
  assert.equal(news.sources.length, 1);
  assert.equal(news.sources[0].id, "thaiger");
  assert.equal(news.sources[0].drawCount, 5);
  assert.equal(news.sources[0].latestDrawDate, "2026-08-01");

  assert.ok(Array.isArray(news.suggestedNumbers));
  // 5 draws × (1 firstPrize + 2 first3 + 2 last3 + 1 last2) = 30 suggestions.
  assert.equal(news.suggestedNumbers.length, 30);

  const first = news.suggestedNumbers[0];
  assert.deepEqual(first.digits, [9, 3, 2, 4, 7, 9]);
  assert.equal(first.source, "thaiger-1st-prize");
  assert.equal(first.drawDate, "2026-08-01");
  assert.equal(first.weight, 1, "freshest draw gets full weight");

  const second = news.suggestedNumbers[1];
  assert.deepEqual(second.digits, [4, 1, 3]);
  assert.equal(second.source, "thaiger-first3");
  assert.equal(second.weight, 0.5, "first3/last3 get half the parent weight");

  assert.ok(
    Number.isFinite(news.freshness.hoursSinceLastDraw) &&
      news.freshness.hoursSinceLastDraw >= 0,
    "freshness.hoursSinceLastDraw is a non-negative finite number",
  );
});

test("scrapeFromHtml returns empty suggestions when fixture is unparseable", () => {
  const news = scrapeFromHtml("<html><body>nothing useful here</body></html>");
  assert.equal(news.suggestedNumbers.length, 0);
  assert.equal(news.sources.length, 0);
  assert.equal(news.freshness.hoursSinceLastDraw, null);
});

test("extractDraws dedupes the same draw date appearing in both headline and archive", () => {
  // Construct an HTML snippet where the same date appears twice.
  const duplicateHtml = `
    Government Lottery Results 01 August 2026
    1st prize 111111 first 3 digits 222 333 last 3 digits 444 555 last 2 digits 66
    Government Lottery Results 01 August 2026
    1st prize 111111 first 3 digits 222 333 last 3 digits 444 555 last 2 digits 66
    Government Lottery Results 16 July 2026
    1st prize 777777 first 3 digits 888 999 last 3 digits 000 111 last 2 digits 22
  `;
  const draws = extractDraws(duplicateHtml);
  assert.equal(draws.length, 2, "duplicate draw date collapsed to one entry");
  assert.equal(draws[0].date, "2026-08-01");
  assert.equal(draws[1].date, "2026-07-16");
});
