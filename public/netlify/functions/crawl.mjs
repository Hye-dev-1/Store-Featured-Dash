export default async (req) => {
  const url = new URL(req.url);
  const country = (url.searchParams.get("country") || "KR").toUpperCase();
  const H = {"Access-Control-Allow-Origin":"*","Content-Type":"application/json"};

  const CFG = {
    KR:{cc:"kr",hl:"ko",gl:"KR",name:"South Korea",get:"보기"},
    TW:{cc:"tw",hl:"zh-TW",gl:"TW",name:"Taiwan",get:"取得"},
    JP:{cc:"jp",hl:"ja",gl:"JP",name:"Japan",get:"入手"},
    US:{cc:"us",hl:"en",gl:"US",name:"United States",get:"Get"},
    TH:{cc:"th",hl:"th",gl:"TH",name:"Thailand",get:"รับ"}
  };

  if(!CFG[country]) return new Response(JSON.stringify({error:"Unknown country"}),{status:400,headers:H});

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if(!apiKey) return new Response(JSON.stringify({error:"No ANTHROPIC_API_KEY. Set it in Netlify Environment Variables."}),{status:500,headers:H});

  const c = CFG[country];
  const u = {
    asToday:`https://apps.apple.com/${c.cc}/iphone/today`,
    asGames:`https://apps.apple.com/${c.cc}/iphone/games`,
    gpGames:`https://play.google.com/store/games?device=phone&hl=${c.hl}&gl=${c.gl}`
  };

  const GM = {
    "action":"액션","role playing":"RPG","role-playing":"RPG","rpg":"RPG","strategy":"전략",
    "puzzle":"퍼즐","casual":"캐주얼","simulation":"시뮬레이션","adventure":"어드벤처",
    "sports":"스포츠","card":"카드","board":"카드","music":"리듬","racing":"액션","arcade":"액션",
    "trivia":"퍼즐","word":"퍼즐","family":"캐주얼","indie":"어드벤처",
    "롤플레잉":"RPG","전략":"전략","퍼즐":"퍼즐","캐주얼":"캐주얼","액션":"액션",
    "시뮬레이션":"시뮬레이션","어드벤처":"어드벤처","스포츠":"스포츠","카드":"카드","보드":"카드",
    "음악":"리듬","레이싱":"액션","아케이드":"액션","실시간 전략":"전략","타워 디펜스":"전략",
    "배틀로얄":"액션","슈팅":"액션","방치형":"캐주얼","합성":"캐주얼","경영":"시뮬레이션",
    "오픈 월드":"어드벤처","서바이벌":"어드벤처","수집형 카드":"카드",
    "mmorpg":"RPG","action rpg":"RPG","moba":"전략","tower defense":"전략",
    "battle royale":"액션","shooter":"액션","fighting":"액션",
    "match 3":"퍼즐","idle":"캐주얼","merge":"캐주얼",
    "tycoon":"시뮬레이션","sandbox":"시뮬레이션","open world":"어드벤처",
    "survival":"어드벤처","tcg":"카드","rhythm":"리듬"
  };

  const toG = (r) => {
    if(!r) return "";
    const l = r.toLowerCase().trim();
    return GM[l] || GM[l.split(/[\/,&·\-]/)[0].trim()] || r;
  };

  const bad = (s) => {
    if(!s||s.length>40||s.length<2) return true;
    if(/만나보세요|즐겨보세요|확인하세요|경험하세요|대비하세요|챙기세요|플레이하세요/.test(s)) return true;
    if(/에서 만나|더욱 뜨거|쟁탈전|사랑받는|써봐야|모두에게|심장아|소문이 돌/.test(s)) return true;
    if(/[을를이가에서은는].*[요세다네죠습까]$/.test(s)) return true;
    if(/[!！]$/.test(s)&&s.length>12) return true;
    return false;
  };

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01"},
      body:JSON.stringify({
        model:"claude-sonnet-4-6-20250218",
        max_tokens:4096,
        tools:[{type:"web_search_20250305",name:"web_search"}],
        messages:[{role:"user",content:`You are extracting GAME data from app stores for ${c.name}.

Visit these 3 URLs and extract ONLY GAMES (category=Games).

URL 1: ${u.asToday} (App Store Today tab)
Each card has [Big Headline] + [Small App Lockup with icon, app name, "${c.get}" button]
USE the app name from the lockup, NOT the headline.
Example: headline "봄이 왔다는 소문이 돌아요" = IGNORE. App name "가십하버: 합성 & 스토리 게임" = USE.
Skip non-game cards (AI tools, general apps, romance collections).
Only extract cards where the lockup app is categorized as "Games" on App Store.
For developer name, use the EXACT name shown on the detail page (e.g. "NEXON Corporation", "Toben Studio Inc.", "Supercell" etc).
Mark these as tab:"Today"

URL 2: ${u.asGames} (Games tab)
ONLY 1-3 hero banners at top. NOT scrolling lists.
tab:"Games"

URL 3: ${u.gpGames} (Google Play)
Hero carousel + editorial sections.
For genre: use the FIRST genre tag from detail page (ignore "싱글 플레이어" etc).
tab:"Featured"

For EACH game visit its detail page. Get: name, dev, genre (Korean: 액션/RPG/전략/퍼즐/캐주얼/시뮬레이션/어드벤처/스포츠/카드/리듬), rating, icon URL, store URL, category (must be Games).

Output ONLY JSON:
{"as":[{"name":"..","dev":"..","genre":"액션","rating":4.5,"icon":"https://..","url":"https://..","category":"Games","tab":"Today","label":"..","priority":1}],"gp":[{"name":"..","dev":"..","genre":"RPG","rating":4.3,"icon":"https://..","url":"https://..","category":"Games","tab":"Featured","label":"..","priority":1}]}
10-20 games per store. All fields required.`}]
      })
    });

    if(!res.ok){
      const e = await res.text();
      return new Response(JSON.stringify({error:"API "+res.status,detail:e.substring(0,200)}),{status:502,headers:H});
    }

    const data = await res.json();
    let txt = "";
    for(const block of (data.content||[])){
      if(block.type==="text") txt += block.text+"\n";
    }

    const m = txt.match(/\{[\s\S]*\}/);
    if(!m) return new Response(JSON.stringify({error:"No JSON",preview:txt.substring(0,200)}),{status:502,headers:H});

    const p = JSON.parse(m[0]);
    const asG = [], gpG = [];

    for(const a of (p.as||[])){
      if(!a.name||bad(a.name)) continue;
      if(a.category&&!a.category.toLowerCase().includes("game")) continue;
      asG.push({rank:asG.length+1,name:a.name,icon:a.icon||"",genre:toG(a.genre||""),rating:a.rating||0,section:a.label||"",dev:a.dev||"",tab:a.tab||"Today",url:a.url||"",category:"Games",priority:a.priority||asG.length+1});
    }
    for(const a of (p.gp||[])){
      if(!a.name||bad(a.name)) continue;
      gpG.push({rank:gpG.length+1,name:a.name,icon:a.icon||"",genre:toG(a.genre||""),rating:a.rating||0,section:a.label||"",dev:a.dev||"",tab:a.tab||"Featured",url:a.url||"",category:"Games",priority:a.priority||gpG.length+1});
    }

    const ic = {};
    for(const g of [...asG,...gpG]){if(g.icon) ic[g.name.toLowerCase()]=g.icon;}
    for(const g of [...asG,...gpG]){if(!g.icon&&ic[g.name.toLowerCase()]) g.icon=ic[g.name.toLowerCase()];}

    asG.sort((a,b)=>(a.priority||999)-(b.priority||999));
    gpG.sort((a,b)=>(a.priority||999)-(b.priority||999));
    asG.forEach((g,i)=>g.rank=i+1);
    gpG.forEach((g,i)=>g.rank=i+1);

    return new Response(JSON.stringify({country,date:new Date().toISOString().slice(0,10),google:gpG,apple:asG,src:u}),{
      status:200,headers:{...H,"Cache-Control":"public, max-age=3600"}
    });

  }catch(err){
    return new Response(JSON.stringify({error:err.message}),{status:500,headers:H});
  }
};

export const config = { path: "/api/crawl" };
