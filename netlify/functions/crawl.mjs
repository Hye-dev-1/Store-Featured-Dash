/**
 * Netlify Function — Store Game Crawler
 * GET /api/crawl?country=KR
 * 
 * Returns: { country, date, google[], apple[] }
 * Each game: { rank, name, icon, genre, rating, section, dev, tab, url }
 *   tab: "Today" | "Games" | "Featured"
 *   url: deep link to store detail page
 */

const CFG = {
  KR: { cc:'kr', hl:'ko', gl:'KR', name:'South Korea' },
  TW: { cc:'tw', hl:'zh-TW', gl:'TW', name:'Taiwan' },
  JP: { cc:'jp', hl:'ja', gl:'JP', name:'Japan' },
  US: { cc:'us', hl:'en', gl:'US', name:'United States' },
  TH: { cc:'th', hl:'th', gl:'TH', name:'Thailand' },
};

const LOCALE = {
  KR: { get:'보기', todaySections:'모두가 즐기는 게임,오늘은 이 게임,꼭 해봐야 할 게임,한정 기간 이벤트,대규모 업데이트,요즘 화제,깊이 보기,최초 공개,놀라운 인디 게임,에디터의 추천,새로운 이벤트,오늘의 이벤트,오늘의 추천', gamesBanner:'게임 탭 최상단 히어로 배너 (큰 이미지 배너, 이벤트 카드 등 — 가로 스크롤 리스트 컬렉션은 제외)', gpSections:'신규 출시,특별 이벤트,에디터 추천,추천 신작,인기 게임' },
  TW: { get:'取得', todaySections:'話題遊戲精選,今日推薦,必玩遊戲,限時活動,大型更新,搶先看,編輯精選,今日活動', gamesBanner:'遊戲頁面頂部大型橫幅（排除橫向滾動列表集合）', gpSections:'新品上架,特別活動,編輯推薦,熱門遊戲' },
  JP: { get:'入手', todaySections:'みんなが遊んでるゲーム,今日のゲーム,必ずプレイすべき,期間限定イベント,大型アップデート,インディーゲーム,エディターのおすすめ,今日のイベント', gamesBanner:'ゲームタブの最上部ヒーローバナー（横スクロールのリストコレクションは除外）', gpSections:'新着,注目のイベント,編集者のおすすめ,人気ゲーム' },
  US: { get:'Get', todaySections:"Everyone's Playing,Game of the Day,Must-Play Games,Limited Time Event,Major Update,Amazing Indies,Editor's Choice,Today's Event,Get to Know", gamesBanner:'Games tab top hero banners only (large image banners, event cards — exclude horizontal scrolling list collections)', gpSections:"New,Trending,Editor's Choice,Special Event,Popular Games" },
  TH: { get:'รับ', todaySections:'เกมที่ทุกคนกำลังเล่น,เกมวันนี้,ต้องเล่น,อีเวนต์จำกัดเวลา,อัปเดตครั้งใหญ่,เกมอินดี้สุดเจ๋ง', gamesBanner:'แบนเนอร์ฮีโร่ด้านบนสุดของแท็บเกม (ไม่รวมคอลเลกชันรายการแบบเลื่อน)', gpSections:'ใหม่,กิจกรรมพิเศษ,แนะนำจากบรรณาธิการ,เกมยอดนิยม' },
};

function mkUrls(c) {
  const g = CFG[c];
  return {
    asToday: `https://apps.apple.com/${g.cc}/iphone/today`,
    asGames: `https://apps.apple.com/${g.cc}/iphone/games`,
    gpGames: `https://play.google.com/store/games?device=phone&hl=${g.hl}&gl=${g.gl}`,
  };
}

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15';

async function grab(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'ko,en;q=0.9,ja;q=0.8,zh;q=0.7,th;q=0.6' }, redirect: 'follow' });
    return r.ok ? await r.text() : '';
  } catch { return ''; }
}

function clean(s) {
  return (s||'').replace(/<!--[\s\S]*?-->/g,'').replace(/<[^>]+>/g,'')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#x27;/g,"'").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
}

/* Non-game filter */
const BAN = 'chatgpt,gemini,perplexity,claude,copilot,notion,goodnotes,capcut,canva,picsart,adobe,tiktok,youtube,instagram,facebook,twitter,threads,snapchat,whatsapp,telegram,line,kakaotalk,spotify,apple music,shazam,netflix,disney,tving,wavve,coupang,배달의민족,당근,토스,카카오뱅크,네이버,chrome,safari,uber,grab,melon,vibe,bugs,genie,flo,clova,다글로,뤼튼,felo,유니브,stationhead,bubble with stars,weverse,위버스,notebooklm,microsoft,outlook,teams,slack,zoom,discord,photoshop,lightroom,procreate,garageband,imovie,charlie,찰리,weather,날씨,건강,fitness,health,maps,waze,번역,translate,calculator,계산기,clock,calendar,reminders,notes,files,measure,compass,podcasts,books,news'.split(',');

/* App Store Apps 카테고리 허용 리스트 (게임이 아닌 앱 중 예외적으로 포함) */
const APPS_ALLOW = ['maplestory worlds','메이플스토리 월드'];

function isBanned(n){ if(!n)return true; const l=n.toLowerCase().replace(/[\s™®:]/g,''); return BAN.some(b=>l.includes(b.replace(/\s/g,''))); }
function isAppsException(n){ if(!n)return false; const l=n.toLowerCase().replace(/[\s™®:]/g,''); return APPS_ALLOW.some(a=>l.includes(a.replace(/\s/g,''))); }

function isHeadline(s){ if(!s||s.length>45)return true; if(/[을를이가에서도의은는으로하고].*[요세다네죠습까]$/.test(s))return true; if(/^(보기|받기|열기|Get|Open|View|入手|取得|รับ|더 알아보기|もっと見る|See All)$/i.test(s))return true; return false; }

/* App Store: Games 카테고리인지 (Apps 카테고리 제외) */
function isGameCategory(a) {
  // url에 /app/ 포함되면 기본적으로 통과 (Games/Apps 구분은 URL만으로 어려움)
  // genre가 게임 장르이면 통과
  const gameGenres = ['액션','RPG','전략','퍼즐','캐주얼','시뮬레이션','어드벤처','스포츠','카드','리듬','Action','Strategy','Puzzle','Sports','Casual','Simulation','Adventure','Card','Music','Racing','Arcade','Role Playing','Board','Trivia','Word','Family'];
  if (a.genre && gameGenres.some(g => a.genre.toLowerCase().includes(g.toLowerCase()))) return true;
  // tab이 Today/Games면 게임 탭에서 온 것
  if (a.tab === 'Today' || a.tab === 'Games') return true;
  // label/section에 게임 관련 키워드
  const sec = (a.label || a.section || '').toLowerCase();
  if (sec.includes('game') || sec.includes('게임') || sec.includes('ゲーム') || sec.includes('遊戲') || sec.includes('เกม')) return true;
  // 기본값: 통과 (AI가 게임만 골라왔을 가능성 높음)
  return true;
}

/* Genre map */
const GM={'action':'액션','role playing':'RPG','role-playing':'RPG','rpg':'RPG','strategy':'전략','puzzle':'퍼즐','casual':'캐주얼','simulation':'시뮬레이션','adventure':'어드벤처','sports':'스포츠','card':'카드','board':'카드','music':'리듬','racing':'액션','arcade':'액션','trivia':'퍼즐','word':'퍼즐','동작':'액션','롤플레잉':'RPG','アクション':'액션','ロールプレイング':'RPG','ストラテジー':'전략','パズル':'퍼즐','カジュアル':'캐주얼','シミュレーション':'시뮬레이션','アドベンチャー':'어드벤처','スポーツ':'스포츠','カード':'카드','ミュージック':'리듬','動作':'액션','角色扮演':'RPG','策略':'전략','益智':'퍼즐','休閒':'캐주얼','模擬':'시뮬레이션','冒險':'어드벤처','運動':'스포츠','卡牌':'카드'};
function toGenre(r){if(!r)return '';const l=r.toLowerCase().trim();return GM[l]||GM[l.split(/[\/,&·]/)[0].trim()]||r;}

/* ═══ HTML Parsers (fallback) ═══ */
function parseAS(h1,h2,cc){
  const games=[],seen=new Set();
  function scan(html,tab){
    if(!html)return;
    const blocks=html.split(/href="[^"]*\/app\//);
    for(let i=1;i<blocks.length;i++){
      const b=blocks[i].substring(0,2000);
      const idM=b.match(/([^/"]+)\/id(\d+)/);
      if(!idM)continue;
      const slug=idM[1],appId=idM[2];
      const url=`https://apps.apple.com/${cc}/app/${slug}/id${appId}`;
      let icon='';
      const icM=b.match(/src="(https:\/\/is\d+-ssl\.mzstatic\.com\/image\/thumb\/[^"]+)"/i);
      if(icM)icon=icM[1].replace(/\/\d+x\d+[^.]*\./,'/128x128bb.');
      let name='';
      const h3s=[...b.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)];
      for(const h of h3s){const t=clean(h[1]);if(t&&t.length>=2&&t.length<=50&&!isHeadline(t)){name=t;break;}}
      if(!name){const ar=b.match(/aria-label="([^"]{2,50})"/);if(ar){const t=clean(ar[1]);if(!isHeadline(t))name=t;}}
      if(!name||isBanned(name))continue;
      const key=name.toLowerCase().replace(/[\s™:：·]/g,'');
      if(seen.has(key)){const ex=games.find(g=>g._k===key);if(ex){if(icon&&!ex.icon)ex.icon=icon;}continue;}
      seen.add(key);
      let genre='';
      const gM=b.match(/class="[^"]*(?:subtitle|genre|category)[^"]*"[^>]*>([^<]{1,20})<\//i);
      if(gM)genre=toGenre(clean(gM[1]));
      games.push({_k:key,name,icon,genre,rating:0,section:'',dev:'',tab,url,priority:games.length+1});
    }
  }
  scan(h1,'Today');
  scan(h2,'Games');
  return games.map(({_k,...g})=>g);
}

function parseGP(html){
  const games=[],seen=new Set();
  if(!html)return games;
  const blocks=html.split(/href="\/store\/apps\/details\?id=/);
  for(let i=1;i<blocks.length;i++){
    const b=blocks[i].substring(0,1500);
    const pkgM=b.match(/^([^"&]+)/);if(!pkgM)continue;
    const pkg=pkgM[1],url=`https://play.google.com/store/apps/details?id=${pkg}`;
    let icon='';const icM=b.match(/src="(https:\/\/play-lh\.googleusercontent\.com\/[^"]+)"/i);
    if(icM)icon=icM[1].split('=')[0]+'=s128-rw';
    let name='';
    const arM=b.match(/(?:aria-label|title)="([^"]{2,50})"/);if(arM)name=clean(arM[1]);
    if(!name){const altM=b.match(/alt="([^"]{2,50})"/);if(altM)name=clean(altM[1]);}
    if(!name||isBanned(name)||isHeadline(name))continue;
    const key=name.toLowerCase().replace(/[\s™:：·]/g,'');
    if(seen.has(key))continue;seen.add(key);
    games.push({name,icon,genre:'',rating:0,section:'',dev:'',tab:'Featured',url,priority:games.length+1});
  }
  return games;
}

/* ═══ AI Enrichment ═══ */
async function aiCrawl(country){
  const key=process.env.ANTHROPIC_API_KEY;
  if(!key)return null;
  const u=mkUrls(country),c=CFG[country],loc=LOCALE[country]||LOCALE.US;
  try{
    const r=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({
        model:'claude-sonnet-4-20250514',max_tokens:4096,
        tools:[{type:'web_search_20250305',name:'web_search'}],
        messages:[{role:'user',content:`You are a mobile game store analyst. Crawl the App Store and Google Play for ${c.name} and extract EVERY featured GAME.

=== CRITICAL RULES ===
1. ONLY GAMES from the Games category. Exclude ALL non-game apps.
   - The ONLY exception for Apps category: "MapleStory Worlds" / "메이플스토리 월드" — include this if found.
   - Exclude ALL other Apps category items (AI tools, social media, productivity, photo editors, music, finance, messaging, etc.)
2. Extract the OFFICIAL APP TITLE shown next to the "${loc.get}" button — NOT editorial headlines.
   WRONG: "애쉬베일 등장!" → RIGHT: "붕괴: 스타레일"
   WRONG: "심장아 나대지마!" → editorial headline, find the actual game name in the lockup
3. Preserve the ORDER games appear on the page (first game = priority 1).
4. EVERY game MUST have: icon URL, rating, developer name, genre.

=== ICON URLs (MANDATORY) ===
- App Store icons: https://is1-ssl.mzstatic.com/image/thumb/Purple.../AppIcon.../128x128bb.png
  Find these in <img> tags near the app title. Convert to 128x128bb size.
- Google Play icons: https://play-lh.googleusercontent.com/...=s128-rw
  Find in <img> tags with alt matching the game name.
- If you cannot find the icon URL from the page, visit the app's detail page to get it.

=== RATING (MANDATORY) ===
- Extract the actual user rating (e.g. 4.5, 4.7) from the store page or app detail page.
- Every game must have a rating. If not visible on the list page, visit the detail page.

=== APP STORE: TODAY TAB ===
URL: ${u.asToday}
- Crawl hero cards and editorial story cards from top to bottom
- For each card, find the actual game in the app lockup area (small icon + title + "${loc.get}" button)
- Known section types: ${loc.todaySections}
- Mark tab as "Today"

=== APP STORE: GAMES TAB ===  
URL: ${u.asGames}
- ONLY extract games from the TOP HERO BANNER area at the very top of the page.
- ${loc.gamesBanner}
- These are the large promotional banner cards (with big images) that appear BEFORE any list/collection sections.
- DO NOT include games from horizontal scrolling list collections like "오늘은 이 게임", "꼭 해봐야 할 게임", "무료 게임 순위", etc.
- DO NOT include games from "Top Free", "Top Paid", or any ranked chart lists.
- Typically there are only 1-5 hero banner games at the top.
- Mark tab as "Games"
- Include games NOT already found in Today tab

=== GOOGLE PLAY ===
URL: ${u.gpGames}
- Hero carousel banners + editorial sections: ${loc.gpSections}
- Mark tab as "Featured"

=== OUTPUT (STRICT JSON ONLY) ===
{
  "as":[
    {"name":"Title","dev":"Developer","genre":"액션","rating":4.5,"label":"Section","icon":"https://is1-ssl.mzstatic.com/...","tab":"Today","url":"https://apps.apple.com/${c.cc}/app/slug/id123","priority":1}
  ],
  "gp":[
    {"name":"Title","dev":"Developer","genre":"RPG","rating":4.3,"label":"Section","icon":"https://play-lh.googleusercontent.com/...","tab":"Featured","url":"https://play.google.com/store/apps/details?id=com.xxx","priority":1}
  ]
}

GENRE = exactly one of: 액션, RPG, 전략, 퍼즐, 캐주얼, 시뮬레이션, 어드벤처, 스포츠, 카드, 리듬
Include 10-25 games per store. icon and rating are REQUIRED for every entry.`}],
      }),
    });
    const d=await r.json();
    const txt=(d.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
    const j=txt.match(/\{[\s\S]*\}/);
    if(j)return JSON.parse(j[0]);
  }catch(e){console.error('AI:',e.message);}
  return null;
}

/* ═══ Merge ═══ */
function merge(html,ai){
  if(!ai||!ai.length)return html;
  const result=[...html];
  const seen=new Set(result.map(g=>(g.name||'').toLowerCase().replace(/[\s™:：·]/g,'')));
  for(const a of ai){
    if(isBanned(a.name))continue;
    const k=(a.name||'').toLowerCase().replace(/[\s™:：·]/g,'');
    const ex=result.find(g=>(g.name||'').toLowerCase().replace(/[\s™:：·]/g,'')===k);
    if(ex){
      if(a.icon&&!ex.icon)ex.icon=a.icon;
      if(a.genre&&!ex.genre)ex.genre=a.genre;
      if(a.rating&&!ex.rating)ex.rating=a.rating;
      if(a.dev&&!ex.dev)ex.dev=a.dev;
      if(a.label&&!ex.section)ex.section=a.label;
      if(a.tab&&!ex.tab)ex.tab=a.tab;
      if(a.url&&!ex.url)ex.url=a.url;
      if(a.priority&&!ex.priority)ex.priority=a.priority;
    }else if(!seen.has(k)){
      seen.add(k);
      result.push({name:a.name,icon:a.icon||'',genre:a.genre||'',rating:a.rating||0,section:a.label||'',dev:a.dev||'',tab:a.tab||'',url:a.url||'',priority:a.priority||result.length+1});
    }
  }
  return result;
}

/* ═══ Handler ═══ */
export default async function handler(req){
  const url=new URL(req.url);
  const country=(url.searchParams.get('country')||'KR').toUpperCase();
  if(!CFG[country])return Response.json({error:'Unknown'},{ status:400,headers:{'Access-Control-Allow-Origin':'*'}});

  const u=mkUrls(country);
  console.log(`[Crawl] ${country}`);

  const [h1,h2,h3]=await Promise.all([grab(u.asToday),grab(u.asGames),grab(u.gpGames)]);
  let asG=parseAS(h1,h2,CFG[country].cc);
  let gpG=parseGP(h3);
  console.log(`[HTML] AS=${asG.length} GP=${gpG.length}`);

  // AI enrichment — filter non-games except MapleStory Worlds
  const ai=await aiCrawl(country);
  if(ai){
    const filterAS = (ai.as||[]).filter(a => !isBanned(a.name) && (isGameCategory(a) || isAppsException(a.name)));
    const filterGP = (ai.gp||[]).filter(a => !isBanned(a.name));
    asG=merge(asG, filterAS);
    gpG=merge(gpG, filterGP);
    console.log(`[+AI] AS=${asG.length} GP=${gpG.length}`);
  }

  // Sort by priority, assign rank, final filter
  asG.sort((a,b)=>(a.priority||999)-(b.priority||999));
  gpG.sort((a,b)=>(a.priority||999)-(b.priority||999));
  asG=asG.filter(g=>!isBanned(g.name)&&(isGameCategory(g)||isAppsException(g.name))).map((g,i)=>({rank:i+1,...g}));
  gpG=gpG.filter(g=>!isBanned(g.name)).map((g,i)=>({rank:i+1,...g}));

  return Response.json({
    country,date:new Date().toISOString().slice(0,10),
    google:gpG,apple:asG,src:u,
  },{headers:{'Access-Control-Allow-Origin':'*','Cache-Control':'public, max-age=3600'}});
}
