// Процедурные текстуры планет и спутников (равнопромежуточная проекция).
// Всё рисуется кодом: шум считается на сфере, поэтому шва на долготе 180° нет.
// Карта: x → долгота (−180…180), y → широта (90…−90). Та же карта используется
// в геометрии (anatomy3d.js) и в миниатюрах (thumb.js).

// ---------- шум ----------
function makePerm(seed) {
  const p = new Uint8Array(512);
  const a = new Uint8Array(256);
  for (let i = 0; i < 256; i++) a[i] = i;
  let s = (seed * 2654435761) >>> 0 || 1;
  for (let i = 255; i > 0; i--) {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    const j = s % (i + 1);
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  for (let i = 0; i < 512; i++) p[i] = a[i & 255];
  return p;
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;
function grad(h, x, y, z) {
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
  return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
}
export function makeNoise(seed = 1) {
  const p = makePerm(seed);
  function n3(x, y, z) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z, B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    return lerp(
      lerp(lerp(grad(p[AA] & 15, x, y, z), grad(p[BA] & 15, x - 1, y, z), u),
        lerp(grad(p[AB] & 15, x, y - 1, z), grad(p[BB] & 15, x - 1, y - 1, z), u), v),
      lerp(lerp(grad(p[AA + 1] & 15, x, y, z - 1), grad(p[BA + 1] & 15, x - 1, y, z - 1), u),
        lerp(grad(p[AB + 1] & 15, x, y - 1, z - 1), grad(p[BB + 1] & 15, x - 1, y - 1, z - 1), u), v), w);
  }
  function fbm(x, y, z, oct = 5, lac = 2, gain = 0.5) {
    let a = 0.5, f = 1, s = 0;
    for (let i = 0; i < oct; i++) { s += a * n3(x * f, y * f, z * f); f *= lac; a *= gain; }
    return s;
  }
  function ridge(x, y, z, oct = 4) {
    let a = 0.5, f = 1, s = 0;
    for (let i = 0; i < oct; i++) { s += a * (1 - Math.abs(n3(x * f, y * f, z * f) * 1.6)); f *= 2; a *= 0.5; }
    return s;
  }
  return { n3, fbm, ridge };
}

// ---------- помощники цвета ----------
export function hex(c) {
  const n = parseInt(c.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
function ramp(stops, t) {
  t = clamp01(t);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
      return mix(c0, c1, (t - t0) / (t1 - t0 || 1));
    }
  }
  return stops[stops.length - 1][1];
}
const R = (arr) => arr.map(([t, c]) => [t, hex(c)]);

// угловое расстояние между точками на сфере (радианы)
function angDist(lat1, lon1, lat2, lon2) {
  const d = Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(lon1 - lon2);
  return Math.acos(Math.max(-1, Math.min(1, d)));
}

// Набор кратеров: возвращает функцию высоты/тона от (lat, lon)
function craterField(seed, count, minR, maxR) {
  const rnd = mulberry(seed);
  const BANDS = 36;
  const bands = Array.from({ length: BANDS }, () => []);
  for (let i = 0; i < count; i++) {
    const lat = Math.asin(rnd() * 2 - 1);
    const lon = rnd() * Math.PI * 2 - Math.PI;
    const r = minR + Math.pow(rnd(), 3) * (maxR - minR);
    const c = { r, cx: Math.cos(lat) * Math.sin(lon), cy: Math.sin(lat), cz: Math.cos(lat) * Math.cos(lon), cmin: Math.cos(Math.min(Math.PI, r * 1.4)) };
    const b0 = Math.max(0, Math.floor(((lat - r * 1.4 + Math.PI / 2) / Math.PI) * BANDS));
    const b1 = Math.min(BANDS - 1, Math.floor(((lat + r * 1.4 + Math.PI / 2) / Math.PI) * BANDS));
    for (let b = b0; b <= b1; b++) bands[b].push(c);
  }
  return function (la, x, y, z) {
    let h = 0, rim = 0;
    const list = bands[Math.min(BANDS - 1, Math.max(0, Math.floor(((la + Math.PI / 2) / Math.PI) * BANDS)))];
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const dot = x * c.cx + y * c.cy + z * c.cz;
      if (dot > c.cmin) {
        const x2 = Math.acos(Math.min(1, dot)) / c.r;
        if (x2 < 1) h -= (1 - x2 * x2) * 0.6; // чаша
        const e = (x2 - 1) / 0.16;
        rim += Math.exp(-e * e); // вал
      }
    }
    return { h, rim };
  };
}
export function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// грубые контуры континентов Земли (широта, долгота в градусах)
const CONTINENTS = [
  // Северная Америка
  [[70, -165], [71, -140], [69, -110], [73, -80], [62, -64], [52, -56], [45, -62], [41, -70], [35, -76], [30, -81], [25, -80], [29, -90], [26, -97], [19, -96], [15, -88], [9, -79], [8, -83], [15, -93], [20, -105], [23, -110], [31, -115], [34, -120], [40, -124], [48, -125], [55, -132], [59, -140], [60, -150], [57, -158], [62, -165]],
  // Гренландия
  [[83, -40], [82, -25], [76, -19], [70, -22], [63, -41], [60, -44], [65, -52], [70, -54], [76, -66], [79, -70], [82, -60]],
  // Южная Америка
  [[12, -72], [10, -62], [5, -52], [0, -50], [-5, -35], [-13, -38], [-23, -42], [-33, -52], [-39, -58], [-42, -64], [-52, -68], [-55, -68], [-50, -75], [-40, -73], [-30, -71], [-18, -70], [-14, -76], [-5, -81], [1, -80], [8, -77]],
  // Евразия
  [[70, 20], [71, 28], [69, 40], [73, 55], [72, 70], [74, 85], [77, 105], [73, 120], [72, 140], [70, 160], [66, 179], [62, 175], [60, 163], [54, 156], [59, 143], [53, 141], [44, 135], [40, 129], [35, 129], [31, 122], [23, 117], [21, 108], [10, 107], [9, 105], [13, 100], [2, 103], [8, 98], [16, 97], [22, 91], [21, 87], [15, 80], [8, 77], [20, 72], [25, 66], [25, 57], [22, 59], [17, 55], [13, 45], [18, 42], [28, 34], [31, 32], [36, 36], [37, 27], [41, 28], [40, 20], [45, 13], [38, 16], [44, 9], [43, 3], [40, 0], [37, -2], [36, -6], [43, -9], [44, -1], [48, -4], [51, 2], [54, 8], [57, 8], [58, 11], [56, 16], [60, 24], [65, 21], [59, 18], [63, 10], [70, 20]],
  // Африка
  [[36, -6], [37, 10], [33, 11], [31, 20], [32, 30], [31, 32], [22, 37], [12, 43], [11, 51], [2, 46], [-10, 40], [-20, 35], [-26, 33], [-34, 26], [-35, 20], [-29, 16], [-17, 12], [-6, 12], [4, 9], [4, -2], [6, -9], [11, -16], [21, -17], [28, -13], [32, -9]],
  // Аравия
  [[30, 33], [29, 48], [24, 52], [23, 59], [17, 55], [13, 45], [18, 42], [28, 34]],
  // Австралия
  [[-11, 132], [-12, 137], [-17, 141], [-11, 142], [-19, 147], [-25, 153], [-33, 152], [-38, 147], [-38, 140], [-35, 136], [-32, 133], [-34, 123], [-34, 115], [-26, 113], [-21, 115], [-18, 122], [-14, 127]],
  // Антарктида
  [[-64, -60], [-70, -20], [-69, 20], [-67, 60], [-66, 100], [-67, 140], [-72, 170], [-78, -160], [-74, -120], [-72, -90], [-66, -64], [-90, -64], [-90, -60]],
  // Великобритания
  [[58, -5], [57, -2], [53, 0], [51, 1], [50, -5], [53, -4], [55, -6]],
  // Мадагаскар
  [[-12, 49], [-16, 50], [-25, 47], [-25, 44], [-16, 44]],
  // Япония
  [[45, 142], [40, 141], [35, 140], [33, 131], [35, 133], [40, 140], [43, 141]],
  // Индонезия (Калимантан, Суматра, Новая Гвинея)
  [[5, 96], [-6, 106], [-4, 103], [2, 99]],
  [[7, 117], [-3, 117], [-4, 111], [1, 109]],
  [[-1, 131], [-6, 141], [-9, 148], [-10, 142], [-4, 135]],
];
function pointInPoly(lat, lon, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i], [yj, xj] = poly[j];
    if (((yi > lat) !== (yj > lat)) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---------- стили ----------
// Каждый стиль: (ctx) → функция (lat, lon, x, y, z) → [r,g,b]
const STYLES = {
  sun(N) {
    const c = R([[0, "#8a2a00"], [0.35, "#e0600c"], [0.6, "#ff9a1f"], [0.85, "#ffd166"], [1, "#fff4c2"]]);
    return (la, lo, x, y, z) => {
      const g = N.fbm(x * 9, y * 9, z * 9, 4) * 0.5 + N.fbm(x * 40, y * 40, z * 40, 2) * 0.5;
      const spot = smooth(0.35, 0.5, N.fbm(x * 3 + 7, y * 3, z * 3, 3));
      return mix(ramp(c, 0.65 + g * 0.9), hex("#5a1800"), spot * 0.7 * (Math.abs(la) < 0.6 ? 1 : 0));
    };
  },
  rocky(N, o) {
    const c = R(o.ramp);
    const cr = craterField(o.seed || 3, o.craters ?? 220, 0.01, o.maxCrater || 0.2);
    return (la, lo, x, y, z) => {
      const sl = Math.sin(la), cl = Math.cos(la);
      const f = N.fbm(x * (o.freq || 3), y * (o.freq || 3), z * (o.freq || 3), 5);
      const k = cr(la, x, y, z);
      let t = 0.5 + f * 0.8 + k.h * 0.25 + k.rim * 0.16;
      if (o.maria) t -= smooth(0.02, 0.18, N.fbm(x * 1.4 + 3, y * 1.4, z * 1.4, 3)) * o.maria;
      let col = ramp(c, t);
      if (o.rays && k.rim > 0.5) col = mix(col, hex("#ffffff"), 0.15);
      return col;
    };
  },
  venus(N) {
    const c = R([[0, "#8c5a22"], [0.4, "#c99a52"], [0.7, "#e8c886"], [1, "#fbecc4"]]);
    return (la, lo, x, y, z) => {
      const w = N.fbm(x * 2 + N.fbm(x * 4, y * 4, z * 4) * 2, y * 6, z * 2, 5);
      return ramp(c, 0.55 + w * 0.9 + Math.cos(la * 2) * 0.05);
    };
  },
  earth(N) {
    const ocean = R([[0, "#0b2a5b"], [0.6, "#1a5296"], [1, "#2f78c0"]]);
    const land = R([[0, "#2f5d2a"], [0.35, "#5f7f36"], [0.6, "#a8925a"], [0.8, "#8a6b42"], [1, "#e8e2d4"]]);
    const polys = CONTINENTS.map((p) => p.map(([a, b]) => [a, b]));
    return (la, lo, x, y, z) => {
      const latD = (la * 180) / Math.PI, lonD = (lo * 180) / Math.PI;
      const jit = N.fbm(x * 8, y * 8, z * 8, 4) * 7;
      let isLand = false;
      for (const p of polys) if (pointInPoly(latD + jit, lonD + jit * 0.7, p)) { isLand = true; break; }
      let col;
      if (isLand) {
        const dry = smooth(10, 30, Math.abs(Math.abs(latD) - 24) < 12 ? 30 : 0) * 0.5;
        const t = 0.3 + N.fbm(x * 6, y * 6, z * 6, 5) * 0.8 + dry + (Math.abs(latD) > 60 ? 0.35 : 0);
        col = ramp(land, t);
      } else col = ramp(ocean, 0.6 + N.fbm(x * 3, y * 3, z * 3, 3) * 0.5);
      const ice = smooth(66, 74, Math.abs(latD) + jit);
      col = mix(col, hex("#f4f7fb"), ice);
      const cloud = smooth(0.08, 0.32, N.fbm(x * 4 + 11, y * 7, z * 4, 5));
      return mix(col, hex("#ffffff"), cloud * 0.75);
    };
  },
  mars(N) {
    const c = R([[0, "#4a1e10"], [0.4, "#8e3f1f"], [0.65, "#c1673a"], [1, "#e3a072"]]);
    const cr = craterField(41, 120, 0.01, 0.12);
    return (la, lo, x, y, z) => {
      const sl = Math.sin(la), cl = Math.cos(la);
      const f = N.fbm(x * 2.5, y * 2.5, z * 2.5, 6);
      const k = cr(la, x, y, z);
      let t = 0.55 + f * 0.9 + k.h * 0.2 + k.rim * 0.1;
      // Долины Маринер
      const vm = Math.exp(-Math.pow((la + 0.14) / 0.03, 2)) * smooth(-1.6, -1.2, lo) * (1 - smooth(-0.7, -0.4, lo));
      t -= vm * 0.5;
      let col = ramp(c, t);
      const cap = smooth(1.2, 1.32, Math.abs(la) + N.fbm(x * 6, y * 6, z * 6) * 0.15);
      return mix(col, hex("#f3efe8"), cap);
    };
  },
  banded(N, o) {
    const c = R(o.bands);
    return (la, lo, x, y, z) => {
      const turb = N.fbm(x * 3, y * 18, z * 3, 5) * (o.turb ?? 0.9) + N.fbm(x * 9, y * 30, z * 9, 3) * 0.15;
      let t = 0.5 + 0.5 * Math.sin(la * (o.freq || 14) + turb * 2.2) * (o.contrast ?? 0.9) + turb * 0.2;
      let col = ramp(c, t);
      if (o.spot) {
        const [sla, slo, sr, sc] = o.spot;
        const d = angDist(la, lo, sla, slo) / sr;
        const sw = N.fbm(x * 20, y * 20, z * 20, 3) * 0.3;
        if (d < 1.6) col = mix(col, hex(sc), smooth(1.2, 0.6, d + sw) * 0.9);
      }
      if (o.polar) col = mix(col, hex(o.polar), smooth(1.0, 1.45, Math.abs(la)) * 0.6);
      return col;
    };
  },
  io(N) {
    const base = R([[0, "#b88a2c"], [0.35, "#d9b44a"], [0.6, "#f0d870"], [0.8, "#f6e9a8"], [1, "#fff8d8"]]);
    const rnd = mulberry(77);
    const volc = Array.from({ length: 70 }, () => ({ la: Math.asin(rnd() * 2 - 1), lo: rnd() * 6.283 - 3.1416, r: 0.02 + rnd() * 0.06, red: rnd() < 0.25 }));
    return (la, lo, x, y, z) => {
      let col = ramp(base, 0.5 + N.fbm(x * 4, y * 4, z * 4, 5) * 0.9);
      col = mix(col, hex("#c87038"), smooth(0.12, 0.35, N.fbm(x * 2 + 4, y * 2, z * 2, 4)) * 0.45);
      col = mix(col, hex("#e9e2c8"), smooth(1.0, 1.4, Math.abs(la)) * 0.15);
      col = mix(col, hex("#7a5a3a"), smooth(1.05, 1.45, Math.abs(la)) * 0.5);
      for (const v of volc) {
        const d = angDist(la, lo, v.la, v.lo) / v.r;
        if (d < 4) {
          col = mix(col, hex("#1c140c"), smooth(0.9, 0.3, d));
          if (v.red) col = mix(col, hex("#c4492a"), Math.exp(-Math.pow((d - 2.4) / 0.9, 2)) * 0.6);
          else col = mix(col, hex("#8a5a2a"), Math.exp(-Math.pow((d - 1.4) / 0.5, 2)) * 0.4);
        }
      }
      return col;
    };
  },
  europa(N) {
    const base = R([[0, "#b49a7a"], [0.5, "#dccbb0"], [1, "#f5efe6"]]);
    return (la, lo, x, y, z) => {
      let col = ramp(base, 0.55 + N.fbm(x * 3, y * 3, z * 3, 4) * 0.8);
      // линеи — тонкие красно-бурые трещины
      const l1 = N.ridge(x * 4, y * 4, z * 4, 4), l2 = N.ridge(x * 7 + 9, y * 7, z * 7, 3);
      const crack = Math.max(smooth(0.93, 1.0, l1), smooth(0.95, 1.0, l2) * 0.8);
      col = mix(col, hex("#8e4a2a"), crack * 0.75);
      col = mix(col, hex("#a0603a"), smooth(0.15, 0.35, N.fbm(x * 2 + 5, y * 2, z * 2, 4)) * 0.35);
      return col;
    };
  },
  ganymede(N) {
    const dark = R([[0, "#3d342b"], [1, "#6d6052"]]);
    const light = R([[0, "#8f877c"], [1, "#c9c2b6"]]);
    const cr = craterField(23, 160, 0.008, 0.06);
    return (la, lo, x, y, z) => {
      const sl = Math.sin(la), cl = Math.cos(la);
      const reg = N.fbm(x * 1.8, y * 1.8, z * 1.8, 4);
      const groove = 0.5 + 0.5 * Math.sin((x * 40 + y * 25 + N.fbm(x * 3, y * 3, z * 3) * 30));
      const k = cr(la, x, y, z);
      let col = reg > 0.02 ? ramp(dark, 0.5 + N.fbm(x * 8, y * 8, z * 8) + k.rim * 0.3) : ramp(light, 0.4 + groove * 0.4 + N.fbm(x * 10, y * 10, z * 10) * 0.5);
      col = mix(col, hex("#ffffff"), smooth(0.5, 1.2, k.rim) * 0.35);
      col = mix(col, hex("#e6e8ea"), smooth(1.05, 1.35, Math.abs(la)) * 0.45);
      return col;
    };
  },
  callisto(N) {
    const base = R([[0, "#2a231c"], [0.5, "#4d4134"], [1, "#7a6b58"]]);
    const cr = craterField(91, 520, 0.004, 0.05);
    return (la, lo, x, y, z) => {
      const sl = Math.sin(la), cl = Math.cos(la);
      const k = cr(la, x, y, z);
      let col = ramp(base, 0.5 + N.fbm(x * 4, y * 4, z * 4, 5) * 0.8);
      col = mix(col, hex("#e9e4da"), clamp01(k.rim * 0.55));
      // Вальхалла — многокольцевая структура
      const d = angDist(la, lo, 0.25, -0.9);
      if (d < 0.9) col = mix(col, hex("#b3a690"), (0.5 + 0.5 * Math.cos(d * 60)) * smooth(0.9, 0.2, d) * 0.35 + smooth(0.18, 0.05, d) * 0.5);
      return col;
    };
  },
  titan(N) {
    const c = R([[0, "#a0601c"], [0.5, "#d0902e"], [1, "#e8b860"]]);
    return (la, lo, x, y, z) => {
      const b = N.fbm(x * 1.5, y * 5, z * 1.5, 4);
      let col = ramp(c, 0.5 + b * 0.4 + Math.sin(la * 3) * 0.05);
      return mix(col, hex("#7a5a3a"), smooth(1.15, 1.5, la) * 0.25);
    };
  },
  enceladus(N) {
    const cr = craterField(12, 90, 0.01, 0.07);
    return (la, lo, x, y, z) => {
      const sl = Math.sin(la), cl = Math.cos(la);
      const k = cr(la, x, y, z);
      let t = 0.9 + N.fbm(x * 5, y * 5, z * 5, 4) * 0.2 - (la > -0.5 ? clamp01(k.rim * 0.1 - k.h * 0.1) : 0);
      let col = mix(hex("#c4ccd4"), hex("#ffffff"), clamp01(t));
      // «тигровые полосы» у южного полюса
      if (la < -0.9) {
        const s = Math.sin((la + Math.PI / 2) * 0 + (x * 0.8 + z) * 18 + N.fbm(x * 4, y * 4, z * 4) * 3);
        col = mix(col, hex("#6aa8d8"), smooth(0.85, 0.98, Math.abs(s)) * smooth(-0.9, -1.15, la) * 0.9);
      }
      return col;
    };
  },
  iapetus(N) {
    const cr = craterField(55, 200, 0.008, 0.1);
    return (la, lo, x, y, z) => {
      const sl = Math.sin(la), cl = Math.cos(la);
      const k = cr(la, x, y, z);
      // ведущее полушарие (вокруг долготы 90°) — тёмная Область Кассини
      const lead = Math.cos(lo - Math.PI / 2) * Math.cos(la * 1.1);
      const dark = smooth(-0.05, 0.25, lead + N.fbm(x * 6, y * 6, z * 6) * 0.2);
      let col = mix(hex("#e6e0d4"), hex("#3a2a1c"), dark);
      col = mix(col, hex("#ffffff"), clamp01(k.rim * 0.25) * (1 - dark));
      // экваториальный хребет
      col = mix(col, hex("#5a4632"), Math.exp(-Math.pow(la / 0.025, 2)) * 0.5);
      return col;
    };
  },
  mimas(N) {
    const cr = craterField(66, 260, 0.01, 0.12);
    return (la, lo, x, y, z) => {
      const sl = Math.sin(la), cl = Math.cos(la);
      const k = cr(la, x, y, z);
      let t = 0.6 + N.fbm(x * 4, y * 4, z * 4) * 0.3 + k.h * 0.2 + k.rim * 0.12;
      // кратер Гершель (~139 км, треть диаметра)
      const d = angDist(la, lo, -0.03, -1.9) / 0.36;
      if (d < 1.3) t += (d < 1 ? -(1 - d * d) * 0.35 : 0) + Math.exp(-Math.pow((d - 1) / 0.08, 2)) * 0.3 + Math.exp(-Math.pow(d / 0.12, 2)) * 0.35;
      return mix(hex("#7f7f7c"), hex("#e2e2dc"), clamp01(t));
    };
  },
  icy(N, o) {
    const c = R(o.ramp || [[0, "#8d8b86"], [0.6, "#cfcdc6"], [1, "#f6f5f1"]]);
    const cr = craterField(o.seed || 5, o.craters ?? 220, 0.008, o.maxCrater || 0.12);
    return (la, lo, x, y, z) => {
      const sl = Math.sin(la), cl = Math.cos(la);
      const k = cr(la, x, y, z);
      let t = 0.6 + N.fbm(x * 4, y * 4, z * 4, 4) * 0.5 + k.h * 0.18 + k.rim * 0.12;
      let col = ramp(c, t);
      if (o.wisps) {
        // светлые «волокна» на заднем полушарии Дионы
        const back = smooth(0.0, 0.6, -Math.cos(lo - Math.PI / 2));
        col = mix(col, hex("#ffffff"), smooth(0.88, 1.0, N.ridge(x * 5, y * 5, z * 5)) * back * 0.7);
        col = mix(col, hex("#9a968e"), back * 0.18);
      }
      if (o.chasm) col = mix(col, hex("#8a877e"), Math.exp(-Math.pow((Math.abs(x * 0.6 + z * 0.8) - 0.0) / 0.03, 2)) * 0.5 * smooth(0, 0.3, y + 0.3));
      if (o.big) {
        const [bl, bo, br] = o.big;
        const d = angDist(la, lo, bl, bo) / br;
        if (d < 1.3) col = mix(col, hex("#a8a59c"), (d < 1 ? (1 - d * d) * 0.45 : 0) + Math.exp(-Math.pow((d - 1) / 0.08, 2)) * -0.2);
      }
      return col;
    };
  },
  triton(N) {
    return (la, lo, x, y, z) => {
      // север — «дынная корка» (ячеистый рельеф), юг — розоватая шапка из азотного льда
      const cell = N.ridge(x * 9, y * 9, z * 9, 3);
      let col = mix(hex("#b7a89a"), hex("#d8cabd"), clamp01(0.5 + N.fbm(x * 4, y * 4, z * 4, 4) * 0.8));
      col = mix(col, hex("#8a7a6c"), smooth(0.86, 0.98, cell) * 0.55);
      const cap = smooth(-0.05, -0.35, la + N.fbm(x * 3, y * 3, z * 3, 3) * 0.25);
      col = mix(col, hex("#f1dcd2"), cap);
      // тёмные полосы от гейзеров на шапке, вытянутые ветром
      const streak = smooth(0.9, 0.98, N.ridge(x * 2 + z * 6, y * 18, z * 2, 2));
      col = mix(col, hex("#5a4a42"), streak * cap * 0.6);
      return col;
    };
  },
  hyperion(N) {
    const cr = craterField(19, 420, 0.02, 0.16);
    return (la, lo, x, y, z) => {
      const sl = Math.sin(la), cl = Math.cos(la);
      const k = cr(la, x, y, z);
      const pit = clamp01(-k.h);
      let col = mix(hex("#c9b89a"), hex("#3a2a1a"), smooth(0.15, 0.55, pit));
      return mix(col, hex("#efe6d4"), clamp01(k.rim * 0.3));
    };
  },
  dark(N, o) {
    const c = R(o.ramp || [[0, "#1e1b18"], [0.6, "#3c3732"], [1, "#6a635a"]]);
    const cr = craterField(o.seed || 9, o.craters ?? 200, 0.01, 0.16);
    return (la, lo, x, y, z) => {
      const sl = Math.sin(la), cl = Math.cos(la);
      const k = cr(la, x, y, z);
      return ramp(c, 0.55 + N.fbm(x * 4, y * 4, z * 4, 4) * 0.6 + k.h * 0.2 + k.rim * 0.25);
    };
  },
  solid(N, o) {
    const c = hex(o.color), d = hex(o.color2 || o.color);
    return (la, lo, x, y, z) => mix(c, d, clamp01(0.5 + N.fbm(x * (o.freq || 6), y * (o.freq || 6), z * (o.freq || 6), 4) * (o.amp ?? 1.2)));
  },
};

const cache = new Map();

/** Посчитать пиксели текстуры (RGBA). Работает и в Web Worker. */
export function renderPixels(look, w, h) {
  const N = makeNoise(look.seed || 1);
  const fn = STYLES[look.style](N, look);
  const d = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < h; j++) {
    const lat = Math.PI / 2 - ((j + 0.5) / h) * Math.PI;
    const cl = Math.cos(lat), y = Math.sin(lat);
    for (let i = 0; i < w; i++) {
      const lon = ((i + 0.5) / w) * Math.PI * 2 - Math.PI;
      const x = cl * Math.sin(lon), z = cl * Math.cos(lon);
      const c = fn(lat, lon, x, y, z);
      const k = (j * w + i) * 4;
      d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
    }
  }
  return d;
}

function toCanvas(px, w, h) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  cv.getContext("2d").putImageData(new ImageData(px, w, h), 0, 0);
  return cv;
}

/** Сгенерировать текстуру синхронно (для маленьких размеров). */
export function makeTexture(look, w = 1024, h = 512) {
  const key = JSON.stringify(look) + w;
  if (cache.has(key)) return cache.get(key);
  const cv = toCanvas(renderPixels(look, w, h), w, h);
  cache.set(key, cv);
  return cv;
}

// ---------- фоновая генерация в Web Worker, чтобы страница не «замирала»
let worker = null, workerFailed = false, seq = 0;
const pending = new Map();
const asyncCache = new Map();
function getWorker() {
  if (worker || workerFailed) return worker;
  try {
    worker = new Worker(new URL("./texworker.js", import.meta.url), { type: "module" });
    worker.onmessage = (e) => { const p = pending.get(e.data.id); pending.delete(e.data.id); p?.(e.data.px); };
    worker.onerror = () => { workerFailed = true; worker = null; for (const [id, res] of pending) res(null); pending.clear(); };
  } catch { workerFailed = true; worker = null; }
  return worker;
}
const idle = () => new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 300 }) : setTimeout(r, 16)));

/** Асинхронно получить canvas с текстурой. */
export function makeTextureAsync(look, w = 1024, h = 512) {
  const key = JSON.stringify(look) + w;
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  if (asyncCache.has(key)) return asyncCache.get(key);
  const pr = (async () => {
    let px = null;
    const wk = getWorker();
    if (wk) px = await new Promise((res) => { const id = ++seq; pending.set(id, res); wk.postMessage({ id, look, w, h }); });
    if (!px) { await idle(); px = renderPixels(look, w, h); }
    const cv = toCanvas(px, w, h);
    cache.set(key, cv);
    return cv;
  })();
  asyncCache.set(key, pr);
  return pr;
}

/** Текстура колец Сатурна/Урана: полоса по радиусу (x = радиус, y — нет). */
export function makeRingTexture(kind = "saturn") {
  const key = "ring:" + kind;
  if (cache.has(key)) return cache.get(key);
  const w = 1024, cv = document.createElement("canvas");
  cv.width = w; cv.height = 4;
  const ctx = cv.getContext("2d");
  const N = makeNoise(kind === "saturn" ? 4 : 8);
  for (let i = 0; i < w; i++) {
    const t = i / (w - 1);
    let a, col;
    if (kind === "saturn") {
      // радиусы в тыс. км: D 67–74.5, C 74.5–92, B 92–117.6, деление Кассини 117.6–122.2, A 122.2–136.8 (щель Энке 133.6), F 140.2
      const r = 67 + t * (141 - 67);
      a = 0;
      if (r < 74.5) a = 0.04;
      else if (r < 92) a = 0.18 + 0.1 * N.n3(r * 0.9, 0, 0);
      else if (r < 117.6) a = 0.85 + 0.12 * N.n3(r * 1.3, 1, 0);
      else if (r < 122.2) a = 0.06;
      else if (r < 136.8) a = (Math.abs(r - 133.6) < 0.18 ? 0 : 0.6 + 0.1 * N.n3(r * 2, 2, 0));
      else if (Math.abs(r - 140.2) < 0.35) a = 0.6;
      const tone = r < 92 ? [150, 130, 105] : r < 117.6 ? [230, 214, 182] : [205, 190, 160];
      col = tone;
    } else {
      // тонкие тёмные кольца Урана (ε — самое яркое)
      const r = t;
      a = 0;
      for (const rr of [0.12, 0.2, 0.26, 0.31, 0.36, 0.42, 0.5, 0.58]) if (Math.abs(r - rr) < 0.006) a = 0.5;
      if (Math.abs(r - 0.82) < 0.02) a = 0.8;
      col = [190, 200, 205];
    }
    ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${Math.max(0, Math.min(1, a))})`;
    ctx.fillRect(i, 0, 1, 4);
  }
  cache.set(key, cv);
  return cv;
}
