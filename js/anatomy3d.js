// «Анатомический» 3D-разрез тела: вложенные оболочки-слои, вырезанный клин,
// ступенчатая «разборка» и выноски с подписями, как в фигурах Anatomy.
import * as THREE from "three";
import { createStage, follow, reducedMotion, cssVar, liveTexture, isMobile, spreadBadges } from "./gl.js";
import { makeTexture, makeRingTexture, makeNoise, hex } from "./textures.js";

const TAU = Math.PI * 2;
const dirOf = (th, ph) => [Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph)];

/** Функция формы: множитель радиуса для направления (для неправильных тел). */
export function shapeFn(shape) {
  if (!shape) return () => 1;
  const [a, b, c] = shape.axes;
  const mean = Math.cbrt(a * b * c);
  const ax = a / mean, ay = c / mean, az = b / mean; // x — длинная ось, y — полярная (короткая)
  const N = makeNoise(shape.seed || 1);
  const rough = shape.rough || 0, ridge = shape.ridge || 0, ridgeW = shape.ridgeW || 0.05;
  const cache = new Map();
  return (d) => {
    const key = ((d[0] * 1e4) | 0) * 73856093 ^ ((d[1] * 1e4) | 0) * 19349663 ^ ((d[2] * 1e4) | 0) * 83492791;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    let r = 1 / Math.sqrt((d[0] / ax) ** 2 + (d[1] / ay) ** 2 + (d[2] / az) ** 2);
    if (rough) r *= 1 + rough * N.fbm(d[0] * 1.7 + 3, d[1] * 1.7, d[2] * 1.7, 4);
    if (shape.pits) r *= 1 - 0.05 * Math.max(0, N.fbm(d[0] * 3.2, d[1] * 3.2, d[2] * 3.2, 2));
    if (ridge) r *= 1 + ridge * Math.exp(-((d[1] / ridgeW) ** 2));
    if (cache.size < 200000) cache.set(key, r);
    return r;
  };
}

/** Видимые радиусы слоёв: тонкие слои утолщаются до читаемой толщины, итог нормирован к 1. */
function visualRadii(layers, R) {
  const solid = layers.filter((l) => !l.gas);
  const outer = solid.length ? solid[solid.length - 1].to : R;
  const MIN = 0.045;
  const th = solid.map((l) => Math.max(MIN, (l.to - l.from) / outer));
  const sum = th.reduce((a, b) => a + b, 0);
  let acc = 0;
  const out = solid.map((l, i) => { const from = acc; acc += th[i] / sum; return { from, to: acc }; });
  // газовые оболочки снаружи — по реальной толщине, но не меньше 3 %
  let top = 1;
  layers.filter((l) => l.gas).forEach((l) => {
    const t = Math.min(0.25, Math.max(0.03, (l.to - l.from) / outer));
    out.push({ from: top, to: top + t });
    top += t;
  });
  return out;
}

function shellGeometry(r, sf, phiA, phiB, segW, segH) {
  // Долготы берём на фиксированной сетке (плюс точные края клина):
  // так форма тела и тригонометрия не пересчитываются каждый кадр анимации.
  const step = TAU / segW;
  const phis = [phiA];
  for (let k = Math.floor(phiA / step) + 1; k * step < phiB - step * 0.25; k++) if (k * step > phiA + step * 0.25) phis.push(k * step);
  phis.push(phiB);
  const cols = phis.length, rows = segH + 1;
  const pos = new Float32Array(cols * rows * 3), uv = new Float32Array(cols * rows * 2);
  let p = 0, q = 0;
  for (let j = 0; j < rows; j++) {
    const th = (j / segH) * Math.PI, st = Math.sin(th), ct = Math.cos(th);
    for (let i = 0; i < cols; i++) {
      const ph = phis[i];
      const d = [st * Math.sin(ph), ct, st * Math.cos(ph)];
      const sc = r * sf(d);
      pos[p++] = d[0] * sc; pos[p++] = d[1] * sc; pos[p++] = d[2] * sc;
      uv[q++] = (ph + Math.PI) / TAU; uv[q++] = 1 - th / Math.PI;
    }
  }
  const idx = [];
  for (let j = 0; j < segH; j++) for (let i = 0; i < cols - 1; i++) {
    const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
    if (j !== 0) idx.push(a, c, b);
    if (j !== segH - 1) idx.push(b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function capGeometry(rIn, rOut, sf, ph, segH, base, top) {
  const pos = [], col = [], idx = [];
  const segR = 5;
  const c0 = new THREE.Color(base), c1 = new THREE.Color(top);
  for (let j = 0; j <= segH; j++) {
    const th = (j / segH) * Math.PI;
    const d = dirOf(th, ph);
    const s = sf(d);
    for (let k = 0; k <= segR; k++) {
      const t = rIn + ((rOut - rIn) * k) / segR;
      pos.push(d[0] * t * s, d[1] * t * s, d[2] * t * s);
      const cc = c0.clone().lerp(c1, k / segR);
      col.push(cc.r, cc.g, cc.b);
    }
  }
  const W = segR + 1;
  for (let j = 0; j < segH; j++) for (let k = 0; k < segR; k++) {
    const a = j * W + k, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function layerTexture(color, seed) {
  // мелкая зернистость для внутренних оболочек
  const look = { style: "solid", seed, color: shade(color, -0.12), color2: shade(color, 0.1), freq: 7, amp: 1.4 };
  return isMobile() ? makeTexture(look, 128, 64) : makeTexture(look, 256, 128);
}
function shade(c, k) {
  const [r, g, b] = hex(c);
  const f = (v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return "#" + [f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/**
 * Построить фигуру-разрез.
 * opts: { stage, svg, labelsEl, body, onReadout(text), onLayer(i) }
 */
export function mountAnatomy({ stage, svg, labelsEl, body, onReadout, onLayer }) {
  const S = createStage(stage, { fov: 28 });
  const { scene, camera, controls } = S;
  const sf = shapeFn(body.shape);
  const vis = visualRadii(body.layers, body.radius);
  const solidCount = body.layers.filter((l) => !l.gas).length;
  const irregular = !!body.shape;
  const segW = S.mobile ? (irregular ? 84 : 64) : (irregular ? 120 : 96), segH = S.mobile ? (irregular ? 56 : 44) : (irregular ? 80 : 64);

  const group = new THREE.Group();
  scene.add(group);
  if (body.tilt) group.rotation.z = THREE.MathUtils.degToRad(Math.min(body.tilt, 30));

  // --- материалы
  const surfTex = liveTexture(body.look, irregular ? 512 : 1024, irregular ? 256 : 512);
  surfTex.anisotropy = S.mobile ? 2 : 4;

  const layers = body.layers.map((l, i) => {
    const outerSolid = i === solidCount - 1;
    let shellMat;
    if (l.gas) {
      shellMat = new THREE.MeshLambertMaterial({ color: l.color, transparent: true, opacity: body.atmo?.opacity ?? 0.22, depthWrite: false, side: THREE.FrontSide });
    } else if (outerSolid) {
      shellMat = body.emissive
        ? new THREE.MeshBasicMaterial({ map: surfTex, side: THREE.DoubleSide })
        : new THREE.MeshStandardMaterial({ map: surfTex, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
    } else {
      const t = new THREE.CanvasTexture(layerTexture(l.color, 300 + i));
      t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
      shellMat = body.emissive
        ? new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide })
        : new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, side: THREE.DoubleSide });
    }
    const capMat = body.emissive
      ? new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: !!l.gas, opacity: l.gas ? 0.25 : 1, depthWrite: !l.gas })
      : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide, transparent: !!l.gas, opacity: l.gas ? 0.3 : 1, depthWrite: !l.gas, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0 });
    shellMat.emissive && (shellMat.emissiveIntensity = 0);
    const shell = new THREE.Mesh(new THREE.BufferGeometry(), shellMat);
    const capA = new THREE.Mesh(new THREE.BufferGeometry(), capMat);
    const capB = new THREE.Mesh(new THREE.BufferGeometry(), capMat);
    [shell, capA, capB].forEach((m) => { m.userData.layer = i; if (l.gas) m.renderOrder = 2; group.add(m); });
    return { def: l, vis: vis[i], shell, capA, capB, capMat, shellMat, cut: -1 };
  });

  // кольца
  if (body.rings) {
    const tex = new THREE.CanvasTexture(makeRingTexture(body.rings));
    tex.colorSpace = THREE.SRGBColorSpace;
    const [rin, rout] = body.rings === "saturn" ? [67000 / body.radius, 141000 / body.radius] : [1.64, 2.06];
    const g = new THREE.RingGeometry(rin, rout, 180, 1);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const r = Math.hypot(p.getX(i), p.getY(i));
      uv.setXY(i, (r - rin) / (rout - rin), 0.5);
    }
    const ring = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 3;
    group.add(ring);
    if (body.rings === "saturn") group.rotation.z = THREE.MathUtils.degToRad(-14);
    else group.rotation.z = THREE.MathUtils.degToRad(-24);
  }

  // свечение короны/атмосферы — мягкий ореол-спрайт
  if (body.emissive) {
    const cv = document.createElement("canvas"); cv.width = cv.height = 256;
    const c = cv.getContext("2d");
    const gr = c.createRadialGradient(128, 128, 40, 128, 128, 128);
    gr.addColorStop(0, "rgba(255,190,90,.75)"); gr.addColorStop(0.5, "rgba(255,150,40,.18)"); gr.addColorStop(1, "rgba(255,140,40,0)");
    c.fillStyle = gr; c.fillRect(0, 0, 256, 256);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthWrite: false, transparent: true }));
    sp.scale.set(3.4, 3.4, 1);
    sp.renderOrder = -1;
    scene.add(sp);
  }

  // --- камера: клин открыт к зрителю, чуть сверху
  const outerVis = vis[vis.length - 1].to;
  const frameR = body.rings === "saturn" ? 2.15 : body.rings ? 2.15 : Math.max(1.12, outerVis) * (irregular ? 1.25 : 1);
  const dist = (frameR / Math.tan(THREE.MathUtils.degToRad(28 / 2))) * 1.3;
  const AZ0 = THREE.MathUtils.degToRad(22), EL0 = THREE.MathUtils.degToRad(18);
  camera.position.set(Math.sin(AZ0) * Math.cos(EL0) * dist, Math.sin(EL0) * dist, Math.cos(AZ0) * Math.cos(EL0) * dist);
  camera.lookAt(0, 0, 0);
  controls.minDistance = dist * 0.45;
  controls.maxDistance = dist * 1.8;
  controls.target.set(0, 0, 0);

  // клин смотрит на камеру (по азимуту)
  const WEDGE_C = AZ0 + THREE.MathUtils.degToRad(8);

  const state = { cut: 0, cutT: 90, explode: 0, explodeT: 0, hover: -1, pinned: -1, spin: 0 };

  function rebuild() {
    const n = layers.length;
    layers.forEach((L, i) => {
      const k = Math.min(i, solidCount - 1);
      const stepFrac = solidCount > 1 ? k / (solidCount - 1) : 0;
      let cutDeg = state.cut * (1 + state.explode * stepFrac * 1.3) + (L.def.gas ? state.cut * 0.4 : 0);
      if (state.cut > 0.3) cutDeg += state.explode * 14;
      cutDeg = Math.min(300, cutDeg);
      if (Math.abs(cutDeg - L.cut) < 0.15) return;
      L.cut = cutDeg;
      const cut = THREE.MathUtils.degToRad(cutDeg);
      const phiA = WEDGE_C + cut / 2, phiB = WEDGE_C - cut / 2 + TAU;
      L.shell.geometry.dispose();
      L.shell.geometry = shellGeometry(L.vis.to, sf, phiA, phiB, segW, segH);
      L.capA.geometry.dispose(); L.capB.geometry.dispose();
      if (cutDeg > 0.3) {
        const base = shade(L.def.color, -0.18), top = shade(L.def.color, 0.08);
        L.capA.geometry = capGeometry(L.vis.from, L.vis.to, sf, phiA, segH, base, top);
        L.capB.geometry = capGeometry(L.vis.from, L.vis.to, sf, phiB - TAU, segH, base, top);
        L.capA.visible = L.capB.visible = true;
      } else {
        L.capA.geometry = new THREE.BufferGeometry(); L.capB.geometry = new THREE.BufferGeometry();
        L.capA.visible = L.capB.visible = false;
      }
      L.phiA = phiA; L.phiB = phiB - TAU;
    });
  }
  rebuild();

  // --- выноски
  const NS = "http://www.w3.org/2000/svg";
  svg.innerHTML = "";
  labelsEl.innerHTML = "";
  const callouts = layers.map((L, i) => {
    const path = document.createElementNS(NS, "path");
    const dot = document.createElementNS(NS, "circle");
    dot.setAttribute("r", "2.6");
    svg.append(path, dot);
    const el = document.createElement("div");
    el.className = "callout-label";
    el.dataset.n = String(i + 1).padStart(2, "0");
    el.innerHTML = `<span class="sw" style="background:${L.def.color}"></span><b>${String(i + 1).padStart(2, "0")} ${L.def.name}</b>`;
    el.addEventListener("pointerenter", () => setHover(i));
    el.addEventListener("pointerleave", () => setHover(-1));
    el.addEventListener("click", () => setPinned(state.pinned === i ? -1 : i));
    labelsEl.append(el);
    return { path, dot, el };
  });

  const v = new THREE.Vector3(), nrm = new THREE.Vector3(), camDir = new THREE.Vector3();
  function layoutCallouts() {
    const W = S.width, H = S.height;
    const compact = W < 560; // телефон: вместо колонки подписей — номера прямо на слоях
    const items = [];
    layers.forEach((L, i) => {
      if (state.cut < 8) { items.push({ i, hidden: true }); return; }
      const rMid = (L.vis.from + L.vis.to) / 2 + (L.def.gas ? 0 : 0);
      const n1 = Math.max(1, layers.length - 1);
      const th = Math.PI / 2 - 0.05 - (i / n1) * 0.55; // внешние слои — выше
      // выбираем грань клина, которая лучше видна
      let best = null;
      for (const [ph, sign] of [[L.phiA, -1], [L.phiB, 1]]) {
        const d = dirOf(th, ph);
        const s = sf(d) * rMid;
        v.set(d[0] * s, d[1] * s, d[2] * s);
        group.localToWorld(v);
        nrm.set(Math.cos(ph) * sign, 0, -Math.sin(ph) * sign).applyQuaternion(group.quaternion);
        camDir.copy(camera.position).sub(v).normalize();
        const facing = nrm.dot(camDir);
        if (!best || facing > best.facing) best = { p: S.project(v), facing };
      }
      items.push({ i, p: best.p, facing: best.facing });
    });
    if (compact) {
      const vis = items.filter((x) => !x.hidden && isFinite(x.p.x)).map((x) => ({ x: x.p.x, y: x.p.y, it: x }));
      spreadBadges(vis);
      vis.forEach((b) => { b.it.bx = b.x; b.it.by = b.y; });
      items.forEach((x) => {
        const c = callouts[x.i], on = state.hover === x.i || state.pinned === x.i;
        c.el.classList.add("compact"); c.path.style.opacity = "0"; c.dot.style.opacity = "0";
        if (x.hidden || !isFinite(x.p.x)) { c.el.style.opacity = "0"; return; }
        c.el.style.opacity = x.facing > -0.05 ? 1 : 0.3;
        c.el.style.left = x.bx + "px"; c.el.style.top = x.by + "px";
        c.el.classList.toggle("on", on);
      });
      return;
    }
    callouts.forEach((c) => c.el.classList.remove("compact"));
    const shown = items.filter((x) => !x.hidden);
    const colX = W - 210;
    shown.sort((a, b) => b.i - a.i); // сверху — внешний слой, снизу — ядро
    const gap = 30, total = (shown.length - 1) * gap;
    let y0 = Math.max(52, Math.min(H - 52 - total, shown.reduce((s, x) => s + x.p.y, 0) / Math.max(1, shown.length) - total / 2));
    shown.forEach((x, k) => { x.ly = y0 + k * gap; });
    items.forEach((x) => {
      const c = callouts[x.i];
      const on = state.hover === x.i || state.pinned === x.i;
      if (x.hidden) { c.el.style.opacity = "0"; c.path.style.opacity = "0"; c.dot.style.opacity = "0"; return; }
      const op = x.facing > -0.05 ? 1 : 0.25;
      c.el.style.opacity = op; c.path.style.opacity = op; c.dot.style.opacity = op;
      c.el.style.left = colX + 14 + "px";
      c.el.style.top = x.ly - 7 + "px";
      const mx = Math.max(x.p.x + 18, colX - 30);
      c.path.setAttribute("d", `M${x.p.x.toFixed(1)},${x.p.y.toFixed(1)} L${mx.toFixed(1)},${x.ly.toFixed(1)} L${(colX + 8).toFixed(1)},${x.ly.toFixed(1)}`);
      c.dot.setAttribute("cx", x.p.x.toFixed(1)); c.dot.setAttribute("cy", x.p.y.toFixed(1));
      c.path.classList.toggle("on", on); c.dot.classList.toggle("on", on); c.el.classList.toggle("on", on);
      c.el.classList.toggle("dim", (state.hover >= 0 || state.pinned >= 0) && !on);
    });
  }

  function active() { return state.hover >= 0 ? state.hover : state.pinned; }
  function applyHighlight() {
    const a = active();
    layers.forEach((L, i) => {
      if (L.capMat.emissive) L.capMat.emissiveIntensity = i === a ? 0.22 : 0;
      if (L.shellMat.emissive && !L.def.gas && i < solidCount - 1) L.shellMat.emissiveIntensity = i === a ? 0.15 : 0;
    });
    onLayer?.(a);
    readout();
  }
  function setHover(i) { if (state.hover !== i) { state.hover = i; applyHighlight(); } }
  function setPinned(i) { state.pinned = i; applyHighlight(); }

  const fmt = (n) => n >= 1000 ? Math.round(n).toLocaleString("ru-RU") : (Math.round(n * 10) / 10).toLocaleString("ru-RU");
  function readout() {
    const a = active();
    if (a >= 0) {
      const l = body.layers[a];
      const depthTop = Math.max(0, body.radius - l.to), depthBot = body.radius - l.from;
      const txt = l.gas ? `${l.name} · до ${fmt(l.to - body.radius)} км над поверхностью` : `${String(a + 1).padStart(2, "0")} ${l.name} · глубина ${fmt(depthTop)}–${fmt(depthBot)} км`;
      onReadout?.(txt);
    } else onReadout?.(`R = ${fmt(body.radius)} км · разрез ${Math.round(state.cut)}° · разбор ${Math.round(state.explode * 100)}%`);
  }

  // --- указатель
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  const pickables = layers.flatMap((L) => [L.shell, L.capA, L.capB]);
  function pickLayer(e) {
    const r = S.renderer.domElement.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hits = ray.intersectObjects(pickables.filter((m) => m.visible), false).filter((h) => !body.layers[h.object.userData.layer].gas || h.object !== layers[h.object.userData.layer].shell);
    return hits.length ? hits[0].object.userData.layer : -1;
  }
  let rafPick = 0, lastMove = null;
  S.renderer.domElement.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return; // на телефоне подсветка — по касанию
    lastMove = e;
    if (!rafPick) rafPick = requestAnimationFrame(() => { rafPick = 0; setHover(pickLayer(lastMove)); });
  });
  S.renderer.domElement.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch") setHover(-1); });
  let downAt = null;
  S.renderer.domElement.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; });
  S.renderer.domElement.addEventListener("pointerup", (e) => {
    // короткое касание/клик (без перетаскивания) — выбрать слой
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 8) return;
    const i = pickLayer(e);
    setPinned(i === state.pinned ? -1 : i);
  });

  // клавиатура: ←/→ слой, ↑/↓ разрез, E — разобрать
  S.renderer.domElement.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") setPinned((state.pinned + 1) % layers.length);
    else if (e.key === "ArrowLeft") setPinned((state.pinned - 1 + layers.length) % layers.length);
    else if (e.key === "ArrowUp") api.setCut(Math.min(180, state.cutT + 10));
    else if (e.key === "ArrowDown") api.setCut(Math.max(0, state.cutT - 10));
    else if (e.key.toLowerCase() === "e" || e.key.toLowerCase() === "у") api.setExplode(state.explodeT > 0.5 ? 0 : 1);
    else return;
    e.preventDefault();
  });

  // --- кадр
  let t0 = -1;
  S.onFrame((dt, t, idle) => {
    if (t0 < 0) t0 = t;
    const introT = t - t0; // реальное время с момента появления сцены
    // «Уменьшение движения» на телефоне не выключает разрез и разборку —
    // они просто идут чуть быстрее; выключаются только автоматические облёты.
    const rm = reducedMotion();
    const cutTarget = introT < 0.6 ? 0 : state.cutT;
    const pc = state.cut, pe = state.explode;
    state.cut = follow(state.cut, cutTarget, dt, rm ? 0.25 : 0.45);
    state.explode = follow(state.explode, state.explodeT, dt, rm ? 0.22 : 0.4);
    if (Math.abs(pc - state.cut) > 0.02 || Math.abs(pe - state.explode) > 0.0005) { rebuild(); readout(); }
    // планета вращается «под» неподвижным клином — двигается только поверхность
    state.spin += dt * (body.emissive ? 0.012 : 0.02) * (rm ? 0.5 : 1);
    surfTex.offset.x = state.spin;
    if (!rm) {
      // спокойный тур, когда никто не трогает
      if (idle > 6) {
        const sway = Math.sin(t * 0.18) * 0.18;
        const az = AZ0 + sway, el = EL0 + Math.sin(t * 0.13) * 0.05;
        const dcur = camera.position.length();
        const tx = Math.sin(az) * Math.cos(el) * dcur, ty = Math.sin(el) * dcur, tz = Math.cos(az) * Math.cos(el) * dcur;
        camera.position.x = follow(camera.position.x, tx, dt, 2.5);
        camera.position.y = follow(camera.position.y, ty, dt, 2.5);
        camera.position.z = follow(camera.position.z, tz, dt, 2.5);
      }
    }
    layoutCallouts();
  });
  S.start();
  readout();

  const api = {
    setCut(deg) { state.cutT = deg; S.touch(); },
    setExplode(x) { state.explodeT = x; S.touch(); },
    get cut() { return state.cutT; }, get explode() { return state.explodeT; },
    pin: setPinned, hover: setHover,
    dispose: () => S.dispose(),
  };
  return api;
}
