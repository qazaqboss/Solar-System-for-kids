// Магнитное поле Земли и солнечный ветер — 3D-сцена в стиле Anatomy.
// Земля (настоящие карты: день, ночные огни, блеск океана), силовые линии диполя,
// которые солнечный ветер сжимает с дневной стороны и вытягивает в хвост с ночной,
// магнитопауза и ударная волна, пояса Ван Аллена, полярные сияния.
// Частицы солнечного ветра летят от Солнца, обтекают магнитный «щит», а часть из них
// скатывается по силовым линиям к полюсам — там вспыхивает сияние.
// В режиме «Магнитная буря» Солнце выбрасывает облако плазмы, оно ударяет по полю и сжимает его.
import * as THREE from "three";
import { reducedMotion, isMobile } from "./gl.js";
import { mulberry } from "./textures.js";

const TAU = Math.PI * 2;
const R = 2.2;                       // радиус Земли в единицах сцены
const SUN_X = -36;                   // Солнце слева (сильно ближе, чем на самом деле)
const SUN_R = 6.5;                   // видимый радиус Солнца
/** Плавный «порывистый» сигнал от −1 до 1: сумма медленных синусов с несоизмеримыми частотами. */
const gust = (t, s = 0) => 0.5 * Math.sin(t * 0.37 + s) + 0.3 * Math.sin(t * 0.61 + 1.3 + s * 2) + 0.2 * Math.sin(t * 1.13 + 2.1 + s * 3);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

let dotTex = null;
function dot() {
  if (dotTex) return dotTex;
  const cv = document.createElement("canvas"); cv.width = cv.height = 64;
  const c = cv.getContext("2d"), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.3, "rgba(255,255,255,.6)"); g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  return (dotTex = new THREE.CanvasTexture(cv));
}
const glowSprite = (color, s, op = 1) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot(), color, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending })); m.scale.set(s, s, 1); return m; };

/** Карты Земли (запечены из присланной модели): день с облаками, ночные огни, блеск океана. */
function earthMaterial(sunDirRef) {
  const small = isMobile();
  const load = (n) => { const t = new THREE.TextureLoader().load(`img/tex/${n}${small ? "-s" : ""}.webp`); t.anisotropy = 8; return t; };
  const day = load("earth"), night = load("earth-night"), spec = load("earth-spec");
  day.colorSpace = night.colorSpace = THREE.SRGBColorSpace;
  return new THREE.ShaderMaterial({
    uniforms: { day: { value: day }, night: { value: night }, spec: { value: spec }, sunDir: { value: sunDirRef }, fade: { value: 1 } },
    transparent: true,
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vW; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform sampler2D day; uniform sampler2D night; uniform sampler2D spec; uniform vec3 sunDir; uniform float fade; varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){
        vec3 n = normalize(vN); float l = dot(n, normalize(sunDir));
        float d = smoothstep(-0.12, 0.25, l);
        vec3 col = texture2D(day, vUv).rgb * (0.05 + 1.25 * pow(max(l, 0.0), 0.75));
        vec3 lights = texture2D(night, vUv).rgb * 2.2 * (1.0 - d);
        // блик Солнца на океане
        vec3 v = normalize(cameraPosition - vW); vec3 h = normalize(normalize(sunDir) + v);
        float s = (1.0 - texture2D(spec, vUv).r) * pow(max(dot(n, h), 0.0), 60.0) * 0.9 * step(0.0, l);
        // голубая дымка атмосферы по краю
        float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        col = col + lights + vec3(s) + vec3(0.3, 0.55, 1.0) * rim * (0.25 + 0.75 * d);
        gl_FragColor = vec4(col, fade);
        #include <colorspace_fragment>
      }`,
  });
}

/** Поверхность «щита» (магнитопауза, ударная волна): светится край, по ней бегут волны. */
function shieldMaterial(color, strength) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { c: { value: new THREE.Color(color) }, uT: { value: 0 }, uK: { value: strength }, uHit: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP = position; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 c; uniform float uT; uniform float uK; uniform float uHit; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float wave = 0.65 + 0.35 * sin(vP.y * 0.9 - uT * 2.4) * sin(atan(vP.x, vP.z) * 5.0 + uT * 0.7);
        float a = (f * 0.85 + 0.06) * wave * uK * (1.0 + uHit * 1.8);
        gl_FragColor = vec4(c * a, a);
      }`,
  });
}

/** Профиль магнитопаузы (модель Шуэ): r(θ) = r0·(2/(1+cos θ))^α. Ось — к Солнцу (−x). */
function shueProfile(alpha, n = 70, thMax = 2.45) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const th = (i / n) * thMax, r = Math.pow(2 / (1 + Math.cos(th)), alpha);
    pts.push(new THREE.Vector2(Math.max(1e-3, r * Math.sin(th)), r * Math.cos(th))); // (радиус, высота вдоль оси к Солнцу)
  }
  return pts;
}
/** Радиус щита на расстоянии x (x = −высота) при r0 = 1: интерполяция по профилю. */
function makeRhoOf(profile) {
  const xs = profile.map((p) => -p.y), rs = profile.map((p) => p.x);
  return (x) => {
    if (x < xs[0]) return -1; // перед носом — щита нет
    for (let i = 1; i < xs.length; i++) if (x <= xs[i]) { const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]); return lerp(rs[i - 1], rs[i], t); }
    return rs[rs.length - 1] + (x - xs[xs.length - 1]) * 0.15;
  };
}

/** Отдельная сцена «Магнитное поле Земли» (страница #/magnet). */
export function magnetosphere({ root, mobile }) {
  const m = buildMagnetosphere(root, { mobile });
  return {
    cam: { dist: 70, el: 14, az: -8 },
    controls: [{ id: "mode", type: "buttons", value: "wind", items: [["field", "Магнитное поле"], ["wind", "Солнечный ветер"], ["storm", "Магнитная буря"]] }],
    control(id, v) { if (id === "mode") m.setMode(v); },
    labels: m.labels,
    update: (dt, t) => m.update(dt, t),
    readout: m.readout,
  };
}

/**
 * Построить магнитосферу в группе root.
 * embed: true — для встраивания в другую сцену (схема «Система Земли»): без своего Солнца
 * и без своей Земли; группу нужно повернуть так, чтобы ось −x смотрела на Солнце.
 */
export function buildMagnetosphere(root, { mobile = false, embed = false } = {}) {
  const rnd = mulberry(77);
  const st = { mode: "wind", k: 1, kT: 1, r0: 6.2 * R, r0T: 6.2 * R, hit: 0, aur: 0.35, cme: -1, cmeT: 2.5, field: 0, fieldT: 0 };
  const sunDir = new THREE.Vector3(-1, 0, 0);
  if (!embed) root.position.x = 13; // Земля чуть правее центра — слева видно Солнце

  // ---------------------------------------------------------------- Солнце
  const sun = new THREE.Group(); sun.position.set(SUN_X, 0, 0); root.add(sun); // и на схеме «Система Земли» — откуда летит ветер
  // мягкое свечение, пока модель грузится (и под ней)
  sun.add(glowSprite(0xffc260, SUN_R * 3.2, 0.55), glowSprite(0xff8a30, SUN_R * 7, 0.22));
  // корона: тонкие радиальные «стримеры», как на снимках солнечных коронографов
  const corona = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uR: { value: 1 / 7 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float uT; uniform float uR; varying vec2 vUv;
      float h(float n){ return fract(sin(n) * 43758.5453); }
      float nz(float x){ float i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f); return mix(h(i), h(i+1.0), f); }
      void main(){
        vec2 p = vUv * 2.0 - 1.0; float r = length(p); float a = atan(p.y, p.x);
        if (r < uR * 0.9) discard;
        float x = (r - uR) / (1.0 - uR);
        // лучи разной длины и яркости, медленно «дышат»
        float st = 0.0;
        st += nz(a * 9.0 + uT * 0.05) * 0.55;
        st += nz(a * 23.0 - uT * 0.08 + 3.0) * 0.35;
        st += nz(a * 61.0 + uT * 0.11 + 7.0) * 0.25;
        st = pow(st, 2.2);
        float fall = exp(-x * (7.0 - 4.0 * st));
        float glow = exp(-x * 14.0);
        vec3 c = mix(vec3(1.0, 0.62, 0.26), vec3(1.0, 0.93, 0.78), glow);
        float I = (glow * 0.9 + fall * st * 0.75) * smoothstep(1.0, 0.7, r);
        gl_FragColor = vec4(c * I, I);
      }`,
  }));
  corona.scale.setScalar(SUN_R * 7 * 2); corona.renderOrder = -1; sun.add(corona);
  const sunParts = { inner: null, flares: [], spin: new THREE.Group() };
  sun.add(sunParts.spin);
  import("./glb.js").then(({ loadGLB }) => loadGLB("models/sun.glb")).then((g) => {
    const m = g.scene;
    // масштаб — по самому шару Солнца (а не по вспышкам), чтобы диск совпал с короной
    let ball = null; m.traverse((o) => { if (o.isMesh && o.material.name === "sun_inner") ball = o; });
    const bb = new THREE.Box3().setFromObject(ball || m); m.scale.setScalar((SUN_R * 2) / bb.getSize(new THREE.Vector3()).x);
    m.traverse((o) => {
      if (!o.isMesh) return;
      const n = o.material.name, map = o.material.map;
      if (map) { map.anisotropy = 8; map.colorSpace = THREE.SRGBColorSpace; }
      if (n === "sun_inner") {
        // поверхность: подробная карта (присланная, 2048 px) + потемнение к краю диска, как у настоящего Солнца
        const hd = new THREE.TextureLoader().load("img/tex/sun-hd.webp"); hd.colorSpace = THREE.SRGBColorSpace; hd.anisotropy = 8;
        o.material = new THREE.ShaderMaterial({
          uniforms: { map: { value: hd }, uT: { value: 0 } },
          vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
          fragmentShader: `uniform sampler2D map; uniform float uT; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
            void main(){
              float mu = max(dot(normalize(vN), normalize(vV)), 0.0);
              vec3 c = texture2D(map, vUv).rgb;
              // мерцание гранул: две копии карты чуть сдвигаются друг относительно друга
              c = mix(c, texture2D(map, vUv + vec2(0.0015 * sin(uT * 0.7), 0.001 * cos(uT * 0.5))).rgb, 0.5);
              float limb = 0.35 + 0.65 * pow(mu, 0.55);
              gl_FragColor = vec4(c * limb * 1.35 + vec3(1.0, 0.55, 0.15) * pow(1.0 - mu, 3.0) * 0.4, 1.0);
              #include <colorspace_fragment>
            }`,
        });
        sunParts.inner = o.material;
      } else {
        // вспышки, протуберанцы и внешнее свечение — светятся «сложением» света
        o.material = new THREE.MeshBasicMaterial({ map, color: n === "sunouter" ? 0xffb070 : 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: n === "sunouter" ? 0.55 : 1 });
        if (n !== "sunouter") sunParts.flares.push({ o, base: o.scale.clone(), ph: rnd() * TAU, sp: 0.6 + rnd() * 0.8 });
      }
    });
    sunParts.spin.add(m);
  }).catch((e) => console.error(e));

  // ---------------------------------------------------------------- Земля
  const earthG = new THREE.Group(); root.add(earthG);
  const earthMat = embed ? { uniforms: { fade: { value: 1 } } } : earthMaterial(sunDir); // встроенной версии своя Земля не нужна
  const earth = new THREE.Mesh(new THREE.SphereGeometry(R, mobile ? 64 : 128, mobile ? 40 : 80), earthMat);
  earth.rotation.z = THREE.MathUtils.degToRad(-23.4); // наклон оси вращения
  earth.renderOrder = 2; if (!embed) earthG.add(earth);
  // магнитная ось наклонена к оси вращения на ≈11°
  const mag = new THREE.Group(); mag.rotation.z = THREE.MathUtils.degToRad(-23.4 + 11); earthG.add(mag);
  // «магнит» внутри Земли — виден в режиме «Магнитное поле»
  const bar = new THREE.Group(); if (!embed) mag.add(bar);
  const barN = new THREE.Mesh(new THREE.BoxGeometry(0.55, R * 0.9, 0.55), new THREE.MeshBasicMaterial({ color: 0xd8483a, transparent: true }));
  const barS = new THREE.Mesh(new THREE.BoxGeometry(0.55, R * 0.9, 0.55), new THREE.MeshBasicMaterial({ color: 0x3b6fd8, transparent: true }));
  barN.position.y = R * 0.45; barS.position.y = -R * 0.45; bar.add(barN, barS);
  // у Земли северный географический полюс — это южный магнитный: туда «смотрит» северный конец стрелки компаса
  const axisLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -R * 1.9, 0), new THREE.Vector3(0, R * 1.9, 0)]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
  if (!embed) mag.add(axisLine);

  // ---------------------------------------------------------------- силовые линии
  const Ls = [1.35, 1.8, 2.5, 3.4, 4.6, 6.0, 7.6];
  const PHI = mobile ? 10 : 14, SEG = 64;
  const lines = [];
  for (const L of Ls) for (let j = 0; j < PHI; j++) {
    const phi = (j / PHI) * TAU, th0 = Math.asin(Math.sqrt(1 / L)) + 0.02;
    const pts = [];
    for (let k = 0; k <= SEG; k++) { const th = lerp(th0, Math.PI - th0, k / SEG), r = L * Math.sin(th) ** 2 * R; pts.push(new THREE.Vector3(r * Math.sin(th) * Math.cos(phi), r * Math.cos(th), r * Math.sin(th) * Math.sin(phi))); }
    lines.push({ L, phi, pts });
  }
  // открытые линии хвоста: от полярных шапок уходят далеко на ночную сторону
  const tails = [];
  for (const s of [1, -1]) for (let j = 0; j < (mobile ? 7 : 11); j++) {
    const a = ((j + 0.5) / (mobile ? 7 : 11) - 0.5) * 2.2, h = 0.22 + rnd() * 0.18;
    tails.push({ s, a, h });
  }
  const nLinePts = lines.length * SEG * 2 + tails.length * SEG * 2;
  const linePos = new Float32Array(nLinePts * 3), lineCol = new Float32Array(nLinePts * 3);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute("position", new THREE.BufferAttribute(linePos, 3));
  lineGeo.setAttribute("color", new THREE.BufferAttribute(lineCol, 3));
  const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
  const fieldLines = new THREE.LineSegments(lineGeo, lineMat); root.add(fieldLines);
  const tmp = new THREE.Vector3(), magQ = new THREE.Quaternion();
  /** Деформация диполя солнечным ветром: днём поле сжато, ночью вытянуто в хвост. */
  function deform(p, k, r0) {
    const r = p.length(), comp = r0 / (6.2 * R);
    if (p.x < 0) { const s = smooth(1.4 * R, 7 * R, r); p.x *= lerp(1, 0.62 * comp, s * k); p.y *= lerp(1, 0.9, s * k); p.z *= lerp(1, 0.9, s * k); }
    else { const s = smooth(2 * R, 7 * R, r); p.x *= 1 + 1.9 * s * k; p.y *= 1 - 0.35 * s * k; p.z *= 1 - 0.2 * s * k; }
    return p;
  }
  const cNear = new THREE.Color("#8fd8ff"), cFar = new THREE.Color("#3a6cff"), cTail = new THREE.Color("#7b8cff"), cc = new THREE.Color();
  function buildLines(t) {
    magQ.copy(mag.quaternion);
    let o = 0;
    const put = (v, c) => { linePos[o * 3] = v.x; linePos[o * 3 + 1] = v.y; linePos[o * 3 + 2] = v.z; lineCol[o * 3] = c.r; lineCol[o * 3 + 1] = c.g; lineCol[o * 3 + 2] = c.b; o++; };
    const kk = st.k * (1 - st.field), prev = new THREE.Vector3(), cur = new THREE.Vector3();
    const wv = 0.35 + 0.65 * kk; // в чистом диполе линии тоже чуть «дышат», под ветром — сильнее
    for (const ln of lines) {
      // в режиме «Магнитное поле» — чистый диполь; дальние линии ночью раскрываются в хвост
      const open = ln.L > 5 && kk > 0.05;
      for (let k = 0; k <= SEG; k++) {
        cur.copy(ln.pts[k]).applyQuaternion(magQ);
        deform(cur, kk, st.r0);
        if (open && cur.x > 0) cur.multiplyScalar(1 + kk * 0.25 * smooth(4 * R, 9 * R, cur.length()));
        // по линии бежит медленная волна от Солнца к хвосту — поле плавно колышется
        { const r = cur.length(), a = smooth(1.6 * R, 7 * R, r) * wv * R * 0.16;
          cur.y += Math.sin(t * 0.55 - r * 0.32 + ln.phi * 2) * a;
          cur.z += Math.cos(t * 0.42 - r * 0.27 + ln.phi * 3) * a * 0.7;
          cur.x += Math.sin(t * 0.33 + ln.phi) * a * 0.4; }
        if (k > 0) {
          const pulse = 0.6 + 0.4 * Math.sin(t * 0.9 - (k / SEG) * TAU * 2 + ln.phi * 3);
          cc.copy(cNear).lerp(cFar, Math.min(1, (ln.L - 1.3) / 6.5)).multiplyScalar(0.55 + 0.45 * pulse);
          put(prev, cc); put(cur, cc);
        }
        prev.copy(cur);
      }
    }
    // хвост: от полярной шапки дугой назад, затем почти параллельно оси Солнце — Земля
    for (const tl of tails) {
      const cap = new THREE.Vector3(Math.sin(0.32) * Math.cos(Math.PI + tl.a * 0.6) * R, tl.s * Math.cos(0.32) * R, Math.sin(0.32) * Math.sin(tl.a * 0.6) * R).applyQuaternion(magQ);
      for (let k = 0; k <= SEG; k++) {
        const u = k / SEG, len = lerp(2, 70, kk) * u;
        cur.set(cap.x + len, cap.y * (1 + 3.2 * Math.sqrt(u)) * lerp(1, tl.h * 3.2, smooth(0.25, 1, u)) , cap.z + tl.a * 5 * Math.sqrt(u));
        // хвост колышется, как флаг на ветру: волна идёт от Земли к концу хвоста
        cur.y += Math.sin(t * 0.7 - u * 5.5 + tl.a) * u * 2.6 * kk;
        cur.z += Math.cos(t * 0.5 - u * 4.2 + tl.a * 2) * u * 1.6 * kk;
        if (k > 0) { const f = (1 - u * 0.85) * (0.6 + 0.4 * Math.sin(t * 0.9 - u * 9)); cc.copy(cTail).multiplyScalar(f * kk); put(prev, cc); put(cur, cc); }
        prev.copy(cur);
      }
    }
    lineGeo.attributes.position.needsUpdate = true; lineGeo.attributes.color.needsUpdate = true;
  }

  // ---------------------------------------------------------------- магнитопауза и ударная волна
  const mpProf = shueProfile(0.58), bsProf = shueProfile(0.78, 70, 2.25);
  const rhoMP = makeRhoOf(mpProf);
  const mp = new THREE.Mesh(new THREE.LatheGeometry(mpProf, 96), shieldMaterial("#5fb4ff", 0.55)); mp.rotation.z = Math.PI / 2; root.add(mp);
  const bs = new THREE.Mesh(new THREE.LatheGeometry(bsProf, 96), shieldMaterial("#ffc98a", 0.32)); bs.rotation.z = Math.PI / 2; root.add(bs);

  // ---------------------------------------------------------------- пояса Ван Аллена
  const NB = mobile ? 2600 : 5200;
  const bPos = new Float32Array(NB * 3), bCol = new Float32Array(NB * 3), bBase = [];
  const inner = new THREE.Color("#ff9a5a"), outer = new THREE.Color("#66d6ff");
  for (let i = 0; i < NB; i++) {
    const isIn = i < NB * 0.38, L = isIn ? lerp(1.25, 1.9, rnd()) : lerp(3.0, 5.2, Math.pow(rnd(), 0.8));
    const th = Math.PI / 2 + (rnd() - 0.5) * (isIn ? 1.0 : 1.25), r = L * Math.sin(th) ** 2 * R, phi = rnd() * TAU;
    bBase.push({ r, th, phi, w: (isIn ? 0.25 : 0.12) * (rnd() < 0.5 ? 1 : -1) });
    const c = isIn ? inner : outer, b = 0.35 + rnd() * 0.65; bCol.set([c.r * b, c.g * b, c.b * b], i * 3);
  }
  const bGeo = new THREE.BufferGeometry(); bGeo.setAttribute("position", new THREE.BufferAttribute(bPos, 3)); bGeo.setAttribute("color", new THREE.BufferAttribute(bCol, 3));
  const belts = new THREE.Points(bGeo, new THREE.PointsMaterial({ size: 0.16, map: dot(), vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
  mag.add(belts);

  // ---------------------------------------------------------------- полярные сияния
  const auroraMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uI: { value: 0.4 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float uT; uniform float uI; varying vec2 vUv;
      void main(){
        float a = vUv.x * 6.2832;
        float curtain = 0.55 + 0.45 * sin(a * 9.0 + uT * 1.7) * sin(a * 23.0 - uT * 2.9 + sin(a * 3.0 + uT));
        float h = vUv.y;
        vec3 col = mix(vec3(0.25, 1.0, 0.55), vec3(0.75, 0.35, 1.0), smoothstep(0.35, 1.0, h));
        float alpha = curtain * (1.0 - h) * smoothstep(0.0, 0.12, h) * uI * 1.6;
        gl_FragColor = vec4(col * alpha, alpha);
      }`,
  });
  const auroras = [1, -1].map((s) => {
    const colat = 0.36, rr = R * Math.sin(colat) * 1.01;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rr * 1.18, rr, R * 0.32, 128, 1, true), auroraMat);
    m.position.y = s * (R * Math.cos(colat) + R * 0.12); if (s < 0) m.rotation.x = Math.PI;
    mag.add(m); return m;
  });

  // ---------------------------------------------------------------- солнечный ветер
  const NW = mobile ? 900 : 1800;
  const wPos = new Float32Array(NW * 3), wCol = new Float32Array(NW * 3), wind = [];
  const wGeo = new THREE.BufferGeometry(); wGeo.setAttribute("position", new THREE.BufferAttribute(wPos, 3)); wGeo.setAttribute("color", new THREE.BufferAttribute(wCol, 3));
  const windPts = new THREE.Points(wGeo, new THREE.PointsMaterial({ size: 0.55, map: dot(), vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
  root.add(windPts);
  // у каждой частицы — светящийся след: поток похож на лучи, бьющие от Солнца
  const trPos = new Float32Array(NW * 6), trCol = new Float32Array(NW * 6);
  const trGeo = new THREE.BufferGeometry(); trGeo.setAttribute("position", new THREE.BufferAttribute(trPos, 3)); trGeo.setAttribute("color", new THREE.BufferAttribute(trCol, 3));
  const trails = new THREE.LineSegments(trGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
  root.add(trails);
  // частица вылетает с поверхности Солнца и летит радиально — пучок расходится конусом
  const spawn = (p, fresh) => {
    const a = rnd() * TAU, c = Math.sqrt(rnd()) * 0.62; // угол от оси «Солнце — Земля» (до ≈35°)
    p.dx = Math.cos(c); p.dy = Math.sin(c) * Math.cos(a); p.dz = Math.sin(c) * Math.sin(a);
    const s = SUN_R * 1.02 + (fresh ? rnd() * 100 : rnd() * 2);
    p.x = SUN_X + p.dx * s; p.y = p.dy * s; p.z = p.dz * s;
    p.v = 0.7 + rnd() * 0.6; p.b = 0.35 + rnd() * 0.65; p.len = 1.6 + rnd() * 3.4; p.heat = 0; p.px = undefined;
  };
  for (let i = 0; i < NW; i++) { const p = {}; spawn(p, true); wind.push(p); }
  const cCold = new THREE.Color("#ffd27a"), cHot = new THREE.Color("#fff3e0");

  // частицы, захваченные полем: скатываются по силовым линиям к полюсам
  const NC = mobile ? 40 : 80;
  const cPos = new Float32Array(NC * 3), caught = [];
  const cGeo = new THREE.BufferGeometry(); cGeo.setAttribute("position", new THREE.BufferAttribute(cPos, 3));
  const caughtPts = new THREE.Points(cGeo, new THREE.PointsMaterial({ size: 0.5, map: dot(), color: 0x9dffc4, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
  root.add(caughtPts);
  for (let i = 0; i < NC; i++) caught.push({ t: -rnd() * 3, s: rnd() < 0.5 ? 1 : -1, phi: rnd() * TAU, dur: 1.6 + rnd() * 0.9 });
  const P0 = new THREE.Vector3(), P1 = new THREE.Vector3(), P2 = new THREE.Vector3();

  // выброс плазмы (буря): светящаяся «шапка», летящая от Солнца
  const cme = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24, 0, TAU, 0, 0.75), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uA: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float uA; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6); vec3 c = vec3(1.0, 0.62, 0.25); gl_FragColor = vec4(c * (0.15 + f) * uA, (0.15 + f) * uA); }`,
  }));
  cme.rotation.z = -Math.PI / 2; cme.visible = false; root.add(cme);

  // ---------------------------------------------------------------- кадр
  function setMode(m) {
    st.mode = m;
    st.fieldT = m === "field" ? 1 : 0;
    st.kT = m === "storm" ? 1.35 : 1;
    st.cmeT = 1.2;
  }
  setMode("wind");

  return {
    st, mag, setMode,
    labels: [
      { name: "Солнце и вспышки", desc: "Над поверхностью Солнца поднимаются петли раскалённой плазмы — протуберанцы, а при вспышках выбрасывается энергия миллиардов атомных бомб. Солнце всё время выдувает поток частиц — солнечный ветер, он летит к Земле со скоростью около 400 км/с.", at: () => new THREE.Vector3(SUN_X + SUN_R * 0.6, SUN_R * 0.6, SUN_R * 0.5) },
      { name: "Ударная волна", desc: "Ветер летит быстрее звука в космической плазме, поэтому перед магнитным полем Земли образуется ударная волна — как перед носом катера.", at: () => new THREE.Vector3(-st.r0 * 1.32, 4, 0) },
      { name: "Магнитопауза — щит Земли", desc: "Граница, где давление солнечного ветра уравновешено магнитным полем. Днём она в ≈10 радиусах Земли, а в бурю прижимается ближе.", at: () => new THREE.Vector3(-st.r0, 0.2, 0) },
      { name: "Силовые линии поля", desc: "Земля — как огромный магнит: жидкое железо во внешнем ядре вращается и создаёт поле. Линии выходят у одного полюса и входят у другого.", at: () => new THREE.Vector3(-1.4 * R, 2.4 * R, 0).applyQuaternion(mag.quaternion) },
      { name: "Пояса Ван Аллена", desc: "Два «бублика» из захваченных полем частиц: внутренний (протоны) и внешний (электроны). Спутники и космонавты стараются не задерживаться в них надолго.", at: () => new THREE.Vector3(0, 0, 4 * R).applyQuaternion(mag.quaternion) },
      { name: "Полярное сияние", desc: "Частицы скатываются по силовым линиям к полюсам и заставляют светиться кислород (зелёный и красный) и азот (фиолетовый) на высоте 100–300 км.", at: () => new THREE.Vector3(0, R * 1.18, 0).applyQuaternion(mag.quaternion) },
      { name: "Магнитный хвост", desc: "Ветер вытягивает поле на ночной стороне в длинный хвост — дальше орбиты Луны, на сотни радиусов Земли.", at: () => new THREE.Vector3(26, 3.2, 0) },
    ],
    update(dt, t) {
      const rm = reducedMotion(), sp = rm ? 0.25 : 1;
      st.k = lerp(st.k, st.kT, 1 - Math.exp(-dt * 1.5));
      st.field = lerp(st.field, st.fieldT, 1 - Math.exp(-dt * 2.2));
      const fieldMode = st.field > 0.5;

      // буря: Солнце время от времени выбрасывает облако плазмы
      if (st.mode === "storm") {
        st.cmeT -= dt;
        if (st.cmeT <= 0 && st.cme < 0) { st.cme = 0; st.cmeT = 7.5; }
      }
      if (st.cme >= 0) {
        st.cme += dt * sp * 0.42;
        const x = lerp(SUN_X + SUN_R, 40, st.cme), rad = lerp(SUN_R * 0.8, 40, st.cme);
        cme.visible = true; cme.position.set(x - rad, 0, 0); cme.scale.setScalar(rad);
        cme.material.uniforms.uA.value = Math.sin(Math.min(1, st.cme) * Math.PI) * 0.9;
        if (x > -st.r0 * 1.3 && x < 0) st.hit = Math.min(1, st.hit + dt * 2.5);
        if (st.cme >= 1) { st.cme = -1; cme.visible = false; }
      }
      st.hit = Math.max(0, st.hit - dt * 0.35);
      // давление ветра прижимает щит; удар облака плазмы — ещё сильнее
      st.r0T = (st.mode === "storm" ? 5.4 : 6.2) * R - st.hit * 1.6 * R;
      st.r0 = lerp(st.r0, st.r0T * (1 + 0.045 * gust(t * sp) * (1 - st.field)), 1 - Math.exp(-dt * 1.2));
      mag.rotation.y = Math.sin(t * sp * 0.08) * 0.6; // ось магнита плавно покачивается — линии поля «плывут»
      const showWind = 1 - st.field;
      mp.scale.setScalar(st.r0); bs.scale.setScalar(st.r0 * 1.3);
      for (const m of [mp, bs]) { m.material.uniforms.uT.value = t; m.material.uniforms.uHit.value = st.hit; m.visible = showWind > 0.05; m.material.uniforms.uK.value = (m === mp ? 0.55 : 0.32) * showWind; }

      // Земля и магнит
      earth.rotation.y += dt * 0.05 * sp;
      earthMat.uniforms.fade.value = lerp(1, 0.4, st.field);
      bar.visible = st.field > 0.05; barN.material.opacity = barS.material.opacity = st.field;
      // Солнце медленно вращается; вспышки и протуберанцы плавно разгораются и гаснут
      sunParts.spin.rotation.y += dt * 0.025 * sp;
      corona.material.uniforms.uT.value = t * sp;
      if (sunParts.inner) sunParts.inner.uniforms.uT.value = t * sp;
      for (const f of sunParts.flares) {
        const k = 0.5 + 0.5 * Math.sin(t * sp * f.sp * 0.6 + f.ph) * (st.mode === "storm" ? 1 : 0.8);
        f.o.material.opacity = 0.45 + 0.55 * k;
        f.o.scale.copy(f.base).multiplyScalar(0.9 + 0.22 * k + (st.mode === "storm" ? 0.1 : 0));
      }

      buildLines(t * sp);

      // пояса медленно дрейфуют вокруг Земли
      for (let i = 0; i < NB; i++) {
        const b = bBase[i], phi = b.phi + t * b.w * sp, r = b.r;
        bPos[i * 3] = r * Math.sin(b.th) * Math.cos(phi); bPos[i * 3 + 1] = r * Math.cos(b.th); bPos[i * 3 + 2] = r * Math.sin(b.th) * Math.sin(phi);
      }
      bGeo.attributes.position.needsUpdate = true;
      belts.material.opacity = 0.8 * (0.6 + 0.4 * (st.mode === "storm" ? 1.3 : 1));

      // солнечный ветер: обтекает щит; у ударной волны частицы тормозят и раскаляются
      windPts.visible = showWind > 0.05; windPts.material.opacity = 0.95 * showWind;
      const speed = (st.mode === "storm" ? 26 : 17) * sp * (1 + 0.12 * gust(t * sp, 1.7)); // ветер порывистый
      for (let i = 0; i < NW; i++) {
        const p = wind[i];
        const bsR = rhoMP(p.x / (st.r0 * 1.3)) * st.r0 * 1.3;
        const inside = bsR > 0 && Math.hypot(p.y, p.z) < bsR;
        p.heat = lerp(p.heat, inside ? 1 : 0, 1 - Math.exp(-dt * 4));
        const step = dt * speed * p.v * (1 - 0.45 * p.heat);
        p.x += p.dx * step; p.y += p.dy * step * (1 - p.heat); p.z += p.dz * step * (1 - p.heat);
        let rho = Math.hypot(p.y, p.z);
        const need = rhoMP(p.x / st.r0) * st.r0 * 1.06;
        if (need > 0 && rho < need) { const s = rho < 1e-3 ? 1 : need / rho; if (rho < 1e-3) { p.y = need; } else { p.y *= s; p.z *= s; } }
        if (p.x > 62 || Math.hypot(p.y, p.z) > 46) { spawn(p, false); p.px = p.x; p.py = p.y; p.pz = p.z; }
        wPos[i * 3] = p.x; wPos[i * 3 + 1] = p.y; wPos[i * 3 + 2] = p.z;
        // яркость: разгорается у короны, слабеет с расстоянием от Солнца, гаснет у края сцены
        const dS = Math.hypot(p.x - SUN_X, p.y, p.z);
        cc.copy(cCold).lerp(cHot, p.heat); const f = p.b * smooth(SUN_R, SUN_R * 1.6, dS) * (1 - smooth(48, 62, p.x)) * (0.45 + 0.55 * SUN_R * 2.2 / Math.max(SUN_R * 2.2, dS * 0.6));
        wCol[i * 3] = cc.r * f; wCol[i * 3 + 1] = cc.g * f; wCol[i * 3 + 2] = cc.b * f;
        // след тянется назад по направлению движения (после поворота у щита — вдоль него)
        const tx = p.px ?? p.x - p.dx, ty = p.py ?? p.y - p.dy, tz = p.pz ?? p.z - p.dz, dx = p.x - tx, dy = p.y - ty, dz = p.z - tz, dl = Math.hypot(dx, dy, dz) || 1, len = p.len * (st.mode === "storm" ? 1.5 : 1) * (1 - 0.5 * p.heat);
        trPos.set([p.x, p.y, p.z, p.x - (dx / dl) * len, p.y - (dy / dl) * len, p.z - (dz / dl) * len], i * 6);
        trCol.set([cc.r * f * 0.75, cc.g * f * 0.68, cc.b * f * 0.5, 0, 0, 0], i * 6);
        p.px = p.x; p.py = p.y; p.pz = p.z;
      }
      wGeo.attributes.position.needsUpdate = true; wGeo.attributes.color.needsUpdate = true;
      trGeo.attributes.position.needsUpdate = true; trGeo.attributes.color.needsUpdate = true;
      trails.visible = windPts.visible; trails.material.opacity = 0.8 * showWind;

      // захваченные частицы: от носа щита через «воронку» у полюса — в зону сияния
      caughtPts.visible = !fieldMode;
      let arrivals = 0;
      for (let i = 0; i < NC; i++) {
        const c = caught[i];
        c.t += dt * sp * (st.mode === "storm" ? 1.6 : 1) / c.dur;
        if (c.t >= 1) { c.t = 0; c.s = rnd() < 0.5 ? 1 : -1; c.phi = rnd() * TAU; arrivals++; }
        const u = Math.max(0, c.t);
        P0.set(-st.r0 * 1.02, c.s * (1 + rnd() * 0.01) * R * 1.4, Math.sin(c.phi) * R * 2);
        P1.set(-st.r0 * 0.45, c.s * st.r0 * 0.62, Math.sin(c.phi) * R * 1.2);
        P2.set(R * Math.sin(0.36) * Math.cos(c.phi), c.s * R * Math.cos(0.36) * 1.02, R * Math.sin(0.36) * Math.sin(c.phi)).applyQuaternion(mag.quaternion);
        // квадратичная кривая Безье + винтовое закручивание вокруг силовой линии
        tmp.copy(P0).multiplyScalar((1 - u) ** 2).addScaledVector(P1, 2 * u * (1 - u)).addScaledVector(P2, u * u);
        const sw = (1 - u) * 0.6; tmp.x += Math.cos(u * 40 + i) * sw; tmp.z += Math.sin(u * 40 + i) * sw;
        cPos[i * 3] = c.t < 0 ? 9999 : tmp.x; cPos[i * 3 + 1] = tmp.y; cPos[i * 3 + 2] = tmp.z;
      }
      cGeo.attributes.position.needsUpdate = true;

      // сияние разгорается от прилетевших частиц и от ударов бури
      const base = fieldMode ? 0.05 : st.mode === "storm" ? 0.75 : 0.38;
      st.aur = lerp(st.aur, base + st.hit * 0.8, 1 - Math.exp(-dt * 1.2)) + arrivals * 0.004;
      auroraMat.uniforms.uT.value = t * sp; auroraMat.uniforms.uI.value = Math.min(1.4, st.aur);
      auroras.forEach((a) => (a.scale.setScalar(1 + (st.mode === "storm" ? 0.18 : 0) + st.hit * 0.1)));
    },
    readout() {
      if (st.field > 0.5) return "Земля — огромный магнит: линии поля идут от полюса к полюсу";
      if (st.hit > 0.3) return "Удар облака плазмы! Щит прижат к Земле, сияния разгораются";
      return st.mode === "storm" ? "Магнитная буря: Солнце выбрасывает облака плазмы" : "Солнечный ветер обтекает магнитный щит Земли";
    },
  };
}
