// Маршрутизатор и страницы сайта «Анатомия Солнечной системы».
import { BODIES, BY_ID, PLANETS } from "./data/bodies.js";
import { SYSTEMS, findMoon } from "./data/moons.js";
import { EARTH } from "./data/earth.js";
SYSTEMS.earth = EARTH; // система Земли: Луна и искусственные спутники
const isSat = (m) => m && m.system === "earth" && m.id !== "moon";
const satHref = (m) => (isSat(m) ? `#/sat/${m.id}` : `#/moon/${m.id}`);
// период: минуты / часы / сутки
const fmtPeriod = (d) => d < 2 / 24 ? `${Math.round(d * 1440)} мин` : d < 2 ? `${(d * 24).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ч` : `${d.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} сут`;
const fmtAlt = (m) => m.lag ? `1,5 млн км (${m.lag > 0 ? "L2" : "L1"})` : m.id === "moon" ? "384 400 км" : `${Math.round(m.a - 6371).toLocaleString("ru-RU")} км`;
const SAT_ICON = `<svg viewBox="0 0 26 26" width="26" height="26" aria-hidden="true"><rect x="10" y="9" width="6" height="8" fill="var(--card)" stroke="var(--strong)"/><rect x="1" y="11" width="8" height="4" fill="var(--blue)" opacity=".7"/><rect x="17" y="11" width="8" height="4" fill="var(--blue)" opacity=".7"/><path d="M13 9V5m-2 0h4" stroke="var(--strong)" fill="none"/></svg>`;
import { profileFor } from "./data/generic.js";
import { HISTORY } from "./data/history.js";
import { drawThumb, lazyThumb } from "./thumb.js";
import { hasWebGL } from "./gl.js";

const app = document.getElementById("app");
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let current = null; // активная 3D-фигура
const GL = hasWebGL();
const plural = (n, one, few, many) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many}`;

// ------------------------------------------------------------ тема
const themeBtn = $("#theme");
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("theme", t); } catch {}
  themeBtn.textContent = t === "dark" ? "☀ Светлая" : "☾ Тёмная";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#0b0b0b" : "#f2f2ef");
}
let saved = null; try { saved = localStorage.getItem("theme"); } catch {}
setTheme(saved || "light");
themeBtn.addEventListener("click", () => { setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"); route(true); });
$("#menu").addEventListener("click", () => $(".nav").classList.toggle("open"));

// ------------------------------------------------------------ общий каркас фигуры
function plate({ fig, title, hint, tall = false, extra = "", halo = true }) {
  return `
  <figure class="fig">
    <div class="plate">
      <span class="tick a"></span><span class="tick b"></span><span class="tick c"></span><span class="tick d"></span>
      <span class="plate-corner tl">${fig}</span>
      <span class="plate-corner tr">${title}</span>
      <span class="plate-corner bl">${hint}</span>
      <span class="plate-corner br" data-readout>—</span>
      <div class="stage${tall ? " tall" : ""}">
        ${halo ? '<div class="halo"></div>' : ""}
        <svg class="callouts"></svg>
        <div class="labels"></div>
        ${GL ? '<div class="loading">Собираю модель…</div>' : '<div class="nogl">Ваш браузер не поддерживает WebGL — 3D-модель недоступна, но все данные ниже.</div>'}
      </div>
    </div>
    ${extra}
  </figure>`;
}
const readoutSetter = (root) => { const el = $("[data-readout]", root); let last = ""; return (t) => { if (t !== last) { last = t; el.textContent = t; } }; };

let routeSeq = 0;
async function mountLater(fn) {
  // дать странице отрисоваться, потом строить сцену
  const seq = routeSeq;
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
  if (seq !== routeSeq) return; // пользователь уже ушёл на другую страницу
  try { return await fn(() => seq !== routeSeq); } catch (e) { console.error(e); const l = $(".loading"); if (l) l.textContent = "Не удалось построить 3D-модель"; }
}

// ------------------------------------------------------------ ГЛАВНАЯ
function viewHome() {
  const sun = BY_ID.sun;
  app.innerHTML = `
  <section class="view">
    <div class="hero">
      <div class="eyebrow">Интерактивный атлас · 3D · для детей и взрослых</div>
      <h1>Анатомия Солнечной системы</h1>
      <p class="lede">Разбери каждую планету и спутник как механизм: вырежи клин, «разбери» по слоям и узнай, из чего они сделаны. Отдельно — все спутники Юпитера и Сатурна в 3D, с характеристиками и историей открытий.</p>
    </div>
    ${plate({ fig: "Fig 1", title: "Солнечная система", hint: '<span class="only-mouse">Тяни — вращать · колесо — масштаб · нажми на планету</span><span class="only-touch">Веди пальцем вбок — вращать · коснись планеты</span>', tall: true, halo: false,
      extra: `<div class="controls"><span>Скорость времени</span><div class="btn-row" id="spd">
        <button class="btn" data-s="2">2 сут/с</button><button class="btn" data-s="20" aria-pressed="true">20 сут/с</button><button class="btn" data-s="120">120 сут/с</button><button class="btn" data-s="0">Пауза</button></div></div>
      <p class="caption"><b>Масштаб условный.</b> Если бы расстояния были настоящими, Нептун оказался бы в 77 раз дальше Меркурия, а планеты — меньше пикселя. Поэтому радиусы орбит сжаты корнем, а размеры планет — логарифмом. Скорости движения настоящие: за время, пока Меркурий делает 684 оборота, Нептун проходит один.</p>` })}

    <h2>Планеты и Солнце</h2>
    <p class="section-note">Нажми на карточку, чтобы открыть 3D-разрез: слои, характеристики, история и вопросы.</p>
    <div class="grid" id="planets"></div>

    <h2>Спутники планет</h2>
    <p class="section-note">У Земли одна Луна и тысячи искусственных спутников. У Юпитера ${SYSTEMS.jupiter.total} известных спутников, у Сатурна — ${SYSTEMS.saturn.total}. Каждый с именем разобран отдельно.</p>
    <div class="grid" id="systems"></div>

    <h2>Как читать фигуры</h2>
    <div class="facts">
      <div class="fact"><span class="eyebrow">01 · Разрез</span>Ползунок «Разрез» вырезает клин, чтобы заглянуть внутрь. Слои показаны в порядке от центра.</div>
      <div class="fact"><span class="eyebrow">02 · Разбор</span>«Разобрать» раздвигает слои ступеньками: внешние срезаются сильнее — так видно каждый слой отдельно.</div>
      <div class="fact"><span class="eyebrow">03 · Выноски</span>Наведи на слой или подпись — в правом нижнем углу появятся глубина и описание. Клавиши ← → переключают слои, ↑ ↓ меняют разрез.</div>
      <div class="fact"><span class="eyebrow">04 · Толщина</span>Тонкие слои (кора, облака) нарисованы чуть толще, чтобы их было видно. Настоящие глубины — в подписях и списке.</div>
    </div>
  </section>`;
  const g = $("#planets");
  [BY_ID.sun, ...PLANETS, BY_ID.moon].forEach((b, i) => g.append(cardFor(b, i)));
  const sg = $("#systems");
  {
    const a = document.createElement("a");
    a.className = "card"; a.href = "#/system/earth";
    a.innerHTML = `<span class="num">Луна + ≈12 000 аппаратов</span><canvas class="thumb"></canvas><h3>Система Земли</h3><p>МКС, Хаббл, GPS, Starlink, геостационар, «Джеймс Уэбб» — орбиты в 3D и модели аппаратов</p>`;
    sg.append(a);
    lazyThumb($("canvas", a), BY_ID.earth, { size: 120 });
  }
  [["jupiter", "Система Юпитера"], ["saturn", "Система Сатурна"]].forEach(([id, t]) => {
    const s = SYSTEMS[id];
    const a = document.createElement("a");
    a.className = "card"; a.href = `#/system/${id}`;
    a.innerHTML = `<span class="num">${s.named} с именами · ${s.total} всего</span><canvas class="thumb"></canvas><h3>${t}</h3><p>${Object.keys(s.groups).length} семейств спутников, орбиты в 3D</p>`;
    sg.append(a);
    lazyThumb($("canvas", a), BY_ID[id], { size: 120 });
  });
  const hist = document.createElement("a");
  hist.className = "card"; hist.href = "#/history";
  hist.innerHTML = `<span class="num">${HISTORY.length} событий</span><div style="height:120px;margin:6px 0 10px;display:grid;place-items:center;font:600 34px var(--mono);color:var(--strong)">1610→</div><h3>История открытий</h3><p>От Галилея до JUICE и Europa Clipper</p>`;
  sg.append(hist);

  if (!GL) return;
  mountLater(async (stale) => {
    const { mountOrrery } = await import("./orrery.js");
    if (stale()) return;
    const stage = $(".stage");
    current = mountOrrery({ stage, labelsEl: $(".labels", stage), planets: PLANETS, sun, onReadout: readoutSetter(app), onPick: (id) => (location.hash = `#/body/${id}`) });
    $("#spd").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      $("#spd").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      current.setSpeed(+b.dataset.s);
    });
  });
}

function cardFor(b, i) {
  const a = document.createElement("a");
  a.className = "card"; a.href = `#/body/${b.id}`;
  const r = b.radius >= 10000 ? Math.round(b.radius).toLocaleString("ru-RU") : b.radius.toLocaleString("ru-RU");
  a.innerHTML = `<span class="num">${String(i).padStart(2, "0")} · ${b.type === "star" ? "звезда" : b.type === "moon" ? "спутник" : "планета"}</span>
    <canvas class="thumb"></canvas><h3>${b.name}</h3><p>${esc(b.tagline)}</p>
    <div class="meta"><span>R ${r} км</span><span>${plural(b.layers.length, "слой", "слоя", "слоёв")}</span></div>`;
  lazyThumb($("canvas", a), b, { size: 120 });
  return a;
}

// ------------------------------------------------------------ СТРАНИЦА ТЕЛА
function bodyPage(b, { fig, crumbs, prev, next, moonRow }) {
  const fmtR = (x) => x >= 1000 ? Math.round(x).toLocaleString("ru-RU") : x.toLocaleString("ru-RU");
  const parent = b.parent ? BY_ID[b.parent] : null;
  app.innerHTML = `
  <section class="view">
    <div class="crumbs">${crumbs}</div>
    <div class="hero" style="padding-top:18px">
      <div class="eyebrow">${b.type === "star" ? "Звезда" : b.type === "planet" ? `Планета № ${b.order}` : `Спутник · ${parent ? parent.name : ""}`} · ${esc(b.latin || "")}</div>
      <h1>${b.name}</h1>
      <p class="lede">${esc(b.tagline)}</p>
    </div>
    ${plate({ fig, title: `${b.name} · разрез`, hint: '<span class="only-mouse">Тяни — вращать · наведи на слой · ← → слои</span><span class="only-touch">Веди пальцем вбок — вращать · коснись слоя</span>',
      extra: `<div class="controls">
        <label class="ctl">Разрез <input type="range" id="cut" min="0" max="180" value="90"><output id="cutv">90°</output></label>
        <label class="ctl">Разобрать <input type="range" id="exp" min="0" max="100" value="0"><output id="expv">0%</output></label>
        <div class="btn-row"><button class="btn" id="apart">Разобрать на слои</button><button class="btn" id="whole">Целиком</button></div>
      </div>
      <div class="legend" id="legend">${b.layers.map((l, i) => `<span data-i="${i}"><i style="background:${l.color}"></i>${String(i + 1).padStart(2, "0")} ${esc(l.name)}</span>`).join("")}</div>
      <p class="caption"><b>Как читать.</b> Слои пронумерованы от центра. Толщина тонких слоёв увеличена для наглядности; настоящие глубины — в списке ниже. ${b.generic ? "Строение такого маленького спутника напрямую не измерено — это модель по его плотности и типу." : "Строение недр — модели, построенные по гравитации, магнитным полям, сейсмике и составу; миссии их уточняют."}</p>` })}

    <div class="stats">${b.stats.map(([k, v, u]) => `<div class="stat"><div class="k">${esc(k)}</div><div class="v">${esc(v)} <small>${esc(u)}</small></div></div>`).join("")}</div>

    <div class="two-col">
      <div>
        <h2>Из чего состоит</h2>
        <ol class="layers-list" id="layers">${b.layers.map((l, i) => `
          <li data-i="${i}"><span class="n">${String(i + 1).padStart(2, "0")}</span><span class="sw" style="background:${l.color}"></span>
          <div><b>${esc(l.name)}</b><span class="d">${l.gas ? `0–${fmtR(l.to - b.radius)} км над поверхностью` : `радиус ${fmtR(l.from)}–${fmtR(l.to)} км · толщина ${fmtR(l.to - l.from)} км`}</span><p>${esc(l.desc)}</p></div></li>`).join("")}
        </ol>
      </div>
      <div>
        <h2>Коротко</h2>
        ${b.about.map((p) => `<p>${esc(p)}</p>`).join("")}
        ${sizeCompare(b)}
      </div>
    </div>

    <h2>История</h2>
    <ul class="timeline">${b.history.map(([y, t]) => `<li><span class="yr">${esc(y)}</span><div><p>${esc(t)}</p></div></li>`).join("")}</ul>

    ${b.facts?.length ? `<h2>Знаешь ли ты?</h2><div class="facts">${b.facts.map((f, i) => `<div class="fact"><span class="eyebrow">Факт ${i + 1}</span>${esc(f)}</div>`).join("")}</div>` : ""}
    ${b.quiz ? quizHTML(b.quiz) : ""}
    ${moonRow || ""}
    <nav class="pager">${prev ? `<a href="${prev.href}"><span class="eyebrow">← Назад</span><b>${esc(prev.name)}</b></a>` : "<span></span>"}${next ? `<a class="next" href="${next.href}"><span class="eyebrow">Дальше →</span><b>${esc(next.name)}</b></a>` : "<span></span>"}</nav>
  </section>`;

  wireQuiz();
  const list = $("#layers");
  const setReadout = readoutSetter(app);
  if (!GL) return;
  mountLater(async (stale) => {
    const { mountAnatomy } = await import("./anatomy3d.js");
    if (stale()) return;
    const stage = $(".stage");
    const fig = mountAnatomy({
      stage, svg: $("svg.callouts", stage), labelsEl: $(".labels", stage), body: b,
      onReadout: setReadout,
      onLayer: (i) => {
        list.querySelectorAll("li").forEach((li) => li.classList.toggle("on", +li.dataset.i === i));
        document.querySelectorAll("#legend span").forEach((x) => x.classList.toggle("on", +x.dataset.i === i));
      },
    });
    current = fig;
    const cut = $("#cut"), exp = $("#exp");
    cut.addEventListener("input", () => { fig.setCut(+cut.value); $("#cutv").textContent = cut.value + "°"; });
    exp.addEventListener("input", () => { fig.setExplode(+exp.value / 100); $("#expv").textContent = exp.value + "%"; });
    $("#apart").addEventListener("click", () => { cut.value = 90; exp.value = 100; cut.dispatchEvent(new Event("input")); exp.dispatchEvent(new Event("input")); });
    $("#whole").addEventListener("click", () => { cut.value = 0; exp.value = 0; cut.dispatchEvent(new Event("input")); exp.dispatchEvent(new Event("input")); });
    list.addEventListener("mouseover", (e) => { const li = e.target.closest("li"); if (li) fig.hover(+li.dataset.i); });
    list.addEventListener("mouseleave", () => fig.hover(-1));
    $("#legend").addEventListener("click", (e) => { const sp = e.target.closest("span[data-i]"); if (sp) fig.pin(+sp.dataset.i); });
    list.addEventListener("click", (e) => { const li = e.target.closest("li"); if (li) { fig.pin(+li.dataset.i); $(".plate").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" }); } });
  });
}

function sizeCompare(b) {
  const earth = BY_ID.earth;
  const ref = b.radius > 30000 ? earth : b.radius > 3000 ? BY_ID.moon : b.radius > 300 ? BY_ID.moon : null;
  const other = ref || { name: "Москва (≈40 км)", radius: 20, color: "#8a8a8f" };
  if (b.id === "earth") return sizeCompareSVG(b, BY_ID.moon);
  if (b.id === "sun") return sizeCompareSVG(b, BY_ID.jupiter);
  return sizeCompareSVG(b, other);
}
function sizeCompareSVG(a, c) {
  const W = 420, H = 170, max = Math.max(a.radius, c.radius);
  const ra = Math.max(1.5, (a.radius / max) * 70), rc = Math.max(1.5, (c.radius / max) * 70);
  const ratio = a.radius / c.radius;
  const txt = ratio >= 1 ? `${a.name} больше в ${ratio.toLocaleString("ru-RU", { maximumFractionDigits: ratio > 10 ? 0 : 1 })} раз` : `${a.name} меньше в ${(1 / ratio).toLocaleString("ru-RU", { maximumFractionDigits: 1 / ratio > 10 ? 0 : 1 })} раз`;
  return `<div class="size-cmp" style="margin-top:18px"><div class="eyebrow">Сравнение размеров</div>
  <svg viewBox="0 0 ${W} ${H}">
    <line x1="10" y1="${H - 24}" x2="${W - 10}" y2="${H - 24}" stroke="var(--lo)" stroke-width="1"/>
    ${Array.from({ length: 21 }, (_, i) => `<line x1="${10 + i * 20}" y1="${H - 24}" x2="${10 + i * 20}" y2="${H - 24 + (i % 5 ? 3 : 6)}" stroke="var(--lo)"/>`).join("")}
    <circle cx="${120}" cy="${H - 24 - ra}" r="${ra}" fill="${a.layers[a.layers.filter((l) => !l.gas).length - 1].color}" stroke="var(--hi)" stroke-width=".8"/>
    <circle cx="${300}" cy="${H - 24 - rc}" r="${rc}" fill="${c.layers ? c.layers[c.layers.filter((l) => !l.gas).length - 1].color : c.color}" stroke="var(--hi)" stroke-width=".8"/>
    <text x="120" y="${H - 6}" text-anchor="middle" class="lbl">${esc(a.name)}</text>
    <text x="300" y="${H - 6}" text-anchor="middle" class="lbl">${esc(c.name)}</text>
    <text x="${W - 10}" y="14" text-anchor="end">${esc(txt)}</text>
  </svg></div>`;
}

function quizHTML(q) {
  return `<div class="quiz" data-a="${q.a}" data-why="${esc(q.why)}"><span class="eyebrow">Проверь себя</span><div class="q">${esc(q.q)}</div>
    <div class="opts">${q.opts.map((o, i) => `<button class="btn" data-i="${i}">${esc(o)}</button>`).join("")}</div><p class="why"></p></div>`;
}
function wireQuiz() {
  const q = $(".quiz"); if (!q) return;
  q.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const ok = +b.dataset.i === +q.dataset.a;
    q.querySelectorAll("button").forEach((x) => x.classList.remove("ok", "no"));
    b.classList.add(ok ? "ok" : "no");
    $(".why", q).textContent = (ok ? "Верно! " : "Не совсем. ") + q.dataset.why;
  });
}

function viewBody(id) {
  const b = BY_ID[id];
  if (!b) return viewMoon(id);
  const order = [BY_ID.sun, ...PLANETS];
  let prev = null, next = null, fig = "Fig 2";
  const idx = order.indexOf(b);
  if (idx >= 0) {
    fig = `Fig 2.${idx}`;
    if (idx > 0) prev = { href: `#/body/${order[idx - 1].id}`, name: order[idx - 1].name };
    if (idx < order.length - 1) next = { href: `#/body/${order[idx + 1].id}`, name: order[idx + 1].name };
  }
  if (b.type === "moon") return viewMoon(id);
  let moonRow = "";
  if (b.system) moonRow = `<h2>Спутники</h2><p class="section-note">${SYSTEMS[b.system].note}</p><a class="btn" href="#/system/${b.system}">Открыть систему ${b.name === "Юпитер" ? "Юпитера" : "Сатурна"} в 3D →</a>`;
  if (b.id === "earth") moonRow = `<h2>Спутники Земли</h2><p class="section-note">${esc(EARTH.note)}</p><p><a class="btn" href="#/system/earth">Открыть систему Земли в 3D →</a></p><div class="grid" style="max-width:260px;margin-top:16px" id="mrow"></div>`;
  bodyPage(b, { fig, crumbs: `<a href="#/">Главная</a> / ${b.type === "star" ? "Звезда" : "Планеты"} / ${b.name}`, prev, next, moonRow });
  if (b.id === "earth") $("#mrow").append(cardFor(BY_ID.moon, 1));
}

function viewMoon(id) {
  let b = BY_ID[id];
  let moon = findMoon(id);
  const sysId = b?.parent && SYSTEMS[b.parent] ? b.parent : moon?.system;
  const sys = sysId ? SYSTEMS[sysId] : null;
  if (!b && moon) b = profileFor(moon, sys);
  if (!b) return viewNotFound();
  if (b.id === "moon") {
    return bodyPage(b, { fig: "Fig 2.3a", crumbs: `<a href="#/">Главная</a> / <a href="#/body/earth">Земля</a> / Луна`, prev: { href: "#/body/earth", name: "Земля" }, next: { href: "#/body/mars", name: "Марс" } });
  }
  const list = sys.moons;
  const i = list.findIndex((x) => x.id === id);
  const prev = i > 0 ? { href: `#/moon/${list[i - 1].id}`, name: list[i - 1].name } : null;
  const next = i < list.length - 1 ? { href: `#/moon/${list[i + 1].id}`, name: list[i + 1].name } : null;
  const gen = sysId === "jupiter" ? "Юпитера" : "Сатурна";
  const g = moon ? sys.groups[moon.group] : null;
  const moonRow = moon ? `<h2>Орбита</h2><div class="stats">
      <div class="stat"><div class="k">Группа</div><div class="v" style="font-size:14px"><span class="grp-dot" style="background:${g.color}"></span>${esc(g.name)}</div></div>
      <div class="stat"><div class="k">Большая полуось</div><div class="v">${moon.a.toLocaleString("ru-RU")} <small>км</small></div></div>
      <div class="stat"><div class="k">Период</div><div class="v">${Math.abs(moon.p).toLocaleString("ru-RU")} <small>сут</small></div></div>
      <div class="stat"><div class="k">Наклон</div><div class="v">${moon.i.toLocaleString("ru-RU")}° <small>${moon.retro ? "обратное" : "прямое"}</small></div></div>
      <div class="stat"><div class="k">Открыт</div><div class="v">${moon.year}</div></div>
      <div class="stat"><div class="k">Открыл</div><div class="v" style="font-size:13px">${esc(moon.by)}</div></div>
    </div><p style="margin-top:16px"><a class="btn" href="#/system/${sysId}?g=${moon.group}">Показать группу на схеме системы →</a></p>` : "";
  bodyPage(b, { fig: `Fig ${sysId === "jupiter" ? 3 : 4}.${i + 1}`, crumbs: `<a href="#/">Главная</a> / <a href="#/system/${sysId}">Система ${gen}</a> / ${b.name}`, prev, next, moonRow });
}

// ------------------------------------------------------------ СИСТЕМА СПУТНИКОВ
function viewSystem(id, params) {
  const sys = SYSTEMS[id]; if (!sys) return viewNotFound();
  const planet = BY_ID[id];
  const E = id === "earth";
  const gen = id === "jupiter" ? "Юпитера" : E ? "Земли" : "Сатурна";
  const speeds = sys.speeds || [[0.25, "¼ сут/с"], [2, "2 сут/с"], [30, "30 сут/с"], [0, "Пауза"]];
  const speed0 = sys.speed ?? 2;
  const counts = Object.fromEntries(Object.keys(sys.groups).map((g) => [g, sys.moons.filter((m) => m.group === g).length]));
  const groupG = params.get("g");
  app.innerHTML = `
  <section class="view">
    <div class="crumbs"><a href="#/">Главная</a> / <a href="#/body/${id}">${planet.name}</a> / Спутники</div>
    <div class="hero" style="padding-top:18px">
      <div class="eyebrow">${E ? `1 естественный спутник · ≈12 000 искусственных · ${sys.named} подробно` : `${sys.total} спутников · ${sys.named} с именами`} · данные на ${sys.asOf} год</div>
      <h1>Система ${gen}</h1>
      <p class="lede">${esc(sys.note)}</p>
    </div>
    ${plate({ fig: id === "jupiter" ? "Fig 3" : E ? "Fig 6" : "Fig 4", title: `Спутники ${gen}`, hint: '<span class="only-mouse">Тяни — вращать · наведи на спутник · нажми — открыть</span><span class="only-touch">Веди пальцем вбок — вращать · коснись спутника</span>', tall: true, halo: false,
      extra: `<div class="controls"><span>Время</span><div class="btn-row" id="spd">
        ${speeds.map(([v, l]) => `<button class="btn" data-s="${v}" aria-pressed="${v === speed0}">${l}</button>`).join("")}</div>
        <span>Вид</span><div class="btn-row"><button class="btn" id="zin">${E ? "Низкие орбиты" : "Внутренние"}</button><button class="btn" id="zout">Вся система</button></div></div>
      <div class="filters" id="flt"><button class="chip" data-g="" aria-pressed="${!groupG}">Все</button>${Object.entries(sys.groups).map(([k, g]) => `<button class="chip" data-g="${k}" aria-pressed="${groupG === k}"><i style="background:${g.color}"></i>${esc(g.name)} <span class="c">${counts[k]}</span></button>`).join("")}</div>
      <p class="caption">${E
        ? `<b>Шкала расстояний — логарифмическая:</b> от МКС (420 км) до телескопа «Джеймс Уэбб» (1,5 млн км) — разница в 3 500 раз. Линии — орбиты известных аппаратов, точки — облака целых группировок (${Object.values(sys.groups).filter((g) => g.real).map((g) => g.real).join("; ")}). Точек меньше, чем настоящих спутников, иначе за ними не было бы видно Землю. «Уэбб», «Евклид», SOHO и DSCOVR не обращаются вокруг Земли: они держатся в точках Лагранжа и вместе с Землёй облетают Солнце за год.`
        : `<b>Шкала расстояний — логарифмическая:</b> каждые ≈5 делений радиуса — в 10 раз дальше. Иначе внутренние спутники слились бы с планетой, а внешние улетели бы за экран. Наклоны орбит и направление движения настоящие. Линии — спутники с именами, точки — ${sys.total - sys.named} безымянных (их орбиты показаны условно, по параметрам семейства).`}</p>` })}

    <h2>${E ? "Группы спутников" : "Семейства"}</h2>
    <div class="facts">${Object.entries(sys.groups).map(([k, g]) => `<div class="fact"><span class="eyebrow"><span class="grp-dot" style="background:${g.color}"></span>${E ? (g.real || `${counts[k]} на схеме`) : `${counts[k]} с именами`}${g.retro ? " · обратные" : ""}</span><b style="color:var(--strong)">${esc(g.name)}</b><br>${esc(g.desc)}</div>`).join("")}</div>

    <h2>${E ? "Каталог: Луна и известные аппараты" : "Каталог спутников с именами"}</h2>
    <p class="section-note">${E ? "Нажми на строку — откроется 3D-модель аппарата, которую можно разобрать на детали." : "Нажми на строку — откроется 3D-разрез спутника."} Нажми на заголовок — сортировка.</p>
    <div class="table-wrap"><table class="cat"><thead><tr>
      ${E
        ? `<th data-sort="name">Имя</th><th data-sort="group">Группа</th><th data-sort="a" class="num asc">Высота орбиты</th><th data-sort="p" class="num">Период</th><th data-sort="i" class="num">Наклон</th><th data-sort="year" class="num">Запуск</th><th>Кто запустил</th>`
        : `<th data-sort="name">Имя</th><th data-sort="group">Группа</th><th data-sort="r" class="num">Радиус, км</th><th data-sort="a" class="num asc">Расстояние, тыс. км</th><th data-sort="p" class="num">Период, сут</th><th data-sort="i" class="num">Наклон</th><th data-sort="year" class="num">Открыт</th><th>Кто открыл</th>`}
    </tr></thead><tbody></tbody></table></div>
  </section>`;

  let sortKey = "a", dir = 1, filter = groupG || null;
  const tbody = $("tbody");
  function renderTable() {
    const rows = sys.moons.filter((m) => !filter || m.group === filter).slice().sort((x, y) => {
      const a = sortKey === "p" ? Math.abs(x.p) : x[sortKey], b = sortKey === "p" ? Math.abs(y.p) : y[sortKey];
      return (typeof a === "string" ? String(a).localeCompare(String(b), "ru") : a - b) * dir;
    });
    if (E) {
      tbody.innerHTML = rows.map((m) => `<tr data-id="${m.id}">
        <td class="name">${m.id === "moon" ? '<canvas class="mini"></canvas>' : SAT_ICON}${esc(m.name)} <span style="font-weight:400;color:var(--muted)">${esc(m.latin)}</span></td>
        <td><span class="grp-dot" style="background:${sys.groups[m.group].color}"></span>${esc(sys.groups[m.group].name)}</td>
        <td class="num">${fmtAlt(m)}</td><td class="num">${m.lag ? "1 год" : fmtPeriod(m.p)}</td><td class="num">${m.i.toLocaleString("ru-RU")}°</td>
        <td class="num">${m.gone ? `${m.year} <span class="retro">сгорел</span>` : m.year}</td><td>${esc(m.by)}</td></tr>`).join("");
      const mc = $("tr[data-id=moon] canvas", tbody); if (mc) lazyThumb(mc, BY_ID.moon, { size: 26 });
      return;
    }
    tbody.innerHTML = rows.map((m) => `<tr data-id="${m.id}">
      <td class="name"><canvas class="mini"></canvas>${esc(m.name)} <span style="font-weight:400;color:var(--muted)">${m.latin}</span></td>
      <td><span class="grp-dot" style="background:${sys.groups[m.group].color}"></span>${esc(sys.groups[m.group].name)}</td>
      <td class="num">${m.r.toLocaleString("ru-RU")}</td><td class="num">${(m.a / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}</td>
      <td class="num">${Math.abs(m.p).toLocaleString("ru-RU")}${m.retro ? ' <span class="retro">↺</span>' : ""}</td><td class="num">${m.i.toLocaleString("ru-RU")}°</td><td class="num">${m.year}</td><td>${esc(m.by)}</td></tr>`).join("");
    tbody.querySelectorAll("tr").forEach((tr) => {
      const m = sys.moons.find((x) => x.id === tr.dataset.id);
      const body = BY_ID[m.id] || profileFor(m, sys);
      lazyThumb($("canvas", tr), body, { size: 26 });
    });
  }
  renderTable();
  tbody.addEventListener("click", (e) => { const tr = e.target.closest("tr"); if (tr) location.hash = satHref(findMoon(tr.dataset.id)); });
  $("thead").addEventListener("click", (e) => {
    const th = e.target.closest("th[data-sort]"); if (!th) return;
    const k = th.dataset.sort;
    dir = k === sortKey ? -dir : 1; sortKey = k;
    $("thead").querySelectorAll("th").forEach((x) => x.classList.remove("asc", "desc"));
    th.classList.add(dir > 0 ? "asc" : "desc");
    renderTable();
  });

  let fig = null;
  $("#flt").addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    filter = b.dataset.g || null;
    $("#flt").querySelectorAll(".chip").forEach((x) => x.setAttribute("aria-pressed", x === b));
    fig?.setFilter(filter);
    renderTable();
  });
  if (!GL) return;
  mountLater(async (stale) => {
    const { mountSystem } = await import("./system3d.js");
    if (stale()) return;
    const stage = $(".stage");
    fig = mountSystem({ stage, labelsEl: $(".labels", stage), system: sys, planet, filter, onReadout: readoutSetter(app), onPick: (mid) => (location.hash = satHref(sys.moons.find((x) => x.id === mid))) });
    current = fig;
    $("#spd").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      $("#spd").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      fig.setSpeed(+b.dataset.s);
    });
    $("#zin").addEventListener("click", () => fig.zoom("inner"));
    $("#zout").addEventListener("click", () => fig.zoom("all"));
  });
}


// ------------------------------------------------------------ ИСКУССТВЕННЫЙ СПУТНИК
function viewSat(id) {
  const m = EARTH.moons.find((x) => x.id === id && x.id !== "moon");
  if (!m) return viewNotFound();
  const g = EARTH.groups[m.group];
  const list = EARTH.moons.filter((x) => x.id !== "moon");
  const i = list.indexOf(m);
  const prev = list[i - 1], next = list[i + 1];
  const speed = Math.sqrt(EARTH.gm / (m.a * 1000)) / 1000;
  const stats = [
    ["Группа", g.name, ""], ["Высота орбиты", fmtAlt(m), ""], ["Период", m.lag ? "год (вместе с Землёй)" : fmtPeriod(m.p), ""],
    ["Наклон орбиты", m.i.toLocaleString("ru-RU"), "°"], ...(m.lag ? [] : [["Скорость", speed.toLocaleString("ru-RU", { maximumFractionDigits: 1 }), "км/с"]]),
    ["Масса", m.mass || "—", ""], ["Размеры", m.size || "—", ""], ...(m.crew ? [["Экипаж", m.crew, ""]] : []),
    ["Запуск", m.gone ? `${m.year} (сгорел)` : String(m.year), ""], ["Кто запустил", m.by, ""],
  ];
  app.innerHTML = `
  <section class="view">
    <div class="crumbs"><a href="#/">Главная</a> / <a href="#/system/earth">Система Земли</a> / ${esc(m.name)}</div>
    <div class="hero" style="padding-top:18px">
      <div class="eyebrow">Искусственный спутник · ${esc(g.name)} · ${esc(m.latin)}</div>
      <h1>${esc(m.name)}</h1>
      <p class="lede">${esc(m.about[0])}</p>
    </div>
    ${plate({ fig: `Fig 6.${i + 1}`, title: `${m.name} · разбор`, hint: '<span class="only-mouse">Тяни — вращать · наведи на деталь</span><span class="only-touch">Веди пальцем вбок — вращать · коснись детали</span>',
      extra: `<div class="controls">
        <label class="ctl">Разобрать <input type="range" id="exp" min="0" max="100" value="30"><output id="expv">30%</output></label>
        <div class="btn-row"><button class="btn" id="apart">Разобрать на детали</button><button class="btn" id="whole">Собрать</button></div>
        <span>Вид</span><div class="btn-row" id="look"><button class="btn" data-v="space">Космос</button><button class="btn" data-v="plan">Чертёж</button></div>
      </div><div class="legend" id="legend"></div>
      <p class="caption"><b>Как читать.</b> Модель упрощённая: показаны главные узлы аппарата и из чего они сделаны — золотая и серебристая теплоизоляция, солнечные элементы, радиаторы. Пропорции приближены к настоящим, мелкие детали опущены. В режиме «Космос» аппарат освещён Солнцем на фоне звёзд и Земли.</p>` })}
    <div class="stats">${stats.map(([k, v, u]) => `<div class="stat"><div class="k">${esc(k)}</div><div class="v" style="${String(v).length > 14 ? "font-size:13.5px" : ""}">${esc(v)} <small>${esc(u)}</small></div></div>`).join("")}</div>
    <div class="two-col">
      <div><h2>Из чего состоит</h2><ol class="layers-list" id="layers"></ol></div>
      <div><h2>Коротко</h2>${m.about.map((t) => `<p>${esc(t)}</p>`).join("")}<p class="section-note" style="margin-top:14px"><span class="grp-dot" style="background:${g.color}"></span>${esc(g.desc)}</p></div>
    </div>
    <h2>История</h2>
    <ul class="timeline">${(m.history || []).map(([y, t]) => `<li><span class="yr">${esc(y)}</span><div><p>${esc(t)}</p></div></li>`).join("")}</ul>
    ${m.facts?.length ? `<h2>Знаешь ли ты?</h2><div class="facts">${m.facts.map((f, k) => `<div class="fact"><span class="eyebrow">Факт ${k + 1}</span>${esc(f)}</div>`).join("")}</div>` : ""}
    <nav class="pager">${prev ? `<a href="#/sat/${prev.id}"><span class="eyebrow">← Назад</span><b>${esc(prev.name)}</b></a>` : "<span></span>"}${next ? `<a class="next" href="#/sat/${next.id}"><span class="eyebrow">Дальше →</span><b>${esc(next.name)}</b></a>` : "<span></span>"}</nav>
  </section>`;
  if (!GL) return;
  mountLater(async (stale) => {
    const { mountSat } = await import("./sat3d.js");
    if (stale()) return;
    const stage = $(".stage"), list2 = $("#layers"), legend = $("#legend");
    let look = "space"; try { look = localStorage.getItem("satLook") || "space"; } catch {}
    const fig = mountSat({
      stage, svg: $("svg.callouts", stage), labelsEl: $(".labels", stage), sat: m, onReadout: readoutSetter(app), space: look === "space",
      onPart: (k) => { list2.querySelectorAll("li").forEach((li) => li.classList.toggle("on", +li.dataset.i === k)); legend.querySelectorAll("span").forEach((x) => x.classList.toggle("on", +x.dataset.i === k)); },
    });
    current = fig;
    const COLORS = ["#c8ccd2", "#d6a640", "#2a3f86", "#eeeeea", "#3a3c42", "#c4492a", "#f2c14e"];
    list2.innerHTML = fig.parts.map((p, k) => `<li data-i="${k}"><span class="n">${String(k + 1).padStart(2, "0")}</span><span class="sw" style="background:${COLORS[k % COLORS.length]}"></span><div><b>${esc(p.name)}</b><p>${esc(p.desc)}</p></div></li>`).join("");
    legend.innerHTML = fig.parts.map((p, k) => `<span data-i="${k}"><i style="background:${COLORS[k % COLORS.length]}"></i>${String(k + 1).padStart(2, "0")} ${esc(p.name)}</span>`).join("");
    const exp = $("#exp");
    const lookBtns = $("#look").querySelectorAll("button");
    const setLook = (v) => { lookBtns.forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === v)); fig.setSpace(v === "space"); try { localStorage.setItem("satLook", v); } catch {} };
    setLook(look);
    $("#look").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setLook(b.dataset.v); });
    exp.addEventListener("input", () => { fig.setExplode(+exp.value / 100); $("#expv").textContent = exp.value + "%"; });
    $("#apart").addEventListener("click", () => { exp.value = 100; exp.dispatchEvent(new Event("input")); });
    $("#whole").addEventListener("click", () => { exp.value = 0; exp.dispatchEvent(new Event("input")); });
    list2.addEventListener("mouseover", (e) => { const li = e.target.closest("li"); if (li) fig.hover(+li.dataset.i); });
    list2.addEventListener("mouseleave", () => fig.hover(-1));
    list2.addEventListener("click", (e) => { const li = e.target.closest("li"); if (li) { fig.pin(+li.dataset.i); $(".plate").scrollIntoView({ behavior: "smooth", block: "center" }); } });
    legend.addEventListener("click", (e) => { const sp = e.target.closest("span[data-i]"); if (sp) fig.pin(+sp.dataset.i); });
  });
}

// ------------------------------------------------------------ ИСТОРИЯ
function viewHistory() {
  app.innerHTML = `
  <section class="view">
    <div class="crumbs"><a href="#/">Главная</a> / История</div>
    <div class="hero" style="padding-top:18px">
      <div class="eyebrow">Fig 5 · хроника</div>
      <h1>История открытий</h1>
      <p class="lede">Как люди шаг за шагом узнавали, из чего сделаны планеты и их луны: от телескопа Галилея до роботов, которые летят к океанам Европы и Ганимеда.</p>
    </div>
    <ul class="timeline">${HISTORY.map((h) => `<li class="${h.big ? "big" : ""}"><span class="yr">${esc(h.y)}</span><div><span class="who">${esc(h.who)}</span><h3>${esc(h.t)}</h3><p>${esc(h.d)}</p>${h.go ? `<a class="go" href="${BY_ID[h.go] && BY_ID[h.go].type !== "moon" ? "#/body/" : "#/moon/"}${h.go}">Открыть 3D-разрез →</a>` : ""}</div></li>`).join("")}</ul>
  </section>`;
}

function viewNotFound() {
  app.innerHTML = `<section class="view"><div class="hero"><h1>Тут пусто, как в космосе</h1><p class="lede">Такой страницы нет. <a href="#/">На главную →</a></p></div></section>`;
}

// ------------------------------------------------------------ роутер
function route(keepScroll = false) {
  routeSeq++;
  if (current) { current.dispose(); current = null; }
  const h = location.hash.replace(/^#\/?/, "");
  const [path, qs] = h.split("?");
  const parts = path.split("/").filter(Boolean);
  const params = new URLSearchParams(qs || "");
  document.querySelectorAll(".nav a").forEach((a) => a.removeAttribute("aria-current"));
  const mark = (sel) => $(`.nav a[href="${sel}"]`)?.setAttribute("aria-current", "page");
  $(".nav").classList.remove("open");
  if (!parts.length) { viewHome(); mark("#/"); }
  else if (parts[0] === "body") { viewBody(parts[1]); if (["jupiter", "saturn", "earth"].includes(parts[1])) mark(`#/system/${parts[1]}`); else mark("#/planets"); }
  else if (parts[0] === "moon") { const m = findMoon(parts[1]); if (isSat(m)) { location.replace(`#/sat/${m.id}`); return; } viewMoon(parts[1]); if (m) mark(`#/system/${m.system}`); }
  else if (parts[0] === "sat") { viewSat(parts[1]); mark("#/system/earth"); }
  else if (parts[0] === "system") { viewSystem(parts[1], params); mark(`#/system/${parts[1]}`); }
  else if (parts[0] === "history") { viewHistory(); mark("#/history"); }
  else if (parts[0] === "planets") { viewHome(); mark("#/planets"); setTimeout(() => $("#planets")?.scrollIntoView({ behavior: "smooth" }), 50); }
  else viewNotFound();
  const title = $("h1")?.textContent;
  document.title = title && parts.length ? `${title} — Анатомия Солнечной системы` : "Анатомия Солнечной системы";
  if (parts[0] !== "planets" && keepScroll !== true) window.scrollTo({ top: 0 });
}
window.addEventListener("hashchange", () => route());
route();
