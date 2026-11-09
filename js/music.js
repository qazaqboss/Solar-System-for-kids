// Фоновая музыка: спокойный «космический» эмбиент (audio/music/space.mp3, сгенерирован
// для сайта — audio/music/synth.py). Браузеры не дают включать звук без действия
// пользователя, поэтому музыка стартует при первом касании, клике или нажатии клавиши.
// Кнопка ♪ в меню выключает её; выбор запоминается. Во время экскурсии музыка тише.
const URL = "audio/music/space.mp3", LOOP = 72.0, VOL = 0.32, DUCK = 0.08;
const btn = document.getElementById("music");
let ctx = null, gain = null, src = null, buf = null, loading = null, on = false, ducked = false;
let pref = "on"; try { pref = localStorage.getItem("music") || "on"; } catch {}

const target = () => (on ? (ducked ? DUCK : VOL) : 0);
function ramp(sec = 1.5) { if (!gain) return; const t = ctx.currentTime; gain.gain.cancelScheduledValues(t); gain.gain.setValueAtTime(gain.gain.value, t); gain.gain.linearRampToValueAtTime(target(), t + sec); }
async function load() {
  ctx ||= new (window.AudioContext || window.webkitAudioContext)();
  if (!gain) { gain = ctx.createGain(); gain.gain.value = 0; gain.connect(ctx.destination); }
  loading ||= fetch(URL).then((r) => r.arrayBuffer()).then((a) => new Promise((res, rej) => ctx.decodeAudioData(a, res, rej))).then((b) => (buf = b));
  return loading;
}
async function play() {
  on = true; started = true; paint();
  try {
    await load();
    if (ctx.state === "suspended") await ctx.resume();
    if (!src && on) {
      src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      // бесшовная петля: пропускаем служебную тишину кодировщика в начале файла
      src.loopStart = Math.max(0, buf.duration - LOOP); src.loopEnd = buf.duration;
      src.connect(gain); src.start(0, src.loopStart);
    }
    ramp(3);
  } catch (e) { console.warn("музыка не загрузилась", e); on = false; paint(); }
}
function pause() { on = false; started = true; paint(); ramp(0.8); }
let started = false;
function paint() { if (!btn) return; const shown = on || (!started && pref !== "off"); btn.innerHTML = shown ? '♪<span class="btn-lbl"> Музыка</span>' : '<s>♪</s><span class="btn-lbl"> Выкл</span>'; btn.setAttribute("aria-pressed", String(shown)); btn.title = on ? "Выключить музыку" : "Включить музыку"; }

btn?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (on) { pause(); pref = "off"; } else { play(); pref = "on"; }
  try { localStorage.setItem("music", pref); } catch {}
});
// автостарт при первом действии на странице
const first = (e) => {
  ["pointerdown", "keydown", "touchstart"].forEach((ev) => removeEventListener(ev, first, true));
  if (e.target?.closest?.("#music")) return; // нажали саму кнопку ♪ — решит её обработчик
  if (pref !== "off" && !on) play();
};
["pointerdown", "keydown", "touchstart"].forEach((ev) => addEventListener(ev, first, true));
// вкладка скрыта — тишина; вернулись — продолжаем
document.addEventListener("visibilitychange", () => { if (!ctx) return; document.hidden ? ctx.suspend() : on && ctx.resume(); });
paint();

/** Экскурсия с гидом: на время голоса музыка тише. */
window.__music = { duck(v) { ducked = v; ramp(1.2); } };
