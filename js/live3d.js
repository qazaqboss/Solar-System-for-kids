// 3D-сцены страницы «Сейчас»: планеты на своих настоящих местах и Земля с МКС над ней.
import * as THREE from "three";
import { createStage, follow, cssVar, liveTexture, declutter, earthMaps } from "./gl.js";
import { makeRingTexture } from "./textures.js";
import { helio, orbitPoints, PLANET_IDS } from "./ephem.js";

// эклиптика (x, y, z) → сцена (x, z, −y): смотрим с северного полюса эклиптики
const toScene = (p, f) => new THREE.Vector3(p.x * f, p.z * f, -p.y * f);

function tagEl(labelsEl, text, cls = "") {
  const t = document.createElement("span");
  t.className = "tag " + cls; t.textContent = text;
  t.style.pointerEvents = "auto"; t.style.cursor = "pointer";
  labelsEl.appendChild(t);
  return t;
}
function dot(color, size = 64) {
  const cv = document.createElement("canvas"); cv.width = cv.height = size;
  const g = cv.getContext("2d"), r = size / 2;
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, "#fff"); gr.addColorStop(0.25, color); gr.addColorStop(0.5, color + "88"); gr.addColorStop(1, color + "00");
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
}

// ------------------------------------------------------------------ планеты
export function mountLivePlanets({ stage, labelsEl, bodies, sun, now, onPick, onReadout }) {
  const S = createStage(stage, { fov: 34, far: 6000, fitWidth: true });
  const { scene, camera, controls } = S;
  let real = false; // false — расстояния сжаты (направления настоящие), true — честный масштаб
  const fR = (r) => (real ? r * 1.25 : 2.2 + Math.sqrt(r) * 5.2) / r;

  const sunTex = liveTexture(sun.look, 512, 256);
  const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), new THREE.MeshBasicMaterial({ map: sunTex }));
  scene.add(sunMesh);
  const glow = dot("#ffb347", 128); scene.add(glow);
  scene.add(new THREE.PointLight(0xffffff, 60, 0, 1.2));

  const lineMat = new THREE.LineBasicMaterial({ color: new THREE.Color(cssVar("--lo")), transparent: true, opacity: 0.9 });
  const items = PLANET_IDS.map((id) => {
    const b = bodies[id];
    const size = 0.22 + Math.log10(b.radius / 2000) * 0.32;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, S.mobile ? 24 : 36, S.mobile ? 16 : 24), new THREE.MeshStandardMaterial({ map: liveTexture(b.look, 256, 128, { mobileScale: 1 }), roughness: 0.9 }));
    const holder = new THREE.Group(); holder.add(mesh);
    if (b.rings) {
      const [a, c] = b.rings === "saturn" ? [1.15, 2.42] : [1.64, 2.06];
      const g = new THREE.RingGeometry(a, c, 96, 1), pa = g.attributes.position, uv = g.attributes.uv;
      for (let k = 0; k < pa.count; k++) uv.setXY(k, (Math.hypot(pa.getX(k), pa.getY(k)) - a) / (c - a), 0.5);
      const ring = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(makeRingTexture(b.rings)), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2 + (b.rings === "saturn" ? 0.47 : 1.5);
      holder.add(ring);
    }
    scene.add(holder);
    const line = new THREE.Line(new THREE.BufferGeometry(), id === "earth" ? new THREE.LineBasicMaterial({ color: new THREE.Color(b.orbit.color) }) : lineMat);
    scene.add(line);
    const tag = tagEl(labelsEl, b.name);
    tag.addEventListener("click", () => onPick?.(id));
    return { id, b, size, mesh, holder, line, tag };
  });
  // линия «Земля → выбранная планета»
  const sight = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineDashedMaterial({ color: new THREE.Color(cssVar("--blue")), dashSize: 0.4, gapSize: 0.25 }));
  scene.add(sight);
  // направление на точку весеннего равноденствия
  const ariesTag = tagEl(labelsEl, "♈ точка весны", "small"); ariesTag.style.pointerEvents = "none";
  const aries = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: new THREE.Color(cssVar("--lo")), dashSize: 0.5, gapSize: 0.5 }));
  scene.add(aries);

  let sel = "earth", orbitsAt = -1e15;
  function rebuildOrbits(date) {
    orbitsAt = date.getTime();
    for (const it of items) {
      const pts = orbitPoints(it.id, date, 240).map((p) => { const r = Math.hypot(p.x, p.y, p.z); return toScene(p, fR(r)); });
      it.line.geometry.dispose(); it.line.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    }
    const far = real ? 30.1 * 1.25 + 2 : 33;
    aries.geometry.dispose(); aries.geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(1.4, 0, 0), new THREE.Vector3(far, 0, 0)]);
    aries.computeLineDistances();
  }
  let zoom = { inner: false };
  const camDist = () => (zoom.inner ? (real ? 4.2 : 16) : real ? 52 : 46) * (S.width < S.height ? 1.3 : 1);
  camera.position.set(0, camDist() * 0.78, camDist() * 0.62);
  controls.target.set(0, 0, 0);
  controls.minDistance = 2.5; controls.maxDistance = 140;
  let wantDist = camDist(), userZoomed = false;
  S.renderer.domElement.addEventListener("wheel", () => (userZoomed = true), { passive: true });

  const tmp = new THREE.Vector3();
  S.onFrame((dt) => {
    const date = now();
    if (Math.abs(date.getTime() - orbitsAt) > 86400000 * 30) rebuildOrbits(date);
    const sunScale = real ? 0.35 : 1.35;
    sunMesh.scale.setScalar(sunScale); glow.scale.setScalar(sunScale * 4.4);
    sunMesh.rotation.y += dt * 0.05;
    const pos = {};
    for (const it of items) {
      const p = helio(it.id, date), r = Math.hypot(p.x, p.y, p.z);
      it.holder.position.copy(toScene(p, fR(r)));
      const s = it.size * (real ? 0.32 : 1) * (it.id === sel ? 1.25 : 1);
      it.holder.scale.setScalar(s);
      it.mesh.rotation.y += dt * 0.4;
      pos[it.id] = it.holder.position;
    }
    sight.visible = sel !== "earth";
    if (sight.visible) { sight.geometry.setFromPoints([pos.earth, pos[sel]]); sight.computeLineDistances(); }
    // камера плавно подлетает к нужному масштабу
    if (!userZoomed) {
      const d = camera.position.distanceTo(controls.target), nd = follow(d, wantDist, dt, 0.5);
      camera.position.sub(controls.target).multiplyScalar(nd / d).add(controls.target);
    }
    // подписи
    const W = S.width, H = S.height, list = [];
    for (const it of items) {
      tmp.copy(it.holder.position); tmp.y += it.holder.scale.x * 1.2;
      const q = S.project(tmp);
      it.tag.style.left = q.x + "px"; it.tag.style.top = q.y + "px";
      it.tag.classList.toggle("on", it.id === sel);
      list.push({ el: it.tag, x: q.x, y: q.y, prio: it.id === sel ? 99 : 10 - PLANET_IDS.indexOf(it.id) * 0.1 + (zoom.inner ? (PLANET_IDS.indexOf(it.id) < 4 ? 5 : 0) : 0), hidden: q.z > 1 || q.x < -40 || q.x > W + 40 || q.y < -20 || q.y > H + 20 });
    }
    const qa = S.project(tmp.set(real ? 30 : 31, 0, 0));
    ariesTag.style.left = qa.x + "px"; ariesTag.style.top = qa.y + "px";
    list.push({ el: ariesTag, x: qa.x, y: qa.y, prio: 0, hidden: qa.z > 1 || qa.x < 0 || qa.x > W || qa.y < 0 || qa.y > H });
    declutter(list, W);
    onReadout?.(date);
  });
  S.start();
  return {
    dispose: () => S.dispose(),
    select(id) { sel = id; },
    setReal(v) { real = v; orbitsAt = -1e15; wantDist = camDist(); userZoomed = false; },
    setInner(v) { zoom.inner = v; wantDist = camDist(); userZoomed = false; },
  };
}

// ------------------------------------------------------------------ Земля и станции
// геодезические широта/долгота → точка на сфере (как в SphereGeometry с текстурой «от −180°»)
export const geoToVec = (lat, lon, r = 1) => {
  const a = (lat * Math.PI) / 180, b = (lon * Math.PI) / 180;
  return new THREE.Vector3(r * Math.cos(a) * Math.cos(b), r * Math.sin(a), -r * Math.cos(a) * Math.sin(b));
};

export function mountLiveEarth({ stage, labelsEl, earth, sats, now, track, sunGeo, onPick, onReadout }) {
  const S = createStage(stage, { fov: 30, far: 400, fitWidth: true });
  const { scene, camera, controls } = S;
  // свет — от настоящего Солнца, а не от камеры: видно, где сейчас день и ночь
  camera.children.forEach((l) => { if (l.isLight) l.intensity = 0; });
  scene.children.forEach((l) => { if (l.isHemisphereLight) l.intensity = 0.16; });
  const sunL = new THREE.DirectionalLight(0xffffff, 3.2); scene.add(sunL);

  const globe = new THREE.Mesh(new THREE.SphereGeometry(1, S.mobile ? 64 : 96, S.mobile ? 40 : 64), new THREE.MeshStandardMaterial({ map: liveTexture(earth.look, 2048, 1024, { mobileScale: 0.5 }), roughness: 0.85, metalness: 0 }));
  scene.add(globe);
  const eMaps = earthMaps(globe.material, { night: true });
  S.onFrame(() => eMaps.update(camera, sunL.position.clone().normalize()));
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.025, 48, 32), new THREE.MeshBasicMaterial({ color: 0x7fb4ff, transparent: true, opacity: 0.12, side: THREE.BackSide, depthWrite: false }));
  scene.add(atmo);
  // сетка: экватор и нулевой меридиан
  const gridMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 });
  const ring = (fn) => { const p = []; for (let k = 0; k <= 180; k++) p.push(fn(k * 2 - 180)); return new THREE.Line(new THREE.BufferGeometry().setFromPoints(p), gridMat); };
  scene.add(ring((t) => geoToVec(0, t, 1.002)));
  scene.add(ring((t) => geoToVec(t / 2, 0, 1.002)));
  // точка «под Солнцем»
  const subSun = dot("#ffd36b", 64); subSun.scale.setScalar(0.09); scene.add(subSun);

  const items = sats.map((s) => {
    const sp = dot(s.color, 64); sp.scale.setScalar(0.085); scene.add(sp);
    const stem = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: new THREE.Color(s.color), transparent: true, opacity: 0.7 }));
    scene.add(stem);
    const past = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: new THREE.Color(s.color), transparent: true, opacity: 0.35 }));
    const fut = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: new THREE.Color(s.color), transparent: true, opacity: 0.95 }));
    scene.add(past, fut);
    const tag = tagEl(labelsEl, s.name); tag.addEventListener("click", () => onPick?.(s.id));
    return { ...s, sp, stem, past, fut, tag, trackAt: -1e15 };
  });

  let sel = sats[0].id, followSel = true;
  camera.position.set(0, 1.2, 4.2);
  controls.minDistance = 1.6; controls.maxDistance = 12;
  controls.addEventListener("start", () => (followSel = false));
  const tmp = new THREE.Vector3(), camDir = new THREE.Vector3();
  S.onFrame((dt) => {
    const date = now();
    const sg = sunGeo(date);
    const sv = geoToVec(sg.lat, sg.lon, 1);
    sunL.position.copy(sv).multiplyScalar(20);
    subSun.position.copy(sv).multiplyScalar(1.01);
    const W = S.width, H = S.height, list = [];
    for (const it of items) {
      const g = track(it.id, date);
      it.sp.visible = it.stem.visible = !!g;
      if (!g) { it.tag.style.display = "none"; continue; }
      it.tag.style.display = "";
      const p = geoToVec(g.lat, g.lon, 1 + g.alt / 6371);
      it.sp.position.copy(p);
      it.sp.scale.setScalar(it.id === sel ? 0.11 : 0.075);
      it.stem.geometry.setFromPoints([geoToVec(g.lat, g.lon, 1.001), p]);
      // след над Землёй: 50 минут назад и вперёд (пересчёт, когда время ушло далеко)
      if (Math.abs(date.getTime() - it.trackAt) > 30000) {
        it.trackAt = date.getTime();
        const back = [], fwd = [];
        for (let m = -50; m <= 50; m += 0.5) {
          const q = track(it.id, new Date(it.trackAt + m * 60000)); if (!q) continue;
          const v = geoToVec(q.lat, q.lon, 1 + q.alt / 6371);
          (m <= 0 ? back : fwd).push(v); if (m === 0) fwd.push(v);
        }
        it.past.geometry.dispose(); it.past.geometry = new THREE.BufferGeometry().setFromPoints(back);
        it.fut.geometry.dispose(); it.fut.geometry = new THREE.BufferGeometry().setFromPoints(fwd);
      }
      const on = it.id === sel;
      it.past.material.opacity = on ? 0.4 : 0.15; it.fut.material.opacity = on ? 0.95 : 0.3;
      tmp.copy(p).multiplyScalar(1.04);
      const q = S.project(tmp);
      // за Землёй — подпись прячем
      camDir.copy(camera.position).normalize();
      const behind = p.dot(camDir) < 0.25 && p.clone().sub(camDir.clone().multiplyScalar(p.dot(camDir))).length() < 1;
      it.tag.style.left = q.x + "px"; it.tag.style.top = q.y + "px";
      it.tag.classList.toggle("on", on);
      list.push({ el: it.tag, x: q.x, y: q.y, prio: on ? 9 : 1, hidden: behind });
      if (on && followSel) {
        // камера мягко держит выбранную станцию в центре
        const d = camera.position.length();
        tmp.copy(p).normalize().multiplyScalar(d).add(new THREE.Vector3(0, 0.35, 0)).setLength(d);
        camera.position.lerp(tmp, 1 - Math.exp(-dt / 0.6));
        camera.position.setLength(follow(d, 3.6, dt, 0.8));
      }
    }
    declutter(list, W);
    onReadout?.(date);
  });
  S.start();
  return {
    dispose: () => S.dispose(),
    select(id) { sel = id; followSel = true; },
    setFollow(v) { followSel = v; },
  };
}
