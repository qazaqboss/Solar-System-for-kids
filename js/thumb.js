// Миниатюры тел без WebGL: шар (или «картофелина»), освещённый сверху слева,
// рисуется попиксельно из той же процедурной текстуры.
import { makeTexture } from "./textures.js";
import { shapeFn } from "./anatomy3d.js";

const texData = new Map();
function pixels(look, w, h) {
  const key = JSON.stringify(look) + w;
  if (texData.has(key)) return texData.get(key);
  const cv = makeTexture(look, w, h);
  const d = cv.getContext("2d").getImageData(0, 0, w, h).data;
  const out = { d, w, h };
  texData.set(key, out);
  return out;
}

/** Нарисовать тело в canvas. opts: {size, rot(рад), shape, rings} */
export function drawThumb(canvas, body, { size = 120, rot = 0.6 } = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const S = Math.round(size * dpr);
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext("2d");
  const small = size <= 48;
  const tw = small ? 256 : 512, th = tw / 2;
  const T = pixels(body.look, tw, th);
  const img = ctx.createImageData(S, S);
  const sf = body.shape ? shapeFn(body.shape) : null;
  const ringed = body.rings;
  const R = ringed ? S * 0.27 : S * 0.46;
  const cx = S / 2, cy = S / 2;
  const L = norm([-0.55, 0.6, 0.6]);
  const emissive = !!body.emissive;
  // наклон камеры для колец
  const tilt = ringed ? 0.42 : 0.12;
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      let x = (px + 0.5 - cx) / R, y = -(py + 0.5 - cy) / R;
      const k = (py * S + px) * 4;
      let col = null;
      const rr = x * x + y * y;
      // шар (для неправильных тел — грубый марш по лучу)
      let hit = null;
      if (!sf) {
        if (rr <= 1) hit = [x, y, Math.sqrt(1 - rr)];
      } else if (rr <= 2.2) {
        for (let z = 1.5; z > -1.5; z -= 0.04) {
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
      // кольца в плоскости экватора
      if (ringed) {
        // точка на плоскости кольца вдоль луча: плоскость y' = 0 в системе тела
        // луч (x, y, z) с z свободным: y*ct - z*st ... решаем для z
        const zr = (y * ct) / st; // где луч пересекает плоскость
        const bx = x, bz = y * st + zr * ct;
        const r = Math.hypot(bx, bz);
        const inner = ringed === "saturn" ? 1.15 : 1.64, outer = ringed === "saturn" ? 2.42 : 2.06;
        if (r > inner && r < outer) {
          const front = zr > (hit ? hit[2] : -99);
          const t = (r - inner) / (outer - inner);
          let a = ringed === "saturn" ? (t < 0.23 ? 0.25 : t < 0.58 ? 0.9 : t < 0.62 ? 0.08 : 0.65) : (Math.abs(t - 0.85) < 0.05 ? 0.7 : 0.15);
          const rc = ringed === "saturn" ? [224, 206, 170] : [180, 196, 200];
          const shadow = !front && hit ? 0 : 1;
          if (front || !hit) {
            const base = col || null;
            col = base ? base.map((c, i) => c * (1 - a) + rc[i] * a * shadow) : rc;
            if (!base) { img.data[k] = rc[0]; img.data[k + 1] = rc[1]; img.data[k + 2] = rc[2]; img.data[k + 3] = a * 255; continue; }
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
const lazy = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { lazy.unobserve(e.target); e.target.__draw?.(); }
}, { rootMargin: "200px" });
export function lazyThumb(canvas, body, opts) {
  canvas.__draw = () => drawThumb(canvas, body, opts);
  lazy.observe(canvas);
}
