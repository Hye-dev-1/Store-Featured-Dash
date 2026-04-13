import gplayPkg from "google-play-scraper";
const gplay = gplayPkg.default || gplayPkg;

export const handler = async (event) => {
  const country = (event.queryStringParameters?.country || "KR").toUpperCase();
  const H = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

  const CFG = {
    KR: { cc: "kr", hl: "ko", gl: "KR", name: "한국" },
    TW: { cc: "tw", hl: "zh-TW", gl: "TW", name: "대만" },
    JP: { cc: "jp", hl: "ja", gl: "JP", name: "일본" },
    US: { cc: "us", hl: "en", gl: "US", name: "미국" },
    TH: { cc: "th", hl: "th", gl: "TH", name: "태국" }
  };

  if (!CFG[country]) return { statusCode: 400, headers: H, body: JSON.stringify({ error: "Unknown country" }) };

  const c = CFG[country];

  /* ═══ 장르 매핑 ═══ */
  const GM = {
    "action": "액션", "role playing": "RPG", "role-playing": "RPG", "rpg": "RPG", "strategy": "전략",
    "puzzle": "퍼즐", "casual": "캐주얼", "simulation": "시뮬레이션", "adventure": "어드벤처",
    "sports": "스포츠", "card": "카드", "board": "카드", "music": "리듬", "racing": "액션", "arcade": "액션",
    "trivia": "퍼즐", "word": "퍼즐", "family": "캐주얼", "indie": "어드벤처",
    "롤플레잉": "RPG", "전략": "전략", "퍼즐": "퍼즐", "캐주얼": "캐주얼", "액션": "액션",
    "시뮬레이션": "시뮬레이션", "어드벤처": "어드벤처", "스포츠": "스포츠", "카드": "카드", "보드": "카드",
    "음악": "리듬", "레이싱": "액션", "아케이드": "액션", "실시간 전략": "전략", "타워 디펜스": "전략",
    "배틀로얄": "액션", "슈팅": "액션", "방치형": "캐주얼", "합성": "캐주얼", "경영": "시뮬레이션",
    "오픈 월드": "어드벤처", "서바이벌": "어드벤처", "수집형 카드": "카드",
    "mmorpg": "RPG", "action rpg": "RPG", "moba": "전략", "tower defense": "전략",
    "battle royale": "액션", "shooter": "액션", "fighting": "액션",
    "match 3": "퍼즐", "idle": "캐주얼", "merge": "캐주얼",
    "tycoon": "시뮬레이션", "sandbox": "시뮬레이션", "open world": "어드벤처",
    "survival": "어드벤처", "tcg": "카드", "rhythm": "리듬",
    "games": "캐주얼", "entertainment": "캐주얼"
  };

  const toG = (r) => {
    if (!r) return "";
    const l = r.toLowerCase().trim();
    return GM[l] || GM[l.split(/[\/,&·\-]/)[0].trim()] || r;
  };

  const bad = (s) => {
    if (!s || s.length > 40 || s.length < 2) return true;
    if (/만나보세요|즐겨보세요|확인하세요|경험하세요|대비하세요|챙기세요|플레이하세요/.test(s)) return true;
    if (/에서 만나|더욱 뜨거|쟁탈전|사랑받는|써봐야|모두에게|심장아|소문이 돌/.test(s)) return true;
    return false;
  };

  try {
    /* ═══ 1. Apple RSS — Top Free Games ═══ */
    const appleApps = [];
    try {
      const asUrl = `https://rss.applemarketingtools.com/api/v2/${c.cc}/apps/top-free/25/games.json`;
      const asRes = await fetch(asUrl);
      if (asRes.ok) {
        const asData = await asRes.json();
        const results = asData?.feed?.results || [];
        results.forEach((app, i) => {
          if (bad(app.name)) return;
          const genres = (app.genres || []).map(g => g.name || g).filter(Boolean);
          const genre = genres.length ? toG(genres[0]) : "";
          appleApps.push({
            rank: appleApps.length + 1,
            name: app.name || "",
            icon: app.artworkUrl100 || "",
            genre: genre,
            rating: 0,
            section: "Top Free Games",
            dev: app.artistName || "",
            tab: "Today",
            url: app.url || "",
            category: "Games",
            priority: i + 1
          });
        });
      }
    } catch (e) {
      console.warn("[Apple RSS]", e.message);
    }

    /* ═══ 2. Google Play — Top Free Games ═══ */
    const gpApps = [];
    try {
      const gpList = await gplay.list({
        collection: gplay.collection.TOP_FREE,
        category: gplay.category.GAME,
        num: 25,
        country: c.cc,
        lang: c.hl,
        fullDetail: false
      });
      gpList.forEach((app, i) => {
        const name = app.title || "";
        if (bad(name)) return;
        gpApps.push({
          rank: gpApps.length + 1,
          name: name,
          icon: app.icon || "",
          genre: toG(app.genre || ""),
          rating: app.score ? parseFloat(app.score.toFixed(1)) : 0,
          section: "Top Free Games",
          dev: app.developer || "",
          tab: "Featured",
          url: app.url || `https://play.google.com/store/apps/details?id=${app.appId}&hl=${c.hl}&gl=${c.gl}`,
          category: "Games",
          priority: i + 1
        });
      });
    } catch (e) {
      console.warn("[Google Play]", e.message);
    }

    /* ═══ 3. Google Play — Grossing Games (보너스) ═══ */
    try {
      const gpGross = await gplay.list({
        collection: gplay.collection.GROSSING,
        category: gplay.category.GAME,
        num: 15,
        country: c.cc,
        lang: c.hl,
        fullDetail: false
      });
      const existing = new Set(gpApps.map(a => a.name.toLowerCase()));
      gpGross.forEach((app, i) => {
        const name = app.title || "";
        if (bad(name) || existing.has(name.toLowerCase())) return;
        existing.add(name.toLowerCase());
        gpApps.push({
          rank: gpApps.length + 1,
          name: name,
          icon: app.icon || "",
          genre: toG(app.genre || ""),
          rating: app.score ? parseFloat(app.score.toFixed(1)) : 0,
          section: "Top Grossing",
          dev: app.developer || "",
          tab: "Featured",
          url: app.url || `https://play.google.com/store/apps/details?id=${app.appId}&hl=${c.hl}&gl=${c.gl}`,
          category: "Games",
          priority: 100 + i
        });
      });
    } catch (e) {
      console.warn("[Google Play Grossing]", e.message);
    }

    /* ═══ 4. Apple 추가 — Top Paid Games ═══ */
    try {
      const asPaidUrl = `https://rss.applemarketingtools.com/api/v2/${c.cc}/apps/top-paid/15/games.json`;
      const asPaidRes = await fetch(asPaidUrl);
      if (asPaidRes.ok) {
        const asPaidData = await asPaidRes.json();
        const results = asPaidData?.feed?.results || [];
        const existing = new Set(appleApps.map(a => a.name.toLowerCase()));
        results.forEach((app, i) => {
          if (bad(app.name) || existing.has((app.name || "").toLowerCase())) return;
          existing.add(app.name.toLowerCase());
          const genres = (app.genres || []).map(g => g.name || g).filter(Boolean);
          const genre = genres.length ? toG(genres[0]) : "";
          appleApps.push({
            rank: appleApps.length + 1,
            name: app.name || "",
            icon: app.artworkUrl100 || "",
            genre: genre,
            rating: 0,
            section: "Top Paid Games",
            dev: app.artistName || "",
            tab: "Games",
            url: app.url || "",
            category: "Games",
            priority: 100 + i
          });
        });
      }
    } catch (e) {
      console.warn("[Apple Paid RSS]", e.message);
    }

    /* ═══ 아이콘 크로스 공유 ═══ */
    const ic = {};
    for (const g of [...appleApps, ...gpApps]) { if (g.icon) ic[g.name.toLowerCase()] = g.icon; }
    for (const g of [...appleApps, ...gpApps]) { if (!g.icon && ic[g.name.toLowerCase()]) g.icon = ic[g.name.toLowerCase()]; }

    /* ═══ 순위 재정렬 ═══ */
    appleApps.sort((a, b) => (a.priority || 999) - (b.priority || 999));
    gpApps.sort((a, b) => (a.priority || 999) - (b.priority || 999));
    appleApps.forEach((g, i) => g.rank = i + 1);
    gpApps.forEach((g, i) => g.rank = i + 1);

    return {
      statusCode: 200,
      headers: { ...H, "Cache-Control": "public, max-age=3600" },
      body: JSON.stringify({
        country,
        date: new Date().toISOString().slice(0, 10),
        google: gpApps,
        apple: appleApps,
        src: {
          apple: `https://rss.applemarketingtools.com/api/v2/${c.cc}/apps/top-free/25/games.json`,
          google: `https://play.google.com/store/games?hl=${c.hl}&gl=${c.gl}`
        }
      })
    };

  } catch (err) {
    return { statusCode: 500, headers: H, body: JSON.stringify({ error: err.message }) };
  }
};
