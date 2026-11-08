// Fig 1 — Солнечная система из 3D-модели «Solar System animation»
// (Samer_Arab_S5, Sketchfab, CC BY 4.0): фототекстуры планет, светящиеся орбиты.
// Планеты стоят на своих НАСТОЯЩИХ местах (эфемериды JPL) и бегут с выбранной скоростью.
import * as THREE from "three";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import { createStage, follow, reducedMotion, declutter } from "./gl.js";
import { mulberry } from "./textures.js";
import { phaseOf, PLUTO } from "./track.js";
import { helio, moon as moonPos, galilean } from "./ephem.js";

const IDS = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];
const KEY = { earth: "erath" }; // так названы узлы в исходной модели
const NAMES = { pluto: "Плутон" };
const DAY = 86400000;
// наклон оси планет (спутники обращаются в плоскости экватора — у Урана «на боку»)
const TILT = { earth: 23.44, mars: 25.2, jupiter: 3.1, saturn: 26.7, uranus: 97.8, neptune: 28.3, pluto: 119.6 };
const GM = { earth: 3.986e14, mars: 4.2828e13, jupiter: 1.26687e17, saturn: 3.7931e16, uranus: 5.794e15, neptune: 6.8365e15, pluto: 8.7e11 };
const MOON_COL = { io: "#e8c547", europa: "#d9c9a8", ganymede: "#a9a39a", callisto: "#7a6a58", titan: "#e0a85a", enceladus: "#f4f7fb", mimas: "#c9c9c9", tethys: "#dcdcdc", dione: "#cfcfcf", rhea: "#bdbdbd", iapetus: "#8f7a5e", miranda: "#b8b8b8", ariel: "#cfcfcf", umbriel: "#7b7b7b", titania: "#b9aa9c", oberon: "#a29486", triton: "#d8c9c0", nereid: "#9a9a9a", proteus: "#6f6f6f", phobos: "#8a7564", deimos: "#a08f7d", charon: "#9b9086" };


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

export async function mountSolar({ stage, labelsEl, bodies, onReadout, onPick, url = "models/solar-system.glb", now = null, systems = null, linkTags = true, onMoonPick = null, satPos = null }) {
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
    if (m.name === "pluto") m.color = new THREE.Color("#e3c4a4"); // в модели у Плутона текстура Меркурия — делаем её теплее
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
    tag.className = "tag" + (id === "pluto" ? " dwarf" : ""); tag.textContent = b?.name || NAMES[id];
    if (b && linkTags) tag.href = `#/body/${id}`;
    if (!linkTags) tag.addEventListener("click", () => onPick?.(id));
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
  items.forEach((it) => { it.mesh.geometry.computeBoundingSphere(); it.R = it.mesh.getWorldScale(new THREE.Vector3()).x * it.mesh.geometry.boundingSphere.radius; });

  // ---------------------------------------------------------- спутники всех планет
  const moonPick = [];
  const moonSys = systems ? buildMoons() : [];
  // Луна дальше от Земли, чтобы между ними поместились искусственные спутники
  if (systems && moonC) {
    const e = items.find((i) => i.id === "earth"), k = (e.R * (1.08 + 3.0 * Math.log10((384400 - 6371) / 350) / Math.log10(1.5e6 / 350))) / Math.abs(moonC.scale.x);
    moonC.scale.multiplyScalar(k); moonR?.scale.multiplyScalar(k);
    moonC.children[0]?.scale.multiplyScalar(1 / k * 1.25);
  }
  function buildMoons() {
    const out = [];
    const sys = { ...systems, pluto: PLUTO };
    for (const [pid, sy] of Object.entries(sys)) {
      const host = items.find((i) => i.id === pid); if (!host || !sy?.moons) continue;
      const isE = pid === "earth";
      const named = sy.moons.filter((m) => !m.gone && m.id !== "moon"); // Луна Земли — из самой модели
      const groupsA = Object.values(sy.groups || {}).flatMap((g) => g.a || []);
      const aMin = Math.min(...named.map((m) => m.a)), aMax = Math.max(...named.map((m) => m.a), ...groupsA);
      // у Земли — от МКС (400 км) до «Уэбба» (1,5 млн км) по высоте над поверхностью, логарифмом
      const rOf = isE ? (a) => host.R * (1.08 + 3.0 * Math.log10(Math.max(350, a - 6371) / 350) / Math.log10(1.5e6 / 350))
        : (a) => host.R * (1.45 + 2.3 * (aMax > aMin ? Math.log(a / aMin) / Math.log(aMax / aMin) : 0));
      const holder = new THREE.Group(); holder.rotation.z = THREE.MathUtils.degToRad(TILT[pid] || 0); scene.add(holder);
      const rnd = mulberry(pid.length * 977 + 13);
      const list = named.map((m) => {
        const inc = THREE.MathUtils.degToRad(m.i > 90 ? 180 - m.i : m.i), node = rnd() * Math.PI * 2;
        const basis = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.cos(node), 0, Math.sin(node)), inc);
        const big = m.r > 150;
        const size = isE ? host.R * (m.group === "lagrange" ? 0.05 : 0.035) : host.R * (0.035 + 0.11 * Math.sqrt(Math.min(1, (m.r || 10) / 2634)));
        const color = MOON_COL[m.id] || (sy.groups?.[m.group]?.color ?? "#b9bfca");
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, big ? 20 : 8, big ? 14 : 6), new THREE.MeshStandardMaterial({ color, roughness: 0.95, emissive: new THREE.Color(color), emissiveIntensity: big ? 0.08 : 0.35 }));
        mesh.scale.setScalar(size); mesh.userData.moon = m.id; mesh.userData.sys = pid; mesh.userData.size = size;
        moonPick.push(mesh);
        holder.add(mesh);
        let line = null;
        if ((big || named.length < 4) && !isE) {
          const pts = []; for (let k = 0; k <= 96; k++) { const a = (k / 96) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(rOf(m.a)).applyQuaternion(basis)); }
          line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xb9d6ff, transparent: true, opacity: 0.12, depthWrite: false }));
          holder.add(line);
        }
        let tag = null;
        if (big || isE || m.r > 40 || named.length < 6) {
          tag = document.createElement("a"); tag.className = "tag moon-tag"; tag.textContent = m.name;
          if (linkTags && m.link !== false) tag.href = isE ? `#/sat/${m.id}` : `#/moon/${m.id}`;
          if (!linkTags) tag.addEventListener("click", (e) => { e.preventDefault(); onMoonPick?.(pid, m.id); });
          labelsEl.appendChild(tag);
        }
        return { m, r: rOf(m.a), basis, mesh, line, tag, phase: phaseOf(m.id), dir: m.retro ? -1 : 1, big: big || isE, isE };
      });
      // безымянные — облако точек по семействам
      const clouds = [];
      const irr = Object.entries(sy.groups || {}).filter(([, g]) => g.share || g.cloud);
      const unnamed = (sy.total || 0) - (sy.named || 0), shareSum = irr.reduce((a, [, g]) => a + g.share, 0);
      let left = unnamed;
      irr.forEach(([, g], gi) => {
        let n;
        if (g.cloud) n = Math.round(g.cloud * (S.mobile ? 0.5 : 1)); // группировки Земли (Starlink и др.)
        else { n = gi === irr.length - 1 ? left : Math.round((unnamed * g.share) / shareSum); left -= n; }
        if (n <= 0) return;
        const data = [];
        for (let k = 0; k < n; k++) {
          const a = g.a[0] + rnd() * (g.a[1] - g.a[0]);
          const i0 = g.incs ? g.incs[Math.floor(rnd() * g.incs.length)] : g.inc[0] + rnd() * (g.inc[1] - g.inc[0]);
          const inc = THREE.MathUtils.degToRad(i0 > 90 ? 180 - i0 : i0), node = rnd() * Math.PI * 2;
          data.push({ r: rOf(a), basis: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.cos(node), 0, Math.sin(node)), inc), phase: rnd() * 6.283, p: (sy.gmP ? sy.gmP(a) : 2 * Math.PI * Math.sqrt(Math.pow(a * 1000, 3) / (GM[pid] || 1.27e17)) / 86400 * (isE ? 1 : 1)), dir: i0 > 90 ? -1 : 1 });
        }
        const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
        const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: new THREE.Color(g.color), size: 2, sizeAttenuation: false, transparent: true, opacity: 0.8, depthWrite: false }));
        holder.add(pts);
        clouds.push({ pts, data });
      });
      host.sys = { holder, list, clouds, extent: isE ? rOf(400000) : rOf(aMax) };
      out.push(host);
    }
    return out;
  }
  const v3 = new THREE.Vector3(), jupE = new THREE.Vector3();
  const rOf_E = (host, a) => host.R * (1.08 + 3.0 * Math.log10(Math.max(350, a - 6371) / 350) / Math.log10(1.5e6 / 350));
  let selMoon = null;
  function updateMoons(d, dt) {
    const days = (d.getTime() - 946728000000) / DAY;
    let gal = null;
    for (const host of moonSys) {
      const { holder, list, clouds } = host.sys;
      host.mesh.getWorldPosition(holder.position);
      if (host.id === "jupiter") {
        gal = galilean(d);
        // направление «Земля → Юпитер» в плоскости эклиптики: от него отсчитывается угол u
        const J = helio("jupiter", d), E = helio("earth", d);
        jupE.set(J.x - E.x, 0, -(J.y - E.y)).normalize();
      }
      const sunDir = host.id === "earth" ? holder.position.clone().negate().normalize() : null;
      for (const o of list) {
        let a;
        o.mesh.scale.setScalar(o.mesh.userData.size * (selMoon === o.m.id ? 1.5 : 1));
        if (o.isE) {
          // точки Лагранжа: L1 — к Солнцу, L2 — от Солнца; станции — по свежим орбитам NORAD
          if (o.m.lag) { v3.copy(sunDir).multiplyScalar(o.m.lag < 0 ? o.r : -o.r).applyAxisAngle(ax, 0.12 * Math.sin(days * 2 * Math.PI / 180 + o.phase)); holder.worldToLocal(v3.add(holder.position)); o.mesh.position.copy(v3); continue; }
          const sp = satPos?.(o.m.id, d);
          if (sp) { v3.set(sp.x, sp.z, -sp.y).multiplyScalar(rOf_E(host, sp.alt + 6371)); holder.worldToLocal(v3.add(holder.position)); o.mesh.position.copy(v3); continue; }
        }
        const g = gal && gal.moons.find((x) => x.id === o.m.id);
        if (g) a = Math.atan2(-jupE.z, jupE.x) + (g.u * Math.PI) / 180; // точные положения галилеевых спутников
        else a = o.phase + o.dir * (2 * Math.PI * days) / Math.abs(o.m.p);
        v3.set(Math.cos(a) * o.r, 0, -Math.sin(a) * o.r);
        if (g) { holder.worldToLocal(v3.add(holder.position)); } else v3.applyQuaternion(o.basis);
        o.mesh.position.copy(v3);
        o.mesh.rotation.y += dt * 0.2;
      }
      for (const c of clouds) {
        const pos = c.pts.geometry.attributes.position;
        c.data.forEach((q, k) => { const a = q.phase + q.dir * (2 * Math.PI * days) / q.p; v3.set(Math.cos(a) * q.r, 0, -Math.sin(a) * q.r).applyQuaternion(q.basis); pos.setXYZ(k, v3.x, v3.y, v3.z); });
        pos.needsUpdate = true;
      }
    }
  }

  // время: с сегодняшнего дня, скорость в сутках за секунду
  let simT = Date.now(), speed = 20, hover = null, focus = null, focusT = 0;
  const camFrom = new THREE.Vector3(), tgtFrom = new THREE.Vector3(), tgtNow = new THREE.Vector3();
  let focusObj = null; // спутник, к которому подлетели: { mesh, size }
  // прицельное кольцо вокруг выбранного объекта
  const reticle = (() => {
    const cv = document.createElement("canvas"); cv.width = cv.height = 128;
    const g = cv.getContext("2d"); g.strokeStyle = "#ffffff"; g.lineWidth = 3;
    g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 5; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; g.beginPath(); g.moveTo(64 + Math.cos(a) * 56, 64 + Math.sin(a) * 56); g.lineTo(64 + Math.cos(a) * 66, 64 + Math.sin(a) * 66); g.stroke(); }
    const t = new THREE.CanvasTexture(cv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, color: 0x8fd8ff, transparent: true, depthTest: false, depthWrite: false }));
    sp.renderOrder = 10; sp.visible = false; scene.add(sp); return sp;
  })();
  // живая панель с данными рядом с объектом
  const info = document.createElement("div"); info.className = "obj-info"; info.hidden = true;
  const infoLine = document.createElementNS("http://www.w3.org/2000/svg", "svg"); infoLine.setAttribute("class", "obj-info-line"); infoLine.innerHTML = "<line/><circle r='3'/>";
  labelsEl.append(infoLine, info);
  const objOf = (sys, id) => {
    if (sys === "earth" && id === "moon") { const v = new THREE.Box3().setFromObject(moonMesh).getSize(new THREE.Vector3()); return { mesh: moonMesh, size: Math.max(v.x, v.y, v.z) / 2 }; }
    for (const h of moonSys) if (h.id === sys) { const o = h.sys.list.find((x) => x.m.id === id); if (o) return { mesh: o.mesh, size: o.mesh.userData.size }; }
    return null;
  };
  const ang = (id, d) => { const p = helio(id, d); return Math.atan2(p.y, p.x) + Math.PI / 2; };
  const ax = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), tmp = new THREE.Vector3(), ew = new THREE.Vector3();

  // камера: плавный подлёт
  const reduce = reducedMotion();
  camera.position.set(0, 150, 230);
  controls.target.set(0, 0, 0);
  controls.minDistance = 0.12; controls.maxDistance = 420;
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
    const hit = ray.intersectObjects([...pick, ...moonPick, ...(moonMesh ? [moonMesh] : [])], false)[0];
    const o = hit?.object;
    if (o?.userData.moon) { onMoonPick?.(o.userData.sys, o.userData.moon); return; }
    if (o === moonMesh && onMoonPick) { onMoonPick("earth", "moon"); return; }
    const id = o?.userData.id;
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
    if (now) simT = now().getTime(); else simT += dt * speed * DAY;
    const spd = now ? 1 : speed;
    const d = new Date(simT);
    for (const it of items) {
      q.setFromAxisAngle(ax, ang(it.id, d));
      it.circle.quaternion.copy(q).multiply(it.base);
      it.mesh.rotateOnAxis(it.pole, dt * it.spin * Math.min(3, 0.4 + spd * 0.05));
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
    if (moonSys.length) updateMoons(d, dt);
    // камера: подлёт к выбранной планете и её спутникам
    if (focus !== null) {
      focusT = Math.min(1, focusT + dt / 1.6);
      const e = focusT < 1 ? 1 - Math.pow(1 - focusT, 3) : 1;
      const host = focus ? items.find((i) => i.id === focus) : null;
      if (focusObj) focusObj.mesh.getWorldPosition(tgtNow); else if (host) host.mesh.getWorldPosition(tgtNow); else tgtNow.set(0, 0, 0);
      const dist = focusObj ? Math.max(focusObj.size * 16, 0.35) * (S.width < S.height ? 1.4 : 1)
        : host ? Math.max(host.R * 7, (host.sys?.extent || host.R * 3) * 2.6) * (S.width < S.height ? 1.5 : 1) : want.length();
      if (focusT < 1) {
        controls.target.lerpVectors(tgtFrom, tgtNow, e);
        const dir = focusObj ? camFrom.clone().sub(tgtFrom).normalize().add(new THREE.Vector3(0, 0.25, 0)).normalize() : host ? new THREE.Vector3(0.35, 0.55, 1).normalize() : want.clone().normalize();
        camera.position.lerpVectors(camFrom, tgtNow.clone().add(dir.multiplyScalar(dist)), e);
      } else {
        // планета едет по орбите — камера едет вместе с ней
        const delta = tgtNow.clone().sub(controls.target);
        controls.target.add(delta); camera.position.add(delta);
      }
    } else if (intro < 1 && !userMoved) {
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
    for (const host of moonSys) {
      const near = camera.position.distanceTo(controls.target) < host.sys.extent * 6 && controls.target.distanceTo(host.holder ? host.holder.position : host.sys.holder.position) < host.sys.extent * 2;
      for (const o of host.sys.list) {
        if (o.line) o.line.material.opacity = near ? 0.3 : 0.08;
        if (!o.tag) continue;
        o.mesh.getWorldPosition(tmp); tmp.y += o.mesh.scale.x * 1.6;
        const p = S.project(tmp);
        o.tag.style.left = p.x + "px"; o.tag.style.top = p.y + "px";
        o.tag.classList.toggle("on", selMoon === o.m.id);
        list.push({ el: o.tag, x: p.x, y: p.y, prio: selMoon === o.m.id ? 98 : near ? (o.big ? 30 : 15) : -1, hidden: !near || p.z > 1 || p.x < 0 || p.x > W || p.y < 0 || p.y > H });
      }
    }
    // кольцо и панель у выбранного объекта (спутник или планета)
    const sel = focusObj ? focusObj : focus ? (() => { const h = items.find((i) => i.id === focus); return h && { mesh: h.mesh, size: h.R }; })() : null;
    reticle.visible = false; // прицел убран по просьбе — объект выделяют подпись и панель
    if (sel) {
      sel.mesh.getWorldPosition(tmp);
      reticle.position.copy(tmp);
      const pulse = 1 + 0.06 * Math.sin(t * 3);
      reticle.scale.setScalar(sel.size * 3.4 * pulse);
      const p = S.project(tmp);
      if (!info.hidden && p.z < 1) {
        const iw = info.offsetWidth || 220, ih = info.offsetHeight || 120;
        const off = Math.max(30, Math.min(140, (sel.size / Math.max(0.01, camera.position.distanceTo(tmp))) * H * 2.2 + 26));
        let x = p.x + off, y = p.y - ih - 10;
        if (x + iw > W - 8) x = p.x - off - iw;
        x = Math.max(8, Math.min(W - iw - 8, x)); y = Math.max(34, Math.min(H - ih - 34, y));
        if (W < 640) { x = 8; y = H - ih - 52; } // на телефоне — внизу, чтобы не закрывать объект
        info.style.transform = `translate(${x}px, ${y}px)`;
        const ax2 = x < p.x ? x + iw : x, ay2 = y + ih;
        const ln = infoLine.firstChild, c = infoLine.lastChild;
        ln.setAttribute("x1", p.x); ln.setAttribute("y1", p.y); ln.setAttribute("x2", ax2); ln.setAttribute("y2", Math.min(ay2, Math.max(y, p.y)));
        c.setAttribute("cx", p.x); c.setAttribute("cy", p.y);
        infoLine.style.display = ""; info.style.visibility = "";
      } else { infoLine.style.display = "none"; info.style.visibility = "hidden"; }
    } else infoLine.style.display = "none";
    declutter(list, W);
    onReadout?.(`${Math.abs(simT - Date.now()) < DAY / 2 ? "сегодня · " : ""}${d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}`);
  });
  await S.start();
  return {
    setSpeed(x) { speed = x; },
    resetTime() { simT = Date.now(); },
    /** подлететь к планете (id) или показать всю систему (null) */
    selectMoon(id) { selMoon = id; },
    /** подлететь к спутнику и следовать за ним */
    focusObject(sys, id) { const o = objOf(sys, id); if (!o) return false; focusObj = o; focus = sys; selMoon = id; focusT = 0; camFrom.copy(camera.position); tgtFrom.copy(controls.target); userMoved = true; return true; },
    /** html живой панели у выбранного объекта (null — скрыть) */
    setInfo(html) { info.hidden = !html; if (html && info.innerHTML !== html) info.innerHTML = html; },
    focus(id) { focusObj = null; selMoon = null; focus = id || ""; focusT = 0; camFrom.copy(camera.position); tgtFrom.copy(controls.target); userMoved = true; },
    dispose: () => S.dispose(),
  };
}
