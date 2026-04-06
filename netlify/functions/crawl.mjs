/**
 * Store Game Crawler — Netlify Function
 * GET /api/crawl?country=KR
 *
 * 카테고리 기반 필터: category="Games"만 포함
 * Apps 예외: MapleStory Worlds만 허용
 */

const CFG = {
  KR:{cc:'kr',hl:'ko',gl:'KR',name:'South Korea'},
  TW:{cc:'tw',hl:'zh-TW',gl:'TW',name:'Taiwan'},
  JP:{cc:'jp',hl:'ja',gl:'JP',name:'Japan'},
  US:{cc:'us',hl:'en',gl:'US',name:'United States'},
  TH:{cc:'th',hl:'th',gl:'TH',name:'Thailand'},
};

const LOC = {
  KR:{get:'보기',today:'모두가 즐기는 게임,오늘은 이 게임,꼭 해봐야 할 게임,한정 기간 이벤트,대규모 업데이트,요즘 화제,깊이 보기,최초 공개,놀라운 인디 게임,에디터의 추천,새로운 이벤트,오늘의 이벤트,오늘의 추천',gamesBanner:'게임 탭 최상단 히어로 배너만 (리스트 컬렉션 제외)',gp:'신규 출시,특별 이벤트,에디터 추천,추천 신작,인기 게임'},
  TW:{get:'取得',today:'話題遊戲精選,今日推薦,必玩遊戲,限時活動,大型更新,搶先看,編輯精選',gamesBanner:'遊戲頁面頂部大型橫幅（排除列表集合）',gp:'新品上架,特別活動,編輯推薦,熱門遊戲'},
  JP:{get:'入手',today:'みんなが遊んでるゲーム,今日のゲーム,必ずプレイすべき,期間限定イベント,大型アップデート,インディーゲーム,エディターのおすすめ',gamesBanner:'ゲームタブ最上部ヒーローバナーのみ（リストコレクション除外）',gp:'新着,注目のイベント,編集者のおすすめ,人気ゲーム'},
  US:{get:'Get',today:"Everyone's Playing,Game of the Day,Must-Play,Limited Time Event,Major Update,Amazing Indies,Editor's Choice",gamesBanner:'Games tab top hero banners only (exclude list collections)',gp:"New,Trending,Editor's Choice,Special Event"},
  TH:{get:'รับ',today:'เกมที่ทุกคนกำลังเล่น,เกมวันนี้,ต้องเล่น,อีเวนต์จำกัดเวลา,อัปเดตครั้งใหญ่',gamesBanner:'แบนเนอร์ฮีโร่ด้านบนสุดเท่านั้น (ไม่รวมคอลเลกชัน)',gp:'ใหม่,กิจกรรมพิเศษ,แนะนำจากบรรณาธิการ'},
};

function urls(c){const g=CFG[c];return{asToday:`https://apps.apple.com/${g.cc}/iphone/today`,asGames:`https://apps.apple.com/${g.cc}/iphone/games`,gpGames:`https://play.google.com/store/games?device=phone&hl=${g.hl}&gl=${g.gl}`};}

/* ── 통합 장르 매핑 (App Store Category + Google Play Tags → 10개) ── */
const GM = {
  'action':'액션','role playing':'RPG','role-playing':'RPG','rpg':'RPG','strategy':'전략',
  'puzzle':'퍼즐','casual':'캐주얼','simulation':'시뮬레이션','adventure':'어드벤처',
  'sports':'스포츠','card':'카드','board':'카드','music':'리듬',
  'racing':'액션','arcade':'액션','trivia':'퍼즐','word':'퍼즐','family':'캐주얼','indie':'어드벤처',
  '액션':'액션','롤플레잉':'RPG','전략':'전략','퍼즐':'퍼즐','캐주얼':'캐주얼',
  '시뮬레이션':'시뮬레이션','어드벤처':'어드벤처','스포츠':'스포츠','카드':'카드','보드':'카드','음악':'리듬','레이싱':'액션','아케이드':'액션','단어':'퍼즐','퀴즈':'퍼즐','가족':'캐주얼','인디':'어드벤처',
  'アクション':'액션','ロールプレイング':'RPG','ストラテジー':'전략','パズル':'퍼즐','カジュアル':'캐주얼','シミュレーション':'시뮬레이션','アドベンチャー':'어드벤처','スポーツ':'스포츠','カード':'카드','ボード':'카드','ミュージック':'리듬','レーシング':'액션','アーケード':'액션',
  '動作':'액션','角色扮演':'RPG','策略':'전략','益智':'퍼즐','休閒':'캐주얼','模擬':'시뮬레이션','冒險':'어드벤처','運動':'스포츠','卡牌':'카드','音樂':'리듬','競速':'액션',
  'mmorpg':'RPG','turn-based rpg':'RPG','action rpg':'RPG','moba':'전략','tower defense':'전략','real-time strategy':'전략',
  'battle royale':'액션','shooter':'액션','fighting':'액션','platformer':'액션',
  'match 3':'퍼즐','match-3':'퍼즐','brain games':'퍼즐','logic':'퍼즐',
  'idle':'캐주얼','clicker':'캐주얼','hyper casual':'캐주얼','merge':'캐주얼',
  'tycoon':'시뮬레이션','sandbox':'시뮬레이션','life simulation':'시뮬레이션',
  'open world':'어드벤처','exploration':'어드벤처','survival':'어드벤처',
  'soccer':'스포츠','football':'스포츠','baseball':'스포츠','basketball':'스포츠',
  'collectible card':'카드','tcg':'카드','ccg':'카드','deck building':'카드',
  'rhythm':'리듬','music game':'리듬','dance':'리듬',
};
function toGenre(r){if(!r)return '';const l=r.toLowerCase().trim();if(GM[l])return GM[l];const f=l.split(/[\/,&·\-]/)[0].trim();if(GM[f])return GM[f];for(const[k,v]of Object.entries(GM)){if(l.includes(k))return v;}return r;}

/* ── Apps 카테고리 예외 허용 ── */
const APPS_OK = ['maplestory worlds','메이플스토리 월드'];
function isAppsOk(n){if(!n)return false;const l=n.toLowerCase().replace(/[\s™®:]/g,'');return APPS_OK.some(a=>l.includes(a.replace(/\s/g,'')));}

/* ── 카테고리 기반 게임 판별 ── */
function isGameEntry(entry) {
  // 1. category 필드가 명시적으로 있으면 그걸로 판별
  if (entry.category) {
    const cat = entry.category.toLowerCase();
    // "Games" 또는 게임 하위 카테고리
    if (cat.includes('game') || cat.includes('게임') || cat.includes('ゲーム') || cat.includes('遊戲') || cat.includes('เกม')) return true;
    // 명시적으로 Apps 카테고리인 경우 → 예외만 허용
    if (cat.includes('app') || cat.includes('앱') || cat.includes('アプリ') || cat.includes('應用') || cat.includes('แอป') ||
        cat.includes('productivity') || cat.includes('utilities') || cat.includes('social') || 
        cat.includes('photo') || cat.includes('music') || cat.includes('education') ||
        cat.includes('business') || cat.includes('finance') || cat.includes('health') ||
        cat.includes('lifestyle') || cat.includes('news') || cat.includes('weather') ||
        cat.includes('food') || cat.includes('travel') || cat.includes('navigation') ||
        cat.includes('shopping') || cat.includes('medical') || cat.includes('reference') ||
        cat.includes('entertainment') || cat.includes('developer')) {
      return isAppsOk(entry.name);
    }
  }
  // 2. category 없으면 genre로 추정 (게임 장르면 통과)
  if (entry.genre) {
    const g = toGenre(entry.genre);
    if (['액션','RPG','전략','퍼즐','캐주얼','시뮬레이션','어드벤처','스포츠','카드','리듬'].includes(g)) return true;
  }
  // 3. tab이 Today/Games/Featured면 게임 탭에서 온 것으로 간주
  if (entry.tab === 'Today' || entry.tab === 'Games' || entry.tab === 'Featured') return true;
  // 4. 판별 불가 → 허용 (AI가 게임만 보내줬을 확률 높음)
  return true;
}

function isHL(s){if(!s||s.length>45)return true;if(/[을를이가에서도의은는으로하고].*[요세다네죠습까]$/.test(s))return true;if(/^(보기|받기|열기|Get|Open|View|入手|取得|รับ|더 알아보기|もっと見る|See All)$/i.test(s))return true;return false;}

const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15';
async function grab(url){try{const r=await fetch(url,{headers:{'User-Agent':UA,'Accept':'text/html','Accept-Language':'ko,en;q=0.9,ja;q=0.8,zh;q=0.7,th;q=0.6'},redirect:'follow'});return r.ok?await r.text():'';}catch{return '';}}
function clean(s){return(s||'').replace(/<!--[\s\S]*?-->/g,'').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#x27;/g,"'").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();}

/* ── HTML Parsers ── */
function parseAS(h1,h2,cc){
  const games=[],seen=new Set();
  function scan(html,tab){
    if(!html)return;
    const blocks=html.split(/href="[^"]*\/app\//);
    for(let i=1;i<blocks.length;i++){
      const b=blocks[i].substring(0,2000);
      const idM=b.match(/([^/"]+)\/id(\d+)/);if(!idM)continue;
      const slug=idM[1],appId=idM[2],url=`https://apps.apple.com/${cc}/app/${slug}/id${appId}`;
      let icon='';const icM=b.match(/src="(https:\/\/is\d+-ssl\.mzstatic\.com\/image\/thumb\/[^"]+)"/i);
      if(icM)icon=icM[1].replace(/\/\d+x\d+[^.]*\./,'/128x128bb.');
      let name='';const h3s=[...b.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)];
      for(const h of h3s){const t=clean(h[1]);if(t&&t.length>=2&&t.length<=50&&!isHL(t)){name=t;break;}}
      if(!name){const ar=b.match(/aria-label="([^"]{2,50})"/);if(ar){const t=clean(ar[1]);if(!isHL(t))name=t;}}
      if(!name)continue;
      const key=name.toLowerCase().replace(/[\s™:：·]/g,'');
      if(seen.has(key)){const ex=games.find(g=>g._k===key);if(ex&&icon&&!ex.icon)ex.icon=icon;continue;}
      seen.add(key);
      let genre='';const gM=b.match(/class="[^"]*(?:subtitle|genre|category)[^"]*"[^>]*>([^<]{1,20})<\//i);
      if(gM)genre=toGenre(clean(gM[1]));
      games.push({_k:key,name,icon,genre,rating:0,section:'',dev:'',tab,url,priority:games.length+1,category:''});
    }
  }
  scan(h1,'Today');scan(h2,'Games');
  return games.map(({_k,...g})=>g);
}

function parseGP(html){
  const games=[],seen=new Set();if(!html)return games;
  const blocks=html.split(/href="\/store\/apps\/details\?id=/);
  for(let i=1;i<blocks.length;i++){
    const b=blocks[i].substring(0,1500);
    const pkgM=b.match(/^([^"&]+)/);if(!pkgM)continue;
    const pkg=pkgM[1],url=`https://play.google.com/store/apps/details?id=${pkg}`;
    let icon='';const icM=b.match(/src="(https:\/\/play-lh\.googleusercontent\.com\/[^"]+)"/i);
    if(icM)icon=icM[1].split('=')[0]+'=s128-rw';
    let name='';const arM=b.match(/(?:aria-label|title)="([^"]{2,50})"/);if(arM)name=clean(arM[1]);
    if(!name){const altM=b.match(/alt="([^"]{2,50})"/);if(altM)name=clean(altM[1]);}
    if(!name||isHL(name))continue;
    const key=name.toLowerCase().replace(/[\s™:：·]/g,'');if(seen.has(key))continue;seen.add(key);
    games.push({name,icon,genre:'',rating:0,section:'',dev:'',tab:'Featured',url,priority:games.length+1,category:'Games'});
  }
  return games;
}

/* ── AI Crawl — category 필드 포함 ── */
async function aiCrawl(country){
  const key=process.env.ANTHROPIC_API_KEY;if(!key)return null;
  const u=urls(country),c=CFG[country],loc=LOC[country]||LOC.US;
  try{
    const r=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:4096,
        tools:[{type:'web_search_20250305',name:'web_search'}],
        messages:[{role:'user',content:`Crawl App Store and Google Play for ${c.name}. Extract featured apps.

=== CRITICAL: CATEGORY-BASED FILTERING ===
For EVERY app you find, check its App Store / Google Play CATEGORY.
- Include the "category" field in your response: either "Games" or "Apps"
- App Store: Check if the app is listed under "Games" category (Action, Role Playing, Strategy, Puzzle, Casual, etc.) or "Apps" category (Productivity, Utilities, Social Networking, etc.)
- Google Play: The URL path /store/games/ means it's a game. Check the app's category tag.
- We will FILTER by category="Games" on our end. Non-game apps with category="Apps" will be excluded automatically.
- The ONLY Apps-category exception: "MapleStory Worlds" — include this even though it's in Apps.

=== TITLE EXTRACTION ===
Extract the OFFICIAL APP TITLE next to the "${loc.get}" button, NOT editorial headlines.
WRONG: "애쉬베일 등장!" (headline) → RIGHT: "붕괴: 스타레일" (app name)

=== REQUIRED FIELDS (every entry must have ALL) ===
- name: official app title
- dev: developer name  
- genre: App Store primary sub-category or Google Play tag → convert to Korean (액션/RPG/전략/퍼즐/캐주얼/시뮬레이션/어드벤처/스포츠/카드/리듬)
- rating: actual store rating (e.g. 4.5)
- icon: full URL (mzstatic.com for AS, play-lh.googleusercontent.com for GP)
- url: full store detail page URL
- tab: "Today" or "Games" (for AS) / "Featured" (for GP)
- label: editorial section name
- category: "Games" or "Apps"
- priority: order of appearance (1 = first)

=== PAGES TO CRAWL ===
App Store Today: ${u.asToday} — All hero cards & story cards. Sections: ${loc.today}
App Store Games: ${u.asGames} — ${loc.gamesBanner}
Google Play: ${u.gpGames} — Hero carousel + sections: ${loc.gp}

=== OUTPUT (JSON only, no markdown) ===
{"as":[{"name":"Title","dev":"Dev","genre":"액션","rating":4.5,"label":"Section","icon":"https://...","tab":"Today","url":"https://...","category":"Games","priority":1}],"gp":[{"name":"Title","dev":"Dev","genre":"RPG","rating":4.3,"label":"Section","icon":"https://...","tab":"Featured","url":"https://...","category":"Games","priority":1}]}

Include 10-25 entries per store.`}],
      }),
    });
    const d=await r.json();
    const txt=(d.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
    const j=txt.match(/\{[\s\S]*\}/);
    if(j)return JSON.parse(j[0]);
  }catch(e){console.error('AI:',e.message);}
  return null;
}

/* ── Merge ── */
function merge(html,ai){
  if(!ai||!ai.length)return html;
  const result=[...html],seen=new Set(result.map(g=>(g.name||'').toLowerCase().replace(/[\s™:：·]/g,'')));
  for(const a of ai){
    const k=(a.name||'').toLowerCase().replace(/[\s™:：·]/g,'');
    const ex=result.find(g=>(g.name||'').toLowerCase().replace(/[\s™:：·]/g,'')===k);
    if(ex){
      if(a.icon&&!ex.icon)ex.icon=a.icon;
      if(a.genre&&!ex.genre)ex.genre=toGenre(a.genre);
      if(a.rating&&!ex.rating)ex.rating=a.rating;
      if(a.dev&&!ex.dev)ex.dev=a.dev;
      if(a.label&&!ex.section)ex.section=a.label;
      if(a.tab&&!ex.tab)ex.tab=a.tab;
      if(a.url&&!ex.url)ex.url=a.url;
      if(a.category&&!ex.category)ex.category=a.category;
      if(a.priority&&!ex.priority)ex.priority=a.priority;
    }else if(!seen.has(k)){
      seen.add(k);
      result.push({name:a.name,icon:a.icon||'',genre:toGenre(a.genre||''),rating:a.rating||0,section:a.label||'',dev:a.dev||'',tab:a.tab||'',url:a.url||'',category:a.category||'',priority:a.priority||result.length+1});
    }
  }
  return result;
}

/* ── Handler ── */
export default async function handler(req){
  const url=new URL(req.url);
  const country=(url.searchParams.get('country')||'KR').toUpperCase();
  if(!CFG[country])return Response.json({error:'Unknown'},{status:400,headers:{'Access-Control-Allow-Origin':'*'}});
  const u=urls(country);console.log(`[Crawl] ${country}`);

  const [h1,h2,h3]=await Promise.all([grab(u.asToday),grab(u.asGames),grab(u.gpGames)]);
  let asG=parseAS(h1,h2,CFG[country].cc),gpG=parseGP(h3);
  console.log(`[HTML] AS=${asG.length} GP=${gpG.length}`);

  const ai=await aiCrawl(country);
  if(ai){
    asG=merge(asG,ai.as||[]);
    gpG=merge(gpG,ai.gp||[]);
    console.log(`[+AI] AS=${asG.length} GP=${gpG.length}`);
  }

  // genre 정규화
  asG.forEach(g=>{if(g.genre)g.genre=toGenre(g.genre);});
  gpG.forEach(g=>{if(g.genre)g.genre=toGenre(g.genre);});

  // ★ 카테고리 기반 필터: Games만 통과, Apps는 예외만 허용
  asG=asG.filter(g=>isGameEntry(g)||isAppsOk(g.name));
  gpG=gpG.filter(g=>isGameEntry(g)||isAppsOk(g.name));
  console.log(`[Filter] AS=${asG.length} GP=${gpG.length}`);

  // 아이콘 크로스 공유
  const iconMap={};
  asG.forEach(g=>{if(g.icon&&g.name)iconMap[g.name.toLowerCase().replace(/[\s™:：·]/g,'')]=g.icon;});
  gpG.forEach(g=>{if(g.icon&&g.name)iconMap[g.name.toLowerCase().replace(/[\s™:：·]/g,'')]=g.icon;});
  asG.forEach(g=>{if(!g.icon){const k=g.name.toLowerCase().replace(/[\s™:：·]/g,'');if(iconMap[k])g.icon=iconMap[k];}});
  gpG.forEach(g=>{if(!g.icon){const k=g.name.toLowerCase().replace(/[\s™:：·]/g,'');if(iconMap[k])g.icon=iconMap[k];}});

  // 정렬 + rank
  asG.sort((a,b)=>(a.priority||999)-(b.priority||999));
  gpG.sort((a,b)=>(a.priority||999)-(b.priority||999));
  asG=asG.map((g,i)=>({rank:i+1,...g}));
  gpG=gpG.map((g,i)=>({rank:i+1,...g}));

  return Response.json({country,date:new Date().toISOString().slice(0,10),google:gpG,apple:asG,src:u},{
    headers:{'Access-Control-Allow-Origin':'*','Cache-Control':'public, max-age=3600'},
  });
}
