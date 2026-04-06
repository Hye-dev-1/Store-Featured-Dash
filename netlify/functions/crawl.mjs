/**
 * Netlify Function — App Store / Google Play 직접 크롤링
 * 
 * GET /api/crawl?country=KR
 * → App Store Today + Games 탭, Google Play Games 페이지를 서버에서 fetch
 * → HTML 파싱하여 게임 목록 JSON 반환
 * → API 키 불필요, CORS 문제 없음
 */

const COUNTRY_CFG = {
  KR: {
    asToday: 'https://apps.apple.com/kr/iphone/today',
    asGames: 'https://apps.apple.com/kr/iphone/games',
    gpGames: 'https://play.google.com/store/games?device=phone&hl=ko&gl=KR',
  },
  TW: {
    asToday: 'https://apps.apple.com/tw/iphone/today',
    asGames: 'https://apps.apple.com/tw/iphone/games',
    gpGames: 'https://play.google.com/store/games?device=phone&hl=zh-TW&gl=TW',
  },
  JP: {
    asToday: 'https://apps.apple.com/jp/iphone/today',
    asGames: 'https://apps.apple.com/jp/iphone/games',
    gpGames: 'https://play.google.com/store/games?device=phone&hl=ja&gl=JP',
  },
  US: {
    asToday: 'https://apps.apple.com/us/iphone/today',
    asGames: 'https://apps.apple.com/us/iphone/games',
    gpGames: 'https://play.google.com/store/games?device=phone&hl=en&gl=US',
  },
  TH: {
    asToday: 'https://apps.apple.com/th/iphone/today',
    asGames: 'https://apps.apple.com/th/iphone/games',
    gpGames: 'https://play.google.com/store/games?device=phone&hl=th&gl=TH',
  },
};

// 장르 매핑 (영어/원문 → 한국어)
const GENRE_MAP = {
  'action': '액션', 'rpg': 'RPG', 'role playing': 'RPG', 'strategy': '전략',
  'puzzle': '퍼즐', 'casual': '캐주얼', 'simulation': '시뮬레이션', 'adventure': '어드벤처',
  'sports': '스포츠', 'card': '카드', 'board': '카드', 'music': '리듬', 'racing': '액션',
  'trivia': '퍼즐', 'word': '퍼즐', 'arcade': '액션', 'entertainment': '캐주얼',
  '동작': '액션', '롤플레잉': 'RPG', '전략': '전략', '퍼즐': '퍼즐',
  '캐주얼': '캐주얼', '시뮬레이션': '시뮬레이션', '어드벤처': '어드벤처',
  '스포츠': '스포츠', '카드': '카드', '보드': '카드', '음악': '리듬',
  'アクション': '액션', 'ロールプレイング': 'RPG', 'ストラテジー': '전략',
  'パズル': '퍼즐', 'カジュアル': '캐주얼', 'シミュレーション': '시뮬레이션',
  'アドベンチャー': '어드벤처', 'スポーツ': '스포츠', 'カード': '카드',
};

function mapGenre(raw) {
  if (!raw) return '캐주얼';
  const lower = raw.toLowerCase().trim();
  return GENRE_MAP[lower] || GENRE_MAP[lower.split(/[\/,]/)[0].trim()] || raw;
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
};

async function fetchPage(url) {
  try {
    const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    console.error(`Fetch failed: ${url}`, e.message);
    return '';
  }
}

/* ─── App Store 파싱 ─── */
function parseAppStore(todayHtml, gamesHtml) {
  const games = [];
  const seen = new Set();

  // 패턴: /app/{slug}/id{numbers} 주변의 게임명 추출
  // App Store HTML 구조: <h3 class="...">게임명</h3> 근처에 /app/ 링크
  const patterns = [
    // 패턴1: <a ...href="/kr/app/..."><...><h3>게임명</h3>
    /href="[^"]*\/app\/[^"]*"[^>]*>[\s\S]*?<(?:h3|div)[^>]*class="[^"]*(?:lockup|title)[^"]*"[^>]*>([\s\S]*?)<\/(?:h3|div)>/gi,
    // 패턴2: <h3 ...>게임명</h3> 바로 앞에 app 링크
    /<h3[^>]*>\s*(?:<!--.*?-->)?\s*([\s\S]*?)\s*<\/h3>/gi,
  ];

  function extractFromHtml(html, source) {
    if (!html) return;
    
    // 방법1: story/editorial 카드에서 게임명 추출
    // "small-lockup" 또는 app 아이콘 영역의 h3
    const lockupRe = /class="[^"]*(?:small-lockup|lockup-info|app-header)[^"]*"[\s\S]*?<(?:h3|p|div)[^>]*class="[^"]*(?:title|name)[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/(?:h3|p|div)>/gi;
    let m;
    while ((m = lockupRe.exec(html)) !== null) {
      addGame(cleanTitle(m[1]), source);
    }

    // 방법2: /app/ 링크의 aria-label
    const ariaRe = /aria-label="([^"]+)"[^>]*href="[^"]*\/app\//gi;
    while ((m = ariaRe.exec(html)) !== null) {
      addGame(cleanTitle(m[1]), source);
    }

    // 방법3: h3 태그 안의 텍스트 중 /app/ 링크 근처
    const h3Re = /<h3[^>]*>\s*(?:<!--[^>]*-->)?\s*([^<]+?)\s*<\/h3>/gi;
    while ((m = h3Re.exec(html)) !== null) {
      const title = cleanTitle(m[1]);
      // 게임명 필터: 너무 긴 문장이나 에디토리얼 제목 제외
      if (title && title.length < 40 && !isEditorial(title)) {
        addGame(title, source);
      }
    }
  }

  function addGame(name, section) {
    if (!name || name.length < 2 || name.length > 50) return;
    const key = name.toLowerCase().replace(/\s+/g, '');
    if (seen.has(key)) return;
    seen.add(key);
    games.push({ name, genre: '캐주얼', rating: 0, label: section });
  }

  function cleanTitle(s) {
    return (s || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').trim();
  }

  function isEditorial(s) {
    // 에디토리얼 문장 패턴 (게임명이 아닌 것)
    return /[을를이가에서도의은는].*[요세다]$/.test(s) || // 한국어 문장
           /^[A-Z].*\.$/.test(s) || // 영어 문장
           s.includes('확인') || s.includes('만나') || s.includes('즐겨') ||
           s.length > 35;
  }

  extractFromHtml(todayHtml, 'Today');
  extractFromHtml(gamesHtml, 'Games');

  return games;
}

/* ─── Google Play 파싱 ─── */
function parseGooglePlay(html) {
  const games = [];
  const seen = new Set();
  if (!html) return games;

  // GP HTML: 게임명은 보통 aria-label, alt, title 속성에 있음
  const patterns = [
    // 패턴1: <a ... href="/store/apps/details?id=..." ... aria-label="게임명">
    /href="\/store\/apps\/details\?id=[^"]*"[^>]*(?:aria-label|title)="([^"]+)"/gi,
    // 패턴2: <img alt="게임명" ... src="..." ... >가 /store/apps/details 링크 근처
    /alt="([^"]{2,40})"[^>]*src="https:\/\/play-lh\.googleusercontent\.com/gi,
    // 패턴3: <span ...>게임명</span> (카드 제목)
    /<span[^>]*class="[^"]*(?:DdYX5|Epkrse|ubGTjb|b3UrDc)[^"]*"[^>]*>([^<]{2,40})<\/span>/gi,
  ];

  patterns.forEach(function(re) {
    let m;
    while ((m = re.exec(html)) !== null) {
      const name = m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
      if (!name || name.length < 2) continue;
      const key = name.toLowerCase().replace(/\s+/g, '');
      if (seen.has(key)) continue;
      seen.add(key);
      games.push({ name, genre: '캐주얼', rating: 0, label: 'Featured' });
    }
  });

  return games;
}

/* ─── Anthropic AI 보강 (선택 - API 키 있을 때만) ─── */
async function aiEnrich(country, asGames, gpGames) {
  const API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!API_KEY) return { as: asGames, gp: gpGames };

  const cfg = COUNTRY_CFG[country];
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `Find ALL game titles currently featured on App Store (${cfg.asToday}) and Google Play (${cfg.gpGames}) for ${country} today. Visit both URLs and extract every game title from hero banners, editorial cards, and curated lists. The actual game name is in the app lockup area (next to "Get"/"보기" button), NOT the editorial headline. Return ONLY JSON: {"as":[{"name":"Title","genre":"장르(Korean)","rating":4.5,"label":"Section"}],"gp":[{"name":"Title","genre":"장르(Korean)","rating":4.5,"label":"Section"}]}`
        }],
      }),
    });
    const data = await res.json();
    const txt = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) {
      const p = JSON.parse(m[0]);
      return { as: p.as || asGames, gp: p.gp || gpGames };
    }
  } catch (e) {
    console.error('AI enrich failed:', e.message);
  }
  return { as: asGames, gp: gpGames };
}

/* ─── Main Handler ─── */
export default async function handler(req) {
  const url = new URL(req.url);
  const country = (url.searchParams.get('country') || 'KR').toUpperCase();
  const cfg = COUNTRY_CFG[country];

  if (!cfg) {
    return Response.json({ error: 'Unknown country: ' + country }, { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  console.log(`[Crawl] Starting ${country}...`);

  // 1. 직접 HTML 크롤링
  const [todayHtml, gamesHtml, gpHtml] = await Promise.all([
    fetchPage(cfg.asToday),
    fetchPage(cfg.asGames),
    fetchPage(cfg.gpGames),
  ]);

  let asGames = parseAppStore(todayHtml, gamesHtml);
  let gpGames = parseGooglePlay(gpHtml);

  console.log(`[Crawl] HTML parse: AS=${asGames.length}, GP=${gpGames.length}`);

  // 2. AI 보강 (API 키가 있고, HTML 파싱 결과가 부족하면)
  if (asGames.length < 3 || gpGames.length < 3) {
    console.log('[Crawl] Insufficient HTML results, trying AI enrichment...');
    const enriched = await aiEnrich(country, asGames, gpGames);
    if (enriched.as.length > asGames.length) asGames = enriched.as;
    if (enriched.gp.length > gpGames.length) gpGames = enriched.gp;
    console.log(`[Crawl] After AI: AS=${asGames.length}, GP=${gpGames.length}`);
  }

  // 3. rank 부여
  asGames = asGames.map((g, i) => ({ rank: i + 1, name: g.name, genre: g.genre || '캐주얼', rating: g.rating || 0, section: g.label || '' }));
  gpGames = gpGames.map((g, i) => ({ rank: i + 1, name: g.name, genre: g.genre || '캐주얼', rating: g.rating || 0, section: g.label || '' }));

  return Response.json({
    country,
    date: new Date().toISOString().slice(0, 10),
    google: gpGames,
    apple: asGames,
    source: {
      asToday: cfg.asToday,
      asGames: cfg.asGames,
      gpGames: cfg.gpGames,
    },
  }, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600', // 1시간 CDN 캐시
    },
  });
}
