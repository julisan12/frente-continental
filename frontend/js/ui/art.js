// Ilustraciones dibujadas (SVG en línea) para edificios, unidades, acciones y recursos (Tanda 2, trabajador D).
// Cada función devuelve un elemento <svg> listo para insertar. Las ilustraciones de edificios EVOLUCIONAN con el
// nivel (0 = solar/plano, 1..3 = cada vez más grande y detallado). Paleta: variables CSS de main.css (--brass,
// --cream, --rust, --olive, --amber...) con colores de respaldo. Sin dependencias externas. Sin texto.
//
// API estable (otros módulos la usan; mantener firmas):
//   artBuilding(kind, level, opts) kind ∈ provinces.BUILD (base,fabrica,refineria,mina,granja,lab,carretera,ferrocarril,fuerte,linea)
//   artUnit(kind, opts)            kind ∈ units.UNIT_TYPES (inf,mot,arm,art,mtn,mar,air,esp)
//   artAction(name, opts)          name ∈ attack|move|defend|reorganize|front|recruit|build|research|trade|spy|war|peace|alliance|surprise|provoke|conquest|loot
//   artResource(res, opts)         res ∈ petroleo|gas|minerales|cobre|agro|madera|food|fuel|goods|metal
//   opts = { size: px (por defecto 64), class: string, title: string }
import { svgEl } from '../util.js';

const VB = 64;

function frame(opts, ...kids) {
  const o = opts || {};
  const size = o.size || VB;
  const svg = svgEl('svg', { viewBox: `0 0 ${VB} ${VB}`, width: size, height: size, class: 'art' + (o.class ? ' ' + o.class : ''), role: 'img', 'aria-label': o.title || '' }, ...kids);
  return svg;
}

const PLACEHOLDER_COLOR = { building: '#7a6a50', unit: '#5a6a4a', action: '#8a6a3a', resource: '#5a7a8a' };

function placeholder(kind, label, opts, color) {
  // Marcador provisional: el trabajador D sustituye estas formas por ilustraciones reales.
  return frame(opts,
    svgEl('rect', { x: 4, y: 4, width: 56, height: 56, rx: 8, fill: color, 'fill-opacity': 0.35, stroke: '#b8975a', 'stroke-width': 1.5 }),
    svgEl('text', { x: 32, y: 36, 'text-anchor': 'middle', 'font-size': 9, fill: '#eadfc4', 'font-family': 'Georgia, serif' }, String(label || kind).slice(0, 8)));
}

/** Edificio `kind` al nivel `level` (0..3). */
export function artBuilding(kind, level, opts) {
  return placeholder(kind, kind + ' ' + (level || 0), opts, PLACEHOLDER_COLOR.building);
}

/** Unidad del tipo `kind`. */
export function artUnit(kind, opts) {
  return placeholder(kind, kind, opts, PLACEHOLDER_COLOR.unit);
}

/** Acción/escena `name`. */
export function artAction(name, opts) {
  return placeholder(name, name, opts, PLACEHOLDER_COLOR.action);
}

/** Recurso `res`. */
export function artResource(res, opts) {
  return placeholder(res, res, opts, PLACEHOLDER_COLOR.resource);
}
