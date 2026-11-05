// Fig 1 — Солнечная система: планеты на орбитах (радиусы орбит сжаты корнем,
// размеры тел — логарифмом), пояс астероидов, спокойный тур и подписи.
import * as THREE from "three";
import { createStage, follow, cssVar, reducedMotion } from "./gl.js";
import { makeTexture, makeRingTexture } from "./textures.js";

const orbitR = (au) => 2.2 + Math.sqrt(au) * 5.2;

export function mountOrrery({ stage, labelsEl, planets, sun, onReadout, onPick }) {
  const S = createStage(stage, { fov: 32, far: 4000 });
  const { scene, camera, controls } = S;
  const lineMat = new THREE.LineBasicMaterial({ color: new THREE.Color(cssVar("--lo")), transparent: true, opacity: 0.9 });
  const lineHi = new THREE.LineBasicMaterial({ color: new THREE.Color(cssVar("--strong")) });

  // Солнце
  const sunTex = new THREE.CanvasTexture(makeTexture(sun.look, 512, 256));
  sunTex.colorSpace = THREE.SRGBColorSpace;
  const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(1.35, 48, 32), new THREE.MeshBasicMaterial({ map: sunTex }));
  sunMesh.userData.id = "sun";
  scene.add(sunMesh);
  const glowCv = document.createElement("canvas"); glowCv.width = glowCv.height = 128;
  const gc = glowCv.getContext("2d"); const gg = gc.createRadialGradient(64, 64, 10, 64, 64, 64);
  gg.addColorStop(0, "rgba(255,180,70,.6)"); gg.addColorStop(1, "rgba(255,150,40,0)"); gc.fillStyle = gg; gc.fillRect(0, 0, 128, 128);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(glowCv), transparent: true, depthWrite: false }));
  glow.scale.set(6, 6, 1); scene.add(glow);
  const sunLight = new THREE.PointLight(0xffffff, 60, 0, 1.2);
  scene.add(sunLight);

  const items = [{ id: "sun", mesh: sunMesh, name: sun.name, body: sun }];
  const tags = [];

  planets.forEach((p, i) => {
    const r = orbitR(p.orbit.a);
    // орбита
    const pts = [];
    for (let k = 0; k <= 256; k++) { const t = (k / 256) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(t) * r, 0, Math.sin(t) * r)); }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
    scene.add(line);
    // планета
    const size = 0.22 + Math.log10(p.radius / 2000) * 0.32;
    const tex = new THREE.CanvasTexture(makeTexture(p.look, 256, 128));
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 40, 28), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    mesh.userData.id = p.id;
    const holder = new THREE.Group();
    holder.add(mesh);
    if (p.rings) {
      const rt = new THREE.CanvasTexture(makeRingTexture(p.rings));
      const [a, b] = p.rings === "saturn" ? [1.15, 2.42] : [1.64, 2.06];
      const g = new THREE.RingGeometry(size * a, size * b, 96, 1);
      const pa = g.attributes.position, uv = g.attributes.uv;
      for (let k = 0; k < pa.count; k++) uv.setXY(k, (Math.hypot(pa.getX(k), pa.getY(k)) - size * a) / (size * (b - a)), 0.5);
      const ring = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: rt, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2 + (p.rings === "saturn" ? 0.47 : 1.5);
      holder.add(ring);
    }
    scene.add(holder);
    const phase = (i * 2.399) % (Math.PI * 2);
    items.push({ id: p.id, mesh, holder, line, r, size, period: p.orbit.period, phase, name: p.name, body: p });
    const tag = document.createElement("a");
    tag.className = "tag"; tag.href = `#/body/${p.id}`; tag.textContent = p.name;
    tag.addEventListener("pointerenter", () => setHover(p.id));
    tag.addEventListener("pointerleave", () => setHover(null));
    labelsEl.append(tag);
    tags.push({ el: tag, item: items[items.length - 1] });
  });
  const sunTag = document.createElement("a");
  sunTag.className = "tag"; sunTag.href = "#/body/sun"; sunTag.textContent = sun.name;
  labelsEl.append(sunTag);
  tags.push({ el: sunTag, item: items[0] });

  // пояс астероидов (2,1–3,3 а. е.)
  {
    const n = 1400, pos = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      const au = 2.1 + Math.random() * 1.2, t = Math.random() * Math.PI * 2, r = orbitR(au);
      pos[k * 3] = Math.cos(t) * r; pos[k * 3 + 1] = (Math.random() - 0.5) * 0.35; pos[k * 3 + 2] = Math.sin(t) * r;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const belt = new THREE.Points(g, new THREE.PointsMaterial({ color: new THREE.Color(cssVar("--mid")), size: 0.06, sizeAttenuation: true }));
    belt.userData.spin = 1 / 1700;
    scene.add(belt);
    items.belt = belt;
  }

  // камера: возвышение ≈30°, как в изометрии Anatomy
  const D = 52;
  const EL = THREE.MathUtils.degToRad(28), AZ = THREE.MathUtils.degToRad(-30);
  camera.position.set(Math.sin(AZ) * Math.cos(EL) * D, Math.sin(EL) * D, Math.cos(AZ) * Math.cos(EL) * D);
  controls.minDistance = 10; controls.maxDistance = 110;
  controls.maxPolarAngle = Math.PI * 0.49;

  const state = { days: 0, speed: 20, hover: null, focus: null };
  let hoverId = null;
  function setHover(id) {
    hoverId = id;
    items.forEach((it) => { if (it.line) it.line.material = it.id === id ? lineHi : lineMat; });
    tags.forEach((t) => t.el.classList.toggle("on", t.item.id === id));
    readout();
  }
  function readout() {
    const it = items.find((x) => x.id === hoverId);
    const y = state.days / 365.25;
    if (it && it.body.orbit) onReadout?.(`${it.name} · ${it.body.orbit.a.toLocaleString("ru-RU")} а. е. · год ${Math.round(it.period).toLocaleString("ru-RU")} сут`);
    else if (it) onReadout?.(`${it.name} · центр системы`);
    else onReadout?.(`прошло ${y.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} лет · ×${state.speed} сут/с`);
  }

  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  const pickMeshes = items.map((x) => x.mesh);
  function pick(e) {
    const r = S.renderer.domElement.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    // увеличенные «зоны попадания» для маленьких планет
    let best = null, bestD = 1e9;
    for (const it of items) {
      const p = new THREE.Vector3(); it.mesh.getWorldPosition(p);
      const sp = S.project(p);
      const d = Math.hypot(sp.x - (e.clientX - r.left), sp.y - (e.clientY - r.top));
      if (d < 22 && d < bestD) { best = it; bestD = d; }
    }
    if (!best) { const h = ray.intersectObjects(pickMeshes, false); if (h.length) best = items.find((x) => x.mesh === h[0].object); }
    return best;
  }
  let downAt = null;
  S.renderer.domElement.addEventListener("pointermove", (e) => { const it = pick(e); setHover(it ? it.id : null); S.renderer.domElement.style.cursor = it ? "pointer" : ""; });
  S.renderer.domElement.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; });
  S.renderer.domElement.addEventListener("pointerup", (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    const it = pick(e); if (it) onPick?.(it.id);
  });

  const v = new THREE.Vector3();
  S.onFrame((dt, t, idle) => {
    const rm = reducedMotion();
    if (!rm) state.days += dt * state.speed;
    for (const it of items) {
      if (!it.holder) continue;
      const ang = it.phase + (state.days / it.period) * Math.PI * 2;
      it.holder.position.set(Math.cos(ang) * it.r, 0, -Math.sin(ang) * it.r);
      it.mesh.rotation.y += dt * 0.6;
    }
    sunMesh.rotation.y += dt * 0.05;
    if (items.belt && !rm) items.belt.rotation.y += dt * state.speed * items.belt.userData.spin * 0.3;
    if (idle > 6 && !rm) {
      // медленный облёт
      const a = Math.atan2(camera.position.x, camera.position.z) + dt * 0.03;
      const rr = Math.hypot(camera.position.x, camera.position.z);
      camera.position.x = Math.sin(a) * rr; camera.position.z = Math.cos(a) * rr;
    }
    for (const tg of tags) {
      tg.item.mesh.getWorldPosition(v);
      v.y += (tg.item.size || 1.35) * (tg.item.body.rings ? 1.1 : 1);
      const p = S.project(v);
      tg.el.style.left = p.x + "px"; tg.el.style.top = p.y + "px";
      tg.el.classList.toggle("hidden", p.z > 1);
    }
    readout();
  });
  S.start();
  return {
    setSpeed(x) { state.speed = x; },
    dispose: () => S.dispose(),
  };
}
