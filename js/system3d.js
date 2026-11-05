// Fig — система спутников Юпитера или Сатурна в 3D.
// Радиус орбиты сжат логарифмом (от 128 тыс. до 25 млн км), наклоны и
// направление движения настоящие: обратные спутники летят в другую сторону.
import * as THREE from "three";
import { createStage, cssVar, reducedMotion } from "./gl.js";
import { makeTexture, makeRingTexture, mulberry } from "./textures.js";
import { BY_ID } from "./data/bodies.js";

export function mountSystem({ stage, labelsEl, system, planet, onReadout, onPick, filter }) {
  const S = createStage(stage, { fov: 30, far: 5000 });
  const { scene, camera, controls } = S;
  const aMin = system.moons[0].a, aMax = 27e6;
  const P_R = 3.0; // видимый радиус планеты
  const rOf = (a) => P_R * 1.9 + Math.log10(a / aMin) / Math.log10(aMax / aMin) * 46;

  // планета
  const tex = new THREE.CanvasTexture(makeTexture(planet.look, 512, 256));
  tex.colorSpace = THREE.SRGBColorSpace;
  const pl = new THREE.Mesh(new THREE.SphereGeometry(P_R, 64, 40), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  scene.add(pl);
  if (planet.rings) {
    // кольца в той же логарифмической шкале
    const rt = new THREE.CanvasTexture(makeRingTexture(planet.rings));
    const a0 = 67000, a1 = 141000;
    const ri = P_R * 1.15, ro = rOf(Math.max(a1, aMin * 1.06)) * 0.985;
    const g = new THREE.RingGeometry(ri, ro, 160, 1);
    const pa = g.attributes.position, uv = g.attributes.uv;
    for (let k = 0; k < pa.count; k++) uv.setXY(k, (Math.hypot(pa.getX(k), pa.getY(k)) - ri) / (ro - ri), 0.5);
    const ring = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: rt, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.9 }));
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);
  }
  const sun = new THREE.PointLight(0xffffff, 0, 0);
  scene.add(sun);

  const groupColor = (g) => new THREE.Color(system.groups[g].color);
  const items = [];
  const rnd = mulberry(system.id === "jupiter" ? 5 : 9);

  function orbitBasis(incDeg, node) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.cos(node), 0, Math.sin(node)), THREE.MathUtils.degToRad(incDeg));
    return q;
  }

  system.moons.forEach((m) => {
    const r = rOf(m.a);
    const node = rnd() * Math.PI * 2;
    const q = orbitBasis(m.i, node);
    const pts = [];
    for (let k = 0; k <= 200; k++) { const t = (k / 200) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(t) * r, 0, Math.sin(t) * r).applyQuaternion(q)); }
    const col = groupColor(m.group);
    const lm = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: system.groups[m.group].kind === "irregular" ? 0.16 : 0.6 });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lm);
    scene.add(line);
    const size = Math.max(0.2, 0.1 + Math.log10(Math.max(0.3, m.r)) * 0.42);
    const detail = BY_ID[m.id];
    let mat;
    if (detail && !detail.shape) {
      const t = new THREE.CanvasTexture(makeTexture(detail.look, 256, 128));
      t.colorSpace = THREE.SRGBColorSpace;
      mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 });
    } else mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.6, emissive: col, emissiveIntensity: 0.25 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 20, 14), mat);
    scene.add(mesh);
    const it = { m, r, q, line, lm, mesh, size, phase: rnd() * Math.PI * 2, baseOp: lm.opacity };
    items.push(it);
    if (system.groups[m.group].kind === "major" || ["phoebe", "himalia", "amalthea"].includes(m.id)) {
      const tag = document.createElement("a");
      tag.className = "tag" + (m.r < 400 ? " small" : "");
      tag.href = `#/moon/${m.id}`; tag.textContent = m.name;
      tag.addEventListener("pointerenter", () => setHover(it));
      tag.addEventListener("pointerleave", () => setHover(null));
      labelsEl.append(tag);
      it.tag = tag;
    }
  });

  // безымянные спутники — облако точек по группам
  const unnamed = system.total - system.named;
  const clouds = [];
  const irr = Object.entries(system.groups).filter(([, g]) => g.share);
  const shareSum = irr.reduce((s, [, g]) => s + g.share, 0);
  let left = unnamed;
  irr.forEach(([key, g], gi) => {
    const n = gi === irr.length - 1 ? left : Math.round((unnamed * g.share) / shareSum);
    left -= n;
    const pos = new Float32Array(n * 3);
    const data = [];
    for (let k = 0; k < n; k++) {
      const a = g.a[0] + rnd() * (g.a[1] - g.a[0]);
      const inc = g.inc[0] + rnd() * (g.inc[1] - g.inc[0]);
      const q = orbitBasis(inc, rnd() * Math.PI * 2);
      const period = 2 * Math.PI * Math.sqrt(Math.pow(a * 1000, 3) / (system.id === "jupiter" ? 1.26687e17 : 3.7931e16)) / 86400;
      data.push({ r: rOf(a), q, phase: rnd() * Math.PI * 2, period });
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: new THREE.Color(g.color), size: 0.3, transparent: true, opacity: 0.75 }));
    scene.add(pts);
    clouds.push({ key, pts, data, pos });
  });

  // камера
  const D = 200, EL = THREE.MathUtils.degToRad(34), AZ = THREE.MathUtils.degToRad(25);
  camera.position.set(Math.sin(AZ) * Math.cos(EL) * D, Math.sin(EL) * D, Math.cos(AZ) * Math.cos(EL) * D);
  controls.minDistance = 12; controls.maxDistance = 320;

  const state = { days: 0, speed: 2, filter: filter || null, hover: null };
  function setHover(it) {
    state.hover = it;
    items.forEach((x) => { x.lm.opacity = x === it ? 1 : visibleBy(x) ? x.baseOp : 0.04; x.tag?.classList.toggle("on", x === it); });
    readout();
  }
  function visibleBy(x) { return !state.filter || x.m.group === state.filter; }
  function applyFilter() {
    items.forEach((x) => {
      const on = visibleBy(x);
      x.lm.opacity = on ? x.baseOp : 0.04;
      x.mesh.material.opacity = on ? 1 : 0.15; x.mesh.material.transparent = !on;
      if (x.tag) x.tag.style.display = on ? "" : "none";
    });
    clouds.forEach((c) => { c.pts.material.opacity = !state.filter || c.key === state.filter ? 0.7 : 0.06; });
  }
  const fmtA = (a) => a >= 1e6 ? `${(a / 1e6).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} млн км` : `${Math.round(a).toLocaleString("ru-RU")} км`;
  let lastTxt = "";
  function readout() {
    const it = state.hover;
    const txt = it
      ? `${it.m.name} · ${fmtA(it.m.a)} · ${Math.abs(it.m.p).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} сут${it.m.retro ? " · обратный" : ""}`
      : `прошло ${Math.round(state.days).toLocaleString("ru-RU")} сут · ×${state.speed} сут/с`;
    if (txt !== lastTxt) { lastTxt = txt; onReadout?.(txt); }
  }

  const ptr = new THREE.Vector2();
  function pick(e) {
    const rc = S.renderer.domElement.getBoundingClientRect();
    const x = e.clientX - rc.left, y = e.clientY - rc.top;
    let best = null, bd = 16;
    const v = new THREE.Vector3();
    for (const it of items) {
      if (!visibleBy(it)) continue;
      it.mesh.getWorldPosition(v);
      const p = S.project(v);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }
  let downAt = null;
  S.renderer.domElement.addEventListener("pointermove", (e) => { const it = pick(e); if (it !== state.hover) setHover(it); S.renderer.domElement.style.cursor = it ? "pointer" : ""; });
  S.renderer.domElement.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; });
  S.renderer.domElement.addEventListener("pointerup", (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    const it = pick(e); if (it) onPick?.(it.m.id);
  });

  const tmp = new THREE.Vector3(), v = new THREE.Vector3();
  S.onFrame((dt, t, idle) => {
    const rm = reducedMotion();
    if (!rm) state.days += dt * state.speed;
    pl.rotation.y += dt * 0.15;
    for (const it of items) {
      const ang = it.phase + (state.days / Math.abs(it.m.p)) * Math.PI * 2; // наклон >90° сам разворачивает движение
      tmp.set(Math.cos(ang) * it.r, 0, -Math.sin(ang) * it.r).applyQuaternion(it.q);
      it.mesh.position.copy(tmp);
      if (it.tag) {
        v.copy(tmp); v.y += it.size + 0.2;
        const p = S.project(v);
        it.tag.style.left = p.x + "px"; it.tag.style.top = p.y + "px";
      }
    }
    for (const c of clouds) {
      for (let k = 0; k < c.data.length; k++) {
        const d = c.data[k];
        const ang = d.phase + (state.days / d.period) * Math.PI * 2;
        tmp.set(Math.cos(ang) * d.r, 0, -Math.sin(ang) * d.r).applyQuaternion(d.q);
        c.pos[k * 3] = tmp.x; c.pos[k * 3 + 1] = tmp.y; c.pos[k * 3 + 2] = tmp.z;
      }
      c.pts.geometry.attributes.position.needsUpdate = true;
    }
    if (idle > 6 && !rm) {
      const a = Math.atan2(camera.position.x, camera.position.z) + dt * 0.025;
      const rr = Math.hypot(camera.position.x, camera.position.z);
      camera.position.x = Math.sin(a) * rr; camera.position.z = Math.cos(a) * rr;
    }
    readout();
  });
  S.start();
  applyFilter();
  return {
    setSpeed(x) { state.speed = x; },
    setFilter(g) { state.filter = g; applyFilter(); },
    zoom(kind) {
      const d = kind === "inner" ? 42 : 200;
      const dir = camera.position.clone().normalize();
      camera.position.copy(dir.multiplyScalar(d));
      S.touch();
    },
    dispose: () => S.dispose(),
  };
}
