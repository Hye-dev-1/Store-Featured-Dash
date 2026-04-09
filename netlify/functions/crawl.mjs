/**
 * Store GAME Crawler — Single AI Call (timeout-safe)
 * GET /api/crawl?country=KR
 *
 * File: netlify/functions/crawl.mjs
 * Route: netlify.toml redirects /api/crawl → /.netlify/functions/crawl
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
  // KR App Store / GP tags
  '액션':'액션','롤플레잉':'RPG','전략':'전략','퍼즐':'퍼즐','캐주얼':'캐주얼',
  '시뮬레이션':'시뮬레이션','어드벤처':'어드벤처','스포츠':'스포츠','카드':'카드','보드':'카드',
  '음악':'리듬','레이싱':'액션','아케이드':'액션',
  // Google Play KR tags (common on detail pages)
  '롤플레잉':'RPG','실시간 전략':'전략','타워 디펜스':'전략','턴제 전략':'전략',
  '배틀로얄':'액션','슈팅':'액션','격투':'액션','플랫포머':'액션',
  '매치 3':'퍼즐','두뇌 게임':'퍼즐','단어':'퍼즐','퀴즈':'퍼즐',
  '방치형':'캐주얼','클리커':'캐주얼','합성':'캐주얼','하이퍼 캐주얼':'캐주얼',
  '타이쿤':'시뮬레이션','샌드박스':'시뮬레이션','라이프 시뮬레이션':'시뮬레이션','경영':'시뮬레이션',
  '오픈 월드':'어드벤처','탐험':'어드벤처','서바이벌':'어드벤처','생존':'어드벤처',
  '축구':'스포츠','야구':'스포츠','농구':'스포츠','골프':'스포츠','테니스':'스포츠','레슬링':'스포츠',
  '수집형 카드':'카드','TCG':'카드','CCG':'카드','덱 빌딩':'카드',
  '리듬':'리듬','음악 게임':'리듬','댄스':'리듬',
  // JP
  'アクション':'액션','ロールプレイング':'RPG','ストラテジー':'전략','パズル':'퍼즐',
  'カジュアル':'캐주얼','シミュレーション':'시뮬레이션','アドベンチャー':'어드벤처',
  'スポーツ':'스포츠','カード':'카드','ミュージック':'리듬',
  // TW/CN
  '動作':'액션','角色扮演':'RPG','策略':'전략','益智':'퍼즐','休閒':'캐주얼',
  '模擬':'시뮬레이션','冒險':'어드벤처','運動':'스포츠','卡牌':'카드',
  // GP English tags
  'mmorpg':'RPG','action rpg':'RPG','moba':'전략','tower defense':'전략',
  'battle royale':'액션','shooter':'액션','fighting':'액션',
  'match 3':'퍼즐','match-3':'퍼즐','idle':'캐주얼','merge':'캐주얼',
  'tycoon':'시뮬레이션','sandbox':'시뮬레이션','open world':'어드벤처',
  'survival':'어드벤처','tcg':'카드','rhythm':'리듬',
};
function toG(r){if(!r)return '';const l=r.toLowerCase().trim();return GM[l]||GM[l.split(/[\/,&·\-]/)[0].trim()]||r;}

function isEditorial(s){
  if(!s||s.length>40||s.length<2)return true;
  if(/만나보세요|즐겨보세요|확인하세요|떠나보세요|시작하세요|도전하세요|경험하세요|대비하세요|챙기세요|함께하세요|플레이하세요/.test(s))return true;
  if(/에서 만나|지금 경험|놓쳐서는|더욱 뜨거|쟁탈전|페스티벌|컴백을|빅이어|사랑받는|써봐야|모두에게|심장아|소문이 돌|사랑 이야기|로봇의 침공/.test(s))return true;
  if(/[을를이가에서도의은는으로하고].*[요세다네죠습까어]$/.test(s))return true;
  if(/しよう|ましょう|ください|楽しもう/.test(s))return true;
  if(/^(Get |Don't miss|Check out|Discover|Experience|Join |Play |Meet |Celebrate|Prepare)/i.test(s))return true;
  if(/[!！]$/.test(s)&&s.length>12)return true;
  return false;
}

const GAME_CATS='games,game,action,rpg,role playing,strategy,puzzle,casual,simulation,adventure,sports,card,board,music,racing,arcade'.split(',');
function isGameCat(e){
  if(!e)return false;
  if(e.category){const c=e.category.toLowerCase();return GAME_CATS.some(w=>c.includes(w));}
  if(e.genre){const g=toG(e.genre);return['액션','RPG','전략','퍼즐','캐주얼','시뮬레이션','어드벤처','스포츠','카드','리듬'].includes(g);}
  return false;
}

export default async function handler(req){
  const url=new URL(req.url);
  const country=(url.searchParams.get('country')||'KR').toUpperCase();
  if(!CFG[country])return Response.json({error:'Unknown country'},{status:400,headers:{'Access-Control-Allow-Origin':'*'}});

  const key=process.env.ANTHROPIC_API_KEY;
  if(!key)return Response.json({error:'No API key configured',hint:'Add ANTHROPIC_API_KEY in Netlify Environment Variables'},{status:500,headers:{'Access-Control-Allow-Origin':'*'}});

  const c=CFG[country],u=mkUrl(country);
  console.log(`[Crawl] ${country} start`);

  try{
    const r=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({
        model:'claude-sonnet-4-20250514',
        max_tokens:4096,
        tools:[{type:'web_search_20250305',name:'web_search'}],
        messages:[{role:'user',content:`You are extracting GAME data from app stores for ${c.name}.

TASK: Visit 3 URLs. For each game found, visit its DETAIL PAGE to get accurate metadata.

URL 1: ${u.asToday}
This is App Store's Today tab. It shows editorial cards.
Each card has: [Big Headline] + [Small App Lockup with icon, app name, "${c.get}" button]
⚠️ The BIG HEADLINE is NOT the game name. Example:
  - Headline: "봄이 왔다는 소문이 돌아요" ← IGNORE THIS
  - App name: "가십하버: 합성 & 스토리 게임" ← USE THIS
⚠️ Skip non-game cards entirely:
  - "지금 써봐야 하는 AI 툴" → skip (AI apps, not games)
  - "모두에게 사랑받는 앱" → skip (general apps, not games)  
  - "심장아 나대지마!" → skip (romance story collection, not a single game)
Only extract cards where the lockup app is categorized as "Games" on App Store.
Mark these as tab:"Today"

URL 2: ${u.asGames}
App Store Games tab. ONLY the 1-3 large hero banner cards at top. NOT scrolling lists.
Mark as tab:"Games"

URL 3: ${u.gpGames}
Google Play Games page. Hero carousel + editorial sections.
For each game, visit the detail page and look at the TAGS section.
Google Play shows genre tags like: RPG, 전략, 액션, 퍼즐, 시뮬레이션, 스포츠, 어드벤처, 카드, 캐주얼, 음악
The tags appear as clickable chips/buttons on the detail page (e.g. "롤플레잉", "전략", "싱글 플레이어", "멀티플레이어")
Use the FIRST genre-related tag (ignore non-genre tags like "싱글 플레이어", "멀티플레이어", "오프라인")
Convert to Korean: 액션/RPG/전략/퍼즐/캐주얼/시뮬레이션/어드벤처/스포츠/카드/리듬
Mark as tab:"Featured"

FOR EACH GAME: Visit its detail page (the URL) and extract:
- name: exact official title from the detail page
- dev: developer name from the detail page  
- genre: the PRIMARY CATEGORY shown on the detail page
  App Store shows genre like "Action", "Role Playing", "Strategy", "Puzzle", "Sports", "Simulation", "Adventure", "Card", "Board", "Music", "Racing", "Arcade", "Casual", "Word", "Trivia"
  Google Play shows tags like "RPG", "Strategy", "Action", "Casual", "Simulation"
  Convert to Korean: 액션/RPG/전략/퍼즐/캐주얼/시뮬레이션/어드벤처/스포츠/카드/리듬
  ⚠️ READ THE ACTUAL GENRE FROM THE PAGE. Do not guess. Each game has a specific genre.
- rating: the star rating number (e.g. 4.5) from the detail page
- icon: the app icon URL from the detail page
  App Store: https://is1-ssl.mzstatic.com/image/thumb/Purple.../AppIcon.../128x128bb.png  
  Google Play: https://play-lh.googleusercontent.com/...=s128-rw
- url: full detail page URL
- category: must be "Games" (skip if not)
- tab: "Today"/"Games"/"Featured"  
- label: editorial section name from the list page
- priority: order of appearance (1=first)

OUTPUT: Only valid JSON, no markdown, no explanation.
{"as":[{"name":"..","dev":"..","genre":"액션","rating":4.5,"icon":"https://..","url":"https://..","category":"Games","tab":"Today","label":"..","priority":1}],"gp":[{"name":"..","dev":"..","genre":"RPG","rating":4.3,"icon":"https://..","url":"https://..","category":"Games","tab":"Featured","label":"..","priority":1}]}

Include 10-20 games per store. Every field is required.`}],
      }),
    });

    if(!r.ok){
      const err=await r.text();
      console.error(`[API Error] ${r.status}: ${err.substring(0,200)}`);
      return Response.json({error:`API ${r.status}`,detail:err.substring(0,200)},{status:502,headers:{'Access-Control-Allow-Origin':'*'}});
    }

    const d=await r.json();
    const txt=(d.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
    const j=txt.match(/\{[\s\S]*\}/);
    
    if(!j){
      console.error('[Parse] No JSON found in response');
      console.error('[Response preview]',txt.substring(0,300));
      return Response.json({error:'No JSON in AI response',preview:txt.substring(0,200)},{status:502,headers:{'Access-Control-Allow-Origin':'*'}});
    }

    const parsed=JSON.parse(j[0]);
    
    // Process App Store results
    let asG=(parsed.as||[])
      .filter(a=>a.name&&!isEditorial(a.name))
      .filter(a=>{if(a.category){return a.category.toLowerCase().includes('game');}return true;})
      .map((a,i)=>({
        rank:i+1,name:a.name,icon:a.icon||'',genre:toG(a.genre||''),rating:a.rating||0,
        section:a.label||'',dev:a.dev||'',tab:a.tab||'Today',url:a.url||'',
        category:a.category||'Games',priority:a.priority||i+1,
      }));

    // Process Google Play results  
    let gpG=(parsed.gp||[])
      .filter(a=>a.name&&!isEditorial(a.name))
      .map((a,i)=>({
        rank:i+1,name:a.name,icon:a.icon||'',genre:toG(a.genre||''),rating:a.rating||0,
        section:a.label||'',dev:a.dev||'',tab:a.tab||'Featured',url:a.url||'',
        category:a.category||'Games',priority:a.priority||i+1,
      }));

    // Cross-share icons
    const ic={};
    [...asG,...gpG].forEach(g=>{if(g.icon&&g.name)ic[g.name.toLowerCase().replace(/[\s™:：·]/g,'')]=g.icon;});
    [...asG,...gpG].forEach(g=>{if(!g.icon){const k=g.name.toLowerCase().replace(/[\s™:：·]/g,'');if(ic[k])g.icon=ic[k];}});

    // Sort by priority
    asG.sort((a,b)=>(a.priority||999)-(b.priority||999));
    gpG.sort((a,b)=>(a.priority||999)-(b.priority||999));
    asG=asG.map((g,i)=>({...g,rank:i+1}));
    gpG=gpG.map((g,i)=>({...g,rank:i+1}));

    console.log(`[Done] AS=${asG.length} GP=${gpG.length}`);

    return Response.json({
      country,date:new Date().toISOString().slice(0,10),
      google:gpG,apple:asG,src:u,
    },{
      headers:{'Access-Control-Allow-Origin':'*','Cache-Control':'public, max-age=3600'},
    });

  }catch(e){
    console.error('[Fatal]',e.message,e.stack);
    return Response.json({error:e.message},{status:500,headers:{'Access-Control-Allow-Origin':'*'}});
  }
}

// Netlify Functions v2 config (optional, routing handled by netlify.toml)
export const config = { path: "/api/crawl" };
