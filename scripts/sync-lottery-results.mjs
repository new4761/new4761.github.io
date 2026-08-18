#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const DATA_FILE = "lottery_results.csv";
const HASH_FILE = `${DATA_FILE}.sha`;
const META_FILE = `${DATA_FILE}.meta.json`;
const REPO = "new4761/Thai_lottery_analysis";
const REF = "main";
const API_URL = `https://api.github.com/repos/${REPO}/contents/${DATA_FILE}?ref=${REF}`;
const RAW_URL = `https://raw.githubusercontent.com/${REPO}/${REF}/${DATA_FILE}`;
const COMMIT_API_URL = `https://api.github.com/repos/${REPO}/commits?path=${DATA_FILE}&sha=${REF}&per_page=1`;
const USER_AGENT = "pocket-tools-data-sync/1.0";

const auth = process.env.GITHUB_TOKEN
  ? `Bearer ${process.env.GITHUB_TOKEN}`
  : null;

function withAuthHeaders(additional = {}) {
  if (auth === null) {
    return additional;
  }
  return {
    ...additional,
    Authorization: auth,
  };
}

async function loadRemoteMetadata() {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
    ...withAuthHeaders({}),
  };

  const response = await fetch(API_URL, {
    headers,
  });

  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status} for ${API_URL}`);
  }

  return response.json();
}

async function loadRemoteCsv() {
  const response = await fetch(RAW_URL, {
    headers: {
      "User-Agent": USER_AGENT,
      ...withAuthHeaders({}),
    },
  });
  if (!response.ok) {
    throw new Error(`raw.githubusercontent returned ${response.status} for ${RAW_URL}`);
  }
  return response.text();
}

async function loadRemoteUpdatedAt() {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
    ...withAuthHeaders({}),
  };

  const response = await fetch(COMMIT_API_URL, { headers });
  if (!response.ok) {
    return null;
  }

  const commits = await response.json();
  if (!Array.isArray(commits) || commits.length === 0) {
    return null;
  }

  const topCommit = commits[0];
  return topCommit?.commit?.author?.date ?? null;
}

function readPreviousHash() {
  if (!existsSync(HASH_FILE)) {
    return "";
  }
  return readFileSync(HASH_FILE, "utf8").trim();
}

function writeUpdatedState(content, remoteSha, sourceUpdatedAt) {
  writeFileSync(DATA_FILE, content, "utf8");
  writeFileSync(HASH_FILE, `${remoteSha}\n`, "utf8");
  writeFileSync(
    META_FILE,
    `${JSON.stringify(
      {
        sourceSha: remoteSha,
        sourceUpdatedAt: sourceUpdatedAt ?? null,
        syncedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

function isValidCsv(text) {
  if (typeof text !== "string") {
    return false;
  }
  const firstLine = text.split("\n")[0]?.trim() ?? "";
  return firstLine.startsWith("date,first");
}

async function main() {
  const metadata = await loadRemoteMetadata();
  const remoteSha = metadata.sha;

  if (!remoteSha) {
    throw new Error("Remote metadata response did not include a sha");
  }

  const previousSha = readPreviousHash();
  if (previousSha === remoteSha && existsSync(DATA_FILE)) {
    console.log("No lottery_results.csv changes detected (hash match).");
    return 0;
  }

  const csvText = await loadRemoteCsv();
  const sourceUpdatedAt = await loadRemoteUpdatedAt();
  if (typeof csvText !== "string" || csvText.trim().length === 0) {
    throw new Error("Downloaded lottery_results.csv payload is empty.");
  }
  if (!isValidCsv(csvText)) {
    throw new Error(`Downloaded content from raw URL is not a valid lottery_results.csv payload`);
  }

  writeUpdatedState(csvText, remoteSha, sourceUpdatedAt);
  const action = previousSha ? "updated" : "initialized";
  console.log(`lottery_results.csv ${action} with sha ${remoteSha}`);
  return 1;
}

main().then((hasChanges) => {
  if (typeof hasChanges === "number") {
    process.exit(hasChanges === 1 ? 0 : 0);
  }
  process.exit(0);
}).catch((error) => {
  console.error("sync-lottery-results failed:", error);
  process.exit(1);
});
