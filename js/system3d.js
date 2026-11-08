// Fig — система спутников планеты в 3D (Земля, Марс, Юпитер, Сатурн, Уран, Нептун).
// Радиус орбиты сжат логарифмом (от 128 тыс. до 25 млн км), наклоны и
// направление движения настоящие: обратные спутники летят в другую сторону.
import * as THREE from "three";
import { createStage, cssVar, reducedMotion, liveTexture, declutter, earthMaps } from "./gl.js";
import { makeTexture, makeRingTexture, mulberry } from "./textures.js";
import { BY_ID } from "./data/bodies.js";

export function mountSystem({ stage, labelsEl, system, planet, onReadout, onPick, filter }) {
  const S = createStage(stage, { fov: 30, far: 5000, fitWidth: true });
  const { scene, camera, controls } = S;
  const live = system.moons.filter((m) => !m.gone); // сгоревшие спутники только в каталоге
  const aMin = Math.min(...live.map((m) => m.a)), aMax = system.aMax ?? 27e6;
  const P_R = 3.0; // видимый радиус планеты
  const inner = system.inner ?? 1.9;
  const rOf = (a) => P_R * inner + Math.log10(a / aMin) / Math.log10(aMax / aMin) * 46;
  const GM = system.gm ?? (system.id === "jupiter" ? 1.26687e17 : 3.7931e16);
  const isEarth = system.id === "earth";

  // планета
  const tex = liveTexture(planet.look, 512, 256);
  const pl = new THREE.Mesh(new THREE.SphereGeometry(P_R, 64, 40), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  scene.add(pl);
  if (planet.rings) {
    // кольца в той же логарифмической шкале
    const rt = new THREE.CanvasTexture(makeRingTexture(planet.rings));
    // внешний край колец: Сатурн — кольцо F, Уран — кольцо ε
    const a1 = planet.rings === "saturn" ? 141000 : 51149;
    const ri = P_R * (planet.rings === "saturn" ? 1.15 : 1.3), ro = Math.max(ri * 1.15, rOf(Math.max(a1, aMin * 1.03)) * 0.985);
    const g = new THREE.RingGeometry(ri, ro, 160, 1);
    const pa = g.attributes.position, uv = g.attributes.uv;
    for (let k = 0; k < pa.count; k++) uv.setXY(k, (Math.hypot(pa.getX(k), pa.getY(k)) - ri) / (ro - ri), 0.5);
    const ring = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: rt, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.9 }));
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);
  }
  const sun = new THREE.PointLight(0xffffff, 0, 0);
  scene.add(sun);

  // ---- вид «Космос»: чёрное небо со звёздами, свет от настоящего Солнца (у Земли — огни городов ночью)
  const sunDir = new THREE.Vector3(1, 0, 0);
  const sunL = new THREE.DirectionalLight(0xfff4e6, 0); scene.add(sunL);
  const camLights = camera.children.filter((c) => c.isLight); camLights.forEach((l) => (l.userData.i0 = l.intensity));
  const hemi = scene.children.find((c) => c.isHemisphereLight);
  const starPts = (() => {
    const r = mulberry(91), n = S.mobile ? 900 : 1800, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const u = r() * 2 - 1, t = r() * Math.PI * 2, s = Math.sqrt(1 - u * u), R = 1500; pos.set([Math.cos(t) * s * R, u * R, Math.sin(t) * s * R], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xc8d0e0, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0.85, depthWrite: false }));
  })();
  scene.add(starPts);
  const eMaps = isEarth ? earthMaps(pl.material, { night: true, relief: 0.5 }) : null;
  const look = { space: false };
  function setSpace(on) {
    look.space = on;
    scene.background = on ? new THREE.Color("#04060b") : null;
    starPts.visible = on; sunL.intensity = on ? 2.6 : 0;
    camLights.forEach((l) => (l.intensity = on ? l.userData.i0 * 0.12 : l.userData.i0));
    if (hemi) hemi.intensity = on ? 0.12 : 0.55;
    if (eMaps) pl.material.emissiveIntensity = on ? 1.5 : 0;
    stage.closest(".plate")?.classList.toggle("space", on);
  }
  setSpace(false);

  // ---- магнитное поле Земли и солнечный ветер (по кнопке)
  const magG = new THREE.Group(); magG.scale.setScalar(P_R / 2.2); magG.visible = false; scene.add(magG);
  let magSys = null, magMode = "off";
  function setMagnet(mode) {
    magMode = mode; magG.visible = mode !== "off";
    if (mode === "off") return;
    if (!magSys) import("./magnet3d.js").then(({ buildMagnetosphere }) => { magSys = buildMagnetosphere(magG, { mobile: S.mobile, embed: true }); magSys.setMode(magMode === "off" ? "wind" : magMode); });
    else magSys.setMode(mode);
  }

  const groupColor = (g) => new THREE.Color(system.groups[g].color);
  const items = [];
  const rnd = mulberry([...system.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0);

  function orbitBasis(incDeg, node) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.cos(node), 0, Math.sin(node)), THREE.MathUtils.degToRad(incDeg));
    return q;
  }

  live.forEach((m) => {
    const r = rOf(m.a);
    const node = rnd() * Math.PI * 2;
    const q = orbitBasis(m.i, node);
    const pts = [];
    const seg = S.mobile ? 120 : 200;
    for (let k = 0; k <= seg; k++) { const t = (k / seg) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(t) * r, 0, Math.sin(t) * r).applyQuaternion(q)); }
    const col = groupColor(m.group);
    const lm = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: system.groups[m.group].kind === "irregular" ? 0.07 : system.groups[m.group].kind === "major" ? 0.6 : 0.32 });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lm);
    if (!m.lag) scene.add(line); // у точек Лагранжа нет круговой орбиты вокруг Земли
    const size = isEarth ? (m.id === "moon" ? 1.1 : 0.34) : Math.max(0.2, 0.1 + Math.log10(Math.max(0.3, m.r)) * 0.42);
    const detail = BY_ID[m.id];
    let mat;
    if (detail && !detail.shape) {
      const t = liveTexture(detail.look, 256, 128, { mobileScale: 1 });
      mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 });
    } else mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.6, emissive: col, emissiveIntensity: 0.25 });
    const geo = isEarth && m.id !== "moon" ? new THREE.OctahedronGeometry(size, 0) : new THREE.SphereGeometry(size, S.mobile ? 12 : 20, S.mobile ? 8 : 14);
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    // «Хаббл» и «Уэбб» — маленькие настоящие 3D-модели вместо ромбика (ромбик остаётся невидимой мишенью для мыши)
    if (m.glb) import("./glb.js").then(({ miniModel }) => miniModel(m.glb)).then((w) => { w.scale.multiplyScalar(size * 10); mesh.add(w); mat.visible = false; mesh.userData.spin = true; }).catch(() => {});
    const it = { m, r, q, line, lm, mesh, size, phase: rnd() * Math.PI * 2, baseOp: lm.opacity };
    if (m.lag) { const same = system.moons.filter((x) => x.lag === m.lag); it.lagAng = (same.indexOf(m) / same.length) * Math.PI * 2; }
    items.push(it);
    if (m.tag || system.groups[m.group].kind === "major" || ["phoebe", "himalia", "amalthea"].includes(m.id)) {
      const tag = document.createElement("a");
      tag.className = "tag" + (!isEarth && m.r < 400 ? " small" : "");
      tag.href = isEarth && m.id !== "moon" ? `#/sat/${m.id}` : `#/moon/${m.id}`; tag.textContent = m.name;
      tag.addEventListener("pointerenter", () => setHover(it));
      tag.addEventListener("pointerleave", () => setHover(null));
      labelsEl.append(tag);
      it.tag = tag;
    }
  });

  // безымянные спутники — облако точек по группам
  const unnamed = system.total - system.named;
  const clouds = [];
  const irr = Object.entries(system.groups).filter(([, g]) => g.share || g.cloud);
  const shareSum = irr.reduce((s, [, g]) => s + g.share, 0);
  let left = unnamed;
  irr.forEach(([key, g], gi) => {
    let n;
    if (g.cloud) n = S.mobile ? Math.round(g.cloud * 0.5) : g.cloud; // группировки Земли: заданное число точек
    else { n = gi === irr.length - 1 ? left : Math.round((unnamed * g.share) / shareSum); left -= n; }
    const pos = new Float32Array(n * 3);
    const data = [];
    for (let k = 0; k < n; k++) {
      const a = g.a[0] + rnd() * (g.a[1] - g.a[0]);
      const inc = g.incs ? g.incs[Math.floor(rnd() * g.incs.length)] + (rnd() - 0.5) * 0.6 : g.inc[0] + rnd() * (g.inc[1] - g.inc[0]);
      const q = orbitBasis(inc, rnd() * Math.PI * 2);
      const period = 2 * Math.PI * Math.sqrt(Math.pow(a * 1000, 3) / GM) / 86400;
      data.push({ r: rOf(a), q, phase: rnd() * Math.PI * 2, period });
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: new THREE.Color(g.color), size: isEarth ? 0.22 : 0.3, transparent: true, opacity: 0.75 }));
    scene.add(pts);
    clouds.push({ key, pts, data, pos });
  });

  // камера
  const D = (system.camD ?? 1) * (S.mobile ? 150 : 200), EL = THREE.MathUtils.degToRad(S.mobile ? 50 : 34), AZ = THREE.MathUtils.degToRad(25);
  camera.position.set(Math.sin(AZ) * Math.cos(EL) * D, Math.sin(EL) * D, Math.cos(AZ) * Math.cos(EL) * D);
  controls.minDistance = 12; controls.maxDistance = 320;

  const state = { days: 0, speed: system.speed ?? 2, filter: filter || null, hover: null };
  const speedLabel = () => (system.speeds?.find(([v]) => v === state.speed)?.[1]) ?? `×${state.speed} сут/с`;
  // время: минуты, часы или сутки — что удобнее читать
  const fmtT = (d) => {
    d = Math.abs(d);
    if (d < 2 / 24) return `${Math.round(d * 1440).toLocaleString("ru-RU")} мин`;
    if (d < 2) return `${(d * 24).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ч`;
    return `${d.toLocaleString("ru-RU", { maximumFractionDigits: d < 100 ? 2 : 0 })} сут`;
  };
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
      ? `${it.m.name} · ${isEarth && it.m.id !== "moon" ? (it.m.lag ? (it.m.lag > 0 ? "точка L2" : "точка L1") + " · 1,5 млн км" : "высота " + fmtA(it.m.a - 6371)) : fmtA(it.m.a)} · ${it.m.lag ? "оборот с Землёй за год" : "период " + fmtT(it.m.p)}${it.m.retro ? " · обратный" : ""}`
      : `прошло ${fmtT(state.days)} · ${speedLabel()}`;
    if (txt !== lastTxt) { lastTxt = txt; onReadout?.(txt); }
  }

  const ptr = new THREE.Vector2();
  function pick(e) {
    const rc = S.renderer.domElement.getBoundingClientRect();
    const x = e.clientX - rc.left, y = e.clientY - rc.top;
    let best = null, bd = e.pointerType === "touch" ? 28 : 16;
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
  S.renderer.domElement.addEventListener("pointermove", (e) => { if (e.pointerType === "touch") return; const it = pick(e); if (it !== state.hover) setHover(it); S.renderer.domElement.style.cursor = it ? "pointer" : ""; });
  S.renderer.domElement.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; });
  S.renderer.domElement.addEventListener("pointerup", (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    const it = pick(e); if (it) onPick?.(it.m.id);
  });

  const tmp = new THREE.Vector3(), v = new THREE.Vector3();
  S.onFrame((dt, t, idle) => {
    const rm = reducedMotion();
    state.days += dt * state.speed; // остановить можно кнопкой «Пауза»
    // направление на Солнце поворачивается за год (как у точек Лагранжа)
    const sa = (state.days / 365.25) * Math.PI * 2;
    sunDir.set(Math.cos(sa), 0, -Math.sin(sa));
    sunL.position.copy(sunDir).multiplyScalar(100);
    eMaps?.update(camera, sunDir);
    if (magG.visible && magSys) { magG.rotation.y = sa + Math.PI; magSys.update(dt, t); }
    pl.rotation.y += dt * 0.15;
    const labels = [];
    for (const it of items) {
      if (it.m.lag) {
        // L1 — к Солнцу, L2 — от Солнца; направление на Солнце поворачивается за год
        const sunAng = (state.days / 365.25) * Math.PI * 2 + (it.m.lag > 0 ? Math.PI : 0);
        // гало-орбита вокруг точки; аппараты одной точки разнесены по кругу, чтобы не слипались
        const ga = it.lagAng + (state.days / 180) * Math.PI * 2, off = 2.6 * Math.cos(ga), offY = 2.6 * Math.sin(ga);
        tmp.set(Math.cos(sunAng) * it.r - Math.sin(sunAng) * off, offY, -Math.sin(sunAng) * it.r - Math.cos(sunAng) * off);
      } else {
        const ang = it.phase + (state.days / Math.abs(it.m.p)) * Math.PI * 2; // наклон >90° сам разворачивает движение
        tmp.set(Math.cos(ang) * it.r, 0, -Math.sin(ang) * it.r).applyQuaternion(it.q);
      }
      if (isEarth && it.m.id !== "moon") it.mesh.rotation.y += dt;
      it.mesh.position.copy(tmp);
      if (it.tag) {
        v.copy(tmp); v.y += it.size + 0.2;
        const p = S.project(v);
        it.tag.style.left = p.x + "px"; it.tag.style.top = p.y + "px";
        labels.push({ el: it.tag, x: p.x, y: p.y, prio: it === state.hover ? 1e9 : isEarth ? (it.m.id === "moon" ? 1e6 : 1e3 - it.m.a / 1e4) : it.m.r, hidden: it.tag.style.display === "none" });
      }
    }
    declutter(labels, S.width);
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
    setSpace, setMagnet,
    zoom(kind) {
      const d = kind === "magnet" ? (S.mobile ? 120 : 95) : kind === "inner" ? (isEarth ? 22 : 42) : (system.camD ?? 1) * (S.mobile ? 150 : 200);
      const dir = camera.position.clone().normalize();
      camera.position.copy(dir.multiplyScalar(d));
      S.touch();
    },
    dispose: () => S.dispose(),
  };
}
