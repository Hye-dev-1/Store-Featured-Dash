import puppeteer from "puppeteer";
import gplayPkg from "google-play-scraper";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const gplay = gplayPkg.default || gplayPkg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
mkdirSync(DATA_DIR, { recursive: true });

const COUNTRIES = {
  KR: { cc: "kr", name: "한국", hl: "ko", gl: "KR" },
  TW: { cc: "tw", name: "대만", hl: "zh-TW", gl: "TW" },
  JP: { cc: "jp", name: "일본", hl: "ja", gl: "JP" },
  US: { cc: "us", name: "미국", hl: "en", gl: "US" },
  TH: { cc: "th", name: "태국", hl: "th", gl: "TH" }
};

const GM = {
  "action":"액션","role playing":"RPG","role-playing":"RPG","rpg":"RPG","strategy":"전략",
  "puzzle":"퍼즐","casual":"캐주얼","simulation":"시뮬레이션","adventure":"어드벤처",
  "sports":"스포츠","card":"카드","board":"카드","music":"리듬","racing":"액션","arcade":"액션",
  "trivia":"퍼즐","word":"퍼즐","family":"캐주얼","indie":"어드벤처",
  "롤플레잉":"RPG","전략":"전략","퍼즐":"퍼즐","캐주얼":"캐주얼","액션":"액션",
  "시뮬레이션":"시뮬레이션","어드벤처":"어드벤처","스포츠":"스포츠","카드":"카드","보드":"카드",
  "음악":"리듬","레이싱":"액션","아케이드":"액션",
  "mmorpg":"RPG","action rpg":"RPG","moba":"전략","tower defense":"전략",
  "battle royale":"액션","shooter":"액션","fighting":"액션",
  "match 3":"퍼즐","idle":"캐주얼","merge":"캐주얼",
  "tycoon":"시뮬레이션","sandbox":"시뮬레이션","open world":"어드벤처",
  "survival":"어드벤처","tcg":"카드","rhythm":"리듬",
  "games":"캐주얼","entertainment":"캐주얼"
};
const toG = (r) => {
  if (!r) return "";
  const l = r.toLowerCase().trim();
  return GM[l] || GM[l.split(/[\/,&·\-]/)[0].trim()] || r;
};

/* ═══════════════════════════════════════
   NEXON 개발사 식별 validator
   - 정규화: 소문자, 공백 정리, 특수문자 제거, NBSP/탭/제로폭 처리
   - 우선순위 매칭: 더 구체적인 키워드 먼저 검사
   - 결과 캐싱 + 디버그 정보 (어떤 키워드로 매칭됐는지)
   ═══════════════════════════════════════ */

// 더 구체적인 키워드를 먼저 (긴 것 우선) 검사하면 매칭 정보가 더 정확
const NX_DEVS = [
  // ─── NEXON 본사 + 자회사 (Korean) ───
  "nexon korea corporation",
  "nexon korea corp",
  "nexon korea",
  "nexon company",
  "nexon corporation",
  "nexon games",
  "nexon gt",
  "nexon",
  // ─── 자회사 / 스튜디오 ───
  "neople incorporation",
  "neople inc",
  "neople",
  "toben studio inc",
  "toben studio incorporation",
  "toben studio",
  "embark studios ab",
  "embark studios",
  "nat games",
  "mintrocket",
  // ─── 한글 표기 ───
  "넥슨코리아",
  "넥슨 코리아",
  "넥슨게임즈",
  "넥슨 게임즈",
  "넥슨지티",
  "넥슨 지티",
  "넥슨",
  "네오플",
  "민트로켓"
];

// 개발사 문자열 정규화 함수
function normalizeDevString(dev) {
  if (!dev) return "";
  return String(dev)
    .toLowerCase()
    // 제로폭 문자, NBSP 등 제거/공백화
    .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
    .replace(/\u00a0/g, " ")
    // 다양한 공백류를 일반 공백으로
    .replace(/[\t\n\r]+/g, " ")
    // 회사 형식 접미사 제거 (Co., Ltd. 등)
    .replace(/[,\.]?\s*(co\.?,?\s*ltd\.?|ltd\.?|inc\.?|corp\.?|corporation\.?|limited)$/i, "")
    // 연속 공백 정리
    .replace(/\s+/g, " ")
    .trim();
}

// NEXON 판별 + 매칭된 키워드 반환 (디버깅용)
function detectNexon(dev) {
  if (!dev) return { isNexon: false, matched: null, normalized: "" };
  const normalized = normalizeDevString(dev);
  if (!normalized) return { isNexon: false, matched: null, normalized: "" };
  for (const nx of NX_DEVS) {
    if (normalized.includes(nx)) {
      return { isNexon: true, matched: nx, normalized };
    }
  }
  return { isNexon: false, matched: null, normalized };
}

// 기존 isNexon API는 유지 (Backward compat)
const isNexon = (dev) => detectNexon(dev).isNexon;

const GAME_GENRE_KW = [
  "games","game","action","adventure","arcade","board","card","casual","puzzle",
  "racing","role playing","simulation","sports","strategy","trivia","word",
  "게임","액션","어드벤처","퍼즐","캐주얼","전략","rpg","시뮬레이션","스포츠","카드","리듬",
  "アクション","アドベンチャー","パズル","カジュアル","ストラテジー","ロールプレイ","シミュレーション","スポーツ","カード","レーシング","ボード",
  "เกม","กลยุทธ์","ผจญภัย","ปริศนา","จำลอง","กีฬา"
];

const TODAY_GAME_EXCEPTIONS = [
  "maplestory worlds","메이플스토리 월드","메이플스토리월드",
  "メイプルストーリーワールド","楓之谷世界"
];
function isTodayException(name) {
  if (!name) return false;
  const nl = name.toLowerCase().trim();
  return TODAY_GAME_EXCEPTIONS.some(ex => nl.includes(ex));
}

/* ═══════════════════════════════════════
   NEXON 타이틀 사전
   - 부팅 시 NEXON 개발자 페이지에서 자동 동기화 (syncNexonTitlesFromDevPages)
   - 동기화 실패 시 STATIC_NEXON_TITLES_FALLBACK으로 fallback
   - URL/packageId 기반 매칭이 가장 정확 (이름 부분 매칭은 보조)
   ═══════════════════════════════════════ */

// 정적 fallback (네트워크 실패 시 사용)
const STATIC_NEXON_TITLES_FALLBACK = [
  { match: ["메이플 키우기", "메이플키우기", "maplestory: idle rpg"], name: "메이플 키우기" },
  { match: ["메이플스토리 월드", "메이플스토리월드"], name: "MapleStory Worlds" },
  { match: ["메이플스토리 m", "메이플스토리m", "maplestory m"], name: "MapleStory M" },
  { match: ["메이플스토리"], name: "MapleStory" },
  { match: ["마비노기 모바일", "마비노기모바일"], name: "마비노기 모바일" },
  { match: ["마비노기"], name: "마비노기" },
  { match: ["fc 모바일", "fc모바일", "fc mobile"], name: "FC 모바일" },
  { match: ["fc online m"], name: "FC ONLINE M" },
  { match: ["던전앤파이터 모바일", "던파 모바일", "던파모바일"], name: "던전앤파이터 모바일" },
  { match: ["블루 아카이브", "블루아카이브", "blue archive"], name: "Blue Archive" },
  { match: ["퍼스트 디센던트", "퍼스트디센던트", "first descendant"], name: "The First Descendant" },
  { match: ["서든어택"], name: "Sudden Attack" },
  { match: ["카트라이더 러쉬플러스", "카러플", "kartrider rush"], name: "KartRider Rush+" },
  { match: ["maplestory n"], name: "MapleStory N" },
  { match: ["maplestory"], name: "MapleStory" },
  { match: ["the finals"], name: "THE FINALS" },
  { match: ["arc raiders"], name: "ARC Raiders" },
  { match: ["dungeon fighter"], name: "던전앤파이터" },
  { match: ["아주르 프로밀리아"], name: "아주르 프로밀리아" },
  { match: ["히간 이루실"], name: "히간 이루실" },
  { match: ["メイプルストーリー"], name: "MapleStory" },
  { match: ["楓之谷"], name: "MapleStory" }
];

// 런타임에 동기화되는 사전 (부팅 후 채워짐)
let KNOWN_NEXON_TITLES = [...STATIC_NEXON_TITLES_FALLBACK];

// 런타임에 동기화되는 NEXON 앱 ID/패키지 매핑 (가장 정확)
const NEXON_APP_IDS = {
  apple: new Set(),    // Apple appId (예: "1466736988")
  google: new Set()    // Google packageId (예: "com.nexon.kart")
};

/* ═══ Apple NEXON 개발자 페이지에서 라인업 추출 ═══ */
async function fetchAppleNexonLineup(page) {
  const lineup = [];
  try {
    await page.goto(
      "https://apps.apple.com/kr/developer/nexon-company/id523546006",
      { waitUntil: "networkidle2", timeout: 20000 }
    );
    const apps = await page.evaluate(() => {
      const result = [];
      const seen = new Set();
      document.querySelectorAll('a[href*="/app/"]').forEach(a => {
        const href = a.getAttribute("href") || "";
        const m = href.match(/\/id(\d+)/);
        if (!m) return;
        const appId = m[1];
        if (seen.has(appId)) return;
        // 이름 추출
        let name = "";
        const h3 = a.querySelector("h3");
        if (h3) name = h3.textContent.trim();
        if (!name) {
          // aria-label에서 추출 (보통 "앱이름 부제목 보기" 형태)
          const al = a.getAttribute("aria-label") || "";
          if (al) name = al.replace(/\s*보기\s*$/, "").split(/\s+/).slice(0, 4).join(" ").trim();
        }
        if (!name) name = (a.textContent || "").trim().split("\n")[0].trim();
        if (!name || name.length < 2 || name.length > 80) return;
        seen.add(appId);
        result.push({ name, appId, url: href.startsWith("http") ? href : "https://apps.apple.com" + href });
      });
      return result;
    });
    apps.forEach(a => lineup.push(a));
  } catch (e) {
    console.warn(`  [NEXON Apple lineup error]`, e.message);
  }
  return lineup;
}

/* ═══ Google Play NEXON 개발자 페이지에서 라인업 추출 ═══ */
async function fetchGoogleNexonLineup(page) {
  const lineup = [];
  try {
    await page.goto(
      "https://play.google.com/store/apps/dev?id=7175795338936881781&hl=ko",
      { waitUntil: "networkidle2", timeout: 20000 }
    );
    const apps = await page.evaluate(() => {
      const result = [];
      const seen = new Set();
      document.querySelectorAll('a[href*="/store/apps/details"]').forEach(a => {
        const href = a.getAttribute("href") || "";
        const m = href.match(/[?&]id=([^&]+)/);
        if (!m) return;
        const pkg = m[1];
        if (seen.has(pkg)) return;
        // 이름 추출
        let name = a.querySelector('img')?.getAttribute('alt') || "";
        if (!name || name === "아이콘 이미지") {
          name = (a.textContent || "").trim().split("\n")[0].trim();
        }
        // 별점 등 잡음 제거
        name = name.replace(/[\d.]+\s*star.*/i, "").trim();
        name = name.replace(/아이콘 이미지/, "").trim();
        if (!name || name.length < 2 || name.length > 80) return;
        seen.add(pkg);
        result.push({ name, packageId: pkg });
      });
      return result;
    });
    apps.forEach(a => lineup.push(a));
  } catch (e) {
    console.warn(`  [NEXON Google lineup error]`, e.message);
  }
  return lineup;
}

/* ═══ NEXON 라인업을 KNOWN_NEXON_TITLES 사전 형태로 동기화 ═══ */
async function syncNexonTitlesFromDevPages(browser) {
  console.log("🔄 NEXON 개발자 페이지 동기화...");
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36");

  const appleLineup = await fetchAppleNexonLineup(page);
  console.log(`  Apple NEXON Company: ${appleLineup.length}개`);
  appleLineup.forEach(a => {
    NEXON_APP_IDS.apple.add(a.appId);
    console.log(`    - ${a.name} (id=${a.appId})`);
  });

  const googleLineup = await fetchGoogleNexonLineup(page);
  console.log(`  Google Play NEXON Company: ${googleLineup.length}개`);
  googleLineup.forEach(a => {
    NEXON_APP_IDS.google.add(a.packageId);
    console.log(`    - ${a.name} (${a.packageId})`);
  });

  await page.close();

  // 정적 fallback + 두 페이지의 이름을 모두 합쳐 사전 재구축
  const allNames = new Map(); // 정규화 이름 → 사전 항목
  // 1) 정적 사전 먼저 등록
  for (const t of STATIC_NEXON_TITLES_FALLBACK) {
    const key = t.name.toLowerCase().trim();
    allNames.set(key, { ...t });
  }
  // 2) Apple 라인업 등록
  for (const a of appleLineup) {
    const key = a.name.toLowerCase().trim();
    if (allNames.has(key)) {
      // 기존 사전에 match 추가
      const existing = allNames.get(key);
      if (!existing.match.includes(a.name.toLowerCase())) {
        existing.match.push(a.name.toLowerCase());
      }
    } else {
      allNames.set(key, { match: [a.name.toLowerCase()], name: a.name });
    }
  }
  // 3) Google 라인업 등록
  for (const g of googleLineup) {
    const key = g.name.toLowerCase().trim();
    if (allNames.has(key)) {
      const existing = allNames.get(key);
      if (!existing.match.includes(g.name.toLowerCase())) {
        existing.match.push(g.name.toLowerCase());
      }
    } else {
      allNames.set(key, { match: [g.name.toLowerCase()], name: g.name });
    }
  }

  KNOWN_NEXON_TITLES = [...allNames.values()];
  console.log(`  ✅ 사전 구축 완료: ${KNOWN_NEXON_TITLES.length}개 타이틀 (정적 ${STATIC_NEXON_TITLES_FALLBACK.length} + 자동 ${KNOWN_NEXON_TITLES.length - STATIC_NEXON_TITLES_FALLBACK.length})`);
  console.log(`  ✅ 정확 매칭 ID: Apple ${NEXON_APP_IDS.apple.size}개, Google ${NEXON_APP_IDS.google.size}개\n`);
}

/* ═══ URL 또는 ID 기반 NEXON 매칭 (가장 정확) ═══ */
function matchNexonByUrl(url) {
  if (!url) return false;
  // Apple: /id1466736988 형태
  const appleMatch = url.match(/\/id(\d+)/);
  if (appleMatch && NEXON_APP_IDS.apple.has(appleMatch[1])) return true;
  // Google: ?id=com.nexon.kart 형태
  const googleMatch = url.match(/[?&]id=([^&]+)/);
  if (googleMatch && NEXON_APP_IDS.google.has(googleMatch[1])) return true;
  return false;
}

/* ═══ 통합 NEXON 검출기 (URL + dev + name 3중 체크) ═══ */
function detectNexonAll({ url, dev, name }) {
  // 1순위: URL/ID 매칭 (가장 정확, NEXON 공식 라인업)
  if (matchNexonByUrl(url)) return { isNexon: true, source: "url-id" };
  // 2순위: dev 회사명 정규화 매칭
  if (dev) {
    const r = detectNexon(dev);
    if (r.isNexon) return { isNexon: true, source: "dev", matched: r.matched };
  }
  // 3순위: 이름 부분 매칭 (KNOWN_NEXON_TITLES 사전)
  if (name) {
    const ln = name.toLowerCase();
    for (const t of KNOWN_NEXON_TITLES) {
      if (t.name.toLowerCase() === ln) return { isNexon: true, source: "title-exact", matched: t.name };
      for (const m of t.match) {
        if (ln.includes(m.toLowerCase())) return { isNexon: true, source: "title-partial", matched: m };
      }
    }
  }
  return { isNexon: false, source: null };
}

async function getAppDetail(page, url) {
  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });
    await page.waitForSelector('a[href*="/developer/"]', { timeout: 8000 }).catch(() => {});
    return await page.evaluate(() => {
      let dev = "", genre = "";
      const devLink = document.querySelector('a[href*="/developer/"]');
      if (devLink) dev = devLink.textContent.trim();
      if (!dev) {
        const dl = [...document.querySelectorAll("a")].find(a => (a.href||"").includes("/developer/") && a.textContent.trim().length > 1);
        if (dl) dev = dl.textContent.trim();
      }
      const genreLink = document.querySelector('a[href*="/genre/"]');
      if (genreLink) genre = genreLink.textContent.trim();
      if (!genre) {
        const gl = [...document.querySelectorAll("a")].find(a => (a.href||"").includes("/genre/") && a.textContent.trim().length > 1);
        if (gl) genre = gl.textContent.trim();
      }
      return { dev, genre };
    });
  } catch (e) { return { dev: "", genre: "" }; }
}

async function getAppIcon(page) {
  return await page.evaluate(() => {
    const imgs = document.querySelectorAll('.app-icon img, picture source[srcset*="mzstatic"]');
    for (const el of imgs) {
      const ss = el.getAttribute("srcset") || el.getAttribute("src") || "";
      const m = ss.match(/https:\/\/[^\s]*mzstatic\.com[^\s]*\d+x\d+[^\s]*/);
      if (m) return m[0];
    }
    return "";
  });
}

/* ═══════════════════════════════════════
   ⭐ Hero 추출 로직 (Games + Today 공통)
   - 핵심 수정: lockup-container의 h3 = 앱 이름 (우선)
                 h2 = 이벤트 제목 (appEvent hero의 경우)
   - URL eventid 파라미터 보존 (이벤트 hero 식별 가능)
   ═══════════════════════════════════════ */
const HERO_EXTRACTION_FUNCTION = `
  function extractHeroName(linkEl) {
    // 1순위: .lockup-container .text-container h3 (앱 이름 확정 위치)
    //        - appEvent hero에서도 여기에 정확한 앱 이름이 들어감
    //        - 예: "카트라이더 러쉬플러스"
    const lockupH3 = linkEl.querySelector('.lockup-container .text-container h3, .lockup-container h3');
    if (lockupH3) {
      const t = lockupH3.textContent.trim();
      if (t.length >= 2 && t.length <= 80) return { name: t, source: 'lockup-h3' };
    }
    // 2순위: h2 (출시 hero의 앱 이름, 또는 이벤트 hero의 이벤트 제목)
    const h2 = linkEl.querySelector('h2');
    if (h2) {
      const t = h2.textContent.trim();
      if (t.length >= 2 && t.length <= 80) {
        // h2가 이벤트성 문구인지 휴리스틱 체크
        const isEventy = /업데이트$|이벤트$|^신규|시즌|콜라보|오픈|출시|^새|now|update|event/i.test(t);
        if (!isEventy) return { name: t, source: 'h2' };
        // 이벤트성이면 추가 fallback 시도
      }
    }
    // 3순위: 다른 h3 (lockup 밖)
    const anyH3 = linkEl.querySelector('h3');
    if (anyH3) {
      const t = anyH3.textContent.trim();
      if (t.length >= 2 && t.length <= 80) return { name: t, source: 'any-h3' };
    }
    // 4순위: aria-label에서 가장 그럴듯한 부분
    //        예: "내일 AM 8:00, Royal Kingdom, 왕국에 새 퀘스트가 열립니다, ..."
    //        예: "게임 내 이벤트, 카트라이더 러쉬플러스, S39 비치 업데이트, ..."
    const aria = linkEl.getAttribute('aria-label') || '';
    if (aria) {
      const parts = aria.split(',').map(p => p.trim()).filter(p => p.length >= 2 && p.length <= 60);
      // 시간/이벤트 키워드 제외하고 가장 짧고 명사스러운 것 선택
      const candidates = parts.filter(p =>
        !/^\\d|am$|pm$|시$|분$|초$|시간|초전|^내일|^오늘|^어제|업데이트|이벤트|시즌/i.test(p)
      );
      if (candidates.length > 0) {
        // 가장 짧은 (보통 앱 이름이 가장 짧음)
        candidates.sort((a, b) => a.length - b.length);
        return { name: candidates[0], source: 'aria-label' };
      }
      if (parts.length > 0) return { name: parts[0], source: 'aria-fallback' };
    }
    return null;
  }
`;

async function extractGamesTab(page) {
  return await page.evaluate(new Function(`
    ${HERO_EXTRACTION_FUNCTION}
    const apps = [];
    const seen = new Set();
    function getIcon(container) {
      if (!container) return "";
      const img1 = container.querySelector('img[src*="mzstatic"]');
      if (img1) return img1.getAttribute("src");
      const img2 = container.querySelector("img[srcset]");
      if (img2) { const m = (img2.getAttribute("srcset")||"").match(/https:\\/\\/[^\\s]*mzstatic[^\\s]*/); if (m) return m[0]; }
      const src = container.querySelector("source[srcset*='mzstatic']");
      if (src) {
        const all = (src.getAttribute("srcset")||"").match(/https:\\/\\/[^\\s,]*mzstatic[^\\s,]*/g) || [];
        const icon = all.find(u => u.includes("Placeholder.mill") || u.includes("/64x") || u.includes("/128x"));
        if (icon) return icon;
        if (all[0]) return all[0];
      }
      return "";
    }

    // ─── 1. Hero 배너 ───
    document.querySelectorAll('a[href*="/app/"][data-test-id="internal-link"]').forEach(linkEl => {
      const heroEl = linkEl.querySelector('[data-test-id="hero"]');
      if (!heroEl) return;
      const href = linkEl.getAttribute("href") || "";
      if (!href.includes("/app/")) return;

      const nameInfo = extractHeroName(linkEl);
      if (!nameInfo) return;
      const name = nameInfo.name;
      if (seen.has(name.toLowerCase())) return;
      seen.add(name.toLowerCase());

      const subtitle = linkEl.querySelector(".subtitle")?.textContent?.trim() || "";
      const eyebrow = linkEl.querySelector(".eyebrow")?.textContent?.trim() || "";
      const lockupIcon = linkEl.querySelector(".lockup-container") || linkEl.querySelector(".app-icon");
      const icon = getIcon(lockupIcon) || getIcon(linkEl);

      // 이벤트 hero 식별
      const isAppEvent = href.includes("eventid=") || /업데이트$|이벤트$|시즌/.test(linkEl.querySelector("h2")?.textContent?.trim() || "");

      apps.push({
        name, icon, subtitle, eyebrow,
        url: href.startsWith("http") ? href : "https://apps.apple.com" + href,
        isBanner: true,
        _appEvent: isAppEvent,
        _heroSource: nameInfo.source
      });
    });

    // ─── 2. Small Lockup 카드 ───
    document.querySelectorAll('.small-lockup-item').forEach(item => {
      const linkEl = item.querySelector('a[href*="/app/"]');
      if (!linkEl) return;
      const href = linkEl.getAttribute("href") || "";
      if (!href.includes("/app/")) return;

      const h3 = linkEl.querySelector("h3") || item.querySelector("h3");
      let name = h3 ? h3.textContent.trim() : "";
      if (!name) name = (linkEl.getAttribute("aria-label") || "").split(",")[0].trim();
      if (!name || name.length < 2 || name.length > 80) return;
      if (seen.has(name.toLowerCase())) return;
      seen.add(name.toLowerCase());

      const pEl = linkEl.querySelector(".metadata-container p, p");
      const subtitle = pEl ? pEl.textContent.trim() : "";
      const shelfEl = item.closest(".shelf, [data-test-id='shelf-wrapper']");
      const shelfTitleEl = shelfEl?.querySelector(".shelf-title, h2.shelf-title, [data-test-id='shelf-title']");
      const shelfTitle = shelfTitleEl ? shelfTitleEl.textContent.trim() : "";

      const icon = getIcon(item);

      apps.push({
        name, icon, subtitle, eyebrow: "",
        url: href.startsWith("http") ? href : "https://apps.apple.com" + href,
        isBanner: false,
        shelfTitle
      });
    });

    return apps;
  `));
}

async function extractTodayTab(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight + 2000; y += 600) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 200));
    }
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 1000));
  }).catch(() => {});

  return await page.evaluate(new Function(`
    ${HERO_EXTRACTION_FUNCTION}
    const apps = [];
    const seen = new Set();
    function getIcon(container) {
      if (!container) return "";
      const img1 = container.querySelector('img[src*="mzstatic"]');
      if (img1) return img1.getAttribute("src");
      const img2 = container.querySelector("img[srcset]");
      if (img2) { const m = (img2.getAttribute("srcset")||"").match(/https:\\/\\/[^\\s]*mzstatic[^\\s]*/); if (m) return m[0]; }
      const src = container.querySelector("source[srcset*='mzstatic']");
      if (src) {
        const all = (src.getAttribute("srcset")||"").match(/https:\\/\\/[^\\s,]*mzstatic[^\\s,]*/g) || [];
        const icon = all.find(u => u.includes("Placeholder.mill") || u.includes("/64x") || u.includes("/128x"));
        if (icon) return icon;
        if (all[0]) return all[0];
      }
      return "";
    }

    // ─── 1. Hero ───
    document.querySelectorAll('a[href*="/app/"][data-test-id="internal-link"]').forEach(linkEl => {
      const heroEl = linkEl.querySelector('[data-test-id="hero"]');
      if (!heroEl) return;
      const href = linkEl.getAttribute("href") || "";
      if (!href.includes("/app/")) return;

      const nameInfo = extractHeroName(linkEl);
      if (!nameInfo) return;
      const name = nameInfo.name;
      if (seen.has(name.toLowerCase())) return;
      seen.add(name.toLowerCase());

      const subtitle = linkEl.querySelector(".subtitle")?.textContent?.trim() || "";
      const eyebrow = linkEl.querySelector(".eyebrow")?.textContent?.trim() || "";
      const lockupIcon = linkEl.querySelector(".lockup-container") || linkEl.querySelector(".app-icon");
      const icon = getIcon(lockupIcon) || getIcon(linkEl);
      const isAppEvent = href.includes("eventid=") || /업데이트$|이벤트$|시즌/.test(linkEl.querySelector("h2")?.textContent?.trim() || "");

      apps.push({
        name, icon, subtitle, eyebrow,
        url: href.startsWith("http") ? href : "https://apps.apple.com" + href,
        isBanner: true,
        _appEvent: isAppEvent,
        _heroSource: nameInfo.source
      });
    });

    // ─── 2. Today Card ───
    document.querySelectorAll('.today-card-wrapper, .today-card').forEach(card => {
      const ariaText = card.getAttribute("aria-label") || "";
      const innerLink = card.querySelector('a[href*="/app/"]');
      const href = innerLink?.getAttribute("href") || "";

      let name = "";
      if (innerLink) {
        const h3 = innerLink.querySelector("h3") || card.querySelector("h3");
        if (h3) name = h3.textContent.trim();
        if (!name) name = (innerLink.getAttribute("aria-label") || "").split(",")[0].trim();
      } else {
        const h3 = card.querySelector("h3");
        if (h3) {
          const t = h3.textContent.trim();
          if (t.length >= 2 && t.length <= 60 &&
              !/이벤트$|업데이트$|^신규|^오늘은/.test(t)) {
            name = t;
          }
        }
      }

      if (!name || name.length < 2 || name.length > 80) return;
      if (seen.has(name.toLowerCase())) return;
      seen.add(name.toLowerCase());

      const icon = getIcon(card);
      apps.push({
        name, icon,
        subtitle: card.querySelector("p")?.textContent?.trim() || "",
        eyebrow: ariaText.slice(0, 200),
        url: href ? (href.startsWith("http") ? href : "https://apps.apple.com" + href) : "",
        isBanner: card.classList.contains("today-card") || card.classList.contains("today-card-wrapper"),
        _todayCard: true
      });
    });

    // ─── 3. Small Lockup 카드 ───
    document.querySelectorAll('.small-lockup-item').forEach(item => {
      const linkEl = item.querySelector('a[href*="/app/"]');
      if (!linkEl) return;
      const href = linkEl.getAttribute("href") || "";
      if (!href.includes("/app/")) return;

      const h3 = linkEl.querySelector("h3") || item.querySelector("h3");
      let name = h3 ? h3.textContent.trim() : "";
      if (!name) name = (linkEl.getAttribute("aria-label") || "").split(",")[0].trim();
      if (!name || name.length < 2 || name.length > 80) return;
      if (seen.has(name.toLowerCase())) return;
      seen.add(name.toLowerCase());

      const pEl = linkEl.querySelector(".metadata-container p, p");
      const subtitle = pEl ? pEl.textContent.trim() : "";
      const shelfEl = item.closest(".shelf, [data-test-id='shelf-wrapper']");
      const shelfTitleEl = shelfEl?.querySelector(".shelf-title, h2.shelf-title, [data-test-id='shelf-title']");
      const shelfTitle = shelfTitleEl ? shelfTitleEl.textContent.trim() : "";

      const icon = getIcon(item);
      apps.push({
        name, icon, subtitle, eyebrow: "",
        url: href.startsWith("http") ? href : "https://apps.apple.com" + href,
        isBanner: false,
        shelfTitle
      });
    });

    return apps;
  `));
}

/* Google Play 추출 (변경 없음) */
async function extractGPBanner(page) {
  return await page.evaluate(() => {
    const apps = [];
    const seen = new Set();
    const cards = document.querySelectorAll(".ULeU3b");
    cards.forEach(card => {
      const nameEl = card.querySelector(".fkdIre");
      const devEl = card.querySelector(".bcLwIe");
      const iconEl = card.querySelector(".nnW2Md");
      const badgeEl = card.querySelector(".GnAUad");

      const name = nameEl ? nameEl.textContent.trim() : "";
      if (!name || name.length < 2 || name.length > 60 || seen.has(name.toLowerCase())) return;

      const dev = devEl ? devEl.textContent.trim() : "";
      let icon = "";
      if (iconEl) {
        icon = iconEl.getAttribute("src") || "";
        if (!icon) {
          const srcset = iconEl.getAttribute("srcset") || "";
          if (srcset) icon = srcset.split(" ")[0];
        }
      }
      const badge = badgeEl ? badgeEl.textContent.trim() : "";

      let url = "";
      const link = card.closest("a") || card.querySelector("a");
      if (link) {
        const href = link.getAttribute("href") || "";
        if (href.includes("/store/apps/details")) {
          url = href.startsWith("http") ? href : "https://play.google.com" + href;
        }
      }
      if (!url) {
        let parent = card.parentElement;
        for (let depth = 0; depth < 5 && parent; depth++) {
          if (parent.tagName === "A") {
            const href = parent.getAttribute("href") || "";
            if (href.includes("/store/apps/details")) {
              url = href.startsWith("http") ? href : "https://play.google.com" + href;
            }
            break;
          }
          parent = parent.parentElement;
        }
      }

      seen.add(name.toLowerCase());
      apps.push({ name, dev, icon, url, badge, isBanner: true });
    });
    return apps;
  });
}

async function extractGPFeatured(page) {
  return await page.evaluate(() => {
    const apps = [];
    const seen = new Set();
    const links = document.querySelectorAll('a[href*="/store/apps/details"]');
    links.forEach(el => {
      const href = el.getAttribute("href") || "";
      if (!href.includes("/store/apps/details")) return;

      let name = "";
      const nameEl = el.querySelector(".WsMG1c") || el.querySelector(".ubGTjb") || el.querySelector(".DdYX5") || el.querySelector(".Epkrse");
      if (nameEl) name = nameEl.textContent.trim();
      if (!name) {
        const ariaLabel = el.getAttribute("aria-label") || "";
        if (ariaLabel) name = ariaLabel;
      }
      if (!name || name.length < 2 || name.length > 60 || seen.has(name.toLowerCase())) return;

      let icon = "";
      const iconEl = el.querySelector("img");
      if (iconEl) icon = iconEl.getAttribute("src") || "";

      let dev = "";
      const devEl = el.querySelector(".b8cIId") || el.querySelector(".KoLSrc");
      if (devEl) dev = devEl.textContent.trim();

      const url = href.startsWith("http") ? href : "https://play.google.com" + href;
      seen.add(name.toLowerCase());
      apps.push({ name, dev, icon, url, isBanner: false });
    });
    return apps;
  });
}

async function crawlGooglePlay(page, cc, hl) {
  const allApps = [];
  const seen = new Set();

  try {
    console.log(`  [GP Games]`);
    const gpUrl = `https://play.google.com/store/games?hl=${hl}&gl=${cc.toUpperCase()}`;
    await page.goto(gpUrl, { waitUntil: "networkidle2", timeout: 30000 });
    await autoScroll(page, 5000);

    const bannerApps = await extractGPBanner(page);
    const featuredApps = await extractGPFeatured(page);
    console.log(`    GP banners: ${bannerApps.length}, featured: ${featuredApps.length}`);

    bannerApps.forEach((app, i) => {
      if (seen.has(app.name.toLowerCase())) return;
      seen.add(app.name.toLowerCase());
      const nx = detectNexonAll({ url: app.url, dev: app.dev, name: app.name });
      allApps.push({
        name: app.name, dev: app.dev, icon: app.icon, url: app.url,
        tab: "Featured", section: "배너", priority: i + 1,
        genre: "", rating: 0, category: "Games",
        nexon: nx.isNexon, banner: true, badge: app.badge || "",
        _nxSource: nx.source
      });
    });

    featuredApps.forEach((app, i) => {
      if (seen.has(app.name.toLowerCase())) return;
      seen.add(app.name.toLowerCase());
      const nx = detectNexonAll({ url: app.url, dev: app.dev, name: app.name });
      allApps.push({
        name: app.name, dev: app.dev, icon: app.icon, url: app.url,
        tab: "Featured", section: "Featured", priority: 20 + i,
        genre: "", rating: 0, category: "Games",
        nexon: nx.isNexon, banner: false,
        _nxSource: nx.source
      });
    });
  } catch (e) { console.warn(`  [GP Games Error]`, e.message); }

  try {
    console.log(`  [GP Top Charts]`);
    const topUrl = `https://play.google.com/store/games?hl=${hl}&gl=${cc.toUpperCase()}&tab=topCharts`;
    await page.goto(topUrl, { waitUntil: "networkidle2", timeout: 30000 });
    await autoScroll(page, 3000);
    const topApps = await extractGPFeatured(page);
    console.log(`    GP top charts: ${topApps.length}`);

    topApps.forEach((app, i) => {
      if (seen.has(app.name.toLowerCase())) return;
      seen.add(app.name.toLowerCase());
      const nx = detectNexonAll({ url: app.url, dev: app.dev, name: app.name });
      allApps.push({
        name: app.name, dev: app.dev, icon: app.icon, url: app.url,
        tab: "Featured", section: "Top Charts", priority: 100 + i,
        genre: "", rating: 0, category: "Games",
        nexon: nx.isNexon, banner: false,
        _nxSource: nx.source
      });
    });
  } catch (e) { console.warn(`  [GP Top Error]`, e.message); }

  if (allApps.length === 0) {
    console.log(`  [GP Scraper Fallback]`);
    try {
      const [topFree, grossing] = await Promise.allSettled([
        gplay.list({ collection: gplay.collection.TOP_FREE, category: gplay.category.GAME, num: 30, country: cc.toUpperCase(), lang: hl, fullDetail: false }),
        gplay.list({ collection: gplay.collection.GROSSING, category: gplay.category.GAME, num: 20, country: cc.toUpperCase(), lang: hl, fullDetail: false })
      ]);
      if (topFree.status === "fulfilled") {
        topFree.value.forEach((app, i) => {
          const name = app.title || "";
          if (!name || name.length < 2 || seen.has(name.toLowerCase())) return;
          seen.add(name.toLowerCase());
          allApps.push({
            name, dev: app.developer || "", icon: app.icon || "",
            url: app.url || `https://play.google.com/store/apps/details?id=${app.appId}&hl=${hl}`,
            tab: "Featured", section: i < 3 ? "배너" : "Top Free Games", priority: i + 1,
            genre: toG(app.genre || ""), rating: app.score ? parseFloat(app.score.toFixed(1)) : 0,
            category: "Games", nexon: isNexon(app.developer), banner: i < 3
          });
        });
      }
      if (grossing.status === "fulfilled") {
        grossing.value.forEach((app, i) => {
          const name = app.title || "";
          if (!name || name.length < 2 || seen.has(name.toLowerCase())) return;
          seen.add(name.toLowerCase());
          allApps.push({
            name, dev: app.developer || "", icon: app.icon || "",
            url: app.url || `https://play.google.com/store/apps/details?id=${app.appId}&hl=${hl}`,
            tab: "Featured", section: "Top Grossing", priority: 100 + i,
            genre: toG(app.genre || ""), rating: app.score ? parseFloat(app.score.toFixed(1)) : 0,
            category: "Games", nexon: isNexon(app.developer), banner: false
          });
        });
      }
      console.log(`    Scraper fallback: ${allApps.length} apps`);
    } catch (e) { console.warn(`  [GP Scraper Fallback Error]`, e.message); }
  }

  const needEnrich = allApps.filter(a => !a.genre || !a.rating);
  if (needEnrich.length > 0) {
    console.log(`  [GP Enrich] ${needEnrich.length} apps need genre/rating...`);
    for (const app of needEnrich.slice(0, 15)) {
      try {
        const idMatch = (app.url || "").match(/id=([^&]+)/);
        if (!idMatch) continue;
        const detail = await gplay.app({ appId: idMatch[1], lang: hl, country: cc.toUpperCase() });
        if (detail) {
          if (!app.genre && detail.genre) app.genre = toG(detail.genre);
          if (!app.rating && detail.score) app.rating = parseFloat(detail.score.toFixed(1));
          if (!app.dev && detail.developer) { app.dev = detail.developer; app.nexon = isNexon(detail.developer); }
          if (!app.icon && detail.icon) app.icon = detail.icon;
        }
      } catch (e) { /* skip */ }
      await new Promise(r => setTimeout(r, 200));
    }
    console.log(`    Enriched ${needEnrich.slice(0, 15).filter(a => a.genre).length} apps`);
  }

  allApps.sort((a, b) => a.priority - b.priority);
  allApps.forEach((a, i) => a.rank = i + 1);
  console.log(`  → GP: ${allApps.length} total, ${allApps.filter(a=>a.banner).length} banners, ${allApps.filter(a=>a.nexon).length} NEXON`);
  const gpNxList = allApps.filter(a => a.nexon);
  if (gpNxList.length > 0) {
    console.log(`    GP NEXON: ${gpNxList.map(a => `${a.name}[${a._nxSource||'?'}]`).join(', ')}`);
  }
  return allApps;
}

async function crawlAppleStore(page, cc) {
  const allApps = [];
  const seen = new Set();

  try {
    console.log(`  [Games Tab]`);
    await page.goto(`https://apps.apple.com/${cc}/iphone/games`, { waitUntil: "networkidle2", timeout: 30000 });
    await autoScroll(page, 5000);
    const gamesApps = await extractGamesTab(page);
    const banners = gamesApps.filter(a => a.isBanner);
    const cards = gamesApps.filter(a => !a.isBanner);
    console.log(`    ${banners.length} banners, ${cards.length} cards`);
    if (banners.length > 0) {
      console.log(`    Hero sample: ${banners.slice(0,5).map(b => `"${b.name}"${b._appEvent?'(evt)':''}[${b._heroSource}]`).join(', ')}`);
    }

    banners.forEach((app, i) => {
      if (seen.has(app.name.toLowerCase())) return;
      seen.add(app.name.toLowerCase());
      // NEXON 매칭: URL/ID 우선 → 이름 매칭 fallback
      const ln = app.name.toLowerCase();
      const isUrlNx = matchNexonByUrl(app.url);
      const isNameNx = !isUrlNx && KNOWN_NEXON_TITLES.some(t =>
        t.name.toLowerCase() === ln ||
        t.match.some(m => ln.includes(m.toLowerCase()))
      );
      const isNx = isUrlNx || isNameNx;
      allApps.push({
        name: app.name, dev: isNx ? "NEXON" : "", icon: app.icon, url: app.url,
        tab: "Games", section: "배너", priority: i + 1,
        genre: isNx ? "RPG" : "", rating: 0, category: "Games",
        nexon: isNx, banner: true,
        _appEvent: !!app._appEvent,
        _nxSource: isUrlNx ? "url-id" : (isNameNx ? "title-name" : null)
      });
    });
    cards.forEach((app, i) => {
      if (seen.has(app.name.toLowerCase())) return;
      seen.add(app.name.toLowerCase());
      const shelf = (app.shelfTitle || "").toLowerCase();
      const isCuratedBanner = shelf.includes("오늘") || shelf.includes("이 게임") ||
                              shelf.includes("추천") || shelf.includes("에디터") ||
                              shelf.includes("editor") || shelf.includes("today") ||
                              shelf.includes("featured") || shelf.includes("must play");
      const ln = app.name.toLowerCase();
      const isUrlNx = matchNexonByUrl(app.url);
      const isNameNx = !isUrlNx && KNOWN_NEXON_TITLES.some(t =>
        t.name.toLowerCase() === ln ||
        t.match.some(m => ln.includes(m.toLowerCase()))
      );
      const isNx = isUrlNx || isNameNx;
      allApps.push({
        name: app.name, dev: isNx ? "NEXON" : "", icon: app.icon, url: app.url,
        tab: "Games",
        section: isCuratedBanner ? "배너" : "Featured",
        priority: isCuratedBanner ? (10 + i) : (20 + i),
        genre: isNx ? "RPG" : "", rating: 0, category: "Games",
        nexon: isNx, banner: isCuratedBanner,
        _nxSource: isUrlNx ? "url-id" : (isNameNx ? "title-name" : null)
      });
    });
  } catch (e) { console.warn(`  [Games Error]`, e.message); }

  try {
    console.log(`  [Today Tab]`);
    await page.goto(`https://apps.apple.com/${cc}/iphone/today`, { waitUntil: "networkidle2", timeout: 30000 });
    await autoScroll(page, 5000);
    const todayApps = await extractTodayTab(page);
    const banners = todayApps.filter(a => a.isBanner);
    const cards = todayApps.filter(a => !a.isBanner);
    console.log(`    ${banners.length} banners, ${cards.length} cards (pre-filter)`);
    if (banners.length > 0) {
      console.log(`    Hero sample: ${banners.slice(0,5).map(b => `"${b.name}"${b._appEvent?'(evt)':''}[${b._heroSource||'-'}]`).join(', ')}`);
    }

    banners.forEach((app, i) => {
      if (seen.has(app.name.toLowerCase())) return;
      seen.add(app.name.toLowerCase());
      const ln = app.name.toLowerCase();
      const isUrlNx = matchNexonByUrl(app.url);
      const isNameNx = !isUrlNx && KNOWN_NEXON_TITLES.some(t =>
        t.name.toLowerCase() === ln ||
        t.match.some(m => ln.includes(m.toLowerCase()))
      );
      const isKnownNx = isUrlNx || isNameNx;
      allApps.push({
        name: app.name, dev: isKnownNx ? "NEXON" : "", icon: app.icon, url: app.url,
        tab: "Today", section: "배너", priority: 50 + i,
        genre: isKnownNx ? "RPG" : "", rating: 0, category: "Games",
        nexon: isKnownNx, banner: true,
        _todayPending: !isKnownNx,
        _todayCard: !!app._todayCard,
        _shelfTitle: app.shelfTitle || "",
        _appEvent: !!app._appEvent,
        _nxSource: isUrlNx ? "url-id" : (isNameNx ? "title-name" : null)
      });
    });
    cards.forEach((app, i) => {
      if (seen.has(app.name.toLowerCase())) return;
      seen.add(app.name.toLowerCase());
      const ln = app.name.toLowerCase();
      const isUrlNx = matchNexonByUrl(app.url);
      const isNameNx = !isUrlNx && KNOWN_NEXON_TITLES.some(t =>
        t.name.toLowerCase() === ln ||
        t.match.some(m => ln.includes(m.toLowerCase()))
      );
      const isKnownNx = isUrlNx || isNameNx;
      const shelf = (app.shelfTitle || "").toLowerCase();
      const isCuratedBanner = shelf.includes("오늘") || shelf.includes("이 게임") ||
                              shelf.includes("추천") || shelf.includes("에디터") ||
                              shelf.includes("editor") || shelf.includes("today") ||
                              shelf.includes("featured") || shelf.includes("must play");
      allApps.push({
        name: app.name, dev: isKnownNx ? "NEXON" : "", icon: app.icon, url: app.url,
        tab: "Today", section: isCuratedBanner ? "배너" : "Featured",
        priority: isCuratedBanner ? (60 + i) : (70 + i),
        genre: isKnownNx ? "RPG" : "", rating: 0, category: "Games",
        nexon: isKnownNx, banner: isCuratedBanner,
        _todayPending: !isKnownNx,
        _todayCard: !!app._todayCard,
        _shelfTitle: app.shelfTitle || "",
        _nxSource: isUrlNx ? "url-id" : (isNameNx ? "title-name" : null)
      });
    });
  } catch (e) { console.warn(`  [Today Error]`, e.message); }

  // ─── 상세 페이지 보강 ───
  // 80개로 확대, eventid URL은 보강에서 제외 (이벤트 페이지로 가버리면 dev/genre 안 잡힘)
  const enrichTargets = allApps.filter(a => a.url && !a.url.includes('eventid=')).slice(0, 80);
  console.log(`  [Detail] ${enrichTargets.length} apps (eventid URL 제외)`);
  const devMatches = []; // 디버그용
  for (let i = 0; i < enrichTargets.length; i++) {
    const app = enrichTargets[i];
    const d = await getAppDetail(page, app.url);
    if (d.dev) {
      app.dev = d.dev;
      const nx = detectNexon(d.dev);
      if (nx.isNexon) {
        app.nexon = true;
        devMatches.push(`"${app.name}" ← dev="${d.dev}" (matched: "${nx.matched}")`);
      }
    }
    if (d.genre) app.genre = toG(d.genre);
    if (!app.icon || app.icon.includes("1x1.gif") || !app.icon.includes("mzstatic")) {
      const fallbackIcon = await getAppIcon(page);
      if (fallbackIcon) app.icon = fallbackIcon;
    }
    if (i % 5 === 0 && i > 0) console.log(`    ${i}/${enrichTargets.length}`);
    await new Promise(r => setTimeout(r, 300));
  }
  if (devMatches.length > 0) {
    console.log(`  [NEXON dev matches] ${devMatches.length}개:`);
    devMatches.forEach(m => console.log(`    ${m}`));
  }

  // ─── eventid URL을 가진 hero는 별도 처리 ───
  // 이벤트 hero는 NEXON으로 식별되면 dev를 "NEXON"으로 표시
  // (상세 페이지 조회 불가하므로 KNOWN_NEXON_TITLES 매칭으로만 판별)
  for (const app of allApps) {
    if (app.url && app.url.includes('eventid=') && !app.dev) {
      const ln = app.name.toLowerCase();
      const isKnownNx = KNOWN_NEXON_TITLES.some(t =>
        t.name.toLowerCase() === ln ||
        t.match.some(m => ln.includes(m.toLowerCase()))
      );
      if (isKnownNx) {
        app.dev = "NEXON";
        app.nexon = true;
        app.genre = app.genre || "RPG";
      }
    }
  }

  // ─── Today 필터링 ───
  const beforeFilter = allApps.length;
  const filtered = allApps.filter(app => {
    if (!app._todayPending) return true;

    if (isTodayException(app.name)) {
      delete app._todayPending;
      return true;
    }
    if (app.nexon) {
      delete app._todayPending;
      return true;
    }
    const shelf = (app._shelfTitle || "").toLowerCase();
    if (shelf.includes("게임") || shelf.includes("game") || shelf.includes("play") ||
        shelf.includes("rpg") || shelf.includes("plays")) {
      delete app._todayPending;
      return true;
    }
    if (app._todayCard) {
      delete app._todayPending;
      return true;
    }

    const genre = (app.genre || "").toLowerCase();
    const isGame = GAME_GENRE_KW.some(kw => genre.includes(kw));
    const urlHasGame = (app.url || "").toLowerCase().includes("/game");

    if (isGame || urlHasGame) {
      delete app._todayPending;
      return true;
    }

    console.log(`    [Today Filter] Removed: "${app.name}" (genre: "${app.genre}", shelf: "${app._shelfTitle || ''}")`);
    return false;
  });

  filtered.forEach(app => {
    delete app._todayPending;
    delete app._todayCard;
    delete app._shelfTitle;
  });
  console.log(`  [Today Filter] ${beforeFilter} → ${filtered.length} (removed ${beforeFilter - filtered.length})`);

  filtered.sort((a, b) => a.priority - b.priority);
  filtered.forEach((a, i) => a.rank = i + 1);
  const nxCount = filtered.filter(a=>a.nexon).length;
  console.log(`  → Apple: ${filtered.length} total, ${filtered.filter(a=>a.banner).length} banners, ${nxCount} NEXON`);
  if (nxCount > 0) {
    console.log(`    Apple NEXON: ${filtered.filter(a=>a.nexon).map(a => `${a.name}${a._appEvent?'(evt)':''}[${a._nxSource||'?'}]`).join(', ')}`);
  }
  return filtered;
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
  console.log("🚀 Store Featured Crawler (Apple + Google Play)\n");
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  });

  // ─── 부팅: NEXON 개발자 페이지에서 라인업 동기화 ───
  try {
    await syncNexonTitlesFromDevPages(browser);
  } catch (e) {
    console.warn(`⚠️ NEXON 사전 동기화 실패, 정적 fallback 사용:`, e.message);
  }

  for (const [code, cfg] of Object.entries(COUNTRIES)) {
    console.log(`📱 ${code} (${cfg.name})`);

    let appleApps = [];
    const applePage = await browser.newPage();
    await applePage.setViewport({ width: 1280, height: 900 });
    await applePage.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36");
    try {
      appleApps = await crawlAppleStore(applePage, cfg.cc);
    } catch (e) { console.error(`  ❌ Apple ${code}:`, e.message); }
    await applePage.close();

    let googleApps = [];
    const gpPage = await browser.newPage();
    await gpPage.setViewport({ width: 1280, height: 900 });
    await gpPage.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36");
    try {
      googleApps = await crawlGooglePlay(gpPage, cfg.cc, cfg.hl);
    } catch (e) { console.error(`  ❌ GP ${code}:`, e.message); }
    await gpPage.close();

    writeFileSync(join(DATA_DIR, `${code}.json`), JSON.stringify({
      country: code,
      date: new Date().toISOString().slice(0, 10),
      updated: new Date().toISOString(),
      apple: appleApps,
      google: googleApps
    }, null, 2));
    console.log(`  ✅ Saved (Apple: ${appleApps.length}, GP: ${googleApps.length})\n`);
  }

  await browser.close();
  console.log("🏁 Done!");
}

main().catch(e => { console.error(e); process.exit(1); });
