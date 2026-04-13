import puppeteer from "puppeteer";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
mkdirSync(DATA_DIR, { recursive: true });

const COUNTRIES = {
  KR: { cc: "kr", name: "한국" },
  TW: { cc: "tw", name: "대만" },
  JP: { cc: "jp", name: "일본" },
  US: { cc: "us", name: "미국" },
  TH: { cc: "th", name: "태국" }
};

/* ═══ 장르 매핑 ═══ */
const GM = {
  "action":"액션","role playing":"RPG","role-playing":"RPG","rpg":"RPG","strategy":"전략",
  "puzzle":"퍼즐","casual":"캐주얼","simulation":"시뮬레이션","adventure":"어드벤처",
  "sports":"스포츠","card":"카드","board":"카드","music":"리듬","racing":"액션","arcade":"액션",
  "trivia":"퍼즐","word":"퍼즐","family":"캐주얼","indie":"어드벤처",
  "롤플레잉":"RPG","전략":"전략","퍼즐":"퍼즐","캐주얼":"캐주얼","액션":"액션",
  "시뮬레이션":"시뮬레이션","어드벤처":"어드벤처","스포츠":"스포츠","카드":"카드","보드":"카드",
  "음악":"리듬","레이싱":"액션","아케이드":"액션"
};
const toG = (r) => {
  if (!r) return "";
  const l = r.toLowerCase().trim();
  return GM[l] || GM[l.split(/[\/,&·\-]/)[0].trim()] || r;
};

/* ═══ NEXON 감지 ═══ */
const NX_DEVS = [
  "nexon","nexon company","nexon corporation","nexon korea","nexon korea corporation",
  "nexon games","neople","neople inc","toben studio","toben studio inc",
  "nexon gt","embark studios","nat games","mintrocket"
];
const isNexon = (dev) => {
  if (!dev) return false;
  const dl = dev.toLowerCase().trim();
  return NX_DEVS.some(nx => dl.includes(nx));
};

/* ═══ App Store 피쳐드 크롤링 ═══ */
async function crawlAppleStore(page, cc) {
  const apps = [];

  // 1) Today 탭
  try {
    console.log(`  [Apple Today] ${cc}`);
    await page.goto(`https://apps.apple.com/${cc}/iphone/today`, { waitUntil: "networkidle2", timeout: 30000 });
    await page.waitForSelector('a[href*="/app/"], a[href*="/game/"]', { timeout: 10000 }).catch(() => {});
    await autoScroll(page);

    const todayApps = await page.evaluate(() => {
      const results = [];
      // 카드 안의 앱 lockup 추출
      const lockups = document.querySelectorAll('a.we-lockup, a[href*="/app/"], a[href*="/game/"]');
      lockups.forEach(el => {
        const href = el.getAttribute("href") || "";
        if (!href.includes("/app/") && !href.includes("/game/")) return;
        // 게임 카테고리 확인 (URL에 /game/ 포함되면 확실한 게임)
        const isGame = href.includes("/game/");
        const nameEl = el.querySelector(".we-lockup__title, .we-lockup__text .we-truncate, [class*=title], p, h3");
        const name = nameEl ? nameEl.textContent.trim() : "";
        const devEl = el.querySelector(".we-lockup__subtitle, [class*=subtitle]");
        const dev = devEl ? devEl.textContent.trim() : "";
        const imgEl = el.querySelector("img, picture source, [srcset]");
        let icon = "";
        if (imgEl) icon = imgEl.getAttribute("src") || imgEl.getAttribute("srcset")?.split(" ")[0] || "";
        if (name && name.length >= 2 && name.length <= 40) {
          results.push({ name, dev, icon, url: href.startsWith("http") ? href : "https://apps.apple.com" + href, isGame });
        }
      });
      return results;
    });

    todayApps.forEach((app, i) => {
      if (!app.isGame && !app.url.includes("/game/")) return;
      apps.push({
        name: app.name, dev: app.dev, icon: app.icon, url: app.url,
        tab: "Today", section: "Featured", priority: i + 1,
        genre: "", rating: 0, category: "Games",
        nexon: isNexon(app.dev)
      });
    });
  } catch (e) { console.warn(`  [Apple Today Error] ${cc}:`, e.message); }

  // 2) Games 탭
  try {
    console.log(`  [Apple Games] ${cc}`);
    await page.goto(`https://apps.apple.com/${cc}/iphone/games`, { waitUntil: "networkidle2", timeout: 30000 });
    await page.waitForSelector('a[href*="/app/"], a[href*="/game/"]', { timeout: 10000 }).catch(() => {});
    await autoScroll(page);

    const gamesApps = await page.evaluate(() => {
      const results = [];
      const lockups = document.querySelectorAll('a.we-lockup, a[href*="/game/"], a[href*="/app/"]');
      lockups.forEach(el => {
        const href = el.getAttribute("href") || "";
        if (!href.includes("/app/") && !href.includes("/game/")) return;
        const nameEl = el.querySelector(".we-lockup__title, .we-lockup__text .we-truncate, [class*=title], p, h3");
        const name = nameEl ? nameEl.textContent.trim() : "";
        const devEl = el.querySelector(".we-lockup__subtitle, [class*=subtitle]");
        const dev = devEl ? devEl.textContent.trim() : "";
        const imgEl = el.querySelector("img");
        const icon = imgEl ? (imgEl.getAttribute("src") || "") : "";
        if (name && name.length >= 2 && name.length <= 40) {
          results.push({ name, dev, icon, url: href.startsWith("http") ? href : "https://apps.apple.com" + href });
        }
      });
      return results;
    });

    const existing = new Set(apps.map(a => a.name.toLowerCase()));
    gamesApps.forEach((app, i) => {
      if (existing.has(app.name.toLowerCase())) return;
      existing.add(app.name.toLowerCase());
      apps.push({
        name: app.name, dev: app.dev, icon: app.icon, url: app.url,
        tab: "Games", section: "Featured", priority: 50 + i,
        genre: "", rating: 0, category: "Games",
        nexon: isNexon(app.dev)
      });
    });
  } catch (e) { console.warn(`  [Apple Games Error] ${cc}:`, e.message); }

  // 순위 매기기
  apps.forEach((a, i) => a.rank = i + 1);
  return apps;
}

/* ═══ 자동 스크롤 ═══ */
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= 3000) { clearInterval(timer); resolve(); }
      }, 200);
    });
  });
  // 스크롤 후 콘텐츠 로딩 대기
  await new Promise(r => setTimeout(r, 2000));
}

/* ═══ 개별 앱 상세 페이지에서 장르 가져오기 ═══ */
async function enrichGenre(page, apps) {
  for (const app of apps.slice(0, 20)) {
    if (app.genre || !app.url) continue;
    try {
      await page.goto(app.url, { waitUntil: "domcontentloaded", timeout: 15000 });
      const genre = await page.evaluate(() => {
        // 장르 정보 찾기
        const genreEl = document.querySelector('a.inline-list__item[href*="/genre/"], .information-list__item__definition a, dd.information-list__item__definition a');
        if (genreEl) return genreEl.textContent.trim();
        const allLinks = [...document.querySelectorAll('a')];
        const genreLink = allLinks.find(a => (a.href || "").includes("/genre/") && a.textContent.trim().length > 1);
        return genreLink ? genreLink.textContent.trim() : "";
      });
      if (genre) app.genre = toG(genre);
    } catch (e) { /* skip */ }
  }
}

/* ═══ 메인 실행 ═══ */
async function main() {
  console.log("🚀 Starting App Store Featured Crawler...");
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  });

  for (const [code, cfg] of Object.entries(COUNTRIES)) {
    console.log(`\n📱 Crawling ${code} (${cfg.name})...`);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

    try {
      const appleApps = await crawlAppleStore(page, cfg.cc);
      console.log(`  → Apple: ${appleApps.length} games found`);

      // 상세 페이지에서 장르 보강
      if (appleApps.length > 0) {
        console.log("  → Enriching genres...");
        await enrichGenre(page, appleApps);
      }

      const data = {
        country: code,
        date: new Date().toISOString().slice(0, 10),
        updated: new Date().toISOString(),
        apple: appleApps
      };

      const filePath = join(DATA_DIR, `${code}.json`);
      writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`  ✅ Saved ${filePath}`);
    } catch (e) {
      console.error(`  ❌ ${code} failed:`, e.message);
      // 빈 데이터라도 저장
      const filePath = join(DATA_DIR, `${code}.json`);
      writeFileSync(filePath, JSON.stringify({ country: code, date: new Date().toISOString().slice(0, 10), apple: [], error: e.message }, null, 2));
    }

    await page.close();
  }

  await browser.close();
  console.log("\n🏁 Crawl complete!");
}

main().catch(e => { console.error(e); process.exit(1); });

