// Ilustraciones dibujadas (SVG en línea) para edificios, unidades, acciones, recursos y estados
// (Tanda 2, trabajador D; ampliado en la Tanda 3, trabajador E).
// Cada función devuelve un elemento <svg> listo para insertar. Las ilustraciones de edificios EVOLUCIONAN con el
// nivel (0 = solar/plano, 1..max = cada vez más grande y detallado; el taller llega a 6: 1-3 taller, 4-6 fábrica).
// Paleta: variables CSS de main.css (--brass, --cream, --rust, --olive, --amber, --gold...) con colores de respaldo.
// Sin dependencias externas. Sin texto.
//
// API estable (otros módulos la usan; mantener firmas):
//   artBuilding(kind, level, opts) kind ∈ provinces.BUILD (granja,mina,refineria,taller,base,fuerte,linea,aeropuerto,
//                                  puerto,hospital,radar,capital,avenida,ferrocarril,lab,labc); level 0..BUILD[kind].max
//   artUnit(kind, opts)            kind ∈ roster.ROSTER (24 claves) o clave antigua (inf,mot,arm,art,mtn,mar,air,esp → UNIT_ALIAS)
//   artAction(name, opts)          name ∈ attack|move|defend|reorganize|front|recruit|build|research|trade|spy|war|peace|alliance|surprise|provoke|conquest|loot
//   artResource(res, opts)         res ∈ petroleo|gas|minerales|cobre|agro|madera|food|fuel|goods|metal
//   artState(st, opts)             st ∈ carga|recarga|marcha|lista  (icono pequeño del estado de una unidad)
//   opts = { size: px (por defecto 64), class: string, title: string }
//
// Implementación: cada dibujo es una cadena de marcado SVG (barata de generar); se convierte UNA vez en un nodo
// plantilla (cacheado por clave) y cada llamada devuelve un clon. `document` solo se toca al dibujar, de modo que
// los datos (BUILDING_LEVEL_DESC...) pueden importarse en node sin DOM. `__draw(kind, lv)` devuelve la cadena SVG
// sin tocar el DOM (para pruebas).
import { ROSTER } from '../engine/roster.js';
import { BUILD } from '../engine/provinces.js';

const VB = 64;
const K = '#1a1710';                    // trazo oscuro
const BR = 'var(--brass,#b8975a)';
const CR = 'var(--cream,#eadfc4)';
const RU = 'var(--rust,#9a4a42)';
const OL = 'var(--olive,#7b8a4a)';
const AM = 'var(--amber,#b98a3e)';
const GO = 'var(--gold,#d3b160)';
// tonos propios apagados
const WALL = '#8a8068', WALL2 = '#6a6250', CONC = '#a39c88', STEEL = '#6c737a', STEEL2 = '#4e555c', ROOF = '#7a4f3e',
  WOOD = '#7a5c3a', WOOD2 = '#5a4229', DIRT = '#8a6e4a', SKIN = '#d3ae86', SMOKE = '#c9c2ae', WATER = '#4f7a9a', SKY = '#9db3bd',
  DARK = '#2c281d', GRASS = '#6f7f44', SNOW = '#e6e3d6', BRICK = '#9b5a46', OLIVE_D = '#4f5a2f', ASPH = '#5d6064';

// ---- primitivas de dibujo (devuelven cadenas) ----
// Los atributos extra (x2) SUSTITUYEN a los de trazo por defecto (en HTML el primer atributo repetido gana).
const ST_DEF = { stroke: K, 'stroke-width': '1.2', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
const attrs = (x2, f) => {
  const m = { ...ST_DEF, fill: f };
  (x2 || '').replace(/([\w-]+)="([^"]*)"/g, (_, k, v) => { m[k] = v; return ''; });
  return Object.entries(m).map(([k, v]) => `${k}="${v}"`).join(' ');
};
const R = (x, y, w, h, f, x2 = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${attrs(x2, f)}/>`;
const P = (d, f, x2 = '') => `<path d="${d}" ${attrs(x2, f)}/>`;
const C = (x, y, r, f, x2 = '') => `<circle cx="${x}" cy="${y}" r="${r}" ${attrs(x2, f)}/>`;
const E = (x, y, rx, ry, f, x2 = '') => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" ${attrs(x2, f)}/>`;
const L = (x1, y1, x2, y2, col = K, w = 1.2, x3 = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${w}" stroke-linecap="round" ${x3}/>`;
const NP = (d, f, x2 = '') => `<path d="${d}" ${/fill=/.test(x2) ? '' : `fill="${f}" `}${/stroke=/.test(x2) ? '' : 'stroke="none" '}${x2}/>`;   // sin trazo
const NC = (x, y, r, f, o = 1) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${f}" opacity="${o}"/>`;
const GROUND = `<ellipse cx="32" cy="55" rx="27" ry="5" fill="${DARK}" opacity=".5"/><ellipse cx="32" cy="54" rx="26" ry="4.2" fill="#5c5238" opacity=".55"/>`;
const smoke = (x, y, s = 1) => NC(x, y, 2.6 * s, SMOKE, 0.85) + NC(x + 2.5 * s, y - 4 * s, 3.2 * s, SMOKE, 0.7) + NC(x + 1, y - 9 * s, 3.8 * s, SMOKE, 0.5);
const flag = (x, y, col = RU) => L(x, y, x, y - 12, K, 1.2) + P(`M${x} ${y - 12} l9 2.5 l-9 3z`, col);
const window_ = (x, y, w = 3, h = 3) => R(x, y, w, h, GO, 'stroke-width=".7"');


// ---------------------------------------------------------------- EDIFICIOS
/** Frase corta por edificio y nivel (para pies de foto). El índice es el nivel (0 = solar). */
export const BUILDING_LEVEL_DESC = {
  granja: ['Solar con estacas', 'Cabaña con surcos', 'Cabaña con silo', 'Dos silos y tractor'],
  mina: ['Solar con estacas', 'Pozo con montón de mineral', 'Castillete con polea', 'Castillete con vagonetas y cobertizo'],
  refineria: ['Solar con estacas', 'Un tanque de crudo', 'Tanques y torre de destilación', 'Complejo con antorcha encendida'],
  taller: ['Solar con estacas', 'Nave pequeña con grúa', 'Nave mediana con grúa pórtico', 'Nave grande con puente grúa',
    'Fábrica con chimenea y cinta', 'Fábrica con dos chimeneas, cinta y depósitos', 'Complejo industrial con torre de refrigeración'],
  base: ['Solar con estacas', 'Tienda de campaña', 'Barracón con bandera', 'Cuartel con torre y hangar'],
  fuerte: ['Solar con estacas', 'Muro con estacas', 'Muro con torre', 'Bastión estrellado', 'Fortaleza con dos torres y bandera', 'Ciudadela con murallas, torres y bandera'],
  linea: ['Solar con estacas', 'Trinchera', 'Trinchera con alambre de púas'],
  aeropuerto: ['Solar con estacas', 'Pista con manga de viento', 'Hangar, torre y pista', 'Dos pistas, hangares y torre'],
  puerto: ['Solar con estacas', 'Muelle con bolardos', 'Grúas, contenedores y dársena'],
  hospital: ['Solar con estacas', 'Clínica con cruz roja', 'Hospital con alas, ambulancia y cruz'],
  radar: ['Solar con estacas', 'Antena parabólica', 'Dos antenas y caseta'],
  capital: ['Solar con estacas', 'Palacio con cúpula y bandera'],
  avenida: ['Solar con estacas', 'Avenida asfaltada con farolas'],
  ferrocarril: ['Solar con estacas', 'Vía sencilla con traviesas', 'Doble vía con locomotora'],
  lab: ['Solar con estacas', 'Caseta con antena', 'Edificio con cúpula y antena'],
  labc: ['Solar con estacas', 'Complejo con cúpula y antena', 'Complejo con dos cúpulas y antenas', 'Campus con radar y torre de antenas'],
};

function plot() {
  return GROUND
    + P('M10 50 L32 40 L54 50 L32 58Z', '#6d6448', 'stroke-dasharray="3 2.2" fill-opacity=".55" stroke="#9a937c"')
    + [[10, 50], [32, 40], [54, 50], [32, 58]].map(([x, y]) => L(x, y, x, y - 7, WOOD, 1.8) + `<circle cx="${x}" cy="${y - 7.5}" r="1.3" fill="${AM}"/>`).join('')
    + P('M24 48 l11 -3 l4 3 l-11 3z', CR, 'fill-opacity=".8"') + L(27, 47.5, 36, 45.8, '#7a6f55', .7);
}

// Cada elemento de BDRAW devuelve el marcado del nivel 1..max.
const BDRAW = {
  base(l) {
    if (l === 1) return P('M13 51 L27 27 L41 51Z', OL) + P('M27 27 L27 51', 'none') + P('M23 51 L27 40 L31 51Z', DARK) + L(27, 27, 27, 22, K, 1.2) + flag(27, 22, RU).replace(/M27 10/, 'M27 10')
      + P('M40 51 L47 39 L55 51Z', WALL2) + P('M45 51 L47 46 L50 51Z', DARK);
    if (l === 2) return R(8, 34, 36, 18, WALL) + P('M6 35 L26 24 L46 35Z', ROOF) + R(14, 42, 6, 10, DARK) + window_(24, 40) + window_(32, 40) + window_(38, 40)
      + L(48, 52, 48, 22, K, 1.4) + P('M48 22 l10 3 l-10 4z', RU) + P('M50 52 L56 41 L62 52Z', OL);
    return R(5, 38, 26, 14, WALL) + P('M3 39 L18 30 L33 39Z', ROOF) + R(9, 44, 5, 8, DARK) + window_(17, 43) + window_(24, 43)
      + R(33, 20, 10, 32, WALL2) + R(31, 16, 14, 6, WALL) + R(33, 12, 3, 4, WALL) + R(40, 12, 3, 4, WALL) + window_(36, 28) + window_(36, 37) + flag(38, 12, RU)
      + P('M46 52 V44 Q53 35 60 44 V52Z', STEEL) + P('M49 52 V47 Q53 42 57 47 V52Z', DARK) + L(46, 44, 60, 44, K, .8) + NC(18, 41, 1, GO);
  },
  refineria(l) {
    const tank = (x, y, w, h) => R(x, y, w, h, CONC) + E(x + w / 2, y, w / 2, 2.6, '#bdb6a2') + L(x + 1.5, y + h * .4, x + w - 1.5, y + h * .4, K, .6);
    if (l === 1) return tank(16, 30, 26, 22) + L(16, 40, 42, 40, K, .6) + R(44, 40, 8, 12, STEEL) + L(42, 46, 44, 46, STEEL2, 2) + L(26, 30, 26, 24, K, 1.2) + R(22, 23, 8, 2, K);
    if (l === 2) return tank(6, 36, 18, 16) + tank(26, 38, 14, 14) + R(46, 14, 6, 38, STEEL) + E(49, 14, 3, 1.6, STEEL2) + [20, 27, 34, 41].map((y) => L(46, y, 52, y, K, .8)).join('')
      + L(24, 44, 46, 44, STEEL2, 2) + L(40, 46, 46, 46, STEEL2, 2) + R(54, 42, 6, 10, WALL2);
    return tank(4, 38, 16, 14) + tank(22, 36, 14, 16) + R(40, 18, 5, 34, STEEL) + E(42.5, 18, 2.5, 1.4, STEEL2) + [24, 30, 36, 42].map((y) => L(40, y, 45, y, K, .8)).join('')
      + R(50, 24, 4, 28, STEEL2) + L(52, 24, 52, 14, K, 1.4) + P('M52 15 C47 11 50 6 52 3 C54 6 57 11 52 15Z', AM) + P('M52 14 C50 12 51 9 52 8 C53 9 54 12 52 14Z', GO, 'stroke="none"')
      + L(20, 44, 40, 44, STEEL2, 2) + L(45, 46, 50, 46, STEEL2, 2) + R(56, 42, 6, 10, WALL2) + window_(58, 45, 2, 2) + NC(13, 40, .9, GO);
  },
  mina(l) {
    const pile = (x, y, s = 1) => P(`M${x} ${y} l${5 * s} ${-7 * s} l${4 * s} ${-3 * s} l${5 * s} ${4 * s} l${4 * s} ${6 * s}z`, '#7d6a58') + NC(x + 8 * s, y - 6 * s, 1, GO) + NC(x + 5 * s, y - 3 * s, 1, AM);
    if (l === 1) return E(26, 48, 15, 5, DARK) + E(26, 47, 11, 3.2, '#12100a') + L(14, 44, 14, 52, WOOD, 2.4) + L(38, 44, 38, 52, WOOD, 2.4) + L(14, 42, 38, 42, WOOD2, 2) + pile(40, 52, .9);
    if (l === 2) return P('M14 52 L26 18 L38 52', 'none', `stroke="${K}" stroke-width="3.2"`) + P('M14 52 L26 18 L38 52', 'none', `stroke="${WOOD}" stroke-width="1.8"`) + L(19, 38, 33, 38, WOOD, 1.8) + C(26, 15, 5, STEEL) + C(26, 15, 1.6, STEEL2) + L(26, 20, 26, 40, K, .8)
      + R(24, 40, 4, 4, WALL2) + pile(40, 52, 1) + R(44, 42, 12, 10, WALL2) + P('M43 42 L50 36 L57 42Z', ROOF);
    return P('M10 52 L22 16 L34 52', 'none', `stroke="${K}" stroke-width="3.2"`) + P('M10 52 L22 16 L34 52', 'none', `stroke="${WOOD}" stroke-width="1.8"`) + L(15, 36, 29, 36, WOOD, 1.8) + C(22, 13, 5, STEEL) + C(22, 13, 1.6, STEEL2)
      + L(22, 18, 22, 38, K, .8) + R(20, 38, 4, 4, WALL2) + L(34, 52, 62, 52, STEEL2, 1.6) + P('M40 46 h13 l-2 6 h-9z', STEEL) + NC(43, 44, 1.5, GO) + NC(48, 43, 1.8, AM) + NC(51, 44, 1.3, GO) + C(43, 53, 1.3, DARK) + C(50, 53, 1.3, DARK)
      + R(46, 26, 14, 14, WALL2) + P('M45 26 L53 19 L61 26Z', ROOF) + window_(52, 31) + pile(2, 52, .7);
  },
  granja(l) {
    const furrows = (x, w) => [0, 1, 2, 3].map((i) => L(x + i * 3, 52, x + 8 + i * 3, 44, '#4f5a2c', 1)).join('') ;
    const field = P('M24 52 L36 42 L62 42 L52 52Z', '#8b9a4c') + [0, 1, 2, 3, 4].map((i) => L(28 + i * 6, 52 - (i > 0 ? 0 : 0), 38 + i * 5.5, 42.5, '#5f6c32', 1)).join('');
    const hut = (x) => R(x, 36, 18, 16, '#b3a387') + P(`M${x - 2} 37 L${x + 9} 27 L${x + 20} 37Z`, ROOF) + R(x + 6, 43, 6, 9, DARK) + window_(x + 2, 40, 3, 3) + window_(x + 13, 40, 3, 3);
    const silo = (x, h) => R(x, 52 - h, 9, h, '#b9b3a0') + P(`M${x - 0.5} ${52 - h} Q${x + 4.5} ${52 - h - 8} ${x + 9.5} ${52 - h}Z`, STEEL) + L(x, 52 - h * .55, x + 9, 52 - h * .55, K, .6) + L(x, 52 - h * .25, x + 9, 52 - h * .25, K, .6);
    if (l === 1) return field + hut(4);
    if (l === 2) return field + hut(3) + silo(48, 28);
    return P('M20 52 L30 44 L48 44 L40 52Z', '#8b9a4c') + hut(2) + silo(40, 30) + silo(50, 24)
      + R(23, 45, 12, 5, RU) + R(31, 40, 5, 6, RU) + C(26, 52, 3.4, DARK) + C(34, 52, 2.2, DARK) + L(34, 40, 34, 37, K, 1);
  },
  lab(l) {
    const dome = (x, y, r) => P(`M${x - r} ${y} A${r} ${r} 0 0 1 ${x + r} ${y}Z`, '#b9d0d6') + L(x, y - r, x, y, K, .6) + NP(`M${x - r * .6} ${y - r * .55} q${r * .3} ${-r * .3} ${r * .6} ${-r * .3}`, 'none', 'stroke="#fff" stroke-width="1" opacity=".7"');
    if (l === 1) return R(18, 38, 26, 14, CONC) + R(16, 35, 30, 4, WALL2) + window_(22, 43) + window_(36, 43) + R(29, 43, 5, 9, DARK)
      + L(40, 35, 40, 18, K, 1.2) + L(36, 22, 44, 22, K, 1.2) + L(37.5, 26, 42.5, 26, K, 1) + NC(40, 17, 1.4, RU);
    if (l === 2) return R(8, 32, 38, 20, CONC) + R(6, 29, 42, 4, WALL2) + dome(27, 29, 10) + window_(12, 38) + window_(18, 38) + window_(36, 38) + window_(42, 38) + R(24, 41, 6, 11, DARK)
      + L(54, 52, 54, 24, K, 1.2) + L(50, 30, 58, 30, K, 1.2) + L(51.5, 35, 56.5, 35, K, 1) + NC(54, 23, 1.4, RU);
    return R(4, 36, 24, 16, CONC) + R(2, 33, 28, 4, WALL2) + dome(16, 33, 8) + window_(8, 41) + window_(22, 41) + R(13, 43, 5, 9, DARK)
      + R(30, 28, 14, 24, '#b0a994') + R(28, 25, 18, 4, WALL2) + window_(33, 33) + window_(39, 33) + window_(33, 40) + window_(39, 40) + dome(37, 25, 6)
      + R(50, 36, 3, 16, STEEL2) + P('M44 28 Q54 18 62 30 L53 33Z', STEEL) + L(53, 33, 53, 37, K, 1.2) + NC(50, 26, 1.2, RU) + NC(10, 38, 1, GO);
  },
  ferrocarril(l) {
    if (l >= 2) l = 3;
    const track = (y, sc = 1) => [4, 10, 16, 22, 28, 34, 40, 46, 52, 58].map((x) => R(x - 1.2, y - 2.2 * sc, 2.4, 5.4 * sc, WOOD2, 'stroke-width=".6"')).join('')
      + L(1, y - 1.2 * sc, 63, y - 1.2 * sc, '#b8bcc0', 1.4) + L(1, y + 2.2 * sc, 63, y + 2.2 * sc, '#b8bcc0', 1.4);
    if (l === 1) return P('M0 46 H64 V58 H0Z', '#5f5640', 'stroke="none"') + track(50) + P('M0 44 Q20 38 40 42 T64 40', 'none', `stroke="${GRASS}" stroke-width="3"`);
    if (l === 99) return P('M0 50 H64 V58 H0Z', '#5f5640', 'stroke="none"') + track(54) + R(8, 30, 30, 16, '#b3a387') + P('M5 31 L23 21 L41 31Z', ROOF) + R(12, 36, 6, 10, DARK) + window_(22, 36) + window_(29, 36) + R(5, 46, 36, 2.4, WALL2)
      + R(46, 22, 12, 4, STEEL2) + L(52, 26, 52, 46, K, 1.4) + L(50, 46, 54, 46, K, 1.4) + NC(52, 20, 1.5, GO);
    return P('M0 38 H64 V58 H0Z', '#5f5640', 'stroke="none"') + track(44, .9) + track(54, 1.05)
      + R(8, 30, 34, 10, '#5b6a8a') + R(36, 24, 14, 16, '#5b6a8a') + R(38, 26, 10, 5, SKY) + R(2, 28, 8, 12, STEEL2) + R(30, 18, 3, 10, STEEL2) + E(31.5, 18, 3, 1.5, SMOKE, 'stroke="none"') + NC(33, 13, 3, SMOKE, .7) + NC(36, 8, 3.5, SMOKE, .45)
      + C(14, 41, 2.6, DARK) + C(24, 41, 2.6, DARK) + C(34, 41, 2.6, DARK) + C(46, 41, 2.6, DARK) + NC(52, 33, 1.6, GO) + R(52, 36, 8, 4, STEEL2);
  },
  linea(l) {
    const bags = (x, y, n) => Array.from({ length: n }, (_, i) => E(x + i * 5, y, 3, 1.8, '#a8966e', 'stroke-width=".8"')).join('');
    const trench = P('M2 46 L14 40 L26 46 L38 40 L50 46 L62 40 L62 50 L50 56 L38 50 L26 56 L14 50 L2 56Z', '#3b3322') + NP('M2 46 L14 40 L26 46 L38 40 L50 46 L62 40', 'none', `stroke="${WOOD2}" stroke-width="2"`);
    if (l === 1) return trench + bags(6, 40, 2) + bags(30, 42, 2) + bags(48, 38, 2) ;
    if (l === 2) return trench + bags(6, 40, 2) + bags(30, 42, 2) + [8, 22, 36, 50].map((x) => L(x, 36, x, 28, WOOD2, 1.6)).join('')
      + NP('M4 31 q4 -6 8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t6 0', 'none', `stroke="${STEEL}" stroke-width="1.2"`) + NP('M4 35 q4 -5 8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t6 0', 'none', `stroke="${STEEL}" stroke-width="1"`);
    const bunker = (x, y, s) => P(`M${x} ${y} v${-8 * s} q${12 * s} ${-9 * s} ${24 * s} 0 v${8 * s}z`, CONC) + R(x + 5 * s, y - 10 * s, 14 * s, 2.4 * s, DARK) + bags(x - 3, y + 1, 2) + bags(x + 17 * s, y + 1, 2);
    return trench + bunker(4, 50, 1) + bunker(34, 46, 1) + NP('M2 56 q4 -4 8 0 t8 0', 'none', `stroke="${STEEL}" stroke-width="1"`) + L(30, 40, 30, 32, WOOD2, 1.6) + NP('M26 34 q3 -4 6 0 t6 0', 'none', `stroke="${STEEL}" stroke-width="1"`);
  },
  taller(l) {
    const chim = (x, y, h, w = 5) => R(x, y, w, h, BRICK) + R(x - 1, y, w + 2, 2.5, WALL2) + L(x + 1, y + 6, x + w - 1, y + 6, '#00000055', .6);
    const saw = (x, y, w, n = 3) => { const s = w / n; let d = `M${x} ${y}`; for (let i = 0; i < n; i++) d += ` l0 -5 l${s} 5`; return P(d + ` V${y + 1}H${x}Z`.replace(/V\d+H\d+Z/, 'z'), WALL2); };
    const crane = (x, y, h, len) => L(x, y, x, y - h, '#c9a23a', 2) + L(x - 2, y - h, x + len, y - h, '#c9a23a', 2) + L(x + len - 2, y - h, x + len - 2, y - h + 6, K, .8) + NC(x + len - 2, y - h + 7, 1.3, K);
    const gantry = (x1, x2, y) => L(x1, 52, x1, y, '#c9a23a', 2) + L(x2, 52, x2, y, '#c9a23a', 2) + L(x1 - 1, y, x2 + 1, y, '#c9a23a', 2.4) + L(x1 + 6, y, x1 + 6, y + 6, K, .8) + R(x1 + 4, y + 6, 5, 3, STEEL2, 'stroke-width=".7"');
    const belt = (x1, y1, x2, y2) => L(x1, y1, x2, y2, K, 3.4) + L(x1, y1, x2, y2, '#6a6d6e', 1.8) + L(x1, y1, x1, 52, WOOD2, 1) + L(x2, y2, x2, 52, WOOD2, 1) + [0.25, 0.5, 0.75].map((t) => NC(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t - 2, 1.3, '#2c281d')).join('');
    const tankC = (x, y, w, h) => R(x, y, w, h, '#b9b3a0') + E(x + w / 2, y, w / 2, 2, '#d3cdb8') + L(x, y + h * .4, x + w, y + h * .4, K, .5);
    if (l === 1) return R(12, 34, 32, 18, CONC) + P('M10 34 L28 24 L46 34Z', ROOF) + R(18, 41, 11, 11, DARK) + window_(33, 39) + window_(39, 39) + crane(52, 52, 24, -12) + R(50, 46, 6, 6, STEEL2);
    if (l === 2) return R(6, 36, 36, 16, CONC) + saw(6, 36, 36, 4) + R(11, 42, 10, 10, DARK) + window_(26, 40) + window_(32, 40) + window_(37, 40)
      + gantry(46, 60, 26) + R(48, 44, 10, 8, STEEL2) + L(2, 53, 62, 53, STEEL2, 1.4);
    if (l === 3) return R(4, 36, 28, 16, CONC) + saw(4, 36, 28, 3) + R(32, 30, 28, 22, '#b0a994') + P('M31 30 L46 22 L61 30Z', ROOF) + R(9, 43, 9, 9, DARK)
      + L(8, 22, 58, 22, '#c9a23a', 2.4) + L(8, 22, 8, 35, '#c9a23a', 2) + L(58, 22, 58, 31, '#c9a23a', 2) + L(40, 22, 40, 29, K, .9) + R(37, 29, 6, 4, STEEL2, 'stroke-width=".7"')
      + R(40, 42, 14, 10, DARK) + window_(36, 35) + window_(52, 35) + window_(23, 40);
    if (l === 4) return R(4, 36, 36, 16, BRICK) + saw(4, 36, 36, 3) + window_(9, 41) + window_(16, 41) + window_(23, 41) + R(30, 43, 8, 9, DARK)
      + chim(28, 12, 24) + smoke(30, 10, .8) + belt(42, 44, 58, 36) + tankC(54, 36, 8, 16) + L(2, 54, 62, 54, STEEL2, 1.6);
    if (l === 5) return R(2, 36, 24, 16, BRICK) + saw(2, 36, 24, 2) + R(26, 30, 22, 22, '#a8694f') + saw(26, 30, 22, 2) + window_(6, 41) + window_(14, 41) + window_(31, 38) + window_(39, 38) + R(11, 44, 7, 8, DARK)
      + chim(10, 10, 26) + chim(34, 8, 22) + smoke(12, 8, .7) + smoke(36, 6, .7) + belt(48, 42, 58, 34) + tankC(52, 34, 10, 18) + tankC(44, 40, 7, 12) + L(2, 54, 62, 54, STEEL2, 1.6) + L(26, 44, 48, 44, STEEL, 1.6);
    return R(2, 38, 22, 14, BRICK) + saw(2, 38, 22, 2) + R(24, 32, 20, 20, '#a8694f') + saw(24, 32, 20, 2) + chim(6, 12, 28, 4) + chim(14, 8, 32, 4) + chim(30, 10, 22, 5) + smoke(8, 10, .6) + smoke(16, 6, .6) + smoke(33, 8, .6)
      + P('M46 52 L49 30 Q54 27 59 30 L62 52Z', CONC) + E(54, 30, 5, 1.6, '#cfc9b4') + NC(56, 24, 3.4, SMOKE, .6) + NC(52, 19, 3, SMOKE, .4) + L(24, 20, 44, 20, '#c9a23a', 2.2) + L(44, 20, 44, 32, '#c9a23a', 2)
      + L(2, 54, 62, 54, STEEL2, 1.6) + window_(8, 43) + window_(15, 43) + window_(29, 40) + window_(37, 40) + R(40, 44, 5, 8, DARK) + NC(53, 40, 1, AM);
  },
  fuerte(l) {
    const cren = (x, y, w, c = WALL) => { let s = ''; for (let i = 0; i < w - 2; i += 5) s += R(x + i, y - 3, 3, 3, c); return s; };
    const tower = (x, y, w, h, c = WALL2) => R(x, y, w, h, c) + cren(x - 1, y, w + 2, c) + R(x + w / 2 - 1.5, y + 5, 3, 6, DARK);
    if (l === 1) return R(4, 38, 56, 14, WALL) + L(4, 45, 60, 45, WALL2, .8) + cren(4, 38, 56) + [8, 22, 38, 52].map((x) => L(x, 56, x + 1, 47, WOOD, 1.8) + P(`M${x - 1.2} 48 L${x + 1} 44 L${x + 3.2} 48Z`, WOOD, 'stroke-width=".6"')).join('');
    if (l === 2) return R(4, 38, 38, 14, WALL) + cren(4, 38, 38) + L(4, 45, 42, 45, WALL2, .8) + tower(40, 22, 16, 30) + R(18, 42, 8, 10, DARK) + P('M18 42 Q22 37 26 42', DARK) + L(48, 22, 48, 14, K, 1) + P('M48 14 l7 2 l-7 3z', RU);
    if (l === 3) return P('M32 12 L40 24 L58 26 L46 38 L52 54 L32 47 L12 54 L18 38 L6 26 L24 24Z', WALL) + P('M32 20 L37 28 L47 29 L40 36 L43 45 L32 41 L21 45 L24 36 L17 29 L27 28Z', '#6f7b44')
      + R(29, 30, 6, 7, WALL2) + flag(32, 30, RU) + L(32, 12, 32, 20, WALL2, .8) + L(58, 26, 47, 29, WALL2, .8) + L(6, 26, 17, 29, WALL2, .8);
    if (l === 4) return R(4, 36, 56, 16, WALL) + cren(4, 36, 56) + L(4, 44, 60, 44, WALL2, .8) + tower(2, 20, 14, 32) + tower(48, 20, 14, 32)
      + R(24, 28, 16, 24, WALL) + cren(23, 28, 18) + P('M28 52 V44 Q32 38 36 44 V52Z', DARK) + flag(32, 28, RU) + NC(9, 46, 1, GO) + NC(55, 46, 1, GO);
    return R(2, 42, 60, 12, WALL) + cren(2, 42, 60) + tower(0, 28, 12, 26) + tower(52, 28, 12, 26) + tower(18, 32, 9, 22) + tower(37, 32, 9, 22)
      + R(24, 14, 16, 40, WALL2) + cren(23, 14, 18) + R(27, 22, 10, 12, WALL) + P('M28 54 V46 Q32 40 36 46 V54Z', DARK) + R(30, 18, 4, 4, DARK) + flag(32, 14, RU) + flag(6, 28, GO) + flag(58, 28, GO) + NC(15, 48, 1, GO) + NC(49, 48, 1, GO);
  },
  aeropuerto(l) {
    const dashes = (x1, y1, x2, y2) => L(x1, y1, x2, y2, CR, 1.3, 'stroke-dasharray="3 3"');
    const tower = (x, y) => R(x, y - 18, 6, 18, CONC) + R(x - 2, y - 24, 10, 7, '#8a9ca2') + R(x - 3, y - 25, 12, 2.4, WALL2) + L(x + 3, y - 25, x + 3, y - 30, K, 1) + NC(x + 3, y - 31, 1.2, RU);
    const hangar = (x, y, w) => P(`M${x} ${y} V${y - 8} Q${x + w / 2} ${y - 17} ${x + w} ${y - 8} V${y}Z`, STEEL) + R(x + w * .25, y - 8, w * .5, 8, DARK, 'stroke-width=".8"');
    const plane = (x, y, s = 1) => P(`M${x} ${y} l${6 * s} ${-2 * s} l${12 * s} 0 l${3 * s} ${2 * s} l${-3 * s} ${2 * s} l${-12 * s} 0z`, '#c5c9c4') + P(`M${x + 8 * s} ${y - 1 * s} l${-3 * s} ${-9 * s} l${3 * s} 0 l${4 * s} ${9 * s}z`, '#a5aaa6') + P(`M${x + 8 * s} ${y + 3 * s} l${-3 * s} ${9 * s} l${3 * s} 0 l${4 * s} ${-9 * s}z`, '#a5aaa6');
    if (l === 1) return P('M26 28 L38 28 L60 56 L4 56Z', ASPH) + dashes(32, 54, 32, 30) + L(14, 54, 26, 36, CR, .9) + L(50, 54, 38, 36, CR, .9) + L(52, 52, 52, 36, WOOD2, 1.4) + P('M52 36 l8 1.5 l-8 3z', AM) + R(6, 40, 12, 8, CONC) + P('M5 40 L12 35 L19 40Z', ROOF);
    if (l === 2) return P('M30 30 L42 30 L62 56 L14 56Z', ASPH) + dashes(36, 54, 36, 32) + hangar(2, 52, 24) + tower(48, 38) + plane(30, 49, .7) + L(2, 52, 26, 52, STEEL2, 1.2);
    return P('M2 36 L30 28 L62 40 L62 48 L30 40 L2 46Z', ASPH) + P('M24 24 L34 24 L48 56 L10 56Z', '#66696d') + dashes(29, 54, 29, 27) + dashes(6, 42, 58, 43) + hangar(40, 56, 20) + hangar(2, 56, 20) + tower(46, 40) + plane(12, 47, .6) + plane(36, 38, .55);
  },
  puerto(l) {
    const sea = () => NR(0, 34, 64, 30, '#3d6a8a') + P('M0 40 q4 -3 8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0', 'none', 'stroke="#cfe3ea" stroke-width="1" opacity=".7" fill="none"') + P('M0 50 q4 -3 8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0', 'none', 'stroke="#cfe3ea" stroke-width="1" opacity=".5" fill="none"');
    const boat = (x, y) => P(`M${x} ${y} h16 l-3 6 h-10z`, '#7a4f3e') + R(x + 5, y - 5, 5, 5, CR) + L(x + 8, y - 5, x + 8, y - 11, K, 1) + P(`M${x + 8} ${y - 11} l5 2 l-5 2z`, RU);
    const container = (x, y, c) => R(x, y, 8, 5, c, 'stroke-width=".8"') + L(x + 2.7, y, x + 2.7, y + 5, '#00000066', .5) + L(x + 5.3, y, x + 5.3, y + 5, '#00000066', .5);
    if (l === 1) return sea() + R(2, 28, 60, 8, '#9a8a68') + L(2, 32, 62, 32, '#00000044', .6) + [10, 28, 46, 58].map((x) => R(x - 1.5, 24, 3, 4, STEEL2)).join('') + R(2, 36, 4, 18, WOOD2) + R(26, 36, 4, 18, WOOD2, 'opacity=".8"') + boat(32, 46) + R(8, 16, 12, 12, CONC) + P('M6 16 L14 10 L22 16Z', ROOF);
    return sea() + R(2, 30, 60, 6, '#9a8a68') + container(4, 22, RU) + container(4, 27, '#5b6a8a') + container(13, 25, OL) + container(13, 20, AM) + container(22, 25, '#5b6a8a')
      + L(36, 30, 36, 8, '#c9a23a', 2.4) + L(50, 30, 50, 8, '#c9a23a', 2.4) + L(34, 8, 62, 8, '#c9a23a', 2.6) + L(58, 8, 62, 12, '#c9a23a', 2) + L(42, 8, 42, 18, K, .8) + R(40, 18, 5, 4, STEEL2, 'stroke-width=".7"')
      + P('M24 44 h30 l4 -6 h4 l-4 12 h-34z', STEEL2) + R(36, 36, 10, 6, CR) + R(38, 32, 6, 4, CR) + L(41, 32, 41, 27, K, 1) + container(24, 38, RU) + container(31, 38, AM);
  },
  hospital(l) {
    const cross = (x, y, s, c = RU, ex = 'stroke-width=".7"') => R(x - s / 2, y - s * 1.5 / 2, s, s * 1.5, c, ex) + R(x - s * 1.5 / 2, y - s / 2, s * 1.5, s, c, ex);
    if (l === 1) return R(14, 32, 36, 20, '#d9d3bd') + R(12, 29, 40, 4, WALL2) + cross(32, 41, 6) + window_(18, 38) + window_(42, 38) + window_(18, 45, 3, 3) + R(28, 46, 8, 6, DARK) + L(46, 29, 46, 20, K, 1) + P('M46 20 l7 2 l-7 3z', '#d9d3bd');
    return R(20, 18, 24, 34, '#d9d3bd') + R(4, 32, 18, 20, '#cfc9b4') + R(42, 32, 18, 20, '#cfc9b4') + R(18, 15, 28, 4, WALL2) + R(2, 29, 22, 4, WALL2) + R(40, 29, 22, 4, WALL2)
      + cross(32, 27, 8) + [6, 12, 17].map((x) => window_(x, 37)).join('') + [45, 50, 55].map((x) => window_(x, 37)).join('') + [24, 36].map((x) => window_(x, 36)).join('') + R(27, 43, 10, 9, DARK)
      + R(46, 45, 12, 7, CR) + R(48, 43, 6, 3, CR) + R(52, 46, 4, 3, SKY) + C(49, 53, 1.6, DARK) + C(56, 53, 1.6, DARK) + cross(51, 49, 2, RU, 'stroke="none"');
  },
  radar(l) {
    const dish = (x, y, r, rot = -35) => `<g transform="rotate(${rot} ${x} ${y})">` + P(`M${x - r} ${y - r * .2} Q${x} ${y + r * .9} ${x + r} ${y - r * .2}Z`, '#cfd3d0') + L(x, y + r * .3, x, y - r * .8, K, 1) + NC(x, y - r * .9, 1.3, RU) + '</g>';
    if (l === 1) return R(26, 46, 12, 6, CONC) + P('M30 46 L32 32 L34 46Z', STEEL2) + L(32, 32, 32, 28, K, 1.6) + dish(32, 25, 11) + R(10, 42, 12, 10, WALL) + P('M9 42 L16 37 L23 42Z', ROOF) + window_(14, 45, 3, 3) + L(48, 52, 48, 34, K, 1.2) + L(44, 38, 52, 38, K, 1) + L(45.5, 43, 50.5, 43, K, 1);
    return R(6, 46, 52, 6, CONC) + P('M12 46 L16 26 L20 46Z', STEEL2) + dish(16, 22, 9, -30) + P('M40 46 L44 22 L48 46Z', STEEL2) + dish(44, 18, 12, -40) + R(24, 38, 12, 14, WALL) + P('M23 38 L30 33 L37 38Z', ROOF) + R(28, 43, 4, 9, DARK) + L(54, 46, 54, 30, K, 1.2) + NC(54, 28, 1.4, RU) + L(50, 34, 58, 34, K, 1);
  },
  capital(l) {
    return R(4, 44, 56, 8, CONC) + R(8, 52, 48, 3, WALL2) + R(10, 30, 44, 14, '#d9d3bd') + P('M8 30 H56 L32 21Z', WALL) + [14, 21, 28, 35, 42, 49].map((x) => R(x - 1.4, 32, 2.8, 12, '#efe8d2', 'stroke-width=".7"')).join('')
      + R(22, 16, 20, 6, '#cfc9b4') + P('M24 16 A8 9 0 0 1 40 16Z', '#c9a23a') + L(32, 7, 32, 1.5, K, 1) + P('M32 1.5 l8 2 l-8 3z', RU) + L(32, 8, 32, 16, K, .6) + R(28, 36, 8, 8, DARK) + P('M28 36 Q32 31 36 36', DARK)
      + [[6, 40], [58, 40]].map(([x, y]) => L(x, y, x, y - 12, K, 1) + P(`M${x} ${y - 12} l${x < 30 ? 6 : -6} 2 l${x < 30 ? -6 : 6} 3z`, GO)).join('') + NC(20, 24, 1, GO) + NC(44, 24, 1, GO);
  },
  avenida(l) {
    const lamp = (x, y, s) => L(x, y, x, y - 14 * s, K, 2.2 * s) + L(x, y, x, y - 14 * s, '#8a8f93', 1.1 * s) + L(x, y - 14 * s, x + (x < 32 ? 3 : -3) * s, y - 14 * s, '#8a8f93', 1.1 * s) + NC(x + (x < 32 ? 3 : -3) * s, y - 13 * s, 1.5 * s, GO) + NC(x + (x < 32 ? 3 : -3) * s, y - 13 * s, 3 * s, GO, .3);
    return P('M0 56 L0 38 Q14 30 26 24 H38 Q50 30 64 38 V56Z', '#5c6a3a', 'stroke="none"') + P('M2 58 L26 18 L38 18 L62 58Z', ASPH) + P('M2 58 L5 58 L27 18 L26 18Z', CONC, 'stroke="none"') + P('M62 58 L59 58 L37 18 L38 18Z', CONC, 'stroke="none"')
      + [[32, 54, 3.4], [32, 44, 2.8], [32, 36, 2.2], [32, 29, 1.7], [32, 23, 1.2]].map(([x, y, w]) => R(x - w / 2, y - 2.6, w, 4.6, GO, 'stroke="none"')).join('')
      + lamp(11, 54, 1.15) + lamp(53, 54, 1.15) + lamp(22, 38, .8) + lamp(42, 38, .8) + R(44, 44, 8, 4, RU, 'stroke-width=".7"') + R(46, 42, 4, 2.4, SKY, 'stroke="none"');
  },
  labc(l) {
    const dome = (x, y, r) => P(`M${x - r} ${y} A${r} ${r} 0 0 1 ${x + r} ${y}Z`, '#b9d0d6') + L(x, y - r, x, y, K, .6) + NP(`M${x - r * .6} ${y - r * .55} q${r * .3} ${-r * .3} ${r * .6} ${-r * .3}`, 'none', 'stroke="#fff" stroke-width="1" opacity=".7"');
    const ant = (x, y, h) => L(x, y, x, y - h, K, 1.2) + L(x - 3, y - h + 4, x + 3, y - h + 4, K, 1) + L(x - 2, y - h + 8, x + 2, y - h + 8, K, 1) + NC(x, y - h - 1, 1.3, RU);
    if (l === 1) return R(10, 38, 36, 14, CONC) + R(8, 35, 40, 4, WALL2) + dome(28, 35, 9) + window_(14, 43) + window_(40, 43) + R(24, 43, 8, 9, DARK) + ant(54, 52, 30) + L(46, 46, 54, 46, K, .8);
    if (l === 2) return R(4, 38, 56, 14, CONC) + R(2, 35, 60, 4, WALL2) + dome(18, 35, 9) + dome(44, 35, 7) + window_(8, 44) + window_(28, 44) + window_(50, 44) + R(36, 43, 6, 9, DARK) + ant(58, 35, 28) + ant(8, 35, 20) + NC(31, 33, 1, AM);
    return R(2, 38, 60, 14, CONC) + R(0, 35, 64, 4, WALL2) + R(24, 22, 16, 16, '#b0a994') + R(22, 19, 20, 4, WALL2) + dome(32, 19, 7) + dome(12, 35, 8) + dome(52, 35, 8) + window_(27, 26) + window_(34, 26) + window_(6, 44) + window_(20, 44) + window_(42, 44) + window_(54, 44) + R(28, 43, 8, 9, DARK)
      + L(32, 12, 32, 3, K, 1.2) + L(28, 6, 36, 6, K, 1) + NC(32, 2, 1.3, RU) + P('M42 24 Q52 14 60 24 L51 27Z', STEEL) + L(51, 27, 51, 33, K, 1.2) + NC(32, 30, 1, AM);
  },
};

// ---------------------------------------------------------------- UNIDADES
// Las 24 unidades de ROSTER, dibujadas en 64×64 con fondo escénico (hierba, cielo o agua) y el color de acento
// ROSTER[kind].color en el vehículo / insignia. Las claves antiguas se resuelven con UNIT_ALIAS.
export const UNIT_ALIAS = { mot: 'mec', arm: 'tl', mtn: 'inf', mar: 'inf', air: 'caza', esp: 'elite' };
const NR = (x, y, w, h, f, x2 = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}" stroke="none" ${x2}/>`;
const WAVES = (y, c = '#d9e8ee', o = .8) => NP(`M0 ${y} q4 -3 8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0`, 'none', `stroke="${c}" stroke-width="1.1" opacity="${o}" fill="none"`);
const cloud = (x, y, s = 1, c = '#eef2f0', o = .92) => NC(x, y, 5 * s, c, o) + NC(x + 5 * s, y + 1 * s, 4 * s, c, o) + NC(x - 5 * s, y + 1.5 * s, 3.6 * s, c, o);
const sceneGrass = () => NR(0, 0, 64, 64, '#a9bcc0') + NR(0, 0, 64, 18, '#bccdcf', 'opacity=".7"') + P('M0 38 Q12 28 26 36 T50 32 T64 36 V64 H0Z', '#7d8c4c', 'stroke="none"') + P('M0 46 Q20 40 40 47 T64 44 V64 H0Z', '#66743a', 'stroke="none"')
  + P('M0 54 Q22 50 44 55 T64 53 V64 H0Z', '#566330', 'stroke="none"') + [[8, 50], [20, 58], [50, 52], [58, 60], [38, 59]].map(([x, y]) => L(x, y, x - 1.5, y - 4, '#8a9a54', 1) + L(x, y, x + 1.5, y - 4, '#8a9a54', 1)).join('');
const sceneSky = () => NR(0, 0, 64, 64, '#6f93ab') + NR(0, 36, 64, 28, '#9bbac6', 'opacity=".55"') + cloud(14, 14, .9, '#eef2f0', .85) + cloud(50, 52, 1, '#eef2f0', .8) + cloud(56, 22, .6, '#eef2f0', .7);
const sceneSea = () => NR(0, 0, 64, 64, '#a6bcc6') + NR(0, 0, 64, 16, '#c3d3d6', 'opacity=".7"') + NR(0, 38, 64, 26, '#3d6a8a') + NR(0, 38, 64, 3, '#6f9ab4', 'opacity=".7"') + WAVES(46) + WAVES(55, '#cfe3ea', .55) + cloud(48, 12, .7);
const man = (x, y, col, k = 1) => // soldado de pie con casco (x = centro, y = pies)
  R(x - 2.2 * k, y - 6 * k, 1.8 * k, 6 * k, '#3d3a2a') + R(x + 0.4 * k, y - 6 * k, 1.8 * k, 6 * k, '#3d3a2a') + R(x - 3 * k, y - 15 * k, 6 * k, 10 * k, col)
  + C(x, y - 18 * k, 2.8 * k, SKIN) + P(`M${x - 3.4 * k} ${y - 18 * k} a3.4 3.2 0 0 1 6.8 0z`, '#566038');
const rifle = (x, y, k) => L(x - 4 * k, y - 11 * k, x + 8 * k, y - 16 * k, K, 2.4 * k) + L(x - 4 * k, y - 11 * k, x + 8 * k, y - 16 * k, WOOD, 1.2 * k);
const wheel = (x, y, r) => C(x, y, r, DARK) + C(x, y, r * .45, CONC, 'stroke-width=".7"');
const trk = (x, y, w, h, n) => R(x, y, w, h, DARK, `rx="${h / 2}"`) + Array.from({ length: n }, (_, i) => C(x + h / 2 + i * ((w - h) / Math.max(1, n - 1)), y + h / 2, h * .34, STEEL2, 'stroke-width=".8"')).join('');
const muzzle = (x, y, s = 1) => P(`M${x} ${y - 6 * s} L${x + 2 * s} ${y - 2 * s} L${x + 6 * s} ${y - 4 * s} L${x + 3.5 * s} ${y} L${x + 7 * s} ${y + 3 * s} L${x + 2.5 * s} ${y + 2.5 * s} L${x + 1 * s} ${y + 6 * s} L${x - 1 * s} ${y + 2 * s} L${x - 5 * s} ${y + 3 * s} L${x - 2 * s} ${y}Z`, AM, 'stroke-width=".8"') + NC(x + 1, y, 2.4 * s, GO, 1);
// tanque genérico de perfil mirando a la derecha. o: x0 (izq), w, yb (suelo), h (alto de orugas), n ruedas, tw/th torreta, bl/bt cañón, dbl ruedas dobles, brake
function tank(a, o) {
  const ty = o.yb - o.h, hh = o.hh, tcx = o.x0 + o.w * .46;
  let s = R(o.x0, ty, o.w, o.h, DARK, `rx="${o.h * .45}"`);
  for (let i = 0; i < o.n; i++) {
    const x = o.x0 + o.r + 1.5 + i * ((o.w - 2 * o.r - 3) / (o.n - 1));
    s += o.dbl ? C(x - o.r * .5, o.yb - o.h / 2, o.r * .8, STEEL2, 'stroke-width=".8"') + C(x + o.r * .5, o.yb - o.h / 2, o.r * .8, STEEL, 'stroke-width=".8"') : C(x, o.yb - o.h / 2, o.r, STEEL2, 'stroke-width=".8"') + C(x, o.yb - o.h / 2, o.r * .4, CONC, 'stroke-width=".5"');
  }
  s += P(`M${o.x0 + 1} ${ty + 1} L${o.x0 + 5} ${ty - hh} H${o.x0 + o.w - 7} L${o.x0 + o.w - 1} ${ty + 1}Z`, a);
  s += NR(o.x0 + 5, ty - hh, o.w - 12, hh * .3, '#fff', 'opacity=".12"') + NR(o.x0 + 3, ty - 2.5, o.w - 6, 2.5, '#000', 'opacity=".2"');
  s += R(tcx + o.tw * .5 - 1, ty - hh - o.th * .55 - o.bt / 2, o.bl, o.bt, STEEL2);
  if (o.brake) s += R(tcx + o.tw * .5 - 1 + o.bl - 1.5, ty - hh - o.th * .55 - o.bt / 2 - 1.2, 5, o.bt + 2.4, STEEL2);
  s += P(`M${tcx - o.tw / 2 - 2} ${ty - hh} L${tcx - o.tw / 2} ${ty - hh - o.th} H${tcx + o.tw / 2} L${tcx + o.tw / 2 + 2} ${ty - hh}Z`, a) + NR(tcx - o.tw / 2, ty - hh - o.th, o.tw, 2, '#fff', 'opacity=".14"');
  s += C(tcx - o.tw * .1, ty - hh - o.th - 0.5, Math.max(1.6, o.tw * .13), WALL2) + L(tcx - o.tw * .1, ty - hh - o.th - 1, tcx - o.tw * .1, ty - hh - o.th - 5, K, 1);
  return s;
}
function halftrack(a, gun) { // semioruga: orugas traseras + rueda delantera
  return trk(6, 44, 30, 10, 4) + wheel(48, 49, 5.2) + P('M5 44 L8 30 H36 L38 44Z', a) + P('M36 44 L36 34 H50 L57 40 V47 H52 V44Z', a) + R(40, 31, 4, 5, SKY, 'stroke-width=".8"') + NR(8, 30, 28, 3, '#fff', 'opacity=".14"') + R(53, 41, 5, 3, STEEL2, 'stroke-width=".7"') + (gun || '');
}
function wing(x, y, s = 1, col = '#aeb4ae') { return P(`M${x} ${y} l${-8 * s} ${-20 * s} l${5 * s} 0 l${8 * s} ${20 * s}z`, col); }
const UDRAW = {
  explo(a) {
    const x = 32, y = 58, k = 1.75;
    return sceneGrass() + GROUND + man(x, y, a, k) + L(x - 3 * k, y - 14 * k, x - 3, y - 18 * k, a, 3) + L(x + 3 * k, y - 14 * k, x + 3, y - 18 * k, a, 3)
      + R(x - 6.4, y - 18 * k - 2.8, 5.8, 5.4, '#2c281d') + R(x + .6, y - 18 * k - 2.8, 5.8, 5.4, '#2c281d') + C(x - 3.5, y - 18 * k - 0.2, 1.7, '#7fb6c4', 'stroke-width=".6"') + C(x + 3.5, y - 18 * k - 0.2, 1.7, '#7fb6c4', 'stroke-width=".6"') + R(x - .8, y - 18 * k - 1.4, 1.6, 3, STEEL2, 'stroke-width=".5"')
      + P('M44 52 q3 -7 7 -2 q4 -5 7 2z', '#4f6a34') + P('M2 54 q3 -6 7 -1 q3 -4 6 1z', '#4f6a34');
  },
  inf(a) {
    return sceneGrass() + GROUND + man(15, 50, a, 1.15) + rifle(15, 50, 1.15) + man(49, 50, a, 1.15) + rifle(49, 50, 1.15) + man(32, 58, a, 1.45) + rifle(32, 58, 1.45)
      + P('M2 52 q3 -6 7 -1 q3 -4 6 1z', '#4f6a34');
  },
  mec(a) {
    const heads = [14, 23, 32].map((x) => R(x - 3, 25, 6, 6, '#3d3a2a', 'stroke-width=".7"') + C(x, 22, 2.6, SKIN) + P(`M${x - 3.2} 22 a3.2 3 0 0 1 6.4 0z`, '#566038')).join('');
    return sceneGrass() + GROUND + heads + halftrack(a) + L(30, 28, 38, 22, K, 1.8) + R(36, 21, 4, 2.4, STEEL2, 'stroke-width=".6"') + R(8, 36, 26, 2, '#00000033', 'stroke="none"');
  },
  elite(a) {
    return NR(0, 0, 64, 64, '#5b6b3a') + P('M0 0 H64 V26 Q40 32 20 24 Q8 20 0 26Z', '#6b7a45', 'stroke="none"') + P('M0 64 V40 Q22 34 44 42 T64 38 V64Z', '#4f5a2f', 'stroke="none"') + NC(10, 12, 5, '#7b8a4a', .55) + NC(54, 40, 7, '#6b5a45', .5)
      + man(10, 62, '#4a5530', 1.15) + man(54, 62, '#4a5530', 1.15)
      + P('M9 64 Q9 47 32 44 Q55 47 55 64Z', '#3f4a28') + P('M12 64 Q13 52 32 49 Q51 52 52 64Z', '#4f5a2f', 'stroke="none"') + NP('M16 56 q4 -3 8 0 q-2 4 -6 4z M38 52 q5 -2 9 1 q-2 4 -7 3z', '#6b5a45', 'opacity=".7"')
      + R(27, 38, 10, 9, SKIN) + C(32, 29, 10.5, SKIN) + R(21.5, 28, 3, 4, '#c29a73', 'stroke-width=".6"') + R(39.5, 28, 3, 4, '#c29a73', 'stroke-width=".6"')
      + P('M20 27 Q19 11 35 13 Q49 13 45 27 Q42 21 32 21.5 Q24 21.5 20 27Z', '#a52f2f') + C(41, 12.5, 1.8, '#a52f2f') + C(24.5, 20, 3.4, GO, 'stroke-width=".8"') + P('M24.5 17.8 l.8 1.8 h1.9 l-1.5 1.2 .6 1.9 -1.8 -1.1 -1.8 1.1 .6 -1.9 -1.5 -1.2 h1.9z', '#a52f2f', 'stroke="none"')
      + C(28, 29.5, 1.3, K, 'stroke="none"') + C(36, 29.5, 1.3, K, 'stroke="none"') + L(28, 26.6, 31, 27.2, K, .9) + L(37, 26.6, 34, 27.2, K, .9) + L(29.5, 36, 34.5, 36, '#7a4f3e', 1.2) + L(32, 31, 31, 33.5, '#b88e68', .8)
      + R(19, 47, 6, 3, a, 'stroke-width=".6"') + C(48, 50, 3, GO, 'stroke-width=".8"');
  },
  apc(a) {
    return sceneGrass() + GROUND + P('M5 42 L10 30 H44 L52 38 H59 V47 H5Z', a) + NR(10, 30, 34, 3, '#fff', 'opacity=".14"') + R(20, 22, 15, 8, a) + R(34, 24.2, 13, 2.6, STEEL2) + R(46, 23.4, 3, 4.2, STEEL2) + C(26, 21, 2.2, WALL2) + R(44, 32, 9, 4, SKY, 'stroke-width=".8"') + R(14, 34, 5, 4, '#00000040', 'stroke="none"')
      + [14, 25, 39, 51].map((x) => wheel(x, 48, 5.6)).join('') + NR(5, 44, 54, 1.5, '#000', 'opacity=".25"');
  },
  at(a) {
    const gun = P('M10 30 L16 18 H24 L26 30Z', STEEL) + R(22, 21, 38, 3.6, STEEL2) + R(56, 19.8, 5, 6, STEEL2) + R(12, 24, 12, 8, a) + C(18, 28, 2.4, WALL2) + P('M8 30 L14 14 L18 14 L14 30Z', STEEL2, 'opacity=".9"');
    return sceneGrass() + GROUND + halftrack(a, '') + gun + R(6, 26, 8, 3, WALL2, 'stroke-width=".7"');
  },
  tl(a) { return sceneGrass() + GROUND + tank(a, { x0: 12, w: 38, yb: 54, h: 9, hh: 7, n: 4, r: 3.1, tw: 12, th: 7, bl: 14, bt: 2.2 }); },
  tm(a) { return sceneGrass() + GROUND + tank(a, { x0: 5, w: 48, yb: 54, h: 11, hh: 9, n: 5, r: 3.8, tw: 18, th: 9, bl: 20, bt: 3.2 }); },
  tp(a) { return sceneGrass() + GROUND + tank(a, { x0: 1, w: 50, yb: 55, h: 15, hh: 11, n: 4, r: 5.2, tw: 22, th: 12, bl: 24, bt: 4.4, dbl: true, brake: true }) + R(3, 40, 46, 3, STEEL2, 'stroke-width=".7"'); },
  art(a) {
    return sceneGrass() + GROUND + P('M14 52 L40 38 L42 42 L18 56Z', WOOD2) + P('M14 52 L2 56 L6 58 L18 56Z', WOOD2) + R(10, 26, 36, 7, STEEL, 'transform="rotate(-24 28 30)"') + R(40, 14, 12, 5.6, STEEL2, 'transform="rotate(-24 46 17)"') + P('M24 34 L32 40 L28 46 L20 40Z', a)
      + C(26, 50, 8.5, DARK) + C(26, 50, 6, '#6b5a45') + C(26, 50, 2.2, CONC) + [0, 45, 90, 135].map((r) => L(26, 50, 26, 43.5, DARK, .9, `transform="rotate(${r} 26 50)"`) + L(26, 50, 26, 56.5, DARK, .9, `transform="rotate(${r} 26 50)"`)).join('')
      + muzzle(55, 10, 1.1) + man(46, 56, '#6a7a44', .85) + R(40, 50, 5, 5, '#7a6f45', 'stroke-width=".6"');
  },
  cfort(a) {
    const cren = Array.from({ length: 7 }, (_, i) => R(2 + i * 9, 30, 6, 6, WALL)).join('');
    return sceneGrass() + R(0, 36, 64, 20, WALL) + cren + L(0, 44, 64, 44, WALL2, .8) + L(0, 51, 64, 51, WALL2, .8) + [8, 24, 40, 56].map((x) => L(x, 36, x, 44, WALL2, .7)).join('') + [16, 32, 48].map((x) => L(x, 44, x, 51, WALL2, .7)).join('') + NR(0, 56, 64, 8, '#566330')
      + P('M12 34 L16 26 H30 L34 34Z', '#6a6250') + R(14, 20, 20, 9, a, 'rx="2"') + R(30, 21, 30, 6.4, STEEL2) + R(57, 19.8, 5, 8.8, STEEL2) + C(22, 24.5, 2.4, WALL2) + muzzle(60, 12, .7) + R(40, 24, 3, 6, STEEL, 'stroke-width=".6"');
  },
  cnav(a) {
    return sceneSea() + P('M0 40 L12 34 H40 L50 40 V50 H0Z', '#9a937c') + P('M0 50 L0 64 H34 L42 50Z', '#6a6250') + WAVES(56, '#cfe3ea', .6) + R(8, 32, 26, 6, CONC) + R(14, 22, 16, 11, a, 'rx="3"') + R(26, 24, 30, 5.6, STEEL2) + R(53, 23, 5, 7.6, STEEL2) + C(21, 27, 2.6, WALL2) + muzzle(61, 18, .7)
      + P('M46 46 q4 -3 8 0 t8 0', 'none', 'stroke="#fff" stroke-width="1.4" fill="none"') + NP('M42 44 q3 -5 6 -2 q-1 -5 5 -4 q2 3 -1 6z', '#e8f0f0', 'opacity=".8"');
  },
  misil(a) {
    return sceneGrass() + GROUND + R(8, 42, 46, 8, a) + R(46, 34, 12, 10, a) + R(50, 36, 6, 4, SKY, 'stroke-width=".7"') + wheel(14, 52, 4.6) + wheel(30, 52, 4.6) + wheel(48, 52, 4.6)
      + `<g transform="rotate(-32 22 42)">` + R(8, 36, 40, 5, STEEL2) + R(4, 30, 42, 7.4, '#cfd0c4') + P('M46 30 L58 33.7 L46 37.4Z', RU) + R(12, 30, 3, 7.4, RU, 'stroke-width=".6"') + P('M4 30 L-1 27 V40.4 L4 37.4Z', STEEL2) + '</g>'
      + P('M2 54 q-3 -6 4 -9 q-1 6 5 6z', AM, 'stroke-width=".7"') + NC(6, 51, 2, GO) + NC(2, 56, 4, SMOKE, .7) + NC(8, 60, 3, SMOKE, .55);
  },
  caza(a) {
    return sceneSky() + P('M32 4 L35 18 L58 44 L58 48 L38 42 L38 54 L44 58 L44 61 L32 58 L20 61 L20 58 L26 54 L26 42 L6 48 L6 44 L29 18Z', '#aeb4ae') + P('M32 4 L35 18 L58 44 L58 48 L38 42 L38 30 L32 20Z', '#000', 'stroke="none" opacity=".14"')
      + P('M32 8 Q35 18 34 30 L32 34 L30 30 Q29 18 32 8Z', a, 'stroke-width=".9"') + P('M32 12 Q34.5 16 33.5 22 L32 24 L30.5 22 Q29.5 16 32 12Z', '#9fd0e0') + L(32, 4, 32, 0.5, K, 1.2)
      + R(30, 54, 4, 5, '#3a3a3a', 'stroke-width=".7"') + P('M30.5 59 l1.5 5 l1.5 -5z', AM, 'stroke="none"') + C(48, 42, 1.8, a, 'stroke-width=".6"') + C(16, 42, 1.8, a, 'stroke-width=".6"');
  },
  bestr(a) {
    const eng = (x, y) => R(x - 2.6, y - 4, 5.2, 12, STEEL2) + R(x - 2.6, y - 5, 5.2, 2, '#cfd0c4') + L(x - 4.5, y - 6, x + 4.5, y - 6, '#1a1710', .9);
    return sceneSky() + P('M2 28 L26 24 L30 8 L34 8 L38 24 L62 28 L62 34 L38 33 L36 52 L46 56 L46 60 L32 58 L18 60 L18 56 L28 52 L26 33 L2 34Z', '#aeb4ae') + P('M2 31 L62 31', 'none', `stroke="${a}" stroke-width="2.2" fill="none"`)
      + eng(11, 27) + eng(21, 26) + eng(43, 26) + eng(53, 27) + P('M32 4 Q34.4 8 34 16 L34 52 L30 52 L30 16 Q29.6 8 32 4Z', '#c5c9c4') + P('M31 7 q1 -1.5 2 0 l-.5 3 h-1z', '#9fd0e0', 'stroke-width=".5"') + C(14, 30, 1.4, RU, 'stroke="none"') + C(50, 30, 1.4, RU, 'stroke="none"');
  },
  bomb(a) {
    const bombs = [[16, 46], [28, 52], [40, 46]].map(([x, y]) => P(`M${x} ${y} q3 -4 6 0 v5 q-3 3 -6 0z`, '#3a3f35', 'stroke-width=".8"') + P(`M${x + 1} ${y - 4} l-1.4 -4 h1.4 l1.6 4z M${x + 5} ${y - 4} l1.4 -4 h-1.4 l-1.6 4z`, STEEL2, 'stroke-width=".5"') + L(x + 3, y, x + 3, y - 4, STEEL, .6)).join('');
    return sceneSky() + P('M4 22 H48 Q58 22 62 25 Q58 29 48 29 H4Z', '#aeb4ae') + P('M4 22 L2 14 H8 L12 22Z', '#aeb4ae') + P('M20 26 L10 36 H18 L32 27Z', '#8f948f') + P('M22 22 L12 12 H20 L36 22Z', '#c5c9c4') + R(44, 20.6, 8, 4, '#9fd0e0', 'rx="1.5" stroke-width=".7"') + R(18, 24, 12, 3, a, 'stroke="none"')
      + R(25, 29, 3, 6, STEEL2) + R(30, 29, 3, 6, STEEL2) + L(22, 35, 36, 35, K, 1.4, 'stroke-dasharray="1 2"') + C(26.5, 36, 1.2, K, 'stroke="none"') + bombs;
  },
  bpes(a) {
    const eng = (x) => R(x - 2.8, 22, 5.6, 14, STEEL2) + L(x - 5, 21, x + 5, 21, K, .9);
    return sceneSky() + P('M2 22 L30 20 L32 6 L36 6 L38 20 L62 22 L62 28 L38 27 L36 40 L44 44 L44 48 L32 46 L20 48 L20 44 L28 40 L30 27 L2 28Z', '#aeb4ae') + eng(10) + eng(20) + eng(44) + eng(54) + P('M32 3 Q35 6 35 12 L35 40 L29 40 L29 12 Q29 6 32 3Z', '#c5c9c4') + P('M31 6 q1.5 -2 3 0 l-.5 3 h-2z', '#9fd0e0', 'stroke-width=".5"')
      + P('M24 44 Q24 40 32 40 Q40 40 40 44 V58 Q32 64 24 58Z', '#3a3f35') + R(24, 47, 16, 4, GO, 'stroke-width=".6"') + C(32, 49, 1.6, K, 'stroke="none"') + P('M32 49 l-3 -4.6 h6z', K, 'stroke="none"') + P('M24 44 Q32 38 40 44', 'none', `stroke="${a}" stroke-width="2.4" fill="none"`) + L(27, 36, 27, 40, K, .8) + L(37, 36, 37, 40, K, .8);
  },
  heli(a) {
    return sceneSky() + L(4, 17, 52, 17, K, 3.4) + L(4, 17, 52, 17, '#2c281d', 1.6, 'opacity=".9"') + NP('M10 17 h38', 'none', 'stroke="#fff" stroke-width="6" opacity=".16"') + L(28, 17, 28, 23, STEEL2, 2)
      + P('M30 24 Q44 24 46 34 V36 H30Z', a) + P('M10 28 Q10 24 20 24 H30 V42 H18 Q10 42 10 34Z', a) + P('M16 28 Q16 26 20 26 H26 V36 H16Z', '#9fd0e0') + P('M44 28 H60 L62 24 L58 24 L56 29 L44 33Z', a) + NP('M60 22 a4 4 0 1 0 .1 0z', 'none', `stroke="${K}" stroke-width=".8" opacity=".7" fill="none"`) + L(58, 22, 62, 30, K, 1.4)
      + L(12, 46, 44, 46, K, 2.4) + L(14, 42, 14, 46, K, 1.6) + L(38, 42, 38, 46, K, 1.6) + L(10, 46, 8, 44, K, 1.6) + R(20, 40, 12, 3, STEEL2, 'stroke-width=".7"');
  },
  dexp(a) {
    const rot = (x, y) => E(x, y, 7, 2.4, '#9aa09a', 'opacity=".55" stroke-width=".7"') + C(x, y, 1.6, STEEL2);
    return sceneSky() + L(14, 18, 30, 32, K, 3) + L(50, 18, 34, 32, K, 3) + L(14, 46, 30, 34, K, 3) + L(50, 46, 34, 34, K, 3) + L(14, 18, 30, 32, '#6c737a', 1.4) + L(50, 18, 34, 32, '#6c737a', 1.4) + L(14, 46, 30, 34, '#6c737a', 1.4) + L(50, 46, 34, 34, '#6c737a', 1.4)
      + rot(14, 17) + rot(50, 17) + rot(14, 45) + rot(50, 45) + E(32, 33, 11, 8.5, a) + E(32, 31, 8, 4.5, '#fff', 'opacity=".14" stroke="none"') + C(32, 36, 5.6, '#2c281d') + C(32, 36, 3.4, '#7fb6c4', 'stroke-width=".6"') + C(32, 36, 1.4, K, 'stroke="none"') + NC(30.8, 34.8, .8, '#fff', .9);
  },
  dkam(a) {
    return sceneSky() + `<g transform="rotate(35 32 32)">` + P('M32 10 Q38 22 36 46 H28 Q26 22 32 10Z', '#cfd0c4') + P('M32 10 Q35 14 35 22 H29 Q29 14 32 10Z', RU) + P('M28 40 L16 52 L28 48Z', a) + P('M36 40 L48 52 L36 48Z', a) + P('M28 46 L26 54 H38 L36 46Z', STEEL2) + '</g>'
      + P('M44 4 L36 18 H43 L38 30 L52 12 H44 L48 4Z', GO, 'stroke-width=".9"') + NP('M50 38 q5 -4 8 2 q-2 5 -8 4z', AM, 'opacity=".9"') + NC(54, 41, 2, GO) + NC(14, 22, 2.4, SMOKE, .6);
  },
  dsen(a) {
    const rot = (x, y) => E(x, y, 6, 2, '#9aa09a', 'opacity=".55" stroke-width=".7"') + C(x, y, 1.4, STEEL2);
    const wave = (r, o) => NP(`M${32 - r * .8} ${32 - r * .6} A${r} ${r} 0 0 1 ${32 + r * .8} ${32 - r * .6}`, 'none', `stroke="${GO}" stroke-width="2" stroke-linecap="round" opacity="${o}" fill="none"`);
    return sceneSky() + wave(26, .5) + wave(19, .75) + wave(12, 1) + L(18, 44, 30, 51, K, 2.4) + L(46, 44, 34, 51, K, 2.4) + L(18, 44, 30, 51, '#6c737a', 1.2) + L(46, 44, 34, 51, '#6c737a', 1.2)
      + rot(18, 43) + rot(46, 43) + E(32, 50, 9, 6.4, a) + L(32, 44, 32, 36, K, 1.2) + C(32, 34.5, 2, RU) + P('M28 53 L36 53 L34 58 H30Z', STEEL2, 'stroke-width=".7"') + NC(22, 20, 1.6, GO, .9) + NC(42, 20, 1.6, GO, .9);
  },
  barco(a) {
    return sceneSea() + P('M2 44 H56 L62 38 L58 38 L54 42 H8 L6 38 H2Z', '#7c8790') + P('M6 42 H54 L50 49 H12Z', '#59636b') + R(6, 41.6, 50, 1.8, RU, 'stroke="none"')
      + R(20, 34, 18, 8, '#9aa3aa') + R(26, 28, 10, 7, '#aab2b8') + R(29, 24, 5, 4, '#aab2b8') + L(31.5, 24, 31.5, 12, K, 1.2) + L(27, 17, 36, 17, K, 1) + [22, 27, 32].map((x) => R(x, 36, 2.4, 2.4, SKY, 'stroke-width=".5"')).join('')
      + R(9, 36, 9, 6, '#8a949b') + R(8, 31.6, 9, 4.4, '#8a949b', 'rx="2"') + L(16, 33.5, 25, 31, STEEL2, 2.4) + R(42, 37, 9, 5, '#8a949b') + R(42, 33, 8, 4.4, '#8a949b', 'rx="2"') + L(49, 35, 58, 33, STEEL2, 2.4) + WAVES(50, '#fff', .9) + P('M0 52 L14 50 L20 54 L64 52 V64 H0Z', '#3d6a8a', 'stroke="none" opacity=".9"') + WAVES(57, '#cfe3ea', .5);
  },
  sub(a) {
    return NR(0, 0, 64, 64, '#a6bcc6') + NR(0, 0, 64, 12, '#c3d3d6', 'opacity=".7"') + NR(0, 26, 64, 38, '#2f5a7a') + NR(0, 40, 64, 24, '#1d3f5a', 'opacity=".8"') + NR(0, 26, 64, 2.4, '#8fb4c8', 'opacity=".8"') + WAVES(26, '#e3f0f4', .9)
      + L(26, 16, 26, 36, K, 3) + L(26, 16, 26, 36, '#59636b', 1.6) + L(22, 16, 28, 16, K, 3.2) + L(22, 16, 28, 16, '#59636b', 1.6) + NC(21, 16, 1.4, RU) + P('M16 26 q4 -2 8 0 t8 0', 'none', 'stroke="#fff" stroke-width="1.2" fill="none"')
      + E(32, 44, 28, 8.4, '#59636b') + E(32, 41, 24, 3, '#fff', 'opacity=".14" stroke="none"') + P('M23 40 Q23 32 29 32 H35 Q39 32 39 40Z', '#6c737a') + R(25, 33, 3, 2.4, SKY, 'stroke-width=".5"')
      + P('M60 40 L64 33 V46 L60 48Z', '#4a545c') + P('M4 44 L-1 38 V50Z', '#4a545c') + C(14, 43.5, 1.2, SKY, 'stroke-width=".5"') + C(20, 44.6, 1.2, SKY, 'stroke-width=".5"') + R(30, 43, 20, 1.6, a, 'stroke="none" opacity=".8"')
      + NC(10, 54, 1.6, '#cfe3ea', .7) + NC(14, 58, 1.1, '#cfe3ea', .6) + NC(52, 56, 1.8, '#cfe3ea', .7) + NC(56, 52, 1.1, '#cfe3ea', .6);
  },
  porta(a) {
    return sceneSea() + P('M2 42 L10 52 H52 L62 42Z', '#59636b') + P('M2 42 H62 L58 38 H6Z', '#7c8790') + R(2, 36, 60, 3.6, '#6a7078') + L(8, 37.8, 56, 37.8, CR, .9, 'stroke-dasharray="4 3"') + R(40, 22, 11, 14, '#8a949b') + R(42, 18, 8, 5, '#aab2b8') + L(46, 18, 46, 8, K, 1.2) + L(42, 12, 50, 12, K, 1) + R(43, 25, 2.4, 2.4, SKY, 'stroke-width=".5"') + R(47, 25, 2.4, 2.4, SKY, 'stroke-width=".5"') + R(40, 31, 11, 2, a, 'stroke="none"')
      + P('M10 34 l2 -2 h9 l3 2z', '#c5c9c4') + P('M13 34 l-2 -6 h2.4 l3.6 6z', '#a5aaa6') + P('M16 34 l3 -5 h2 l-1 5z', '#a5aaa6', 'stroke-width=".6"') + R(8, 34, 4, 1.6, RU, 'stroke="none"') + P('M26 36 l2 -1.6 h6 l2 1.6z', '#c5c9c4') + WAVES(53, '#fff', .9) + P('M0 54 L14 52 L20 56 L64 54 V64 H0Z', '#3d6a8a', 'stroke="none" opacity=".9"') + WAVES(59, '#cfe3ea', .5);
  },
};
export const UNIT_KINDS = Object.keys(UDRAW);

// ---------------------------------------------------------------- ESTADOS (iconos pequeños de unidad)
const SDRAW = {
  carga: () => R(4, 26, 56, 18, '#8a6a3a') + R(4, 26, 56, 4, '#a98650', 'stroke="none"') + [14, 26, 38, 50].map((x) => L(x, 26, x, 44, K, .8)).join('') + R(2, 44, 60, 3, STEEL2) + C(14, 51, 4.6, DARK) + C(14, 51, 1.8, CONC) + C(50, 51, 4.6, DARK) + C(50, 51, 1.8, CONC) + L(4, 36, 60, 36, K, .8) + R(0, 36, 6, 3, STEEL2) + R(58, 36, 6, 3, STEEL2) + P('M30 18 H34 V24 H38 L32 30 L26 24 H30Z', OL, 'stroke-width=".8"'),
  recarga: () => NP('M32 10 A22 22 0 1 1 11 38', 'none', `stroke="${K}" stroke-width="8" stroke-linecap="round" fill="none"`) + NP('M32 10 A22 22 0 1 1 11 38', 'none', `stroke="${GO}" stroke-width="5" stroke-linecap="round" fill="none"`)
    + P('M30 1 L42 10 L30 19Z', GO) + P('M32 24 C26 31 24 34 24 38 A8 8 0 0 0 40 38 C40 34 38 31 32 24Z', '#2b2a26') + NP('M28 38 Q28 34 31 31', 'none', 'stroke="#9a9a90" stroke-width="1.6" fill="none"'),
  marcha: () => [[18, 44, -14, 1], [40, 30, -8, 0], [20, 22, -4, 1], [44, 10, 6, 0]].map(([x, y, r, f]) => `<g transform="rotate(${r} ${x} ${y})">` + E(x, y, 5.2, 8.2, f ? OL : '#a3b366') + E(x - 3.2, y - 8.8, 1.2, 1.6, f ? OL : '#a3b366', 'stroke-width=".6"') + E(x, y - 10, 1.2, 1.6, f ? OL : '#a3b366', 'stroke-width=".6"') + E(x + 3.2, y - 8.8, 1.2, 1.6, f ? OL : '#a3b366', 'stroke-width=".6"') + '</g>').join('') + NP('M6 58 H58', 'none', 'stroke="#00000040" stroke-width="2"'),
  lista: () => C(32, 32, 26, '#4f7a4a') + C(32, 32, 26, 'none', `stroke="${GO}" stroke-width="2.4"`) + P('M17 33 L28 44 L48 20', 'none', 'stroke="#f2ecd8" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"'),
};
export const STATE_NAMES = Object.keys(SDRAW);


// ---------------------------------------------------------------- ACCIONES
// ---------------------------------------------------------------- ACCIONES
const gearPath = (cx, cy, r1, r2, n) => {
  let d = ''; for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2, r = i % 2 ? r1 : r2, a2 = a + Math.PI / (n * 2) * .0; d += (i ? 'L' : 'M') + (cx + Math.cos(a2) * r).toFixed(1) + ' ' + (cy + Math.sin(a2) * r).toFixed(1); } return d + 'Z';
};
const ADRAW = {
  attack: () => L(10, 50, 44, 14, K, 5) + L(10, 50, 44, 14, STEEL, 3) + L(54, 50, 20, 14, K, 5) + L(54, 50, 20, 14, '#b8bcc0', 3) + L(8, 48, 14, 54, GO, 3) + L(56, 48, 50, 54, GO, 3)
    + P('M32 22 L35 30 L43 28 L38 34 L44 40 L35 38 L32 46 L29 38 L20 40 L26 34 L21 28 L29 30Z', AM) + P('M32 28 L34 33 L38 34 L34 36 L32 40 L30 36 L26 34 L30 33Z', GO, 'stroke="none"'),
  move: () => P('M8 40 H34 V30 L54 46 L34 62 V52 H8Z', OL).replace('62', '58') + R(10, 12, 14, 18, '#7a5c3a') + R(10, 26, 22, 6, '#4a3a28') + P('M10 32 H32 V36 H10Z', DARK, 'stroke="none"'),
  defend: () => P('M32 8 L54 14 V32 Q54 48 32 58 Q10 48 10 32 V14Z', STEEL) + P('M32 8 L54 14 V32 Q54 48 32 58Z', STEEL2, 'stroke="none" opacity=".5"') + P('M32 16 L47 20 V32 Q47 43 32 50 Q17 43 17 32 V20Z', RU) + P('M32 24 l3 6 h6 l-5 4 2 7 -6 -4 -6 4 2 -7 -5 -4 h6z', GO)
    + E(14, 56, 8, 3.5, '#a8966e') + E(50, 56, 8, 3.5, '#a8966e') + E(32, 58, 8, 3.5, '#a8966e'),
  reorganize: () => P(gearPath(26, 26, 14, 10, 8), STEEL) + C(26, 26, 5.5, '#2c281d') + C(26, 26, 2, BR) + P('M30 62 L44 40 L58 62Z', OL) + P('M40 62 L44 52 L48 62Z', DARK) + L(44, 40, 44, 34, K, 1.2),
  front: () => P('M4 56 Q32 44 60 56 V62 H4Z', '#6a7a40') + L(26, 54, 26, 10, WOOD, 3) + P('M26 10 L52 17 L26 26Z', RU) + P('M26 10 L52 17 L26 17Z', '#b86a58', 'stroke="none"') + C(26, 9, 2.4, GO) + P('M20 54 L26 50 L32 54Z', '#9a8a68'),
  recruit: () => R(8, 8, 48, 50, CR) + R(8, 8, 48, 50, 'none', `stroke-width="2.4"`) + R(12, 12, 40, 6, RU) + C(32, 28, 5, '#8a7a5a') + P('M22 50 Q22 36 32 35 Q42 36 42 50Z', '#8a7a5a') + L(32, 14, 32, 17, K, 0)
    + R(14, 51, 36, 2.6, '#7a6f55', 'stroke="none"') + R(18, 55, 28, 1.8, '#7a6f55', 'stroke="none"') + R(10, 9, 3, 3, GO) + R(51, 9, 3, 3, GO),
  build: () => R(24, 52, 28, 6, STEEL2) + R(34, 18, 6, 36, AM) + L(34, 28, 40, 18, K, .8) + L(34, 38, 40, 28, K, .8) + L(34, 48, 40, 38, K, .8) + P('M20 22 H56 V16 H20Z', AM) + L(14, 16, 14, 22, K, 1) + L(16, 20, 54, 20, K, 0)
    + R(8, 22, 8, 7, STEEL2) + L(48, 22, 48, 36, K, 1.2) + R(44, 36, 8, 6, STEEL) + P('M10 38 H20 L22 54 H8Z', '#a89a64') + P('M20 16 L10 14', STEEL),
  research: () => P('M26 8 H38 V24 L52 50 Q55 58 46 58 H18 Q9 58 12 50 L26 24Z', '#c4dbe0', 'fill-opacity=".75"') + P('M17 42 H47 L52 52 Q54 57 46 57 H18 Q10 57 12 52Z', '#6aa88a') + R(24, 6, 16, 5, WALL2) + NC(28, 46, 2, '#d6efe0', .9) + NC(36, 50, 1.5, '#d6efe0', .9) + NC(33, 35, 1.8, '#e6e3d6', .8) + L(26, 24, 38, 24, K, .8),
  trade: () => L(32, 12, 32, 54, K, 4) + L(32, 12, 32, 54, BR, 2) + L(10, 20, 54, 20, K, 4) + L(10, 20, 54, 20, BR, 2) + C(32, 11, 3, GO) + P('M10 20 L4 38 H16Z', 'none', 'stroke-width="1"') + P('M2 38 Q10 46 18 38Z', BR) + P('M54 20 L48 38 H60Z', 'none', 'stroke-width="1"') + P('M46 38 Q54 46 62 38Z', BR)
    + R(22, 54, 20, 5, WALL2) + C(10, 33, 3, GO) + R(51, 31, 7, 5, '#a89a64'),
  spy: () => E(26, 44, 24, 4.5, '#2f2a20') + P('M12 44 Q10 22 26 20 Q42 22 40 44Z', '#3a3426') + R(14, 36, 24, 4, RU) + C(48, 40, 8, '#bfd8de', 'fill-opacity=".55" stroke-width="2"') + L(54, 46, 60, 56, K, 3.2) + L(54, 46, 60, 56, WOOD, 1.6) + R(22, 44, 8, 3, SKIN, 'stroke="none"'),
  war: () => C(18, 52, 8, DARK) + C(18, 52, 3, CONC) + R(14, 38, 30, 6, STEEL2) + P('M14 44 L8 52 H30 L44 44Z', WOOD) + P('M10 36 L46 26 L50 34 L14 44Z', STEEL, 'transform="translate(2 -2)"') + E(51, 31, 3.6, 5, STEEL2, 'transform="rotate(-18 51 31)"')
    + NC(58, 22, 5, AM, .95) + NC(56, 20, 2.6, GO, 1) + NC(60, 28, 2, RU, .9),
  peace: () => P('M10 40 Q8 28 20 24 Q22 14 34 18 Q44 20 44 28 Q56 28 58 38 Q50 36 46 40 Q38 52 24 50 Q14 50 10 40Z', CR) + P('M20 30 Q26 38 34 36 Q30 44 22 42Z', '#d8cfb4', 'stroke-width=".8"') + C(44, 24, 1.4, K, 'stroke="none"') + P('M44 28 L52 30 L44 32Z', AM)
    + NP('M6 56 Q24 50 34 56', 'none', `stroke="${OL}" stroke-width="2.4"`) + [[14, 53, -4], [22, 52, 4], [28, 54, -4]].map(([x, y, d]) => P(`M${x} ${y} q${d} -6 ${d * 2} -2 q${-d} 4 ${-d * 2} 2z`, OL, 'stroke-width=".8"')).join(''),
  alliance: () => P('M2 30 H14 L26 26 L38 30 L50 26 H62 V40 H50 L38 46 L26 42 L14 46 H2Z', '#8a7f68') + R(0, 28, 10, 18, OL) + R(54, 28, 10, 18, RU) + P('M14 30 L26 26 L36 32 L46 28 L52 32 V40 L44 46 L36 50 L26 46 L16 42Z', SKIN)
    + [[30, 34, 38, 38], [27, 38, 35, 42], [24, 42, 32, 46]].map(([a, b, c, d]) => L(a, b, c, d, '#a8845e', 1.4)).join('') + C(32, 14, 3, GO) + L(32, 17, 32, 24, GO, 1.2),
  surprise: () => NC(14, 18, 8, '#c9d2d6', .9) + NC(24, 15, 9, '#dde3e5', .9) + NC(52, 52, 9, '#c9d2d6', .9) + NC(42, 55, 8, '#dde3e5', .9) + P('M22 50 L50 12 L54 16 L26 56Z', '#c8ccd0') + P('M50 12 L54 16 L56 10Z', '#c8ccd0') + P('M18 54 L26 46 L30 50 L22 58Z', RU) + L(14, 60, 20, 54, GO, 2.6) + L(38, 33, 42, 37, K, .8),
  provoke: () => P('M8 28 H20 L46 12 V52 L20 40 H8Z', RU) + R(6, 28, 6, 12, WALL2) + P('M20 40 L24 56 H32 L28 42Z', WALL2) + P('M46 12 Q52 32 46 52', 'none', `stroke="${K}" stroke-width="1.2"`) + NP('M51 24 Q56 32 51 40M55 18 Q62 32 55 46', 'none', `stroke="${GO}" stroke-width="2"`),
  conquest: () => P('M0 58 Q14 30 32 30 Q50 30 64 58Z', '#6a7a40') + P('M10 58 Q20 40 32 40 Q44 40 54 58Z', '#7d8c4a', 'stroke="none"') + L(32, 31, 32, 6, WOOD, 3) + P('M32 6 L58 12 L32 22Z', RU) + P('M32 6 L58 12 L32 12Z', '#b86a58', 'stroke="none"') + C(32, 5, 2.4, GO) + P('M26 34 L38 34 L40 38 L24 38Z', '#9a8a68'),
  loot: () => R(8, 28, 48, 26, '#7a4f3e') + P('M8 28 Q8 12 32 12 Q56 12 56 28Z', '#935f48') + L(8, 38, 56, 38, K, 1.2) + R(26, 34, 12, 12, GO) + C(32, 40, 2, K) + R(14, 28, 4, 26, STEEL2) + R(46, 28, 4, 26, STEEL2)
    + C(20, 20, 2.6, GO) + C(30, 17, 2.6, AM) + C(42, 19, 2.6, GO) + NC(14, 12, 1.2, CR) + NC(52, 10, 1.4, CR),
};
export const ACTION_NAMES = Object.keys(ADRAW);

// ---------------------------------------------------------------- RECURSOS
const RDRAW = {
  petroleo: () => P('M32 6 C20 24 14 32 14 42 A18 16 0 0 0 50 42 C50 32 44 24 32 6Z', '#2b2a26') + NP('M22 40 Q22 32 28 26', 'none', 'stroke="#8a8a80" stroke-width="2.4" opacity=".8"') + NC(40, 46, 3, '#4a4a42', .8),
  gas: () => P('M32 6 C42 18 50 26 48 40 A16 16 0 0 1 16 40 C16 32 22 28 24 20 C28 24 28 28 30 28 C30 20 28 12 32 6Z', '#6aa6c8') + P('M32 26 C38 32 40 38 38 44 A7 7 0 0 1 26 44 C26 38 30 34 32 26Z', '#d9eef5', 'stroke-width=".8"') + R(18, 54, 28, 4, STEEL2),
  minerales: () => P('M6 56 L16 34 L26 40 L32 24 L44 38 L52 30 L60 56Z', '#7d7a70') + P('M18 56 L24 40 L34 38 L40 56Z', '#9a968a', 'stroke="none"') + P('M26 36 L32 24 L40 36 L32 42Z', '#7fb6c4') + P('M44 50 L48 40 L54 50Z', '#9bd0da') + P('M12 52 L16 44 L20 52Z', '#7fb6c4'),
  cobre: () => P('M10 52 L18 40 H46 L54 52Z', '#b86f3e') + P('M18 40 H46 L42 34 H22Z', '#d6925a') + P('M14 52 H50 V58 H10Z', '#8f5530') + P('M22 52 L28 44 H40 L44 52Z', '#d6925a', 'stroke-width=".8"') + P('M18 40 L10 52', 'none', 'stroke-width=".8"'),
  agro: () => L(32, 58, 32, 14, '#7a6a3a', 2) + [[0, 0], [1, 1]].map(() => '').join('') + [[32, 14, 0], [32, 22, -1], [32, 22, 1], [32, 31, -1], [32, 31, 1], [32, 40, -1], [32, 40, 1]].map(([x, y, s]) => s === 0 ? E(x, y, 3, 5.4, GO) : E(x + s * 6, y, 3, 5.4, GO, `transform="rotate(${s * 30} ${x + s * 6} ${y})"`)).join('') + P('M22 56 Q32 50 42 56', 'none', `stroke="${K}" stroke-width="1"`),
  madera: () => [[12, 44], [28, 44], [44, 44], [20, 32], [36, 32], [28, 20]].map(([x, y]) => R(x, y, 18, 11, '#9a6e44', 'rx="2"') + E(x + 18, y + 5.5, 3.4, 5.5, '#c9a874') + E(x + 18, y + 5.5, 1.4, 2.5, '#9a6e44', 'stroke-width=".5"')).join(''),
  food: () => E(32, 38, 24, 14, '#c58a46') + NP('M16 34 Q24 28 32 34 Q40 28 48 34', 'none', 'stroke="#e3b878" stroke-width="2"') + NP('M20 42 Q32 48 44 42', 'none', 'stroke="#8f5a2a" stroke-width="1.4"') + L(22, 32, 26, 40, '#8f5a2a', 1) + L(32, 28, 34, 38, '#8f5a2a', 1) + L(42, 32, 40, 40, '#8f5a2a', 1),
  fuel: () => P('M14 14 H42 L50 22 V56 H14Z', '#8f9a4a') + R(24, 8, 14, 6, STEEL2) + P('M42 14 L50 22 H42Z', '#b6c06a') + R(20, 24, 24, 26, 'none', 'stroke-width=".9" stroke-opacity=".6"') + P('M30 30 L26 40 H32 L30 48 L38 36 H32 L34 30Z', GO),
  goods: () => R(8, 34, 26, 22, '#b3875a') + R(34, 34, 22, 22, '#a07848') + R(18, 12, 26, 22, '#c19a68') + L(8, 45, 34, 45, K, .7) + L(21, 34, 21, 56, K, .7) + L(31, 12, 31, 34, '#8a6a42', 3) + R(24, 38, 6, 4, CR, 'stroke-width=".7"'),
  metal: () => P('M4 48 L12 38 H34 L26 48Z', '#9aa0a6') + R(4, 48, 22, 8, '#7a8086') + P('M26 48 L34 38 V46 L26 56Z', '#656b70') + P('M26 36 L34 26 H56 L48 36Z', '#b2b8be') + R(26, 36, 22, 8, '#8a9096') + P('M48 36 L56 26 V34 L48 44Z', '#6d7378') + P('M20 26 L28 16 H50 L42 26Z', '#c4cace') + R(20, 26, 22, 8, '#9aa0a6') + P('M42 26 L50 16 V24 L42 34Z', '#7a8086'),
};
export const RESOURCE_NAMES = Object.keys(RDRAW);

// ---------------------------------------------------------------- construcción de nodos (cacheados)
const cache = new Map();

function template(key, inner) {
  let t = cache.get(key);
  if (!t) {
    const holder = document.createElement('template');
    holder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB} ${VB}">${inner}</svg>`;
    t = holder.content.firstChild;
    cache.set(key, t);
  }
  return t;
}

function make(key, build, opts) {
  const o = opts || {};
  const svg = template(key, build()).cloneNode(true);
  const size = o.size || VB;
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('class', 'art' + (o.class ? ' ' + o.class : ''));
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', o.title || '');
  return svg;
}

/** Nivel máximo dibujable de `kind` (BUILD[kind].max, o 6 si el edificio no se conoce). */
const maxLevel = (kind) => (BUILD[kind] && BUILD[kind].max) || 6;

/** Cadena SVG (sin tocar el DOM) del edificio/unidad: para pruebas y galerías. */
export function __draw(kind, lv) {
  if (lv == null) return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' + unitInner(kind) + '</svg>';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' + buildingInner(kind, lv) + '</svg>';
}
function buildingInner(kind, level) {
  const lv = Math.max(0, Math.min(maxLevel(kind), Math.floor(level || 0)));
  const fn = BDRAW[kind];
  return !fn || lv === 0 ? plot() : GROUND + fn(lv);
}
function unitKey(kind) { const k = UDRAW[kind] ? kind : (UNIT_ALIAS[kind] || 'inf'); return UDRAW[k] ? k : 'inf'; }
function unitInner(kind) { const k = unitKey(kind); return UDRAW[k]((ROSTER[k] && ROSTER[k].color) || '#7b8a4a'); }

/** Edificio `kind` al nivel `level` (0..BUILD[kind].max; el taller llega a 6). */
export function artBuilding(kind, level, opts) {
  const lv = Math.max(0, Math.min(maxLevel(kind), Math.floor(level || 0)));
  return make('b:' + kind + ':' + lv, () => buildingInner(kind, lv), opts);
}

/** Unidad del tipo `kind` (las 24 de ROSTER; las claves antiguas se resuelven con UNIT_ALIAS). */
export function artUnit(kind, opts) {
  const k = unitKey(kind);
  return make('u:' + k, () => unitInner(k), opts);
}

/** Acción/escena `name`. */
export function artAction(name, opts) {
  const fn = ADRAW[name] || ADRAW.front;
  return make('a:' + (ADRAW[name] ? name : 'front'), fn, opts);
}

/** Recurso `res`. */
export function artResource(res, opts) {
  const fn = RDRAW[res] || RDRAW.goods;
  return make('r:' + (RDRAW[res] ? res : 'goods'), () => GROUND + fn(), opts);
}

/** Icono pequeño de estado de una unidad: 'carga' (vagón), 'recarga' (flecha circular + gota), 'marcha' (huellas), 'lista' (check). */
export function artState(st, opts) {
  const k = SDRAW[st] ? st : 'lista';
  return make('s:' + k, SDRAW[k], opts);
}
