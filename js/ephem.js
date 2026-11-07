// Эфемериды в браузере — где планеты, Луна и спутники Юпитера находятся в любой момент.
// Планеты: кеплеровы элементы JPL (E. M. Standish, «Keplerian Elements for Approximate
//          Positions of the Major Planets», таблица для 1800–2050 гг.) — точность ~1′.
// Луна: укороченная теория из книги Ж. Меёса «Астрономические алгоритмы», гл. 47 (~0,1°).
// Галилеевы спутники: метод низкой точности Меёса, гл. 44 (~0,1 радиуса Юпитера).

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const norm360 = (x) => ((x % 360) + 360) % 360;
const sin = (d) => Math.sin(d * D2R), cos = (d) => Math.cos(d * D2R);
export const AU = 149597870.7; // км
export const C_KMS = 299792.458;

/** Юлианская дата для JS Date. */
export const jd = (date) => date.getTime() / 86400000 + 2440587.5;
const T_of = (date) => (jd(date) - 2451545.0) / 36525;

// a (а. е.), e, I (°), L (°), ϖ — долгота перигелия (°), Ω (°) и их изменение за столетие
const EL = {
  mercury: [[0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
  venus:   [[0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255], [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418]],
  earth:   [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]],
  mars:    [[1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  jupiter: [[5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
  saturn:  [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
  uranus:  [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503], [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
  neptune: [[30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574], [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]],
};
export const PLANET_IDS = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"];

function kepler(M, e) {
  // уравнение Кеплера E − e·sin E = M (в градусах)
  let E = M + R2D * e * sin(M);
  for (let k = 0; k < 8; k++) { const dE = (M - (E - R2D * e * sin(E))) / (1 - e * cos(E)); E += dE; if (Math.abs(dE) < 1e-7) break; }
  return E;
}
/** Гелиоцентрические эклиптические координаты J2000 (а. е.). */
export function helio(id, date) {
  const T = T_of(date), [b, r] = EL[id];
  const a = b[0] + r[0] * T, e = b[1] + r[1] * T, I = b[2] + r[2] * T, L = b[3] + r[3] * T, w = b[4] + r[4] * T, O = b[5] + r[5] * T;
  const om = w - O, M = norm360(L - w), E = kepler(M, e);
  const xp = a * (cos(E) - e), yp = a * Math.sqrt(1 - e * e) * sin(E);
  const co = cos(om), so = sin(om), cO = cos(O), sO = sin(O), cI = cos(I), sI = sin(I);
  return {
    x: (co * cO - so * sO * cI) * xp + (-so * cO - co * sO * cI) * yp,
    y: (co * sO + so * cO * cI) * xp + (-so * sO + co * cO * cI) * yp,
    z: so * sI * xp + co * sI * yp,
    a, e, I, O, w, L,
  };
}
/** Точки орбиты (для рисования эллипса). */
export function orbitPoints(id, date, n = 180) {
  const T = T_of(date), [b, r] = EL[id];
  const a = b[0] + r[0] * T, e = b[1] + r[1] * T, I = b[2] + r[2] * T, w = b[4] + r[4] * T, O = b[5] + r[5] * T, om = w - O;
  const co = cos(om), so = sin(om), cO = cos(O), sO = sin(O), cI = cos(I), sI = sin(I), pts = [];
  for (let k = 0; k <= n; k++) {
    const E = (k / n) * 360, xp = a * (cos(E) - e), yp = a * Math.sqrt(1 - e * e) * sin(E);
    pts.push({ x: (co * cO - so * sO * cI) * xp + (-so * cO - co * sO * cI) * yp, y: (co * sO + so * cO * cI) * xp + (-so * sO + co * cO * cI) * yp, z: so * sI * xp + co * sI * yp });
  }
  return pts;
}

const OBL = 23.43928;
/** Эклиптические → экваториальные: прямое восхождение (ч), склонение (°). */
export function eclToRaDec(x, y, z) {
  const ye = y * cos(OBL) - z * sin(OBL), ze = y * sin(OBL) + z * cos(OBL);
  const ra = norm360(Math.atan2(ye, x) * R2D) / 15, dec = Math.atan2(ze, Math.hypot(x, ye)) * R2D;
  return { ra, dec };
}

// грубые границы зодиакальных созвездий по эклиптической долготе (для подсказки «где искать»)
const ZOD = [[0, "Рыбы"], [29, "Овен"], [53, "Телец"], [90, "Близнецы"], [118, "Рак"], [138, "Лев"], [174, "Дева"], [218, "Весы"], [241, "Скорпион"], [248, "Змееносец"], [266, "Стрелец"], [300, "Козерог"], [328, "Водолей"], [352, "Рыбы"]];
export const constellation = (lon) => { lon = norm360(lon); let n = ZOD[0][1]; for (const [l, name] of ZOD) if (lon >= l) n = name; return n; };

/** Всё о планете на дату: расстояния, видимость, координаты. */
export function planetInfo(id, date) {
  const p = helio(id, date), E = helio("earth", date);
  const g = { x: p.x - E.x, y: p.y - E.y, z: p.z - E.z }, gs = { x: -E.x, y: -E.y, z: -E.z };
  const dist = Math.hypot(g.x, g.y, g.z), rSun = Math.hypot(p.x, p.y, p.z);
  const lon = norm360(Math.atan2(g.y, g.x) * R2D), lat = Math.atan2(g.z, Math.hypot(g.x, g.y)) * R2D;
  const lonSun = norm360(Math.atan2(gs.y, gs.x) * R2D);
  const elong = Math.acos(Math.max(-1, Math.min(1, (g.x * gs.x + g.y * gs.y + g.z * gs.z) / (dist * Math.hypot(gs.x, gs.y, gs.z))))) * R2D;
  const east = norm360(lon - lonSun) < 180; // восточнее Солнца → видна вечером
  let vis;
  if (id === "earth") vis = "—";
  else if (elong < 15) vis = "теряется в лучах Солнца";
  else if (elong > 150 && !["mercury", "venus"].includes(id)) vis = "видна всю ночь";
  else vis = east ? "видна вечером после заката" : "видна утром перед рассветом";
  const { ra, dec } = eclToRaDec(g.x, g.y, g.z);
  return { id, helio: p, rSun, dist, distKm: dist * AU, lightMin: (dist * AU) / C_KMS / 60, lon, lat, elong, vis, ra, dec, constellation: constellation(lon) };
}

// ---------------------------------------------------------------- Луна
export function moon(date) {
  const T = T_of(date);
  const Lp = norm360(218.3164477 + 481267.88123421 * T), D = norm360(297.8501921 + 445267.1114034 * T);
  const M = norm360(357.5291092 + 35999.0502909 * T), Mp = norm360(134.9633964 + 477198.8675055 * T), F = norm360(93.272095 + 483202.0175233 * T);
  const Ecc = 1 - 0.002516 * T;
  const l = 6288774 * sin(Mp) + 1274027 * sin(2 * D - Mp) + 658314 * sin(2 * D) + 213618 * sin(2 * Mp) - 185116 * Ecc * sin(M) - 114332 * sin(2 * F)
    + 58793 * sin(2 * D - 2 * Mp) + 57066 * Ecc * sin(2 * D - M - Mp) + 53322 * sin(2 * D + Mp) + 45758 * Ecc * sin(2 * D - M) - 40923 * Ecc * sin(M - Mp) - 34720 * sin(D) - 30383 * Ecc * sin(M + Mp);
  const r = -20905355 * cos(Mp) - 3699111 * cos(2 * D - Mp) - 2955968 * cos(2 * D) - 569925 * cos(2 * Mp) + 48888 * Ecc * cos(M) - 3149 * cos(2 * F)
    + 246158 * cos(2 * D - 2 * Mp) - 152138 * Ecc * cos(2 * D - M - Mp) - 170733 * cos(2 * D + Mp) - 204586 * Ecc * cos(2 * D - M) - 129620 * Ecc * cos(M - Mp) + 108743 * cos(D) + 104755 * Ecc * cos(M + Mp);
  const b = 5128122 * sin(F) + 280602 * sin(Mp + F) + 277693 * sin(Mp - F) + 173237 * sin(2 * D - F) + 55413 * sin(2 * D - Mp + F) + 46271 * sin(2 * D - Mp - F) + 32573 * sin(2 * D + F) + 17198 * sin(2 * Mp + F);
  const lon = norm360(Lp + l / 1e6), lat = b / 1e6, distKm = 385000.56 + r / 1000;
  // Солнце (геоцентрическая долгота)
  const E = helio("earth", date), lonSun = norm360(Math.atan2(-E.y, -E.x) * R2D);
  const elong = Math.acos(cos(lat) * cos(lon - lonSun)) * R2D;        // угол Луна–Солнце
  const phaseAngle = 180 - elong;                                          // угол Солнце–Луна–Земля (приблизительно)
  const illum = (1 + cos(phaseAngle)) / 2;
  const age = norm360(lon - lonSun) / 360;                                 // 0 — новолуние, 0,5 — полнолуние
  const x = distKm * cos(lat) * cos(lon), y = distKm * cos(lat) * sin(lon), z = distKm * sin(lat);
  return { lon, lat, distKm, illum, age, ageDays: age * 29.530589, lonSun, x, y, z, waxing: age < 0.5, ...eclToRaDec(x, y, z) };
}
export function moonPhaseName(age) {
  const d = age * 29.530589, near = (t) => Math.abs(((d - t * 29.530589 + 44.3) % 29.530589) - 14.765) < 1;
  if (near(0)) return "Новолуние";
  if (near(0.5)) return "Полнолуние";
  if (near(0.25)) return "Первая четверть";
  if (near(0.75)) return "Последняя четверть";
  if (age < 0.25) return "Растущий серп";
  if (age < 0.5) return "Растущая Луна";
  if (age < 0.75) return "Убывающая Луна";
  return "Убывающий серп";
}
/** Ближайший момент, когда «возраст» Луны пройдёт через target (0 — новолуние, 0,5 — полнолуние). */
export function nextMoonPhase(date, target) {
  let t = date.getTime();
  const f = (ms) => { const a = moon(new Date(ms)).age; return ((a - target + 1.5) % 1) - 0.5; };
  let prev = f(t);
  for (let k = 0; k < 24 * 32; k++) {
    const t2 = t + 3600000, cur = f(t2);
    if (prev < 0 && cur >= 0) { let lo = t, hi = t2; for (let j = 0; j < 30; j++) { const mid = (lo + hi) / 2; f(mid) < 0 ? (lo = mid) : (hi = mid); } return new Date((lo + hi) / 2); }
    t = t2; prev = cur;
  }
  return null;
}

// ---------------------------------------------------------------- Галилеевы спутники
/** X, Y — в радиусах Юпитера; X > 0 — к западу (вправо на снимке «север сверху»), behind — за диском. */
export function galilean(date) {
  const d = jd(date) - 2451545.0;
  const V = 172.74 + 0.00111588 * d, M = 357.529 + 0.9856003 * d;
  const N = 20.02 + 0.0830853 * d + 0.329 * sin(V), J = 66.115 + 0.9025179 * d - 0.329 * sin(V);
  const A = 1.915 * sin(M) + 0.02 * sin(2 * M), B = 5.555 * sin(N) + 0.168 * sin(2 * N);
  const K = J + A - B, R = 1.00014 - 0.01671 * cos(M) - 0.00014 * cos(2 * M), r = 5.20872 - 0.25208 * cos(N) - 0.00611 * cos(2 * N);
  const Dl = Math.sqrt(r * r + R * R - 2 * r * R * cos(K)), psi = Math.asin((R / Dl) * sin(K)) * R2D;
  const lam = 34.35 + 0.083091 * d + 0.329 * sin(V) + B;
  const Ds = 3.12 * sin(lam + 42.8);
  const De = Ds - 2.22 * sin(psi) * cos(lam + 22) - 1.3 * ((r - Dl) / Dl) * sin(lam - 100.5);
  const dd = d - Dl / 173;
  let u1 = 163.8069 + 203.4058646 * dd + psi - B, u2 = 358.414 + 101.2916335 * dd + psi - B, u3 = 5.7176 + 50.234518 * dd + psi - B, u4 = 224.8092 + 21.48798 * dd + psi - B;
  const G = 331.18 + 50.310482 * dd, H = 87.45 + 21.569231 * dd;
  const c1 = 0.473 * sin(2 * (u1 - u2)), c2 = 1.065 * sin(2 * (u2 - u3)), c3 = 0.165 * sin(G), c4 = 0.843 * sin(H);
  const r1 = 5.9057 - 0.0244 * cos(2 * (u1 - u2)), r2 = 9.3966 - 0.0882 * cos(2 * (u2 - u3)), r3 = 14.9883 - 0.0216 * cos(G), r4 = 26.3627 - 0.1939 * cos(H);
  u1 += c1; u2 += c2; u3 += c3; u4 += c4;
  const mk = (id, name, u, rr) => { const X = rr * sin(u), Y = -rr * cos(u) * sin(De), behind = cos(u) > 0; return { id, name, X, Y, behind, hidden: behind && Math.abs(X) < 1 && Math.abs(Y) < 1, transit: !behind && Math.abs(X) < 1 }; };
  return { distAU: Dl, moons: [mk("io", "Ио", u1, r1), mk("europa", "Европа", u2, r2), mk("ganymede", "Ганимед", u3, r3), mk("callisto", "Каллисто", u4, r4)] };
}
