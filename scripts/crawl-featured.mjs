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

/* ═══ 앱 상세 페이지 → 개발사 + 장르 ═══ */
async function getAppDetail(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    return await page.evaluate(() => {
      let dev = "", genre = "";
      const devEl = document.querySelector("h2.product-header__identity a, .product-header__identity a");
      if (devEl) dev = devEl.textContent.trim();
      if (!dev) { const s = document.querySelector(".product-header__subtitle"); if (s) dev = s.textContent.trim(); }
      const genreEl = document.querySelector('dd.information-list__item__definition a[href*="/genre/"]');
      if (genreEl) genre = genreEl.textContent.trim();
      if (!genre) { const g = [...document.querySelectorAll("a")].find(a => (a.href||"").includes("/genre/") && a.textContent.trim().length > 1); if (g) genre = g.textContent.trim(); }
      return { dev, genre };
    });
  } catch (e) { return { dev: "", genre: "" }; }
}

/* ═══════════════════════════════════════
   Games 탭 추출
   배너: shelf-grid Spotlight 안의 hero 카드
     → a[data-test-id="internal-link"][href*="/app/"]
     → 안에 [data-test-id="hero"] 있으면 배너
     → h2 = 앱 이름
   일반: a[href*="/app/"] with h3
   ═══════════════════════════════════════ */
async function extractGamesTab(page) {
  return await page.evaluate(() => {
    const apps = [];
    const seen = new Set();

    // 1) 배너: hero 카드 (Spotlight shelf)
    const heroLinks = document.querySelectorAll('a[href*="/app/"]');
    heroLinks.forEach(el => {
      const href = el.getAttribute("href") || "";
      if (!href.includes("/app/")) return;
      const hero = el.querySelector('[data-test-id="hero"]');
      if (!hero) return; // hero가 없으면 배너 아님

      // 앱 이름: h2 또는 aria-label
      let name = "";
      const h2 = el.querySelector("h2");
      if (h2) name = h2.textContent.trim();
      if (!name) name = el.getAttribute("aria-label")?.split(",")[0]?.trim() || "";
      if (!name || name.length < 2 || name.length > 40 || seen.has(name.toLowerCase())) return;

      // 아이콘: lockup-container 안의 앱 아이콘
      const iconEl = el.querySelector('.lockup-container img[src*="mzstatic"], .app-icon img[src*="mzstatic"]');
      const icon = iconEl ? iconEl.getAttribute("src") || "" : "";

      // eyebrow 배지 (예: "새로운 게임")
      const eyebrowEl = el.querySelector(".eyebrow");
      const eyebrow = eyebrowEl ? eyebrowEl.textContent.trim() : "";

      seen.add(name.toLowerCase());
      apps.push({ name, icon, url: href.startsWith("http") ? href : "https://apps.apple.com" + href, isBanner: true, eyebrow });
    });

    // 2) 일반 앱: h3를 가진 링크
    const allLinks = document.querySelectorAll('a[href*="/app/"]');
    allLinks.forEach(el => {
      const href = el.getAttribute("href") || "";
      if (!href.includes("/app/") || href.includes("/story/")) return;
      let name = "";
      const h3 = el.querySelector("h3");
      if (h3) name = h3.textContent.trim();
      if (!name) name = el.getAttribute("aria-label") || "";
      if (!name || name.length < 2 || name.length > 40 || seen.has(name.toLowerCase())) return;

      const iconEl = el.querySelector('img[src*="mzstatic"]');
      const icon = iconEl ? iconEl.getAttribute("src") || "" : "";

      seen.add(name.toLowerCase());
      apps.push({ name, icon, url: href.startsWith("http") ? href : "https://apps.apple.com" + href, isBanner: false, eyebrow: "" });
    });

    return apps;
  });
}

/* ═══════════════════════════════════════
   Today 탭 추출
   배너: .wrapper > .overlay > .small-lockup-item > a[href*="/app/"]
     → aria-label = 앱 이름
     → 부모에 picture source 있으면 배너 카드
   일반: a[href*="/app/"] (게임만 = /game/ URL)
   ═══════════════════════════════════════ */
async function extractTodayTab(page) {
  return await page.evaluate(() => {
    const apps = [];
    const seen = new Set();

    // 1) 배너: small-lockup-item 안의 앱 링크
    const lockupLinks = document.querySelectorAll('.small-lockup-item a[href*="/app/"]');
    lockupLinks.forEach(el => {
      const href = el.getAttribute("href") || "";
      if (!href.includes("/app/")) return;
      const name = el.getAttribute("aria-label") || "";
      if (!name || name.length < 2 || name.length > 40 || seen.has(name.toLowerCase())) return;

      const iconEl = el.closest(".small-lockup-item")?.querySelector('img[src*="mzstatic"]');
      const icon = iconEl ? iconEl.getAttribute("src") || "" : "";

      seen.add(name.toLowerCase());
      apps.push({ name, icon, url: href.startsWith("http") ? href : "https://apps.apple.com" + href, isBanner: true });
    });

    // 2) 일반: h3를 가진 앱 링크 (게임 카테고리)
    const allLinks = document.querySelectorAll('a[href*="/app/"]');
    allLinks.forEach(el => {
      const href = el.getAttribute("href") || "";
      if (!href.includes("/app/") || href.includes("/story/")) return;
      let name = "";
      const h3 = el.querySelector("h3");
      if (h3) name = h3.textContent.trim();
      if (!name) name = el.getAttribute("aria-label") || "";
      if (!name || name.length < 2 || name.length > 40 || seen.has(name.toLowerCase())) return;

      const iconEl = el.querySelector('img[src*="mzstatic"]');
      const icon = iconEl ? iconEl.getAttribute("src") || "" : "";

      seen.add(name.toLowerCase());
      apps.push({ name, icon, url: href.startsWith("http") ? href : "https://apps.apple.com" + href, isBanner: false });
    });

    return apps;
  });
}

/* ═══ 메인 크롤링 ═══ */
async function crawlAppleStore(page, cc) {
  const allApps = [];
  const seen = new Set();

  // ─── Games 탭 ───
  try {
    console.log(`  [Games Tab]`);
    await page.goto(`https://apps.apple.com/${cc}/iphone/games`, { waitUntil: "networkidle2", timeout: 30000 });
    await autoScroll(page, 5000);
    const gamesApps = await extractGamesTab(page);
    const banners = gamesApps.filter(a => a.isBanner);
    const cards = gamesApps.filter(a => !a.isBanner);
    console.log(`    ${banners.length} banners, ${cards.length} cards`);

    banners.forEach((app, i) => {
      if (seen.has(app.name.toLowerCase())) return;
      seen.add(app.name.toLowerCase());
      allApps.push({
        name: app.name, dev: "", icon: app.icon, url: app.url,
        tab: "Games", section: "배너", priority: i + 1,
        genre: "", rating: 0, category: "Games",
        nexon: false, banner: true
      });
    });
    cards.forEach((app, i) => {
      if (seen.has(app.name.toLowerCase())) return;
      seen.add(app.name.toLowerCase());
      allApps.push({
        name: app.name, dev: "", icon: app.icon, url: app.url,
        tab: "Games", section: "Featured", priority: 20 + i,
        genre: "", rating: 0, category: "Games",
        nexon: false, banner: false
      });
    });
  } catch (e) { console.warn(`  [Games Error]`, e.message); }

  // ─── Today 탭 (게임만) ───
  try {
    console.log(`  [Today Tab]`);
    await page.goto(`https://apps.apple.com/${cc}/iphone/today`, { waitUntil: "networkidle2", timeout: 30000 });
    await autoScroll(page, 5000);
    const todayApps = await extractTodayTab(page);
    const banners = todayApps.filter(a => a.isBanner);
    const cards = todayApps.filter(a => !a.isBanner);
    console.log(`    ${banners.length} banners, ${cards.length} cards`);

    // Today에서는 Games 탭과 중복되지 않는 것만 추가
    banners.forEach((app, i) => {
      if (seen.has(app.name.toLowerCase())) return;
      seen.add(app.name.toLowerCase());
      allApps.push({
        name: app.name, dev: "", icon: app.icon, url: app.url,
        tab: "Today", section: "배너", priority: 50 + i,
        genre: "", rating: 0, category: "Games",
        nexon: false, banner: true
      });
    });
    cards.forEach((app, i) => {
      if (seen.has(app.name.toLowerCase())) return;
      seen.add(app.name.toLowerCase());
      allApps.push({
        name: app.name, dev: "", icon: app.icon, url: app.url,
        tab: "Today", section: "Featured", priority: 70 + i,
        genre: "", rating: 0, category: "Games",
        nexon: false, banner: false
      });
    });
  } catch (e) { console.warn(`  [Today Error]`, e.message); }

  // ─── 상세 페이지: 개발사 + 장르 ───
  const n = Math.min(allApps.length, 30);
  console.log(`  [Detail] ${n} apps...`);
  for (let i = 0; i < n; i++) {
    const app = allApps[i];
    if (!app.url) continue;
    const d = await getAppDetail(page, app.url);
    if (d.dev) { app.dev = d.dev; app.nexon = isNexon(d.dev); }
    if (d.genre) app.genre = toG(d.genre);
    if (i % 5 === 0 && i > 0) console.log(`    ${i}/${n}`);
    await new Promise(r => setTimeout(r, 300));
  }

  allApps.sort((a, b) => a.priority - b.priority);
  allApps.forEach((a, i) => a.rank = i + 1);

  console.log(`  → ${allApps.length} total, ${allApps.filter(a=>a.banner).length} banners, ${allApps.filter(a=>a.nexon).length} NEXON`);
  return allApps;
}

async function autoScroll(page, maxHeight = 3000) {
  await page.evaluate(async (mh) => {
    await new Promise(r => {
      let h = 0;
      const t = setInterval(() => { window.scrollBy(0, 400); h += 400; if (h >= mh) { clearInterval(t); r(); } }, 200);
    });
  }, maxHeight);
  await new Promise(r => setTimeout(r, 2000));
}

async function main() {
  console.log("🚀 App Store Featured Crawler\n");
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  });

  for (const [code, cfg] of Object.entries(COUNTRIES)) {
    console.log(`📱 ${code} (${cfg.name})`);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36");

    try {
      const apps = await crawlAppleStore(page, cfg.cc);
      writeFileSync(join(DATA_DIR, `${code}.json`), JSON.stringify({
        country: code, date: new Date().toISOString().slice(0, 10),
        updated: new Date().toISOString(), apple: apps
      }, null, 2));
      console.log(`  ✅ Saved\n`);
    } catch (e) {
      console.error(`  ❌ ${code}:`, e.message);
      writeFileSync(join(DATA_DIR, `${code}.json`), JSON.stringify({
        country: code, date: new Date().toISOString().slice(0, 10), apple: [], error: e.message
      }, null, 2));
    }
    await page.close();
  }

  await browser.close();
  console.log("🏁 Done!");
}

main().catch(e => { console.error(e); process.exit(1); });
