// Ilustraciones dibujadas (SVG en línea) para edificios, unidades, acciones y recursos (Tanda 2, trabajador D).
// Cada función devuelve un elemento <svg> listo para insertar. Las ilustraciones de edificios EVOLUCIONAN con el
// nivel (0 = solar/plano, 1..3 = cada vez más grande y detallado). Paleta: variables CSS de main.css (--brass,
// --cream, --rust, --olive, --amber, --gold...) con colores de respaldo. Sin dependencias externas. Sin texto.
//
// API estable (otros módulos la usan; mantener firmas):
//   artBuilding(kind, level, opts) kind ∈ provinces.BUILD (base,fabrica,refineria,mina,granja,lab,carretera,ferrocarril,fuerte,linea)
//   artUnit(kind, opts)            kind ∈ units.UNIT_TYPES (inf,mot,arm,art,mtn,mar,air,esp)
//   artAction(name, opts)          name ∈ attack|move|defend|reorganize|front|recruit|build|research|trade|spy|war|peace|alliance|surprise|provoke|conquest|loot
//   artResource(res, opts)         res ∈ petroleo|gas|minerales|cobre|agro|madera|food|fuel|goods|metal
//   opts = { size: px (por defecto 64), class: string, title: string }
//
// Implementación: cada dibujo es una cadena de marcado SVG (barata de generar); se convierte UNA vez en un nodo
// plantilla (cacheado por clave) y cada llamada devuelve un clon. `document` solo se toca al dibujar, de modo que
// los datos (BUILDING_LEVEL_DESC...) pueden importarse en node sin DOM.

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
  DARK = '#2c281d', GRASS = '#6f7f44', SNOW = '#e6e3d6';

// ---- primitivas de dibujo (devuelven cadenas) ----
const ST = `stroke="${K}" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"`;
const R = (x, y, w, h, f, x2 = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}" ${ST} ${x2}/>`;
const P = (d, f, x2 = '') => `<path d="${d}" fill="${f}" ${ST} ${x2}/>`;
const C = (x, y, r, f, x2 = '') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${f}" ${ST} ${x2}/>`;
const E = (x, y, rx, ry, f, x2 = '') => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${f}" ${ST} ${x2}/>`;
const L = (x1, y1, x2, y2, col = K, w = 1.2, x3 = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${w}" stroke-linecap="round" ${x3}/>`;
const NP = (d, f, x2 = '') => `<path d="${d}" fill="${f}" stroke="none" ${x2}/>`;   // sin trazo
const NC = (x, y, r, f, o = 1) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${f}" opacity="${o}"/>`;
const GROUND = `<ellipse cx="32" cy="55" rx="27" ry="5" fill="${DARK}" opacity=".5"/><ellipse cx="32" cy="54" rx="26" ry="4.2" fill="#5c5238" opacity=".55"/>`;
const smoke = (x, y, s = 1) => NC(x, y, 2.6 * s, SMOKE, 0.85) + NC(x + 2.5 * s, y - 4 * s, 3.2 * s, SMOKE, 0.7) + NC(x + 1, y - 9 * s, 3.8 * s, SMOKE, 0.5);
const flag = (x, y, col = RU) => L(x, y, x, y - 12, K, 1.2) + P(`M${x} ${y - 12} l9 2.5 l-9 3z`, col);
const window_ = (x, y, w = 3, h = 3) => R(x, y, w, h, GO, 'stroke-width=".7"');

// ---------------------------------------------------------------- EDIFICIOS
/** Frase corta por edificio y nivel (para pies de foto). */
export const BUILDING_LEVEL_DESC = {
  base: ['Solar con estacas', 'Tienda de campaña', 'Barracón con bandera', 'Cuartel con torre y hangar'],
  fabrica: ['Solar con estacas', 'Nave con una chimenea', 'Dos naves, chimenea con humo y depósito', 'Tres naves, dos chimeneas, tanque y cinta'],
  refineria: ['Solar con estacas', 'Un tanque de crudo', 'Tanques y torre de destilación', 'Complejo con antorcha encendida'],
  mina: ['Solar con estacas', 'Pozo con montón de mineral', 'Castillete con polea', 'Castillete con vagonetas y cobertizo'],
  granja: ['Solar con estacas', 'Cabaña con surcos', 'Cabaña con silo', 'Dos silos y tractor'],
  lab: ['Solar con estacas', 'Caseta con antena', 'Edificio con cúpula', 'Campus con radar'],
  carretera: ['Solar con estacas', 'Camino de tierra', 'Asfalto con líneas', 'Autopista con puente'],
  ferrocarril: ['Solar con estacas', 'Vía sencilla', 'Vía con estación', 'Doble vía con locomotora'],
  fuerte: ['Solar con estacas', 'Muro con torre', 'Bastión estrellado', 'Fortaleza con dos torres y bandera'],
  linea: ['Solar con estacas', 'Trinchera', 'Trinchera con alambre de púas', 'Búnkeres de hormigón'],
};

function plot() {
  return GROUND
    + P('M10 50 L32 40 L54 50 L32 58Z', '#6d6448', 'stroke-dasharray="3 2.2" fill-opacity=".55" stroke="#9a937c"')
    + [[10, 50], [32, 40], [54, 50], [32, 58]].map(([x, y]) => L(x, y, x, y - 7, WOOD, 1.8) + `<circle cx="${x}" cy="${y - 7.5}" r="1.3" fill="${AM}"/>`).join('')
    + P('M24 48 l11 -3 l4 3 l-11 3z', CR, 'fill-opacity=".8"') + L(27, 47.5, 36, 45.8, '#7a6f55', .7);
}

// Cada elemento de BDRAW devuelve el marcado del nivel 1..3.
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
  fabrica(l) {
    if (l === 1) return R(12, 34, 30, 18, CONC) + P('M12 34 l5 -5 v5 l5 -5 v5 l5 -5 v5 l5 -5 v5 l5 -5 v10z', WALL2) + R(36, 16, 6, 22, '#8a5a46') + R(35, 14, 8, 3, WALL2)
      + R(17, 42, 8, 10, DARK) + window_(29, 38) + window_(35, 38) + smoke(39, 12, .7);
    if (l === 2) return R(6, 36, 24, 16, CONC) + P('M6 36 l5 -5 v5 l5 -5 v5 l5 -5 v5 l5 -5 v5 l3 -3 v8z', WALL2) + R(30, 32, 18, 20, '#b0a994') + P('M29 32 L39 26 L49 32Z', ROOF)
      + R(41, 12, 6, 26, '#8a5a46') + R(40, 10, 8, 3, WALL2) + smoke(44, 8, .8) + R(51, 36, 9, 16, STEEL) + E(55.5, 36, 4.5, 2, STEEL2)
      + R(10, 43, 7, 9, DARK) + window_(21, 40) + window_(35, 38) + window_(41, 38);
    return R(4, 38, 18, 14, CONC) + P('M4 38 l4 -4 v4 l4 -4 v4 l4 -4 v4 l4 -4 v8z', WALL2) + R(22, 32, 18, 20, '#b0a994') + P('M21 32 L31 25 L41 32Z', ROOF)
      + R(40, 28, 14, 24, CONC) + P('M40 28 L47 22 L54 28Z', ROOF) + R(11, 14, 5, 26, '#8a5a46') + R(10, 12, 7, 3, WALL2) + R(30, 12, 5, 22, '#8a5a46') + R(29, 10, 7, 3, WALL2)
      + smoke(13, 10, .7) + smoke(32, 8, .7) + R(55, 34, 7, 18, STEEL) + E(58.5, 34, 3.5, 1.8, STEEL2)
      + L(2, 56, 62, 56, STEEL2, 2.2) + NP('M6 56 h52', 'none', `stroke="${BR}" stroke-width=".8" stroke-dasharray="2 2"`) + R(8, 43, 6, 9, DARK) + window_(26, 38) + window_(33, 38) + window_(45, 36) + NC(35, 36, 1, AM);
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
  carretera(l) {
    if (l === 1) return P('M4 56 L26 20 L38 20 L60 56Z', DIRT) + P('M26 20 L38 20 L42 26 L22 26Z', '#6f5a3c', 'stroke="none"') + [[30, 52], [38, 46], [26, 40], [34, 35], [32, 28]].map(([x, y]) => E(x, y, 1.8, 1, '#5d4a32', 'stroke-width=".6"')).join('')
      + L(16, 45, 12, 52, '#5b6a30', 1.4) + L(48, 45, 52, 52, '#5b6a30', 1.4) + E(10, 47, 3, 2, GRASS, 'stroke="none"') + E(54, 46, 3.5, 2.2, GRASS, 'stroke="none"');
    if (l === 2) return P('M2 58 L26 18 L38 18 L62 58Z', '#6a6d6e') + P('M2 58 L5 58 L27 18 L26 18Z', CONC, 'stroke="none"') + P('M62 58 L59 58 L37 18 L38 18Z', CONC, 'stroke="none"')
      + [[32, 54, 4], [32, 44, 3], [32, 36, 2.4], [32, 29, 1.8], [32, 23, 1.3]].map(([x, y, w]) => R(x - w / 2, y - 2.4, w, 4.2, CR, 'stroke="none"')).join('') + L(9, 46, 9, 38, WOOD, 1.4) + L(55, 46, 55, 38, WOOD, 1.4);
    return P('M2 58 L22 20 L42 20 L62 58Z', '#6a6d6e') + P('M31 20 L32 20 L33 58 L31 58Z', GO, 'stroke="none"')
      + [[22, 58, 20], [24, 20, 36]].map(() => '').join('') + L(12, 58, 25, 20, CR, 1, 'stroke-dasharray="4 3"') + L(52, 58, 39, 20, CR, 1, 'stroke-dasharray="4 3"')
      + R(5, 25, 54, 6, CONC) + R(7, 31, 4, 12, WALL2) + R(53, 31, 4, 12, WALL2) + R(5, 23, 54, 2.4, STEEL) + [10, 18, 26, 34, 42, 50, 57].map((x) => L(x, 25, x, 23, K, .8)).join('')
      + P('M2 58 L11 43 L53 43 L62 58Z', '#7a7d7c', 'fill-opacity=".9"') + L(32, 58, 32, 43, GO, 1.2, 'stroke-dasharray="3 2"') + [[18, 50], [46, 50]].map(([x, y]) => R(x - 3, y - 2, 6, 3, RU, 'stroke-width=".7"')).join('');
  },
  ferrocarril(l) {
    const track = (y, sc = 1) => [4, 10, 16, 22, 28, 34, 40, 46, 52, 58].map((x) => R(x - 1.2, y - 2.2 * sc, 2.4, 5.4 * sc, WOOD2, 'stroke-width=".6"')).join('')
      + L(1, y - 1.2 * sc, 63, y - 1.2 * sc, '#b8bcc0', 1.4) + L(1, y + 2.2 * sc, 63, y + 2.2 * sc, '#b8bcc0', 1.4);
    if (l === 1) return P('M0 46 H64 V58 H0Z', '#5f5640', 'stroke="none"') + track(50) + P('M0 44 Q20 38 40 42 T64 40', 'none', `stroke="${GRASS}" stroke-width="3"`);
    if (l === 2) return P('M0 50 H64 V58 H0Z', '#5f5640', 'stroke="none"') + track(54) + R(8, 30, 30, 16, '#b3a387') + P('M5 31 L23 21 L41 31Z', ROOF) + R(12, 36, 6, 10, DARK) + window_(22, 36) + window_(29, 36) + R(5, 46, 36, 2.4, WALL2)
      + R(46, 22, 12, 4, STEEL2) + L(52, 26, 52, 46, K, 1.4) + L(50, 46, 54, 46, K, 1.4) + NC(52, 20, 1.5, GO);
    return P('M0 38 H64 V58 H0Z', '#5f5640', 'stroke="none"') + track(44, .9) + track(54, 1.05)
      + R(8, 30, 34, 10, '#5b6a8a') + R(36, 24, 14, 16, '#5b6a8a') + R(38, 26, 10, 5, SKY) + R(2, 28, 8, 12, STEEL2) + R(30, 18, 3, 10, STEEL2) + E(31.5, 18, 3, 1.5, SMOKE, 'stroke="none"') + NC(33, 13, 3, SMOKE, .7) + NC(36, 8, 3.5, SMOKE, .45)
      + C(14, 41, 2.6, DARK) + C(24, 41, 2.6, DARK) + C(34, 41, 2.6, DARK) + C(46, 41, 2.6, DARK) + NC(52, 33, 1.6, GO) + R(52, 36, 8, 4, STEEL2);
  },
  fuerte(l) {
    const cren = (x, y, w) => { let s = ''; for (let i = 0; i < w; i += 5) s += R(x + i, y - 3, 3, 3, WALL); return s; };
    if (l === 1) return R(8, 34, 36, 18, WALL) + cren(8, 34, 36) + L(8, 42, 44, 42, WALL2, .8) + R(40, 22, 14, 30, WALL2) + cren(39, 22, 16) + R(45, 30, 3, 6, DARK) + R(20, 42, 8, 10, DARK) + P('M20 42 Q24 38 28 42', DARK);
    if (l === 2) return P('M32 12 L40 24 L58 26 L46 38 L52 54 L32 47 L12 54 L18 38 L6 26 L24 24Z', WALL) + P('M32 20 L37 28 L47 29 L40 36 L43 45 L32 41 L21 45 L24 36 L17 29 L27 28Z', '#6f7b44')
      + R(29, 30, 6, 7, WALL2) + flag(32, 30, RU) + L(32, 12, 32, 20, WALL2, .8) + L(58, 26, 47, 29, WALL2, .8) + L(6, 26, 17, 29, WALL2, .8);
    return R(4, 36, 56, 16, WALL) + cren(4, 36, 56) + L(4, 44, 60, 44, WALL2, .8) + R(2, 20, 14, 32, WALL2) + cren(1, 20, 16) + R(48, 20, 14, 32, WALL2) + cren(47, 20, 16)
      + R(24, 28, 16, 24, WALL) + cren(23, 28, 18) + P('M28 52 V44 Q32 38 36 44 V52Z', DARK) + R(7, 28, 3, 6, DARK) + R(53, 28, 3, 6, DARK) + flag(32, 28, RU) + NC(9, 46, 1, GO) + NC(55, 46, 1, GO);
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
};

// ---------------------------------------------------------------- UNIDADES
const UNIT_ACCENT = { inf: '#7b8a4a', mot: '#8a7a4a', arm: '#5a6470', art: '#8a5a3a', mtn: '#6b5a45', mar: '#4f7a9a', air: '#4a9a8f', esp: '#8a5a9a' };
const man = (x, y, col, k = 1) => // soldado de pie con casco (x = centro, y = pies)
  R(x - 2.2 * k, y - 6 * k, 1.8 * k, 6 * k, '#3d3a2a') + R(x + 0.4 * k, y - 6 * k, 1.8 * k, 6 * k, '#3d3a2a') + R(x - 3 * k, y - 15 * k, 6 * k, 10 * k, col)
  + C(x, y - 18 * k, 2.8 * k, SKIN) + P(`M${x - 3.4 * k} ${y - 18 * k} a3.4 3.2 0 0 1 6.8 0z`, '#566038') ;
const UDRAW = {
  inf(a) {
    return P('M0 58 Q20 44 40 50 T64 48 V64 H0Z', '#5f6b36', 'stroke="none"') + GROUND
      + L(48, 36, 48, 54, WOOD2, 2) + NC(48, 30, 7, '#4f6a34', 1) + NC(52, 34, 5, '#5f7a3c', 1)
      + man(26, 53, a, 1.35) + L(32, 36, 44, 30, K, 2.6) + L(32, 36, 44, 30, '#5a4229', 1.2) + L(20, 38, 30, 38, '#3d3a2a', 2.4);
  },
  mot(a) {
    return P('M0 58 Q20 52 40 54 T64 52 V64 H0Z', '#8a7a4a', 'stroke="none"', '') + GROUND
      + R(8, 26, 34, 22, a) + P('M42 32 h10 l6 8 v8 H42z', '#a89a64') + R(46, 34, 6, 5, SKY) + R(6, 24, 38, 3, WALL2)
      + P('M12 26 q5 -9 10 0M26 26 q5 -9 10 0', '#566038') + C(16, 21, 2.4, SKIN) + C(31, 21, 2.4, SKIN)
      + C(16, 50, 5.4, DARK) + C(16, 50, 2, CONC) + C(48, 50, 5.4, DARK) + C(48, 50, 2, CONC) + R(26, 38, 6, 3, K, 'opacity=".6"');
  },
  arm(a) {
    return P('M0 58 Q20 52 40 54 T64 52 V64 H0Z', '#8f8458', 'stroke="none"') + GROUND
      + R(10, 42, 44, 10, DARK) + [16, 24, 32, 40, 48].map((x) => C(x, 47, 3.4, STEEL2)).join('') + P('M12 42 L16 32 H50 L56 42Z', a)
      + P('M22 32 L25 22 H42 L46 32Z', a) + R(44, 25.5, 17, 3.2, STEEL2) + R(60, 24.5, 3, 5, STEEL2) + C(33, 22, 2.8, WALL2) + L(33, 22, 33, 15, K, 1) + NC(30, 36, 1.2, '#00000040') + NC(40, 36, 1.2, '#00000040');
  },
  art(a) {
    return P('M0 58 Q20 52 40 54 T64 52 V64 H0Z', '#7d7240', 'stroke="none"') + GROUND
      + P('M16 44 L50 26 L53 31 L20 48Z', STEEL) + R(49, 24, 7, 4.5, STEEL2, 'transform="rotate(-28 52 26)"') + P('M12 50 L22 30 L28 32 L24 50Z', a)
      + C(20, 50, 7, DARK) + C(20, 50, 2.4, CONC) + P('M26 54 L40 54 L36 50Z', WALL2)
      + man(42, 53, '#6a7a44', .95) + R(37, 36, 3, 4, '#7a6f45', 'stroke-width=".6"');
  },
  mtn(a) {
    return P('M0 56 L16 26 L28 42 L40 18 L64 56Z', '#8a8573') + P('M40 18 L33 30 L38 27 L42 33 L46 28Z', SNOW) + P('M16 26 L11 35 L16 32 L20 36Z', SNOW) + GROUND
      + man(24, 53, a, 1.35) + L(33, 50, 39, 33, WOOD, 2) + P('M36 35 L43 36 L39 31Z', STEEL) + L(18, 38, 21, 36, '#3d3a2a', 2.4) + R(16, 40, 4, 8, '#7a4f3e', 'stroke-width=".8"');
  },
  mar(a) {
    return P('M0 50 H64 V64 H0Z', WATER, 'stroke="none"') + P('M0 54 q5 -3 10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0', 'none', 'stroke="#d9e8ee" stroke-width="1.2" fill="none"')
      + P('M6 44 H52 L58 36 H62 L56 50 H12Z', a) + R(6, 44, 46, 3, WALL2) + P('M56 36 L62 34 L60 44Z', STEEL2) + man(24, 44, '#4f6a8a', 1.1) + man(34, 44, '#4f6a8a', 1.1)
      + L(28, 28, 28, 18, K, 1.2) + P('M28 18 l8 2 l-8 3z', RU) + P('M2 56 q5 -3 10 0 t10 0 t10 0', 'none', 'stroke="#d9e8ee" stroke-width="1" fill="none"');
  },
  air(a) {
    return P('M0 0 H64 V64 H0Z', '#8fa7b2', 'opacity=".55" stroke="none"') + NC(12, 18, 7, '#e8eef0', .9) + NC(20, 21, 6, '#e8eef0', .9) + NC(52, 50, 8, '#e8eef0', .9) + NC(44, 53, 6, '#e8eef0', .9)
      + P('M6 32 L52 28 L60 32 L52 36Z', a) + P('M34 30 L20 12 L26 12 L44 29Z', STEEL) + P('M34 34 L20 52 L26 52 L44 35Z', STEEL) + P('M10 31 L4 22 L8 22 L16 30Z', STEEL2)
      + P('M46 29 q6 -1 10 3 q-4 1 -10 0z', SKY) + C(8, 32, 1.6, AM) + L(52, 32, 60, 32, K, .8);
  },
  esp(a) {
    return P('M0 0 H64 V64 H0Z', '#2d3a2c', 'opacity=".75" stroke="none"') + NC(50, 14, 6, '#e8e3c8', .9) + NC(53, 12, 5, '#2d3a2c', 1)
      + P('M14 62 Q14 44 32 42 Q50 44 50 62Z', '#3b4a35') + R(28, 36, 8, 8, SKIN) + C(32, 28, 10, '#d3ae86') + P('M21 26 Q22 14 32 15 Q46 14 44 26 Q40 21 32 21 Q26 22 21 26Z', a) + C(41, 14, 2, a)
      + R(21, 26, 22, 6, '#1d241c') + C(27, 29, 3.2, '#7fff9a') + C(37, 29, 3.2, '#7fff9a') + NC(27, 29, 1.2, '#eaffee') + NC(37, 29, 1.2, '#eaffee') + L(32, 34, 32, 38, K, 1);
  },
};
export const UNIT_KINDS = Object.keys(UDRAW);

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

/** Edificio `kind` al nivel `level` (0..3). */
export function artBuilding(kind, level, opts) {
  const lv = Math.max(0, Math.min(3, Math.floor(level || 0)));
  const fn = BDRAW[kind];
  return make('b:' + kind + ':' + lv, () => (!fn || lv === 0 ? plot() : GROUND + fn(lv)), opts);
}

/** Unidad del tipo `kind`. */
export function artUnit(kind, opts) {
  const fn = UDRAW[kind] || UDRAW.inf;
  const k = UDRAW[kind] ? kind : 'inf';
  return make('u:' + k, () => fn(UNIT_ACCENT[k]), opts);
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
