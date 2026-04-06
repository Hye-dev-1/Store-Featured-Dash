/**
 * Store GAME Crawler — 2-Phase AI Architecture
 * GET /api/crawl?country=KR
 *
 * Phase 1: Collect game TITLES + URLs (simple, accurate)
 * Phase 2: Visit each game's detail page for icon/genre/rating/dev
 */

const CFG = {
  KR:{cc:'kr',hl:'ko',gl:'KR',name:'South Korea',get:'보기'},
  TW:{cc:'tw',hl:'zh-TW',gl:'TW',name:'Taiwan',get:'取得'},
  JP:{cc:'jp',hl:'ja',gl:'JP',name:'Japan',get:'入手'},
  US:{cc:'us',hl:'en',gl:'US',name:'United States',get:'Get'},
  TH:{cc:'th',hl:'th',gl:'TH',name:'Thailand',get:'รับ'},
};

function mkUrl(c){const g=CFG[c];return{
  asToday:`https://apps.apple.com/${g.cc}/iphone/today`,
  asGames:`https://apps.apple.com/${g.cc}/iphone/games`,
  gpGames:`https://play.google.com/store/games?device=phone&hl=${g.hl}&gl=${g.gl}`,
};}

const GM={
  'action':'액션','role playing':'RPG','role-playing':'RPG','rpg':'RPG','strategy':'전략',
  'puzzle':'퍼즐','casual':'캐주얼','simulation':'시뮬레이션','adventure':'어드벤처',
  'sports':'스포츠','card':'카드','board':'카드','music':'리듬','racing':'액션','arcade':'액션',
  'trivia':'퍼즐','word':'퍼즐','family':'캐주얼','indie':'어드벤처',
  '액션':'액션','롤플레잉':'RPG','전략':'전략','퍼즐':'퍼즐','캐주얼':'캐주얼',
  '시뮬레이션':'시뮬레이션','어드벤처':'어드벤처','스포츠':'스포츠','카드':'카드','보드':'카드',
  '음악':'리듬','레이싱':'액션','아케이드':'액션',
  'アクション':'액션','ロールプレイング':'RPG','ストラテジー':'전략','パズル':'퍼즐',
  'カジュアル':'캐주얼','シミュレーション':'시뮬레이션','アドベンチャー':'어드벤처',
  'スポーツ':'스포츠','カード':'카드','ミュージック':'리듬',
  '動作':'액션','角色扮演':'RPG','策略':'전략','益智':'퍼즐','休閒':'캐주얼',
  '模擬':'시뮬레이션','冒險':'어드벤처','運動':'스포츠','卡牌':'카드',
  'mmorpg':'RPG','action rpg':'RPG','moba':'전략','tower defense':'전략',
  'battle royale':'액션','shooter':'액션','fighting':'액션','platformer':'액션',
  'match 3':'퍼즐','match-3':'퍼즐','idle':'캐주얼','merge':'캐주얼',
  'tycoon':'시뮬레이션','sandbox':'시뮬레이션','open world':'어드벤처',
  'survival':'어드벤처','tcg':'카드','ccg':'카드','rhythm':'리듬',
};
function toG(r){if(!r)return '';const l=r.toLowerCase().trim();return GM[l]||GM[l.split(/[\/,&·\-]/)[0].trim()]||r;}

function isEditorial(s){
  if(!s||s.length>40||s.length<2)return true;
  if(/만나보세요|즐겨보세요|확인하세요|떠나보세요|시작하세요|도전하세요|경험하세요|대비하세요|챙기세요|함께하세요|플레이하세요/.test(s))return true;
  if(/에서 만나|지금 경험|놓쳐서는|더욱 뜨거|쟁탈전|페스티벌|컴백을|빅이어|사랑받는|써봐야|모두에게|심장아|소문이 돌/.test(s))return true;
  if(/[을를이가에서도의은는으로하고].*[요세다네죠습까어]$/.test(s))return true;
  if(/しよう|ましょう|ください|楽しもう/.test(s))return true;
  if(/^(Get |Don't miss|Check out|Discover|Experience|Join |Play |Meet |Celebrate|Prepare)/i.test(s))return true;
  if(/[!！]$/.test(s)&&s.length>12)return true;
  return false;
}

const GAME_CATS='games,game,게임,ゲーム,遊戲,เกม,action,rpg,role playing,strategy,puzzle,casual,simulation,adventure,sports,card,board,music,racing,arcade,trivia,word,family,indie'.split(',');
function isGameCat(e){
  if(!e)return false;
  if(e.category){const c=e.category.toLowerCase();if(GAME_CATS.some(w=>c.includes(w)))return true;return false;}
  if(e.genre){const g=toG(e.genre);if(['액션','RPG','전략','퍼즐','캐주얼','시뮬레이션','어드벤처','스포츠','카드','리듬'].includes(g))return true;}
  return false;
}
function isAppsOk(n){return n&&(n.toLowerCase().includes('maplestory worlds')||n.includes('메이플스토리 월드'));}

/* ── API helper ── */
async function callAI(prompt){
  const key=process.env.ANTHROPIC_API_KEY;
  if(!key)return null;
  try{
    const r=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({
        model:'claude-sonnet-4-20250514',
        max_tokens:4096,
        tools:[{type:'web_search_20250305',name:'web_search'}],
        messages:[{role:'user',content:prompt}],
      }),
    });
    const d=await r.json();
    const txt=(d.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
    const j=txt.match(/\{[\s\S]*\}/);
    return j?JSON.parse(j[0]):null;
  }catch(e){console.error('AI error:',e.message);return null;}
}

/* ══════════════════════════════════════
   PHASE 1: Collect titles + URLs
   Simple task → high accuracy
   ══════════════════════════════════════ */
async function phase1(country){
  const c=CFG[country],u=mkUrl(country);
  return callAI(`Visit these 3 pages for ${c.name} and list every GAME title you find.

PAGE 1: ${u.asToday} (App Store Today tab)
- Each card has a big editorial headline AND a small app lockup with the real app name
- The REAL GAME NAME is the small text next to "${c.get}" button, NOT the big headline
- Example: headline "봄이 왔다는 소문이 돌아요" → real name "가십하버: 합성 & 스토리 게임"  
- Example: headline "애쉬베일 등장!" → real name "붕괴: 스타레일"
- SKIP cards about non-game apps (AI tools, productivity apps, etc.)
- SKIP editorial headlines, subtitles, marketing copy
- Tab = "Today"

PAGE 2: ${u.asGames} (App Store Games tab)  
- ONLY the 1-3 large hero banner cards at the very top
- NOT the scrolling lists below
- Tab = "Games"

PAGE 3: ${u.gpGames} (Google Play)
- Hero carousel + editorial sections
- Tab = "Featured"

Return ONLY JSON. For each game, provide:
- name: the EXACT official app title (not headline, not subtitle)
- url: full store URL (apps.apple.com/... or play.google.com/...)  
- tab: "Today", "Games", or "Featured"
- label: the editorial section name (e.g. "한정 기간 이벤트")
- priority: order on page (1 = first)

{"as":[{"name":"가십하버: 합성 & 스토리 게임","url":"https://apps.apple.com/${c.cc}/app/gossip-harbor/id1623318294","tab":"Today","label":"한정 기간 이벤트","priority":1}],"gp":[{"name":"Whiteout Survival","url":"https://play.google.com/store/apps/details?id=com.gof.global","tab":"Featured","label":"특별 이벤트","priority":1}]}

List ALL games, 10-25 per store.`);
}

/* ══════════════════════════════════════
   PHASE 2: Get details for each game
   Visit detail pages → icon, genre, rating, dev
   ══════════════════════════════════════ */
async function phase2(games, store){
  if(!games||!games.length)return games;
  
  // 최대 20개 게임의 상세 정보 요청
  const urls=games.slice(0,20).map((g,i)=>`${i+1}. "${g.name}" → ${g.url}`).join('\n');
  
  const result=await callAI(`Visit each game's store detail page and get its metadata.

${urls}

For each game, visit the URL and extract:
- name: exact app title on the detail page
- dev: developer name (shown on the page)
- genre: the PRIMARY game category/tag shown on the detail page
  - For App Store: the genre listed under the app info (e.g. "Action", "Role Playing", "Strategy", "Puzzle", "Sports", "Simulation", "Adventure", "Card", "Board", "Music", "Racing", "Arcade")
  - For Google Play: the first genre tag shown (e.g. "RPG", "Strategy", "Action", "Casual")
  - Convert to Korean: 액션, RPG, 전략, 퍼즐, 캐주얼, 시뮬레이션, 어드벤처, 스포츠, 카드, 리듬
  - Be SPECIFIC. Do not default to 캐주얼. Check the actual page.
- rating: the average user rating number (e.g. 4.5, 4.7)
- icon: the app icon image URL
  - App Store: starts with https://is1-ssl.mzstatic.com/image/thumb/
  - Google Play: starts with https://play-lh.googleusercontent.com/
- category: "Games" if it's a game, "Apps" if not

Return ONLY JSON:
{"games":[{"name":"가십하버: 합성 & 스토리 게임","dev":"Mighty Bear Games","genre":"퍼즐","rating":4.3,"icon":"https://is1-ssl.mzstatic.com/...","category":"Games"}]}`);
  
  if(!result||!result.games)return games;
  
  // 상세 정보 병합
  for(const detail of result.games){
    const g=games.find(x=>x.name.toLowerCase().replace(/\s/g,'')===detail.name.toLowerCase().replace(/\s/g,''));
    if(g){
      if(detail.dev)g.dev=detail.dev;
      if(detail.genre)g.genre=toG(detail.genre);
      if(detail.rating)g.rating=detail.rating;
      if(detail.icon)g.icon=detail.icon;
      if(detail.category)g.category=detail.category;
    }
  }
  return games;
}

/* ── Google Play HTML parser (supplementary) ── */
const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15';
async function grab(url){try{const r=await fetch(url,{headers:{'User-Agent':UA,'Accept':'text/html'},redirect:'follow'});return r.ok?await r.text():'';}catch{return '';}}
function clean(s){return(s||'').replace(/<!--[\s\S]*?-->/g,'').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#x27;/g,"'").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();}

function parseGP(html){
  const games=[],seen=new Set();if(!html)return games;
  const blocks=html.split(/href="\/store\/apps\/details\?id=/);
  for(let i=1;i<blocks.length;i++){
    const b=blocks[i].substring(0,1500);
    const pkgM=b.match(/^([^"&]+)/);if(!pkgM)continue;
    const url=`https://play.google.com/store/apps/details?id=${pkgM[1]}`;
    let icon='';const icM=b.match(/src="(https:\/\/play-lh\.googleusercontent\.com\/[^"]+)"/i);
    if(icM)icon=icM[1].split('=')[0]+'=s128-rw';
    let name='';
    const arM=b.match(/(?:aria-label|title)="([^"]{2,40})"/);if(arM)name=clean(arM[1]);
    if(!name){const altM=b.match(/alt="([^"]{2,40})"/);if(altM)name=clean(altM[1]);}
    if(!name||isEditorial(name))continue;
    const key=name.toLowerCase().replace(/[\s™:：·]/g,'');if(seen.has(key))continue;seen.add(key);
    games.push({name,icon,genre:'',rating:0,section:'',dev:'',tab:'Featured',url,priority:games.length+1,category:'Games'});
  }
  return games;
}

/* ── Merge ── */
function mergeInto(base,additions){
  const seen=new Set(base.map(g=>(g.name||'').toLowerCase().replace(/[\s™:：·]/g,'')));
  for(const a of additions){
    if(!a.name||isEditorial(a.name))continue;
    const k=a.name.toLowerCase().replace(/[\s™:：·]/g,'');
    const ex=base.find(g=>(g.name||'').toLowerCase().replace(/[\s™:：·]/g,'')===k);
    if(ex){
      if(a.icon&&!ex.icon)ex.icon=a.icon;
      if(a.genre&&!ex.genre)ex.genre=toG(a.genre);
      if(a.rating&&!ex.rating)ex.rating=a.rating;
      if(a.dev&&!ex.dev)ex.dev=a.dev;
      if(a.label&&!ex.section)ex.section=a.label||a.section;
      if(a.url&&!ex.url)ex.url=a.url;
      if(a.category&&!ex.category)ex.category=a.category;
    }else if(!seen.has(k)){
      seen.add(k);
      base.push({name:a.name,icon:a.icon||'',genre:toG(a.genre||''),rating:a.rating||0,
        section:a.label||a.section||'',dev:a.dev||'',tab:a.tab||'',url:a.url||'',
        category:a.category||'',priority:a.priority||base.length+1});
    }
  }
}

/* ── Handler ── */
export default async function handler(req){
  const url=new URL(req.url);
  const country=(url.searchParams.get('country')||'KR').toUpperCase();
  if(!CFG[country])return Response.json({error:'Unknown'},{status:400,headers:{'Access-Control-Allow-Origin':'*'}});
  console.log(`[Crawl] ${country} — 2-phase start`);

  // Phase 1: Get titles + URLs
  const p1=await phase1(country);
  let asG=(p1&&p1.as||[]).filter(a=>a.name&&!isEditorial(a.name)).map((a,i)=>({
    name:a.name,icon:'',genre:'',rating:0,section:a.label||'',dev:'',
    tab:a.tab||'Today',url:a.url||'',category:'',priority:a.priority||i+1,
  }));
  let gpG=(p1&&p1.gp||[]).filter(a=>a.name&&!isEditorial(a.name)).map((a,i)=>({
    name:a.name,icon:'',genre:'',rating:0,section:a.label||'',dev:'',
    tab:a.tab||'Featured',url:a.url||'',category:'',priority:a.priority||i+1,
  }));
  console.log(`[Phase1] AS=${asG.length} GP=${gpG.length}`);

  // Merge GP HTML parse results
  const gpHtml=await grab(mkUrl(country).gpGames);
  const gpParsed=parseGP(gpHtml);
  if(gpParsed.length)mergeInto(gpG,gpParsed);

  // Phase 2: Get details (icon, genre, rating, dev) for each game
  const [asDetailed,gpDetailed]=await Promise.all([
    phase2(asG,'appstore'),
    phase2(gpG,'googleplay'),
  ]);
  asG=asDetailed||asG;
  gpG=gpDetailed||gpG;
  console.log(`[Phase2] AS details done, GP details done`);

  // Genre normalize
  asG.forEach(g=>{if(g.genre)g.genre=toG(g.genre);});
  gpG.forEach(g=>{if(g.genre)g.genre=toG(g.genre);});

  // Game filter
  asG=asG.filter(g=>(isGameCat(g)||isAppsOk(g.name))&&!isEditorial(g.name));
  gpG=gpG.filter(g=>(isGameCat(g)||isAppsOk(g.name))&&!isEditorial(g.name));
  console.log(`[Filter] AS=${asG.length} GP=${gpG.length}`);

  // Cross-share icons
  const ic={};
  [...asG,...gpG].forEach(g=>{if(g.icon&&g.name)ic[g.name.toLowerCase().replace(/[\s™:：·]/g,'')]=g.icon;});
  [...asG,...gpG].forEach(g=>{if(!g.icon){const k=g.name.toLowerCase().replace(/[\s™:：·]/g,'');if(ic[k])g.icon=ic[k];}});

  // Sort + rank
  asG.sort((a,b)=>(a.priority||999)-(b.priority||999));
  gpG.sort((a,b)=>(a.priority||999)-(b.priority||999));
  asG=asG.map((g,i)=>({rank:i+1,...g}));
  gpG=gpG.map((g,i)=>({rank:i+1,...g}));

  return Response.json({country,date:new Date().toISOString().slice(0,10),google:gpG,apple:asG,src:mkUrl(country)},{
    headers:{'Access-Control-Allow-Origin':'*','Cache-Control':'public, max-age=3600'},
  });
}
