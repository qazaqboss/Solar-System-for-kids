// 3D-сцены раздела «Вселенная» в стиле Anatomy: тёмная «космическая» карточка,
// выноски к частям, живые показания и спокойная анимация. Всё процедурное.
import * as THREE from "three";
import { createStage, follow, reducedMotion, spreadBadges } from "./gl.js";
import { mulberry } from "./textures.js";

const TAU = Math.PI * 2;
const ease = (x) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- общие помощники
let dotTex = null;
function dot() {
  if (dotTex) return dotTex;
  const cv = document.createElement("canvas"); cv.width = cv.height = 64;
  const c = cv.getContext("2d"), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.25, "rgba(255,255,255,.75)"); g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  return (dotTex = new THREE.CanvasTexture(cv));
}
function points(pos, col, size = 0.12, opacity = 1, additive = true) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  if (col) g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size, map: dot(), vertexColors: !!col, color: col ? 0xffffff : 0xffffff, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true }));
}
function glow(color, scale, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(scale, scale, 1);
  return s;
}
function line(pts, color, opacity = 1) {
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
}
function bg(n = 1500) {
  const r = mulberry(5), pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1, t = r() * TAU, s = Math.sqrt(1 - u * u), R = 300;
    pos.set([Math.cos(t) * s * R, u * R, Math.sin(t) * s * R], i * 3);
    const b = 0.25 + r() * 0.5; col.set([b, b, b * 1.1], i * 3);
  }
  const p = points(pos, col, 1.4, 0.9); p.material.sizeAttenuation = false; return p;
}
/** Цвет звезды по температуре (K) — приблизительно «как видит глаз». */
export function starColor(T) {
  const t = Math.log10(T);
  const stops = [[3.4, [255, 140, 70]], [3.6, [255, 190, 120]], [3.76, [255, 240, 220]], [3.9, [230, 236, 255]], [4.1, [175, 200, 255]], [4.6, [150, 175, 255]]];
  for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i], k = Math.max(0, (t - a) / (b - a)); return new THREE.Color(...ca.map((v, j) => (v + (cb[j] - v) * k) / 255)); }
  return new THREE.Color(150 / 255, 175 / 255, 1);
}
function gaussian(r) { let u = 0; for (let i = 0; i < 4; i++) u += r(); return (u - 2) / 2; }

/** Светящийся диск спиральной галактики: туманное свечение рукавов, пыль и розовые облака. */
function diskTexture({ arms = 2, bar = true, seed = 3, size = 1024 } = {}) {
  const cv = document.createElement("canvas"); cv.width = cv.height = size;
  const c = cv.getContext("2d"), r = mulberry(seed + 100), C = size / 2;
  const blob = (x, y, rad, col, a) => { const g = c.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, col.replace("A", a)); g.addColorStop(1, col.replace("A", 0)); c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2); };
  c.globalCompositeOperation = "lighter";
  blob(C, C, C * 0.95, "rgba(120,130,170,A)", 0.18);                // общий диск
  const W = armWeights(arms);
  for (let k = 0; k < 2600; k++) {                                     // свечение рукавов
    const arm = pickArm(W, r), u = Math.pow(r(), 0.8), rr = 0.18 + u * 0.8;
    const th = armAngle(arm, arms) + Math.log(rr / 0.18 + 1) * 2.6 + gaussian(r) * 0.32 * (1.25 - rr);
    const x = C + Math.cos(th) * rr * C * 0.9, y = C + Math.sin(th) * rr * C * 0.9;
    blob(x, y, C * (0.03 + r() * 0.05), rr < 0.35 ? "rgba(255,220,170,A)" : "rgba(160,185,255,A)", 0.05 + r() * 0.05);
    if (r() < 0.05) blob(x, y, C * 0.012, "rgba(255,110,160,A)", 0.55); // облака, где рождаются звёзды
  }
  blob(C, C, C * 0.32, "rgba(255,214,160,A)", 0.75);                 // балдж
  if (bar) { c.save(); c.translate(C, C); c.scale(1, 0.28); blob(0, 0, C * 0.34, "rgba(255,225,180,A)", 0.5); c.restore(); }
  c.globalCompositeOperation = "destination-out";                       // тёмные пылевые прожилки вдоль внутреннего края рукавов
  for (let k = 0; k < 1400; k++) {
    const arm = pickArm(W, r), rr = 0.22 + Math.pow(r(), 0.9) * 0.7;
    const th = armAngle(arm, arms) + Math.log(rr / 0.18 + 1) * 2.6 - 0.2 + gaussian(r) * 0.06;
    blob(C + Math.cos(th) * rr * C * 0.9, C + Math.sin(th) * rr * C * 0.9, C * (0.012 + r() * 0.018), "rgba(0,0,0,A)", 0.35);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// у Млечного Пути два главных рукава и два послабее
const armWeights = (arms) => (arms === 4 ? [1, 1, 0.55, 0.55] : Array(arms).fill(1));
const armAngle = (arm, arms) => (arms === 4 ? [0, Math.PI, Math.PI / 2, (3 * Math.PI) / 2][arm] : arm * (TAU / arms));
function pickArm(W, r) { const s = W.reduce((a, b) => a + b, 0); let x = r() * s; for (let i = 0; i < W.length; i++) { x -= W[i]; if (x <= 0) return i; } return 0; }

/** Спиральная галактика из точек. */
function makeGalaxy({ n = 12000, R = 10, arms = 2, bar = true, type = "spiral", seed = 3 } = {}) {
  const r = mulberry(seed), pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const cBulge = new THREE.Color("#ffd9a0"), cArm = new THREE.Color("#b8ccff"), cPink = new THREE.Color("#ff7aa8"), cOld = new THREE.Color("#ffe9c8");
  for (let i = 0; i < n; i++) {
    let x, y, z, c;
    const k = r();
    if (type === "elliptical") {
      const rr = Math.pow(r(), 1.8) * R * 0.9, u = r() * 2 - 1, t = r() * TAU, s = Math.sqrt(1 - u * u);
      x = Math.cos(t) * s * rr; y = u * rr * 0.6; z = Math.sin(t) * s * rr * 0.8; c = cOld.clone().lerp(cBulge, r());
    } else if (type === "irregular") {
      const blob = Math.floor(r() * 5), bx = Math.sin(blob * 2.1) * R * 0.45, bz = Math.cos(blob * 1.7) * R * 0.35;
      x = bx + gaussian(r) * R * 0.3; y = gaussian(r) * R * 0.08; z = bz + gaussian(r) * R * 0.3;
      c = r() < 0.15 ? cPink.clone() : cArm.clone().lerp(cOld, r() * 0.5);
    } else if (k < 0.22) { // балдж
      const rr = Math.abs(gaussian(r)) * R * 0.16;
      const u = r() * 2 - 1, t = r() * TAU, s = Math.sqrt(1 - u * u);
      x = Math.cos(t) * s * rr; y = u * rr * 0.7; z = Math.sin(t) * s * rr; c = cBulge.clone().lerp(cOld, r());
    } else if (bar && k < 0.3) { // бар
      x = (r() * 2 - 1) * R * 0.32; y = gaussian(r) * 0.15; z = gaussian(r) * R * 0.05; c = cBulge.clone();
    } else if (k < 0.97) { // рукава
      const arm = pickArm(armWeights(arms), r), rr = R * (0.18 + Math.pow(r(), 0.75) * 0.82);
      const diffuse = r() < 0.35;
      const th = armAngle(arm, arms) + Math.log(rr / (R * 0.18) + 1) * 2.6 + gaussian(r) * (diffuse ? 1.6 : 0.5) * (1.25 - rr / R);
      x = Math.cos(th) * rr + gaussian(r) * 0.45; z = Math.sin(th) * rr + gaussian(r) * 0.45; y = gaussian(r) * 0.18 * (1.1 - rr / R);
      c = r() < 0.06 ? cPink.clone() : cArm.clone().lerp(cOld, Math.max(0, 0.6 - rr / R));
    } else { // гало
      const rr = R * (0.4 + r() * 0.9), u = r() * 2 - 1, t = r() * TAU, s = Math.sqrt(1 - u * u);
      x = Math.cos(t) * s * rr; y = u * rr; z = Math.sin(t) * s * rr; c = cOld.clone().multiplyScalar(0.5);
    }
    pos.set([x, y, z], i * 3);
    const b = 0.55 + r() * 0.45; col.set([c.r * b, c.g * b, c.b * b], i * 3);
  }
  const p = points(pos, col, R * (n > 14000 ? 0.016 : 0.02), 0.95);
  const core = glow(0xffe6b0, R * (type === "elliptical" ? 0.9 : 0.55), 0.9);
  const g = new THREE.Group(); g.add(p, core);
  if (type === "spiral") {
    // туманный диск под звёздами — как на настоящих снимках галактик
    const disk = new THREE.Mesh(new THREE.PlaneGeometry(R * 2.05, R * 2.05), new THREE.MeshBasicMaterial({ map: diskTexture({ arms, bar, seed }), transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    disk.rotation.x = -Math.PI / 2; g.add(disk);
  }
  return g;
}

// ---------------------------------------------------------------- СЦЕНЫ
// Каждая сцена: (ctx) → { labels: [{name, desc, at: () => Vector3}], update(dt, t), controls, control(id, v), readout(), cam: {dist, el, az}, inset?(c, w, h, t) }
const SCENES = {
  // ======================================================== Большой взрыв: «колокол» истории Вселенной
  bigbang({ root, mobile }) {
    const LEN = 22, X0 = -11;
    const R = (u) => 0.06 + 1.1 * ease(u / 0.035) + 4.3 * Math.pow(u, 0.62) + 1.6 * Math.pow(u, 5);
    const EPOCHS = [
      { u: 0.0, name: "Большой взрыв", age: "0", T: "∞" },
      { u: 0.03, name: "Инфляция", age: "10⁻³² с", T: "10²⁷ °C" },
      { u: 0.065, name: "Первые ядра", age: "3 минуты", T: "1 млрд °C" },
      { u: 0.11, name: "Реликтовое излучение", age: "380 000 лет", T: "3 000 °C" },
      { u: 0.2, name: "Тёмные века", age: "≈50 млн лет", T: "≈−200 °C" },
      { u: 0.3, name: "Первые звёзды", age: "≈150 млн лет", T: "−220 °C" },
      { u: 0.5, name: "Галактики растут", age: "≈2 млрд лет", T: "−260 °C" },
      { u: 0.985, name: "Сегодня", age: "13,8 млрд лет", T: "−270,4 °C" },
    ];
    const g = new THREE.Group(); root.add(g);
    // контур «колокола»: кольца и образующие
    const col = (u) => new THREE.Color().setHSL(lerp(0.12, 0.62, ease(u * 2.2)), 0.8, lerp(0.85, 0.55, ease(u * 3)));
    for (let k = 0; k <= 30; k++) {
      const u = Math.pow(k / 30, 1.4), x = X0 + u * LEN, r = R(u), pts = [];
      for (let a = 0; a <= 64; a++) pts.push(new THREE.Vector3(x, Math.cos((a / 64) * TAU) * r, Math.sin((a / 64) * TAU) * r));
      g.add(line(pts, col(u), 0.35));
    }
    for (let a = 0; a < 18; a++) {
      const pts = [];
      for (let k = 0; k <= 80; k++) { const u = k / 80; pts.push(new THREE.Vector3(X0 + u * LEN, Math.cos((a / 18) * TAU) * R(u), Math.sin((a / 18) * TAU) * R(u))); }
      g.add(line(pts, 0x8fa4c8, 0.22));
    }
    // реликтовое излучение — светящаяся «стена»
    const cmbU = 0.11, cmb = new THREE.Mesh(new THREE.CircleGeometry(R(cmbU), 64), new THREE.MeshBasicMaterial({ color: 0xff9a4a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    cmb.rotation.y = Math.PI / 2; cmb.position.x = X0 + cmbU * LEN; g.add(cmb);
    // содержимое: горячая плазма → тёмные века → звёзды → галактики
    const rnd = mulberry(7), N = mobile ? 3500 : 7000, pos = new Float32Array(N * 3), cc = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = Math.pow(rnd(), 0.9), x = X0 + u * LEN, rr = R(u) * Math.sqrt(rnd()) * 0.92, t = rnd() * TAU;
      pos.set([x, Math.cos(t) * rr, Math.sin(t) * rr], i * 3);
      let c;
      if (u < cmbU) c = new THREE.Color().setHSL(0.08, 1, 0.65);
      else if (u < 0.27) c = new THREE.Color(0x203050).multiplyScalar(0.6);
      else if (u < 0.42) c = rnd() < 0.5 ? new THREE.Color(0x9fc0ff) : new THREE.Color(0xfff0c0);
      else c = rnd() < 0.3 ? new THREE.Color(0xffd9a0) : new THREE.Color(0xbcd0ff);
      cc.set([c.r, c.g, c.b], i * 3);
    }
    g.add(points(pos, cc, 0.14, 0.9));
    { const bb = glow(0xffffff, 1.6); bb.position.set(X0, 0, 0); g.add(bb); }
    // курсор времени
    const cur = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 96), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    cur.rotation.y = Math.PI / 2; g.add(cur);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ color: 0x88aaff, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
    disc.rotation.y = Math.PI / 2; g.add(disc);
    const st = { u: 0.0, auto: true };
    const epochAt = (u) => EPOCHS.reduce((a, e) => (u >= e.u - 1e-6 ? e : a), EPOCHS[0]);
    const v = (u) => () => new THREE.Vector3(X0 + u * LEN, R(u) * 0.98, 0);
    return {
      cam: { dist: 34, el: 18, az: -38 },
      labels: [
        { name: "Большой взрыв", desc: "Начало расширения пространства и времени, 13,8 млрд лет назад.", at: () => new THREE.Vector3(X0, 0, 0) },
        { name: "Инфляция", desc: "За 10⁻³² секунды Вселенная раздулась в огромное число раз.", at: v(0.03) },
        { name: "Реликтовое излучение", desc: "Через 380 000 лет Вселенная стала прозрачной — этот свет мы ловим до сих пор.", at: () => new THREE.Vector3(X0 + cmbU * LEN, 0, 0) },
        { name: "Тёмные века", desc: "Звёзд ещё нет — только холодный газ и тёмная материя.", at: () => new THREE.Vector3(X0 + 0.2 * LEN, -R(0.2) * 0.4, 0) },
        { name: "Первые звёзды", desc: "Через ≈100–200 млн лет загораются первые огромные звёзды.", at: () => new THREE.Vector3(X0 + 0.32 * LEN, R(0.32) * 0.3, 0) },
        { name: "Галактики и сегодня", desc: "Галактики растут и сливаются; расширение ускоряется тёмной энергией.", at: () => new THREE.Vector3(X0 + 0.95 * LEN, 0, 0) },
      ],
      controls: [{ type: "range", id: "time", label: "Время", min: 0, max: 100, value: 0 }],
      control(id, val) { if (id === "time") { st.u = val / 100; st.auto = false; } },
      update(dt) {
        if (st.auto) st.u = (st.u + dt * 0.035) % 1.05;
        const u = Math.min(1, st.u), r = R(u);
        cur.position.x = disc.position.x = X0 + u * LEN; cur.scale.setScalar(r); disc.scale.setScalar(r);
        g.rotation.x += dt * 0.05;
      },
      readout() { const e = epochAt(Math.min(1, st.u)); return `${e.name} · ${e.age} · ${e.T}`; },
    };
  },

  // ======================================================== расширение пространства
  expansion({ root }) {
    const g = new THREE.Group(); root.add(g);
    const r = mulberry(11), pos = [], cols = [];
    const N = 6;
    for (let x = -N; x <= N; x++) for (let z = -N; z <= N; z++) for (let y = -1; y <= 1; y++) {
      pos.push(x * 2 + (r() - 0.5) * 0.6, y * 2 + (r() - 0.5) * 0.6, z * 2 + (r() - 0.5) * 0.6);
      const c = r() < 0.5 ? new THREE.Color(0xbcd0ff) : new THREE.Color(0xffe0b0); cols.push(c.r, c.g, c.b);
    }
    const gal = points(new Float32Array(pos), new Float32Array(cols), 0.55, 0.95); gal.material.sizeAttenuation = true; g.add(gal);
    // «сетка пространства»
    const grid = new THREE.GridHelper(26, 13, 0x5a6a90, 0x2a3450); grid.material.transparent = true; grid.material.opacity = 0.45; g.add(grid);
    const home = glow(0xffffff, 1.6); g.add(home);
    const near = new THREE.Vector3(4, 0, 2), far = new THREE.Vector3(-10, 0, 8);
    const nearM = glow(0x9fd0ff, 1.1), farM = glow(0xff9a7a, 1.1); nearM.position.copy(near); farM.position.copy(far); g.add(nearM, farM);
    const lnNear = line([new THREE.Vector3(), near], 0x9fd0ff, 0.9), lnFar = line([new THREE.Vector3(), far], 0xff9a7a, 0.9); g.add(lnNear, lnFar);
    const st = { a: 1, t: 0 };
    return {
      cam: { dist: 36, el: 32, az: 20 },
      labels: [
        { name: "Наша галактика", desc: "Из любой галактики кажется, что все остальные разлетаются от неё.", at: () => new THREE.Vector3(0, 0, 0) },
        { name: "Близкая галактика", desc: "Удаляется медленно: между нами мало растягивающегося пространства.", at: () => near.clone().applyMatrix4(g.matrixWorld) },
        { name: "Далёкая галактика", desc: "Удаляется быстрее, а её свет сильнее краснеет — закон Хаббла.", at: () => far.clone().applyMatrix4(g.matrixWorld) },
        { name: "Растущее пространство", desc: "Галактики не летят сквозь пространство — растёт само пространство между ними.", at: () => new THREE.Vector3(9, 0, -9).applyMatrix4(g.matrixWorld) },
      ],
      update(dt) {
        st.t += dt;
        const k = (st.t % 14) / 14; st.a = 1 + 1.2 * ease(k < 0.85 ? k / 0.85 : 1 - (k - 0.85) / 0.15);
        g.scale.setScalar(st.a);
        g.rotation.y += dt * 0.03;
      },
      readout() { return `масштаб Вселенной ×${st.a.toFixed(2)} · далёкая галактика удаляется в ${(far.length() / near.length()).toFixed(1)} раза быстрее близкой`; },
    };
  },

  // ======================================================== галактики
  galaxy({ root, mobile }) {
    let gal = null, type = "spiral";
    const sun = glow(0xfff2a0, 0.9), sunRing = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.42, 32), new THREE.MeshBasicMaterial({ color: 0xfff2a0, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
    const holder = new THREE.Group(); root.add(holder);
    function build() {
      if (gal) { holder.remove(gal); gal.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); }
      gal = makeGalaxy({ n: mobile ? 12000 : 30000, R: 10, arms: type === "spiral" ? 4 : 2, bar: true, type });
      holder.add(gal);
      if (type === "spiral") { sun.position.set(5.5, 0.1, 0); sunRing.position.copy(sun.position); sunRing.rotation.x = -Math.PI / 2; gal.add(sun, sunRing); }
    }
    build();
    return {
      cam: { dist: 30, el: 38, az: 0 },
      labels: [
        { name: "Балдж и бар", desc: "Плотное «вздутие» из старых жёлтых звёзд и перемычка-бар через центр.", at: () => new THREE.Vector3(1.4, 0.6, 0).applyMatrix4(holder.matrixWorld) },
        { name: "Стрелец A*", desc: "Сверхмассивная чёрная дыра в 4,3 млн масс Солнца.", at: () => new THREE.Vector3(0, 0, 0) },
        { name: "Спиральный рукав", desc: "Здесь много молодых голубых звёзд и розовых облаков, где рождаются новые.", at: () => new THREE.Vector3(-6.5, 0, -3).applyMatrix4(holder.matrixWorld) },
        { name: "Солнце", desc: "В 26 000 световых лет от центра, в рукаве Ориона. Один оборот — 230 млн лет.", at: () => (type === "spiral" ? sun.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, 0, 0)) },
        { name: "Гало", desc: "Разреженная сфера старых звёзд, шаровых скоплений и тёмной материи.", at: () => new THREE.Vector3(0, 8, 4).applyMatrix4(holder.matrixWorld) },
      ],
      controls: [{ type: "buttons", id: "type", items: [["spiral", "Спиральная"], ["elliptical", "Эллиптическая"], ["irregular", "Неправильная"]], value: "spiral" }],
      control(id, v) { if (id === "type") { type = v; build(); } },
      update(dt) { holder.rotation.y += dt * 0.05; },
      readout() { return type === "spiral" ? "Млечный Путь: 100–400 млрд звёзд · диаметр ≈100 000 св. лет" : type === "elliptical" ? "Эллиптическая: старые звёзды, мало газа, нет рукавов" : "Неправильная: нет чёткой формы, много молодых звёзд"; },
    };
  },

  // ======================================================== тёмная материя
  darkmatter({ root, mobile }) {
    const g = new THREE.Group(); root.add(g);
    g.add(makeGalaxy({ n: mobile ? 5000 : 9000, R: 7, arms: 2, bar: false, seed: 9 }));
    const r = mulberry(21), N = mobile ? 2500 : 5000, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const rr = 18 * Math.pow(r(), 0.6), u = r() * 2 - 1, t = r() * TAU, s = Math.sqrt(1 - u * u); pos.set([Math.cos(t) * s * rr, u * rr, Math.sin(t) * s * rr], i * 3); }
    const halo = points(pos, null, 0.5, 0.22); halo.material.color = new THREE.Color(0xa070ff); g.add(halo);
    const edge = glow(0x9fd0ff, 0.9); edge.position.set(6.8, 0, 0); g.add(edge);
    const st = { show: 1, op: 0.22 };
    return {
      cam: { dist: 44, el: 26, az: 15 },
      labels: [
        { name: "Видимая галактика", desc: "Звёзды и газ — лишь около шестой части всей массы.", at: () => new THREE.Vector3(2, 0.5, 0).applyMatrix4(g.matrixWorld) },
        { name: "Звезда на краю диска", desc: "Летит так же быстро, как звёзды ближе к центру — видимой массы для этого мало.", at: () => edge.getWorldPosition(new THREE.Vector3()) },
        { name: "Гало тёмной материи", desc: "Невидимое облако в 10 раз больше диска. Его выдаёт только притяжение.", at: () => new THREE.Vector3(-12, 8, 0).applyMatrix4(g.matrixWorld) },
      ],
      controls: [{ type: "buttons", id: "show", items: [["1", "Показать тёмную материю"], ["0", "Только видимое"]], value: "1" }],
      control(id, v) { if (id === "show") st.show = +v; },
      update(dt) { g.rotation.y += dt * 0.08; st.op = follow(st.op, st.show ? 0.22 : 0, dt, 0.4); halo.material.opacity = st.op; halo.visible = st.op > 0.01; },
      readout() { return "Без тёмной материи звёзды на краю улетели бы прочь"; },
      inset(c, w, h) {
        // кривая вращения: ожидаемая (падает) и настоящая (плоская)
        c.clearRect(0, 0, w, h);
        c.strokeStyle = "rgba(255,255,255,.35)"; c.lineWidth = 1; c.beginPath(); c.moveTo(24, 8); c.lineTo(24, h - 18); c.lineTo(w - 6, h - 18); c.stroke();
        c.font = "9px ui-monospace, monospace"; c.fillStyle = "rgba(255,255,255,.7)";
        c.fillText("скорость", 26, 14); c.fillText("расстояние от центра →", 30, h - 5);
        const X = (k) => 24 + k * (w - 34), Y = (v) => h - 18 - v * (h - 32);
        c.lineWidth = 2;
        c.strokeStyle = "#ff9a7a"; c.beginPath(); for (let k = 0.02; k <= 1; k += 0.02) { const v = Math.min(1, 2.4 * k) / Math.max(1, Math.sqrt(k * 2.4)) * 0.9; k === 0.02 ? c.moveTo(X(k), Y(v)) : c.lineTo(X(k), Y(v)); } c.stroke();
        c.strokeStyle = "#9fd0ff"; c.beginPath(); for (let k = 0.02; k <= 1; k += 0.02) { const v = Math.min(1, 2.4 * k) * 0.9; k === 0.02 ? c.moveTo(X(k), Y(v)) : c.lineTo(X(k), Y(v)); } c.stroke();
        c.fillStyle = "#9fd0ff"; c.fillText("наблюдаем", w - 70, Y(0.9) - 4);
        c.fillStyle = "#ff9a7a"; c.fillText("без тёмной материи", w - 108, Y(0.42) + 12);
      },
    };
  },

  // ======================================================== космическая паутина
  cosmicweb({ root, mobile }) {
    const g = new THREE.Group(); root.add(g);
    const r = mulberry(31), nodes = [];
    for (let i = 0; i < 28; i++) nodes.push(new THREE.Vector3((r() - 0.5) * 26, (r() - 0.5) * 18, (r() - 0.5) * 26));
    const edges = [];
    nodes.forEach((a, i) => {
      const near = nodes.map((b, j) => [j, a.distanceTo(b)]).filter(([j]) => j !== i).sort((x, y) => x[1] - y[1]).slice(0, 3);
      near.forEach(([j]) => { if (!edges.some(([p, q]) => (p === j && q === i))) edges.push([i, j]); });
    });
    const N = mobile ? 9000 : 18000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let k = 0; k < N; k++) {
      let p, c;
      if (r() < 0.3) { const a = nodes[Math.floor(r() * nodes.length)]; p = a.clone().add(new THREE.Vector3(gaussian(r), gaussian(r), gaussian(r)).multiplyScalar(0.7)); c = new THREE.Color(0xffd9a0); }
      else { const [i, j] = edges[Math.floor(r() * edges.length)]; p = nodes[i].clone().lerp(nodes[j], r()).add(new THREE.Vector3(gaussian(r), gaussian(r), gaussian(r)).multiplyScalar(0.35)); c = new THREE.Color(0x8fb0ff); }
      pos.set([p.x, p.y, p.z], k * 3); const b = 0.4 + r() * 0.6; col.set([c.r * b, c.g * b, c.b * b], k * 3);
    }
    g.add(points(pos, col, 0.16, 0.9));
    // самая пустая точка — войд
    let voidP = new THREE.Vector3(), best = 0;
    for (let s = 0; s < 400; s++) { const p = new THREE.Vector3((r() - 0.5) * 18, (r() - 0.5) * 10, (r() - 0.5) * 18); const d = Math.min(...nodes.map((n) => n.distanceTo(p)), ...edges.map(([i, j]) => new THREE.Line3(nodes[i], nodes[j]).closestPointToPoint(p, true, new THREE.Vector3()).distanceTo(p))); if (d > best) { best = d; voidP = p; } }
    const bigNode = nodes.reduce((a, n, i) => (edges.filter(([p, q]) => p === i || q === i).length > a[1] ? [i, edges.filter(([p, q]) => p === i || q === i).length] : a), [0, 0])[0];
    const e0 = edges[0];
    return {
      cam: { dist: 46, el: 20, az: 30 },
      labels: [
        { name: "Скопление галактик (узел)", desc: "Там, где сходятся нити, собираются тысячи галактик.", at: () => nodes[bigNode].clone().applyMatrix4(g.matrixWorld) },
        { name: "Нить-филамент", desc: "Длинные «мосты» из галактик, газа и тёмной материи.", at: () => nodes[e0[0]].clone().lerp(nodes[e0[1]], 0.5).applyMatrix4(g.matrixWorld) },
        { name: "Войд", desc: "Огромная пустота: галактик тут в десятки раз меньше.", at: () => voidP.clone().applyMatrix4(g.matrixWorld) },
      ],
      update(dt) { g.rotation.y += dt * 0.04; },
      readout() { return "Каждая точка — целая галактика · кусок размером ≈1 млрд световых лет"; },
    };
  },

  // ======================================================== рождение звезды
  starbirth({ root, mobile }) {
    const g = new THREE.Group(); root.add(g);
    const r = mulberry(41), N = mobile ? 5000 : 10000;
    const base = new Float32Array(N * 3), pos = new Float32Array(N * 3), col = new Float32Array(N * 3), ang = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const rr = 3 + Math.pow(r(), 0.7) * 9, u = r() * 2 - 1, t = r() * TAU, s = Math.sqrt(1 - u * u);
      base.set([Math.cos(t) * s * rr, u * rr * 0.7, Math.sin(t) * s * rr], i * 3); ang[i] = t;
      const c = r() < 0.7 ? new THREE.Color(0xc06080) : new THREE.Color(0x6080c0); const b = 0.3 + r() * 0.5; col.set([c.r * b, c.g * b, c.b * b], i * 3);
    }
    const cloud = points(pos, col, 0.35, 0.8); g.add(cloud);
    const star = glow(0xffe6b0, 0.1); g.add(star);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.35, 32, 16), new THREE.MeshBasicMaterial({ color: 0xffd090 })); g.add(core);
    const jetMat = new THREE.MeshBasicMaterial({ color: 0x9fc8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const jetU = new THREE.Mesh(new THREE.ConeGeometry(0.5, 9, 24, 1, true), jetMat); jetU.position.y = 4.8; jetU.rotation.x = Math.PI;
    const jetD = new THREE.Mesh(new THREE.ConeGeometry(0.5, 9, 24, 1, true), jetMat); jetD.position.y = -4.8;
    g.add(jetU, jetD);
    const st = { p: 0, auto: true };
    const phase = (p) => (p < 0.35 ? "Облако сжимается под своей тяжестью" : p < 0.6 ? "Протозвезда и вращающийся диск" : p < 0.85 ? "Джеты сбрасывают лишний газ" : "Звезда зажглась — в ядре начался синтез");
    return {
      cam: { dist: 30, el: 16, az: 30 },
      labels: [
        { name: "Молекулярное облако", desc: "Холодный водород и пыль при −260 °C.", at: () => new THREE.Vector3(9 * (1 - 0.7 * ease(st.p / 0.6)), 3, 0).applyMatrix4(g.matrixWorld) },
        { name: "Протозвезда", desc: "Горячий сжимающийся сгусток. Ещё не звезда — синтез не начался.", at: () => new THREE.Vector3(0, 0, 0) },
        { name: "Протопланетный диск", desc: "Из этого диска потом родятся планеты.", at: () => new THREE.Vector3(-3.2, 0, 1.5).applyMatrix4(g.matrixWorld) },
        { name: "Джеты", desc: "Две струи вдоль оси вращения уносят лишний газ.", at: () => new THREE.Vector3(0, 7, 0).applyMatrix4(g.matrixWorld) },
      ],
      controls: [{ type: "range", id: "time", label: "Время", min: 0, max: 100, value: 0 }],
      control(id, v) { if (id === "time") { st.p = v / 100; st.auto = false; } },
      update(dt, t) {
        if (st.auto) st.p = (st.p + dt / 18) % 1.08;
        const p = Math.min(1, st.p), c = ease(p / 0.6), flat = ease((p - 0.2) / 0.5);
        for (let i = 0; i < N; i++) {
          const bx = base[i * 3], by = base[i * 3 + 1], bz = base[i * 3 + 2];
          const rr = Math.hypot(bx, bz), k = lerp(1, 0.32, c), spin = t * (0.05 + 1.2 * c / (0.5 + rr * k)) + ang[i] * 0;
          const ca = Math.cos(spin), sa = Math.sin(spin);
          const x = (bx * ca - bz * sa) * k, z = (bx * sa + bz * ca) * k, y = by * k * lerp(1, 0.08, flat);
          pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
        }
        cloud.geometry.attributes.position.needsUpdate = true;
        const shine = ease((p - 0.35) / 0.5);
        star.scale.setScalar(0.5 + shine * 6); star.material.opacity = shine;
        core.scale.setScalar(0.4 + shine * 0.9);
        jetMat.opacity = 0.5 * ease((p - 0.55) / 0.2) * (1 - 0.6 * ease((p - 0.9) / 0.1));
        g.rotation.y += dt * 0.02;
      },
      readout() { return phase(Math.min(1, st.p)); },
    };
  },

  // ======================================================== размеры звёзд
  starsizes({ root, addTag }) {
    const STARS = [
      ["Проксима Центавра", 0.15, 3000], ["Солнце", 1, 5772], ["Сириус A", 1.7, 9900], ["Вега", 2.5, 9600],
      ["Альдебаран", 44, 3900], ["Ригель", 79, 12100], ["Бетельгейзе", 760, 3600], ["UY Щита", 900, 3400],
    ];
    const g = new THREE.Group(); root.add(g);
    let x = -14, objs_i = 0;
    const objs = STARS.map(([name, R, T]) => {
      const rv = 0.34 * Math.cbrt(R);
      x += rv + 0.55;
      const c = starColor(T);
      const m = new THREE.Mesh(new THREE.SphereGeometry(rv, 48, 24), new THREE.MeshBasicMaterial({ color: c }));
      m.position.set(x, rv - 0.2, 0);
      const gl = glow(c, rv * 4, 0.55); gl.position.copy(m.position);
      g.add(m, gl);
      const lvl = objs_i++ % 2;
      addTag(`${name}<small>${R < 10 ? R.toLocaleString("ru-RU") : Math.round(R).toLocaleString("ru-RU")} R☉ · ${T.toLocaleString("ru-RU")} K</small>`, () => m.position.clone().add(new THREE.Vector3(0, -rv - 0.5 - (rv < 1 ? lvl * 1.3 : 0), 0)).applyMatrix4(g.matrixWorld));
      x += rv + 0.55;
      return m;
    });
    g.position.x = -(-14 + x) / 2;
    return {
      cam: { dist: 34, el: 8, az: 0 },
      labels: [],
      update(dt, t) { objs.forEach((m, i) => (m.rotation.y = t * 0.1 * (i + 1))); },
      readout() { return "Размеры сжаты (кубический корень): Бетельгейзе на самом деле в 760 раз больше Солнца"; },
    };
  },

  // ======================================================== жизненный путь звёзд
  lifecycle({ root, addTag }) {
    const g = new THREE.Group(); root.add(g);
    const sphere = (r, c) => new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16), new THREE.MeshBasicMaterial({ color: c }));
    const cloud = (n, rr, c) => { const rnd = mulberry(n), p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const u = rnd() * 2 - 1, t = rnd() * TAU, s = Math.sqrt(1 - u * u), q = rr * Math.cbrt(rnd()); p.set([Math.cos(t) * s * q, u * q * 0.7, Math.sin(t) * s * q], i * 3); } const o = points(p, null, 0.25, 0.6); o.material.color = new THREE.Color(c); return o; };
    const ringNeb = () => { const rnd = mulberry(77), n = 600, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const t = rnd() * TAU, q = 0.9 + rnd() * 0.3; p.set([Math.cos(t) * q, (rnd() - 0.5) * 0.3, Math.sin(t) * q], i * 3); } const o = points(p, null, 0.18, 0.8); o.material.color = new THREE.Color(0x7fd4c8); return o; };
    const burst = () => { const rnd = mulberry(78), n = 700, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const u = rnd() * 2 - 1, t = rnd() * TAU, s = Math.sqrt(1 - u * u), q = 0.6 + rnd() * 0.7; p.set([Math.cos(t) * s * q, u * q, Math.sin(t) * s * q], i * 3); } const o = points(p, null, 0.2, 0.9); o.material.color = new THREE.Color(0xffb070); return o; };
    const bh = () => { const o = new THREE.Group(); o.add(sphere(0.35, 0x000000)); const d = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.9, 48), new THREE.MeshBasicMaterial({ color: 0xff9a4a, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })); d.rotation.x = -1.2; o.add(d); return o; };
    const TOP = [["Туманность", () => cloud(500, 1, 0xc07090)], ["Протозвезда", () => sphere(0.35, 0xffb070)], ["Звезда как Солнце", () => sphere(0.5, 0xfff0c0)], ["Красный гигант", () => sphere(1.1, 0xff7a4a)], ["Планетарная туманность", ringNeb], ["Белый карлик", () => sphere(0.18, 0xdfe8ff)]];
    const BOT = [["Туманность", () => cloud(500, 1, 0xc07090)], ["Массивная звезда", () => sphere(0.8, 0xa8c4ff)], ["Красный сверхгигант", () => sphere(1.4, 0xff5a3a)], ["Сверхновая", burst], ["Нейтронная звезда", () => sphere(0.14, 0x9fd0ff)], ["Чёрная дыра", bh]];
    const place = (row, y) => row.map(([name, mk], i) => {
      const o = mk(); o.position.set(-12 + i * 4.8, y, 0); g.add(o);
      if (o.material && o.material.color && o.isMesh) { const gg = glow(o.material.color, 2.2, 0.35); gg.position.copy(o.position); g.add(gg); }
      addTag(name, () => o.position.clone().add(new THREE.Vector3(0, -1.6, 0)).applyMatrix4(g.matrixWorld));
      return o;
    });
    const top = place(TOP, 3.2), bot = place(BOT, -3.6);
    // ветвление в конце нижней дороги: нейтронная звезда ИЛИ чёрная дыра
    for (const [row, y] of [[top, 3.2], [bot, -3.6]]) for (let i = 0; i < row.length - 1; i++) g.add(line([new THREE.Vector3(-12 + i * 4.8 + 1.4, y, 0), new THREE.Vector3(-12 + (i + 1) * 4.8 - 1.4, y, 0)], 0x8a96b0, 0.7));
    const trav = [glow(0xffffff, 1.4), glow(0xffffff, 1.4)]; g.add(...trav);
    const st = { t: 0 };
    return {
      cam: { dist: 30, el: 6, az: 0 },
      labels: [],
      update(dt, t) {
        st.t += dt;
        const k = (st.t % 12) / 12, x = -12 + k * 5 * 4.8;
        trav[0].position.set(x, 3.2, 0.4); trav[1].position.set(x, -3.6, 0.4);
        top[3].scale.setScalar(1 + 0.04 * Math.sin(t * 2)); bot[2].scale.setScalar(1 + 0.05 * Math.sin(t * 1.6));
        bot[3].scale.setScalar(1 + ((t * 0.6) % 1) * 0.8); bot[3].material.opacity = 1 - ((t * 0.6) % 1);
        top[4].rotation.y += dt * 0.3; bot[5].rotation.y += dt;
      },
      readout() { const i = Math.min(5, Math.floor(((st.t % 12) / 12) * 6)); return `Сверху — звезда как Солнце: ${TOP[i][0].toLowerCase()} · снизу — массивная: ${BOT[i][0].toLowerCase()}`; },
    };
  },

  // ======================================================== сверхновая
  supernova({ root, mobile }) {
    const g = new THREE.Group(); root.add(g);
    const LAY = [[4.5, 0xe8592a, "Водородная оболочка"], [3.3, 0xf2c14e, "Гелий"], [2.6, 0x6a6a6a, "Углерод"], [2.0, 0xc27c0e, "Неон"], [1.5, 0x5aa8d8, "Кислород"], [1.05, 0xb0a090, "Кремний"], [0.6, 0x8a8a8a, "Железное ядро"]];
    const onion = new THREE.Group(); g.add(onion);
    const shells = LAY.map(([r, c], k) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 64, 32, 0.4, TAU * 0.75), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, transparent: true, opacity: k === 0 ? 0.45 : 0.92, depthWrite: k !== 0 })); m.userData.op = k === 0 ? 0.45 : 0.92; onion.add(m); return m; });
    const ns = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 12), new THREE.MeshBasicMaterial({ color: 0xbfe0ff })); g.add(ns);
    const nsGlow = glow(0x9fd0ff, 1.6, 0); g.add(nsGlow);
    const flash = glow(0xffffff, 1, 0); g.add(flash);
    const r = mulberry(51), N = mobile ? 5000 : 10000, dir = new Float32Array(N * 3), spd = new Float32Array(N), pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = r() * 2 - 1, t = r() * TAU, s = Math.sqrt(1 - u * u); dir.set([Math.cos(t) * s, u, Math.sin(t) * s], i * 3);
      const li = Math.min(LAY.length - 2, Math.floor(Math.pow(r(), 0.6) * (LAY.length - 1))); spd[i] = 0.6 + (1 - li / LAY.length) * 0.8 + r() * 0.3;
      const c = new THREE.Color(LAY[li][1]).lerp(new THREE.Color(0xffffff), 0.25); col.set([c.r, c.g, c.b], i * 3);
    }
    const ejecta = points(pos, col, 0.22, 0.9); g.add(ejecta);
    const st = { p: 0, auto: true };
    const phase = (p) => (p < 0.4 ? "Звезда-«луковица»: в каждом слое горит свой элемент" : p < 0.48 ? "Железное ядро рушится за доли секунды" : p < 0.6 ? "Ударная волна разрывает звезду!" : "Остаток расширяется, в центре — нейтронная звезда");
    return {
      cam: { dist: 26, el: 14, az: 40 },
      labels: [
        { name: "Железное ядро", desc: "Железо не горит. Когда ядро тяжелее ≈1,4 Солнца, оно рушится.", at: () => new THREE.Vector3(0.3, 0.3, 0.3) },
        { name: "Слои горения", desc: "Кремний, кислород, неон, углерод, гелий — как слои луковицы.", at: () => new THREE.Vector3(1.4, 1.3, 0.4).applyMatrix4(g.matrixWorld) },
        { name: "Водородная оболочка", desc: "Огромная внешняя оболочка красного сверхгиганта.", at: () => new THREE.Vector3(-3.4, 2.8, 0).applyMatrix4(g.matrixWorld) },
        { name: "Выброс вещества", desc: "Элементы разлетаются со скоростью до 30 000 км/с и засевают Галактику.", at: () => new THREE.Vector3(-1, 1, 1).normalize().multiplyScalar(Math.max(1, st.e || 1) * 1.1) },
        { name: "Нейтронная звезда", desc: "Остаток ядра: шар размером с город.", at: () => new THREE.Vector3(0, 0, 0) },
      ],
      controls: [{ type: "range", id: "time", label: "Время", min: 0, max: 100, value: 0 }],
      control(id, v) { if (id === "time") { st.p = v / 100; st.auto = false; } },
      update(dt) {
        if (st.auto) st.p = (st.p + dt / 16) % 1.06;
        const p = Math.min(1, st.p);
        const collapse = ease((p - 0.4) / 0.08), boom = ease((p - 0.46) / 0.54);
        onion.visible = p < 0.5; onion.rotation.y += dt * 0.25;
        shells[shells.length - 1].scale.setScalar(1 - 0.85 * collapse);
        shells.slice(0, -1).forEach((m) => (m.material.opacity = m.userData.op * (1 - ease((p - 0.44) / 0.06))));
        ejecta.visible = p > 0.44;
        const e = 0.5 + boom * 14; st.e = e;
        for (let i = 0; i < N; i++) { const k = e * spd[i]; pos[i * 3] = dir[i * 3] * k; pos[i * 3 + 1] = dir[i * 3 + 1] * k; pos[i * 3 + 2] = dir[i * 3 + 2] * k; }
        ejecta.geometry.attributes.position.needsUpdate = true;
        ejecta.material.opacity = 0.95 * (1 - 0.6 * boom);
        flash.material.opacity = Math.max(0, 1 - Math.abs(p - 0.48) / 0.05); flash.scale.setScalar(4 + flash.material.opacity * 30);
        ns.visible = p > 0.46; nsGlow.material.opacity = ease((p - 0.5) / 0.1);
      },
      readout() { return phase(Math.min(1, st.p)); },
    };
  },

  // ======================================================== пульсар
  pulsar({ root }) {
    const spin = new THREE.Group(); root.add(spin);
    const tilt = new THREE.Group(); tilt.rotation.z = 0.55; spin.add(tilt);
    const star = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.MeshBasicMaterial({ color: 0xbfe0ff })); spin.add(star);
    spin.add(glow(0x9fd0ff, 4, 0.7));
    root.add(line([new THREE.Vector3(0, -6, 0), new THREE.Vector3(0, 6, 0)], 0x8a96b0, 0.8));
    tilt.add(line([new THREE.Vector3(0, -4, 0), new THREE.Vector3(0, 4, 0)], 0xff9a4a, 0.9));
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const b1 = new THREE.Mesh(new THREE.ConeGeometry(1.1, 14, 32, 1, true), beamMat); b1.position.y = 8; b1.rotation.x = Math.PI;
    const b2 = new THREE.Mesh(new THREE.ConeGeometry(1.1, 14, 32, 1, true), beamMat); b2.position.y = -8;
    tilt.add(b1, b2);
    // силовые линии магнитного диполя: r = L·sin²θ
    for (let k = 0; k < 8; k++) for (const L of [2.2, 3.4]) {
      const pts = []; for (let i = 1; i < 60; i++) { const th = (i / 60) * Math.PI, rr = L * Math.sin(th) ** 2; if (rr < 1) continue; pts.push(new THREE.Vector3(rr * Math.sin(th), rr * Math.cos(th), 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), (k / 8) * TAU)); }
      tilt.add(line(pts, 0x6b9bff, 0.35));
    }
    const earth = glow(0x7fb4ff, 1.4); earth.position.set(10, 1.5, 3); root.add(earth);
    const st = { speed: 1, ang: 0, pulse: 0, hist: new Array(160).fill(0) };
    const v = new THREE.Vector3(), toE = earth.position.clone().normalize();
    return {
      cam: { dist: 30, el: 14, az: 25 },
      labels: [
        { name: "Нейтронная звезда", desc: "Шар радиусом ≈12 км, вращается десятки и сотни раз в секунду.", at: () => new THREE.Vector3(0.7, 0.7, 0) },
        { name: "Ось вращения", desc: "Вокруг неё крутится звезда.", at: () => new THREE.Vector3(0, 5.5, 0) },
        { name: "Магнитная ось", desc: "Наклонена к оси вращения — поэтому лучи «метут» по небу.", at: () => new THREE.Vector3(0, 3.6, 0).applyMatrix4(tilt.matrixWorld) },
        { name: "Луч излучения", desc: "Радиоволны бьют из магнитных полюсов, как свет маяка.", at: () => new THREE.Vector3(0, 11, 0).applyMatrix4(tilt.matrixWorld) },
        { name: "Силовые линии", desc: "Магнитное поле в триллионы раз сильнее земного.", at: () => new THREE.Vector3(2.6, 0.6, 0).applyMatrix4(tilt.matrixWorld) },
        { name: "Земля", desc: "Мы ловим импульс каждый раз, когда луч проходит по нам.", at: () => earth.position.clone() },
      ],
      controls: [{ type: "buttons", id: "speed", items: [["0.3", "Медленно"], ["1", "Быстрее"], ["4", "Как пульсар"]], value: "1" }],
      control(id, val) { if (id === "speed") st.speed = +val; },
      update(dt) {
        st.ang += dt * st.speed * 1.4; spin.rotation.y = st.ang;
        v.set(0, 1, 0).applyQuaternion(tilt.getWorldQuaternion(new THREE.Quaternion()));
        const a = Math.max(Math.abs(v.dot(toE)), 0);
        const hit = Math.max(0, (a - 0.88) / 0.12);
        st.pulse = Math.max(hit, st.pulse - dt * 4);
        earth.scale.setScalar(1.4 + st.pulse * 2);
        st.hist.push(hit); st.hist.shift();
      },
      readout() { return st.pulse > 0.3 ? "Импульс! Луч прошёл по Земле" : `скорость вращения ×${st.speed} · следи за вспышками у Земли`; },
      inset(c, w, h) {
        c.clearRect(0, 0, w, h);
        c.font = "9px ui-monospace, monospace"; c.fillStyle = "rgba(255,255,255,.7)"; c.fillText("сигнал на Земле", 6, 11);
        c.strokeStyle = "#9fd0ff"; c.lineWidth = 1.5; c.beginPath();
        st.hist.forEach((y, i) => { const X = 6 + (i / 159) * (w - 12), Y = h - 8 - y * (h - 24); i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.stroke();
      },
    };
  },

  // ======================================================== чёрная дыра
  blackhole({ root }) {
    const diskMat = (lensed) => new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uT: { value: 0 }, uCam: { value: new THREE.Vector3() }, uLensed: { value: lensed ? 1 : 0 } },
      vertexShader: `varying vec3 vW; varying vec2 vP; void main(){ vP = position.xy; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float uT; uniform vec3 uCam; uniform float uLensed; varying vec3 vW; varying vec2 vP;
        void main(){
          float r = length(vP); float a = atan(vP.y, vP.x);
          float k = clamp((r - 1.6) / 4.4, 0.0, 1.0);
          vec3 hot = vec3(1.0, 0.95, 0.85), mid = vec3(1.0, 0.62, 0.25), cool = vec3(0.7, 0.18, 0.08);
          vec3 c = mix(hot, mid, smoothstep(0.0, 0.35, k)); c = mix(c, cool, smoothstep(0.35, 1.0, k));
          float swirl = uLensed > 0.5 ? 0.85 + 0.15 * sin(a * 3.0 + uT * 0.8) : 0.72 + 0.28 * sin(r * 9.0 - a * 3.0 + uT * 2.2) * sin(a * 7.0 - uT * 1.3 + r * 2.0);
          if (uLensed > 0.5) k = clamp((r - 1.56) / 1.14, 0.0, 1.0);
          // доплеровское усиление: сторона диска, летящая к нам, ярче
          vec3 vel = normalize(vec3(-vW.z, 0.0, vW.x));
          float beam = uLensed > 0.5 ? 1.0 : 0.55 + 0.75 * max(0.0, dot(vel, normalize(uCam - vW)));
          float edge = smoothstep(0.0, 0.08, k) * (1.0 - smoothstep(0.82, 1.0, k));
          float I = (1.6 - k) * swirl * beam * edge;
          if (uLensed > 0.5) I = pow(1.0 - k, 1.6) * 2.4 * swirl * (0.55 + 0.45 * smoothstep(-1.0, 1.0, sin(a)));
          gl_FragColor = vec4(c * I, clamp(I, 0.0, 1.0));
        }`,
    });
    const disk = new THREE.Mesh(new THREE.RingGeometry(1.6, 6, 160, 4), diskMat(false)); disk.rotation.x = -Math.PI / 2; root.add(disk);
    // свет дальней стороны диска, изогнутый гравитацией, — кольцо вокруг «тени»
    const lens = new THREE.Mesh(new THREE.RingGeometry(1.56, 2.7, 160, 2), diskMat(true)); root.add(lens);
    const photon = new THREE.Mesh(new THREE.RingGeometry(1.48, 1.56, 128), new THREE.MeshBasicMaterial({ color: 0xffe9c8, transparent: true, opacity: 0.95, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })); root.add(photon);
    const hole = new THREE.Mesh(new THREE.SphereGeometry(1.0, 64, 32), new THREE.MeshBasicMaterial({ color: 0x000000 })); hole.renderOrder = 5; root.add(hole);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.45, 64), new THREE.MeshBasicMaterial({ color: 0x000000 })); root.add(shadow);
    const jetMat = new THREE.MeshBasicMaterial({ color: 0x7fb0ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const j1 = new THREE.Mesh(new THREE.ConeGeometry(0.45, 16, 32, 1, true), jetMat); j1.position.y = 9; j1.rotation.x = Math.PI;
    const j2 = new THREE.Mesh(new THREE.ConeGeometry(0.45, 16, 32, 1, true), jetMat); j2.position.y = -9;
    root.add(j1, j2);

    // Настоящая 3D-модель чёрной дыры (models/blackhole.glb): чёрное ядро, слои изогнутого
    // светящегося газа вокруг него и плоский аккреционный диск. Пока она грузится — видна
    // процедурная версия; после загрузки модель её заменяет.
    const S3 = 3.1; // масштаб модели: диск ≈ 6 единиц радиусом, как у процедурного
    const proc = [disk, lens, photon, hole, shadow];
    let ringMesh = null, model = null;
    const glowMats = [];
    const fresnel = (map, gain) => {
      const m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
        uniforms: { map: { value: map }, uT: { value: 0 }, uGain: { value: gain } },
        vertexShader: `varying vec3 vN; varying vec3 vV; varying vec2 vUv; void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
        // светится край (там свет огибает дыру), середина прозрачна — сквозь неё видна чёрная «тень»
        fragmentShader: `uniform sampler2D map; uniform float uT; uniform float uGain; varying vec3 vN; varying vec3 vV; varying vec2 vUv;
          void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
            vec3 c = texture2D(map, vUv + vec2(uT * 0.004, 0.0)).rgb;
            gl_FragColor = vec4(c * f * uGain, 1.0); }`,
      });
      glowMats.push(m); return m;
    };
    import("./glb.js").then(({ loadGLB }) => loadGLB("models/blackhole.glb")).then((g) => {
      model = g.scene; model.scale.setScalar(S3);
      let k = 0, rt = null;
      model.traverse((o) => { if (o.isMesh && /ring/i.test(o.material.name) && o.material.map) rt = o.material.map; });
      const ringTex = () => rt;
      model.traverse((o) => {
        if (!o.isMesh) return;
        const name = o.material.name || "", map = o.material.map;
        if (map) { map.anisotropy = 8; map.colorSpace = THREE.SRGBColorSpace; }
        if (/^Blackhole_core/.test(o.name)) { o.material = new THREE.MeshBasicMaterial({ color: 0x000000 }); o.renderOrder = 1; }
        else if (o.name === "Blackhole_ring") {
          // диск: тёмные края текстуры при сложении цветов становятся прозрачными
          o.material = new THREE.MeshBasicMaterial({ map, color: 0xffe2b8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
          o.renderOrder = 2; ringMesh = o;
        } else { o.material = fresnel(map || ringTex(), /inner/i.test(name) ? 1.5 : /core/i.test(name) ? 0.55 : 1.15 - 0.04 * k++); o.renderOrder = 3; }
      });
      root.add(model);
      proc.forEach((m) => (m.visible = false));
    }).catch((e) => console.error(e));

    let camRef = null;
    return {
      cam: { dist: 22, el: 9, az: 0 },
      attach(cam) { camRef = cam; },
      labels: [
        { name: "Горизонт событий", desc: "Граница невозврата: чёрный шар в центре. Для массы Солнца его радиус всего ≈3 км.", at: () => new THREE.Vector3(0, model ? 0.4 * S3 : 0.9, 0) },
        { name: "Фотонное кольцо", desc: "Свет здесь может облетать дыру по кругу. Его и сфотографировал Телескоп горизонта событий.", at: () => (model ? new THREE.Vector3(0.58 * S3, 0.12 * S3, 0) : new THREE.Vector3(0, 1.52, 0).applyQuaternion(photon.quaternion)) },
        { name: "Аккреционный диск", desc: "Газ раскаляется до миллионов градусов и закручивается вокруг дыры, как вода в воронке.", at: () => new THREE.Vector3(4.6, 0, 1.5) },
        { name: "Изогнутый свет", desc: "Светящиеся слои над и под чёрным шаром — это свет дальней стороны диска, который гравитация изогнула к нам.", at: () => new THREE.Vector3(0, model ? 0.56 * S3 : 2.6, 0).applyQuaternion(model ? new THREE.Quaternion() : lens.quaternion) },
        { name: "Джеты", desc: "Магнитные поля выбрасывают струи плазмы почти со скоростью света.", at: () => new THREE.Vector3(0, 10, 0) },
      ],
      update(dt, t, S) {
        const cam = S.camera;
        disk.material.uniforms.uT.value = t; lens.material.uniforms.uT.value = t * 0.8;
        disk.material.uniforms.uCam.value.copy(cam.position);
        // кольца и «тень» всегда смотрят на зрителя
        for (const m of [lens, photon, shadow]) m.quaternion.copy(cam.quaternion);
        // газ в диске вращается, слои света переливаются
        if (ringMesh && !reducedMotion()) ringMesh.rotation.y += dt * 0.12;
        for (const m of glowMats) m.uniforms.uT.value = t;
      },
      readout() { return "Ничто, даже свет, не вырвется из-за горизонта событий"; },
    };
  },

  // ======================================================== квазар
  quasar({ root, mobile }) {
    const g = makeGalaxy({ n: mobile ? 6000 : 11000, R: 9, arms: 2, bar: false, seed: 17 }); root.add(g);
    const core = glow(0xdfe8ff, 6, 1); root.add(core);
    const core2 = glow(0xffffff, 2.2, 1); root.add(core2);
    const jetMat = new THREE.MeshBasicMaterial({ color: 0x8fb4ff, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mk = (s) => { const j = new THREE.Mesh(new THREE.CylinderGeometry(s > 0 ? 0.35 : 0.08, s > 0 ? 0.08 : 0.35, 26, 16, 1, true), jetMat); j.position.y = 13 * s; return j; };
    const jets = new THREE.Group(); jets.add(mk(1), mk(-1)); jets.rotation.z = 0.25; root.add(jets);
    const r = mulberry(61), K = 40, kp = new Float32Array(K * 3), kph = new Float32Array(K);
    for (let i = 0; i < K; i++) kph[i] = r();
    const knots = points(kp, null, 0.6, 0.9); knots.material.color = new THREE.Color(0xbfd4ff); jets.add(knots);
    return {
      cam: { dist: 34, el: 22, az: 20 },
      labels: [
        { name: "Ядро-квазар", desc: "Газ, падающий в чёрную дыру, светит ярче всех звёзд галактики.", at: () => new THREE.Vector3(0.3, 0.3, 0) },
        { name: "Сверхмассивная чёрная дыра", desc: "В миллиарды раз тяжелее Солнца.", at: () => new THREE.Vector3(0, 0, 0) },
        { name: "Джет", desc: "Струя плазмы длиной в сотни тысяч световых лет.", at: () => new THREE.Vector3(0, 18, 0).applyMatrix4(jets.matrixWorld) },
        { name: "Галактика-хозяин", desc: "Её звёзды почти не видны в блеске квазара.", at: () => new THREE.Vector3(-7, 0, 2).applyMatrix4(g.matrixWorld) },
      ],
      update(dt, t) {
        g.rotation.y += dt * 0.05;
        core.material.opacity = 0.85 + 0.15 * Math.sin(t * 3);
        for (let i = 0; i < K; i++) { kph[i] = (kph[i] + dt * 0.25) % 1; const s = i % 2 ? 1 : -1, y = s * (1 + kph[i] * 25); kp.set([0, y, 0], i * 3); }
        knots.geometry.attributes.position.needsUpdate = true;
      },
      readout() { return "Один квазар может светить как тысяча Млечных Путей"; },
    };
  },

  // ======================================================== гравитационные волны
  gravwaves({ root, mobile }) {
    const S = 70, SEG = mobile ? 60 : 90, verts = [];
    for (let i = 0; i <= SEG; i++) for (let j = 0; j < SEG; j++) {
      const x0 = -S / 2 + (j / SEG) * S, x1 = -S / 2 + ((j + 1) / SEG) * S, z = -S / 2 + (i / SEG) * S;
      verts.push(x0, 0, z, x1, 0, z, z, 0, x0, z, 0, x1);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uPhase: { value: 0 }, uOmega: { value: 1 }, uAmp: { value: 0.4 }, uRing: { value: 0 } },
      vertexShader: `uniform float uPhase, uOmega, uAmp, uRing; varying float vH; varying float vR;
        void main(){ vec3 p = position; float r = length(p.xz); float phi = atan(p.z, p.x);
          float ret = uPhase - uOmega * r * 0.35;
          float h = uAmp * cos(2.0 * phi - 2.0 * ret) / (1.0 + 0.12 * r) * smoothstep(0.0, 4.0, r);
          h += uRing * cos(r * 1.2 - uPhase * 3.0) * exp(-r * 0.06) * 0.8;
          float well = -2.4 / (1.0 + r * r * 0.12);
          p.y = h + well; vH = h; vR = r; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: `varying float vH; varying float vR; void main(){ vec3 base = vec3(0.32, 0.42, 0.72); vec3 hi = vec3(0.75, 0.88, 1.0);
          float k = clamp(abs(vH) * 1.4, 0.0, 1.0); gl_FragColor = vec4(mix(base, hi, k), (0.55 + 0.45 * k) * (1.0 - smoothstep(26.0, 35.0, vR))); }`,
    });
    root.add(new THREE.LineSegments(geo, mat));
    const bh = () => { const o = new THREE.Group(); o.add(new THREE.Mesh(new THREE.SphereGeometry(0.8, 32, 16), new THREE.MeshBasicMaterial({ color: 0x000000 }))); o.add(glow(0xffb070, 3, 0.6)); return o; };
    const A = bh(), B = bh(); root.add(A, B);
    const merged = bh(); merged.scale.setScalar(1.4); root.add(merged);
    const st = { t: 0, phase: 0, hist: [], omega: 1 };
    return {
      cam: { dist: 40, el: 30, az: 20 },
      labels: [
        { name: "Чёрная дыра 1", desc: "≈36 масс Солнца (как в первом пойманном событии).", at: () => A.position.clone() },
        { name: "Чёрная дыра 2", desc: "≈29 масс Солнца. Пары кружат всё быстрее и сближаются.", at: () => B.position.clone() },
        { name: "Гравитационная волна", desc: "Рябь пространства бежит со скоростью света, растягивая и сжимая всё на пути.", at: () => new THREE.Vector3(14, 0, -6) },
        { name: "Пространство-время", desc: "Масса прогибает «ткань» пространства — это и есть гравитация.", at: () => new THREE.Vector3(-20, 0, 12) },
      ],
      update(dt) {
        st.t += dt; const T = 14, k = (st.t % T) / T;
        let a, omega, amp, ring = 0;
        if (k < 0.78) { const q = k / 0.78; a = lerp(5.5, 0.9, Math.pow(q, 2.2)); omega = 1.3 * Math.pow(5.5 / a, 1.5) * 0.35; amp = 0.35 + (1 - a / 5.5) * 0.9; }
        else { const q = (k - 0.78) / 0.22; a = 0; omega = 3; amp = 1.2 * Math.exp(-q * 5); ring = Math.exp(-q * 3); }
        st.phase += omega * dt * 2.2; st.omega = omega;
        A.position.set(Math.cos(st.phase) * a, 0.6, Math.sin(st.phase) * a); B.position.set(-Math.cos(st.phase) * a, 0.6, -Math.sin(st.phase) * a);
        A.visible = B.visible = k < 0.78; merged.visible = k >= 0.78; merged.position.set(0, 0.6, 0);
        mat.uniforms.uPhase.value = st.phase; mat.uniforms.uOmega.value = omega; mat.uniforms.uAmp.value = amp; mat.uniforms.uRing.value = ring;
        st.hist.push(Math.cos(st.phase * 2) * amp); if (st.hist.length > 220) st.hist.shift();
        if (k < 0.01) st.hist = [];
        st.k = k;
      },
      readout() { return st.k < 0.78 ? "Чёрные дыры сближаются — частота волн растёт («чирп»)" : "Слияние! Новая чёрная дыра «звенит» и успокаивается"; },
      inset(c, w, h) {
        c.clearRect(0, 0, w, h);
        c.font = "9px ui-monospace, monospace"; c.fillStyle = "rgba(255,255,255,.7)"; c.fillText("сигнал детектора LIGO", 6, 11);
        c.strokeStyle = "#9fd0ff"; c.lineWidth = 1.4; c.beginPath();
        st.hist.forEach((y, i) => { const X = 6 + (i / 219) * (w - 12), Y = h / 2 + 6 - y * (h / 2 - 14) * 0.7; i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.stroke();
      },
    };
  },

  // ======================================================== экзопланеты
  exoplanets({ root }) {
    const star = new THREE.Mesh(new THREE.SphereGeometry(1.6, 64, 32), new THREE.MeshBasicMaterial({ color: 0xffe2a8 })); root.add(star);
    const sg = glow(0xffc070, 8, 0.6); root.add(sg);
    const hz = new THREE.Mesh(new THREE.RingGeometry(5.2, 8, 96), new THREE.MeshBasicMaterial({ color: 0x30a46c, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false })); hz.rotation.x = -Math.PI / 2; root.add(hz);
    const R = 6.4, orbit = []; for (let a = 0; a <= 128; a++) orbit.push(new THREE.Vector3(Math.cos((a / 128) * TAU) * R, 0, Math.sin((a / 128) * TAU) * R)); root.add(line(orbit, 0x8a96b0, 0.6));
    const planet = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 16), new THREE.MeshStandardMaterial({ color: 0x4f86d8, roughness: 0.8 })); root.add(planet);
    const light = new THREE.PointLight(0xffffff, 60, 0, 1.5); root.add(light);
    const st = { mode: "transit", ang: 0, flux: [], rv: [], v: 0 };
    const sp = new THREE.Vector3(), pp = new THREE.Vector3();
    return {
      cam: { dist: 24, el: 6, az: 0 },
      labels: [
        { name: "Звезда", desc: "Её свет и движение выдают невидимую планету.", at: () => star.position.clone().add(new THREE.Vector3(1.1, 1.1, 0)) },
        { name: "Экзопланета", desc: "Сама почти не видна — её в миллиарды раз затмевает звезда.", at: () => planet.position.clone() },
        { name: "Зона обитаемости", desc: "Здесь может быть жидкая вода — не слишком жарко и не слишком холодно.", at: () => new THREE.Vector3(-7.4, 0, -2) },
      ],
      controls: [{ type: "buttons", id: "mode", items: [["transit", "Транзит"], ["rv", "Лучевые скорости"]], value: "transit" }],
      control(id, v) { if (id === "mode") { st.mode = v; st.flux = []; st.rv = []; } },
      update(dt, t, S) {
        st.ang += dt * 0.5;
        planet.position.set(Math.sin(st.ang) * R, 0, Math.cos(st.ang) * R);
        // звезда и планета вращаются вокруг общего центра масс (покачивание преувеличено)
        const wob = st.mode === "rv" ? 0.45 : 0.0;
        star.position.set(-Math.sin(st.ang) * wob, 0, -Math.cos(st.ang) * wob); sg.position.copy(star.position); light.position.copy(star.position);
        // транзит: перекрытие дисков на экране
        const cam = S.camera; sp.copy(star.position).project(cam); pp.copy(planet.position).project(cam);
        const dz = planet.position.clone().sub(cam.position).length() < star.position.clone().sub(cam.position).length();
        const px = S.width / 2, d = Math.hypot((sp.x - pp.x) * px, (sp.y - pp.y) * S.height / 2);
        const rS = (1.6 / star.position.distanceTo(cam.position)) / Math.tan((cam.fov * Math.PI) / 360) * S.height / 2;
        const rP = (0.42 / planet.position.distanceTo(cam.position)) / Math.tan((cam.fov * Math.PI) / 360) * S.height / 2;
        let cover = 0; if (dz) cover = d < rS - rP ? 1 : d < rS + rP ? (rS + rP - d) / (2 * rP) : 0;
        const flux = 1 - cover * (rP * rP) / (rS * rS);
        st.flux.push(flux); if (st.flux.length > 220) st.flux.shift();
        st.v = Math.cos(st.ang); // к нам / от нас
        st.rv.push(st.v); if (st.rv.length > 220) st.rv.shift();
        star.material.color.setRGB(1, 0.89, 0.66);
        if (st.mode === "rv") { const k = st.v * 0.35; star.material.color.setRGB(1 - Math.max(0, -k), 0.89, 0.66 + Math.max(0, -k) * 0); if (k > 0) star.material.color.setRGB(1, 0.89, 0.66 + k); else star.material.color.setRGB(1, 0.89 + k * 0.4, 0.66 + k * 0.8); }
        st.cover = cover;
      },
      readout() { return st.mode === "transit" ? (st.cover > 0 ? "Транзит! Звезда чуть потускнела" : "Ждём, когда планета пройдёт перед звездой") : (st.v > 0.3 ? "Звезда движется к нам — свет синеет" : st.v < -0.3 ? "Звезда удаляется — свет краснеет" : "Звезда покачивается из-за планеты"); },
      inset(c, w, h) {
        c.clearRect(0, 0, w, h);
        c.font = "9px ui-monospace, monospace"; c.fillStyle = "rgba(255,255,255,.7)";
        c.fillText(st.mode === "transit" ? "яркость звезды" : "скорость звезды (к нам ↑ / от нас ↓)", 6, 11);
        c.strokeStyle = st.mode === "transit" ? "#ffd27a" : "#9fd0ff"; c.lineWidth = 1.6; c.beginPath();
        const arr = st.mode === "transit" ? st.flux : st.rv;
        arr.forEach((y, i) => { const X = 6 + (i / 219) * (w - 12), Y = st.mode === "transit" ? 20 + (1 - y) * 900 : h / 2 + 6 - y * (h / 2 - 14); i ? c.lineTo(X, Math.min(h - 4, Y)) : c.moveTo(X, Y); }); c.stroke();
      },
    };
  },
};

/** Смонтировать 3D-сцену темы. */
export function mountScene({ stage, svg, labelsEl, scene: id, onReadout, onLabel }) {
  const S = createStage(stage, { fov: 32, far: 4000, fitWidth: true });
  const { scene, camera, controls } = S;
  scene.background = new THREE.Color("#04060b");
  stage.closest(".plate")?.classList.add("space");
  scene.add(bg(S.mobile ? 900 : 1600));
  const root = new THREE.Group(); scene.add(root);
  // HTML-подписи над объектами (для сцен со многими объектами)
  const tags = [];
  const addTag = (html, at) => { const el = document.createElement("div"); el.className = "tag cos-tag"; el.innerHTML = html; labelsEl.append(el); tags.push({ el, at }); };
  const sc = SCENES[id]({ root, mobile: S.mobile, addTag });
  sc.attach?.(camera);
  const { dist, el, az } = sc.cam;
  const E = THREE.MathUtils.degToRad(el), A = THREE.MathUtils.degToRad(az);
  const D = dist * (S.mobile ? 1.15 : 1);
  camera.position.set(Math.sin(A) * Math.cos(E) * D, Math.sin(E) * D, Math.cos(A) * Math.cos(E) * D);
  controls.minDistance = D * 0.3; controls.maxDistance = D * 2.5;

  // ---- выноски (как у разрезов): колонка справа, на телефоне — номера на объектах
  const NS = "http://www.w3.org/2000/svg";
  svg.innerHTML = "";
  const state = { hover: -1, pinned: -1 };
  const callouts = sc.labels.map((L, i) => {
    const path = document.createElementNS(NS, "path"), dotEl = document.createElementNS(NS, "circle");
    dotEl.setAttribute("r", "2.6"); svg.append(path, dotEl);
    const elx = document.createElement("div"); elx.className = "callout-label"; elx.dataset.n = String(i + 1).padStart(2, "0");
    elx.innerHTML = `<b>${String(i + 1).padStart(2, "0")} ${L.name}</b>${L.desc ? `<span class="d">${L.desc}</span>` : ""}`;
    elx.addEventListener("pointerenter", () => setHover(i)); elx.addEventListener("pointerleave", () => setHover(-1));
    elx.addEventListener("click", (e) => { if (e.pointerType === "touch" || elx.classList.contains("compact")) setPinned(state.pinned === i ? -1 : i); });
    labelsEl.append(elx);
    return { path, dot: dotEl, el: elx };
  });
  // описание по наведению: точки-якоря видны всегда, подпись с описанием — только у той, на которую навели
  svg.classList.add("reveal", "dots"); labelsEl.classList.add("reveal");
  let proj = [];
  S.renderer.domElement.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch" || !proj.length) return;
    const r = S.renderer.domElement.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = -1, bd = 46;
    proj.forEach((p, i) => { const d = Math.hypot(p.x - x, p.y - y); if (p.z <= 1 && d < bd) { bd = d; best = i; } });
    setHover(best);
  });
  S.renderer.domElement.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch") setHover(-1); });
  const active = () => (state.hover >= 0 ? state.hover : state.pinned);
  function setHover(i) { if (state.hover !== i) { state.hover = i; onLabel?.(active()); } }
  function setPinned(i) { state.pinned = i; onLabel?.(active()); }
  function layout() {
    const W = S.width, H = S.height, compact = W < 560;
    const items = sc.labels.map((L, i) => ({ i, p: S.project(L.at()) }));
    if (items.some((x) => !isFinite(x.p.x))) return;
    proj = items.map((x) => x.p);
    if (compact) {
      spreadBadges(items.map((x) => Object.assign(x, { x: x.p.x, y: x.p.y })));
      items.forEach((x) => { const c = callouts[x.i]; c.el.classList.add("compact"); c.path.style.opacity = c.dot.style.opacity = "0"; c.el.style.left = x.x + "px"; c.el.style.top = x.y + "px"; c.el.classList.toggle("on", active() === x.i); c.el.style.opacity = x.p.z > 1 ? 0 : 1; });
      return;
    }
    const colX = W - 250, gap = 30, total = (items.length - 1) * gap;
    const sorted = items.slice().sort((a, b) => a.p.y - b.p.y);
    const y0 = Math.max(52, Math.min(H - 52 - total, H / 2 - total / 2));
    sorted.forEach((x, k) => {
      const on = active() === x.i, c = callouts[x.i], ly = on ? Math.min(y0 + k * gap, H - 130) : y0 + k * gap;
      c.el.classList.remove("compact"); c.path.style.opacity = c.dot.style.opacity = "";
      c.el.style.left = colX + 14 + "px"; c.el.style.top = ly - 7 + "px";
      const px = Math.min(x.p.x, colX - 40), mx = Math.max(px + 18, colX - 30);
      c.path.setAttribute("d", `M${px.toFixed(1)},${x.p.y.toFixed(1)} L${mx.toFixed(1)},${ly.toFixed(1)} L${(colX + 8).toFixed(1)},${ly.toFixed(1)}`);
      c.dot.setAttribute("cx", px.toFixed(1)); c.dot.setAttribute("cy", x.p.y.toFixed(1));
      [c.path, c.dot, c.el].forEach((e) => e.classList.toggle("on", on));
      c.el.classList.remove("dim");
      c.el.style.opacity = on ? "" : 0;
      c.dot.style.opacity = x.p.z > 1 ? 0 : "";
    });
  }
  function layoutTags() {
    for (const tg of tags) { const p = S.project(tg.at()); tg.el.style.left = p.x + "px"; tg.el.style.top = p.y + "px"; tg.el.classList.toggle("hidden", p.z > 1); }
  }

  // ---- вставка с графиком (кривая вращения, сигнал пульсара, «чирп», транзит)
  let inset = null;
  if (sc.inset) {
    inset = document.createElement("canvas"); inset.className = "cos-inset"; stage.append(inset);
    const dpr = Math.min(2, devicePixelRatio || 1); inset.width = 240 * dpr; inset.height = 90 * dpr; inset.getContext("2d").scale(dpr, dpr);
  }
  let lastTxt = "";
  S.onFrame((dt, t, idle) => {
    sc.update(dt, t, S);
    if (!reducedMotion() && idle > 8 && !sc.noTour) root.rotation.y += dt * 0.02;
    layout(); layoutTags();
    if (inset) sc.inset(inset.getContext("2d"), 240, 90, t);
    const a = active();
    const txt = a >= 0 ? `${String(a + 1).padStart(2, "0")} ${sc.labels[a].name}` : sc.readout();
    if (txt !== lastTxt) { lastTxt = txt; onReadout?.(txt); }
  });
  S.start();
  return {
    controls: sc.controls || [],
    control: (cid, v) => { sc.control?.(cid, v); S.touch(); },
    labels: sc.labels,
    pin: setPinned, hover: setHover,
    dispose: () => { inset?.remove(); S.dispose(); },
  };
}
