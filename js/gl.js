// Общая основа для всех 3D-фигур: рендерер, камера, свет «от камеры»,
// пауза вне экрана, спокойная анимация и аккуратная очистка.
import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";

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
export function createStage(stage, { fov = 30, near = 0.01, far = 2000, controls = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  resize();

  const io = new IntersectionObserver((e) => { visible = e[0].isIntersecting; if (visible) loop(); }, { threshold: 0.01 });
  io.observe(stage);

  function loop() {
    cancelAnimationFrame(raf);
    if (!running || !visible || document.hidden) return;
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const idle = (now - lastInteract) / 1000;
    for (const cb of frameCbs) cb(dt, now / 1000, idle);
    if (ctl) ctl.update();
    renderer.render(scene, camera);
  }
  const onVis = () => { last = performance.now(); loop(); };
  document.addEventListener("visibilitychange", onVis);

  function project(v) {
    const p = v.clone().project(camera);
    return { x: (p.x * 0.5 + 0.5) * width, y: (-p.y * 0.5 + 0.5) * height, z: p.z };
  }

  return {
    THREE, renderer, scene, camera, controls: ctl, stage,
    get width() { return width; }, get height() { return height; },
    onFrame(cb) { frameCbs.add(cb); return () => frameCbs.delete(cb); },
    start() { last = performance.now(); loop(); },
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
