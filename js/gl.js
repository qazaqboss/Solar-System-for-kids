// Общая основа для всех 3D-фигур: рендерер, камера, свет «от камеры»,
// пауза вне экрана, спокойная анимация и аккуратная очистка.
import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { makeTexture, makeTextureAsync } from "./textures.js";

/** Телефон/планшет: сенсорный экран или узкий экран. */
export const isMobile = () => window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 760;

/**
 * Текстура, которая сразу показывается в низком разрешении (мгновенно),
 * а полное разрешение досчитывается в фоновом потоке и подменяется плавно.
 */
export function liveTexture(look, w, h, { mobileScale = 0.5 } = {}) {
  if (isMobile()) { w = Math.max(128, Math.round(w * mobileScale)); h = w / 2; }
  const tex = new THREE.CanvasTexture(makeTexture(look, 96, 48));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  makeTextureAsync(look, w, h).then((cv) => {
    tex.dispose(); // освободить старую (маленькую) текстуру на GPU — у новой другой размер
    tex.image = cv;
    tex.needsUpdate = true;
  });
  return tex;
}

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

export function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

/** Создать 3D-сцену внутри элемента .stage */
export function createStage(stage, { fov = 30, near = 0.01, far = 2000, controls = true, fitWidth = false } = {}) {
  const mobile = isMobile();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  // На телефоне экран и так очень плотный: ограничиваем плотность пикселей.
  let maxDpr = mobile ? 1.5 : 2;
  let dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = "gl";
  renderer.domElement.setAttribute("tabindex", "0");
  stage.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, near, far);
  scene.add(camera);

  // Свет закреплён за камерой: верх-слева-спереди, как в фигурах Anatomy
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(-3, 3.2, 4);
  camera.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(4, -1, 2);
  camera.add(fill);
  const amb = new THREE.HemisphereLight(0xffffff, 0x8a8a80, 0.55);
  scene.add(amb);

  let ctl = null;
  if (controls) {
    ctl = new OrbitControls(camera, renderer.domElement);
    ctl.enableDamping = true;
    ctl.dampingFactor = 0.08;
    ctl.enablePan = false;
    ctl.rotateSpeed = 0.7;
    ctl.zoomSpeed = 0.8;
    // Одним пальцем: горизонтально — вращать, вертикально — листать страницу.
    // Двумя пальцами — масштаб.
    renderer.domElement.style.touchAction = "pan-y";
    ctl.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
  }

  const frameCbs = new Set();
  let running = true, visible = true, raf = 0, last = performance.now(), width = 1, height = 1;
  let lastInteract = -1e9;
  const touch = () => { lastInteract = performance.now(); };
  renderer.domElement.addEventListener("pointerdown", touch);
  renderer.domElement.addEventListener("wheel", touch, { passive: true });
  renderer.domElement.addEventListener("keydown", touch);

  function resize() {
    const r = stage.getBoundingClientRect();
    width = Math.max(1, r.width); height = Math.max(1, r.height);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // На узком (портретном) экране держим ширину кадра, чтобы края сцены не обрезались.
    if (fitWidth) {
      const ref = 1.6, hHalf = Math.atan(Math.tan(THREE.MathUtils.degToRad(fov / 2)) * ref);
      camera.fov = camera.aspect < ref ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hHalf) / camera.aspect)) : fov;
    }
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  resize();

  const io = new IntersectionObserver((e) => { visible = e[0].isIntersecting; if (visible) { fpsT = 0; last = performance.now(); loop(); } }, { threshold: 0.01 });
  io.observe(stage);

  // Адаптивное качество: если кадры идут медленно, снижаем разрешение рендера.
  let fpsT = 0, fpsN = 0, adaptSteps = 0;
  const bornAt = performance.now();
  function adapt(now) {
    if (!fpsT || now - bornAt < 2500) { fpsT = now; fpsN = 0; return; } // первые секунды — загрузка, не меряем
    fpsN++;
    const el = now - fpsT;
    if (el > 4000 || fpsN < 2 && el > 300) { fpsT = now; fpsN = 0; return; } // пауза/фон — не считаем
    if (el < 1500) return;
    const fps = (fpsN * 1000) / el;
    fpsT = now; fpsN = 0;
    if (fps < 45 && dpr > 1 && adaptSteps < 4) {
      dpr = Math.max(1, dpr - 0.25); adaptSteps++;
      renderer.setPixelRatio(dpr); resize();
    }
  }

  function loop() {
    cancelAnimationFrame(raf);
    if (!running || !visible || document.hidden) return;
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const idle = (now - lastInteract) / 1000;
    adapt(now);
    for (const cb of frameCbs) cb(dt, now / 1000, idle);
    if (ctl) ctl.update();
    renderer.render(scene, camera);
  }
  const onVis = () => { last = performance.now(); fpsT = 0; loop(); };
  document.addEventListener("visibilitychange", onVis);

  function project(v) {
    const p = v.clone().project(camera);
    return { x: (p.x * 0.5 + 0.5) * width, y: (-p.y * 0.5 + 0.5) * height, z: p.z };
  }

  return {
    THREE, renderer, scene, camera, controls: ctl, stage, mobile,
    get width() { return width; }, get height() { return height; },
    onFrame(cb) { frameCbs.add(cb); return () => frameCbs.delete(cb); },
    async start() {
      // Шейдеры компилируются параллельно (если браузер умеет) — без «замирания» страницы.
      try { if (renderer.compileAsync && renderer.extensions.has("KHR_parallel_shader_compile")) await renderer.compileAsync(scene, camera); } catch {}
      if (!running) return;
      stage.classList.add("live");
      last = performance.now(); loop();
    },
    touch, project,
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      ctl?.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        ms.forEach((m) => { m.map?.dispose?.(); m.dispose?.(); });
      });
      renderer.dispose();
      renderer.forceContextLoss?.();
      renderer.domElement.remove();
    },
  };
}

/** Экспоненциальное следование: x → target с постоянной времени tau (с). */
export const follow = (x, target, dt, tau = 0.25) => x + (target - x) * (1 - Math.exp(-dt / tau));

/** Пружина (критически демпфированная). state = {x, v} */
export function spring(s, target, dt, k = 60, c = 2 * Math.sqrt(60)) {
  const a = -k * (s.x - target) - c * s.v;
  s.v += a * dt; s.x += s.v * dt;
  return s.x;
}

/**
 * Убрать перекрывающиеся подписи: items = [{el, x, y, prio, hidden}].
 * Подписи с бо́льшим prio показываются первыми, остальные прячутся при наложении.
 */
export function declutter(items, W = Infinity) {
  const placed = [];
  items.sort((a, b) => b.prio - a.prio);
  for (const it of items) {
    if (it.hidden) { it.el.classList.add("hidden"); continue; }
    const w = (it.el.__w ||= it.el.offsetWidth || 50), h = 20; // ширина кэшируется — без пересчёта раскладки каждый кадр
    // не даём подписи вылезти за край рамки
    if (W !== Infinity) { const x = Math.min(W - w / 2 - 4, Math.max(w / 2 + 4, it.x)); if (x !== it.x) { it.x = x; it.el.style.left = x + "px"; } }
    const r = { l: it.x - w / 2, r: it.x + w / 2, t: it.y - h * 1.6, b: it.y - h * 0.4 };
    const hit = placed.some((p) => r.l < p.r + 2 && r.r > p.l - 2 && r.t < p.b + 2 && r.b > p.t - 2);
    it.el.classList.toggle("hidden", hit);
    if (!hit) placed.push(r);
  }
}
