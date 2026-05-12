/* ═══════════════════════════════════════════════════════════
 * Store Featured · Daily Brief
 * Dashboard JavaScript
 * ═══════════════════════════════════════════════════════════ */

/* ═══ CONFIG ═══ */
const GC_HEX = {
  '액션':'#D77A6E','전략':'#0AA0D2','퍼즐':'#A487B3','스포츠':'#5F9789',
  'RPG':'#C18450','캐주얼':'#D8B765','시뮬레이션':'#7BA084','어드벤처':'#B0805A',
  '리듬':'#C57A9E','카드':'#6FA9A9'
};
const CC = {
  KR:{name:'한국',flag:'🇰🇷'}, TW:{name:'대만',flag:'🇹🇼'},
  JP:{name:'일본',flag:'🇯🇵'}, US:{name:'미국',flag:'🇺🇸'},
  TH:{name:'태국',flag:'🇹🇭'}
};
const CS = Object.keys(CC);
const TODAY = () => new Date().toISOString().slice(0, 10);

/* ═══ NEXON 감지 ═══ */
const NX_DEVS = ['nexon','neople','toben studio','embark studios','nat games','mintrocket'];
const nm = (n) => (n || '').replace(/[™:：\s]/g, '').toLowerCase();
function isNX(a) {
  if (!a) return false;
  if (a.nexon === true) return true;
  const d = (a.dev || '').toLowerCase().trim();
  if (d) { for (const nx of NX_DEVS) { if (d.includes(nx)) return true; } }
  if (!d) { const n = (a.name || '').toLowerCase(); if (n.includes('nexon')) return true; }
  return false;
}

/* ═══ STORAGE ═══ */
const sto = (() => {
  function ok() { try { localStorage.setItem('_','1'); localStorage.removeItem('_'); return true; } catch(e) { return false; } }
  if (ok()) return {
    set:(k,v)=>localStorage.setItem(k,v),
    get:(k)=>localStorage.getItem(k),
    del:(k)=>localStorage.removeItem(k),
    keys:(p)=>{const r=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(!p||k.indexOf(p)===0)r.push(k);}return r;}
  };
  const m = {};
  return {
    set:(k,v)=>{m[k]=v;}, get:(k)=>m[k]||null, del:(k)=>{delete m[k];},
    keys:(p)=>Object.keys(m).filter(k=>!p||k.indexOf(p)===0)
  };
})();

/* ═══ STATE ═══ */
const D = {};
CS.forEach(c => { D[c] = { google:[], apple:[] }; });
let curC = 'KR', curS = 'both', curTab = 'dash', tScope = 's';
let curDate = null;        // null = LIVE, 'YYYY-MM-DD' = 아카이브
let dateIndex = null;
let searchQ = '', nxOnly = false;
let bIdx = 0, bTmr = null;
const charts = {};

/* ═══ FILTER (서버에서도 하지만 클라에서도 보수적으로) ═══ */
function cleanList(list) {
  return list.filter(a => {
    if (!a.name || a.name.length < 2 || a.name.length > 40) return false;
    if (/만나보세요|즐겨보세요|확인하세요|경험하세요|대비하세요|챙기세요|플레이하세요/.test(a.name)) return false;
    if (/에서 만나|더욱 뜨거|쟁탈전|사랑받는|써봐야|모두에게|심장아|소문이 돌/.test(a.name)) return false;
    if (/[!！]$/.test(a.name) && a.name.length > 12) return false;
    return true;
  });
}

/* ═══ DATA LOADING ═══ */
const CACHE_VER = 'v4';
const ckey = (cc, date) => `${CACHE_VER}:${date || 'live:' + TODAY()}:${cc}`;

async function loadDateIndex() {
  try {
    const r = await fetch('/api/crawl?index=1');
    if (r.ok) { dateIndex = await r.json(); return; }
  } catch(e) { console.warn('[index] api fail', e.message); }
  try {
    const r = await fetch('https://raw.githubusercontent.com/Hye-dev-1/Store-Featured-Dash/main/data/index.json');
    if (r.ok) { dateIndex = await r.json(); return; }
  } catch(e) {}
  dateIndex = { dates: [], latest: null };
}

async function loadC(cc) {
  const date = curDate;
  const ck = ckey(cc, date);
  const cached = sto.get(ck);
  if (cached) {
    try {
      const d = JSON.parse(cached);
      if ((d.google && d.google.length) || (d.apple && d.apple.length)) { D[cc] = d; return 'cache'; }
    } catch(e) {}
  }
  const qs = date ? `country=${cc}&date=${date}` : `country=${cc}`;
  const paths = [`/api/crawl?${qs}`, `/.netlify/functions/crawl?${qs}`];
  for (const p of paths) {
    try {
      const r = await fetch(p);
      const ct = r.headers.get('content-type') || '';
      if (r.ok && ct.includes('json')) {
        const d = await r.json();
        if (d.error) { console.warn('[API err]', d.error); continue; }
        if (d.google || d.apple) {
          D[cc] = { google: cleanList(d.google || []), apple: cleanList(d.apple || []) };
          sto.set(ck, JSON.stringify(D[cc]));
          if (!date) autoSnap();
          return date ? 'archive' : 'live';
        }
      }
    } catch(e) { console.warn('[API]', cc, p, e.message); }
  }
  if (!date) {
    const sn = sto.keys('snap:').sort().reverse();
    for (const k of sn) {
      try { const s = JSON.parse(sto.get(k)); if (s[cc] && (s[cc].google.length || s[cc].apple.length)) { D[cc] = s[cc]; return 'snap'; } } catch(e) {}
    }
  }
  D[cc] = { google:[], apple:[] };
  return 'empty';
}

function autoSnap() {
  const p = {};
  CS.forEach(c => { p[c] = { google: D[c].google, apple: D[c].apple }; });
  sto.set('snap:' + TODAY(), JSON.stringify(p));
  const k = sto.keys('snap:').sort();
  while (k.length > 30) sto.del(k.shift());
}
function saveSnap() { autoSnap(); ss('live', '💾 스냅샷 저장됨 · ' + TODAY()); }

/* ═══ BOOT ═══ */
async function boot() {
  ss('', '로딩…');
  await loadDateIndex();
  rDatePicker();
  rCountryBar();
  skel();
  const src = await loadC(curC);
  render();
  ssBySrc(src);
  // 백그라운드 로드
  for (const c of CS) { if (c !== curC) await loadC(c); }
  document.getElementById('genTs').textContent = new Date().toLocaleString('ko-KR');
}

function ssBySrc(src) {
  const tag = curDate ? `· ${curDate}` : '· LIVE';
  const cls = src === 'live' ? 'live' : src === 'archive' ? 'archive' : src === 'empty' ? 'err' : '';
  const m = src === 'live' ? `${CC[curC].flag} ${CC[curC].name} ${tag}`
    : src === 'archive' ? `${CC[curC].flag} ${CC[curC].name} ${tag}`
    : src === 'cache' ? `${CC[curC].flag} ${CC[curC].name} · 캐시`
    : src === 'snap' ? `${CC[curC].flag} ${CC[curC].name} · 로컬 스냅`
    : `${CC[curC].flag} ${CC[curC].name} · 데이터 없음`;
  ss(cls, m);
}

function skel() {
  const s = '<div class="skel"></div>'.repeat(5);
  document.getElementById('gpL').innerHTML = s;
  document.getElementById('apL').innerHTML = s;
}
function ss(cls, msg) {
  const chip = document.getElementById('statusChip');
  chip.className = 'status-chip' + (cls ? ' ' + cls : '');
  document.getElementById('stMsg').textContent = msg;
}

/* ═══ DATE PICKER ═══ */
function rDatePicker() {
  const latest = dateIndex?.latest;
  if (!curDate) {
    document.getElementById('dpLabel').textContent = latest || TODAY();
    document.getElementById('dpTodayPill').style.display = '';
  } else {
    document.getElementById('dpLabel').textContent = curDate;
    document.getElementById('dpTodayPill').style.display = 'none';
  }
  rDateDrop();
  rDateNav();
}
function rDateDrop() {
  const drop = document.getElementById('dateDrop');
  const dates = dateIndex?.dates || [];
  let h = `<div class="dh">아카이브 · ${dates.length}일</div>`;
  h += `<button class="dd-item${!curDate ? ' cur' : ''}" onclick="pickDate(null)">
    <span>LIVE · 오늘</span><span class="dd-count">실시간</span></button>`;
  for (const d of dates) {
    const total = Object.values(d.countries).reduce((s, c) => s + (c.apple || 0) + (c.google || 0), 0);
    h += `<button class="dd-item${curDate === d.date ? ' cur' : ''}" onclick="pickDate('${d.date}')">
      <span>${d.date}</span><span class="dd-count">${total}건</span></button>`;
  }
  drop.innerHTML = h;
}
function rDateNav() {
  const dates = dateIndex?.dates || [];
  const prev = document.getElementById('dpPrev');
  const next = document.getElementById('dpNext');
  if (!curDate) {
    prev.disabled = !dates.length;
    next.disabled = true;
    prev.onclick = () => { if (dates[0]) pickDate(dates[0].date); };
    next.onclick = null;
  } else {
    const i = dates.findIndex(d => d.date === curDate);
    prev.disabled = (i < 0 || i >= dates.length - 1);
    next.disabled = false;
    prev.onclick = () => { if (i >= 0 && i < dates.length - 1) pickDate(dates[i + 1].date); };
    next.onclick = () => { if (i > 0) pickDate(dates[i - 1].date); else pickDate(null); };
  }
}
function toggleDateDrop(e) {
  e.stopPropagation();
  document.getElementById('dateDrop').classList.toggle('on');
}
document.addEventListener('click', () => { document.getElementById('dateDrop').classList.remove('on'); });

async function pickDate(d) {
  curDate = d;
  rDatePicker();
  document.getElementById('dateDrop').classList.remove('on');
  ss('', d ? `${d} 로딩…` : 'LIVE 로딩…');
  skel();
  for (const cc of CS) { await loadC(cc); }
  render();
  ss(d ? 'archive' : 'live', d ? `${CC[curC].flag} ${CC[curC].name} · ${d}` : `${CC[curC].flag} ${CC[curC].name} · LIVE`);
  if (curTab === 'trend') rTrend();
}

/* ═══ FILTERS ═══ */
function getFiltered(list) {
  let out = list;
  if (searchQ) { const q = searchQ.toLowerCase(); out = out.filter(a => (a.name || '').toLowerCase().includes(q)); }
  if (nxOnly) out = out.filter(isNX);
  return out;
}
function onSearch() { searchQ = document.getElementById('searchInput').value.trim(); render(); }
function toggleNxOnly(b) {
  nxOnly = !nxOnly;
  b.classList.toggle('on', nxOnly);
  render();
}

/* ═══ HELPERS ═══ */
function bg(g) {
  if (!g) return '';
  const c = GC_HEX[g] || '#888';
  return `<span class="bdg" style="background:${c}22;color:${c};border:1px solid ${c}44">${g}</span>`;
}
function sr(r) { return r && r > 0 ? `<span class="stars">★ ${Number(r).toFixed(1)}</span>` : ''; }
function ic(u) { return u ? `<img class="app-icon" src="${u}" loading="lazy" onerror="this.outerHTML='<div class=icon-ph>◇</div>'">` : '<div class="icon-ph">◇</div>'; }
function tb(t, sec) {
  let h = '';
  if (sec === '배너' || sec === 'Banner') h += '<span class="tb-tag banner">배너</span>';
  if (!t) return h;
  const c = t === 'Today' ? 'today' : t === 'Games' ? 'games' : 'feat';
  h += `<span class="tb-tag ${c}">${t}</span>`;
  return h;
}
function isCm(n, g, a) {
  return g.some(x => nm(x.name) === nm(n)) && a.some(x => nm(x.name) === nm(n));
}
function rCountryBar() {
  const h = CS.map(k =>
    `<button class="${k === curC ? 'active' : ''}" onclick="pickC('${k}')"><span class="flag">${CC[k].flag}</span>${CC[k].name}</button>`
  ).join('');
  document.getElementById('countryBar').innerHTML = h;
  if (document.getElementById('trendCB')) document.getElementById('trendCB').innerHTML = h;
}

/* ═══ NAV ═══ */
async function pickC(c) {
  curC = c;
  rCountryBar();
  skel();
  if (!D[c].apple.length && !D[c].google.length) { await loadC(c); }
  render();
  ss(curDate ? 'archive' : 'live', `${CC[c].flag} ${CC[c].name} ${curDate ? '· ' + curDate : '· LIVE'}`);
  if (curTab === 'trend') rTrend();
}
function setStore(s, b) {
  curS = s;
  document.querySelectorAll('#storeTabs button').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  render();
}
function setMainTab(t, b) {
  curTab = t;
  document.querySelectorAll('#mainTabs button').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  document.getElementById('dashWrap').style.display = t === 'dash' ? '' : 'none';
  document.getElementById('trendWrap').style.display = t === 'trend' ? '' : 'none';
  document.getElementById('logWrap').style.display = t === 'log' ? '' : 'none';
  if (t === 'trend') rTrend();
  if (t === 'log') { rLog(); rNXLog(); }
}
function setTS(s, b) {
  tScope = s;
  document.querySelectorAll('#trendTabs button').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  document.getElementById('tsS').style.display = s === 's' ? '' : 'none';
  document.getElementById('tsA').style.display = s === 'a' ? '' : 'none';
  rTrend();
}

/* ═══ ROW RENDER ═══ */
function rRow(x, g, a) {
  const cm = isCm(x.name, g, a), nx = isNX(x), hasLink = !!x.url;
  const tag = hasLink ? 'a' : 'div';
  const href = hasLink ? ` href="${x.url}" target="_blank"` : '';
  const inGP = g.some(z => nm(z.name) === nm(x.name));
  const inAS = a.some(z => nm(z.name) === nm(x.name));
  let tags = '';
  if (nx) {
    let ft = '';
    if (inGP) ft += '<span class="tag-flag gp-fl" style="right:42px">GP</span>';
    if (inAS) ft += `<span class="tag-flag as-fl" style="right:${inGP ? '70' : '42'}px">AS</span>`;
    tags = `<span class="tag-flag nx-fl">NEXON</span>${ft}`;
  } else if (cm) {
    tags = '<span class="tag-flag cm-fl">양쪽</span>';
  }
  return `<${tag} class="arow${nx ? ' nx' : ''}${cm && !nx ? ' cm' : ''}"${href}>${tags}
    <div class="rk">${x.rank}</div>${ic(x.icon)}
    <div class="ai">
      <div class="an">${x.name}</div>
      <div class="am">${tb(x.tab, x.section)}${bg(x.genre)}${x.dev ? `<span class="dev-lbl">${x.dev}</span>` : ''}${sr(x.rating)}</div>
    </div>${hasLink ? '<span class="link-arrow">↗</span>' : ''}</${tag}>`;
}

/* ═══ LIST RENDER ═══ */
function rList(id, data, g, a) {
  if (!data.length) {
    document.getElementById(id).innerHTML = '<div class="empty-state"><div class="es-icon">∅</div>해당 조건의 피쳐드가 없습니다</div>';
    return;
  }
  const todayBn = data.filter(x => x.tab === 'Today' && (x.banner || x.section === '배너'));
  const today = data.filter(x => x.tab === 'Today' && !x.banner && x.section !== '배너');
  const gamesBn = data.filter(x => x.tab === 'Games' && (x.banner || x.section === '배너'));
  const games = data.filter(x => x.tab === 'Games' && !x.banner && x.section !== '배너');
  const other = data.filter(x => x.tab !== 'Today' && x.tab !== 'Games');
  let h = '', first = true;
  function sec(label, arr) {
    if (!arr.length) return;
    h += `<div class="section-label${first ? ' first' : ''}">${label}<span class="count">${arr.length}</span></div>`;
    first = false;
    arr.forEach(x => { h += rRow(x, g, a); });
  }
  sec('Today · 배너', todayBn);
  sec('Today', today);
  sec('Games · 배너', gamesBn);
  sec('Games', games);
  sec('기타', other);
  document.getElementById(id).innerHTML = h;
}
function rListGP(id, data, g, a) {
  if (!data.length) {
    document.getElementById(id).innerHTML = '<div class="empty-state"><div class="es-icon">∅</div>해당 조건의 피쳐드가 없습니다</div>';
    return;
  }
  const banners = data.filter(x => x.banner || x.section === '배너');
  const rest = data.filter(x => !x.banner && x.section !== '배너');
  let h = '', first = true;
  if (banners.length) {
    h += `<div class="section-label first">히어로 배너<span class="count">${banners.length}</span></div>`;
    banners.forEach(x => { h += rRow(x, g, a); });
    first = false;
  }
  if (rest.length) {
    h += `<div class="section-label${first ? ' first' : ''}">Featured<span class="count">${rest.length}</span></div>`;
    rest.forEach(x => { h += rRow(x, g, a); });
  }
  document.getElementById(id).innerHTML = h;
}

/* ═══ Chart.js 헬퍼 ═══ */
function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

function rGenreChart(canvasId, data) {
  destroyChart(canvasId);
  const counts = {};
  data.forEach(a => { if (a.genre) counts[a.genre] = (counts[a.genre] || 0) + 1; });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const el = document.getElementById(canvasId);
  if (!el) return;
  if (!entries.length) {
    el.parentElement.innerHTML = '<div class="empty-state" style="padding:30px 0;font-size:12px"><div class="es-icon" style="font-size:24px;margin-bottom:6px">∅</div>장르 데이터 없음</div>';
    return;
  }
  charts[canvasId] = new Chart(el, {
    type: 'bar',
    data: {
      labels: entries.map(e => e[0]),
      datasets: [{
        data: entries.map(e => e[1]),
        backgroundColor: entries.map(e => GC_HEX[e[0]] || '#94A3B5'),
        borderRadius: 6, borderSkipped: false,
        barThickness: 18, maxBarThickness: 24
      }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeOutCubic' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0E1218', titleColor: '#F0F2F5', bodyColor: '#B5BBC6',
          borderColor: '#262D3A', borderWidth: 1, padding: 10, cornerRadius: 6,
          titleFont: { family: 'Malgun Gothic, system-ui, sans-serif', weight: '600' },
          bodyFont: { family: 'Consolas, Menlo, monospace' }
        }
      },
      scales: {
        x: {
          grid: { color: '#262D3A', drawTicks: false }, border: { display: false },
          ticks: { color: '#737A87', font: { family: 'Consolas, Menlo, monospace', size: 10 }, stepSize: 1, precision: 0 }
        },
        y: {
          grid: { display: false }, border: { display: false },
          ticks: { color: '#B5BBC6', font: { family: 'Malgun Gothic, system-ui, sans-serif', size: 12, weight: '500' } }
        }
      }
    }
  });
}

function rRatingChart(apps, canvasId) {
  destroyChart(canvasId);
  const buckets = { '3.5↓':0, '3.5-3.9':0, '4.0-4.2':0, '4.3-4.5':0, '4.6+':0 };
  apps.forEach(a => {
    const r = a.rating || 0; if (!r) return;
    if (r < 3.5) buckets['3.5↓']++;
    else if (r < 4) buckets['3.5-3.9']++;
    else if (r < 4.3) buckets['4.0-4.2']++;
    else if (r < 4.6) buckets['4.3-4.5']++;
    else buckets['4.6+']++;
  });
  const el = document.getElementById(canvasId);
  if (!el) return;
  charts[canvasId] = new Chart(el, {
    type: 'bar',
    data: {
      labels: Object.keys(buckets),
      datasets: [{
        data: Object.values(buckets),
        backgroundColor: ['#D77A6E', '#D8B765', '#7BA084', '#0AA0D2', '#0A3255'],
        borderRadius: 6, borderSkipped: false
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 600 },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: '#0E1218', borderColor: '#262D3A', borderWidth: 1, cornerRadius: 6 }
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: '#B5BBC6', font: { family: 'Consolas, Menlo, monospace', size: 11 } } },
        y: { grid: { color: '#262D3A', drawTicks: false }, border: { display: false }, ticks: { color: '#737A87', font: { family: 'Consolas, Menlo, monospace', size: 10 }, precision: 0 } }
      }
    }
  });
}

/* ═══ MAIN RENDER ═══ */
function render() {
  const d = D[curC];
  const dateStr = curDate || dateIndex?.latest || TODAY();
  document.getElementById('dateLbl').textContent = `기준일 · ${dateStr} · ${CC[curC].flag} ${CC[curC].name}`;

  // 아이콘 크로스 공유
  const iconMap = {};
  d.apple.forEach(a => { if (a.icon && a.name) iconMap[nm(a.name)] = a.icon; });
  d.google.forEach(a => { if (a.icon && a.name) iconMap[nm(a.name)] = a.icon; });
  d.apple.forEach(a => { if (!a.icon) { const i = iconMap[nm(a.name)]; if (i) a.icon = i; } });
  d.google.forEach(a => { if (!a.icon) { const i = iconMap[nm(a.name)]; if (i) a.icon = i; } });

  const dG = getFiltered(d.google), dA = getFiltered(d.apple);
  const cm = dG.filter(x => isCm(x.name, dG, dA));
  const all = dG.concat(dA), rated = all.filter(a => a.rating > 0);
  const avg = rated.length ? (rated.reduce((s, a) => s + a.rating, 0) / rated.length).toFixed(1) : '—';
  const nxAll = all.filter(isNX);
  const nxUnique = Object.keys(nxAll.reduce((o, a) => { o[nm(a.name)] = 1; return o; }, {})).length;

  // 서머리 4-up
  document.getElementById('summary').innerHTML = `
    <div class="sc navy"><div class="lbl">Google Play</div><div class="val">${dG.length}<span class="unit">개</span></div><div class="delta">피쳐드 노출</div></div>
    <div class="sc cyan"><div class="lbl">App Store</div><div class="val">${dA.length}<span class="unit">개</span></div><div class="delta">피쳐드 노출</div></div>
    <div class="sc gold"><div class="lbl">공통 앱</div><div class="val">${cm.length}<span class="unit">개</span></div><div class="delta">양쪽 동시 노출</div></div>
    <div class="sc lime"><div class="lbl">NEXON · 평점</div><div class="val">${nxUnique}<span class="unit">개</span> ★${avg}</div><div class="delta">NEXON 노출 · 평균</div></div>`;

  document.getElementById('gpS').textContent = `${CC[curC].name} · ${dG.length}개${searchQ || nxOnly ? ' (필터)' : ''}`;
  document.getElementById('apS').textContent = `${CC[curC].name} · ${dA.length}개${searchQ || nxOnly ? ' (필터)' : ''}`;
  rListGP('gpL', dG, dG, dA);
  rList('apL', dA, dG, dA);
  rGenreChart('gpChart', dG);
  rGenreChart('apChart', dA);

  // 공통 앱
  document.getElementById('cmG').innerHTML = cm.length ? cm.map(a => {
    const nx = isNX(a);
    return `<div class="ccard${nx ? ' nx' : ''}">${a.icon ? `<img class="ci" src="${a.icon}" loading="lazy" onerror="this.style.display='none'">` : '<div class="ci" style="display:flex;align-items:center;justify-content:center;color:var(--ink-4)">◇</div>'}<div style="min-width:0;flex:1"><div class="cn">${a.name}</div><div class="cm-meta">${bg(a.genre)}${sr(a.rating)}</div></div></div>`;
  }).join('') : '<div class="empty-state" style="padding:18px"><div class="es-icon" style="font-size:24px">∅</div>공통 앱 없음</div>';

  document.getElementById('gpP').style.display = (curS === 'both' || curS === 'google') ? '' : 'none';
  document.getElementById('apP').style.display = (curS === 'both' || curS === 'apple') ? '' : 'none';
  document.getElementById('cmSec').style.display = (curS === 'both' && cm.length > 0) ? '' : 'none';
  document.getElementById('mainGrid').className = 'main-grid' + (curS === 'both' ? '' : ' one');

  rBn(dG, dA);
  rNX(dG, dA);
}

/* ═══ 슬림 배너 ═══ */
function rBn(dG, dA) {
  let b = [];
  dA.slice(0, 3).forEach(a => { b.push({ name:a.name, sec:`AS · ${a.tab||''}${a.section?' · '+a.section:''}`, rt:a.rating, ic:a.icon||'' }); });
  dG.slice(0, 3).forEach(a => { b.push({ name:a.name, sec:`GP · ${a.section||'Featured'}`, rt:a.rating, ic:a.icon||'' }); });
  if (!b.length) b = [{ name:'데이터 없음', sec:'', rt:0, ic:'' }];
  bIdx = 0;
  document.getElementById('bSlider').innerHTML = b.map(x =>
    `<div class="slim-slide">${x.ic ? `<img class="s-icon" src="${x.ic}" loading="lazy" onerror="this.style.display='none'">` : ''}<div class="s-info"><div class="s-sec">${x.sec}</div><div class="s-name">${x.name}</div></div>${x.rt > 0 ? `<div class="s-rating">★ ${Number(x.rt).toFixed(1)}</div>` : ''}</div>`
  ).join('');
  document.getElementById('bDots').innerHTML = b.map((_, i) => `<span class="${i === 0 ? 'on' : ''}" onclick="goBn(${i})"></span>`).join('');
  uBn();
  clearInterval(bTmr);
  bTmr = setInterval(() => moveBn(1), 5000);
}
function uBn() {
  document.getElementById('bSlider').style.transform = `translateX(-${bIdx * 100}%)`;
  const dots = document.querySelectorAll('.slim-dots span');
  dots.forEach((d, i) => d.className = i === bIdx ? 'on' : '');
}
function moveBn(dir) {
  const n = document.querySelectorAll('#bSlider .slim-slide').length || 1;
  bIdx = (bIdx + dir + n) % n;
  uBn();
}
function goBn(i) { bIdx = i; uBn(); }

/* ═══ NEXON 섹션 ═══ */
function rNX(dG, dA) {
  const all = dG.concat(dA), nx = all.filter(isNX);
  const uq = {};
  nx.forEach(a => { const k = nm(a.name); if (!uq[k]) uq[k] = Object.assign({}, a, { _gp:false, _as:false }); });
  dG.filter(isNX).forEach(a => { const k = nm(a.name); if (uq[k]) uq[k]._gp = true; });
  dA.filter(isNX).forEach(a => { const k = nm(a.name); if (uq[k]) uq[k]._as = true; });
  const nl = Object.values(uq), nc = nl.length;
  const sec = document.getElementById('nexonSec');
  if (!nc) { sec.style.display = 'none'; return; }
  sec.style.display = '';
  const gpCnt = dG.filter(isNX).length;
  const asCnt = dA.filter(isNX).length;
  const bothCnt = nl.filter(a => a._gp && a._as).length;
  const minRank = Math.min.apply(null, nx.map(a => a.rank));
  const avgRating = (nl.reduce((s, a) => s + (a.rating || 0), 0) / nc).toFixed(1);

  sec.innerHTML = `
    <div class="nexon-hdr">
      <div class="nexon-logo">N</div>
      <div>
        <div class="nexon-hdr-title">NEXON <em>피쳐드 트래커</em></div>
        <div class="nexon-hdr-sub">${CC[curC].flag} ${CC[curC].name} · GP ${gpCnt} · AS ${asCnt}${bothCnt ? ` · 양쪽 ${bothCnt}` : ''}</div>
      </div>
    </div>
    <div class="nexon-stats">
      <div class="nstat"><div class="nlbl">총 피쳐드</div><div class="nval">${nc}</div></div>
      <div class="nstat"><div class="nlbl">양쪽 스토어</div><div class="nval">${bothCnt}</div></div>
      <div class="nstat"><div class="nlbl">최고 순위</div><div class="nval">#${minRank}</div></div>
      <div class="nstat"><div class="nlbl">평균 평점</div><div class="nval">★${avgRating}</div></div>
    </div>
    <div class="nexon-list">${nl.map(a => {
      const hl = !!a.url;
      const tag = hl ? 'a' : 'div';
      const href = hl ? ` href="${a.url}" target="_blank"` : '';
      let ft = '';
      if (a._gp) ft += '<span class="tag-flag gp-fl" style="right:42px">GP</span>';
      if (a._as) ft += `<span class="tag-flag as-fl" style="right:${a._gp ? '70' : '42'}px">AS</span>`;
      return `<${tag} class="arow nx"${href}><span class="tag-flag nx-fl">NEXON</span>${ft}<div class="rk">${a.rank}</div>${ic(a.icon)}<div class="ai"><div class="an">${a.name}</div><div class="am">${tb(a.tab, a.section)}${bg(a.genre)}${a.dev ? `<span class="dev-lbl">${a.dev}</span>` : ''}${sr(a.rating)}</div></div>${hl ? '<span class="link-arrow">↗</span>' : ''}</${tag}>`;
    }).join('')}</div>`;
}

/* ═══ TREND ═══ */
function bGB(gp, as, t) {
  const ag = Object.keys(Object.assign({}, gp, as)).sort((a, b) => (gp[b] || 0) + (as[b] || 0) - (gp[a] || 0) - (as[a] || 0));
  const mx = Math.max(1, ...ag.map(g => Math.max(gp[g] || 0, as[g] || 0)));
  document.getElementById(t).innerHTML = ag.map(g => {
    const gv = gp[g] || 0, av = as[g] || 0, c = GC_HEX[g] || '#94A3B5';
    return `<div style="margin-bottom:12px">
      <div style="font-size:12px;color:${c};font-weight:700;margin-bottom:4px;font-family:var(--font-sans);letter-spacing:-.01em">${g}</div>
      <div class="freq-bar"><div class="freq-lbl" style="color:var(--store);font-size:10px;font-family:var(--font-mono)">Google</div><div class="freq-track"><div class="freq-fill store" style="width:${Math.round(gv/mx*100)}%"><span>${gv}</span></div></div></div>
      <div class="freq-bar"><div class="freq-lbl" style="color:var(--store-soft);font-size:10px;font-family:var(--font-mono)">Apple</div><div class="freq-track"><div class="freq-fill" style="width:${Math.round(av/mx*100)}%;background:var(--store-soft)"><span>${av}</span></div></div></div>
    </div>`;
  }).join('');
}
function bFB(apps, t) {
  const f = {};
  apps.forEach(a => { if (!a.name) return; const k = nm(a.name); if (!f[k]) f[k] = { name:a.name, c:0, nx:isNX(a) }; f[k].c++; });
  const tp = Object.values(f).sort((a, b) => b.c - a.c).slice(0, 12);
  const mx = tp[0] ? tp[0].c : 1;
  document.getElementById(t).innerHTML = tp.map(a =>
    `<div class="freq-bar"><div class="freq-lbl${a.nx?' nx':''}">${a.name}</div><div class="freq-track"><div class="freq-fill${a.nx?' nx':''}" style="width:${Math.round(a.c/mx*100)}%"><span>${a.c}</span></div></div></div>`
  ).join('');
}

function rTrend() {
  if (tScope === 's') {
    const d = D[curC];
    document.getElementById('tsGT').textContent = `${CC[curC].name} 장르 점유율`;
    document.getElementById('tsFT').textContent = `${CC[curC].name} 피쳐드 빈도`;
    const gG = {}, aG = {};
    d.google.forEach(a => { if (a.genre) gG[a.genre] = (gG[a.genre] || 0) + 1; });
    d.apple.forEach(a => { if (a.genre) aG[a.genre] = (aG[a.genre] || 0) + 1; });
    bGB(gG, aG, 'tsGC');
    bFB(d.google.concat(d.apple), 'tsF');
    rRatingChart(d.google.concat(d.apple), 'tsRDChart');
    const gs = new Set(d.google.map(a => nm(a.name)));
    const as = new Set(d.apple.map(a => nm(a.name)));
    const bt = [], go = [], ao = [];
    gs.forEach(n => { if (n) { if (as.has(n)) bt.push(n); else go.push(n); } });
    as.forEach(n => { if (n && !gs.has(n)) ao.push(n); });
    const tot = go.length + bt.length + ao.length || 1;
    document.getElementById('tsV').innerHTML = `
      <div class="split-bar">
        <div class="seg gp" style="width:${Math.round(go.length/tot*100)}%">GP ${go.length}</div>
        <div class="seg cm" style="width:${Math.round(bt.length/tot*100)}%">공통 ${bt.length}</div>
        <div class="seg as" style="width:${Math.round(ao.length/tot*100)}%">AS ${ao.length}</div>
      </div>
      <div class="split-legend"><span class="lgp">Google Play 독점</span><span class="lcm">양쪽 피쳐드</span><span class="las">App Store 독점</span></div>`;
  } else {
    let all = [];
    Object.values(D).forEach(d => { all = all.concat(d.google, d.apple); });
    bFB(all, 'glF');
    const gG = {}, aG = {};
    Object.values(D).forEach(d => {
      d.google.forEach(a => { if (a.genre) gG[a.genre] = (gG[a.genre] || 0) + 1; });
      d.apple.forEach(a => { if (a.genre) aG[a.genre] = (aG[a.genre] || 0) + 1; });
    });
    bGB(gG, aG, 'glGC');
    const ap = {};
    CS.forEach(c => {
      D[c].google.concat(D[c].apple).forEach(a => {
        if (!a.name) return;
        const k = nm(a.name);
        if (!ap[k]) ap[k] = { name:a.name, cs:new Set(), nx:isNX(a) };
        ap[k].cs.add(c);
      });
    });
    const cr = Object.values(ap).filter(a => a.cs.size >= 2).sort((a, b) => b.cs.size - a.cs.size).slice(0, 15);
    document.getElementById('crHM').innerHTML = `
      <div class="heatmap">
        <div class="hm-row"><div class="hm-lbl"></div>${CS.map(c => `<div class="hm-hdr">${CC[c].flag}</div>`).join('')}</div>
        ${cr.length ? cr.map(a =>
          `<div class="hm-row"><div class="hm-lbl${a.nx?' nx':''}">${a.name}</div>${CS.map(c => {
            const h = a.cs.has(c);
            return `<div class="hm-cell" style="background:${h?(a.nx?'var(--lime)':'var(--cyan)'):'var(--bg-3)'};color:${h?'#0E1218':'var(--ink-4)'};opacity:${h?1:.4};font-weight:700">${h?'●':''}</div>`;
          }).join('')}</div>`
        ).join('') : '<div class="empty-state" style="padding:30px"><div class="es-icon">∅</div>크로스 피쳐드 없음</div>'}
      </div>`;
    const gs = [], cg = {};
    all.forEach(a => { if (a.genre && gs.indexOf(a.genre) === -1) gs.push(a.genre); });
    CS.forEach(c => { cg[c] = {}; D[c].google.concat(D[c].apple).forEach(a => { if (a.genre) cg[c][a.genre] = (cg[c][a.genre] || 0) + 1; }); });
    let mx = 1;
    CS.forEach(c => { gs.forEach(g => { if ((cg[c][g] || 0) > mx) mx = cg[c][g]; }); });
    document.getElementById('cgHM').innerHTML = `
      <div class="heatmap" style="overflow-x:auto">
        <div class="hm-row"><div class="hm-lbl"></div>${gs.map(g => `<div class="hm-hdr" style="width:42px">${g.slice(0,3)}</div>`).join('')}</div>
        ${CS.map(c =>
          `<div class="hm-row"><div class="hm-lbl" style="color:var(--ink);font-weight:600">${CC[c].flag} ${CC[c].name}</div>${gs.map(g => {
            const v = cg[c][g] || 0;
            return `<div class="hm-cell" style="width:42px;background:${GC_HEX[g]||'#94A3B5'};opacity:${v?Math.max(.18,v/mx):0};color:#0E1218;font-weight:700">${v||''}</div>`;
          }).join('')}</div>`
        ).join('')}
      </div>`;
  }
}

/* ═══ LOG (로컬 스냅샷 기반) ═══ */
function rNXLog() {
  const body = document.getElementById('nxLogB');
  const snaps = sto.keys('snap:').sort().reverse();
  if (!snaps.length) {
    body.innerHTML = '<div style="font-size:13px;color:var(--lime-dim);padding:8px 0">스냅샷을 저장하면 NEXON 노출 이력이 표시됩니다</div>';
    return;
  }
  const snapData = [];
  for (const k of snaps) { try { snapData.push({ date: k.replace('snap:', ''), data: JSON.parse(sto.get(k)) }); } catch(e) {} }
  const nh = {};
  snapData.forEach(s => {
    CS.forEach(c => {
      if (!s.data[c]) return;
      ['google', 'apple'].forEach(t => {
        (s.data[c][t] || []).forEach(a => {
          if (!isNX(a)) return;
          const k = nm(a.name);
          if (!nh[k]) nh[k] = { name:a.name, countries:new Set(), platforms:new Set(), entries:[] };
          nh[k].countries.add(c); nh[k].platforms.add(t);
          nh[k].entries.push({ date: s.date, rank: a.rank, country: c });
        });
      });
    });
  });
  const games = Object.values(nh).sort((a, b) => b.entries.length - a.entries.length);
  const dates = snapData.map(s => s.date);
  if (!games.length) { body.innerHTML = '<div style="color:var(--lime-dim);font-size:13px">기록 없음</div>'; return; }
  body.innerHTML = `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
    <tr style="border-bottom:1px solid rgba(186,225,20,.2)">
      <th style="text-align:left;padding:10px 8px;color:var(--lime);font-size:13px;font-family:var(--font-sans)">게임명</th>
      ${dates.map(d => `<th style="padding:8px;color:var(--ink-3);min-width:58px;font-family:var(--font-mono);font-size:10.5px;font-weight:600">${d.slice(5)}</th>`).join('')}
    </tr>
    ${games.map(g => {
      const ctags = [...g.countries].map(c => `<span style="display:inline-block;font-size:9px;padding:1px 5px;border-radius:3px;background:var(--bg-3);color:var(--ink-3);margin-left:4px;font-weight:600;font-family:var(--font-mono)">${CC[c].flag}${c}</span>`).join('');
      let ptags = '';
      if (g.platforms.has('google')) ptags += '<span style="display:inline-block;font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(148,163,181,.18);color:var(--store);margin-left:4px;font-weight:700;font-family:var(--font-mono)">GP</span>';
      if (g.platforms.has('apple')) ptags += '<span style="display:inline-block;font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(148,163,181,.18);color:var(--store-soft);margin-left:4px;font-weight:700;font-family:var(--font-mono)">AS</span>';
      return `<tr style="border-bottom:1px solid var(--bg-2)">
        <td style="padding:9px 8px;color:var(--ink);font-weight:600;font-size:13px">${g.name}${ptags}${ctags}</td>
        ${dates.map(d => {
          const de = g.entries.filter(e => e.date === d);
          if (!de.length) return '<td style="text-align:center;color:var(--ink-4);font-family:var(--font-mono)">—</td>';
          const br = Math.min.apply(null, de.map(e => e.rank));
          return `<td style="text-align:center;color:var(--lime);font-weight:700;font-size:13px;font-family:var(--font-mono)">#${br}</td>`;
        }).join('')}
      </tr>`;
    }).join('')}
  </table></div>`;
}

function rLog() {
  const country = document.getElementById('lCSel').value;
  const st = document.getElementById('lSSel').value;
  const body = document.getElementById('logB');
  const snaps = sto.keys('snap:').sort().reverse();
  if (!snaps.length) {
    body.innerHTML = `<div class="log-card" style="text-align:center;padding:48px"><div style="font-size:24px;margin-bottom:14px;color:var(--ink-4);font-family:var(--font-sans)">∅</div><div style="color:var(--ink);font-weight:600;font-size:14px">저장된 스냅샷이 없습니다</div><div style="color:var(--ink-3);font-size:12px;margin-top:6px;font-family:var(--font-mono)">대시보드에서 💾 저장 버튼을 누르세요</div></div>`;
    return;
  }
  const cards = snaps.map(k => {
    try { const s = JSON.parse(sto.get(k)); return { date: k.replace('snap:', ''), list: (s[country] && s[country][st]) || [] }; }
    catch(e) { return { date: k.replace('snap:', ''), list: [] }; }
  });
  const fm = {};
  cards.forEach(c => { c.list.forEach(a => { if (!a.name) return; const k = nm(a.name); if (!fm[k]) fm[k] = { name:a.name, days:0, nx:isNX(a) }; fm[k].days++; }); });
  const fl = Object.values(fm).sort((a, b) => b.days - a.days).slice(0, 8);
  const fmx = fl[0] ? fl[0].days : 1;
  const sn = st === 'google' ? 'Google Play' : 'App Store';
  body.innerHTML = `
    <div class="log-card">
      <div class="log-card-head"><div class="log-card-date">피쳐드 등장 빈도</div><div class="log-card-meta">${cards.length}일 기준</div></div>
      ${fl.map(a => `<div class="freq-bar"><div class="freq-lbl${a.nx?' nx':''}">${a.name}${a.nx?' ◆':''}</div><div class="freq-track"><div class="freq-fill${a.nx?' nx':''}" style="width:${Math.round(a.days/fmx*100)}%"><span>${a.days}일</span></div></div></div>`).join('')}
    </div>
    ${cards.map(c => `
      <div class="log-card">
        <div class="log-card-head">
          <div class="log-card-date">${c.date}</div>
          <div class="log-card-meta">${sn} · ${CC[country].flag} ${CC[country].name}</div>
        </div>
        ${c.list.length ? c.list.slice(0, 10).map(a => {
          const nx = isNX(a), hl = !!a.url;
          const tag = hl ? 'a' : 'div';
          const href = hl ? ` href="${a.url}" target="_blank"` : '';
          return `<${tag} class="arow${nx?' nx':''}"${href}>${nx?'<span class="tag-flag nx-fl">NEXON</span>':''}<div class="rk">${a.rank}</div>${ic(a.icon)}<div class="ai"><div class="an">${a.name}</div><div class="am">${tb(a.tab, a.section)}${bg(a.genre)}${a.dev?`<span class="dev-lbl">${a.dev}</span>`:''}${sr(a.rating)}</div></div>${hl?'<span class="link-arrow">↗</span>':''}</${tag}>`;
        }).join('') : '<div style="color:var(--ink-3);font-size:13px;padding:12px;text-align:center">데이터 없음</div>'}
      </div>
    `).join('')}`;
}

function clrLog() {
  if (!confirm('저장된 모든 스냅샷을 삭제할까요?')) return;
  sto.keys('snap:').forEach(k => sto.del(k));
  rLog(); rNXLog();
}

/* ═══ INIT ═══ */
boot();
