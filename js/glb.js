// Загрузка 3D-моделей (.glb) из папки models/. Модели сжаты gltfpack (meshopt),
// поэтому загрузчику нужен декодер meshopt.
import * as THREE from "three";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import { MeshoptDecoder } from "./vendor/meshopt_decoder.module.js";

let loader = null;
/** Загрузить модель: вернёт gltf (gltf.scene — корень сцены). */
export function loadGLB(url) {
  if (!loader) { loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder); }
  return loader.loadAsync(url);
}

/** Найти верхние узлы с именами вида p<номер>_… (детали модели). */
export function partNodes(root) {
  const out = [];
  root.traverse((o) => { if (/^p\d+_/.test(o.name) && !out.some((x) => isAncestor(x, o))) out.push(o); });
  return out;
}
function isAncestor(a, o) { for (let p = o.parent; p; p = p.parent) if (p === a) return true; return false; }

/** Чёткие текстуры: анизотропная фильтрация на всех картах материала. */
export function crisp(m, renderer) {
  const an = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "alphaMap", "aoMap"]) if (m[k]) { m[k].anisotropy = an; m[k].needsUpdate = true; }
}

const cache = {};
/**
 * Маленькая копия модели (для схем орбит): по центру, наибольший размер = 1.
 * Файл грузится один раз, дальше копии делят геометрию.
 */
export function miniModel(key) {
  cache[key] ||= loadGLB(`models/${key}.glb`);
  return cache[key].then((g) => {
    const m = g.scene.clone(true);
    const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    m.position.sub(c);
    m.traverse((o) => { if (o.isMesh) { o.material.side = THREE.DoubleSide; o.raycast = () => {}; } });
    const w = new THREE.Group(); w.add(m); w.scale.setScalar(1 / Math.max(size.x, size.y, size.z));
    return w;
  });
}

export { THREE };
