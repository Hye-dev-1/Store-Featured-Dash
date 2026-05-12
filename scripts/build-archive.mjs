// scripts/build-archive.mjs
// crawl-featured.mjs 직후 실행. data/*.json → data/archive/YYYY-MM-DD/*.json
// 그리고 data/index.json (날짜 리스트 + 메타) 갱신.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_DIR = join(ROOT, "data");
const ARCHIVE_DIR = join(DATA_DIR, "archive");
const COUNTRIES = ["KR", "TW", "JP", "US", "TH"];
const RETENTION_DAYS = 90; // 아카이브 보관 일수

function loadCountry(code) {
  const p = join(DATA_DIR, `${code}.json`);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    console.warn(`[archive] parse fail ${code}: ${e.message}`);
    return null;
  }
}

function ensureDir(d) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

function archiveSnapshot(date, countryData) {
  const dayDir = join(ARCHIVE_DIR, date);
  ensureDir(dayDir);
  for (const [code, data] of Object.entries(countryData)) {
    if (!data) continue;
    const dest = join(dayDir, `${code}.json`);
    writeFileSync(dest, JSON.stringify(data, null, 2));
  }
}

function pruneOldSnapshots() {
  if (!existsSync(ARCHIVE_DIR)) return;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const dirs = readdirSync(ARCHIVE_DIR).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  let pruned = 0;
  for (const d of dirs) {
    if (d < cutoffStr) {
      const p = join(ARCHIVE_DIR, d);
      try {
        rmSync(p, { recursive: true, force: true });
        pruned++;
      } catch (e) {
        console.warn(`[archive] prune fail ${d}: ${e.message}`);
      }
    }
  }
  if (pruned) console.log(`[archive] pruned ${pruned} day(s) older than ${cutoffStr}`);
}

function buildIndex() {
  // 아카이브에 존재하는 모든 날짜 + 각 날짜의 카운트
  if (!existsSync(ARCHIVE_DIR)) ensureDir(ARCHIVE_DIR);
  const dirs = readdirSync(ARCHIVE_DIR)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort((a, b) => b.localeCompare(a)); // 최신 우선

  const dates = [];
  for (const d of dirs) {
    const dayPath = join(ARCHIVE_DIR, d);
    const entry = { date: d, countries: {} };
    for (const code of COUNTRIES) {
      const p = join(dayPath, `${code}.json`);
      if (!existsSync(p)) continue;
      try {
        const j = JSON.parse(readFileSync(p, "utf8"));
        entry.countries[code] = {
          apple: (j.apple || []).length,
          google: (j.google || []).length,
          updated: j.updated || null,
        };
      } catch {}
    }
    if (Object.keys(entry.countries).length) dates.push(entry);
  }

  const index = {
    generated: new Date().toISOString(),
    retention_days: RETENTION_DAYS,
    countries: COUNTRIES,
    latest: dates[0]?.date || null,
    dates,
  };
  writeFileSync(join(DATA_DIR, "index.json"), JSON.stringify(index, null, 2));
  console.log(`[archive] index.json: ${dates.length} day(s), latest=${index.latest}`);
}

function main() {
  // 1) 현재 data/*.json 읽기
  const today = new Date().toISOString().slice(0, 10);
  const countryData = {};
  let detectedDate = today;
  for (const code of COUNTRIES) {
    const d = loadCountry(code);
    countryData[code] = d;
    if (d?.date) detectedDate = d.date; // 크롤러가 박은 날짜 우선
  }

  console.log(`[archive] snapshotting date=${detectedDate}`);
  archiveSnapshot(detectedDate, countryData);

  // 2) 오래된 스냅샷 정리
  pruneOldSnapshots();

  // 3) index 빌드
  buildIndex();

  console.log("[archive] done");
}

main();
