// «Анатомия» искусственного спутника: подробная 3D-модель из узлов,
// которые можно раздвинуть (разборка), с выносками и подсветкой.
// Внешний вид приближен к настоящим аппаратам: мятая теплоизоляция (фольга),
// солнечные элементы с шинами, рёбра радиаторов, решётчатые фермы.
// Два режима: «Космос» (чёрное небо, Земля, солнечный свет) и «Чертёж».
import * as THREE from "three";
import { createStage, follow, reducedMotion, liveTexture, spreadBadges } from "./gl.js";
import { RoomEnvironment } from "./vendor/RoomEnvironment.js";
import { RoundedBoxGeometry } from "./vendor/RoundedBoxGeometry.js";
import { mulberry } from "./textures.js";
import { BY_ID } from "./data/bodies.js";

// =============================================================== ТЕКСТУРЫ
const texCache = new Map();
function canvasTex(key, w, h, draw, { color = true } = {}) {
  if (texCache.has(key)) return texCache.get(key);
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  draw(cv.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(cv);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (key.startsWith("mli:")) t.repeat.set(2, 2); // складки мельче
  texCache.set(key, t);
  return t;
}
/** Мятая многослойная теплоизоляция (MLI): грани-«складки» светлее и темнее. */
function mliTex(name, base, light, dark, seed = 1) {
  return canvasTex("mli:" + name, 512, 512, (c, w, h) => {
    const r = mulberry(seed);
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) {
      const x = r() * w, y = r() * h, s = 6 + r() * 24;
      c.globalAlpha = 0.08 + r() * 0.22;
      c.fillStyle = r() < 0.5 ? light : dark;
      c.beginPath(); c.moveTo(x, y);
      for (let k = 0; k < 3; k++) c.lineTo(x + (r() - 0.5) * s * 2, y + (r() - 0.5) * s * 2);
      c.closePath(); c.fill();
    }
    // швы между одеялами теплоизоляции
    c.globalAlpha = 0.35; c.strokeStyle = dark; c.lineWidth = 2;
    for (let k = 1; k < 3; k++) { c.beginPath(); c.moveTo(0, (h * k) / 3); c.lineTo(w, (h * k) / 3); c.stroke(); }
    c.globalAlpha = 1;
  });
}
/** Солнечные элементы: ячейки с градиентом, серебристые шины, рамка. */
function cellsTex(name, cell, frame, cols = 4, rows = 8) {
  return canvasTex("cells:" + name, 256, 512, (c, w, h) => {
    const r = mulberry(7);
    c.fillStyle = frame; c.fillRect(0, 0, w, h);
    const cw = w / cols, ch = h / rows;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const g = c.createLinearGradient(x * cw, y * ch, (x + 1) * cw, (y + 1) * ch);
      const k = 0.85 + r() * 0.3;
      g.addColorStop(0, shade(cell, 0.12 * k)); g.addColorStop(1, shade(cell, -0.18 * k));
      c.fillStyle = g; c.fillRect(x * cw + 2, y * ch + 2, cw - 4, ch - 4);
      c.strokeStyle = "rgba(220,225,235,.55)"; c.lineWidth = 1;
      for (let k2 = 1; k2 < 4; k2++) { c.beginPath(); c.moveTo(x * cw + (cw * k2) / 4, y * ch + 2); c.lineTo(x * cw + (cw * k2) / 4, (y + 1) * ch - 2); c.stroke(); }
    }
  });
}
const panelBack = () => canvasTex("pback", 128, 128, (c, w, h) => { c.fillStyle = "#cfd2d6"; c.fillRect(0, 0, w, h); c.strokeStyle = "#9aa0a8"; c.lineWidth = 3; for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo((i * w) / 4, 0); c.lineTo((i * w) / 4, h); c.stroke(); } });
const radiatorTex = () => canvasTex("rad", 128, 256, (c, w, h) => { c.fillStyle = "#f2f2ee"; c.fillRect(0, 0, w, h); c.fillStyle = "#cfd0cb"; for (let i = 0; i < 16; i++) c.fillRect(0, (i * h) / 16, w, 2); c.fillStyle = "#b8bab4"; c.fillRect(0, 0, 3, h); c.fillRect(w - 3, 0, 3, h); });
const quiltTex = () => canvasTex("quilt", 256, 256, (c, w, h) => {
  // белая «стёганая» защитная ткань модулей МКС
  c.fillStyle = "#eceae4"; c.fillRect(0, 0, w, h);
  const n = 6, s = w / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const g = c.createRadialGradient(x * s + s / 2, y * s + s / 2, 2, x * s + s / 2, y * s + s / 2, s * 0.7);
    g.addColorStop(0, "#f8f7f3"); g.addColorStop(1, "#d6d4cc");
    c.fillStyle = g; c.fillRect(x * s + 1, y * s + 1, s - 2, s - 2);
  }
});
const trussTex = () => canvasTex("truss", 256, 64, (c, w, h) => {
  // решётка фермы: прозрачный фон, балки и диагонали
  c.clearRect(0, 0, w, h); c.strokeStyle = "#c9ccd0"; c.lineWidth = 6;
  c.strokeRect(3, 3, w - 6, h - 6);
  for (let i = 0; i < 4; i++) { const x0 = (i * w) / 4; c.beginPath(); c.moveTo(x0, 3); c.lineTo(x0 + w / 4, h - 3); c.moveTo(x0 + w / 4, 3); c.lineTo(x0, h - 3); c.moveTo(x0, 0); c.lineTo(x0, h); c.stroke(); }
});
const gridTex = () => canvasTex("grid", 128, 128, (c, w, h) => { c.fillStyle = "#2b2d33"; c.fillRect(0, 0, w, h); c.fillStyle = "#3b3e46"; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) c.fillRect(x * 16 + 2, y * 16 + 2, 12, 12); });
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), f = (v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// =============================================================== МАТЕРИАЛЫ
const std = (o) => new THREE.MeshStandardMaterial({ emissive: "#ffffff", emissiveIntensity: 0, ...o });
const mli = (name, a, b, c, seed, o = {}) => { const t = mliTex(name, a, b, c, seed); return std({ map: t, bumpMap: t, bumpScale: 1.2, ...o }); };
const M = {
  goldMLI: () => mli("gold", "#c8962e", "#ffe08a", "#6e4a10", 3, { metalness: 0.9, roughness: 0.32 }),
  silverMLI: () => mli("silver", "#b9bec6", "#f4f6fa", "#6c727c", 5, { metalness: 0.85, roughness: 0.3 }),
  blackMLI: () => mli("black", "#202226", "#4a4d55", "#08090a", 9, { metalness: 0.5, roughness: 0.45 }),
  kapton: () => mli("kapton", "#b9b0c6", "#eeeaf4", "#6d6480", 11, { metalness: 0.8, roughness: 0.28, side: THREE.DoubleSide, bumpScale: 0.8 }),
  quilt: () => std({ map: quiltTex(), roughness: 0.85, metalness: 0 }),
  white: () => std({ color: "#ecebe6", roughness: 0.7, metalness: 0.05 }),
  radiator: () => std({ map: radiatorTex(), roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide }),
  alu: () => std({ color: "#c3c7cd", roughness: 0.38, metalness: 0.85 }),
  dark: () => std({ color: "#2e3036", roughness: 0.55, metalness: 0.4 }),
  black: () => std({ color: "#121316", roughness: 0.6, metalness: 0.2 }),
  mirrorGold: () => std({ color: "#f3c35a", roughness: 0.12, metalness: 1 }),
  mirror: () => std({ color: "#eef2f7", roughness: 0.06, metalness: 1 }),
  polished: () => std({ color: "#e3e7ec", roughness: 0.08, metalness: 1 }),
  truss: () => std({ map: trussTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.45, metalness: 0.7 }),
  phased: () => std({ map: gridTex(), roughness: 0.5, metalness: 0.4 }),
  orange: () => std({ color: "#c4492a", roughness: 0.6 }),
  beige: () => std({ color: "#d8cfb4", roughness: 0.75 }),
};
const CELLS = { blue: ["#16285e", "#9aa3b4"], gold: ["#8a5a1c", "#d1b77a"], dark: ["#141a2c", "#5b6170"] };

// =============================================================== ГЕОМЕТРИЯ
const rbox = (w, h, d, m, r = 0.05) => new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2)), m);
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
function cyl(r, len, m, axis = "y", seg = 32, r2 = r) {
  const g = new THREE.CylinderGeometry(r2, r, len, seg);
  if (axis === "x") g.rotateZ(-Math.PI / 2);
  if (axis === "z") g.rotateX(Math.PI / 2);
  return new THREE.Mesh(g, m);
}
const sph = (r, m, seg = 40) => new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg / 2)), m);
function ring(r, tube, m, axis = "y") {
  const g = new THREE.TorusGeometry(r, tube, 8, 48);
  if (axis === "y") g.rotateX(Math.PI / 2);
  if (axis === "x") g.rotateY(Math.PI / 2);
  return new THREE.Mesh(g, m);
}
function dish(r, depth, m) {
  const pts = []; for (let i = 0; i <= 18; i++) { const t = i / 18; pts.push(new THREE.Vector2(t * r, t * t * depth)); }
  return new THREE.Mesh(new THREE.LatheGeometry(pts, 40), m);
}
/** Солнечная панель: сверху элементы, снизу каркас. w — по X, l — по Z. */
function solar(w, l, kind = "blue", cell = 0.32) {
  const [c, f] = CELLS[kind];
  const t = cellsTex(kind, c, f).clone(); t.needsUpdate = true; t.repeat.set(w / (cell * 4), l / (cell * 8));
  const top = std({ map: t, metalness: 0.35, roughness: 0.35 });
  const back = std({ map: panelBack(), roughness: 0.6, metalness: 0.3 });
  const edge = std({ color: "#8d939c", metalness: 0.6, roughness: 0.4 });
  return new THREE.Mesh(new THREE.BoxGeometry(w, 0.025, l), [edge, edge, top, back, edge, edge]);
}
function at(o, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o; }
const grp = (...ms) => { const g = new THREE.Group(); ms.forEach((m) => g.add(m)); return g; };
const along = (axis, v) => (axis === "z" ? [0, 0, v] : axis === "x" ? [v, 0, 0] : [0, v, 0]);
/** Модуль станции: цилиндр в защитной ткани + кольца-шпангоуты и люки на концах. */
function module(r, len, axis = "z", m = M.quilt()) {
  const g = new THREE.Group();
  g.add(cyl(r, len, m, axis, 40));
  for (const s of [-1, 1]) {
    g.add(at(ring(r * 1.01, 0.02, M.alu(), axis), ...along(axis, (s * len) / 2)));
    g.add(at(cyl(r * 0.55, 0.06, M.alu(), axis, 24), ...along(axis, (s * (len + 0.06)) / 2)));
  }
  return g;
}
/** Крыло МКС: две полосы элементов на мачте. */
function issWing(len, dz) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) g.add(at(solar(0.4, len, "gold", 0.18), sx * 0.23, 0, dz * (len / 2 + 0.25)));
  g.add(at(cyl(0.025, len + 0.3, M.alu(), "z", 8), 0, 0, dz * (len / 2 + 0.2)));
  g.add(at(box(0.5, 0.06, 0.12, M.dark()), 0, 0, dz * 0.2));
  return g;
}
/** Деталь модели: имя, описание, объекты и направление разборки. */
const P = (name, desc, objs, d) => ({ name, desc, objs: objs.map((o) => { o.userData.dir = o.userData.dir || d; return o; }) });
const dir = (o, d) => { o.userData.dir = d; return o; };

// =============================================================== МОДЕЛИ
const MODELS = {
  // ---------------------------------------------------------------- МКС
  station() {
    const truss = grp(at(box(8.8, 0.34, 0.34, M.truss())), at(box(8.8, 0.02, 0.02, M.alu()), 0, 0.17, 0.17), at(box(8.8, 0.02, 0.02, M.alu()), 0, -0.17, -0.17), at(box(0.5, 0.5, 0.45, M.alu())));
    const wings = [];
    for (const sx of [-1, 1]) for (const k of [0, 1]) {
      const x = sx * (3.1 + k * 1.05);
      for (const dz of [-1, 1]) wings.push(dir(at(issWing(2.9, dz), x, 0, 0), [sx * 0.6, 0, dz]));
      wings.push(dir(at(cyl(0.12, 0.3, M.alu(), "x"), x, 0, 0), [sx * 0.6, 0, 0]));
    }
    const rads = [];
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) rads.push(dir(at(box(0.55, 2.2, 0.03, M.radiator()), sx * (1.2 + k * 0.08), -1.25, 0.15 - k * 0.09), [sx * 0.3, -1, 0]));
    for (const sx of [-1, 1]) rads.push(dir(at(box(0.32, 0.8, 0.02, M.radiator()), sx * 3.6, 0.6, 0), [0, 1, 0]));
    // герметичные модули (американский сегмент — вперёд, российский — назад)
    const y = -0.62;
    const mods = [
      at(module(0.3, 0.55, "z"), 0, y, -0.35),             // Unity
      at(module(0.3, 0.9, "z"), 0, y, 0.38),               // Destiny
      at(module(0.3, 0.6, "z"), 0, y, 1.13),               // Harmony
      at(module(0.3, 0.65, "x"), 0.65, y, 1.13),           // Columbus
      at(module(0.33, 1.05, "x"), -0.86, y, 1.13),         // Kibo
      at(box(0.75, 0.12, 0.5, M.alu()), -1.75, y, 1.13),   // Kibo — внешняя платформа
      at(module(0.27, 0.45, "y"), -0.86, y + 0.55, 1.13),  // Kibo — грузовой модуль
      at(module(0.3, 0.6, "x"), -0.58, y, -0.35),          // Tranquility
      at(sph(0.17, M.alu()), -0.58, y - 0.33, -0.35),      // Cupola
      at(module(0.3, 1.2, "z", M.white()), 0, y, -1.3),    // Заря
      at(module(0.32, 1.25, "z", M.white()), 0, y, -2.55), // Звезда
      at(cyl(0.13, 0.5, M.alu(), "y"), 0, y + 0.3, -0.35), // соединение с фермой
    ];
    const zvezdaWings = [-1, 1].map((sx) => dir(at(solar(1.25, 0.42, "blue", 0.16), sx * 1.0, y, -2.7), [sx, 0, 0]));
    const arm = grp(at(box(0.25, 0.08, 0.25, M.alu()), 0.9, 0.22, 0), at(cyl(0.045, 1.8, M.white(), "y", 12), 0.9, 1.05, 0, 0, 0, -0.35), at(sph(0.07, M.dark()), 1.2, 1.9, 0), at(cyl(0.045, 1.6, M.white(), "y", 12), 1.65, 2.35, 0, 0, 0, -1.1), at(cyl(0.07, 0.18, M.dark(), "y"), 2.35, 2.6, 0, 0, 0, -1.1));
    const soyuz = grp(at(sph(0.2, M.beige())), at(cyl(0.22, 0.32, M.beige(), "z", 24, 0.12), 0, 0, -0.32), at(cyl(0.22, 0.45, M.silverMLI(), "z"), 0, 0, -0.7), at(solar(0.55, 0.22, "blue", 0.1), 0.45, 0, -0.75), at(solar(0.55, 0.22, "blue", 0.1), -0.45, 0, -0.75));
    const dragon = grp(at(cyl(0.12, 0.42, M.white(), "z", 32, 0.27)), at(cyl(0.27, 0.45, M.white(), "z", 32), 0, 0, 0.42), at(solar(0.36, 0.45, "blue", 0.12), 0.29, 0, 0.42, 0, 0, Math.PI / 2));
    return [
      P("Ферма", "Главная решётчатая «балка» станции длиной 109 м. На ней держатся батареи, радиаторы, манипулятор и научные платформы.", [truss], [0, 0.15, 0]),
      P("Жилые и научные модули", "Герметичные модули в белой защитной ткани от микрометеоритов: «Звезда», «Заря», Unity, Destiny, Harmony, Columbus, «Кибо», Tranquility с окном-куполом Cupola.", mods, [0, -1, 0]),
      P("Солнечные батареи", "8 крыльев длиной по 35 м из 33 000 солнечных элементов. Золотистые — у американского сегмента, синие — у модуля «Звезда».", [...wings, ...zvezdaWings], [1, 0, 0]),
      P("Радиаторы", "Белые панели с аммиаком внутри сбрасывают лишнее тепло в космос.", rads, [0, -1, 0]),
      P("Манипулятор Canadarm2", "Робот-рука длиной 17,6 м: ловит грузовые корабли и переносит космонавтов при выходах в открытый космос.", [arm], [0, 1, 0]),
      P("Корабли «Союз» и Dragon", "Пристыкованные корабли — транспорт и «спасательные шлюпки» экипажа.", [at(soyuz, 0, y, -3.55), at(dragon, 0, y, 1.8)], [0, 0, 1]),
    ];
  },
  // ---------------------------------------------------------------- Тяньгун
  tiangong() {
    const node = grp(at(sph(0.55, M.white())), ...[[1, 0], [-1, 0], [0, 1]].map(([x, z]) => at(cyl(0.2, 0.18, M.alu(), x ? "x" : "z"), x * 0.6, 0, z * 0.6)));
    const core = grp(at(module(0.55, 1.6, "z"), 0, 0, -1.4), at(module(0.75, 1.8, "z", M.white()), 0, 0, -3.1), at(cyl(0.75, 0.25, M.goldMLI(), "z"), 0, 0, -4.1));
    const lab = (sx) => grp(at(module(0.62, 3.2, "x"), sx * 2.2, 0, 0), at(cyl(0.62, 0.2, M.goldMLI(), "x"), sx * 3.85, 0, 0));
    const bigWing = (sx) => grp(...[-1, 1].map((sz) => at(solar(0.9, 5.2, "blue", 0.2), sx * 4.3, 0, sz * 2.9)), at(cyl(0.04, 11, M.alu(), "z", 8), sx * 4.3, 0, 0));
    const shenzhou = grp(at(sph(0.32, M.beige())), at(cyl(0.38, 0.5, M.beige(), "z", 28, 0.22), 0, 0, 0.42), at(cyl(0.4, 0.7, M.silverMLI(), "z"), 0, 0, 1.0), at(solar(1.4, 0.4, "blue", 0.14), 1.1, 0, 1.0), at(solar(1.4, 0.4, "blue", 0.14), -1.1, 0, 1.0));
    return [
      P("Узловой модуль", "Шар с пятью стыковочными портами — к нему пристыкованы лаборатории и корабли.", [node], [0, 0.6, 0]),
      P("Базовый модуль «Тяньхэ»", "Центр управления, каюты, кухня и спортзал для трёх космонавтов.", [core], [0, 0, -1]),
      P("Лаборатории «Вэньтянь» и «Мэнтянь»", "Научные модули по бокам: станция в форме буквы «Т».", [dir(lab(1), [1, 0, 0]), dir(lab(-1), [-1, 0, 0])], [1, 0, 0]),
      P("Гибкие солнечные крылья", "Крылья-«рулоны» размахом около 55 м: тонкие и лёгкие, разворачиваются как гармошка.", [dir(bigWing(1), [1, 0.4, 0]), dir(bigWing(-1), [-1, 0.4, 0]), ...[-1, 1].map((sx) => dir(at(solar(1.9, 0.6, "blue", 0.16), sx * 1.4, 0, -3.3), [sx, 0, 0]))], [1, 0, 0]),
      P("Корабль «Шэньчжоу»", "Корабль экипажа у переднего порта.", [at(shenzhou, 0, 0, 0.95)], [0, 0, 1]),
    ];
  },
  // ---------------------------------------------------------------- Хаббл
  hubble() {
    const tube = grp(at(cyl(0.72, 2.3, M.silverMLI(), "z", 48), 0, 0, 0.45), at(cyl(0.72, 0.7, M.silverMLI(), "z", 48), 0, 0, 1.95), ...[-0.65, 0.4, 1.6, 2.3].map((z) => at(ring(0.73, 0.018, M.alu(), "z"), 0, 0, z)),
      ...[0, 1, 2, 3].map((k) => at(box(0.04, 0.04, 2.0, M.orange()), Math.cos((k * Math.PI) / 2 + 0.4) * 0.74, Math.sin((k * Math.PI) / 2 + 0.4) * 0.74, 0.6)));
    const aft = grp(at(cyl(0.78, 1.35, M.silverMLI(), "z", 48), 0, 0, -1.35), at(cyl(0.78, 0.05, M.dark(), "z", 48), 0, 0, -2.04), ...[0, 1, 2, 3].map((k) => at(rbox(0.3, 0.42, 0.9, M.white()), Math.cos(k * 1.57) * 0.82, Math.sin(k * 1.57) * 0.82, -1.35, 0, 0, k * 1.57)));
    const door = at(grp(at(cyl(0.72, 0.04, M.silverMLI(), "z", 48), 0, 0.72, 0)), 0, -0.72, 2.32, -1.75, 0, 0);
    const wing = (sx) => grp(at(solar(1.0, 2.9, "blue", 0.2), sx * 1.55, 0, -0.35), at(cyl(0.03, 0.8, M.alu(), "x", 8), sx * 0.95, 0, -0.35), at(box(0.08, 0.08, 2.9, M.alu()), sx * 1.55, 0, -0.35));
    const hga = (sy) => grp(at(cyl(0.025, 1.2, M.alu(), "y", 8), 0, sy * 1.35, -0.9), at(dish(0.38, 0.14, M.white()), 0, sy * 1.95, -0.9, sy > 0 ? 0 : Math.PI, 0, 0), at(cyl(0.02, 0.2, M.dark(), "y", 6), 0, sy * 2.08, -0.9));
    return [
      P("Труба телескопа", "Корпус длиной 13 м в серебристой многослойной теплоизоляции. Оранжевые полосы — поручни для астронавтов-ремонтников.", [tube], [0, 0, 0]),
      P("Главное зеркало 2,4 м", "Собирает свет звёзд. Отполировано с точностью в сотые доли длины волны света.", [at(cyl(0.6, 0.12, M.mirror(), "z", 48), 0, 0, -0.55), at(cyl(0.6, 0.06, M.black(), "z", 48), 0, 0, -0.63)], [0, 1.5, 0]),
      P("Приборный отсек", "Камеры и спектрографы в отсеках, которые астронавты меняли при пяти ремонтах.", [aft], [0, 0, -1]),
      P("Крышка апертуры", "Откинутая крышка: закрывается сама, если телескоп повернётся к Солнцу.", [door], [0, 0.6, 1]),
      P("Солнечные батареи", "Две жёсткие панели, ≈5,5 кВт.", [dir(wing(1), [1, 0, 0]), dir(wing(-1), [-1, 0, 0])], [1, 0, 0]),
      P("Антенны связи", "Две параболические антенны на штангах передают данные через спутники-ретрансляторы TDRS.", [dir(hga(1), [0, 1, 0]), dir(hga(-1), [0, -1, 0])], [0, 1, 0]),
    ];
  },
  // ---------------------------------------------------------------- Джеймс Уэбб
  jwst() {
    const shape = new THREE.Shape();
    [[-3.4, 0], [-2.1, 1.5], [2.1, 1.5], [3.4, 0], [2.1, -1.5], [-2.1, -1.5]].forEach(([x, z], i) => shape[i ? "lineTo" : "moveTo"](x, z));
    const layers = [0, 1, 2, 3, 4].map((i) => { const g = new THREE.ShapeGeometry(shape); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, M.kapton()); m.position.y = -0.4 + i * 0.075; m.scale.setScalar(1 - i * 0.035); m.userData.dir = [0, (i - 2) * 0.45, 0]; return m; });
    const boom = at(cyl(0.03, 6.6, M.alu(), "x", 8), 0, -0.42, 0);
    const segs = [];
    const hex = new THREE.Shape(); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; hex[i ? "lineTo" : "moveTo"](Math.cos(a) * 0.3, Math.sin(a) * 0.3); }
    const hg = new THREE.ExtrudeGeometry(hex, { depth: 0.05, bevelEnabled: false });
    const cells = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1], [2, 0], [2, -1], [2, -2], [1, 1], [0, 2], [-1, 2], [-2, 2], [-2, 1], [-2, 0], [-1, -1], [0, -2], [1, -2]];
    cells.forEach(([q, r]) => { const x = 0.535 * (q + r / 2), yy = 0.4635 * r; const m = new THREE.Mesh(hg, M.mirrorGold()); m.position.set(x, 1.45 + yy, 0.45 - (x * x + yy * yy) * 0.04); segs.push(m); });
    const backplane = at(cyl(1.25, 0.12, M.black(), "z", 6), 0, 1.45, 0.38, 0, 0, Math.PI / 6);
    const struts = [0, 1, 2].map((k) => {
      const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
      const p0 = new THREE.Vector3(Math.cos(a) * 1.15, 1.45 + Math.sin(a) * 1.15, 0.45), p1 = new THREE.Vector3(0, 1.45, 2.3);
      const c = cyl(0.02, p0.distanceTo(p1), M.black(), "y", 6);
      c.position.copy(p0).add(p1).multiplyScalar(0.5);
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize());
      return c;
    });
    const secondary = grp(at(cyl(0.16, 0.05, M.mirrorGold(), "z", 6), 0, 1.45, 2.3), ...struts);
    const isim = grp(at(rbox(0.9, 0.85, 0.55, M.blackMLI()), 0, 1.25, -0.05), at(cyl(0.06, 0.9, M.alu(), "y", 8), 0, 0.4, 0));
    const bus = grp(at(rbox(1.3, 0.5, 1.1, M.goldMLI()), 0, -0.95, 0), at(solar(1.6, 0.9, "blue", 0.18), 0, -1.22, -1.15, 0.25, 0, 0), at(dish(0.3, 0.1, M.white()), 0.5, -1.3, 0.45, Math.PI, 0, 0), at(cyl(0.05, 0.25, M.dark(), "y", 8), -0.4, -1.27, 0.4));
    return [
      P("Солнечный щит (5 слоёв)", "Пять слоёв каптона с алюминиевым напылением размером с теннисный корт. Сторона к Солнцу нагревается до +85 °C, а у зеркала −233 °C.", [...layers, boom], [0, 1, 0]),
      P("Главное зеркало 6,5 м", "18 шестиугольных сегментов из бериллия, покрытых тонким слоем золота — оно лучше всего отражает инфракрасный свет.", [...segs, backplane], [0, 1, 0.8]),
      P("Вторичное зеркало", "Маленькое зеркало на трёх штангах направляет свет обратно к приборам.", [secondary], [0, 0.3, 1.2]),
      P("Научные приборы", "NIRCam, NIRSpec, MIRI и NIRISS спрятаны в чёрном модуле за зеркалом, в холоде.", [isim], [0, 0, -1]),
      P("Служебный модуль", "Компьютер, двигатели, связь и солнечная батарея — на горячей стороне щита.", [bus], [0, -1, 0]),
    ];
  },
  // ---------------------------------------------------------------- навигация
  gnss() {
    const body = grp(at(rbox(1.3, 1.3, 1.4, M.goldMLI(), 0.06)), at(box(1.32, 0.02, 1.42, M.alu()), 0, 0.65, 0), ...[-1, 1].map((sz) => at(box(1.0, 1.0, 0.02, M.radiator()), 0, 0, sz * 0.71)));
    const wing = (sx) => grp(at(cyl(0.04, 0.9, M.alu(), "x", 8), sx * 1.1, 0, 0), ...[0, 1, 2].map((k) => at(solar(1.05, 1.5, "blue", 0.2), sx * (2.15 + k * 1.1), 0, 0)));
    const helices = [];
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2, r = k % 2 ? 0.42 : 0.28; helices.push(at(cyl(0.05, 0.32, M.white(), "y", 12), Math.cos(a) * r, -0.86, Math.sin(a) * r)); }
    return [
      P("Корпус", "Платформа в золотистой теплоизоляции: топливо, аккумуляторы, компьютер.", [body], [0, 0, 0]),
      P("Атомные часы", "Сердце навигации: цезиевые и рубидиевые часы. Ошибка в одну миллиардную секунды — это 30 см на Земле.", [at(rbox(0.32, 0.3, 0.42, M.alu()), -0.2, 0.15, 0), at(rbox(0.32, 0.3, 0.42, M.alu()), 0.2, 0.15, 0)], [0, 1.5, 0]),
      P("Навигационная антенна", "Решётка спиральных антенн смотрит на Землю и непрерывно передаёт сигнал времени.", [at(cyl(0.55, 0.06, M.alu(), "y", 32), 0, -0.68, 0), ...helices], [0, -1.3, 0]),
      P("Солнечные батареи", "Два крыла поворачиваются вслед за Солнцем.", [dir(wing(1), [1, 0, 0]), dir(wing(-1), [-1, 0, 0])], [1, 0, 0]),
    ];
  },
  // ---------------------------------------------------------------- геостационар / Молния
  geo() {
    const body = grp(at(rbox(1.6, 1.9, 1.6, M.goldMLI(), 0.06)), ...[-1, 1].map((sx) => at(box(0.02, 1.6, 1.4, M.radiator()), sx * 0.81, 0, 0)), at(box(1.62, 0.03, 1.62, M.white()), 0, 0.95, 0));
    const wing = (sx) => grp(at(cyl(0.045, 1.0, M.alu(), "x", 8), sx * 1.25, 0, 0), ...[0, 1, 2, 3].map((k) => at(solar(1.15, 1.7, "blue", 0.22), sx * (2.35 + k * 1.2), 0, 0)));
    const refl = (sz) => grp(at(dish(1.05, 0.32, M.white()), 0, 0.1, sz * 1.45, sz * (-Math.PI / 2 + 0.35), 0, 0), at(cyl(0.03, 0.8, M.alu(), "z", 6), 0, -0.5, sz * 1.0));
    const feeds = [-1, 1].map((sz) => at(cyl(0.07, 0.35, M.alu(), "z", 16, 0.15), 0, 0.75, sz * 0.55));
    return [
      P("Корпус", "Платформа: топливо на 15 лет, аккумуляторы, компьютер. Белые панели по бокам — радиаторы.", [body], [0, 0, 0]),
      P("Антенны-рефлекторы", "Большие «тарелки» направляют сигнал на нужную страну.", [dir(refl(1), [0, 0, 1]), dir(refl(-1), [0, 0, -1])], [0, 0, 1]),
      P("Облучатели и ретрансляторы", "Рупоры освещают рефлекторы, а транспондеры внутри усиливают сигнал.", [...feeds, at(cyl(0.2, 0.3, M.alu(), "y", 24), 0.4, 1.1, 0), at(dish(0.25, 0.08, M.white()), -0.4, 1.0, 0)], [0, 1.3, 0]),
      P("Двигатель", "Апогейный двигатель довёл спутник до рабочей орбиты, малые двигатели держат его на месте.", [at(cyl(0.12, 0.45, M.dark(), "y", 24, 0.28), 0, -1.18, 0)], [0, -1.3, 0]),
      P("Солнечные батареи", "Длинные крылья дают 10–20 кВт.", [dir(wing(1), [1, 0, 0]), dir(wing(-1), [-1, 0, 0])], [1, 0, 0]),
    ];
  },
  // ---------------------------------------------------------------- Starlink
  starlink() {
    const chassis = grp(at(rbox(2.7, 0.16, 1.3, M.dark(), 0.03)), at(box(2.72, 0.02, 1.32, M.alu()), 0, 0.085, 0));
    const tiles = [[-0.85, -0.3], [-0.85, 0.3], [0.85, -0.3], [0.85, 0.3]].map(([x, z]) => at(box(0.75, 0.04, 0.52, M.phased()), x, -0.11, z));
    const array = grp(at(solar(1.35, 5.6, "dark", 0.22), 0, 0.55, -3.3), at(cyl(0.035, 1.0, M.alu(), "y", 8), 0, 0.3, -0.5, 0.9, 0, 0), at(box(0.2, 0.08, 0.2, M.alu()), 0, 0.12, -0.5));
    return [
      P("Плоский корпус", "Плоский, чтобы в ракету влезло до 60 спутников стопкой, как блины.", [chassis], [0, 0, 0]),
      P("Фазированные антенны", "Четыре плоские антенны без движущихся частей: «наводят» луч электроникой.", tiles, [0, -1.2, 0]),
      P("Солнечная батарея", "Одно большое крыло на штанге.", [array], [0, 0.6, -1]),
      P("Ионный двигатель", "Холловский двигатель на криптоне или аргоне поднимает спутник на орбиту и уводит в атмосферу в конце службы.", [at(cyl(0.12, 0.22, M.alu(), "x", 24, 0.17), 1.45, 0, 0), at(cyl(0.08, 0.02, M.dark(), "x", 24), 1.56, 0, 0)], [1.3, 0, 0]),
      P("Звёздные датчики", "Камеры смотрят на звёзды, чтобы спутник знал, куда он повёрнут.", [at(cyl(0.07, 0.2, M.black(), "y", 16), -1.1, 0.18, 0.4), at(cyl(0.07, 0.2, M.black(), "y", 16), -1.1, 0.18, -0.4)], [0, 1, 0]),
    ];
  },
  // ---------------------------------------------------------------- наблюдение Земли / наука
  eo() {
    const body = grp(at(rbox(1.4, 1.4, 2.0, M.goldMLI(), 0.06)), at(box(0.02, 1.1, 1.5, M.radiator()), 0.71, 0, 0), at(box(1.42, 0.02, 2.02, M.alu()), 0, 0.7, 0));
    const telescope = grp(at(cyl(0.42, 0.9, M.silverMLI(), "y", 40), 0, -1.15, 0.3), at(cyl(0.44, 0.35, M.black(), "y", 40), 0, -1.75, 0.3), at(cyl(0.3, 0.02, M.mirror(), "y", 40), 0, -1.6, 0.3));
    const wing = grp(at(cyl(0.035, 1.1, M.alu(), "x", 8), 1.25, 0.3, 0), at(solar(1.45, 3.6, "blue", 0.22), 2.55, 0.3, 0, 0, 0, 0.3));
    return [
      P("Корпус", "Служебная платформа: питание, компьютер, двигатели ориентации, запоминающее устройство.", [body], [0, 0, 0]),
      P("Камера / телескоп", "Главный прибор смотрит вниз на Землю и снимает в видимом и инфракрасном свете.", [telescope], [0, -1.3, 0]),
      P("Дополнительные приборы", "Радиометры и датчики облаков, температуры и льдов.", [at(rbox(0.55, 0.4, 0.55, M.silverMLI()), 0.35, 0.95, -0.5), at(rbox(0.4, 0.3, 0.4, M.white()), -0.4, 0.88, 0.5), at(cyl(0.08, 0.25, M.black(), "y"), -0.45, 0.95, -0.6)], [0, 1.2, 0]),
      P("Солнечная батарея", "Одно крыло, повёрнутое к Солнцу.", [wing], [1.3, 0, 0]),
      P("Антенна передачи данных", "Сбрасывает снимки на наземные станции при пролёте.", [at(dish(0.32, 0.12, M.white()), -0.55, -0.82, -0.75, Math.PI, 0, 0), at(cyl(0.025, 0.2, M.alu(), "y", 6), -0.55, -0.75, -0.75)], [-1, -0.5, -1]),
    ];
  },
  // ---------------------------------------------------------------- Спутник-1 / Авангард-1
  sputnik() {
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.9, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), M.polished());
    const bot = new THREE.Mesh(new THREE.SphereGeometry(0.9, 64, 32, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.polished());
    top.material.side = bot.material.side = THREE.DoubleSide;
    const seam = ring(0.905, 0.025, M.alu(), "y");
    const ants = [[1, 1, 2.9], [1, -1, 2.4], [-1, 1, 2.9], [-1, -1, 2.4]].map(([sx, sz, L]) => {
      const g = new THREE.Group();
      const dv = new THREE.Vector3(sx * 0.32, -0.12, sz * 0.12 - 1).normalize();
      const base = new THREE.Vector3(sx * 0.45, 0.35, -0.55);
      const rod = cyl(0.018, L, M.alu(), "y", 8); rod.position.copy(base).addScaledVector(dv, L / 2); rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dv);
      const col = cyl(0.05, 0.14, M.alu(), "y", 12); col.position.copy(base); col.quaternion.copy(rod.quaternion);
      g.add(rod, col); return g;
    });
    return [
      P("Верхняя полусфера", "Корпус из алюминиевого сплава толщиной 2 мм, отполированный до зеркального блеска, чтобы отражать солнечное тепло.", [top, seam], [0, 1.3, 0]),
      P("Нижняя полусфера", "Вторая половина герметичного корпуса, заполненного азотом. Вентилятор гонял газ, чтобы выровнять температуру.", [bot], [0, -1.3, 0]),
      P("Радиопередатчик", "Передавал знаменитое «бип-бип» на частотах 20 и 40 МГц — его ловили радиолюбители по всему миру.", [at(rbox(0.5, 0.28, 0.42, M.dark()), 0, 0.12, 0), at(cyl(0.05, 0.1, M.orange(), "y"), 0.15, 0.3, 0)], [0, 0.55, 0]),
      P("Батареи", "Серебряно-цинковые аккумуляторы питали передатчик 22 дня.", [at(rbox(0.7, 0.24, 0.5, M.orange()), 0, -0.22, 0)], [0, -0.55, 0]),
      P("Антенны", "Четыре штыря длиной 2,4 и 2,9 м, отогнутые назад.", ants, [0, 0, -1]),
    ];
  },
};

// =============================================================== НАСТОЯЩИЕ 3D-МОДЕЛИ (.glb)
// Узлы в файле называются p<номер детали>_…; dir — куда деталь отъезжает при разборке.
const GLB = {
  hubble: {
    url: "models/hubble.glb",
    rotY: -Math.PI / 2.4, // трубой вбок, крышкой влево — как на фото
    parts: [
      { name: "Труба телескопа", desc: "Корпус длиной 13 м и диаметром 4,2 м в серебристой многослойной теплоизоляции. Внутри — чёрные бленды, они гасят паразитный свет. Жёлтые поручни — для астронавтов-ремонтников.", dir: [0, 0, 0] },
      { name: "Главное зеркало 2,4 м", desc: "Собирает свет звёзд. Отполировано так гладко, что если бы оно было размером с Землю, самая высокая «гора» на нём была бы ниже 15 см.", dir: [0, 1.5, 0] },
      { name: "Вторичное зеркало", desc: "Зеркало диаметром 30 см на растяжках-«спицах». Отражает свет обратно через отверстие в главном зеркале — к приборам.", dir: [0, 1.25, -0.4] },
      { name: "Приборный отсек", desc: "Камеры и спектрографы в отсеках с дверцами. Астронавты пять раз прилетали на шаттле и меняли приборы прямо в космосе.", dir: [0, 0, 1] },
      { name: "Крышка апертуры", desc: "Откинутая крышка на входе трубы. Закроется сама, если телескоп повернётся к Солнцу — иначе свет сжёг бы приборы.", dir: [0, 0, -1] },
      { name: "Солнечные батареи", desc: "Две панели по 2,6 × 7,1 м дают ≈5,5 кВт. На тени Земли телескоп работает от аккумуляторов.", dir: [0, 1, 0], dirs: { p5_solar_a: [0, 1, 0], p5_solar_b: [0, -1, 0] } },
      { name: "Антенны связи", desc: "Две параболические антенны на длинных штангах передают снимки через спутники-ретрансляторы TDRS.", dir: [1, 0, 0], dirs: { p6_antenna_a: [1, 0, 0], p6_antenna_b: [-1, 0, 0] } },
    ],
  },
  jwst: {
    url: "models/jwst.glb",
    view: [1.0, 0.3, 0.28], // сбоку-сверху: видны и золотое зеркало, и слои щита
    parts: [
      { name: "Солнечный щит (5 слоёв)", desc: "Пять слоёв каптона толщиной с волос, размером с теннисный корт. Сторона к Солнцу нагревается до +85 °C, а у зеркала −233 °C. При разборке слои расходятся.", dir: [0, 0, 0], layers: true },
      { name: "Главное зеркало 6,5 м", desc: "18 шестиугольных сегментов из бериллия, покрытых тонким слоем золота — оно лучше всего отражает инфракрасный свет. В космосе зеркало раскрылось, как цветок.", dir: [0, 0.9, -0.2] },
      { name: "Вторичное зеркало", desc: "Круглое зеркало 0,74 м на трёх длинных штангах. Собирает свет с главного зеркала и направляет его к приборам.", dir: [0, 0.35, 1] },
      { name: "Научные приборы", desc: "NIRCam, NIRSpec, MIRI и NIRISS спрятаны в модуле за зеркалом, в холоде и тени. MIRI охлаждают до −266 °C.", dir: [0, 0.4, -1] },
      { name: "Служебный модуль", desc: "Компьютер, двигатели, связь и солнечная батарея — на горячей стороне щита. Башня соединяет его с холодной частью.", dir: [0, -1, 0] },
    ],
  },
};
export const hasRealModel = (sat) => !!GLB[sat.glb];

// =============================================================== ОКРУЖЕНИЕ «КОСМОС»
function makeStars(n) {
  const r = mulberry(21), pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1, t = r() * Math.PI * 2, s = Math.sqrt(1 - u * u), R = 900;
    pos.set([Math.cos(t) * s * R, u * R, Math.sin(t) * s * R], i * 3);
    const b = 0.45 + r() * 0.55, warm = r();
    col.set([b, b * (0.92 + warm * 0.08), b * (1.05 - warm * 0.15)], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
}
function makeEarth(sat) {
  const g = new THREE.Group();
  const R = 60;
  const tex = liveTexture(BY_ID.earth.look, 1024, 512, { mobileScale: 0.5 });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), new THREE.MeshStandardMaterial({ map: tex, color: "#c9ccd2", roughness: 0.95, metalness: 0 }));
  earth.rotation.set(0.3, 2.2, 0.1);
  // атмосфера — светящийся голубой край
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.025, 96, 64), new THREE.ShaderMaterial({
    transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { c: { value: new THREE.Color("#4f9bff") } },
    vertexShader: "varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }",
    fragmentShader: "uniform vec3 c; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 3.0); gl_FragColor = vec4(c, f*0.9); }",
  }));
  g.add(earth, atmo);
  // далёкие аппараты (Уэбб, SOHO, TESS) — Земля маленькая и вдалеке
  const far = sat.lag || sat.a > 100000;
  if (far) { g.position.set(-90, -30, -420); g.scale.setScalar(0.3); } else g.position.set(0, -R - 16, -45); // горизонт — в нижней трети кадра
  g.userData.earth = earth;
  return g;
}

/** Смонтировать модель спутника с разборкой и выносками. */
export function mountSat({ stage, svg, labelsEl, sat, onReadout, onPart, space = true }) {
  const S = createStage(stage, { fov: 30, far: 3000 });
  const { scene, camera, controls, renderer } = S;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  // свет: в режиме «Космос» — солнце, закреплённое в пространстве, и голубой отсвет Земли снизу
  const camLights = camera.children.filter((c) => c.isLight);
  camLights.forEach((l) => (l.userData.i0 = l.intensity));
  const hemi = scene.children.find((c) => c.isHemisphereLight);
  const sun = new THREE.DirectionalLight(0xfff4e6, 3.0); sun.position.set(6, 4, 5); scene.add(sun);
  const earthGlow = new THREE.DirectionalLight(0x7fa8ff, 0.6); earthGlow.position.set(0, -6, 0); scene.add(earthGlow);
  const stars = makeStars(S.mobile ? 900 : 1600); scene.add(stars);
  const earth = makeEarth(sat); scene.add(earth);

  // детали: у «Хаббла» и «Уэбба» — настоящие 3D-модели (грузятся из .glb), у остальных — собраны из фигур
  const real = GLB[sat.glb];
  const parts = real ? real.parts.map((p) => ({ name: p.name, desc: p.desc, objs: [] })) : (MODELS[sat.model] || MODELS.eo)();
  const root = new THREE.Group(); scene.add(root);
  const state = { ex: 0, exT: 0.3, hover: -1, pinned: -1, space, ready: !real };
  let spread = 1, rad = 1, fly = null;
  const home = { pos: new THREE.Vector3(), target: new THREE.Vector3() };

  function addPart(i, o, k = 1) {
    o.traverse((m) => { if (m.isMesh) m.userData.part = i; });
    o.userData.home = o.position.clone();
    o.userData.dirV = new THREE.Vector3(...(o.userData.dir || [0, 0, 0]));
    o.userData.k = k; // масштаб родителя: разборка задаётся в мировых единицах
  }
  /** Вписать модель в кадр и запомнить «домашний» вид камеры. */
  function fit() {
    const bb = new THREE.Box3().setFromObject(root), size = bb.getSize(new THREE.Vector3()), ctr = bb.getCenter(new THREE.Vector3());
    root.position.sub(ctr);
    rad = size.length() / 2;
    const dist = (rad / Math.tan(THREE.MathUtils.degToRad(15))) * 1.12;
    const vw = new THREE.Vector3(...(real?.view || [0.55, 0.38, 0.74])).normalize().multiplyScalar(dist);
    home.pos.copy(vw); home.target.set(0, 0, 0);
    camera.position.copy(home.pos); controls.target.copy(home.target);
    // приближение: можно подлететь почти вплотную к детали
    controls.minDistance = rad * 0.18; controls.maxDistance = dist * 2.4;
    camera.near = Math.max(0.005, rad * 0.004); camera.updateProjectionMatrix();
    spread = rad * 0.42;
  }

  if (!real) {
    parts.forEach((p, i) => p.objs.forEach((o) => { root.add(o); addPart(i, o); }));
    fit();
  } else {
    import("./glb.js").then(({ loadGLB, partNodes, crisp }) => loadGLB(real.url).then((gltf) => {
      if (disposed) return;
      const model = gltf.scene;
      // привести к размеру ≈ упрощённых моделей (Земля и звёзды на фоне рассчитаны на него)
      const bb0 = new THREE.Box3().setFromObject(model), k = 7 / bb0.getSize(new THREE.Vector3()).length();
      model.scale.setScalar(k);
      if (real.rotY) model.rotation.y = real.rotY;
      root.add(model);
      model.traverse((m) => {
        if (!m.isMesh) return;
        m.material = m.material.clone(); // своя копия: подсветка детали не задевает соседние
        const mt = m.material;
        mt.side = THREE.DoubleSide;
        if (mt.emissive && !mt.emissiveMap) { mt.emissive.set("#ffffff"); mt.emissiveIntensity = 0; }
        if (/gold/i.test(mt.name)) { mt.color.set("#ffd98a"); mt.metalness = 1; mt.roughness = 0.12; mt.envMapIntensity = 2.4; }
        crisp(mt, renderer);
      });
      const nodes = partNodes(model);
      real.parts.forEach((p, i) => {
        const mine = nodes.filter((n) => +n.name.match(/^p(\d+)_/)[1] === i);
        mine.sort((a, b) => a.name.localeCompare(b.name));
        const layers = p.layers ? mine.filter((n) => /layer/.test(n.name)) : [];
        mine.forEach((n) => {
          n.userData.dir = p.dirs?.[n.name] || p.dir;
          // слои щита расходятся веером вверх-вниз
          if (layers.includes(n)) n.userData.dir = [0, (layers.indexOf(n) - (layers.length - 1) / 2) * 0.5, 0];
          parts[i].objs.push(n); addPart(i, n, k);
        });
      });
      fit();
      state.ready = true; state.ex = 0;
      layoutDirty = true; readout();
      stage.classList.add("glb-ready");
    })).catch((e) => { console.error(e); onReadout?.("Не удалось загрузить 3D-модель — проверь интернет"); });
  }

  function applySpace() {
    const on = state.space;
    scene.background = on ? new THREE.Color("#04060b") : null;
    stars.visible = earth.visible = sun.visible = earthGlow.visible = on;
    camLights.forEach((l) => (l.intensity = on ? l.userData.i0 * 0.15 : l.userData.i0));
    if (hemi) hemi.intensity = on ? 0.12 : 0.55;
    scene.environmentIntensity = on ? 0.55 : 1;
    stage.closest(".plate")?.classList.toggle("space", on);
  }
  applySpace();

  // ---- выноски: видна только та, на которую навели (или выбрали), — с описанием
  const NS = "http://www.w3.org/2000/svg";
  svg.innerHTML = ""; labelsEl.innerHTML = "";
  svg.classList.add("reveal"); labelsEl.classList.add("reveal");
  const callouts = parts.map((p, i) => {
    const path = document.createElementNS(NS, "path"), dot = document.createElementNS(NS, "circle");
    dot.setAttribute("r", "2.6"); svg.append(path, dot);
    const el = document.createElement("div"); el.className = "callout-label"; el.dataset.n = String(i + 1).padStart(2, "0");
    el.innerHTML = `<b>${String(i + 1).padStart(2, "0")} ${p.name}</b><span class="d">${p.desc}</span>`;
    el.addEventListener("pointerenter", () => setHover(i)); el.addEventListener("pointerleave", () => setHover(-1));
    el.addEventListener("click", () => setPinned(state.pinned === i ? -1 : i));
    labelsEl.append(el);
    return { path, dot, el };
  });
  const tmpBox = new THREE.Box3();
  const anchors = parts.map(() => new THREE.Vector3());
  let layoutDirty = true;
  function layout() {
    if (!state.ready) return;
    const W = S.width, H = S.height;
    const compact = W < 560; // телефон: номера деталей прямо на модели
    const a = active();
    const items = parts.map((p, i) => {
      // якорь — центр первого куска детали (у симметричных крыльев общий центр попал бы на корпус)
      tmpBox.makeEmpty(); tmpBox.expandByObject(p.objs[0]);
      tmpBox.getCenter(anchors[i]);
      return { i, p: S.project(anchors[i]) };
    });
    if (items.some((x) => !isFinite(x.p.x) || !isFinite(x.p.y))) return; // первый кадр: камера ещё не обновлена
    if (compact) {
      const bs = spreadBadges(items.map((x) => ({ x: x.p.x, y: x.p.y, it: x })));
      bs.forEach((b) => { b.it.bx = b.x; b.it.by = b.y; });
      items.forEach((x) => {
        const c = callouts[x.i], on = a === x.i;
        c.el.classList.add("compact"); c.path.style.opacity = "0"; c.dot.style.opacity = "0";
        c.el.style.left = x.bx + "px"; c.el.style.top = x.by + "px";
        c.el.classList.toggle("on", on);
        c.el.style.opacity = x.p.z > 1 ? 0 : "";
      });
      return;
    }
    callouts.forEach((c) => { c.el.classList.remove("compact"); c.path.style.opacity = ""; c.dot.style.opacity = ""; });
    const colX = W - 250, gap = 30, total = (items.length - 1) * gap;
    items.sort((p, q) => p.p.y - q.p.y);
    const y0 = Math.max(52, Math.min(H - 52 - total, H / 2 - total / 2));
    items.forEach((x, k) => {
      const c = callouts[x.i], on = a === x.i;
      // описание под подписью не должно вылезать за нижний край
      const ly = on ? Math.min(y0 + k * gap, H - 120) : y0 + k * gap;
      c.el.style.left = colX + 14 + "px"; c.el.style.top = ly - 7 + "px";
      const px = Math.min(x.p.x, colX - 40), mx = Math.max(px + 18, colX - 30);
      c.path.setAttribute("d", `M${px.toFixed(1)},${x.p.y.toFixed(1)} L${mx.toFixed(1)},${ly.toFixed(1)} L${(colX + 8).toFixed(1)},${ly.toFixed(1)}`);
      c.dot.setAttribute("cx", px.toFixed(1)); c.dot.setAttribute("cy", x.p.y.toFixed(1));
      [c.path, c.dot, c.el].forEach((e) => e.classList.toggle("on", on));
      c.el.classList.remove("dim");
    });
  }
  const active = () => (state.hover >= 0 ? state.hover : state.pinned);
  function highlight() {
    const a = active();
    parts.forEach((p, i) => p.objs.forEach((o) => o.traverse((m) => {
      if (!m.isMesh) return;
      (Array.isArray(m.material) ? m.material : [m.material]).forEach((mt) => { if ("emissiveIntensity" in mt) mt.emissiveIntensity = i === a ? 0.22 : 0; });
    })));
    onPart?.(a); readout();
  }
  function readout() {
    if (!state.ready) { onReadout?.(`${sat.name} · загружаем 3D-модель…`); return; }
    const a = active();
    onReadout?.(a >= 0 ? `${String(a + 1).padStart(2, "0")} ${parts[a].name}` : `${sat.name} · ${parts.length} узлов · разбор ${Math.round(state.ex * 100)}%`);
  }
  let lastPart = 0;
  function setHover(i) { if (state.hover !== i) { state.hover = i; if (i >= 0) lastPart = i; highlight(); } }
  function setPinned(i) { state.pinned = i; if (i >= 0) lastPart = i; highlight(); }

  // ---- приближение: плавный подлёт камеры
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  function flyTo(pos, target) { fly = { pos: pos.clone(), target: target.clone() }; S.touch(); }
  /** Подлететь к детали i (или к целому аппарату, если i < 0). */
  function focus(i) {
    if (!state.ready) return;
    if (i < 0) return flyTo(home.pos, home.target);
    tmpBox.makeEmpty(); parts[i].objs.forEach((o) => tmpBox.expandByObject(o));
    const c = tmpBox.getCenter(v1), r = Math.max(tmpBox.getSize(v2).length() / 2, rad * 0.12);
    const dir = camera.position.clone().sub(controls.target).normalize();
    const d = Math.min(controls.maxDistance, Math.max(controls.minDistance * 1.05, (r / Math.tan(THREE.MathUtils.degToRad(15))) * 1.25));
    flyTo(c.clone().addScaledVector(dir, d), c);
  }
  function zoomBy(f) {
    const off = camera.position.clone().sub(controls.target);
    const d = THREE.MathUtils.clamp(off.length() * f, controls.minDistance, controls.maxDistance);
    flyTo(controls.target.clone().addScaledVector(off.normalize(), d), controls.target);
  }

  // ---- указатель
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  function pickPart(e) {
    if (!state.ready) return -1;
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const h = ray.intersectObject(root, true).find((x) => x.object.userData.part !== undefined);
    return h ? h.object.userData.part : -1;
  }
  let raf = 0, lastE = null, downAt = null, disposed = false;
  renderer.domElement.addEventListener("pointermove", (e) => { if (e.pointerType === "touch") return; lastE = e; if (!raf) raf = requestAnimationFrame(() => { raf = 0; setHover(pickPart(lastE)); }); });
  renderer.domElement.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch") setHover(-1); });
  renderer.domElement.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; fly = null; });
  renderer.domElement.addEventListener("wheel", () => { fly = null; }, { passive: true });
  // касание (телефон): деталь выбирается и её описание остаётся, пока не коснёшься пустого места.
  // Мышь: описание видно только пока курсор на детали.
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 8) return;
    if (e.pointerType !== "touch") return;
    const i = pickPart(e); setPinned(i === state.pinned ? -1 : i);
  });
  // двойной клик — подлететь к детали; по пустому месту — вернуться к целому аппарату
  renderer.domElement.addEventListener("dblclick", (e) => focus(pickPart(e)));

  let t0 = -1;
  S.onFrame((dt, t, idle) => {
    const rm = reducedMotion();
    if (t0 < 0 && state.ready) t0 = t;
    const intro = t0 < 0 ? 0 : t - t0; // реальное время, а не число кадров — на медленном телефоне не «застревает»
    const target = intro < 1.2 ? 0 : state.exT;
    const prev = state.ex;
    state.ex = follow(state.ex, target, dt, rm ? 0.22 : 0.35);
    if (state.ready && (Math.abs(prev - state.ex) > 1e-4 || layoutDirty)) {
      layoutDirty = false;
      parts.forEach((p) => p.objs.forEach((o) => o.position.copy(o.userData.home).addScaledVector(o.userData.dirV, (state.ex * spread) / o.userData.k)));
      readout();
    }
    if (fly) {
      const kf = 1 - Math.exp(-dt / (rm ? 0.05 : 0.22));
      camera.position.lerp(fly.pos, kf); controls.target.lerp(fly.target, kf);
      if (camera.position.distanceTo(fly.pos) < rad * 0.002) fly = null;
    }
    earth.userData.earth.rotation.y += dt * 0.004; // Земля медленно поворачивается под аппаратом
    if (!rm && idle > 4 && !fly && state.pinned < 0) root.rotation.y += dt * 0.1;
    layout();
  });
  S.start(); readout();
  return {
    setExplode(x) { state.exT = x; S.touch(); },
    setSpace(on) { state.space = on; applySpace(); },
    pin: setPinned, hover: setHover, lastPart: () => lastPart, parts, real: !!real,
    focus, zoomIn: () => zoomBy(0.7), zoomOut: () => zoomBy(1.4), reset: () => focus(-1),
    dispose: () => { disposed = true; S.dispose(); },
  };
}
