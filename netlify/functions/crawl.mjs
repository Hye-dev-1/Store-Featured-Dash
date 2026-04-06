/**
 * Store GAME Crawler — Netlify Function
 * GET /api/crawl?country=KR
 */

const CFG = {
  KR:{cc:'kr',hl:'ko',gl:'KR',name:'South Korea'},
  TW:{cc:'tw',hl:'zh-TW',gl:'TW',name:'Taiwan'},
  JP:{cc:'jp',hl:'ja',gl:'JP',name:'Japan'},
  US:{cc:'us',hl:'en',gl:'US',name:'United States'},
  TH:{cc:'th',hl:'th',gl:'TH',name:'Thailand'},
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
  '음악':'리듬','레이싱':'액션','아케이드':'액션','단어':'퍼즐','가족':'캐주얼',
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

/* ── 게임 판별 (category 필드 기반) ── */
const GAME_CATS = ['games','game','게임','ゲーム','遊戲','เกม',
  'action','rpg','role playing','strategy','puzzle','casual','simulation',
  'adventure','sports','card','board','music','racing','arcade','trivia','word','family','indie',
  '액션','롤플레잉','전략','퍼즐','캐주얼','시뮬레이션','어드벤처','스포츠','카드','음악','레이싱','아케이드',
  'アクション','ロールプレイング','ストラテジー','パズル','カジュアル','シミュレーション','アドベンチャー','スポーツ','カード','ミュージック',
  '動作','角色扮演','策略','益智','休閒','模擬','冒險','運動','卡牌'];

function isGame(entry){
  if(!entry||!entry.name)return false;
  // category 필드로 판별 (AI가 제공)
  if(entry.category){
    const c=entry.category.toLowerCase();
    if(GAME_CATS.some(g=>c.includes(g)))return true;
    return false; // category 있는데 게임이 아님 → 제외
  }
  // category 없으면 genre로 추정
  if(entry.genre){
    const g=toG(entry.genre);
    if(['액션','RPG','전략','퍼즐','캐주얼','시뮬레이션','어드벤처','스포츠','카드','리듬'].includes(g))return true;
  }
  return false; // 판별 불가 → 제외 (안전하게)
}

/* Apps 카테고리 예외 */
function isAppsOk(n){return n&&n.toLowerCase().includes('maplestory worlds')||n&&n.includes('메이플스토리 월드');}

/* ── 에디토리얼 문구 판별 ── */
function isEditorial(s){
  if(!s)return true;
  if(s.length>40)return true;
  if(s.length<2)return true;
  // 한국어 문장/마케팅
  if(/만나보세요|즐겨보세요|확인하세요|떠나보세요|시작하세요|도전하세요|경험하세요|대비하세요|챙기세요|함께하세요|플레이하세요/.test(s))return true;
  if(/에서 만나|지금 경험|놓쳐서는|더욱 뜨거|쟁탈전|페스티벌|컴백을|빅이어|사랑받는/.test(s))return true;
  if(/[을를이가에서도의은는으로하고].*[요세다네죠습까어]$/.test(s))return true;
  // 일본어
  if(/しよう|ましょう|ください|してみ|楽しもう|チェック/.test(s))return true;
  // 영어
  if(/^(Get |Don't miss|Check out|Discover|Experience|Join |Play |Meet |Celebrate|Prepare)/i.test(s))return true;
  // 느낌표+긴 텍스트
  if(/!$/.test(s)&&s.length>12)return true;
  // 버튼
  if(/^(보기|받기|열기|Get|Open|View|入手|取得|รับ|더 알아보기|もっと見る|See All)$/i.test(s))return true;
  return false;
}

/* ── HTML fallback parsers ── */
const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15';
async function grab(url){try{const r=await fetch(url,{headers:{'User-Agent':UA,'Accept':'text/html','Accept-Language':'ko,en;q=0.9'},redirect:'follow'});return r.ok?await r.text():'';}catch{return '';}}
function clean(s){return(s||'').replace(/<!--[\s\S]*?-->/g,'').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#x27;/g,"'").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();}

function parseAS(h1,h2,cc){
  const games=[],seen=new Set();
  function scan(html,tab){
    if(!html)return;
    const blocks=html.split(/href="[^"]*\/app\//);
    for(let i=1;i<blocks.length;i++){
      const b=blocks[i].substring(0,2000);
      const idM=b.match(/([^/"]+)\/id(\d+)/);if(!idM)continue;
      const url=`https://apps.apple.com/${cc}/app/${idM[1]}/id${idM[2]}`;
      let icon='';const icM=b.match(/src="(https:\/\/is\d+-ssl\.mzstatic\.com\/image\/thumb\/[^"]+)"/i);
      if(icM)icon=icM[1].replace(/\/\d+x\d+[^.]*\./,'/128x128bb.');
      let name='';const h3s=[...b.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)];
      for(const h of h3s){const t=clean(h[1]);if(t&&!isEditorial(t)){name=t;break;}}
      if(!name){const ar=b.match(/aria-label="([^"]{2,40})"/);if(ar){const t=clean(ar[1]);if(!isEditorial(t))name=t;}}
      if(!name)continue;
      const key=name.toLowerCase().replace(/[\s™:：·]/g,'');
      if(seen.has(key))continue;seen.add(key);
      let genre='';const gM=b.match(/class="[^"]*(?:subtitle|genre|category)[^"]*"[^>]*>([^<]{1,20})<\//i);
      if(gM)genre=toG(clean(gM[1]));
      games.push({name,icon,genre,rating:0,section:'',dev:'',tab,url,priority:games.length+1,category:''});
    }
  }
  scan(h1,'Today');scan(h2,'Games');
  return games;
}

function parseGP(html){
  const games=[],seen=new Set();if(!html)return games;
  const blocks=html.split(/href="\/store\/apps\/details\?id=/);
  for(let i=1;i<blocks.length;i++){
    const b=blocks[i].substring(0,1500);
    const pkgM=b.match(/^([^"&]+)/);if(!pkgM)continue;
    const url=`https://play.google.com/store/apps/details?id=${pkgM[1]}`;
    let icon='';const icM=b.match(/src="(https:\/\/play-lh\.googleusercontent\.com\/[^"]+)"/i);
    if(icM)icon=icM[1].split('=')[0]+'=s128-rw';
    let name='';const arM=b.match(/(?:aria-label|title)="([^"]{2,40})"/);
    if(arM)name=clean(arM[1]);
    if(!name){const altM=b.match(/alt="([^"]{2,40})"/);if(altM)name=clean(altM[1]);}
    if(!name||isEditorial(name))continue;
    const key=name.toLowerCase().replace(/[\s™:：·]/g,'');if(seen.has(key))continue;seen.add(key);
    games.push({name,icon,genre:'',rating:0,section:'',dev:'',tab:'Featured',url,priority:games.length+1,category:'Games'});
  }
  return games;
}

/* ── AI Crawl ── */
async function aiCrawl(country){
  const key=process.env.ANTHROPIC_API_KEY;if(!key)return null;
  const u=mkUrl(country),c=CFG[country],loc=LOC[country]||LOC.US;
  try{
    const r=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:4096,
        tools:[{type:'web_search_20250305',name:'web_search'}],
        messages:[{role:'user',content:`Crawl App Store and Google Play for ${c.name}. Extract ONLY GAMES.

STEP 1 — App Store Today Tab (${u.asToday})
Visit the page. For each editorial card from top to bottom:
- Look at the app lockup area (small icon + app name + "${loc.get}" button)
- Get the APP NAME from the lockup — NOT the editorial headline above it
- Then visit that app's detail page to get: category, genre, developer, rating, icon URL
- If the app's category is NOT under "Games" → SKIP IT (e.g. skip 클로바노트, ChatGPT, Notion)
- If the card is a theme collection about non-game apps (e.g. "지금 써봐야 하는 AI 툴", "모두에게 사랑받는 앱") → SKIP THE ENTIRE CARD
- Only include cards that feature a GAME

STEP 2 — App Store Games Tab (${u.asGames})
- ONLY the hero banners at the very top (large promotional cards)
- DO NOT include any scrolling list collections
- Same process: get app name from lockup, verify it's a game

STEP 3 — Google Play Games (${u.gpGames})
- Hero carousel + editorial sections
- These are all games since we're on the Games page

For EVERY game, provide ALL fields:
- name: official app title (NOT marketing text)
- dev: developer name from the store page
- genre: the app's store category converted to Korean (액션/RPG/전략/퍼즐/캐주얼/시뮬레이션/어드벤처/스포츠/카드/리듬)
- rating: actual store rating (e.g. 4.5)
- icon: full icon URL
- url: full store page URL
- tab: "Today" / "Games" / "Featured"
- label: editorial section name
- category: "Games" (should be Games for all entries)
- priority: order on page (1=first)

Output ONLY JSON:
{"as":[...],"gp":[...]}`}],
      }),
    });
    const d=await r.json();
    const txt=(d.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
    const j=txt.match(/\{[\s\S]*\}/);
    if(j)return JSON.parse(j[0]);
  }catch(e){console.error('AI:',e.message);}
  return null;
}

const LOC = {
  KR:{get:'보기'},TW:{get:'取得'},JP:{get:'入手'},US:{get:'Get'},TH:{get:'รับ'},
};

/* ── Merge ── */
function merge(html,ai){
  if(!ai||!ai.length)return html;
  const result=[...html],seen=new Set(result.map(g=>(g.name||'').toLowerCase().replace(/[\s™:：·]/g,'')));
  for(const a of ai){
    if(isEditorial(a.name))continue;
    const k=(a.name||'').toLowerCase().replace(/[\s™:：·]/g,'');
    const ex=result.find(g=>(g.name||'').toLowerCase().replace(/[\s™:：·]/g,'')===k);
    if(ex){
      if(a.icon&&!ex.icon)ex.icon=a.icon;
      if(a.genre&&!ex.genre)ex.genre=toG(a.genre);
      if(a.rating&&!ex.rating)ex.rating=a.rating;
      if(a.dev&&!ex.dev)ex.dev=a.dev;
      if(a.label&&!ex.section)ex.section=a.label;
      if(a.tab&&!ex.tab)ex.tab=a.tab;
      if(a.url&&!ex.url)ex.url=a.url;
      if(a.category&&!ex.category)ex.category=a.category;
      if(a.priority!=null&&!ex.priority)ex.priority=a.priority;
    }else if(!seen.has(k)){
      seen.add(k);
      result.push({name:a.name,icon:a.icon||'',genre:toG(a.genre||''),rating:a.rating||0,
        section:a.label||'',dev:a.dev||'',tab:a.tab||'',url:a.url||'',
        category:a.category||'',priority:a.priority||result.length+1});
    }
  }
  return result;
}

/* ── Handler ── */
export default async function handler(req){
  const url=new URL(req.url);
  const country=(url.searchParams.get('country')||'KR').toUpperCase();
  if(!CFG[country])return Response.json({error:'Unknown'},{status:400,headers:{'Access-Control-Allow-Origin':'*'}});
  const u=mkUrl(country);console.log(`[Crawl] ${country}`);

  // 1. HTML parse
  const [h1,h2,h3]=await Promise.all([grab(u.asToday),grab(u.asGames),grab(u.gpGames)]);
  let asG=parseAS(h1,h2,CFG[country].cc),gpG=parseGP(h3);
  console.log(`[HTML] AS=${asG.length} GP=${gpG.length}`);

  // 2. AI enrich
  const ai=await aiCrawl(country);
  if(ai){
    asG=merge(asG,ai.as||[]);
    gpG=merge(gpG,ai.gp||[]);
    console.log(`[+AI] AS=${asG.length} GP=${gpG.length}`);
  }

  // 3. genre 정규화
  asG.forEach(g=>{if(g.genre)g.genre=toG(g.genre);});
  gpG.forEach(g=>{if(g.genre)g.genre=toG(g.genre);});

  // 4. ★ 게임만 필터 (category 기반) + 에디토리얼 문구 제거
  asG=asG.filter(g=>(isGame(g)||isAppsOk(g.name))&&!isEditorial(g.name));
  gpG=gpG.filter(g=>(isGame(g)||isAppsOk(g.name))&&!isEditorial(g.name));
  console.log(`[Filter] AS=${asG.length} GP=${gpG.length}`);

  // 5. 아이콘 크로스 공유
  const ic={};
  asG.forEach(g=>{if(g.icon)ic[g.name.toLowerCase().replace(/[\s™:：·]/g,'')]=g.icon;});
  gpG.forEach(g=>{if(g.icon)ic[g.name.toLowerCase().replace(/[\s™:：·]/g,'')]=g.icon;});
  asG.forEach(g=>{if(!g.icon){const k=g.name.toLowerCase().replace(/[\s™:：·]/g,'');if(ic[k])g.icon=ic[k];}});
  gpG.forEach(g=>{if(!g.icon){const k=g.name.toLowerCase().replace(/[\s™:：·]/g,'');if(ic[k])g.icon=ic[k];}});

  // 6. 정렬 + rank
  asG.sort((a,b)=>(a.priority||999)-(b.priority||999));
  gpG.sort((a,b)=>(a.priority||999)-(b.priority||999));
  asG=asG.map((g,i)=>({rank:i+1,...g}));
  gpG=gpG.map((g,i)=>({rank:i+1,...g}));

  return Response.json({country,date:new Date().toISOString().slice(0,10),google:gpG,apple:asG,src:u},{
    headers:{'Access-Control-Allow-Origin':'*','Cache-Control':'public, max-age=3600'},
  });
}
