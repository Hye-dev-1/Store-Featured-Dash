/**
 * Store GAME Crawler — Netlify Function
 * GET /api/crawl?country=KR
 *
 * Architecture:
 * - App Store: AI-only (HTML is JS-rendered, no useful data in static HTML)
 * - Google Play: HTML parse + AI enrich
 * - All: category-based game filter, editorial text filter
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

/* ── Genre mapping ── */
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

/* ── Game category check ── */
const GAME_WORDS='games,game,게임,ゲーム,遊戲,เกม,action,rpg,role playing,strategy,puzzle,casual,simulation,adventure,sports,card,board,music,racing,arcade,trivia,word,family,indie,액션,롤플레잉,전략,퍼즐,캐주얼,시뮬레이션,어드벤처,스포츠,카드,음악,레이싱,아케이드'.split(',');
function isGameCat(entry){
  if(!entry||!entry.name)return false;
  if(entry.category){
    const c=entry.category.toLowerCase();
    if(GAME_WORDS.some(w=>c.includes(w)))return true;
    return false;
  }
  if(entry.genre){const g=toG(entry.genre);if(['액션','RPG','전략','퍼즐','캐주얼','시뮬레이션','어드벤처','스포츠','카드','리듬'].includes(g))return true;}
  return false;
}
function isAppsOk(n){return n&&(n.toLowerCase().includes('maplestory worlds')||n.includes('메이플스토리 월드'));}

/* ── Editorial text filter ── */
function isEditorial(s){
  if(!s)return true;
  if(s.length>40||s.length<2)return true;
  if(/만나보세요|즐겨보세요|확인하세요|떠나보세요|시작하세요|도전하세요|경험하세요|대비하세요|챙기세요|함께하세요|플레이하세요/.test(s))return true;
  if(/에서 만나|지금 경험|놓쳐서는|더욱 뜨거|쟁탈전|페스티벌|컴백을|빅이어|사랑받는|써봐야|모두에게|심장아/.test(s))return true;
  if(/[을를이가에서도의은는으로하고].*[요세다네죠습까어]$/.test(s))return true;
  if(/しよう|ましょう|ください|楽しもう|チェック/.test(s))return true;
  if(/^(Get |Don't miss|Check out|Discover|Experience|Join |Play |Meet |Celebrate|Prepare)/i.test(s))return true;
  if(/[!！]$/.test(s)&&s.length>12)return true;
  if(/^(보기|받기|열기|Get|Open|View|入手|取得|รับ|더 알아보기|もっと見る|See All)$/i.test(s))return true;
  return false;
}

/* ── Google Play HTML parser (works well) ── */
const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15';
async function grab(url){try{const r=await fetch(url,{headers:{'User-Agent':UA,'Accept':'text/html','Accept-Language':'ko,en;q=0.9'},redirect:'follow'});return r.ok?await r.text():'';}catch{return '';}}
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

/* ── AI Crawl (primary for App Store, enrichment for GP) ── */
async function aiCrawl(country){
  const key=process.env.ANTHROPIC_API_KEY;if(!key)return null;
  const u=mkUrl(country),c=CFG[country];
  try{
    const r=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:4096,
        tools:[{type:'web_search_20250305',name:'web_search'}],
        messages:[{role:'user',content:`Crawl the App Store and Google Play for ${c.name} today. Extract ONLY GAMES.

== STEP 1: App Store Today Tab ==
URL: ${u.asToday}
Go to this page. You will see editorial cards from top to bottom.
For each card:
1. Find the app lockup (small icon + app name + "${c.get}" button)
2. The APP NAME is the text right above the "${c.get}" button (NOT the big headline)
3. Click through to the app's detail page
4. Check: is the category "Games" or a Games subcategory? If NOT → SKIP
5. Get: exact app name, developer, genre (Games subcategory like Action/RPG/Strategy), rating, icon URL
6. Skip entire cards about non-game themes ("지금 써봐야 하는 AI 툴", "모두에게 사랑받는 앱", etc.)

== STEP 2: App Store Games Tab ==
URL: ${u.asGames}
ONLY the hero banner cards at the very top (1-3 large promotional cards).
Do NOT include any horizontal scrolling lists.
Same process: verify each is a game.

== STEP 3: Google Play Games ==
URL: ${u.gpGames}
Hero carousel + editorial sections.
Get: name, developer, genre (from tags), rating, icon URL.

== OUTPUT FORMAT ==
JSON only. No markdown. No backticks. No explanation.
Every entry MUST have all fields filled.

{"as":[
  {"name":"가십하버: 합성 & 스토리 게임","dev":"Mighty Bear Games","genre":"퍼즐","rating":4.3,"icon":"https://is1-ssl.mzstatic.com/image/thumb/Purple.../128x128bb.png","tab":"Today","label":"한정 기간 이벤트","url":"https://apps.apple.com/${c.cc}/app/gossip-harbor/id1623318294","category":"Games","priority":1}
],"gp":[
  {"name":"Whiteout Survival","dev":"Century Games","genre":"전략","rating":4.5,"icon":"https://play-lh.googleusercontent.com/...=s128-rw","tab":"Featured","label":"특별 이벤트","url":"https://play.google.com/store/apps/details?id=com.gof.global","category":"Games","priority":1}
]}

Genre must be Korean: 액션, RPG, 전략, 퍼즐, 캐주얼, 시뮬레이션, 어드벤처, 스포츠, 카드, 리듬
Include 10-25 games per store. Every field is mandatory.`}],
      }),
    });
    const d=await r.json();
    const txt=(d.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
    const j=txt.match(/\{[\s\S]*\}/);
    if(j)return JSON.parse(j[0]);
  }catch(e){console.error('AI:',e.message);}
  return null;
}

/* ── Merge (GP HTML + AI data) ── */
function merge(html,ai){
  if(!ai||!ai.length)return html;
  const result=[...html],seen=new Set(result.map(g=>(g.name||'').toLowerCase().replace(/[\s™:：·]/g,'')));
  for(const a of ai){
    if(!a.name||isEditorial(a.name))continue;
    const k=a.name.toLowerCase().replace(/[\s™:：·]/g,'');
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
  const u=mkUrl(country);
  console.log(`[Crawl] ${country}`);

  // 1. Google Play HTML parse (App Store HTML은 JS렌더링이라 파싱 불가)
  const gpHtml=await grab(u.gpGames);
  let gpG=parseGP(gpHtml);
  let asG=[];
  console.log(`[HTML] GP=${gpG.length} (AS=skipped, JS-rendered)`);

  // 2. AI crawl (App Store의 유일한 데이터 소스 + GP 보강)
  const ai=await aiCrawl(country);
  if(ai){
    // App Store: AI 결과가 전부
    if(ai.as&&ai.as.length){
      asG=ai.as.filter(a=>a.name&&!isEditorial(a.name)).map((a,i)=>({
        name:a.name,icon:a.icon||'',genre:toG(a.genre||''),rating:a.rating||0,
        section:a.label||'',dev:a.dev||'',tab:a.tab||'',url:a.url||'',
        category:a.category||'',priority:a.priority||i+1,
      }));
    }
    // Google Play: HTML 결과에 AI로 보강
    if(ai.gp&&ai.gp.length){
      gpG=merge(gpG,ai.gp);
    }
    console.log(`[+AI] AS=${asG.length} GP=${gpG.length}`);
  }

  // 3. Genre normalize
  asG.forEach(g=>{if(g.genre)g.genre=toG(g.genre);});
  gpG.forEach(g=>{if(g.genre)g.genre=toG(g.genre);});

  // 4. Game-only filter + editorial filter
  asG=asG.filter(g=>(isGameCat(g)||isAppsOk(g.name))&&!isEditorial(g.name));
  gpG=gpG.filter(g=>(isGameCat(g)||isAppsOk(g.name))&&!isEditorial(g.name));
  console.log(`[Filter] AS=${asG.length} GP=${gpG.length}`);

  // 5. Cross-share icons
  const ic={};
  [...asG,...gpG].forEach(g=>{if(g.icon&&g.name)ic[g.name.toLowerCase().replace(/[\s™:：·]/g,'')]=g.icon;});
  asG.forEach(g=>{if(!g.icon){const k=g.name.toLowerCase().replace(/[\s™:：·]/g,'');if(ic[k])g.icon=ic[k];}});
  gpG.forEach(g=>{if(!g.icon){const k=g.name.toLowerCase().replace(/[\s™:：·]/g,'');if(ic[k])g.icon=ic[k];}});

  // 6. Sort by priority + assign rank
  asG.sort((a,b)=>(a.priority||999)-(b.priority||999));
  gpG.sort((a,b)=>(a.priority||999)-(b.priority||999));
  asG=asG.map((g,i)=>({rank:i+1,...g}));
  gpG=gpG.map((g,i)=>({rank:i+1,...g}));

  return Response.json({country,date:new Date().toISOString().slice(0,10),google:gpG,apple:asG,src:u},{
    headers:{'Access-Control-Allow-Origin':'*','Cache-Control':'public, max-age=3600'},
  });
}
