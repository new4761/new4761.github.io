#!/usr/bin/env node
import { writeFileSync } from "node:fs";

const THAIGER_URL = "https://thethaiger.com/thai-lottery/";
const NEWS_FILE = process.argv[2] ?? "news.json";
const MAX_DRAWS = 5;

const MONTHS = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

async function fetchHtml(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-GB,en;q=0.9",
      "User-Agent": "Pocket-Tools/1.0 (+https://new4761.github.io/)",
    },
  });
  if (!res.ok) {
    throw new Error(`${url} returned ${res.status}`);
  }
  return res.text();
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?[a-z][^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");
}

function extractDraws(text) {
  const pattern =
    /Government [Ll]ottery [Rr]esults[^()\d]{0,80}(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})[\s\S]{0,3000}?1st prize\s*\D{0,5}(\d{6})\D{0,80}?first 3 digits\s*\D{0,5}(\d{3})\s+(\d{3})\D{0,80}?last 3 digits\s*\D{0,5}(\d{3})\s+(\d{3})\D{0,80}?last 2 digits\s*\D{0,5}(\d{2})/g;

  const results = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const [, dayStr, monthStr, yearStr, firstPrize, f3a, f3b, l3a, l3b, l2] = match;
    const month = MONTHS[monthStr.slice(0, 3)];
    if (month === undefined) {
      continue;
    }
    const date = formatIsoDate(Number(yearStr), month, Number(dayStr));
    results.push({
      date,
      firstPrize,
      first3: [f3a, f3b],
      last3: [l3a, l3b],
      last2: l2,
    });
    if (results.length >= MAX_DRAWS) {
      break;
    }
  }
  return results;
}

function formatIsoDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function hoursSince(dateStr) {
  const draw = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(draw)) {
    return null;
  }
  return Math.max(0, Math.round((Date.now() - draw) / (60 * 60 * 1000)));
}

function toDigits(numStr) {
  return Array.from(numStr, Number);
}

function buildSuggestions(draws) {
  const result = [];
  for (let i = 0; i < draws.length; i += 1) {
    const draw = draws[i];
    const weight = 1 / (1 + i * 0.5);

    result.push({
      digits: toDigits(draw.firstPrize),
      weight,
      source: "thaiger-1st-prize",
      drawDate: draw.date,
    });

    for (const d of draw.first3) {
      result.push({
        digits: toDigits(d),
        weight: weight * 0.5,
        source: "thaiger-first3",
        drawDate: draw.date,
      });
    }

    for (const d of draw.last3) {
      result.push({
        digits: toDigits(d),
        weight: weight * 0.5,
        source: "thaiger-last3",
        drawDate: draw.date,
      });
    }

    result.push({
      digits: toDigits(draw.last2),
      weight: weight * 0.4,
      source: "thaiger-last2",
      drawDate: draw.date,
    });
  }
  return result;
}

async function main() {
  const news = {
    fetchedAt: new Date().toISOString(),
    sources: [],
    suggestedNumbers: [],
    freshness: { hoursSinceLastDraw: null },
  };

  try {
    const html = await fetchHtml(THAIGER_URL);
    const text = stripHtml(html);
    const draws = extractDraws(text);
    if (draws.length === 0) {
      console.warn("No draws parsed from Thaiger homepage");
    } else {
      news.sources.push({
        id: "thaiger",
        url: THAIGER_URL,
        drawCount: draws.length,
        latestDrawDate: draws[0].date,
      });
      news.suggestedNumbers = buildSuggestions(draws);
      news.freshness.hoursSinceLastDraw = hoursSince(draws[0].date);
    }
  } catch (err) {
    console.error("Thaiger fetch failed:", err.message);
  }

  writeFileSync(NEWS_FILE, `${JSON.stringify(news, null, 2)}\n`, "utf8");
  console.log(`Wrote ${NEWS_FILE} with ${news.suggestedNumbers.length} suggestions`);
}

main().catch((err) => {
  console.error("scraper failed:", err);
  process.exit(0);
});