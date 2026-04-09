/**
 * Store GAME Crawler — Netlify Functions (CommonJS)
 * File: netlify/functions/crawl.js
 * GET /.netlify/functions/crawl?country=KR
 */

const CFG = {
  KR:{cc:'kr',hl:'ko',gl:'KR',name:'South Korea',get:'보기'},
  TW:{cc:'tw',hl:'zh-TW',gl:'TW',name:'Taiwan',get:'取得'},
  JP:{cc:'jp',hl:'ja',gl:'JP',name:'Japan',get:'入手'},
  US:{cc:'us',hl:'en',gl:'US',name:'United States',get:'Get'},
  TH:{cc:'th',hl:'th',gl:'TH',name:'Thailand',get:'รับ'},
};

function mkUrl(c){const g=CFG[c];return{
  asToday:'https://apps.apple.com/'+g.cc+'/iphone/today',
  asGames:'https://apps.apple.com/'+g.cc+'/iphone/games',
  gpGames:'https://play.google.com/store/games?device=phone&hl='+g.hl+'&gl='+g.gl,
};}

const GM={
  'action':'액션','role playing':'RPG','role-playing':'RPG','rpg':'RPG','strategy':'전략',
  'puzzle':'퍼즐','casual':'캐주얼','simulation':'시뮬레이션','adventure':'어드벤처',
  'sports':'스포츠','card':'카드','board':'카드','music':'리듬','racing':'액션','arcade':'액션',
  'trivia':'퍼즐','word':'퍼즐','family':'캐주얼','indie':'어드벤처',
  '액션':'액션','롤플레잉':'RPG','전략':'전략','퍼즐':'퍼즐','캐주얼':'캐주얼',
  '시뮬레이션':'시뮬레이션','어드벤처':'어드벤처','스포츠':'스포츠','카드':'카드','보드':'카드',
  '음악':'리듬','레이싱':'액션','아케이드':'액션',
  '실시간 전략':'전략','타워 디펜스':'전략','턴제 전략':'전략',
  '배틀로얄':'액션','슈팅':'액션','격투':'액션','플랫포머':'액션',
  '매치 3':'퍼즐','두뇌 게임':'퍼즐','단어':'퍼즐','퀴즈':'퍼즐',
  '방치형':'캐주얼','클리커':'캐주얼','합성':'캐주얼','하이퍼 캐주얼':'캐주얼',
  '타이쿤':'시뮬레이션','샌드박스':'시뮬레이션','경영':'시뮬레이션',
  '오픈 월드':'어드벤처','탐험':'어드벤처','서바이벌':'어드벤처','생존':'어드벤처',
  '축구':'스포츠','야구':'스포츠','농구':'스포츠','골프':'스포츠',
  '수집형 카드':'카드','TCG':'카드','CCG':'카드','덱 빌딩':'카드',
  '리듬':'리듬','음악 게임':'리듬','댄스':'리듬',
  'アクション':'액션','ロールプレイング':'RPG','ストラテジー':'전략','パズル':'퍼즐',
  'カジュアル':'캐주얼','シミュレーション':'시뮬레이션','アドベンチャー':'어드벤처',
  'スポーツ':'스포츠','カード':'카드','ミュージック':'리듬',
  '動作':'액션','角色扮演':'RPG','策略':'전략','益智':'퍼즐','休閒':'캐주얼',
  '模擬':'시뮬레이션','冒險':'어드벤처','運動':'스포츠','卡牌':'카드',
  'mmorpg':'RPG','action rpg':'RPG','moba':'전략','tower defense':'전략',
  'battle royale':'액션','shooter':'액션','fighting':'액션',
  'match 3':'퍼즐','match-3':'퍼즐','idle':'캐주얼','merge':'캐주얼',
  'tycoon':'시뮬레이션','sandbox':'시뮬레이션','open world':'어드벤처',
  'survival':'어드벤처','tcg':'카드','rhythm':'리듬',
};
function toG(r){if(!r)return '';var l=r.toLowerCase().trim();return GM[l]||GM[l.split(/[\/,&·\-]/)[0].trim()]||r;}

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

var GAME_CATS='games,game,action,rpg,role playing,strategy,puzzle,casual,simulation,adventure,sports,card,board,music,racing,arcade'.split(',');
function isGameCat(e){
  if(!e)return false;
  if(e.category){var c=e.category.toLowerCase();return GAME_CATS.some(function(w){return c.indexOf(w)>=0;});}
  if(e.genre){var g=toG(e.genre);return['액션','RPG','전략','퍼즐','캐주얼','시뮬레이션','어드벤처','스포츠','카드','리듬'].indexOf(g)>=0;}
  return false;
}

// Netlify Functions v1 handler (CommonJS)
exports.handler = async function(event, context) {
  var params = event.queryStringParameters || {};
  var country = (params.country || 'KR').toUpperCase();
  
  if(!CFG[country]){
    return { statusCode:400, headers:{'Access-Control-Allow-Origin':'*','Content-Type':'application/json'}, body:JSON.stringify({error:'Unknown country'}) };
  }

  var key = process.env.ANTHROPIC_API_KEY;
  if(!key){
    return { statusCode:500, headers:{'Access-Control-Allow-Origin':'*','Content-Type':'application/json'}, body:JSON.stringify({error:'No ANTHROPIC_API_KEY','hint':'Add it in Netlify Site settings > Environment variables'}) };
  }

  var c = CFG[country], u = mkUrl(country);
  console.log('[Crawl] ' + country + ' start');

  try {
    var r = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({
        model:'claude-sonnet-4-20250514',
        max_tokens:4096,
        tools:[{type:'web_search_20250305',name:'web_search'}],
        messages:[{role:'user',content:'You are extracting GAME data from app stores for '+c.name+'.\n\nTASK: Visit 3 URLs. For each game found, visit its DETAIL PAGE to get accurate metadata.\n\nURL 1: '+u.asToday+'\nThis is App Store Today tab. It shows editorial cards.\nEach card has: [Big Headline] + [Small App Lockup with icon, app name, "'+c.get+'" button]\nThe BIG HEADLINE is NOT the game name. Example:\n  - Headline: "봄이 왔다는 소문이 돌아요" = IGNORE THIS\n  - App name: "가십하버: 합성 & 스토리 게임" = USE THIS\nSkip non-game cards entirely:\n  - "지금 써봐야 하는 AI 툴" = skip (AI apps)\n  - "모두에게 사랑받는 앱" = skip (general apps)\n  - "심장아 나대지마!" = skip (not a single game)\nOnly extract cards where the lockup app is categorized as "Games" on App Store.\nMark these as tab:"Today"\n\nURL 2: '+u.asGames+'\nApp Store Games tab. ONLY the 1-3 large hero banner cards at top. NOT scrolling lists.\nMark as tab:"Games"\n\nURL 3: '+u.gpGames+'\nGoogle Play Games page. Hero carousel + editorial sections.\nFor each game, visit the detail page and look at the TAGS section.\nGoogle Play shows genre tags like: RPG, 전략, 액션, 퍼즐, 시뮬레이션, 스포츠, 어드벤처, 카드, 캐주얼, 음악\nUse the FIRST genre-related tag (ignore non-genre tags like "싱글 플레이어", "멀티플레이어", "오프라인")\nMark as tab:"Featured"\n\nFOR EACH GAME: Visit its detail page and extract:\n- name: exact official title from the detail page\n- dev: developer name from the detail page\n- genre: the PRIMARY CATEGORY shown on the detail page\n  App Store shows genre like "Action", "Role Playing", "Strategy", "Puzzle", "Sports", "Simulation", "Adventure", "Card", "Board", "Music", "Racing", "Arcade", "Casual"\n  Google Play shows tags like "RPG", "전략", "액션"\n  Convert to Korean: 액션/RPG/전략/퍼즐/캐주얼/시뮬레이션/어드벤처/스포츠/카드/리듬\n  READ THE ACTUAL GENRE FROM THE PAGE. Do not guess.\n- rating: the star rating number (e.g. 4.5) from the detail page\n- icon: the app icon URL from the detail page\n  App Store: https://is1-ssl.mzstatic.com/image/thumb/Purple.../AppIcon.../128x128bb.png\n  Google Play: https://play-lh.googleusercontent.com/...=s128-rw\n- url: full detail page URL\n- category: must be "Games" (skip if not)\n- tab: "Today"/"Games"/"Featured"\n- label: editorial section name from the list page\n- priority: order of appearance (1=first)\n\nOUTPUT: Only valid JSON, no markdown, no explanation.\n{"as":[{"name":"..","dev":"..","genre":"액션","rating":4.5,"icon":"https://..","url":"https://..","category":"Games","tab":"Today","label":"..","priority":1}],"gp":[{"name":"..","dev":"..","genre":"RPG","rating":4.3,"icon":"https://..","url":"https://..","category":"Games","tab":"Featured","label":"..","priority":1}]}\n\nInclude 10-20 games per store. Every field is required.'}],
      }),
    });

    if(!r.ok){
      var err = await r.text();
      console.error('[API Error] ' + r.status + ': ' + err.substring(0,200));
      return { statusCode:502, headers:{'Access-Control-Allow-Origin':'*','Content-Type':'application/json'}, body:JSON.stringify({error:'API '+r.status,detail:err.substring(0,200)}) };
    }

    var d = await r.json();
    var txt = (d.content||[]).filter(function(x){return x.type==='text';}).map(function(x){return x.text;}).join('\n');
    var j = txt.match(/\{[\s\S]*\}/);
    
    if(!j){
      console.error('[Parse] No JSON found');
      return { statusCode:502, headers:{'Access-Control-Allow-Origin':'*','Content-Type':'application/json'}, body:JSON.stringify({error:'No JSON in AI response',preview:txt.substring(0,200)}) };
    }

    var parsed = JSON.parse(j[0]);
    
    // Process results
    var asG = (parsed.as||[]).filter(function(a){return a.name&&!isEditorial(a.name);}).filter(function(a){if(a.category)return a.category.toLowerCase().indexOf('game')>=0;return true;}).map(function(a,i){return{rank:i+1,name:a.name,icon:a.icon||'',genre:toG(a.genre||''),rating:a.rating||0,section:a.label||'',dev:a.dev||'',tab:a.tab||'Today',url:a.url||'',category:a.category||'Games',priority:a.priority||i+1};});

    var gpG = (parsed.gp||[]).filter(function(a){return a.name&&!isEditorial(a.name);}).map(function(a,i){return{rank:i+1,name:a.name,icon:a.icon||'',genre:toG(a.genre||''),rating:a.rating||0,section:a.label||'',dev:a.dev||'',tab:a.tab||'Featured',url:a.url||'',category:a.category||'Games',priority:a.priority||i+1};});

    // Cross-share icons
    var ic={};
    asG.concat(gpG).forEach(function(g){if(g.icon&&g.name)ic[g.name.toLowerCase().replace(/[\s™:：·]/g,'')]=g.icon;});
    asG.concat(gpG).forEach(function(g){if(!g.icon){var k=g.name.toLowerCase().replace(/[\s™:：·]/g,'');if(ic[k])g.icon=ic[k];}});

    // Sort by priority
    asG.sort(function(a,b){return(a.priority||999)-(b.priority||999);});
    gpG.sort(function(a,b){return(a.priority||999)-(b.priority||999);});
    asG = asG.map(function(g,i){g.rank=i+1;return g;});
    gpG = gpG.map(function(g,i){g.rank=i+1;return g;});

    console.log('[Done] AS=' + asG.length + ' GP=' + gpG.length);

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin':'*', 'Content-Type':'application/json', 'Cache-Control':'public, max-age=3600' },
      body: JSON.stringify({ country:country, date:new Date().toISOString().slice(0,10), google:gpG, apple:asG, src:u }),
    };

  } catch(e) {
    console.error('[Fatal] ' + e.message);
    return { statusCode:500, headers:{'Access-Control-Allow-Origin':'*','Content-Type':'application/json'}, body:JSON.stringify({error:e.message}) };
  }
};
