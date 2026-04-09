exports.handler = async function(event) {
  var params = event.queryStringParameters || {};
  var country = (params.country || "KR").toUpperCase();
  var headers = {"Access-Control-Allow-Origin":"*","Content-Type":"application/json"};

  var CFG = {
    KR:{cc:"kr",hl:"ko",gl:"KR",name:"South Korea",get:"보기"},
    TW:{cc:"tw",hl:"zh-TW",gl:"TW",name:"Taiwan",get:"取得"},
    JP:{cc:"jp",hl:"ja",gl:"JP",name:"Japan",get:"入手"},
    US:{cc:"us",hl:"en",gl:"US",name:"United States",get:"Get"},
    TH:{cc:"th",hl:"th",gl:"TH",name:"Thailand",get:"รับ"}
  };

  if(!CFG[country]) return {statusCode:400,headers:headers,body:JSON.stringify({error:"Unknown country"})};

  var apiKey = process.env.ANTHROPIC_API_KEY;
  if(!apiKey) return {statusCode:500,headers:headers,body:JSON.stringify({error:"No ANTHROPIC_API_KEY"})};

  var c = CFG[country];
  var u = {
    asToday:"https://apps.apple.com/"+c.cc+"/iphone/today",
    asGames:"https://apps.apple.com/"+c.cc+"/iphone/games",
    gpGames:"https://play.google.com/store/games?device=phone&hl="+c.hl+"&gl="+c.gl
  };

  var GM = {
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

  function toG(r){
    if(!r) return "";
    var l = r.toLowerCase().trim();
    if(GM[l]) return GM[l];
    var f = l.split(/[\/,&·\-]/)[0].trim();
    if(GM[f]) return GM[f];
    return r;
  }

  function bad(s){
    if(!s || s.length > 40 || s.length < 2) return true;
    if(/만나보세요|즐겨보세요|확인하세요|경험하세요|대비하세요|챙기세요|플레이하세요/.test(s)) return true;
    if(/에서 만나|더욱 뜨거|쟁탈전|사랑받는|써봐야|모두에게|심장아|소문이 돌/.test(s)) return true;
    if(/[을를이가에서은는].*[요세다네죠습까]$/.test(s)) return true;
    if(/[!！]$/.test(s) && s.length > 12) return true;
    return false;
  }

  var prompt = "You are extracting GAME data from app stores for " + c.name + ".\n\n"
    + "Visit these 3 URLs and extract ONLY GAMES (category=Games).\n\n"
    + "URL 1: " + u.asToday + " (App Store Today tab)\n"
    + "Each card has [Big Headline] + [Small App Lockup with icon, app name, \"" + c.get + "\" button]\n"
    + "USE the app name from the lockup, NOT the headline.\n"
    + "Example: headline \"봄이 왔다는 소문이 돌아요\" = IGNORE. App name \"가십하버: 합성 & 스토리 게임\" = USE.\n"
    + "Skip non-game cards (AI tools, general apps, romance collections).\n"
    + "tab:\"Today\"\n\n"
    + "URL 2: " + u.asGames + " (Games tab)\n"
    + "ONLY 1-3 hero banners at top. NOT scrolling lists.\n"
    + "tab:\"Games\"\n\n"
    + "URL 3: " + u.gpGames + " (Google Play)\n"
    + "Hero carousel + editorial sections.\n"
    + "For genre: use the FIRST tag from the detail page (ignore non-genre tags).\n"
    + "tab:\"Featured\"\n\n"
    + "For EACH game visit its detail page. Get: name, dev, genre (Korean: 액션/RPG/전략/퍼즐/캐주얼/시뮬레이션/어드벤처/스포츠/카드/리듬), rating, icon URL, store URL, category (must be Games).\n\n"
    + "Output ONLY JSON:\n"
    + "{\"as\":[{\"name\":\"..\",\"dev\":\"..\",\"genre\":\"액션\",\"rating\":4.5,\"icon\":\"https://..\",\"url\":\"https://..\",\"category\":\"Games\",\"tab\":\"Today\",\"label\":\"..\",\"priority\":1}],\"gp\":[{\"name\":\"..\",\"dev\":\"..\",\"genre\":\"RPG\",\"rating\":4.3,\"icon\":\"https://..\",\"url\":\"https://..\",\"category\":\"Games\",\"tab\":\"Featured\",\"label\":\"..\",\"priority\":1}]}\n"
    + "10-20 games per store. All fields required.";

  try {
    var res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        tools: [{type:"web_search_20250305",name:"web_search"}],
        messages: [{role:"user",content:prompt}]
      })
    });

    if(!res.ok){
      var e = await res.text();
      return {statusCode:502,headers:headers,body:JSON.stringify({error:"API "+res.status,detail:e.substring(0,200)})};
    }

    var data = await res.json();
    var txt = "";
    for(var i=0;i<(data.content||[]).length;i++){
      if(data.content[i].type==="text") txt += data.content[i].text + "\n";
    }

    var m = txt.match(/\{[\s\S]*\}/);
    if(!m) return {statusCode:502,headers:headers,body:JSON.stringify({error:"No JSON",preview:txt.substring(0,200)})};

    var p = JSON.parse(m[0]);
    var asG = [], gpG = [];

    var asRaw = p.as || [];
    for(var i=0;i<asRaw.length;i++){
      var a = asRaw[i];
      if(!a.name || bad(a.name)) continue;
      if(a.category && a.category.toLowerCase().indexOf("game") < 0) continue;
      asG.push({rank:asG.length+1,name:a.name,icon:a.icon||"",genre:toG(a.genre||""),rating:a.rating||0,section:a.label||"",dev:a.dev||"",tab:a.tab||"Today",url:a.url||"",category:"Games",priority:a.priority||asG.length+1});
    }

    var gpRaw = p.gp || [];
    for(var i=0;i<gpRaw.length;i++){
      var a = gpRaw[i];
      if(!a.name || bad(a.name)) continue;
      gpG.push({rank:gpG.length+1,name:a.name,icon:a.icon||"",genre:toG(a.genre||""),rating:a.rating||0,section:a.label||"",dev:a.dev||"",tab:a.tab||"Featured",url:a.url||"",category:"Games",priority:a.priority||gpG.length+1});
    }

    var ic = {};
    for(var i=0;i<asG.length;i++){if(asG[i].icon)ic[asG[i].name.toLowerCase()]=asG[i].icon;}
    for(var i=0;i<gpG.length;i++){if(gpG[i].icon)ic[gpG[i].name.toLowerCase()]=gpG[i].icon;}
    for(var i=0;i<asG.length;i++){if(!asG[i].icon&&ic[asG[i].name.toLowerCase()])asG[i].icon=ic[asG[i].name.toLowerCase()];}
    for(var i=0;i<gpG.length;i++){if(!gpG[i].icon&&ic[gpG[i].name.toLowerCase()])gpG[i].icon=ic[gpG[i].name.toLowerCase()];}

    asG.sort(function(a,b){return(a.priority||999)-(b.priority||999);});
    gpG.sort(function(a,b){return(a.priority||999)-(b.priority||999);});
    for(var i=0;i<asG.length;i++)asG[i].rank=i+1;
    for(var i=0;i<gpG.length;i++)gpG[i].rank=i+1;

    return {
      statusCode:200,
      headers:{"Access-Control-Allow-Origin":"*","Content-Type":"application/json","Cache-Control":"public, max-age=3600"},
      body:JSON.stringify({country:country,date:new Date().toISOString().slice(0,10),google:gpG,apple:asG,src:u})
    };

  } catch(err) {
    return {statusCode:500,headers:headers,body:JSON.stringify({error:err.message})};
  }
};
