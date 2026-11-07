// Страница «Сейчас»: где планеты, Луна, спутники Юпитера и космические станции
// находятся прямо в эту секунду. Всё считается в браузере по формулам небесной механики,
// для станций — по свежим орбитальным элементам NORAD (модель SGP4).
import { constellation, planetInfo, moon, moonPhaseName, nextMoonPhase, galilean, helio, eclToRaDec, PLANET_IDS, AU } from "./ephem.js";
import { TLE_SNAPSHOT, SATS } from "./data/tle.js";
import { CONTINENTS, pointInPoly } from "./textures.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const nf = (x, d = 0) => x.toLocaleString("ru-RU", { maximumFractionDigits: d, minimumFractionDigits: d });
const DAY = 86400000;
const fmtTime = (d, utc) => d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit", ...(utc ? { timeZone: "UTC" } : {}) });
const fmtDate = (d, o = {}) => d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", ...o });
const fmtDT = (d) => `${d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}, ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
const fmtRA = (h) => { const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return `${hh}ч ${String(mm).padStart(2, "0")}м`; };
const fmtDec = (d) => `${d < 0 ? "−" : "+"}${nf(Math.abs(d), 1)}°`;
const fmtLight = (min) => (min < 60 ? `${nf(min, 1)} мин` : `${Math.floor(min / 60)} ч ${Math.round(min % 60)} мин`);
const fmtLat = (x) => `${nf(Math.abs(x), 2)}° ${x >= 0 ? "с. ш." : "ю. ш."}`;
const fmtLon = (x) => `${nf(Math.abs(x), 2)}° ${x >= 0 ? "в. д." : "з. д."}`;

// ------------------------------------------------------------ часы и «машина времени»
function makeClock() {
  let t = Date.now(), rate = 1, live = true, last = performance.now();
  return {
    tick() { const n = performance.now(), dt = n - last; last = n; if (live) t = Date.now(); else t += dt * rate; },
    get date() { return new Date(t); },
    get live() { return live; }, get rate() { return rate; },
    now() { live = true; rate = 1; t = Date.now(); },
    shift(ms) { if (live) { live = false; rate = 1; } t += ms; },
    set(ms) { live = false; t = ms; },
    setRate(r) { if (r === 1 && live) return; rate = r; if (r !== 1) live = false; },
  };
}

// ------------------------------------------------------------ станции: TLE + SGP4
let SATJS = null;
const recs = {}; let tleInfo = { src: "", epoch: null, stale: false };
async function loadTLE() {
  SATJS ||= await import("./vendor/satellite.es.js");
  let got = null;
  try { got = JSON.parse(sessionStorage.getItem("tle") || "null"); } catch {}
  if (!got) {
    got = {};
    const timeout = (ms) => { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };
    await Promise.all(SATS.map(async (s) => {
      try {
        const r = await fetch(`https://tle.ivanstanojevic.me/api/tle/${s.norad}`, { signal: timeout(6000) });
        const j = await r.json(); if (j.line1 && j.line2) { got[s.norad] = { line1: j.line1, line2: j.line2, src: "NORAD (tle.ivanstanojevic.me)" }; return; }
      } catch {}
      try {
        const r = await fetch(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${s.norad}&FORMAT=tle`, { signal: timeout(6000) });
        const l = (await r.text()).trim().split(/\r?\n/);
        if (l.length >= 3 && l[1].startsWith("1 ")) got[s.norad] = { line1: l[1].trim(), line2: l[2].trim(), src: "NORAD (CelesTrak)" };
      } catch {}
    }));
    if (Object.keys(got).length) try { sessionStorage.setItem("tle", JSON.stringify(got)); } catch {}
  }
  let ep = 0, srcs = new Set(), fallback = false;
  for (const s of SATS) {
    const e = got[s.norad] || (fallback = true, { ...TLE_SNAPSHOT[s.norad], src: "сохранённая копия" });
    recs[s.id] = SATJS.twoline2satrec(e.line1, e.line2);
    srcs.add(e.src);
    ep = Math.max(ep, (recs[s.id].jdsatepoch + (recs[s.id].jdsatepochF || 0) - 2440587.5) * DAY);
  }
  tleInfo = { src: [...srcs].join(", "), epoch: new Date(ep), stale: fallback };
}
function track(id, date) {
  const rec = recs[id]; if (!rec || !SATJS) return null;
  const pv = SATJS.propagate(rec, date);
  if (!pv || !pv.position || pv.position === true) return null;
  const g = SATJS.eciToGeodetic(pv.position, SATJS.gstime(date));
  const v = pv.velocity;
  let lon = SATJS.degreesLong(g.longitude);
  return { lat: SATJS.degreesLat(g.latitude), lon, alt: g.height, speed: Math.hypot(v.x, v.y, v.z), eci: pv.position };
}
// точка на Земле, где Солнце в зените
function sunGeo(date) {
  const E = helio("earth", date), { ra, dec } = eclToRaDec(-E.x, -E.y, -E.z);
  const gmst = SATJS ? (SATJS.gstime(date) * 180) / Math.PI : 280.46061837 + 360.98564736629 * (date.getTime() / DAY + 2440587.5 - 2451545);
  let lon = ra * 15 - gmst; lon = ((lon % 360) + 540) % 360 - 180;
  return { lat: dec, lon };
}
const overLand = (lat, lon) => CONTINENTS.some((p) => pointInPoly(lat, lon, p));
function inShadow(id, date) {
  const g = track(id, date); if (!g) return false;
  const E = helio("earth", date), { ra, dec } = eclToRaDec(-E.x, -E.y, -E.z);
  const a = (ra * 15 * Math.PI) / 180, d = (dec * Math.PI) / 180;
  const s = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)], p = g.eci;
  const dot = p.x * s[0] + p.y * s[1] + p.z * s[2];
  if (dot > 0) return false;
  return Math.hypot(p.x - dot * s[0], p.y - dot * s[1], p.z - dot * s[2]) < 6371;
}

// ------------------------------------------------------------ рисунки
function moonSVG(m, size = 220) {
  const R = size / 2 - 6, c = size / 2, k = m.illum, rx = R * Math.abs(2 * k - 1);
  const lit = `M ${c} ${c - R} A ${R} ${R} 0 0 1 ${c} ${c + R} A ${rx} ${R} 0 0 ${k < 0.5 ? 0 : 1} ${c} ${c - R} Z`;
  const flip = m.waxing ? "" : ` transform="translate(${size} 0) scale(-1 1)"`;
  const mare = [[-0.25, -0.3, 0.22], [0.2, -0.35, 0.16], [0.05, 0.05, 0.2], [-0.35, 0.15, 0.14], [0.3, 0.25, 0.12], [-0.05, 0.45, 0.1]];
  return `<svg viewBox="0 0 ${size} ${size}" class="moon-svg" role="img" aria-label="Луна: ${moonPhaseName(m.age)}, освещено ${Math.round(k * 100)}%">
    <defs><clipPath id="mlit"><path d="${lit}"${flip}/></clipPath><radialGradient id="mg" cx="40%" cy="38%"><stop offset="0" stop-color="#f4f1e8"/><stop offset="1" stop-color="#c9c4b6"/></radialGradient></defs>
    <circle cx="${c}" cy="${c}" r="${R}" fill="#1d2029"/>
    <g clip-path="url(#mlit)"><circle cx="${c}" cy="${c}" r="${R}" fill="url(#mg)"/>${mare.map(([x, y, r]) => `<circle cx="${c + x * R}" cy="${c + y * R}" r="${r * R}" fill="#9c978b" opacity=".45"/>`).join("")}</g>
    <circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="#3a404c"/></svg>`;
}
function moonOrbitSVG(m) {
  const W = 300, H = 200, cx = 175, cy = 100, r = 70;
  const a = ((m.lon - m.lonSun) * Math.PI) / 180; // 0 — Луна между Землёй и Солнцем (Солнце слева)
  const mx = cx - Math.cos(a) * r, my = cy + Math.sin(a) * r;
  return `<svg viewBox="0 0 ${W} ${H}" class="orbit-svg" role="img" aria-label="Где Луна на своей орбите">
    <defs><linearGradient id="sunray" x1="0" x2="1"><stop offset="0" stop-color="#ffb347" stop-opacity=".55"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></linearGradient></defs>
    <rect x="0" y="0" width="90" height="${H}" fill="url(#sunray)"/>
    <text x="10" y="20" class="lbl">← к Солнцу</text>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--lo)" stroke-dasharray="3 4"/>
    <circle cx="${cx}" cy="${cy}" r="13" fill="#2f78c0"/><path d="M ${cx} ${cy - 13} A 13 13 0 0 0 ${cx} ${cy + 13} Z" fill="#7fb4ff"/>
    <text x="${cx}" y="${cy + 30}" text-anchor="middle" class="lbl">Земля</text>
    <circle cx="${mx}" cy="${my}" r="7" fill="#1d2029" stroke="var(--strong)"/><path d="M ${mx} ${my - 7} A 7 7 0 0 0 ${mx} ${my + 7} Z" fill="#e9e6dc"/>
    <text x="${mx}" y="${my - 12}" text-anchor="middle" class="lbl b">Луна</text>
    <path d="M ${cx + r + 14} ${cy - 22} a 30 30 0 0 0 0 44" fill="none" stroke="var(--muted)" marker-end="url(#ar)"/>
    <defs><marker id="ar" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L6 3L0 6z" fill="var(--muted)"/></marker></defs>
  </svg>`;
}
const GAL_COL = { io: "#e8c547", europa: "#c9b79a", ganymede: "#a7a39b", callisto: "#7a6a58" };
function jupiterSVG(date) {
  const W = 860, H = 170, cx = W / 2, cy = 78, s = 15; // пикселей на радиус Юпитера
  const g = galilean(date);
  const moons = g.moons.map((m) => {
    const x = cx + m.X * s, y = cy + m.Y * s;
    const op = m.hidden ? 0.25 : 1;
    return `<g opacity="${op}"><circle cx="${x}" cy="${y}" r="${m.id === "ganymede" ? 4.5 : m.id === "callisto" ? 4.2 : 3.6}" fill="${GAL_COL[m.id]}" stroke="#04060b" stroke-width="${m.behind ? 0 : 1}"/>
      <text x="${x}" y="${cy + 40 + (["io", "ganymede"].includes(m.id) ? 0 : 16)}" text-anchor="middle" class="jl">${m.name}${m.hidden ? " (за диском)" : m.transit ? " (на фоне диска)" : ""}</text>
      <line x1="${x}" x2="${x}" y1="${y + 7}" y2="${cy + 28 + (["io", "ganymede"].includes(m.id) ? 0 : 16)}" stroke="#3a404c"/></g>`;
  });
  const front = g.moons.filter((m) => !m.behind), back = g.moons.filter((m) => m.behind);
  const idx = (m) => g.moons.indexOf(m);
  return `<svg viewBox="0 0 ${W} ${H}" class="jup-svg" role="img" aria-label="Юпитер и галилеевы спутники сейчас">
    <defs><linearGradient id="jb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9a77f"/><stop offset=".3" stop-color="#e8d3b0"/><stop offset=".42" stop-color="#b98a5e"/><stop offset=".55" stop-color="#ead8b8"/><stop offset=".68" stop-color="#b58459"/><stop offset="1" stop-color="#cdb08a"/></linearGradient></defs>
    <text x="16" y="22" class="jl">← восток</text><text x="${W - 16}" y="22" text-anchor="end" class="jl">запад →</text>
    ${back.map((m) => moons[idx(m)]).join("")}
    <ellipse cx="${cx}" cy="${cy}" rx="${s}" ry="${s * 0.935}" fill="url(#jb)"/>
    ${front.map((m) => moons[idx(m)]).join("")}
  </svg>`;
}
function spaghettiSVG(date) {
  const W = 860, H = 300, cx = W / 2, s = 15, days = 6, t0 = date.getTime() - DAY;
  const y = (t) => 18 + ((t - t0) / (days * DAY)) * (H - 36);
  const lines = { io: [], europa: [], ganymede: [], callisto: [] };
  for (let h = 0; h <= days * 24; h += 1) {
    const t = t0 + h * 3600000, gm = galilean(new Date(t));
    gm.moons.forEach((m) => lines[m.id].push(`${(cx + m.X * s).toFixed(1)},${y(t).toFixed(1)}`));
  }
  const ticks = []; for (let d = 0; d <= days; d++) { const t = new Date(t0 + d * DAY); ticks.push(`<line x1="0" x2="${W}" y1="${y(t.getTime())}" y2="${y(t.getTime())}" stroke="var(--faint)"/><text x="6" y="${y(t.getTime()) - 4}" class="jl">${t.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</text>`); }
  return `<svg viewBox="0 0 ${W} ${H}" class="spag-svg" role="img" aria-label="Как спутники Юпитера будут двигаться ближайшие дни">
    ${ticks.join("")}
    <rect x="${cx - s}" y="0" width="${2 * s}" height="${H}" fill="#c9a77f" opacity=".25"/>
    ${Object.entries(lines).map(([id, p]) => `<polyline points="${p.join(" ")}" fill="none" stroke="${GAL_COL[id]}" stroke-width="2"/>`).join("")}
    <line x1="0" x2="${W}" y1="${y(date.getTime())}" y2="${y(date.getTime())}" stroke="var(--blue)" stroke-width="1.5"/><text x="${W - 6}" y="${y(date.getTime()) - 5}" text-anchor="end" class="jl b">сейчас</text>
  </svg>`;
}

// ------------------------------------------------------------ страница
const TABS = [["planets", "Планеты"], ["moon", "Луна"], ["jupiter", "Спутники Юпитера"], ["stations", "МКС и станции"]];
export function mountLive(app, { plate, GL, BY_ID, tab: tab0 = "planets", onFig }) {
  const clock = makeClock();
  let tab = TABS.some(([k]) => k === tab0) ? tab0 : "planets", fig = null, alive = true, raf = 0, panelTick = null, figSeq = 0;
  app.innerHTML = `
  <section class="view live">
    <div class="crumbs"><a href="#/">Главная</a> / Сейчас</div>
    <div class="hero" style="padding-top:18px">
      <div class="eyebrow"><span class="live-dot"></span> В реальном времени · расчёт прямо в браузере</div>
      <h1>Где всё сейчас</h1>
      <p class="lede">Точное положение планет, Луны, спутников Юпитера и космических станций в эту секунду. Можно включить «машину времени» и посмотреть, где они будут завтра, через месяц или были год назад.</p>
    </div>
    <div class="live-bar">
      <div class="clock"><b id="lc-time">--:--:--</b><span id="lc-date"></span><span id="lc-utc" class="mono"></span></div>
      <button class="live-pill" id="lc-pill" title="Вернуться к настоящему моменту"></button>
      <div class="live-ctl">
        <div class="btn-row" id="lc-jump"><button class="btn" data-j="-86400000">−1 сут</button><button class="btn" data-j="-3600000">−1 ч</button><button class="btn" data-j="0">Сейчас</button><button class="btn" data-j="3600000">+1 ч</button><button class="btn" data-j="86400000">+1 сут</button></div>
        <div class="btn-row" id="lc-rate"><span class="lbl">Скорость</span><button class="btn" data-r="1">×1</button><button class="btn" data-r="600">10 мин/с</button><button class="btn" data-r="86400">1 сут/с</button><button class="btn" data-r="864000">10 сут/с</button></div>
        <label class="ctl lc-slider">Машина времени <input type="range" id="lc-day" min="-365" max="365" step="1" value="0"><output id="lc-dayout">сегодня</output></label>
      </div>
    </div>
    <div class="tabs" role="tablist">${TABS.map(([k, l]) => `<button class="chip" role="tab" data-tab="${k}" aria-pressed="${k === tab}">${l}</button>`).join("")}</div>
    <div id="live-panel"></div>
  </section>`;

  // --- часы
  const el = { time: $("#lc-time"), date: $("#lc-date"), utc: $("#lc-utc"), pill: $("#lc-pill"), day: $("#lc-day"), dayout: $("#lc-dayout") };
  let lastSec = -1, sliding = false;
  function paintClock() {
    const d = clock.date, sec = Math.floor(d.getTime() / 1000);
    if (sec === lastSec) return; lastSec = sec;
    el.time.textContent = fmtTime(d);
    el.date.textContent = fmtDate(d, { weekday: "long" });
    el.utc.textContent = `UTC ${fmtTime(d, true)} · ${d.toLocaleDateString("ru-RU", { timeZone: "UTC" })}`;
    const off = (d.getTime() - Date.now()) / DAY;
    el.pill.classList.toggle("off", !clock.live);
    el.pill.innerHTML = clock.live ? '<span class="live-dot"></span> Сейчас' : `⏱ ${off >= 0 ? "+" : "−"}${Math.abs(off) < 1 ? `${nf(Math.abs(off) * 24, 1)} ч` : `${nf(Math.abs(off), Math.abs(off) < 10 ? 1 : 0)} сут`} · вернуть`;
    if (!sliding) { el.day.value = Math.round(off); el.dayout.textContent = Math.abs(off) < 0.5 ? "сегодня" : `${off > 0 ? "+" : "−"}${Math.round(Math.abs(off))} сут`; }
    document.querySelectorAll("#lc-rate .btn").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.r === (clock.live ? 1 : clock.rate))));
    panelTick?.(d);
  }
  el.pill.addEventListener("click", () => clock.now());
  $("#lc-jump").addEventListener("click", (e) => { const b = e.target.closest("[data-j]"); if (!b) return; +b.dataset.j ? clock.shift(+b.dataset.j) : clock.now(); lastSec = -1; });
  $("#lc-rate").addEventListener("click", (e) => { const b = e.target.closest("[data-r]"); if (!b) return; const r = +b.dataset.r; r === 1 && !clock.live ? clock.setRate(1) : clock.setRate(r); lastSec = -1; });
  el.day.addEventListener("input", () => { sliding = true; const v = +el.day.value; clock.set(Date.now() + v * DAY); el.dayout.textContent = v ? `${v > 0 ? "+" : "−"}${Math.abs(v)} сут` : "сегодня"; lastSec = -1; });
  el.day.addEventListener("change", () => (sliding = false));
  const loop = () => { if (!alive) return; clock.tick(); paintClock(); raf = requestAnimationFrame(loop); };
  loop();

  // --- вкладки
  $(".tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]"); if (!b || b.dataset.tab === tab) return;
    tab = b.dataset.tab;
    document.querySelectorAll(".tabs .chip").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    history.replaceState(null, "", `#/live?tab=${tab}`);
    show();
  });
  const now = () => clock.date;

  function show() {
    fig?.dispose(); fig = null; panelTick = null; figSeq++;
    const P = $("#live-panel");
    if (tab === "planets") showPlanets(P);
    else if (tab === "moon") showMoon(P);
    else if (tab === "jupiter") showJupiter(P);
    else showStations(P);
    lastSec = -1;
  }

  // ---------- планеты
  function showPlanets(P) {
    let sel = "earth";
    P.innerHTML = `
      ${plate({ fig: "Fig 8 · сейчас", title: "Планеты на своих местах", hint: '<span class="only-mouse">Тяни — вращать · колесо — масштаб · нажми на имя</span><span class="only-touch">Веди пальцем вбок — вращать · коснись имени</span>', tall: true, halo: false,
        extra: `<div class="controls"><span>Масштаб</span><div class="btn-row" id="lp-scale"><button class="btn" data-v="0" aria-pressed="true">Сжатый</button><button class="btn" data-v="1">Настоящий</button></div>
          <span>Вид</span><div class="btn-row" id="lp-zoom"><button class="btn" data-v="1">Внутренние планеты</button><button class="btn" data-v="0" aria-pressed="true">Вся система</button></div></div>
          <p class="caption"><b>Направления — настоящие</b>: вид сверху, с северной стороны, все планеты бегут против часовой стрелки. В режиме «Сжатый» расстояния уменьшены (иначе Меркурий слился бы с Солнцем, а Нептун улетел бы за экран); «Настоящий» — честный масштаб, где видно, как далеко внешние планеты. Синий пунктир — луч зрения с Земли на выбранную планету.</p>` })}
      <div class="live-card" id="lp-card"></div>
      <h2>Где искать на небе</h2>
      <p class="section-note">Расстояния и видимость пересчитываются каждую секунду. Нажми на строку — планета подсветится на схеме.</p>
      <div class="table-wrap"><table class="cat live-tab"><thead><tr><th>Планета</th><th class="num">От Солнца, а. е.</th><th class="num">От Земли, млн км</th><th class="num">Свет идёт</th><th>Созвездие</th><th>Когда видно</th><th class="num">Прям. восх.</th><th class="num">Склонение</th></tr></thead><tbody></tbody></table></div>`;
    const tb = $("tbody", P), card = $("#lp-card", P);
    function pick(id) { sel = id; fig?.select(id); paint(clock.date, true); }
    tb.addEventListener("click", (e) => { const tr = e.target.closest("tr"); if (tr) pick(tr.dataset.id); });
    let lastPaint = 0;
    function paint(d, force) {
      if (!force && Math.abs(d.getTime() - lastPaint) < 900 && clock.live) return;
      lastPaint = d.getTime();
      const rows = PLANET_IDS.map((id) => ({ id, b: BY_ID[id], i: planetInfo(id, d) }));
      tb.innerHTML = rows.map(({ id, b, i }) => `<tr data-id="${id}" class="${id === sel ? "sel" : ""}"><td class="name"><span class="grp-dot" style="background:${b.orbit.color}"></span>${b.name}</td>
        <td class="num">${nf(i.rSun, 3)}</td><td class="num">${id === "earth" ? "—" : nf(i.distKm / 1e6, 1)}</td><td class="num">${id === "earth" ? "—" : fmtLight(i.lightMin)}</td>
        <td>${id === "earth" ? "—" : i.constellation}</td><td>${id === "earth" ? "мы здесь" : `<span class="vis ${i.elong < 15 ? "no" : ""}">${i.vis}</span>`}</td>
        <td class="num">${id === "earth" ? "—" : fmtRA(i.ra)}</td><td class="num">${id === "earth" ? "—" : fmtDec(i.dec)}</td></tr>`).join("");
      const r = rows.find((x) => x.id === sel), b = r.b, i = r.i;
      card.innerHTML = `<div class="lc-head"><span class="grp-dot" style="background:${b.orbit.color}"></span><b>${b.name}</b><a class="go" href="#/body/${b.id}">3D-разрез →</a></div>
        <div class="lc-grid">
          <div><span class="eyebrow">До Солнца</span><b>${nf(i.rSun * AU / 1e6, 1)} млн км</b><small>${nf(i.rSun, 3)} а. е.</small></div>
          ${sel === "earth" ? `<div><span class="eyebrow">Скорость по орбите</span><b>${nf(29.78 * Math.sqrt(2 / i.rSun - 1 / i.helio.a), 2)} км/с</b><small>≈ ${nf(29.78 * 3600 * Math.sqrt(2 / i.rSun - 1 / i.helio.a), 0)} км/ч</small></div>
             <div><span class="eyebrow">Эклиптическая долгота</span><b>${nf((Math.atan2(i.helio.y, i.helio.x) * 180 / Math.PI + 360) % 360, 1)}°</b><small>от точки весны</small></div>`
          : `<div><span class="eyebrow">До Земли</span><b>${nf(i.distKm / 1e6, 1)} млн км</b><small>${nf(i.dist, 3)} а. е.</small></div>
             <div><span class="eyebrow">Свет от неё к нам</span><b>${fmtLight(i.lightMin)}</b><small>столько летит её свет</small></div>
             <div><span class="eyebrow">Угол от Солнца</span><b>${nf(i.elong, 1)}°</b><small>${esc(i.vis)}</small></div>
             <div><span class="eyebrow">Созвездие</span><b>${i.constellation}</b><small>α ${fmtRA(i.ra)} · δ ${fmtDec(i.dec)}</small></div>`}
        </div>`;
    }
    panelTick = (d) => paint(d);
    paint(clock.date, true);
    if (!GL) return;
    const seq = figSeq;
    import("./live3d.js").then(({ mountLivePlanets }) => {
      if (!alive || seq !== figSeq) return;
      const stage = $(".stage", P);
      const ro = (() => { const el = $("[data-readout]", P); let l = ""; return (d) => { const t = clock.live ? "сейчас · " + fmtTime(d) : fmtDT(d); if (t !== l) el.textContent = l = t; }; })();
      fig = mountLivePlanets({ stage, labelsEl: $(".labels", P), bodies: BY_ID, sun: BY_ID.sun, now, onPick: pick, onReadout: ro });
      onFig?.(fig);
      fig.select(sel);
      $("#lp-scale", P).addEventListener("click", (e) => { const b = e.target.closest(".btn"); if (!b) return; $("#lp-scale", P).querySelectorAll(".btn").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); fig.setReal(b.dataset.v === "1"); });
      $("#lp-zoom", P).addEventListener("click", (e) => { const b = e.target.closest(".btn"); if (!b) return; $("#lp-zoom", P).querySelectorAll(".btn").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); fig.setInner(b.dataset.v === "1"); });
    }).catch((e) => { console.error(e); const l = $(".loading", P); if (l) l.textContent = "Не удалось построить 3D-модель"; });
  }

  // ---------- Луна
  function showMoon(P) {
    P.innerHTML = `
      <div class="plate space moon-plate"><span class="tick a"></span><span class="tick b"></span><span class="tick c"></span><span class="tick d"></span>
        <span class="plate-corner tl">Fig 9 · сейчас</span><span class="plate-corner tr">Луна</span><span class="plate-corner bl">Вид из Северного полушария</span><span class="plate-corner br" data-readout>—</span>
        <div class="moon-wrap"><div id="lm-disk"></div><div id="lm-orbit"></div></div></div>
      <div class="live-card" id="lm-card"></div>
      <h2>Ближайшие фазы</h2><div class="facts" id="lm-next"></div>
      <p class="caption"><b>Почему Луна меняет форму?</b> Солнце всегда освещает ровно половину Луны. Пока Луна облетает Землю (за 29,5 суток), мы видим эту освещённую половину то сбоку, то целиком, то не видим совсем — это и есть фазы. В Южном полушарии (например, в Австралии) Луна выглядит перевёрнутой.</p>`;
    let lastDisk = -1, lastNext = -1e15;
    panelTick = (d) => {
      const m = moon(d), ill = Math.round(m.illum * 1000);
      if (ill !== lastDisk) { lastDisk = ill; $("#lm-disk", P).innerHTML = moonSVG(m); }
      $("#lm-orbit", P).innerHTML = moonOrbitSVG(m);
      $("[data-readout]", P).textContent = clock.live ? "сейчас · " + fmtTime(d) : fmtDT(d);
      $("#lm-card", P).innerHTML = `<div class="lc-head"><b>${moonPhaseName(m.age)}</b><span class="muted">${m.waxing ? "растёт" : "убывает"}</span><a class="go" href="#/body/moon">3D-разрез Луны →</a></div>
        <div class="lc-grid">
          <div><span class="eyebrow">Освещено</span><b>${nf(m.illum * 100, 1)}%</b><small>диска</small></div>
          <div><span class="eyebrow">Возраст</span><b>${nf(m.ageDays, 1)} сут</b><small>после новолуния</small></div>
          <div><span class="eyebrow">До Луны</span><b>${nf(m.distKm, 0)} км</b><small>${m.distKm < 370000 ? "близко — почти перигей" : m.distKm > 400000 ? "далеко — почти апогей" : "среднее расстояние"} · свет летит ${nf(m.distKm / 299792.458, 2)} с</small></div>
          <div><span class="eyebrow">Созвездие</span><b>${esc(constellation(m.lon))}</b><small>α ${fmtRA(m.ra)} · δ ${fmtDec(m.dec)}</small></div>
        </div>`;
      if (Math.abs(d.getTime() - lastNext) > 3600000) {
        lastNext = d.getTime();
        const ph = [[0, "Новолуние", "🌑"], [0.25, "Первая четверть", "🌓"], [0.5, "Полнолуние", "🌕"], [0.75, "Последняя четверть", "🌗"]].map(([t, n, e]) => ({ n, e, at: nextMoonPhase(d, t) })).filter((x) => x.at).sort((a, b) => a.at - b.at);
        $("#lm-next", P).innerHTML = ph.map((x) => `<div class="fact"><span class="eyebrow">${x.e} через ${nf((x.at - d) / DAY, 1)} сут</span><b style="color:var(--strong)">${x.n}</b><br>${fmtDate(x.at, { weekday: "long" })}, ${x.at.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</div>`).join("");
      }
    };
  }

  // ---------- Юпитер
  function showJupiter(P) {
    P.innerHTML = `
      <div class="plate space"><span class="tick a"></span><span class="tick b"></span><span class="tick c"></span><span class="tick d"></span>
        <span class="plate-corner tl">Fig 10 · сейчас</span><span class="plate-corner tr">Юпитер в телескоп</span><span class="plate-corner bl">Север сверху</span><span class="plate-corner br" data-readout>—</span>
        <div class="jup-wrap" id="lj-view"></div></div>
      <div class="live-card" id="lj-card"></div>
      <h2>Танец спутников на неделю</h2>
      <p class="section-note">Каждая линия — один спутник: так он будет «качаться» влево-вправо от Юпитера в ближайшие дни. Где линия пересекает полосу Юпитера — спутник проходит перед диском или прячется за ним.</p>
      <div class="plate spag" id="lj-spag"></div>
      <p class="caption"><b>Это можно увидеть самому!</b> Четыре галилеевых спутника видны даже в обычный бинокль — как цепочка звёздочек рядом с Юпитером. Галилео Галилей заметил их в 1610 году и каждую ночь зарисовывал, как они меняют места. Сравни свой рисунок с этой схемой.</p>`;
    let lastSpag = -1e15;
    panelTick = (d) => {
      $("#lj-view", P).innerHTML = jupiterSVG(d);
      $("[data-readout]", P).textContent = clock.live ? "сейчас · " + fmtTime(d) : fmtDT(d);
      if (Math.abs(d.getTime() - lastSpag) > 1800000) { lastSpag = d.getTime(); $("#lj-spag", P).innerHTML = spaghettiSVG(d); }
      const j = planetInfo("jupiter", d), g = galilean(d);
      $("#lj-card", P).innerHTML = `<div class="lc-head"><b>Юпитер</b><span class="muted">${esc(j.vis)} · ${j.constellation}</span><a class="go" href="#/system/jupiter">Вся система Юпитера →</a></div>
        <div class="lc-grid">${g.moons.map((m) => `<div><span class="eyebrow"><span class="grp-dot" style="background:${GAL_COL[m.id]}"></span>${m.name}</span><b>${nf(Math.abs(m.X), 1)} R<sub>Ю</sub> ${m.X >= 0 ? "к западу" : "к востоку"}</b><small>${m.hidden ? "спрятался за Юпитером" : m.transit ? "проходит по диску" : m.behind ? "за Юпитером, но виден сбоку" : "перед Юпитером"} · <a href="#/moon/${m.id}">разрез →</a></small></div>`).join("")}</div>`;
    };
  }

  // ---------- станции
  function showStations(P) {
    let sel = "iss";
    P.innerHTML = `
      ${plate({ fig: "Fig 11 · сейчас", title: "Станции над Землёй", hint: '<span class="only-mouse">Тяни — вращать · колесо — масштаб</span><span class="only-touch">Веди пальцем вбок — вращать</span>', tall: true, halo: false,
        extra: `<div class="filters" id="ls-pick">${SATS.map((s) => `<button class="chip" data-id="${s.id}" aria-pressed="${s.id === sel}"><i style="background:${s.color}"></i>${s.name}</button>`).join("")}<button class="chip" id="ls-follow" aria-pressed="true">◎ Следить</button></div>
          <p class="caption"><b>Свет — от настоящего Солнца:</b> тёмная сторона Земли — там, где сейчас ночь. Жёлтая точка — место, где Солнце в зените. Яркая линия — куда станция полетит в ближайшие 50 минут, бледная — где она пролетела. <span id="ls-src"></span></p>` })}
      <div class="live-card" id="ls-card"><div class="lc-head"><b>Загружаю свежие орбиты…</b></div></div>`;
    $(".plate", P).classList.add("space");
    const card = $("#ls-card", P);
    let ready = false;
    function pick(id) { sel = id; fig?.select(id); $("#ls-follow", P).setAttribute("aria-pressed", "true"); P.querySelectorAll("#ls-pick [data-id]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.id === id))); panelTick?.(clock.date); }
    $("#ls-pick", P).addEventListener("click", (e) => {
      const b = e.target.closest(".chip"); if (!b) return;
      if (b.id === "ls-follow") { const on = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", String(on)); fig?.setFollow(on); return; }
      pick(b.dataset.id);
    });
    panelTick = (d) => {
      if (!ready) return;
      const s = SATS.find((x) => x.id === sel), g = track(sel, d);
      if (!g) { card.innerHTML = `<div class="lc-head"><b>${s.name}</b><span class="muted">для этой даты орбиту рассчитать нельзя — выбери время ближе к сегодняшнему</span></div>`; return; }
      const land = overLand(g.lat, g.lon), sh = inShadow(sel, d), sg = sunGeo(d);
      const dayHere = Math.sin(g.lat * Math.PI / 180) * Math.sin(sg.lat * Math.PI / 180) + Math.cos(g.lat * Math.PI / 180) * Math.cos(sg.lat * Math.PI / 180) * Math.cos((g.lon - sg.lon) * Math.PI / 180) > 0;
      const age = Math.abs(d - tleInfo.epoch) / DAY;
      card.innerHTML = `<div class="lc-head"><span class="grp-dot" style="background:${s.color}"></span><b>${s.name}</b><span class="muted">${esc(s.desc)}</span><a class="go" href="#/sat/${s.id}">3D-модель →</a></div>
        <div class="lc-grid">
          <div><span class="eyebrow">Широта</span><b>${fmtLat(g.lat)}</b><small>${land ? "над сушей" : "над океаном"}</small></div>
          <div><span class="eyebrow">Долгота</span><b>${fmtLon(g.lon)}</b><small>внизу ${dayHere ? "день ☀" : "ночь ☾"}</small></div>
          <div><span class="eyebrow">Высота</span><b>${nf(g.alt, 0)} км</b><small>над поверхностью</small></div>
          <div><span class="eyebrow">Скорость</span><b>${nf(g.speed, 2)} км/с</b><small>${nf(g.speed * 3600, 0)} км/ч · виток за ${nf((2 * Math.PI) / recs[sel].no, 0)} мин</small></div>
          <div><span class="eyebrow">Солнце</span><b>${sh ? "в тени Земли" : "освещена"}</b><small>${nf(1440 / ((2 * Math.PI) / recs[sel].no), 0)} рассветов в сутки</small></div>
        </div>${age > 14 ? `<p class="caption warn">Для даты, далёкой от свежих данных (на ${nf(age, 0)} сут), положение станции примерное: орбиту меняют торможение в атмосфере и манёвры.</p>` : ""}`;
    };
    loadTLE().then(() => {
      if (!alive || tab !== "stations") return;
      ready = true;
      const src = $("#ls-src", P);
      if (src) src.textContent = `Орбиты: ${tleInfo.src}, данные от ${fmtDT(tleInfo.epoch)}${tleInfo.stale ? " — свежие скачать не удалось, используется сохранённая копия" : ""}.`;
      panelTick(clock.date);
      if (!GL) return;
      const seq = figSeq;
      import("./live3d.js").then(({ mountLiveEarth }) => {
        if (!alive || seq !== figSeq) return;
        const ro = (() => { const el = $("[data-readout]", P); let l = ""; return (d) => { const t = clock.live ? "сейчас · " + fmtTime(d) : fmtDT(d); if (t !== l) el.textContent = l = t; }; })();
        fig = mountLiveEarth({ stage: $(".stage", P), labelsEl: $(".labels", P), earth: BY_ID.earth, sats: SATS, now, track, sunGeo, onPick: pick, onReadout: ro });
        fig.select(sel);
        onFig?.(fig);
      });
    }).catch((e) => { console.error(e); card.innerHTML = `<div class="lc-head"><b>Не удалось рассчитать орбиты</b></div>`; });
  }

  show();
  return {
    dispose() { alive = false; cancelAnimationFrame(raf); fig?.dispose(); fig = null; },
  };
}
