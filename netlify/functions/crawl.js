const GITHUB_RAW = "https://raw.githubusercontent.com/Hye-dev-1/Store-Featured-Dash/main/data";

export const handler = async (event) => {
  const gplayPkg = await import("google-play-scraper");
  const gplay = gplayPkg.default || gplayPkg;
  const country = (event.queryStringParameters?.country || "KR").toUpperCase();
  const H = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

  const CFG = {
    KR: { cc: "kr", hl: "ko", gl: "KR" },
    TW: { cc: "tw", hl: "zh-TW", gl: "TW" },
    JP: { cc: "jp", hl: "ja", gl: "JP" },
    US: { cc: "us", hl: "en", gl: "US" },
    TH: { cc: "th", hl: "th", gl: "TH" }
  };

  if (!CFG[country]) return { statusCode: 400, headers: H, body: JSON.stringify({ error: "Unknown country" }) };
  const c = CFG[country];

  /* ═══ 장르 매핑 ═══ */
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
    "survival":"어드벤처","tcg":"카드","rhythm":"리듬",
    "games":"캐주얼","entertainment":"캐주얼"
  };
  const toG = (r) => { if(!r) return ""; const l=r.toLowerCase().trim(); return GM[l]||GM[l.split(/[\/,&·\-]/)[0].trim()]||r; };

  const bad = (s) => {
    if (!s||s.length>40||s.length<2) return true;
    if (/만나보세요|즐겨보세요|확인하세요|경험하세요|대비하세요|챙기세요|플레이하세요/.test(s)) return true;
    if (/에서 만나|더욱 뜨거|쟁탈전|사랑받는|써봐야|모두에게|심장아|소문이 돌/.test(s)) return true;
    return false;
  };

  /* ═══ NEXON 감지 ═══ */
  const NX_DEVS = ["nexon","nexon company","nexon corporation","nexon korea","nexon korea corporation","nexon games","neople","neople inc","toben studio","toben studio inc","nexon gt","embark studios","nat games","mintrocket"];
  const isNexon = (dev) => { if(!dev) return false; const dl=dev.toLowerCase().trim(); return NX_DEVS.some(nx=>dl.includes(nx)); };

  const gpConvert = (app, i, section, priorityBase) => {
    const name = app.title||"";
    if (bad(name)) return null;
    return { rank:0, name, icon:app.icon||"", genre:toG(app.genre||""), rating:app.score?parseFloat(app.score.toFixed(1)):0, section, dev:app.developer||"", tab:"Featured", url:app.url||`https://play.google.com/store/apps/details?id=${app.appId}&hl=${c.hl}&gl=${c.gl}`, category:"Games", priority:priorityBase+i, nexon:isNexon(app.developer) };
  };

  try {
    /* ═══ 1. APPLE: data/*.json에서 피쳐드 데이터 읽기 ═══ */
    let appleApps = [];
    try {
      const res = await fetch(`${GITHUB_RAW}/${country}.json`);
      if (res.ok) {
        const cached = await res.json();
        appleApps = (cached.apple || []).map((a, i) => ({
          ...a,
          rank: i + 1,
          genre: a.genre ? toG(a.genre) : "",
          nexon: a.nexon || isNexon(a.dev)
        }));
        console.log(`[Apple] Loaded ${appleApps.length} from GitHub (${cached.date})`);
      }
    } catch (e) {
      console.warn("[Apple GitHub]", e.message);
    }

    /* Apple 데이터 없으면 RSS 폴백 */
    if (appleApps.length === 0) {
      console.log("[Apple] Trying RSS fallback...");
      try {
        const res = await fetch(`https://rss.applemarketingtools.com/api/v2/${c.cc}/apps/top-free/50/apps.json`);
        if (res.ok) {
          const data = await res.json();
          const GAME_KW = ["games","game","action","adventure","arcade","board","card","casual","puzzle","racing","role playing","simulation","sports","strategy","trivia","word","게임","액션","어드벤처","퍼즐","캐주얼","전략","RPG","시뮬레이션","스포츠","카드","리듬"];
          (data?.feed?.results||[]).forEach((app,i) => {
            if (bad(app.name)) return;
            const genres = (app.genres||[]).map(g=>(g.name||g||"").toLowerCase());
            const isGame = genres.some(g=>GAME_KW.some(k=>g.includes(k)));
            if (!isGame) return;
            const genreNames = (app.genres||[]).map(g=>g.name||g).filter(Boolean);
            appleApps.push({ rank:appleApps.length+1, name:app.name||"", icon:app.artworkUrl100||"", genre:genreNames.length?toG(genreNames[0]):"", rating:0, section:"Top Free Games", dev:app.artistName||"", tab:"Today", url:app.url||"", category:"Games", priority:i+1, nexon:isNexon(app.artistName) });
          });
        }
      } catch (e2) { console.warn("[Apple RSS Fallback]", e2.message); }
    }

    /* ═══ 2. GOOGLE PLAY: scraper ═══ */
    const gpApps = [];
    const [gpRes, gpGrossRes] = await Promise.allSettled([
      gplay.list({ collection:gplay.collection.TOP_FREE, category:gplay.category.GAME, num:30, country:c.cc, lang:c.hl, fullDetail:false }),
      gplay.list({ collection:gplay.collection.GROSSING, category:gplay.category.GAME, num:20, country:c.cc, lang:c.hl, fullDetail:false })
    ]);

    if (gpRes.status==="fulfilled"&&gpRes.value.length>0) {
      gpRes.value.forEach((app,i)=>{ const item=gpConvert(app,i,"Top Free Games",1); if(item) gpApps.push(item); });
    }
    if (gpGrossRes.status==="fulfilled"&&gpGrossRes.value.length>0) {
      const ex=new Set(gpApps.map(a=>a.name.toLowerCase()));
      gpGrossRes.value.forEach((app,i)=>{ const n=(app.title||"").toLowerCase(); if(ex.has(n))return; ex.add(n); const item=gpConvert(app,i,"Top Grossing",100); if(item) gpApps.push(item); });
    }

    /* GP 폴백: search */
    if (gpApps.length===0) {
      const queries=["top mobile games","popular games","best free games"];
      const seen=new Set();
      for(const q of queries){
        try{
          const results=await gplay.search({term:q,num:15,country:c.cc,lang:c.hl,price:"free"});
          results.forEach(app=>{
            if(!app.genre||!app.genre.toLowerCase().includes("game"))return;
            const n=(app.title||"").toLowerCase(); if(seen.has(n))return; seen.add(n);
            const item=gpConvert(app,gpApps.length,"Search",200); if(item) gpApps.push(item);
          });
        }catch(e){console.warn("[GP Search]",q,e.message);}
      }
    }

    /* ═══ 아이콘 크로스 공유 ═══ */
    const ic={};
    for(const g of [...appleApps,...gpApps]){if(g.icon) ic[g.name.toLowerCase()]=g.icon;}
    for(const g of [...appleApps,...gpApps]){if(!g.icon&&ic[g.name.toLowerCase()]) g.icon=ic[g.name.toLowerCase()];}

    /* ═══ 순위 재정렬 ═══ */
    appleApps.sort((a,b)=>(a.priority||999)-(b.priority||999));
    gpApps.sort((a,b)=>(a.priority||999)-(b.priority||999));
    appleApps.forEach((g,i)=>g.rank=i+1);
    gpApps.forEach((g,i)=>g.rank=i+1);

    return {
      statusCode:200,
      headers:{...H,"Cache-Control":"public, max-age=3600"},
      body:JSON.stringify({ country, date:new Date().toISOString().slice(0,10), google:gpApps, apple:appleApps })
    };

  } catch(err) {
    return { statusCode:500, headers:H, body:JSON.stringify({error:err.message}) };
  }
};
