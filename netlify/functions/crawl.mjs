/**
 * Netlify Function — 스토어 게임 전용 크롤링
 * GET /api/crawl?country=KR
 * 
 * - 게임 앱만 추출 (ChatGPT, 유틸리티 등 제외)
 * - 장르 정확 파싱
 * - 앱 아이콘 썸네일 URL 포함
 */

const CFG = {
  KR: { cc:'kr', hl:'ko', gl:'KR', name:'South Korea' },
  TW: { cc:'tw', hl:'zh-TW', gl:'TW', name:'Taiwan' },
  JP: { cc:'jp', hl:'ja', gl:'JP', name:'Japan' },
  US: { cc:'us', hl:'en', gl:'US', name:'United States' },
  TH: { cc:'th', hl:'th', gl:'TH', name:'Thailand' },
};

function mkUrls(c) {
  const g = CFG[c];
  return {
    asToday: `https://apps.apple.com/${g.cc}/iphone/today`,
    asGames: `https://apps.apple.com/${g.cc}/iphone/games`,
    gpGames: `https://play.google.com/store/games?device=phone&hl=${g.hl}&gl=${g.gl}`,
  };
}

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

async function grab(url) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'ko,en;q=0.9,ja;q=0.8,zh;q=0.7' },
      redirect: 'follow',
    });
    return r.ok ? await r.text() : '';
  } catch { return ''; }
}

function clean(s) {
  return (s || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#x27;/g,"'").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
}

/* ── 비게임 앱 필터 (확실한 비게임만) ── */
const NON_GAME_NAMES = [
  'chatgpt','google gemini','perplexity','claude','copilot','notion','goodnotes',
  'capcut','canva','picsart','adobe','tiktok','youtube','instagram','facebook',
  'twitter','threads','snapchat','whatsapp','telegram','line','kakaotalk',
  'spotify','apple music','shazam','netflix','disney+','tving','wavve','coupang',
  '배달의민족','당근','토스','카카오뱅크','네이버','daum','safari','chrome',
  'google maps','waze','uber','grab','flo','melon','vibe','bugs','genie',
  'naver','clovanote','클로바노트','다글로','뤼튼','felo','유니브','stationhead',
  'bubble with stars','weverse','위버스',
  'google notebooklm','microsoft','outlook','teams','slack','zoom','discord',
  'photoshop','lightroom','procreate','garage band','imovie',
  'charlie','찰리와 걷기','건강','fitness','health','weather','날씨',
];

function isNonGame(name) {
  if (!name) return true;
  const lower = name.toLowerCase().replace(/[™®:\s]/g, '');
  return NON_GAME_NAMES.some(ng => lower.includes(ng.replace(/\s/g, '')));
}

/* ── 에디토리얼 헤드라인 필터 ── */
function isHeadline(s) {
  if (!s || s.length > 45) return true;
  if (/[을를이가에서도의은는으로하고].*[요세다네죠습까]$/.test(s)) return true;
  if (/^(보기|받기|열기|Get|Open|View|더 알아보기|See All|もっと見る)$/i.test(s)) return true;
  if (/^(지금|새로운|놀라운|놓쳐서는|다시|깊이|요즘)/.test(s) && s.length > 15) return true;
  return false;
}

/* ── 장르 매핑 ── */
const GENRE_KO = {
  'action':'액션','role playing':'RPG','role-playing':'RPG','rpg':'RPG',
  'strategy':'전략','puzzle':'퍼즐','casual':'캐주얼','simulation':'시뮬레이션',
  'adventure':'어드벤처','sports':'스포츠','card':'카드','board':'카드',
  'music':'리듬','racing':'액션','arcade':'액션','trivia':'퍼즐','word':'퍼즐',
  'entertainment':'캐주얼','family':'캐주얼','indie':'어드벤처',
  // 한국어
  '동작':'액션','롤플레잉':'RPG','퍼즐':'퍼즐','전략':'전략','시뮬레이션':'시뮬레이션',
  '어드벤처':'어드벤처','스포츠':'스포츠','캐주얼':'캐주얼','카드':'카드','보드':'카드','음악':'리듬','레이싱':'액션','아케이드':'액션',
  // 일본어
  'アクション':'액션','ロールプレイング':'RPG','ストラテジー':'전략','パズル':'퍼즐',
  'カジュアル':'캐주얼','シミュレーション':'시뮬레이션','アドベンチャー':'어드벤처',
  'スポーツ':'스포츠','カード':'카드','ミュージック':'리듬',
  // 중국어
  '動作':'액션','角色扮演':'RPG','策略':'전략','益智':'퍼즐','休閒':'캐주얼',
  '模擬':'시뮬레이션','冒險':'어드벤처','運動':'스포츠','卡牌':'카드',
};
function toGenre(raw) {
  if (!raw) return '';
  const l = raw.toLowerCase().trim();
  return GENRE_KO[l] || GENRE_KO[l.split(/[\/,&·]/)[0].trim()] || raw;
}

/* ══════════════════════════════════════════
   APP STORE 파싱
   - /app/ 링크 → 게임 타이틀 + 아이콘
   - 장르는 앱 상세 페이지에서 추출 or 섹션 컨텍스트
   ══════════════════════════════════════════ */
function parseAS(html1, html2) {
  const games = [];
  const seen = new Set();

  function scan(html) {
    if (!html) return;

    // ── 1. /app/ 링크 블록 통째로 추출 ──
    // App Store의 앱 카드: <a href="/kr/app/slug/id123"> ... <img src="icon"> ... <h3>앱명</h3> ... <span>장르</span> ... </a>
    // 여러 줄에 걸친 블록을 잡기 위해 넓은 범위 매칭
    const blocks = html.split(/href="[^"]*\/app\//);
    
    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i].substring(0, 2000); // 앱 카드 범위

      // 앱 ID 확인 (id + 숫자)
      const idMatch = block.match(/id(\d+)/);
      if (!idMatch) continue;

      // 아이콘: mzstatic.com 이미지 URL
      let icon = '';
      const iconRe = /src="(https:\/\/is\d+-ssl\.mzstatic\.com\/image\/thumb\/[^"]+)"/i;
      const iconM = block.match(iconRe);
      if (iconM) {
        // 128x128 정사각형으로 변환
        icon = iconM[1].replace(/\/\d+x\d+[^.]*\./, '/128x128bb.');
      }

      // 타이틀: 여러 패턴 시도
      let name = '';
      
      // 패턴A: <h3 ...>타이틀</h3>
      const h3s = [...block.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)];
      for (const h of h3s) {
        const t = clean(h[1]);
        if (t && t.length >= 2 && t.length <= 50 && !isHeadline(t)) {
          name = t;
          break;
        }
      }

      // 패턴B: aria-label
      if (!name) {
        const arM = block.match(/aria-label="([^"]{2,50})"/);
        if (arM) {
          const t = clean(arM[1]);
          if (t && !isHeadline(t)) name = t;
        }
      }

      if (!name) continue;
      if (isNonGame(name)) continue;

      // 장르: 카드 내 장르 텍스트 (보통 "퍼즐", "RPG" 등 짧은 텍스트)
      let genre = '';
      const genreRe = /class="[^"]*(?:subtitle|genre|category)[^"]*"[^>]*>([^<]{1,20})<\//i;
      const gM = block.match(genreRe);
      if (gM) genre = toGenre(clean(gM[1]));

      // 장르 없으면 텍스트 노드에서 짧은 장르명 탐색
      if (!genre) {
        const shortTexts = block.match(/>([^<]{2,12})<\/(?:span|p|div)/gi);
        if (shortTexts) {
          for (const st of shortTexts) {
            const txt = clean(st.replace(/<[^>]+>/g, ''));
            const mapped = toGenre(txt);
            if (mapped !== txt && GENRE_KO[txt.toLowerCase().trim()]) {
              genre = mapped;
              break;
            }
          }
        }
      }

      // 섹션 라벨 (에디토리얼 배지)
      let section = '';
      const badgeRe = /class="[^"]*badge[^"]*"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i;
      // 현재 블록 이전 영역에서 찾기 (상위 카드의 배지)
      const prevBlock = blocks[i - 1] ? blocks[i - 1].substring(blocks[i - 1].length - 500) : '';
      const bM = prevBlock.match(badgeRe);
      if (bM) section = clean(bM[1]);

      addGame(name, icon, genre, section, 0);
    }

    // ── 2. JSON-LD / 구조화 데이터에서 추출 ──
    const jsonLdRe = /"@type"\s*:\s*"(?:MobileApplication|SoftwareApplication)"[\s\S]*?"name"\s*:\s*"([^"]+)"[\s\S]*?(?:"applicationCategory"\s*:\s*"([^"]*)")?[\s\S]*?(?:"image"\s*:\s*"([^"]*)")?/gi;
    let jm;
    while ((jm = jsonLdRe.exec(html)) !== null) {
      const n = clean(jm[1]);
      if (n && !isNonGame(n) && !isHeadline(n)) {
        addGame(n, jm[3] || '', toGenre(jm[2] || ''), '', 0);
      }
    }
  }

  function addGame(name, icon, genre, section, rating) {
    const key = name.toLowerCase().replace(/[\s™:：·]/g, '');
    if (seen.has(key)) {
      // 아이콘/장르 보강
      const ex = games.find(g => g.name.toLowerCase().replace(/[\s™:：·]/g, '') === key);
      if (ex) {
        if (icon && !ex.icon) ex.icon = icon;
        if (genre && !ex.genre) ex.genre = genre;
        if (section && !ex.section) ex.section = section;
      }
      return;
    }
    seen.add(key);
    games.push({ name, icon: icon || '', genre: genre || '', rating: rating || 0, section: section || '' });
  }

  scan(html1);
  scan(html2);
  return games;
}

/* ══════════════════════════════════════════
   GOOGLE PLAY 파싱
   - /store/apps/details?id= 링크 기반
   - 아이콘 + 타이틀 + 장르
   ══════════════════════════════════════════ */
function parseGP(html) {
  const games = [];
  const seen = new Set();
  if (!html) return games;

  // GP 카드: <a href="/store/apps/details?id=com.xxx"> ... <img src="play-lh..." alt="게임명"> ... <span>장르</span>
  const blocks = html.split(/href="\/store\/apps\/details\?id=/);

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].substring(0, 1500);
    
    // 패키지 ID
    const pkgM = block.match(/^([^"&]+)/);
    if (!pkgM) continue;

    // 아이콘
    let icon = '';
    const icM = block.match(/src="(https:\/\/play-lh\.googleusercontent\.com\/[^"]+)"/i);
    if (icM) icon = icM[1].split('=')[0] + '=s128-rw';

    // 타이틀
    let name = '';
    
    // aria-label / title
    const arM = block.match(/(?:aria-label|title)="([^"]{2,50})"/);
    if (arM) name = clean(arM[1]);

    // alt on img
    if (!name) {
      const altM = block.match(/alt="([^"]{2,50})"/);
      if (altM) name = clean(altM[1]);
    }

    // span 텍스트
    if (!name) {
      const spM = block.match(/<span[^>]*>([^<]{2,40})<\/span>/);
      if (spM) {
        const t = clean(spM[1]);
        if (t && !/^\d/.test(t) && !/^(Install|설치|무료|Free)$/i.test(t)) name = t;
      }
    }

    if (!name) continue;
    if (isNonGame(name)) continue;
    if (isHeadline(name)) continue;

    // 장르
    let genre = '';
    const spans = [...block.matchAll(/<span[^>]*>([^<]{2,15})<\/span>/gi)];
    for (const sp of spans) {
      const txt = clean(sp[1]);
      const mapped = toGenre(txt);
      if (mapped !== txt || Object.values(GENRE_KO).includes(txt)) {
        genre = mapped;
        break;
      }
    }

    // 평점
    let rating = 0;
    const rtM = block.match(/(\d\.\d)\s*(?:star|★|점)/i) || block.match(/>(\d\.\d)</);
    if (rtM) rating = parseFloat(rtM[1]);

    const key = name.toLowerCase().replace(/[\s™:：·]/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    games.push({ name, icon, genre, rating, section: '' });
  }

  return games;
}

/* ══════════════════════════════════════════
   앱 상세 페이지에서 장르 + 평점 + 아이콘 보강
   (부족한 항목만 최대 10개 병렬 fetch)
   ══════════════════════════════════════════ */
async function enrichFromDetail(games, store, cc) {
  const needEnrich = games.filter(g => !g.genre || !g.icon).slice(0, 10);
  if (!needEnrich.length) return;

  // App Store 상세 페이지에서 장르/아이콘/평점 추출
  if (store === 'apple') {
    // App Store 상세는 /app/slug/id123 형식이므로 이미 수집된 데이터에서 ID가 필요
    // HTML 파싱에서 ID를 저장하지 않았으므로 이 단계는 스킵
    return;
  }
}

/* ══════════════════════════════════════════
   AI 보강 (API 키 있고 결과 부족 시)
   장르 + 평점 + 아이콘 함께 요청
   ══════════════════════════════════════════ */
async function aiEnrich(country) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const u = mkUrls(country);
  const c = CFG[country];
  
  // 국가별 로케일 힌트
  const locale = {
    KR: { get:'보기', todayLabel:'오늘은 이 게임, 꼭 해봐야 할 게임, 한정 기간 이벤트, 요즘 뜨는 게임, 놀라운 인디 게임', gpLabel:'신규 출시, 특별 이벤트, 에디터 추천' },
    TW: { get:'取得', todayLabel:'話題遊戲精選, 今日推薦, 必玩遊戲, 限時活動, 編輯精選', gpLabel:'新品上架, 特別活動, 編輯推薦' },
    JP: { get:'入手', todayLabel:'みんなが遊んでるゲーム, 今日のゲーム, 期間限定イベント, エディターのおすすめ, インディーゲーム', gpLabel:'新着, 注目のイベント, 編集者のおすすめ' },
    US: { get:'Get', todayLabel:"Everyone's Playing, Game of the Day, Must-Play, Limited Time Event, Amazing Indies, Editor's Choice", gpLabel:'New, Trending, Editor\'s Choice, Special Event' },
    TH: { get:'รับ', todayLabel:'เกมที่ทุกคนกำลังเล่น, เกมวันนี้, ต้องเล่น, อัปเดตครั้งใหญ่', gpLabel:'ใหม่, กิจกรรมพิเศษ, แนะนำจากบรรณาธิการ' },
  }[country] || { get:'Get', todayLabel:'Featured', gpLabel:'Featured' };

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: `You are a mobile game store crawler. Find ALL GAME titles currently featured on App Store and Google Play for ${c.name} today.

=== CRITICAL RULES ===
1. Extract ONLY GAMES. Exclude: AI assistants (ChatGPT, Gemini, Claude), productivity apps (Notion, Canva), social media (TikTok, Instagram), music/video streaming, photo editors, finance apps, messaging apps.
2. Extract the ACTUAL APP TITLE — the official name shown next to the "${locale.get}" button, NOT the editorial headline.
   - WRONG: "애쉬베일 등장!" (this is a headline)
   - RIGHT: "붕괴: 스타레일" (this is the actual game name)
   - WRONG: "놓쳐서는 안 될 로블록스 이벤트들" (headline)
   - RIGHT: "로블록스" (game name)
3. For each game, also extract: developer name, icon URL, genre, rating

=== APP STORE (${c.name}) ===
Visit BOTH pages:
- TODAY tab: ${u.asToday}
- GAMES tab: ${u.asGames}

On the Today tab, look for:
- Hero banner cards (large image cards at top)
- Editorial story cards with sections like: ${locale.todayLabel}
- Each card contains an app lockup with the real game title and "${locale.get}" button
- Event cards (앱 내 이벤트 / In-App Events)

On the Games tab, look for:
- "오늘은 이 게임" / "Today's Game" / equivalent curated list
- "꼭 해봐야 할 게임" / "Must-Play" list
- Any other editorial game lists

=== GOOGLE PLAY (${c.name}) ===
Visit: ${u.gpGames}

Look for:
- Hero carousel at the very top (rolling editorial banners)
- Editorial sections: ${locale.gpLabel}
- Each game card links to /store/apps/details?id=...

=== OUTPUT FORMAT ===
Return ONLY valid JSON. No markdown, no explanation, no backticks.
{
  "as":[{"name":"Official Game Title","genre":"액션","rating":4.5,"label":"Section Name","icon":"https://is1-ssl.mzstatic.com/...","dev":"Developer Name"}],
  "gp":[{"name":"Official Game Title","genre":"RPG","rating":4.3,"label":"Section Name","icon":"https://play-lh.googleusercontent.com/...","dev":"Developer Name"}]
}

GENRE must be exactly one of: 액션, RPG, 전략, 퍼즐, 캐주얼, 시뮬레이션, 어드벤처, 스포츠, 카드, 리듬
Include as many games as you can find. Aim for 10-20+ per store.` }],
      }),
    });
    const d = await r.json();
    const txt = (d.content || []).filter(x => x.type === 'text').map(x => x.text).join('\n');
    const j = txt.match(/\{[\s\S]*\}/);
    if (j) return JSON.parse(j[0]);
  } catch (e) { console.error('AI fail:', e.message); }
  return null;
}

/* ══════════════════════════════════════════
   MERGE: HTML 결과 + AI 결과 합치기
   AI가 더 정확한 장르/평점/아이콘을 제공하면 덮어쓰기
   ══════════════════════════════════════════ */
function merge(htmlGames, aiGames) {
  if (!aiGames || !aiGames.length) return htmlGames;
  
  const result = [...htmlGames];
  const seen = new Set(result.map(g => g.name.toLowerCase().replace(/[\s™:：·]/g, '')));

  for (const ag of aiGames) {
    const key = ag.name.toLowerCase().replace(/[\s™:：·]/g, '');
    const existing = result.find(g => g.name.toLowerCase().replace(/[\s™:：·]/g, '') === key);
    
    if (existing) {
      if (ag.icon && !existing.icon) existing.icon = ag.icon;
      if (ag.genre && !existing.genre) existing.genre = ag.genre;
      if (ag.rating && !existing.rating) existing.rating = ag.rating;
      if (ag.label && !existing.section) existing.section = ag.label;
      if (ag.dev && !existing.dev) existing.dev = ag.dev;
    } else if (!seen.has(key) && !isNonGame(ag.name)) {
      seen.add(key);
      result.push({
        name: ag.name, icon: ag.icon || '', genre: ag.genre || '',
        rating: ag.rating || 0, section: ag.label || '', dev: ag.dev || '',
      });
    }
  }
  return result;
}

/* ══════════════════════════════════════════
   HANDLER
   ══════════════════════════════════════════ */
export default async function handler(req) {
  const url = new URL(req.url);
  const country = (url.searchParams.get('country') || 'KR').toUpperCase();
  if (!CFG[country]) return Response.json({ error: 'Unknown: ' + country }, { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });

  const u = mkUrls(country);
  console.log(`[Crawl] ${country}`);

  // 1. HTML 크롤링 (3 페이지 병렬)
  const [h1, h2, h3] = await Promise.all([grab(u.asToday), grab(u.asGames), grab(u.gpGames)]);
  let asG = parseAS(h1, h2);
  let gpG = parseGP(h3);
  console.log(`[HTML] AS=${asG.length} GP=${gpG.length}`);

  // 2. AI 보강 (HTML 부족 시)
  let aiData = null;
  if (asG.length < 5 || gpG.length < 3) {
    console.log('[AI] enriching...');
    aiData = await aiEnrich(country);
  }

  // 3. 병합
  if (aiData) {
    asG = merge(asG, (aiData.as || []).filter(a => !isNonGame(a.name)));
    gpG = merge(gpG, (aiData.gp || []).filter(a => !isNonGame(a.name)));
    console.log(`[Merged] AS=${asG.length} GP=${gpG.length}`);
  }

  // 4. 최종 비게임 필터 + rank
  asG = asG.filter(g => !isNonGame(g.name)).map((g, i) => ({ rank: i + 1, ...g }));
  gpG = gpG.filter(g => !isNonGame(g.name)).map((g, i) => ({ rank: i + 1, ...g }));

  return Response.json({
    country, date: new Date().toISOString().slice(0, 10),
    google: gpG, apple: asG, src: u,
  }, {
    headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' },
  });
}
