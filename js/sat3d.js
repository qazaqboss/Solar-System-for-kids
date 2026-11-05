// «Анатомия» искусственного спутника: модель из деталей, которые можно
// раздвинуть (разборка), выноски с подписями, подсветка детали.
// Модели условные, но пропорции и состав узлов — как у настоящих аппаратов.
import * as THREE from "three";
import { createStage, follow, reducedMotion } from "./gl.js";
import { RoomEnvironment } from "./vendor/RoomEnvironment.js";

// ---------- материалы
const panelTexCache = {};
function panelTex(color = "#1d2f6b") {
  if (panelTexCache[color]) return panelTexCache[color];
  const cv = document.createElement("canvas"); cv.width = 128; cv.height = 256;
  const c = cv.getContext("2d");
  c.fillStyle = "#c9ccd2"; c.fillRect(0, 0, 128, 256);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
    c.fillStyle = color; c.fillRect(x * 32 + 2, y * 32 + 2, 28, 28);
    c.fillStyle = "rgba(255,255,255,.08)"; c.fillRect(x * 32 + 2, y * 32 + 2, 28, 3);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return (panelTexCache[color] = t);
}
const M = {
  foil: () => new THREE.MeshStandardMaterial({ color: "#d6a640", metalness: 0.85, roughness: 0.32, emissive: "#ffffff", emissiveIntensity: 0 }),
  silver: () => new THREE.MeshStandardMaterial({ color: "#c8ccd2", metalness: 0.75, roughness: 0.3, emissive: "#ffffff", emissiveIntensity: 0 }),
  white: () => new THREE.MeshStandardMaterial({ color: "#eeeeea", metalness: 0.05, roughness: 0.7, emissive: "#ffffff", emissiveIntensity: 0 }),
  dark: () => new THREE.MeshStandardMaterial({ color: "#3a3c42", metalness: 0.4, roughness: 0.5, emissive: "#ffffff", emissiveIntensity: 0 }),
  gold: () => new THREE.MeshStandardMaterial({ color: "#f2c14e", metalness: 1, roughness: 0.18, emissive: "#ffffff", emissiveIntensity: 0 }),
  mirror: () => new THREE.MeshStandardMaterial({ color: "#e8eef6", metalness: 1, roughness: 0.08, emissive: "#ffffff", emissiveIntensity: 0 }),
  shield: () => new THREE.MeshStandardMaterial({ color: "#c7b8dc", metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide, emissive: "#ffffff", emissiveIntensity: 0 }),
  panel: (c) => new THREE.MeshStandardMaterial({ map: panelTex(c), metalness: 0.3, roughness: 0.45, side: THREE.DoubleSide, emissive: "#ffffff", emissiveIntensity: 0 }),
  red: () => new THREE.MeshStandardMaterial({ color: "#c4492a", roughness: 0.6, emissive: "#ffffff", emissiveIntensity: 0 }),
};

// ---------- примитивы (все возвращают Mesh)
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (r, len, m, axis = "y", seg = 28, r2 = r) => {
  const g = new THREE.CylinderGeometry(r2, r, len, seg);
  if (axis === "x") g.rotateZ(Math.PI / 2);
  if (axis === "z") g.rotateX(Math.PI / 2);
  return new THREE.Mesh(g, m);
};
const sph = (r, m) => new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), m);
const dish = (r, depth, m) => {
  const pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(new THREE.Vector2(t * r, t * t * depth)); }
  const g = new THREE.LatheGeometry(pts, 32); return new THREE.Mesh(g, m);
};
const panel = (w, l, m) => box(w, 0.03, l, m);
const at = (mesh, x, y, z, rx = 0, ry = 0, rz = 0) => { mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); return mesh; };
const hexShape = (r) => { const s = new THREE.Shape(); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; s[i ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r); } return s; };

// Деталь: имя, описание, меши и направление разборки (у каждого меша может быть своё)
const P = (name, desc, meshes, dir) => ({ name, desc, meshes: meshes.map((m) => { m.userData.dir = m.userData.dir || dir; return m; }) });
const d = (m, dir) => { m.userData.dir = dir; return m; };

const MODELS = {
  station() {
    const truss = M.silver(), mod = M.white(), pv = M.panel("#5a3a10"), rad = M.white(), arm = M.dark();
    const wings = [];
    for (const sx of [-1, 1]) for (const k of [0, 1]) for (const sz of [-1, 1]) wings.push(d(at(panel(0.42, 3.4, pv), sx * (3.7 + k * 0.9), 0, sz * 1.9), [sx, 0, sz * 0.3]));
    return [
      P("Ферма", "Главная «балка» станции длиной 109 м. На ней держатся батареи, радиаторы и манипулятор.", [at(box(8.4, 0.32, 0.32, truss), 0, 0, 0)], [0, 0, 0]),
      P("Жилые и научные модули", "Герметичные «бочки», где живут и работают космонавты: «Заря», «Звезда», «Дестини», «Кибо», «Коламбус» и другие.",
        [at(cyl(0.42, 2.6, mod, "z"), 0, -0.55, 0.1), at(cyl(0.36, 1.6, mod, "z"), 0, -0.55, 2.2), at(cyl(0.36, 1.5, mod, "z"), 0, -0.55, -2.0), at(cyl(0.34, 1.4, mod, "x"), 1.0, -0.55, 0.6), at(cyl(0.34, 1.4, mod, "x"), -1.0, -0.55, 0.6)], [0, -1.2, 0]),
      P("Солнечные батареи", "8 пар крыльев по 35 м. Дают до 120 кВт — как несколько десятков домов.", wings, [1, 0, 0]),
      P("Радиаторы", "Белые панели сбрасывают лишнее тепло в космос, иначе приборы перегреются.", [d(at(panel(0.9, 1.6, rad), 1.6, 0, 0.9, 0, 0, Math.PI / 2), [0, 0, 1]), d(at(panel(0.9, 1.6, rad), -1.6, 0, 0.9, 0, 0, Math.PI / 2), [0, 0, 1])], [0, 0, 1]),
      P("Манипулятор Canadarm2", "Робот-рука длиной 17 м: ловит грузовые корабли и переносит космонавтов при выходах.", [at(cyl(0.06, 1.6, arm, "y"), 0.6, 0.95, 0, 0, 0, 0.5), at(cyl(0.06, 1.4, arm, "y"), 1.0, 1.6, 0, 0, 0, -0.6)], [0, 1, 0]),
      P("Корабли «Союз» и Dragon", "Пристыкованные корабли — «спасательные шлюпки» и транспорт для экипажа.", [at(cyl(0.3, 1.0, M.dark(), "z"), 0, -0.55, 3.5), at(cyl(0.32, 0.9, M.white(), "z"), 0, -0.55, -3.2)], [0, 0, 1]),
    ];
  },
  tiangong() {
    const mod = M.white(), pv = M.panel("#1d2f6b");
    return [
      P("Базовый модуль «Тяньхэ»", "Центр управления и жилые каюты.", [at(cyl(0.6, 3.2, mod, "z"), 0, 0, 0), at(sph(0.62, mod), 0, 0, 1.75)], [0, 0, 0]),
      P("Лабораторные модули", "«Вэньтянь» и «Мэнтянь» — научные лаборатории по бокам, станция в форме буквы «Т».", [d(at(cyl(0.55, 3.0, mod, "x"), 1.95, 0, 1.75), [1, 0, 0]), d(at(cyl(0.55, 3.0, mod, "x"), -1.95, 0, 1.75), [-1, 0, 0])], [1, 0, 0]),
      P("Большие солнечные крылья", "Гибкие батареи размахом около 55 м.", [d(at(panel(0.9, 5.5, pv), 3.8, 0, 1.75, 0, 0, 0), [1, 0, 0]), d(at(panel(0.9, 5.5, pv), -3.8, 0, 1.75), [-1, 0, 0])], [1, 0, 0]),
      P("Малые батареи", "Крылья базового модуля.", [d(at(panel(0.5, 2.4, pv), 0, 0.9, -0.8, 0, 0, Math.PI / 2), [0, 1, 0]), d(at(panel(0.5, 2.4, pv), 0, -0.9, -0.8, 0, 0, Math.PI / 2), [0, -1, 0])], [0, 1, 0]),
      P("Корабль «Шэньчжоу»", "Корабль экипажа у стыковочного узла.", [at(cyl(0.38, 1.4, M.dark(), "z"), 0, 0, 3.0)], [0, 0, 1]),
    ];
  },
  hubble() {
    const foil = M.silver(), pv = M.panel("#2a3f86");
    return [
      P("Труба телескопа", "Алюминиевый корпус длиной 13 м в блестящей теплоизоляции.", [at(cyl(0.72, 3.2, foil, "z"), 0, 0, 0.4)], [0, 0, 0]),
      P("Главное зеркало 2,4 м", "Собирает свет звёзд. Его отполировали с точностью до 1/65 толщины волоса.", [at(cyl(0.6, 0.12, M.mirror(), "z"), 0, 0, -0.7)], [0, 1.6, 0]),
      P("Приборный отсек", "Камеры и спектрографы: WFC3, ACS, COS, STIS. Астронавты меняли их при ремонтах.", [at(cyl(0.74, 1.4, M.dark(), "z"), 0, 0, -1.9)], [0, 0, -1]),
      P("Крышка апертуры", "Закрывается, если телескоп случайно повернётся к Солнцу.", [at(cyl(0.74, 0.06, M.white(), "z"), 0, 0.0, 2.05)], [0, 0, 1.4]),
      P("Солнечные батареи", "Два крыла дают ≈5,5 кВт.", [d(at(panel(0.8, 3.0, pv), 1.4, 0, -0.2, 0, 0, Math.PI / 2), [1, 0, 0]), d(at(panel(0.8, 3.0, pv), -1.4, 0, -0.2, 0, 0, Math.PI / 2), [-1, 0, 0])], [1, 0, 0]),
      P("Антенны связи", "Передают снимки на Землю через спутники-ретрансляторы TDRS.", [d(at(dish(0.32, 0.12, M.white()), 0, 1.2, -0.6, Math.PI, 0, 0), [0, 1, 0]), d(at(dish(0.32, 0.12, M.white()), 0, -1.2, -0.6), [0, -1, 0])], [0, 1, 0]),
    ];
  },
  jwst() {
    const layers = [];
    const kite = new THREE.Shape(); kite.moveTo(-3.2, 0); kite.lineTo(0, 1.8); kite.lineTo(3.2, 0); kite.lineTo(0, -1.8); kite.closePath();
    for (let i = 0; i < 5; i++) { const g = new THREE.ShapeGeometry(kite); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, M.shield()); m.position.y = -0.5 + i * 0.07; m.scale.setScalar(1 - i * 0.04); m.userData.dir = [0, (i - 2) * 0.5, 0]; layers.push(m); }
    const segs = [];
    const hg = new THREE.ShapeGeometry(hexShape(0.32));
    const cells = [[0, 0]]; [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1], [2, 0], [2, -1], [1, 1], [0, 2], [-1, 2], [-2, 2], [-2, 1], [-2, 0], [-1, -1], [0, -2], [1, -2], [2, -2]].forEach((c) => cells.push(c));
    cells.slice(1).forEach(([q, r]) => {
      const x = 0.56 * (q + r / 2), y = 0.485 * r;
      const m = new THREE.Mesh(hg, M.gold()); m.position.set(x, 1.35 + y, 0.3); segs.push(m);
    });
    return [
      P("Солнечный щит (5 слоёв)", "Пять слоёв каптона размером с теннисный корт. Сторона к Солнцу нагревается до +85 °C, а у зеркала −233 °C.", layers, [0, 1, 0]),
      P("Главное зеркало 6,5 м", "18 шестиугольных сегментов из бериллия, покрытых тонким слоем золота — оно лучше всего отражает инфракрасный свет.", segs, [0, 1.2, 0.6]),
      P("Вторичное зеркало", "Держится на трёх штангах и направляет свет обратно к приборам.", [at(cyl(0.18, 0.05, M.gold(), "z"), 0, 1.35, 2.0), at(cyl(0.02, 1.9, M.dark(), "z"), 0, 1.35, 1.15)], [0, 0, 1.2]),
      P("Научные приборы", "Камеры NIRCam, MIRI, NIRSpec и NIRISS — «глаза» телескопа, спрятанные за зеркалом.", [at(box(0.9, 0.8, 0.6, M.dark()), 0, 0.7, -0.15)], [0, 0, -1]),
      P("Служебный модуль", "Компьютер, двигатели, связь и солнечная батарея — на горячей стороне щита.", [at(box(1.2, 0.5, 1.0, M.foil()), 0, -0.95, 0), at(panel(0.8, 1.8, M.panel("#1d2f6b")), 0, -1.25, -1.2, 0.3, 0, 0)], [0, -1, 0]),
    ];
  },
  gnss() {
    const pv = M.panel("#1d2f6b");
    const wing = (sx) => [0, 1, 2].map((k) => d(at(panel(1.0, 0.95, pv), sx * (1.3 + k * 1.05), 0, 0, 0, 0, 0), [sx, 0, 0]));
    return [
      P("Корпус", "Платформа в золотистой теплоизоляции: держит всё вместе и хранит топливо.", [at(box(1.3, 1.3, 1.3, M.foil()), 0, 0, 0)], [0, 0, 0]),
      P("Атомные часы", "Сердце навигации: цезиевые и рубидиевые часы. Ошибка в миллиардную долю секунды — это 30 см на Земле.", [at(box(0.3, 0.3, 0.3, M.silver()), -0.2, 0.15, 0), at(box(0.3, 0.3, 0.3, M.silver()), 0.2, 0.15, 0)], [0, 1.6, 0]),
      P("Навигационная антенна", "Решётка из спиральных антенн смотрит на Землю и передаёт сигнал времени.", [0, 1, 2, 3, 4, 5].map((k) => at(cyl(0.08, 0.35, M.white(), "y"), Math.cos(k) * 0.35, -0.85, Math.sin(k) * 0.35)), [0, -1.4, 0]),
      P("Солнечные батареи", "Два крыла поворачиваются вслед за Солнцем.", [...wing(1), ...wing(-1)], [1, 0, 0]),
    ];
  },
  geo() {
    const pv = M.panel("#1d2f6b");
    const wing = (sx) => [0, 1, 2, 3].map((k) => d(at(panel(1.1, 1.0, pv), sx * (1.4 + k * 1.15), 0, 0), [sx, 0, 0]));
    return [
      P("Корпус", "Платформа с топливом, аккумуляторами и компьютером.", [at(box(1.5, 1.8, 1.5, M.foil()), 0, 0, 0)], [0, 0, 0]),
      P("Антенны-рефлекторы", "Большие «тарелки» направляют сигнал на нужную страну.", [d(at(dish(0.9, 0.3, M.white()), 0, 0.3, 1.25, -Math.PI / 2, 0, 0), [0, 0, 1]), d(at(dish(0.7, 0.25, M.white()), 0, 0.5, -1.25, Math.PI / 2, 0, 0), [0, 0, -1])], [0, 0, 1]),
      P("Ретрансляторы", "Транспондеры принимают сигнал с Земли, усиливают и отправляют обратно.", [at(box(1.0, 0.25, 1.0, M.silver()), 0, 1.0, 0)], [0, 1.4, 0]),
      P("Двигатель коррекции", "Подталкивает спутник, чтобы он не «уплывал» с назначенной точки.", [at(cyl(0.12, 0.4, M.dark(), "y", 20, 0.25), 0, -1.1, 0)], [0, -1.4, 0]),
      P("Солнечные батареи", "Длинные крылья дают 10–20 кВт.", [...wing(1), ...wing(-1)], [1, 0, 0]),
    ];
  },
  starlink() {
    const pv = M.panel("#1d2f6b");
    return [
      P("Плоский корпус", "Плоский, чтобы в ракету влезло 20–60 спутников стопкой, как блины.", [at(box(2.6, 0.18, 1.3, M.silver()), 0, 0, 0)], [0, 0, 0]),
      P("Фазированные антенны", "Плоские антенны без движущихся частей: «наводят» луч электроникой.", [[-0.8, -0.3], [0.8, -0.3], [-0.8, 0.3], [0.8, 0.3]].map(([x, z]) => at(box(0.7, 0.04, 0.5, M.dark()), x, -0.12, z)), [0, -1.2, 0]),
      P("Солнечная батарея", "Одно большое крыло на штанге.", [at(panel(1.3, 4.6, pv), 0, 0.5, -2.8), at(cyl(0.03, 0.9, M.dark(), "z"), 0, 0.25, -0.9)], [0, 0.8, -1]),
      P("Ионный двигатель", "Холловский двигатель на криптоне или аргоне поднимает спутник на рабочую орбиту и уводит в атмосферу в конце службы.", [at(cyl(0.12, 0.25, M.dark(), "x", 20, 0.16), 1.4, 0, 0)], [1.3, 0, 0]),
      P("Звёздные датчики", "Камеры смотрят на звёзды, чтобы спутник знал, куда повёрнут.", [at(cyl(0.07, 0.18, M.white(), "y"), -1.0, 0.18, 0.4), at(cyl(0.07, 0.18, M.white(), "y"), -1.0, 0.18, -0.4)], [0, 1, 0]),
    ];
  },
  eo() {
    const pv = M.panel("#1d2f6b");
    return [
      P("Корпус", "Служебная платформа: питание, компьютер, двигатели ориентации.", [at(box(1.4, 1.4, 2.0, M.foil()), 0, 0, 0)], [0, 0, 0]),
      P("Камера / телескоп", "Главный прибор смотрит вниз на Землю — снимает в видимом и инфракрасном свете.", [at(cyl(0.38, 0.9, M.dark(), "y"), 0, -1.1, 0.3), at(cyl(0.3, 0.05, M.mirror(), "y"), 0, -1.56, 0.3)], [0, -1.4, 0]),
      P("Дополнительные приборы", "Радиометры и датчики температуры, облаков, льда.", [at(box(0.5, 0.4, 0.5, M.silver()), 0.4, 0.9, -0.5), at(box(0.4, 0.3, 0.4, M.white()), -0.4, 0.85, 0.5)], [0, 1.2, 0]),
      P("Солнечная батарея", "Одно крыло, повёрнутое к Солнцу.", [at(panel(1.3, 3.4, pv), 2.0, 0.3, 0, 0, 0, 0.25), at(cyl(0.03, 1.0, M.dark(), "x"), 1.1, 0.15, 0)], [1.3, 0, 0]),
      P("Антенна передачи данных", "Сбрасывает снимки на наземные станции при пролёте.", [at(dish(0.35, 0.12, M.white()), -0.9, -0.5, -0.9, Math.PI, 0, 0)], [-1, 0, -1]),
    ];
  },
  sputnik() {
    const shell = M.mirror();
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.9, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), shell);
    const bot = new THREE.Mesh(new THREE.SphereGeometry(0.9, 40, 20, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.mirror());
    top.material.side = THREE.DoubleSide;
    const ants = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sy]) => {
      const m = cyl(0.025, 3.2, M.silver(), "z"); m.position.set(sx * 0.35, sy * 0.35, -2.2); m.rotation.set(sy * 0.18, -sx * 0.18, 0); return m;
    });
    return [
      P("Верхняя полусфера", "Корпус из алюминиевого сплава, отполированный до блеска, чтобы отражать солнечное тепло.", [top], [0, 1.4, 0]),
      P("Нижняя полусфера", "Вторая половина герметичного корпуса, заполненного азотом.", [bot], [0, -1.4, 0]),
      P("Радиопередатчик", "Передавал знаменитое «бип-бип» на частотах 20 и 40 МГц — его ловили радиолюбители по всему миру.", [at(box(0.5, 0.3, 0.4, M.dark()), 0, 0.12, 0)], [0, 0.6, 0]),
      P("Батареи", "Серебряно-цинковые аккумуляторы питали передатчик 22 дня.", [at(box(0.7, 0.25, 0.5, M.red()), 0, -0.22, 0)], [0, -0.6, 0]),
      P("Антенны", "Четыре штыря длиной 2,4 и 2,9 м.", ants, [0, 0, -1]),
    ];
  },
};

/** Смонтировать модель спутника с разборкой и выносками. */
export function mountSat({ stage, svg, labelsEl, sat, onReadout, onPart }) {
  const S = createStage(stage, { fov: 30 });
  const { scene, camera, controls } = S;
  // мягкое «студийное» окружение — чтобы металл и золотая фольга отражали свет, а не чернели
  const pmrem = new THREE.PMREMGenerator(S.renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  const parts = (MODELS[sat.model] || MODELS.eo)();
  const root = new THREE.Group(); scene.add(root);
  parts.forEach((p, i) => p.meshes.forEach((m) => {
    m.userData.part = i; m.userData.home = m.position.clone();
    const dv = new THREE.Vector3(...m.userData.dir); m.userData.dirV = dv;
    root.add(m);
  }));
  // вписать модель в кадр
  const bb = new THREE.Box3().setFromObject(root), size = bb.getSize(new THREE.Vector3()), ctr = bb.getCenter(new THREE.Vector3());
  root.position.sub(ctr);
  const rad = size.length() / 2;
  const dist = (rad / Math.tan(THREE.MathUtils.degToRad(15))) * 1.15;
  camera.position.set(dist * 0.55, dist * 0.42, dist * 0.72);
  controls.minDistance = dist * 0.4; controls.maxDistance = dist * 2.2;
  const spread = rad * 0.45;

  const state = { ex: 0, exT: 0.3, hover: -1, pinned: -1 }; // при открытии модель сама слегка «разбирается»

  // выноски
  const NS = "http://www.w3.org/2000/svg";
  svg.innerHTML = ""; labelsEl.innerHTML = "";
  const callouts = parts.map((p, i) => {
    const path = document.createElementNS(NS, "path"), dot = document.createElementNS(NS, "circle");
    dot.setAttribute("r", "2.6"); svg.append(path, dot);
    const el = document.createElement("div"); el.className = "callout-label";
    el.innerHTML = `<b>${String(i + 1).padStart(2, "0")} ${p.name}</b>`;
    el.addEventListener("pointerenter", () => setHover(i)); el.addEventListener("pointerleave", () => setHover(-1));
    el.addEventListener("click", () => setPinned(state.pinned === i ? -1 : i));
    labelsEl.append(el);
    return { path, dot, el };
  });
  const v = new THREE.Vector3();
  function layout() {
    const W = S.width, H = S.height;
    if (W < 560) return;
    const items = parts.map((p, i) => {
      v.set(0, 0, 0); p.meshes.forEach((m) => v.add(m.getWorldPosition(new THREE.Vector3()))); v.divideScalar(p.meshes.length);
      return { i, p: S.project(v) };
    });
    if (items.some((x) => !isFinite(x.p.x) || !isFinite(x.p.y))) return; // первый кадр: камера ещё не обновлена
    const colX = W - 210, gap = 30, total = (items.length - 1) * gap;
    items.sort((a, b) => a.p.y - b.p.y);
    const y0 = Math.max(52, Math.min(H - 52 - total, H / 2 - total / 2));
    items.forEach((x, k) => {
      const c = callouts[x.i], ly = y0 + k * gap, on = state.hover === x.i || state.pinned === x.i;
      c.el.style.left = colX + 14 + "px"; c.el.style.top = ly - 7 + "px";
      const mx = Math.max(x.p.x + 18, colX - 30);
      c.path.setAttribute("d", `M${x.p.x.toFixed(1)},${x.p.y.toFixed(1)} L${mx.toFixed(1)},${ly.toFixed(1)} L${(colX + 8).toFixed(1)},${ly.toFixed(1)}`);
      c.dot.setAttribute("cx", x.p.x.toFixed(1)); c.dot.setAttribute("cy", x.p.y.toFixed(1));
      [c.path, c.dot, c.el].forEach((e) => e.classList.toggle("on", on));
      c.el.classList.toggle("dim", (state.hover >= 0 || state.pinned >= 0) && !on);
    });
  }
  const active = () => (state.hover >= 0 ? state.hover : state.pinned);
  function highlight() {
    const a = active();
    parts.forEach((p, i) => p.meshes.forEach((m) => { if (m.material.emissive) m.material.emissiveIntensity = i === a ? 0.25 : 0; }));
    onPart?.(a);
    readout();
  }
  function readout() {
    const a = active();
    onReadout?.(a >= 0 ? `${String(a + 1).padStart(2, "0")} ${parts[a].name}` : `${sat.name} · ${parts.length} узлов · разбор ${Math.round(state.ex * 100)}%`);
  }
  function setHover(i) { if (state.hover !== i) { state.hover = i; highlight(); } }
  function setPinned(i) { state.pinned = i; highlight(); }

  // указатель
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  const meshes = parts.flatMap((p) => p.meshes);
  function pickPart(e) {
    const r = S.renderer.domElement.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const h = ray.intersectObjects(meshes, false);
    return h.length ? h[0].object.userData.part : -1;
  }
  let raf = 0, lastE = null, downAt = null;
  S.renderer.domElement.addEventListener("pointermove", (e) => { if (e.pointerType === "touch") return; lastE = e; if (!raf) raf = requestAnimationFrame(() => { raf = 0; setHover(pickPart(lastE)); }); });
  S.renderer.domElement.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch") setHover(-1); });
  S.renderer.domElement.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; });
  S.renderer.domElement.addEventListener("pointerup", (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 8) return;
    const i = pickPart(e); setPinned(i === state.pinned ? -1 : i);
  });

  let intro = 0;
  S.onFrame((dt, t, idle) => {
    const rm = reducedMotion();
    intro += dt;
    const target = !rm && intro < 1.2 ? 0 : state.exT;
    const prev = state.ex;
    state.ex = rm ? target : follow(state.ex, target, dt, 0.35);
    if (Math.abs(prev - state.ex) > 1e-4 || intro < 0.1) {
      parts.forEach((p) => p.meshes.forEach((m) => m.position.copy(m.userData.home).addScaledVector(m.userData.dirV, state.ex * spread)));
      readout();
    }
    if (!rm && idle > 4) root.rotation.y += dt * 0.12;
    layout();
  });
  S.start(); readout();
  const api = {
    setExplode(x) { state.exT = x; S.touch(); },
    pin: setPinned, hover: setHover, parts,
    dispose: () => S.dispose(),
  };
  return api;
}
