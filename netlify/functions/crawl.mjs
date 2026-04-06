/**
 * Netlify Function — App Store / Google Play 크롤링
 * GET /api/crawl?country=KR
 * 
 * 1차: 서버사이드 HTML 파싱 (아이콘 URL + 타이틀명 추출)
 * 2차: AI 보강 (API 키 있을 때, HTML 결과 부족 시)
 */

const CFG = {
  KR: { cc:'kr', hl:'ko', gl:'KR', name:'South Korea' },
  TW: { cc:'tw', hl:'zh-TW', gl:'TW', name:'Taiwan' },
  JP: { cc:'jp', hl:'ja', gl:'JP', name:'Japan' },
  US: { cc:'us', hl:'en', gl:'US', name:'United States' },
  TH: { cc:'th', hl:'th', gl:'TH', name:'Thailand' },
};

function urls(c) {
  const g = CFG[c];
  return {
    asToday: `https://apps.apple.com/${g.cc}/iphone/today`,
    asGames: `https://apps.apple.com/${g.cc}/iphone/games`,
    gpGames: `https://play.google.com/store/games?device=phone&hl=${g.hl}&gl=${g.gl}`,
  };
}

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

async function fetchHTML(url) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'ko,en;q=0.9' },
      redirect: 'follow',
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } catch (e) {
    console.error('Fetch fail:', url, e.message);
    return '';
  }
}

function esc(s) {
  return (s || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

/* ═══════════════════════════════════════
   App Store 파싱
   핵심: /app/{slug}/id{numbers} 링크 옆의 실제 게임 타이틀 + 아이콘
   ═══════════════════════════════════════ */
function parseAppStore(html1, html2) {
  const games = [];
  const seen = new Set();

  function process(html) {
    if (!html) return;

    // ── 패턴 A: app-lockup / small-lockup 블록 ──
    // 구조: <a href="/kr/app/게임slug/id12345"> ... <img src="아이콘URL"> ... <h3>게임명</h3> ... 보기</a>
    // 이 블록은 실제 앱 카드 (에디토리얼 헤드라인이 아닌 진짜 앱명)
    const lockupRe = /href="[^"]*\/app\/([^"]*\/id\d+)[^"]*"[\s\S]*?<\/(?:a|div)>/gi;
    let chunk;
    while ((chunk = lockupRe.exec(html)) !== null) {
      const block = chunk[0];
      // 아이콘 추출 (mzstatic.com 이미지)
      const iconM = block.match(/src="(https:\/\/is\d+-ssl\.mzstatic\.com\/image\/thumb\/[^"]+)"/i);
      const icon = iconM ? iconM[1].replace(/\/\d+x\d+\w*\./, '/128x128bb.') : '';
      // 타이틀: lockup 내 <h3> 또는 class*="title"/"name" 요소
      const titleM = block.match(/<(?:h3|p|div)[^>]*class="[^"]*(?:lockup-title|title|name)[^"]*"[^>]*>([\s\S]*?)<\/(?:h3|p|div)>/i)
                  || block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
      if (titleM) {
        const name = esc(titleM[1]);
        if (name && name.length >= 2 && name.length <= 50) addGame(name, icon, '');
      }
    }

    // ── 패턴 B: aria-label on app links ──
    const ariaRe = /href="[^"]*\/app\/[^"]*"[^>]*aria-label="([^"]+)"[\s\S]*?(?:src="(https:\/\/is\d+-ssl\.mzstatic\.com[^"]*)")?/gi;
    let m;
    while ((m = ariaRe.exec(html)) !== null) {
      const name = esc(m[1]);
      const icon = m[2] ? m[2].replace(/\/\d+x\d+\w*\./, '/128x128bb.') : '';
      if (name && name.length >= 2 && name.length <= 50) addGame(name, icon, '');
    }

    // ── 패턴 C: 에디토리얼 카드 내부의 실제 앱 ──
    // Today 탭에서 "한정 기간 이벤트 / 대규모 업데이트" 등 헤드라인 아래 실제 앱명
    // story 카드 구조: <div class="...story..."> ... <badge>섹션명</badge> ... <h3>헤드라인(무시)</h3>
    //                  <div class="...lockup..."> ... <h3>실제 앱명</h3> ... 보기 ... </div>
    // 이미 패턴 A/B에서 잡히지만, 섹션명을 함께 추출
    const storyRe = /<p[^>]*class="[^"]*badge[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/p>[\s\S]*?(?:href="[^"]*\/app\/[^"]*"[\s\S]*?(?:<h3[^>]*>([\s\S]*?)<\/h3>|aria-label="([^"]+)"))/gi;
    while ((m = storyRe.exec(html)) !== null) {
      const section = esc(m[1]);
      const name = esc(m[2] || m[3]);
      if (name && name.length >= 2 && name.length <= 50) {
        // 섹션명으로 업데이트
        const key = name.toLowerCase().replace(/\s+/g, '');
        const existing = games.find(g => g.name.toLowerCase().replace(/\s+/g, '') === key);
        if (existing && section) existing.section = section;
      }
    }

    // ── 패턴 D: room/list 영역 (오늘은 이 게임, 꼭 해봐야 할 게임) ──
    // 구조: <h2 ...>섹션 제목</h2> ... <a href="/app/..."> <img ...> <h3>앱명</h3>
    const roomRe = /class="[^"]*(?:room|shelf|collection)[^"]*"[\s\S]*?<(?:h2|div)[^>]*>([\s\S]*?)<\/(?:h2|div)>[\s\S]*?(<a[\s\S]*?(?:<\/ul>|<\/section>|<\/div>\s*<\/div>\s*<\/div>))/gi;
    while ((m = roomRe.exec(html)) !== null) {
      const sectionName = esc(m[1]);
      const block = m[2];
      const appRe = /href="[^"]*\/app\/[^"]*"[\s\S]*?(?:src="(https:\/\/is\d+-ssl\.mzstatic\.com[^"]*)")?[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/gi;
      let am;
      while ((am = appRe.exec(block)) !== null) {
        const icon = am[1] ? am[1].replace(/\/\d+x\d+\w*\./, '/128x128bb.') : '';
        const name = esc(am[2]);
        if (name && name.length >= 2 && name.length <= 50) addGame(name, icon, sectionName);
      }
    }
  }

  function addGame(name, icon, section) {
    // 에디토리얼 헤드라인 필터 (한국어 문장형)
    if (/[을를이가에서도의은는하고].*[요세다네죠]$/.test(name)) return;
    if (name.length > 40) return;
    // "보기", "받기" 등 버튼 텍스트 제외
    if (/^(보기|받기|Get|Open|View|열기)$/i.test(name)) return;

    const key = name.toLowerCase().replace(/\s+/g, '');
    if (seen.has(key)) {
      // 아이콘이 없던 기존 항목에 아이콘 추가
      if (icon) {
        const existing = games.find(g => g.name.toLowerCase().replace(/\s+/g, '') === key);
        if (existing && !existing.icon) existing.icon = icon;
      }
      return;
    }
    seen.add(key);
    games.push({ name, icon: icon || '', genre: '', rating: 0, section: section || '' });
  }

  process(html1);
  process(html2);
  return games;
}

/* ═══════════════════════════════════════
   Google Play 파싱 (아이콘 포함)
   ═══════════════════════════════════════ */
function parseGooglePlay(html) {
  const games = [];
  const seen = new Set();
  if (!html) return games;

  // ── 패턴 A: details 링크 + aria-label + 아이콘 ──
  const re1 = /href="\/store\/apps\/details\?id=([^"&]+)"[^>]*(?:aria-label|title)="([^"]+)"[\s\S]*?src="(https:\/\/play-lh\.googleusercontent\.com\/[^"]+)"/gi;
  let m;
  while ((m = re1.exec(html)) !== null) {
    add(esc(m[2]), m[3] ? m[3].split('=')[0] + '=s128' : '');
  }

  // ── 패턴 B: 이미지 alt + src (카드 이미지) ──
  const re2 = /src="(https:\/\/play-lh\.googleusercontent\.com\/[^"]+)"[^>]*alt="([^"]{2,50})"/gi;
  while ((m = re2.exec(html)) !== null) {
    add(esc(m[2]), m[1].split('=')[0] + '=s128');
  }

  // ── 패턴 C: alt → src 순서 반대 ──
  const re3 = /alt="([^"]{2,50})"[^>]*src="(https:\/\/play-lh\.googleusercontent\.com\/[^"]+)"/gi;
  while ((m = re3.exec(html)) !== null) {
    add(esc(m[1]), m[2].split('=')[0] + '=s128');
  }

  // ── 패턴 D: span 기반 제목 (class 이름은 obfuscated) ──
  const re4 = /<span[^>]*>([^<]{2,40})<\/span>[\s\S]{0,500}?src="(https:\/\/play-lh\.googleusercontent\.com\/[^"]+)"/gi;
  while ((m = re4.exec(html)) !== null) {
    const name = esc(m[1]);
    if (name && !/^\d+$/.test(name) && !/^(Install|설치|安裝|インストール)$/i.test(name)) {
      add(name, m[2].split('=')[0] + '=s128');
    }
  }

  function add(name, icon) {
    if (!name || name.length < 2) return;
    const key = name.toLowerCase().replace(/\s+/g, '');
    if (seen.has(key)) return;
    seen.add(key);
    games.push({ name, icon: icon || '', genre: '', rating: 0, section: '' });
  }

  return games;
}

/* ═══════════════════════════════════════
   AI 보강 (API 키 있고 결과 부족 시)
   ═══════════════════════════════════════ */
async function aiEnrich(country) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const u = urls(country);
  const cfg = CFG[country];
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 3000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: `Find ALL game titles currently featured on App Store and Google Play for ${cfg.name} today.

APP STORE:
- Visit ${u.asToday} and ${u.asGames}
- Extract the ACTUAL GAME TITLE from each app card (the name next to "보기"/"Get" button)
- Do NOT extract editorial headlines like "애쉬베일 등장!" — only real app names like "붕괴: 스타레일"
- For each game, also provide the App Store icon URL if visible (mzstatic.com URL)

GOOGLE PLAY:
- Visit ${u.gpGames}
- Extract game titles from hero carousel and editorial sections
- Include the play-lh.googleusercontent.com icon URL for each game

Return ONLY valid JSON:
{"as":[{"name":"Title","genre":"장르(Korean)","rating":4.5,"label":"Section","icon":"https://...icon URL"}],
 "gp":[{"name":"Title","genre":"장르(Korean)","rating":4.5,"label":"Section","icon":"https://...icon URL"}]}

Genre must be Korean: 액션,RPG,전략,퍼즐,캐주얼,시뮬레이션,어드벤처,스포츠,카드,리듬` }],
      }),
    });
    const d = await r.json();
    const txt = (d.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    const j = txt.match(/\{[\s\S]*\}/);
    if (j) return JSON.parse(j[0]);
  } catch (e) { console.error('AI fail:', e.message); }
  return null;
}

/* ═══════════════════════════════════════
   Main Handler
   ═══════════════════════════════════════ */
export default async function handler(req) {
  const url = new URL(req.url);
  const country = (url.searchParams.get('country') || 'KR').toUpperCase();
  if (!CFG[country]) return Response.json({ error: 'Unknown country' }, { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });

  const u = urls(country);
  console.log(`[Crawl] ${country} start`);

  // 1. HTML 크롤링
  const [todayH, gamesH, gpH] = await Promise.all([fetchHTML(u.asToday), fetchHTML(u.asGames), fetchHTML(u.gpGames)]);
  let asGames = parseAppStore(todayH, gamesH);
  let gpGames = parseGooglePlay(gpH);
  console.log(`[Crawl] HTML: AS=${asGames.length}, GP=${gpGames.length}`);

  // 2. AI 보강 (부족 시)
  if (asGames.length < 5 || gpGames.length < 3) {
    console.log('[Crawl] Trying AI enrichment...');
    const ai = await aiEnrich(country);
    if (ai) {
      if (ai.as && ai.as.length > asGames.length) asGames = ai.as.map(a => ({ name: a.name, icon: a.icon || '', genre: a.genre || '', rating: a.rating || 0, section: a.label || '' }));
      if (ai.gp && ai.gp.length > gpGames.length) gpGames = ai.gp.map(a => ({ name: a.name, icon: a.icon || '', genre: a.genre || '', rating: a.rating || 0, section: a.label || '' }));
      console.log(`[Crawl] After AI: AS=${asGames.length}, GP=${gpGames.length}`);
    }
  }

  // 3. rank 부여 + 응답
  const result = {
    country, date: new Date().toISOString().slice(0, 10),
    google: gpGames.map((g, i) => ({ rank: i + 1, ...g })),
    apple: asGames.map((g, i) => ({ rank: i + 1, ...g })),
    src: u,
  };

  return Response.json(result, {
    headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' },
  });
}
