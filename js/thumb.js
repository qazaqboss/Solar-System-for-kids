// Миниатюры тел без WebGL: шар (или «картофелина»), освещённый сверху слева,
// рисуется попиксельно из той же процедурной текстуры.
import { makeTextureAsync, makeRingTexture } from "./textures.js";
import { shapeFn } from "./anatomy3d.js";

const texData = new Map();
async function pixels(look, w, h) {
  const key = JSON.stringify(look) + w;
  if (texData.has(key)) return texData.get(key);
  const cv = await makeTextureAsync(look, w, h);
  const d = cv.getContext("2d").getImageData(0, 0, w, h).data;
  const out = { d, w, h };
  texData.set(key, out);
  return out;
}

/** Нарисовать тело в canvas. opts: {size, rot(рад), shape, rings} */
export async function drawThumb(canvas, body, { size = 120, rot = 0.6 } = {}) {
  const dpr = Math.min(body.shape ? (size <= 48 ? 1 : 1.5) : 2, window.devicePixelRatio || 1);
  const S = Math.round(size * dpr);
  const small = size <= 48;
  const tw = small ? 256 : 512, th = tw / 2;
  const T = await pixels(body.look, tw, th);
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(S, S);
  const sf = body.shape ? shapeFn(body.shape) : null;
  const ringed = body.rings;
  // с кольцами планета меньше, чтобы кольца целиком помещались в кадр
  const R = ringed === "saturn" ? S * 0.185 : ringed ? S * 0.215 : S * 0.46;
  const ring = ringed ? ringProfile(ringed) : null;
  const cx = S / 2, cy = S / 2;
  const L = norm([-0.55, 0.6, 0.6]);
  const emissive = !!body.emissive;
  // наклон камеры для колец
  const tilt = ringed ? 0.5 : 0.12;
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const roll = ringed ? -0.32 : 0, cr = Math.cos(roll), sr = Math.sin(roll); // лёгкий наклон колец в кадре
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      const sx0 = (px + 0.5 - cx) / R, sy0 = -(py + 0.5 - cy) / R;
      const x = sx0 * cr - sy0 * sr, y = sx0 * sr + sy0 * cr;
      const k = (py * S + px) * 4;
      let col = null;
      const rr = x * x + y * y;
      // шар (для неправильных тел — грубый марш по лучу)
      let hit = null;
      if (!sf) {
        if (rr <= 1) hit = [x, y, Math.sqrt(1 - rr)];
      } else if (rr <= 2.2) {
        for (let z = 1.5; z > -1.5; z -= small ? 0.09 : 0.04) {
          const len = Math.hypot(x, y, z);
          const d = [x / len, y / len, z / len];
          const dd = toBody(d, ct, st, rot);
          if (len <= sf(dd)) { hit = [x, y, z]; break; }
        }
      }
      if (hit) {
        const len = Math.hypot(...hit);
        const n0 = [hit[0] / len, hit[1] / len, hit[2] / len];
        const d = toBody(n0, ct, st, rot);
        const lat = Math.asin(Math.max(-1, Math.min(1, d[1])));
        const lon = Math.atan2(d[0], d[2]);
        const u = Math.floor(((lon + Math.PI) / (2 * Math.PI)) * T.w) % T.w;
        const v = Math.min(T.h - 1, Math.floor(((Math.PI / 2 - lat) / Math.PI) * T.h));
        const ti = (v * T.w + u) * 4;
        let lum = emissive ? 1 : Math.max(0, dot(n0, L)) * 1.05 + 0.12;
        if (sf) lum *= 0.9 + 0.1 * n0[2];
        col = [T.d[ti] * lum, T.d[ti + 1] * lum, T.d[ti + 2] * lum];
        if (emissive) { const limb = Math.pow(n0[2], 0.4); col = col.map((c) => c * (0.6 + 0.4 * limb)); }
      }
      // кольца в плоскости экватора: где луч взгляда пересекает плоскость колец
      if (ring) {
        const zr = (y * ct) / st;           // глубина точки кольца на луче
        const r = Math.hypot(x, y / st);    // её расстояние от центра планеты (в радиусах)
        if (r > ring.inner && r < ring.outer) {
          const [rc0, rc1, rc2, a] = ring.at((r - ring.inner) / (ring.outer - ring.inner));
          const front = !hit || zr > hit[2];
          // тень планеты на кольце: луч от точки кольца к свету упирается в шар
          const b = x * L[0] + y * L[1] + zr * L[2], c = x * x + y * y + zr * zr - 1;
          const inShadow = b < 0 && b * b - c > 0;
          const lum = inShadow ? 0.35 : 1;
          if (front && a > 0.01) {
            if (col) col = [col[0] * (1 - a) + rc0 * lum * a, col[1] * (1 - a) + rc1 * lum * a, col[2] * (1 - a) + rc2 * lum * a];
            else { img.data[k] = rc0 * lum; img.data[k + 1] = rc1 * lum; img.data[k + 2] = rc2 * lum; img.data[k + 3] = a * 255; continue; }
          }
        }
      }
      if (col) {
        img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

function toBody(d, ct, st, rot) {
  // наклон камеры вокруг оси x, затем вращение вокруг y
  let x = d[0], y = d[1] * ct - d[2] * st, z = d[1] * st + d[2] * ct;
  const c = Math.cos(rot), s = Math.sin(rot);
  return [x * c + z * s, y, -x * s + z * c];
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function norm(a) { const l = Math.hypot(...a); return a.map((v) => v / l); }

/** Ленивые миниатюры: рисуются, когда попадают на экран. */
// Очередь: рисуем по одной миниатюре в свободное время, чтобы прокрутка шла плавно.
const queue = [];
let busy = false;
async function pump() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const cv = queue.shift();
    if (!cv.isConnected) continue;
    await new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 200 }) : setTimeout(r, 16)));
    try { await cv.__draw(); cv.classList.add("ready"); } catch (e) { console.warn(e); }
  }
  busy = false;
}
const lazy = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { lazy.unobserve(e.target); queue.push(e.target); }
  pump();
}, { rootMargin: "300px" });
export function lazyThumb(canvas, body, opts) {
  canvas.__draw = () => drawThumb(canvas, body, opts);
  lazy.observe(canvas);
}

/** Профиль колец (цвет и прозрачность по радиусу) из той же текстуры, что в 3D. */
const ringCache = {};
function ringProfile(kind) {
  if (ringCache[kind]) return ringCache[kind];
  const cv = makeRingTexture(kind);
  const d = cv.getContext("2d").getImageData(0, 1, cv.width, 1).data;
  const n = cv.width;
  return (ringCache[kind] = {
    inner: kind === "saturn" ? 67000 / 58232 : 1.64,
    outer: kind === "saturn" ? 141000 / 58232 : 2.06,
    at(t) { const i = Math.min(n - 1, Math.max(0, Math.round(t * (n - 1)))) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3] / 255]; },
  });
}
