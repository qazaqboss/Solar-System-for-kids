// Слежение в реальном времени: где сейчас каждая планета и каждый спутник,
// на каком они расстоянии, с какой скоростью летят и что с ними происходит.
import { helio, planetInfo, moon as earthMoon, moonPhaseName, galilean, constellation, AU, C_KMS } from "./ephem.js";

const DAY = 86400000, J2000 = 946728000000;
const nf = (x, d = 0) => x.toLocaleString("ru-RU", { maximumFractionDigits: d, minimumFractionDigits: d });
const norm360 = (x) => ((x % 360) + 360) % 360;
const fmtDays = (d) => d < 1 ? `${nf(d * 24, 0)} ч` : d < 60 ? `${nf(d, d < 10 ? 1 : 0)} сут` : d < 730 ? `${nf(d / 30.44, 0)} мес.` : `${nf(d / 365.25, 1)} лет`;
const fmtDate = (t) => new Date(t).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
const fmtLight = (s) => s < 60 ? `${nf(s, 2)} с` : s < 3600 ? `${nf(s / 60, 1)} мин` : `${Math.floor(s / 3600)} ч ${Math.round((s % 3600) / 60)} мин`;
const km = (x) => x >= 1e9 ? `${nf(x / 1e9, 3)} млрд км` : x >= 1e6 ? `${nf(x / 1e6, 3)} млн км` : `${nf(x, 0)} км`;
const kmFull = (x) => `${nf(x, 0)} км`;

// спутники Плутона (своей страницы системы у Плутона на сайте нет)
export const PLUTO = { id: "pluto", total: 5, named: 5, groups: { main: { name: "Спутники Плутона", color: "#9b9086" } }, moons: [
  { id: "charon", name: "Харон", r: 606, a: 19591, p: 6.387, i: 0, group: "main", link: false },
  { id: "styx", name: "Стикс", r: 8, a: 42656, p: 20.16, i: 0.8, group: "main", link: false },
  { id: "nix", name: "Никта", r: 25, a: 48694, p: 24.85, i: 0.1, group: "main", link: false },
  { id: "kerberos", name: "Кербер", r: 6, a: 57783, p: 32.17, i: 0.4, group: "main", link: false },
  { id: "hydra", name: "Гидра", r: 25, a: 64738, p: 38.2, i: 0.2, group: "main", link: false },
] };
export const PLANET_R = { mercury: 2440, venus: 6052, earth: 6371, mars: 3390, jupiter: 69911, saturn: 58232, uranus: 25362, neptune: 24622, pluto: 1188 };
const NAMES = { mercury: "Меркурий", venus: "Венера", earth: "Земля", mars: "Марс", jupiter: "Юпитер", saturn: "Сатурн", uranus: "Уран", neptune: "Нептун", pluto: "Плутон" };
const GEN = { mercury: "Меркурия", venus: "Венеры", earth: "Земли", mars: "Марса", jupiter: "Юпитера", saturn: "Сатурна", uranus: "Урана", neptune: "Нептуна", pluto: "Плутона" };
const GALI = ["io", "europa", "ganymede", "callisto"];

/** Постоянная «фаза» спутника на орбите (одна и та же в 3D и в таблицах). */
export function phaseOf(id) { let h = 2166136261; for (const c of id) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return ((h >>> 0) / 4294967296) * Math.PI * 2; }

/** Угол спутника на орбите в плоскости эклиптики (рад), как в 3D-сцене. exact — положение точное. */
export function moonAngle(sys, m, d, gal = null) {
  if (sys === "jupiter" && GALI.includes(m.id)) {
    gal ||= galilean(d);
    const g = gal.moons.find((x) => x.id === m.id), J = helio("jupiter", d), E = helio("earth", d);
    return { a: Math.atan2(J.y - E.y, J.x - E.x) + (g.u * Math.PI) / 180, exact: true, g };
  }
  const days = (d.getTime() - J2000) / DAY;
  return { a: phaseOf(m.id) + (m.retro ? -1 : 1) * (2 * Math.PI * days) / Math.abs(m.p), exact: false };
}

/** Положение спутника относительно Земли и Солнца. */
export function moonState(sys, m, d, gal) {
  const { a, exact, g } = moonAngle(sys, m, d, gal);
  const P = helio(sys, d), E = helio("earth", d);
  const mx = P.x * AU + m.a * Math.cos(a), my = P.y * AU + m.a * Math.sin(a), mz = P.z * AU;
  const ex = mx - E.x * AU, ey = my - E.y * AU, ez = mz - E.z * AU;
  const distEarth = Math.hypot(ex, ey, ez), distSun = Math.hypot(mx, my, mz);
  // вид с Земли: перед планетой, за ней или сбоку (к востоку/западу)
  const lx = P.x - E.x, ly = P.y - E.y, ll = Math.hypot(lx, ly), ux = Math.cos(a), uy = Math.sin(a);
  const along = (ux * lx + uy * ly) / ll, side = (-ux * ly + uy * lx) / ll; // side > 0 — к востоку
  const R = PLANET_R[sys], offR = (Math.abs(side) * m.a) / R;
  let view;
  if (offR < 1) view = along > 0 ? "спрятался за планетой — с Земли не виден" : "проходит на фоне диска планеты";
  else view = `${nf(offR, 1)} радиуса планеты к ${side > 0 ? "востоку" : "западу"} от неё (вид с Земли)`;
  const v = (2 * Math.PI * m.a) / (Math.abs(m.p) * 86400);
  const days = (d.getTime() - J2000) / DAY, lap = (((days / Math.abs(m.p)) % 1) + 1) % 1;
  return { a, exact, g, distEarth, distSun, v, view, offR, behind: offR < 1 && along > 0, transit: offR < 1 && along <= 0, side, lap, lightS: distEarth / C_KMS };
}

// ---------------------------------------------------------------- планета
export function planetReport(id, d, systems) {
  const i = planetInfo(id, d), j = planetInfo(id, new Date(d.getTime() + 60000)), k = planetInfo(id, new Date(d.getTime() + DAY));
  const h = i.helio, a = h.a, P = 365.256 * Math.pow(a, 1.5);
  const v = 29.7847 * Math.sqrt(2 / i.rSun - 1 / a);
  const M = norm360(h.L - h.w);
  const toPeri = ((360 - M) / 360) * P, toAph = ((norm360(180 - M)) / 360) * P;
  const rate = (j.distKm - i.distKm) / 60;
  const sunRate = ((j.rSun - i.rSun) * AU) / 60;
  const stats = [
    ["До Солнца", km(i.rSun * AU), `${nf(i.rSun, 4)} а. е. · ${sunRate < 0 ? "приближается" : "удаляется"} на ${nf(Math.abs(sunRate), 2)} км/с`],
    ["Скорость по орбите", `${nf(v, 2)} км/с`, `${nf(v * 3600, 0)} км/ч`],
    ["Год", fmtDays(P), `пройдено ${nf((M / 360) * 100, 1)}% витка от перигелия`],
  ];
  const sit = [];
  if (id === "earth") {
    const ls = norm360(Math.atan2(-h.y, -h.x) * 180 / Math.PI);
    const season = ["весна", "лето", "осень", "зима"][Math.floor(ls / 90)];
    const nextQ = Math.ceil((ls + 0.01) / 90) * 90, tq = ((nextQ - ls) / 0.9856);
    const qName = { 90: "летнее солнцестояние", 180: "осеннее равноденствие", 270: "зимнее солнцестояние", 360: "весеннее равноденствие" }[nextQ];
    stats.push(["Сезон (север)", season, `${qName} — через ${fmtDays(tq)}, ${fmtDate(d.getTime() + tq * DAY)}`]);
    stats.push(["Перигелий", `через ${fmtDays(toPeri)}`, `${fmtDate(d.getTime() + toPeri * DAY)} — ближе всего к Солнцу`]);
    sit.push(`Земля летит вокруг Солнца со скоростью ${nf(v, 2)} км/с: пока ты читаешь эту строчку (≈5 секунд), мы пролетели ${nf(v * 5, 0)} км.`);
    sit.push(`В Северном полушарии сейчас ${season}, в Южном — ${{ весна: "осень", лето: "зима", осень: "весна", зима: "лето" }[season]}. Времена года бывают из-за наклона оси Земли (23,4°), а не из-за расстояния до Солнца.`);
    sit.push(toPeri < toAph ? `Земля приближается к Солнцу: перигелий (147,1 млн км) будет ${fmtDate(d.getTime() + toPeri * DAY)}` : `Земля удаляется от Солнца: афелий (152,1 млн км) будет ${fmtDate(d.getTime() + toAph * DAY)}`);
    return { title: "Земля", sub: "мы здесь", stats, sit };
  }
  stats.unshift(["До Земли", kmFull(i.distKm), `${nf(i.dist, 4)} а. е. · ${rate < 0 ? "сближаемся" : "расходимся"} на ${nf(Math.abs(rate), 2)} км/с`]);
  stats.splice(2, 0, ["Свет от планеты к нам", fmtLight((i.distKm) / C_KMS), "столько летит её свет — мы видим её «в прошлом»"]);
  stats.push(["На небе", i.constellation, `${i.vis} · ${nf(i.elong, 1)}° от Солнца`]);
  const dl = ((k.lon - i.lon + 540) % 360) - 180;
  if (i.elong < 8) sit.push(`${NAMES[id]} сейчас почти в одном направлении с Солнцем (соединение) — её не видно в его лучах.`);
  else if (i.elong > 170 && !["mercury", "venus"].includes(id)) sit.push(`${NAMES[id]} почти в противостоянии: Земля между ней и Солнцем. Это лучшее время смотреть на неё — она ближе всего и видна всю ночь.`);
  else sit.push(`${NAMES[id]} — в созвездии ${i.constellation}. Когда искать на небе: ${i.vis.replace(/^видна /, "")}.`);
  if (dl < 0) sit.push(`Сейчас попятное движение: на небе ${NAMES[id]} пятится «назад» среди звёзд. На самом деле это Земля обгоняет её${["mercury", "venus"].includes(id) ? " (точнее, она обгоняет Землю по внутренней орбите)" : ""}.`);
  sit.push(rate < 0 ? `Расстояние до Земли сокращается на ${nf(Math.abs(rate) * 3600, 0)} км каждый час.` : `Расстояние до Земли растёт на ${nf(rate * 3600, 0)} км каждый час.`);
  sit.push(toPeri < toAph ? `${NAMES[id]} летит к перигелию (ближайшей к Солнцу точке): он будет ${fmtDate(d.getTime() + toPeri * DAY)}` : `${NAMES[id]} удаляется от Солнца к афелию: он будет ${fmtDate(d.getTime() + toAph * DAY)}`);
  const sy = id === "pluto" ? PLUTO : systems?.[id];
  if (sy) sit.push(`У ${GEN[id]} ${sy.total} ${sy.total === 1 ? "спутник" : sy.total < 5 ? "спутника" : "спутников"} — выбери любой в таблице ниже, чтобы следить за ним.`);
  else sit.push(`У ${GEN[id]} нет спутников.`);
  return { title: NAMES[id], sub: id === "pluto" ? "карликовая планета" : "планета", stats, sit };
}

// ---------------------------------------------------------------- Луна
export function earthMoonReport(d) {
  const m = earthMoon(d), m2 = earthMoon(new Date(d.getTime() + 60000));
  const rate = (m2.distKm - m.distKm) / 60;
  const stats = [
    ["До Земли", kmFull(m.distKm), `${rate < 0 ? "приближается" : "удаляется"} на ${nf(Math.abs(rate * 1000), 0)} м/с`],
    ["Свет от неё к нам", fmtLight(m.distKm / C_KMS), "радиосигнал до Луны и обратно — 2,5 с"],
    ["Фаза", moonPhaseName(m.age), `освещено ${nf(m.illum * 100, 1)}% · возраст ${nf(m.ageDays, 1)} сут`],
    ["Скорость по орбите", "≈1,02 км/с", "один оборот за 27,3 сут"],
    ["На небе", constellation(m.lon), `${m.waxing ? "растёт" : "убывает"}`],
  ];
  const sit = [
    `Луна сейчас в созвездии ${constellation(m.lon)}: ${moonPhaseName(m.age).toLowerCase()}, освещено ${nf(m.illum * 100, 0)}% диска.`,
    m.distKm < 370000 ? "Луна близко к перигею (ближайшей точке орбиты) — она кажется чуть больше обычного." : m.distKm > 400000 ? "Луна близко к апогею (самой дальней точке орбиты) — она кажется чуть меньше." : `Луна на среднем расстоянии и ${rate < 0 ? "приближается к Земле" : "удаляется от Земли"}.`,
    "Луна всегда повёрнута к Земле одной стороной: она оборачивается вокруг оси ровно за то же время, что облетает Землю.",
  ];
  return { title: "Луна", sub: "спутник Земли · положение точное", stats, sit, exact: true };
}

// ---------------------------------------------------------------- спутник другой планеты
export function moonReport(sys, m, d, systems) {
  if (sys === "earth") return earthMoonReport(d);
  const st = moonState(sys, m, d), st2 = moonState(sys, m, new Date(d.getTime() + 60000));
  const rate = (st2.distEarth - st.distEarth) / 60;
  const sy = sys === "pluto" ? PLUTO : systems?.[sys];
  const grp = sy?.groups?.[m.group]?.name;
  const stats = [
    [`До ${GEN[sys]}`, kmFull(m.a), `${nf(m.a / PLANET_R[sys], 1)} радиуса ${GEN[sys]}`],
    ["До Земли", km(st.distEarth), `${rate < 0 ? "сближаемся" : "расходимся"} на ${nf(Math.abs(rate), 2)} км/с`],
    ["Свет от него к нам", fmtLight(st.lightS), ""],
    ["Скорость по орбите", `${nf(st.v, 2)} км/с`, `${nf(st.v * 3600, 0)} км/ч`],
    ["Один виток", fmtDays(Math.abs(m.p)), `пройдено ${nf(st.lap * 100, 0)}% текущего витка${st.exact ? "" : " (условно)"}`],
    ["Размер", `${nf(m.r * 2, 0)} км`, `в поперечнике${m.r > 1000 ? " — крупный мир" : m.r < 30 ? " — меньше большого города" : ""}`],
  ];
  const sit = [];
  if (st.exact && st.g) {
    sit.push(st.g.hidden ? `${m.name} сейчас спрятался за Юпитером — в телескоп его не видно.` : st.g.transit ? `${m.name} сейчас проходит по диску Юпитера — в телескоп видна его тень на облаках.` : `${m.name} сейчас в ${nf(Math.abs(st.g.X), 1)} радиусах Юпитера к ${st.g.X > 0 ? "западу" : "востоку"} от планеты — его видно даже в бинокль.`);
    if (["io", "europa", "ganymede"].includes(m.id)) sit.push("Ио, Европа и Ганимед связаны резонансом 1 : 2 : 4: пока Ганимед делает один оборот, Европа делает два, а Ио — четыре.");
  } else {
    sit.push(`${m.name} сейчас ${st.view}.`);
  }
  sit.push(`Летит вокруг ${GEN[sys]} со скоростью ${nf(st.v, 2)} км/с${m.retro ? " — в обратную сторону, против вращения планеты: скорее всего, это пойманный астероид или обломок" : ""}.`);
  if (grp) sit.push(`Группа: ${grp}${m.year ? ` · открыт в ${m.year} г.${m.by ? ` (${m.by})` : ""}` : ""}.`);
  sit.push(`Свет от ${m.name.endsWith("а") || m.name.endsWith("я") ? "неё" : "него"} летит до Земли ${fmtLight(st.lightS)}: мы видим его таким, каким он был тогда.`);
  return { title: m.name, sub: `спутник ${GEN[sys]}${st.exact ? " · положение точное" : " · орбита точная, место на ней условное"}`, stats, sit, exact: st.exact, link: m.link === false ? null : `#/moon/${m.id}` };
}

/** Строки трекера для системы спутников планеты. */
export function trackRows(sys, d, systems) {
  if (sys === "earth") {
    const m = earthMoon(d);
    return [{ id: "moon", name: "Луна", group: "—", fromPlanet: m.distKm, fromEarth: m.distKm, v: 1.022, lap: m.age, view: moonPhaseName(m.age).toLowerCase(), exact: true }];
  }
  const sy = sys === "pluto" ? PLUTO : systems?.[sys]; if (!sy) return [];
  const gal = sys === "jupiter" ? galilean(d) : null;
  return sy.moons.filter((m) => !m.gone).map((m) => {
    const st = moonState(sys, m, d, gal);
    const view = st.exact && st.g ? (st.g.hidden ? "за Юпитером" : st.g.transit ? "на фоне диска" : `${nf(Math.abs(st.g.X), 1)} R к ${st.g.X > 0 ? "западу" : "востоку"}`) : st.offR < 1 ? (st.behind ? "за планетой" : "на фоне диска") : `${nf(st.offR, 1)} R к ${st.side > 0 ? "востоку" : "западу"}`;
    return { id: m.id, name: m.name, group: sy.groups?.[m.group]?.name || "", color: sy.groups?.[m.group]?.color, fromPlanet: m.a, fromEarth: st.distEarth, v: st.v, lap: st.lap, view, exact: st.exact, retro: m.retro };
  });
}
export { NAMES as PLANET_NAMES, GEN as PLANET_GEN };
