#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const DATA_FILE = "lottery_results.csv";
const HASH_FILE = `${DATA_FILE}.sha`;
const REPO = "new4761/Thai_lottery_analysis";
const REF = "main";
const API_URL = `https://api.github.com/repos/${REPO}/contents/lottery_results.csv?ref=${REF}`;
const RAW_URL = `https://raw.githubusercontent.com/${REPO}/${REF}/${DATA_FILE}`;
const USER_AGENT = "pocket-tools-data-sync/1.0";

const auth = process.env.GITHUB_TOKEN
  ? `Bearer ${process.env.GITHUB_TOKEN}`
  : null;

async function loadRemoteMetadata() {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
  };

  if (auth !== null) {
    headers.Authorization = auth;
  }

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
    },
  });
  if (!response.ok) {
    throw new Error(`raw.githubusercontent returned ${response.status} for ${RAW_URL}`);
  }
  return response.text();
}

function readPreviousHash() {
  if (!existsSync(HASH_FILE)) {
    return "";
  }
  return readFileSync(HASH_FILE, "utf8").trim();
}

function writeUpdatedState(content, remoteSha) {
  writeFileSync(DATA_FILE, content, "utf8");
  writeFileSync(HASH_FILE, `${remoteSha}\n`, "utf8");
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
  if (!isValidCsv(csvText)) {
    throw new Error(`Downloaded content from raw URL is not a valid lottery_results.csv payload`);
  }

  writeUpdatedState(csvText, remoteSha);
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

