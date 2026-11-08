// Экскурсия с голосовым гидом (голос гида — OmniVoice из VoiceStudio, локальный синтез).
// Гид сам переходит по страницам и в нужный момент речи управляет 3D:
// разрезает, разбирает на слои, подсвечивает, переключает группы спутников.
// Аудио заранее сгенерировано и лежит в audio/tour/*.mp3 — ключи API на сайте не нужны.

// at — [секунда аудио, действие, значение]; seg — начало и конец каждой фразы в аудио (для субтитров)
const STEPS = [
  { route: "#/", title: "Солнечная система", audio: "01",
    text: "Привет! Я твой гид по Солнечной системе. Сейчас мы вместе пролетим от Солнца до Нептуна и заглянем внутрь планет и их спутников. Смотри: вокруг Солнца кружатся восемь планет, и у каждой своя скорость. Меркурий облетает Солнце за 88 дней, а Нептун — почти за 165 лет!",
    at: [[0, "speed", 20], [13.6, "speed", 120]],
    seg: [[0.0, 0.54], [0.96, 3.3], [3.72, 10.3], [10.72, 16.09], [16.51, 23.85]] },
  { route: "#/body/sun", title: "Солнце", audio: "02",
    text: "Начнём с Солнца. Это звезда — огромный шар раскалённой плазмы. Я разрежу его, чтобы ты увидел, что внутри. В самом центре — ядро: там 15 миллионов градусов, и водород превращается в гелий. Энергия из ядра пробирается наружу сотни тысяч лет, прежде чем стать солнечным светом.",
    at: [[0, "cut", 0], [6.2, "cut", 90], [10.2, "pin", 0], [16.4, "pin", 1], [19.5, "pin", 3]],
    seg: [[0.0, 1.75], [2.17, 5.67], [6.09, 8.68], [9.1, 15.56], [15.98, 22.65]] },
  { route: "#/body/earth", title: "Земля", audio: "03",
    text: "А это наш дом — Земля. Под тонкой корой лежит горячая мантия, а ещё глубже — жидкое внешнее ядро из железа. Оно создаёт магнитное поле, которое защищает нас от солнечного ветра. Нажимаю «разобрать» — и слои расходятся ступеньками, как в настоящей учебной модели.",
    at: [[2.8, "pin", 4], [4.5, "pin", 3], [6.2, "pin", 1], [14.1, "explode", 1], [14.1, "pin", -1]],
    seg: [[0.0, 1.88], [2.3, 8.52], [8.94, 14.26], [14.68, 20.68]] },
  { route: "#/system/earth", title: "Спутники Земли", audio: "04",
    text: "Вокруг Земли летает Луна и около 12 тысяч искусственных спутников. Голубое облако у самой Земли — это тысячи спутников Starlink. Чуть дальше кружат навигационные спутники — GPS и ГЛОНАСС. А на большом бирюзовом круге висят геостационарные спутники: они всё время смотрят на одну и ту же точку экватора.",
    at: [[6.7, "filter", "mega"], [12.8, "filter", "gnss"], [17.8, "filter", "geo"], [24.4, "filter", ""]],
    seg: [[0.0, 5.87], [6.29, 10.77], [11.19, 16.09], [16.51, 24.42]] },
  { route: "#/sat/iss", title: "Международная космическая станция", audio: "05",
    text: "Познакомься с Международной космической станцией. Она размером с футбольное поле, и на ней всё время живут космонавты. Золотистые крылья — это солнечные батареи, белые панели — радиаторы, которые сбрасывают лишнее тепло. Давай разберём станцию на части и посмотрим на модули, в которых живут люди.",
    at: [[0, "explode", 0], [10.9, "pin", 2], [14.3, "pin", 3], [17.6, "explode", 1], [19.2, "pin", 1]],
    seg: [[0.0, 3.83], [4.25, 9.41], [9.83, 17.61], [18.03, 23.21]] },
  { route: "#/system/mars", title: "Фобос и Деймос", audio: "06",
    text: "Летим к Марсу. У него два маленьких спутника — Фобос и Деймос, похожие на картофелины. Фобос так близко к Марсу, что облетает его трижды за марсианские сутки. Он медленно падает на планету и через десятки миллионов лет, возможно, превратится в кольцо.",
    at: [[0, "speed", 0.05], [8.7, "speed", 0.25]],
    seg: [[0.0, 1.04], [1.46, 6.88], [7.3, 12.76], [13.18, 20.26]] },
  { route: "#/body/jupiter", title: "Юпитер", audio: "07",
    text: "Вот Юпитер — самая большая планета. У него нет твёрдой поверхности: это гигантский шар из водорода и гелия. Под облаками давление такое огромное, что водород становится жидким металлом. Отсюда и самое мощное магнитное поле среди всех планет.",
    at: [[4.9, "pin", 3], [8.5, "pin", 2], [11.3, "pin", 1], [17.3, "explode", 0.6]],
    seg: [[0.0, 2.63], [3.05, 8.46], [8.88, 15.0], [15.42, 19.66]] },
  { route: "#/moon/io", title: "Ио", audio: "08",
    text: "У Юпитера 97 спутников. Самый горячий из них — Ио. Притяжение Юпитера мнёт его, как пластилин, и недра раскаляются. Поэтому на Ио больше четырёхсот действующих вулканов — больше, чем где-либо ещё в Солнечной системе!",
    at: [[6.1, "pin", 1], [10.5, "pin", 0], [13.5, "pin", 2]],
    seg: [[0.0, 2.69], [3.11, 5.12], [5.54, 10.52], [10.94, 18.59]] },
  { route: "#/moon/europa", title: "Европа", audio: "09",
    text: "А вот Европа. Снаружи — ледяная корка, а под ней прячется солёный океан. Воды в нём больше, чем во всех морях Земли! Учёные надеются найти там жизнь, и к Европе уже летит аппарат Europa Clipper.",
    at: [[2.5, "pin", 3], [5.2, "pin", 2], [9.0, "explode", 0.7]],
    seg: [[0.0, 1.61], [2.03, 6.33], [6.75, 9.85], [10.27, 16.11]] },
  { route: "#/system/saturn", title: "Спутники Сатурна", audio: "10",
    text: "Сатурн — властелин колец. У него 274 спутника — больше, чем у всех остальных планет вместе. Посмотри на эти орбиты: многие спутники летят под большим наклоном, а некоторые — даже в обратную сторону.",
    at: [[3.8, "filter", "major"], [11.1, "filter", "inuit"], [14.3, "filter", "norse"]],
    seg: [[0.0, 2.02], [2.44, 8.9], [9.32, 17.42]] },
  { route: "#/moon/enceladus", title: "Энцелад", audio: "11",
    text: "Маленький белоснежный Энцелад прячет под льдом целый океан. Из трещин у южного полюса бьют гейзеры, и из этих ледяных брызг состоит одно из колец Сатурна.",
    at: [[2.9, "pin", 1], [6.7, "pin", 2], [7.9, "explode", 0.8]],
    seg: [[0.0, 4.57], [4.99, 12.07]] },
  { route: "#/moon/triton", title: "Тритон", audio: "12",
    text: "Дальше всех — Нептун и его спутник Тритон. Тритон летит вокруг планеты в обратную сторону: скорее всего, Нептун когда-то поймал его из далёкого пояса Койпера. На Тритоне бьют азотные гейзеры, а мороз там — минус 235 градусов.",
    at: [[3.0, "pin", 0], [14.0, "pin", 3], [16.5, "pin", 2]],
    seg: [[0.0, 3.12], [3.54, 12.42], [12.84, 19.07]] },
  { route: "#/history", title: "История открытий", audio: "13",
    text: "Всё это люди узнавали шаг за шагом: от телескопа Галилея до роботов, которые летят к Юпитеру прямо сейчас. А теперь исследуй сам: нажимай на планеты, разрезай их и разбирай на части. До встречи в космосе!",
    at: [[1.7, "scroll", 0.85]],
    seg: [[0.0, 8.07], [8.49, 14.15], [14.57, 16.44]] },
];

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ------------------------------------------------------------ панель гида
const dock = document.createElement("section");
dock.className = "tour-dock";
dock.setAttribute("aria-live", "polite");
dock.hidden = true;
dock.innerHTML = `
  <div class="tour-progress">${STEPS.map((_, i) => `<i data-i="${i}"><b></b></i>`).join("")}</div>
  <div class="tour-body">
    <canvas class="tour-orb" width="112" height="112" aria-hidden="true"></canvas>
    <div class="tour-text">
      <div class="tour-meta"><span class="tour-step"></span><span class="tour-title"></span></div>
      <p class="tour-sub"></p>
    </div>
    <div class="tour-btns">
      <button class="tbtn" data-a="prev" aria-label="Назад">⏮</button>
      <button class="tbtn main" data-a="toggle" aria-label="Пауза">❚❚</button>
      <button class="tbtn" data-a="next" aria-label="Дальше">⏭</button>
      <button class="tbtn" data-a="close" aria-label="Закрыть экскурсию">✕</button>
    </div>
  </div>`;
document.body.append(dock);

const audio = new Audio();
audio.preload = "auto";
let ctx = null, analyser = null, freq = null;
const state = { on: false, i: 0, paused: false, fired: new Set(), navigating: false, fallbackT: 0, fallbackTimer: 0, words: [] };

function setupAnalyser() {
  // «живой» индикатор голоса: громкость речи раскачивает кольцо
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (!analyser) {
      const src = ctx.createMediaElementSource(audio);
      analyser = ctx.createAnalyser(); analyser.fftSize = 64;
      src.connect(analyser); analyser.connect(ctx.destination);
      freq = new Uint8Array(analyser.frequencyBinCount);
    }
    ctx.resume?.();
  } catch { analyser = null; }
}

// ------------------------------------------------------------ действия над 3D
function waitFig(timeout = 9000) {
  return new Promise((res) => {
    if (window.__fig) return res(window.__fig);
    const t = setTimeout(() => { window.removeEventListener("fig-ready", h); res(null); }, timeout);
    const h = (e) => { clearTimeout(t); window.removeEventListener("fig-ready", h); res(e.detail); };
    window.addEventListener("fig-ready", h);
  });
}
function fire(kind, v) {
  const fig = window.__fig;
  if (kind === "cut" && $("#cut")) { const el = $("#cut"); el.value = v; el.dispatchEvent(new Event("input")); }
  else if (kind === "explode" && $("#exp")) { const el = $("#exp"); el.value = Math.round(v * 100); el.dispatchEvent(new Event("input")); }
  else if (kind === "pin") fig?.pin?.(v);
  else if (kind === "filter") $(`#flt .chip[data-g="${v}"]`)?.click();
  else if (kind === "speed") { const b = $(`#spd [data-s="${v}"]`); if (b) b.click(); else fig?.setSpeed?.(v); }
  else if (kind === "scroll") smoothScrollTo((document.documentElement.scrollHeight - innerHeight) * v, 9000);
}
function smoothScrollTo(y, dur) {
  const y0 = scrollY, t0 = performance.now();
  const step = (now) => {
    if (!state.on || state.paused) return;
    const k = Math.min(1, (now - t0) / dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    scrollTo(0, y0 + (y - y0) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ------------------------------------------------------------ шаги
async function go(i) {
  if (i < 0) i = 0;
  if (i >= STEPS.length) return stop(true);
  const s = STEPS[i];
  state.i = i; state.fired = new Set(); state.paused = false;
  clearInterval(state.fallbackTimer);
  audio.pause();
  render();
  document.body.classList.add("tour-flying");
  state.navigating = true;
  if (location.hash !== s.route) {
    window.__fig = null;
    location.hash = s.route;
  } else if (!window.__fig) { /* та же страница без фигуры */ }
  await new Promise((r) => setTimeout(r, 120));
  state.navigating = false;
  const needsFig = s.route !== "#/history";
  if (needsFig) await waitFig();
  if (!state.on || state.i !== i) return;
  // показать фигуру над панелью гида
  const plate = $(".plate");
  if (plate) { const top = plate.getBoundingClientRect().top + scrollY - 70; scrollTo({ top, behavior: "smooth" }); }
  else scrollTo({ top: 0, behavior: "smooth" });
  await new Promise((r) => setTimeout(r, 450));
  document.body.classList.remove("tour-flying");
  if (!state.on || state.i !== i) return;
  audio.src = `audio/tour/${s.audio}.mp3`;
  audio.currentTime = 0;
  try { await audio.play(); }
  catch { startFallback(); } // аудио недоступно — субтитры идут по таймеру
  render();
}

function startFallback() {
  // без звука: время шага ≈ 70 мс на символ
  const dur = STEPS[state.i].text.length * 0.07;
  state.fallbackT = 0;
  clearInterval(state.fallbackTimer);
  state.fallbackTimer = setInterval(() => {
    if (state.paused) return;
    state.fallbackT += 0.1;
    tick(state.fallbackT, dur);
    if (state.fallbackT >= dur) { clearInterval(state.fallbackTimer); setTimeout(() => state.on && go(state.i + 1), 700); }
  }, 100);
}

function tick(t, dur) {
  const s = STEPS[state.i];
  s.at.forEach(([at, kind, v], k) => { if (t >= at && !state.fired.has(k)) { state.fired.add(k); fire(kind, v); } });
  // субтитры: подсветка слов по ходу речи. Внутри фразы длина слова ≈ время произнесения,
  // а начало и конец каждой фразы известны точно (s.seg) — подсветка не убегает вперёд в паузах.
  const p = Math.min(1, t / Math.max(0.1, dur));
  const seg = s.seg && s.seg.length === (state.words.at(-1)?.ph ?? -1) + 1 ? s.seg : null;
  if (seg) {
    seg.forEach(([a, b], k) => {
      const ws = state.words.filter((w) => w.ph === k), tot = ws.reduce((x, w) => x + w.len, 0);
      const q = Math.min(1, Math.max(0, (t - a) / Math.max(0.1, b - a)));
      let acc = 0;
      ws.forEach((w) => { acc += w.len; w.el.classList.toggle("said", t >= a && acc / tot <= q + 0.04); });
    });
  } else {
    const total = state.words.reduce((a, w) => a + w.len, 0);
    let acc = 0;
    state.words.forEach((w) => { acc += w.len; w.el.classList.toggle("said", acc / total <= p + 0.02); });
  }
  // субтитры сами прокручиваются к текущей фразе
  const sub = dock.querySelector(".tour-sub");
  const lastSaid = [...sub.querySelectorAll("span.said")].pop();
  if (lastSaid) {
    const want = Math.max(0, lastSaid.offsetTop - sub.clientHeight * 0.35); // .tour-sub — position: relative
    sub.scrollTop += (want - sub.scrollTop) * 0.35;
  }
  const bar = dock.querySelector(`.tour-progress i[data-i="${state.i}"] b`);
  if (bar) bar.style.width = (p * 100).toFixed(1) + "%";
}
audio.addEventListener("timeupdate", () => { if (state.on) tick(audio.currentTime, audio.duration || 1); });
audio.addEventListener("ended", () => { if (!state.on) return; tick(audio.duration, audio.duration); setTimeout(() => state.on && !state.paused && go(state.i + 1), 900); });

function render() {
  const s = STEPS[state.i];
  dock.querySelector(".tour-step").textContent = `${String(state.i + 1).padStart(2, "0")} / ${STEPS.length}`;
  dock.querySelector(".tour-title").textContent = s.title;
  const sub = dock.querySelector(".tour-sub");
  if (sub.dataset.i !== String(state.i)) {
    sub.dataset.i = String(state.i);
    sub.scrollTop = 0;
    sub.innerHTML = s.text.split(/(\s+)/).map((w) => (w.trim() ? `<span>${esc(w)}</span>` : w)).join("");
    state.words = [...sub.querySelectorAll("span")].map((el) => ({ el, len: el.textContent.length + 2 }));
    // слова → фразы (границы фраз в аудио известны точно: s.seg)
    let ph = 0;
    state.words.forEach((w) => { w.ph = ph; if (/[.!?]$/.test(w.el.textContent)) ph++; });
  }
  dock.querySelectorAll(".tour-progress i").forEach((el, k) => {
    el.classList.toggle("done", k < state.i);
    el.classList.toggle("now", k === state.i);
    if (k !== state.i) el.querySelector("b").style.width = k < state.i ? "100%" : "0%";
  });
  const main = dock.querySelector('[data-a="toggle"]');
  main.textContent = state.paused ? "▶" : "❚❚";
  main.setAttribute("aria-label", state.paused ? "Продолжить" : "Пауза");
  dock.classList.toggle("paused", state.paused);
}

function start(from = 0) {
  state.on = true;
  setupAnalyser();
  dock.hidden = false;
  requestAnimationFrame(() => dock.classList.add("open"));
  document.body.classList.add("touring");
  drawOrb();
  go(from);
}
function stop(finished = false) {
  state.on = false;
  audio.pause();
  clearInterval(state.fallbackTimer);
  dock.classList.remove("open");
  document.body.classList.remove("touring", "tour-flying");
  setTimeout(() => { if (!state.on) dock.hidden = true; }, 400);
  if (finished) toast("Экскурсия окончена — исследуй сам! 🚀");
}
function toggle() {
  if (!state.on) return;
  state.paused = !state.paused;
  if (state.paused) audio.pause(); else { ctx?.resume?.(); if (audio.src && !audio.ended) audio.play().catch(() => {}); }
  render();
}
function toast(msg) {
  const t = document.createElement("div"); t.className = "tour-toast"; t.textContent = msg;
  document.body.append(t); setTimeout(() => t.classList.add("on"), 20);
  setTimeout(() => { t.classList.remove("on"); setTimeout(() => t.remove(), 500); }, 3200);
}

// ------------------------------------------------------------ «голос»: пульсирующее кольцо
function drawOrb() {
  const cv = dock.querySelector(".tour-orb"), c = cv.getContext("2d");
  const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2;
  let level = 0, ph = 0;
  const frame = () => {
    if (!state.on) return;
    let v = 0;
    if (analyser && !audio.paused) { analyser.getByteFrequencyData(freq); for (let k = 2; k < 18; k++) v += freq[k]; v /= 16 * 255; }
    else if (!state.paused && state.fallbackTimer && !audio.src.endsWith(".mp3")) v = 0.25 + 0.2 * Math.sin(ph * 6);
    level += (v - level) * 0.25; ph += 0.016;
    c.clearRect(0, 0, W, H);
    const dark = document.documentElement.dataset.theme === "dark";
    // мягкое свечение
    const g = c.createRadialGradient(cx, cy, 8, cx, cy, 54);
    g.addColorStop(0, `rgba(255,170,70,${0.35 + level * 0.6})`); g.addColorStop(1, "rgba(255,140,40,0)");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // планета-гид
    const pg = c.createRadialGradient(cx - 8, cy - 8, 2, cx, cy, 24);
    pg.addColorStop(0, "#ffe7a8"); pg.addColorStop(0.6, "#f29a3a"); pg.addColorStop(1, "#b5501c");
    c.fillStyle = pg; c.beginPath(); c.arc(cx, cy, 20 + level * 5, 0, Math.PI * 2); c.fill();
    // волна голоса по кольцу
    c.strokeStyle = dark ? "rgba(255,255,255,.85)" : "rgba(24,24,26,.85)"; c.lineWidth = 1.6; c.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 48) {
      const k = freq && analyser && !audio.paused ? freq[Math.floor((a / (Math.PI * 2)) * 24) % 24] / 255 : 0;
      const r = 32 + level * 10 + k * 9 * Math.sin(a * 3 + ph * 4);
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      a ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.closePath(); c.stroke();
    // орбита с маленькой «луной»
    c.strokeStyle = dark ? "rgba(255,255,255,.25)" : "rgba(24,24,26,.2)"; c.lineWidth = 1;
    c.beginPath(); c.ellipse(cx, cy, 48, 16, -0.4, 0, Math.PI * 2); c.stroke();
    const ma = ph * 1.6, mx = cx + Math.cos(ma) * 48 * Math.cos(-0.4) - Math.sin(ma) * 16 * Math.sin(-0.4), my = cy + Math.cos(ma) * 48 * Math.sin(-0.4) + Math.sin(ma) * 16 * Math.cos(-0.4);
    c.fillStyle = dark ? "#e6e6e6" : "#26262a"; c.beginPath(); c.arc(mx, my, 3.2, 0, Math.PI * 2); c.fill();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------ управление
document.addEventListener("click", (e) => {
  const st = e.target.closest("[data-tour-start]");
  if (st) { e.preventDefault(); state.on ? toggle() : start(0); return; }
  const b = e.target.closest(".tour-dock [data-a]");
  if (!b) return;
  const a = b.dataset.a;
  if (a === "toggle") toggle();
  else if (a === "next") go(state.i + 1);
  else if (a === "prev") go(state.i - 1);
  else if (a === "close") stop();
});
dock.querySelector(".tour-progress").addEventListener("click", (e) => { const i = e.target.closest("i[data-i]"); if (i) go(+i.dataset.i); });
document.addEventListener("keydown", (e) => {
  if (!state.on || e.target.closest("input, textarea")) return;
  if (e.key === " " && !e.target.closest("button, a, canvas")) { e.preventDefault(); toggle(); }
  else if (e.key === "Escape") stop();
  else if (e.key === "PageDown") go(state.i + 1);
  else if (e.key === "PageUp") go(state.i - 1);
});
// если пользователь сам ушёл на другую страницу — гид встаёт на паузу
window.addEventListener("hashchange", () => {
  if (!state.on || state.navigating) return;
  if (location.hash !== STEPS[state.i].route && !state.paused) { state.paused = true; audio.pause(); render(); toast("Гид на паузе — нажми ▶, чтобы продолжить"); }
});
// ?tour=1 в адресе — показать приглашение к экскурсии
if (/[?&]tour=1/.test(location.search)) setTimeout(() => toast("Нажми «Экскурсия с гидом», чтобы начать"), 800);
window.__tour = { state, audio, go, start, stop, STEPS }; // для отладки и автотестов
