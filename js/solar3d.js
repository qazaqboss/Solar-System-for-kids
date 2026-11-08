// Fig 1 — Солнечная система из 3D-модели «Solar System animation»
// (Samer_Arab_S5, Sketchfab, CC BY 4.0): фототекстуры планет, светящиеся орбиты.
// Планеты стоят на своих НАСТОЯЩИХ местах (эфемериды JPL) и бегут с выбранной скоростью.
import * as THREE from "three";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import { createStage, follow, reducedMotion, declutter } from "./gl.js";
import { helio, moon as moonPos } from "./ephem.js";

const IDS = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];
const KEY = { earth: "erath" }; // так названы узлы в исходной модели
const NAMES = { pluto: "Плутон" };
const DAY = 86400000;

function glowSprite(c1, c2, size = 256) {
  const cv = document.createElement("canvas"); cv.width = cv.height = size;
  const g = cv.getContext("2d"), r = size / 2, gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, c1); gr.addColorStop(0.18, c1); gr.addColorStop(0.45, c2); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
}
function stars(n, R) {
  const p = new Float32Array(n * 3), c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    p.set([R * s * Math.cos(a), R * u, R * s * Math.sin(a)], i * 3);
    const k = 0.45 + Math.random() * 0.55, warm = Math.random();
    c.set([k * (warm > 0.8 ? 1 : 0.85), k * 0.9, k * (warm < 0.2 ? 1 : 0.95)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(p, 3)); g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
}
// ось вращения сферы: направление на вершину с наибольшим v текстуры (полюс)
function poleOf(geo) {
  const uv = geo.attributes.uv, pos = geo.attributes.position; let best = 0;
  for (let i = 0; i < uv.count; i++) if (uv.getY(i) > uv.getY(best)) best = i;
  const v = new THREE.Vector3().fromBufferAttribute(pos, best).normalize();
  return uv.getY(best) > 0.9 ? v : new THREE.Vector3(0, 1, 0);
}

export async function mountSolar({ stage, labelsEl, bodies, onReadout, onPick, url = "models/solar-system.glb" }) {
  const S = createStage(stage, { fov: 34, far: 5000, fitWidth: true });
  const { scene, camera, controls, renderer } = S;
  // свет — только от Солнца (день и ночь на планетах), слабая подсветка ночной стороны
  camera.children.forEach((l) => { if (l.isLight) l.intensity *= 0.12; });
  scene.children.forEach((l) => { if (l.isHemisphereLight) l.intensity = 0.12; });
  scene.add(new THREE.PointLight(0xfff4e6, 3.4, 0, 0));
  scene.add(stars(S.mobile ? 1400 : 2600, 1800));
  const glow = glowSprite("rgba(255,214,140,0.95)", "rgba(255,140,40,0.25)"); glow.scale.setScalar(34); scene.add(glow);

  let gltf;
  try { gltf = await new GLTFLoader().loadAsync(url); } catch (e) { S.dispose(); throw e; }
  const root = gltf.scene;
  scene.add(root);
  const byName = (re) => { let f = null; root.traverse((o) => { if (!f && re.test(o.name)) f = o; }); return f; };

  // материалы: спокойнее орбиты, Солнце без пересвета
  const orbitMat = new THREE.MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (m.name === "Material") { o.material = orbitMat; o.renderOrder = 1; return; }
    if (m.name === "material") { o.material = new THREE.MeshBasicMaterial({ map: m.map || m.emissiveMap }); o.userData.id = "sun"; return; }
    m.side = THREE.FrontSide; m.roughness = 0.92; m.metalness = 0;
    if (m.name === "saturn_ring") { m.side = THREE.DoubleSide; m.depthWrite = false; m.opacity = 0.85; }
    if (m.map) m.map.anisotropy = 4;
  });

  const items = IDS.map((id) => {
    const k = KEY[id] || id;
    const circle = byName(new RegExp(`^${k}_BezierCircle_\\d+$`));
    const ring = byName(new RegExp(`^${k}_BezierCircle\\.001_\\d+$`));
    const planet = circle?.children[0];
    const mesh = planet && (planet.isMesh ? planet : planet.getObjectByProperty("isMesh", true));
    if (!circle || !mesh) return null;
    mesh.userData.id = id;
    const ringMesh = ring?.getObjectByProperty("isMesh", true);
    if (ringMesh) ringMesh.material = orbitMat.clone();
    const b = bodies[id];
    const tag = document.createElement(b ? "a" : "span");
    tag.className = "tag" + (id === "pluto" || S.mobile ? " small" : ""); tag.textContent = b?.name || NAMES[id];
    if (b) tag.href = `#/body/${id}`;
    tag.addEventListener("pointerenter", () => (hover = id)); tag.addEventListener("pointerleave", () => (hover = null));
    labelsEl.appendChild(tag);
    const spinTarget = mesh;
    // чёткая линия орбиты поверх светящегося кольца модели (тонкое кольцо на телефоне рвётся в пунктир)
    const R = Math.abs(circle.scale.x), pts = [];
    for (let k = 0; k <= 256; k++) { const a = (k / 256) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R)); }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0.28, depthWrite: false }));
    scene.add(line);
    return { id, line, circle, ring, ringMesh, planet, mesh, tag, pole: poleOf(mesh.geometry), spin: { mercury: 0.02, venus: -0.01, earth: 1, mars: 0.97, jupiter: 2.4, saturn: 2.2, uranus: -1.4, neptune: 1.5, pluto: -0.16 }[id], spinTarget, base: circle.quaternion.clone() };
  }).filter(Boolean);
  // Луна: её орбита в модели привязана к Земле — ставим её вокруг настоящей Земли
  const moonC = byName(/^moon_BezierCircle_\d+$/), moonR = byName(/^moon_BezierCircle\.001_\d+$/);
  const moonMesh = moonC?.getObjectByProperty("isMesh", true);
  if (moonR) { const rm = moonR.getObjectByProperty("isMesh", true); if (rm) rm.material = Object.assign(orbitMat.clone(), { opacity: 0.22 }); }
  const sunMesh = byName(/^sun_\d+$/)?.getObjectByProperty("isMesh", true);
  const pick = [...items.map((i) => i.mesh), sunMesh].filter(Boolean);

  // время: с сегодняшнего дня, скорость в сутках за секунду
  let simT = Date.now(), speed = 20, hover = null;
  const ang = (id, d) => { const p = helio(id, d); return Math.atan2(p.y, p.x) + Math.PI / 2; };
  const ax = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), tmp = new THREE.Vector3(), ew = new THREE.Vector3();

  // камера: плавный подлёт
  const reduce = reducedMotion();
  camera.position.set(0, 150, 230);
  controls.target.set(0, 0, 0);
  controls.minDistance = 10; controls.maxDistance = 420;
  const want = new THREE.Vector3(0, 40, 80).multiplyScalar(S.width < S.height ? 1.45 : 1);
  let intro = 0, userMoved = false;
  controls.addEventListener("start", () => (userMoved = true));

  // выбор планеты кликом по 3D
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  renderer.domElement.addEventListener("pointerdown", (e) => (down = [e.clientX, e.clientY]));
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pick, false)[0];
    const id = hit?.object.userData.id;
    if (id && bodies[id]) onPick?.(id);
  });
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    hover = ray.intersectObjects(pick, false)[0]?.object.userData.id || null;
    renderer.domElement.style.cursor = hover && bodies[hover] ? "pointer" : "";
  });

  S.onFrame((dt, t, idle) => {
    simT += dt * speed * DAY;
    const d = new Date(simT);
    for (const it of items) {
      q.setFromAxisAngle(ax, ang(it.id, d));
      it.circle.quaternion.copy(q).multiply(it.base);
      it.mesh.rotateOnAxis(it.pole, dt * it.spin * Math.min(3, 0.4 + speed * 0.05));
      const on = hover === it.id;
      if (it.ringMesh) it.ringMesh.material.opacity = follow(it.ringMesh.material.opacity, on ? 0.75 : 0.22, dt, 0.15);
      it.line.material.opacity = follow(it.line.material.opacity, on ? 0.9 : 0.28, dt, 0.15);
    }
    // Луна вокруг Земли
    const earth = items.find((i) => i.id === "earth");
    if (moonC && earth) {
      earth.mesh.getWorldPosition(ew);
      const ml = moonPos(d), a = (ml.lon * Math.PI) / 180 + Math.PI / 2;
      moonC.position.copy(ew); moonR?.position.copy(ew);
      moonC.rotation.set(0, a, 0);
      moonMesh?.rotateOnAxis(ax, dt * 0.3);
    }
    sunMesh?.rotateOnAxis(ax, dt * 0.03);
    // камера
    if (intro < 1 && !userMoved) {
      intro = Math.min(1, intro + dt / (reduce ? 0.01 : 2.6));
      const e = 1 - Math.pow(1 - intro, 3);
      camera.position.lerpVectors(new THREE.Vector3(0, 150, 230), want, e);
    } else if (!reduce && idle > 6) {
      camera.position.applyAxisAngle(ax, dt * 0.02);
    }
    // подписи
    const W = S.width, H = S.height, list = [];
    for (const it of items) {
      it.mesh.getWorldPosition(tmp);
      const s = it.mesh.getWorldScale(ew).x * (it.mesh.geometry.boundingSphere?.radius || 1);
      tmp.y += s * 1.15 + 0.4;
      const p = S.project(tmp);
      it.tag.style.left = p.x + "px"; it.tag.style.top = p.y + "px";
      it.tag.classList.toggle("on", hover === it.id);
      list.push({ el: it.tag, x: p.x, y: p.y, prio: hover === it.id ? 99 : 20 - IDS.indexOf(it.id), hidden: p.z > 1 || p.x < -30 || p.x > W + 30 || p.y < 0 || p.y > H });
    }
    declutter(list, W);
    onReadout?.(`${Math.abs(simT - Date.now()) < DAY / 2 ? "сегодня · " : ""}${d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}`);
  });
  await S.start();
  return {
    setSpeed(x) { speed = x; },
    resetTime() { simT = Date.now(); },
    dispose: () => S.dispose(),
  };
}
