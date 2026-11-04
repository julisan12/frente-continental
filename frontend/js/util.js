// Utilidades compartidas: DOM, formato, textos en espanol.
import { ORDER_COSTS, PROJECTS, SEND_MIN, SEND_DEFAULT } from './engine/constants.js';

export const MONEY_SCALE = 10; // DESIGN.md: money interno x10 = millones de $ en pantalla
// Costes leidos de las constantes del motor (mismos valores que el backend) para que no se desincronicen al rebalancear.
export const COSTS = {
  ...ORDER_COSTS,
  project: Object.fromEntries(Object.entries(PROJECTS).map(([k, v]) => [k, v[1]])),
};
export { SEND_MIN, SEND_DEFAULT };

export const ALIGN = { no_alineado: 'No alineado', occidental: 'Occidental', socialista: 'Socialista' };
export const PROJECT_KIND = {
  factory: { name: 'Fábrica', desc: 'Aumenta industria y producción.' },
  road: { name: 'Carretera', desc: 'Mejora la infraestructura.' },
  port: { name: 'Puerto', desc: 'Impulsa el comercio y la defensa costera.' },
  school: { name: 'Escuela', desc: 'Eleva el desarrollo del país.' },
  barracks: { name: 'Cuartel', desc: 'Acelera el reclutamiento.' },
};
export const STANCE = { defend: 'Defensa', idle: 'En espera', front: 'Frente' };

function add(e, k) {
  if (k == null || k === false || k === true) return;
  if (Array.isArray(k)) return k.forEach((x) => add(e, x));
  e.append(k instanceof Node ? k : document.createTextNode(String(k)));
}
export function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    kids.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k === 'html') e.innerHTML = v; // trusted static markup only (SVG/icons); use text/kids for dynamic data
    else if (k === 'value') e.value = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  kids.forEach((k) => add(e, k));
  return e;
}
const SVGNS = 'http://www.w3.org/2000/svg';
export function svgEl(tag, attrs, ...kids) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null && v !== false) e.setAttribute(k, v);
  kids.forEach((k) => add(e, k));
  return e;
}
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const relKey = (a, b) => [a, b].sort().join('|');

export function fmtNum(n) {
  if (n == null || isNaN(n)) return '-';
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
export function fmtMoney(raw) {
  if (raw == null || isNaN(raw)) return '-';
  return '$ ' + fmtNum(raw * MONEY_SCALE) + ' M';
}
// Decimal con coma (1 decimal por defecto); sin decimales si el valor es entero.
export function fmtDec(n, d = 1) {
  if (n == null || isNaN(n)) return '-';
  const f = 10 ** d;
  const r = Math.round(n * f) / f;
  return Number.isInteger(r) ? fmtNum(r) : r.toFixed(d).replace('.', ',');
}
export function fmtSigned(n, money) {
  if (n == null || isNaN(n)) return '';
  const v = money ? n * MONEY_SCALE : n;
  // valores pequenos no monetarios (estabilidad, factores) con 1 decimal: 0.3 no debe mostrarse como "-0"
  const a = Math.abs(v);
  const body = !money && a < 10 ? fmtDec(a) : fmtNum(a);
  const zero = body === '0';
  const s = (zero ? '' : v > 0 ? '+' : '-') + body;
  return money ? s + ' M' : s;
}
export const deltaClass = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : 'muted');

export function toast(msg, kind) {
  const root = document.getElementById('toasts');
  if (!root) return console.warn(msg);
  const t = h('div', { class: 'toast' + (kind === 'ok' ? ' ok' : ''), role: 'status' }, msg);
  root.append(t);
  setTimeout(() => t.remove(), 3800);
  t.addEventListener('click', () => t.remove());
}

export function orderLabel(o, ctx) {
  const t = o.target ? ctx.cname(o.target) : '';
  const d = o.division_id ? ctx.divName(o.division_id) : '';
  switch (o.type) {
    case 'build': return 'Construir industria';
    case 'project': return 'Proyecto: ' + (PROJECT_KIND[o.params?.kind]?.name || o.params?.kind || 'obra');
    case 'stability': return 'Programa de estabilidad';
    case 'recruit': return 'Reclutar tropas';
    case 'tanks': return 'Producir tanques';
    case 'planes': return 'Producir aviones';
    case 'propose_alliance': return 'Proponer alianza a ' + t;
    case 'nap': return 'Pacto de no agresión con ' + t;
    case 'send_resources': return 'Enviar recursos a ' + t;
    case 'peace': return 'Proponer la paz a ' + t;
    case 'trade': return 'Tratado comercial con ' + t;
    case 'break': return 'Romper tratado con ' + t;
    case 'declare_war': return 'Declarar guerra a ' + t;
    case 'move': return d + ': mover a ' + t;
    case 'attack': return d + ': atacar ' + t;
    case 'defend': return d + ': defender';
    case 'reorganize': return d + ': reorganizar';
    case 'front': return d + ': establecer frente';
    default: return o.type;
  }
}
export const MILITARY = ['move', 'attack', 'defend', 'reorganize', 'front'];

// Seguridad: append/replaceChildren nativos convierten null/arrays en texto ("null", "[object HTMLButtonElement]").
// Aquí se aplanan arrays y se ignoran null/undefined/booleanos, igual que h().
for (const P of [Element.prototype, DocumentFragment.prototype]) {
  for (const m of ['append', 'prepend', 'replaceChildren']) {
    const orig = P[m];
    P[m] = function (...kids) { return orig.apply(this, kids.flat(Infinity).filter((k) => k != null && k !== false && k !== true)); };
  }
}

// ---- Tanda 3 (F): cifras compactas y exactas ----
/**
 * Cifra compacta en español. Sufijos: k = mil (10^3), M = millón (10^6), B = MIL MILLONES (10^9, «billón»
 * estadounidense, no el billón español) y T = billón español (10^12, solo para cifras monetarias enormes).
 * Máximo 1 decimal con coma, sin decimal si es entero. Negativos con «−». Con {money:true} el valor se toma
 * en unidades internas, se pasa a dólares (× MONEY_SCALE millones) y se antepone «$»: 60 → «$600M».
 */
export function fmtCompact(n, opts) {
  if (n == null || isNaN(n)) return '-';
  const money = !!(opts && opts.money);
  let v = money ? n * MONEY_SCALE * 1e6 : n;
  const neg = v < 0;
  v = Math.abs(v);
  let out;
  const units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'k']];
  const u = units.find(([f]) => v >= f);
  if (!u) out = String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  else {
    let x = Math.round(v / u[0] * 10) / 10;
    let suf = u[1];
    if (x >= 1000 && suf !== 'T') { // 999.960 → 1.000k se reexpresa como 1M
      const i = units.findIndex((q) => q[1] === suf);
      x = Math.round(x / 1000 * 10) / 10; suf = units[i - 1][1];
    }
    out = (Number.isInteger(x) ? String(x) : x.toFixed(1).replace('.', ',')) + suf;
  }
  return (neg && out !== '0' ? '−' : '') + (money ? '$' : '') + out;
}

const _W1 = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
/** Nombre en palabras de m × 10^g (g múltiplo de 3, m ∈ {1..9, 10, 100}) para 10^3 ≤ n < 10^15; si no, ''. */
export function wordsOf(n) {
  if (n == null || isNaN(n) || n < 1000 || n >= 1e15) return '';
  const g = Math.floor(Math.log10(n) / 3) * 3;
  const m = Math.round(n / 10 ** g);
  if (n !== m * 10 ** g || ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100].includes(m)) return '';
  const mw = m === 10 ? 'diez' : m === 100 ? 'cien' : _W1[m];
  if (g === 3) return m === 1 ? 'mil' : mw + ' mil';
  if (g === 6) return m === 1 ? 'un millón' : mw + ' millones';
  if (g === 9) return m === 1 ? 'mil millones' : mw + ' mil millones';
  return m === 1 ? 'un billón' : mw + ' billones';
}
/** Cifra completa con puntos de miles («10.000») y, solo para cifras redondas (1k, 10k, 100k, 1M…), «(diez mil)». */
export function fmtExact(n, opts) {
  if (n == null || isNaN(n)) return '-';
  const base = (n < 0 ? '−' : '') + String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const w = wordsOf(Math.abs(Math.round(n)));
  return w && !(opts && opts.noWords) ? base + ' (' + w + ')' : base;
}
