// Mod pack visual del mapa: provincias, texturas de terreno, oceano y animaciones de accion.
import { PROV, TERRAIN, toXY } from '../data/provinces.js';

const NS = 'http://www.w3.org/2000/svg';
const mk = (t, a, p) => {
  const e = document.createElementNS(NS, t);
  if (a) for (const k in a) if (a[k] != null) e.setAttribute(k, a[k]);
  if (p) p.append(e);
  return e;
};
const safe = (id) => String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
const vals = (x) => (Array.isArray(x) ? x : x ? Object.values(x) : []);
const fmt = (n) => { const a = Math.abs(n); return a >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : a >= 1e3 ? (n / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k' : String(Math.round(n)); };

let svgR = null, worldR = null, geoR = {}, provG = null, lblG = null, over = null, partG = null;
let enabled = true, k = 1, lastK = -1, checked = false, sig = '';
let lbls = [], scal = [];
const samp = new Map(), fronts = new Map();
let prev = null;

try { enabled = localStorage.getItem('fc.mapfx') !== '0'; } catch (e) { /* sin storage */ }

export const isEnabled = () => enabled;
export function setEnabled(b) {
  enabled = !!b;
  try { localStorage.setItem('fc.mapfx', enabled ? '1' : '0'); } catch (e) { /* sin storage */ }
  if (svgR) svgR.classList.toggle('fx-off', !enabled);
}
export const anchor = () => provG;

// ---------- Texturas ----------
const MOTIF = {
  S: (p) => { mk('circle', { cx: 1.5, cy: 1.6, r: 1, fill: '#173414', 'fill-opacity': 0.55 }, p); mk('circle', { cx: 4.4, cy: 4.3, r: 1.2, fill: '#1c3d18', 'fill-opacity': 0.5 }, p); mk('circle', { cx: 4.8, cy: 1.2, r: 0.5, fill: '#5d8c45', 'fill-opacity': 0.4 }, p); },
  M: (p) => mk('path', { d: 'M.4 4.6 2 2 3.6 4.6M2.8 5.8 4.4 3.2 6 5.8', fill: 'none', stroke: '#efe0c0', 'stroke-opacity': 0.4, 'stroke-width': 0.35 }, p),
  D: (p) => mk('path', { d: 'M0 2q1.5-1 3 0t3 0M0 5q1.5-1 3 0t3 0', fill: 'none', stroke: '#fbe9b8', 'stroke-opacity': 0.38, 'stroke-width': 0.3 }, p),
  P: (p) => mk('path', { d: 'M0 1.5h6M0 4.5h6', stroke: '#d2e09a', 'stroke-opacity': 0.2, 'stroke-width': 0.25 }, p),
  V: (p) => { mk('circle', { cx: 1, cy: 1.2, r: 0.4, fill: '#efe09a', 'fill-opacity': 0.45 }, p); mk('circle', { cx: 4, cy: 3.8, r: 0.45, fill: '#4b5a26', 'fill-opacity': 0.5 }, p); },
  B: (p) => { mk('circle', { cx: 1.6, cy: 1.6, r: 0.9, fill: '#24411f', 'fill-opacity': 0.5 }, p); mk('circle', { cx: 4.5, cy: 4.4, r: 0.9, fill: '#24411f', 'fill-opacity': 0.5 }, p); },
  E: (p) => mk('path', { d: 'M.8 2h1.8M3.4 4.8h1.8', stroke: '#e3d8b8', 'stroke-opacity': 0.32, 'stroke-width': 0.3 }, p),
  T: (p) => { mk('path', { d: 'M1.5 5V3m0 0-.9-.6m.9.6.9-.6M4.5 2.5V.8m0 0-.8-.5m.8.5.8-.5', fill: 'none', stroke: '#1f3d18', 'stroke-opacity': 0.6, 'stroke-width': 0.3 }, p); },
  A: (p) => { mk('path', { d: 'M.4 3.4 2 1.4 3.6 3.4', fill: 'none', stroke: '#eadcbc', 'stroke-opacity': 0.32, 'stroke-width': 0.3 }, p); mk('path', { d: 'M4.4 4.3h1.2M5 3.7v1.2', stroke: '#eadcbc', 'stroke-opacity': 0.28, 'stroke-width': 0.25 }, p); },
};
function patterns(defs) {
  for (const T in TERRAIN) {
    const p = mk('pattern', { id: 'tx-' + T, width: 6, height: 6, patternUnits: 'userSpaceOnUse' }, defs);
    mk('rect', { width: 6, height: 6, fill: TERRAIN[T].color, 'fill-opacity': 0.3 }, p);
    (MOTIF[T] || (() => {}))(p);
  }
  const w = mk('pattern', { id: 'fx-wave', width: 14, height: 8, patternUnits: 'userSpaceOnUse' }, defs);
  mk('path', { d: 'M0 4q3.5-2 7 0t7 0', fill: 'none', stroke: '#7fb2d4', 'stroke-opacity': 0.08, 'stroke-width': 0.5 }, w);
  const v = mk('radialGradient', { id: 'fx-vig', cx: '50%', cy: '50%', r: '65%' }, defs);
  mk('stop', { offset: '55%', 'stop-color': '#000', 'stop-opacity': 0 }, v);
  mk('stop', { offset: '100%', 'stop-color': '#000', 'stop-opacity': 0.5 }, v);
  const sh = mk('linearGradient', { id: 'fx-shore', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  mk('stop', { offset: '0', 'stop-color': '#3d7ea8' }, sh);
  mk('stop', { offset: '1', 'stop-color': '#1d4d70' }, sh);
}

// ---------- Voronoi recortado ----------
function clipHalf(poly, a, b) {
  // conserva puntos mas cerca de a que de b
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, nx = b[0] - a[0], ny = b[1] - a[1];
  const f = (p) => (p[0] - mx) * nx + (p[1] - my) * ny;
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const P = poly[i], Q = poly[(i + 1) % poly.length], fp = f(P), fq = f(Q);
    if (fp <= 0) out.push(P);
    if ((fp <= 0) !== (fq <= 0)) { const t = fp / (fp - fq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
  }
  return out;
}
function cells(sites) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  sites.forEach((s) => { x0 = Math.min(x0, s[0]); y0 = Math.min(y0, s[1]); x1 = Math.max(x1, s[0]); y1 = Math.max(y1, s[1]); });
  const M = 90, box = [[x0 - M, y0 - M], [x1 + M, y0 - M], [x1 + M, y1 + M], [x0 - M, y1 + M]];
  return sites.map((s, i) => {
    let poly = box;
    for (let j = 0; j < sites.length && poly.length; j++) if (j !== i) poly = clipHalf(poly, s, sites[j]);
    return poly;
  });
}

export function init(svg, defs, world, geo, countries) {
  svgR = svg; worldR = world; geoR = geo || {};
  lbls = []; scal = []; samp.clear(); fronts.clear(); sig = ''; checked = false; lastK = -1;
  svg.classList.toggle('fx-off', !enabled);
  patterns(defs);
  // Oceano: oleaje y viñeta.
  const ocean = svg.querySelector('[data-ocean]');
  if (ocean) {
    const wv = mk('rect', { x: -500, y: -500, width: 1500, height: 1500, fill: 'url(#fx-wave)', class: 'fxl fx-sea', 'pointer-events': 'none' });
    const vg = mk('rect', { x: -20, y: -20, width: 540, height: 575, fill: 'url(#fx-vig)', class: 'fxl', 'pointer-events': 'none' });
    ocean.after(wv, vg);
  }
  // Resplandor costero bajo los paises.
  const first = world.querySelector('.ctry');
  const glow = mk('g', { class: 'fxl fx-coast', 'pointer-events': 'none' });
  countries.forEach((c) => {
    mk('path', { d: c.path, fill: 'none', stroke: 'url(#fx-shore)', 'stroke-opacity': 0.16, 'stroke-width': 5, 'stroke-linejoin': 'round' }, glow);
    mk('path', { d: c.path, fill: 'none', stroke: '#8cc4e6', 'stroke-opacity': 0.14, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, glow);
  });
  world.insertBefore(glow, first || null);
  // Provincias con textura de terreno.
  provG = mk('g', { class: 'fxl fx-prov', 'pointer-events': 'none' }, world);
  lblG = mk('g', { class: 'fxl fx-plbls', 'pointer-events': 'none' }, world);
  countries.forEach((c) => {
    const list = PROV[c.id];
    if (!list || !list.length) return;
    const sid = safe(c.id);
    const cp = mk('clipPath', { id: 'cp-' + sid }, defs);
    mk('path', { d: c.path }, cp);
    const g = mk('g', { 'clip-path': `url(#cp-${sid})`, 'data-pc': c.id }, provG);
    const sites = list.map((p) => toXY(p[1], p[2]));
    const polys = list.length > 1 ? cells(sites) : [null];
    list.forEach((p, i) => {
      const T = TERRAIN[p[3]] ? p[3] : 'P';
      const poly = polys[i];
      const d = poly ? 'M' + poly.map((q) => q[0].toFixed(2) + ' ' + q[1].toFixed(2)).join('L') + 'Z' : c.path;
      mk('path', { d, fill: `url(#tx-${T})`, stroke: 'rgba(7,16,29,.55)', 'stroke-width': 0.6, 'vector-effect': 'non-scaling-stroke', 'stroke-dasharray': '2 1.4' }, g);
      let nn = 60;
      sites.forEach((s, j) => { if (j !== i) nn = Math.min(nn, Math.hypot(s[0] - sites[i][0], s[1] - sites[i][1])); });
      const t = mk('g', { class: 'fx-pl', style: 'display:none' }, lblG);
      mk('circle', { r: 1.3, fill: '#e3c985', 'fill-opacity': 0.75 }, t);
      const tx = mk('text', { y: -3, 'text-anchor': 'middle', class: 'fx-pt' }, t);
      tx.textContent = p[0];
      lbls.push({ el: t, x: sites[i][0], y: sites[i][1], d: nn, id: c.id, ok: true });
    });
  });
  over = mk('g', { class: 'fx-over', 'pointer-events': 'none' });
  partG = mk('g', { class: 'fx-parts' });
}

// Verificacion diferida: descarta capitales fuera del contorno real.
function verify() {
  if (checked || !svgR || !svgR.isConnected) return;
  checked = true;
  const pt = svgR.createSVGPoint ? svgR.createSVGPoint() : null;
  lbls.forEach((l) => {
    try {
      const el = worldR.querySelector(`#ctry-${safe(l.id)}`);
      if (!el || !pt || !el.isPointInFill) return;
      pt.x = l.x; pt.y = l.y;
      if (!el.isPointInFill(pt)) l.ok = false;
    } catch (e) { /* conserva */ }
  });
}

export function apply(kk) {
  k = kk || 1;
  if (!worldR) return;
  if (k !== lastK) {
    lastK = k;
    verify();
    const inv = 1 / k;
    lbls.forEach((l) => {
      const show = l.ok && l.d * k > 28;
      l.el.style.display = show ? '' : 'none';
      if (show) l.el.setAttribute('transform', `translate(${l.x} ${l.y}) scale(${inv})`);
    });
  }
  scal.forEach((s) => s.el.setAttribute('transform', `translate(${s.x} ${s.y}) scale(${1 / k})`));
}

// ---------- Frentes de guerra ----------
function samples(id) {
  if (samp.has(id)) return samp.get(id);
  const pts = [];
  try {
    const el = worldR.querySelector(`#ctry-${safe(id)}`);
    const L = el.getTotalLength();
    const n = Math.min(3500, Math.max(60, Math.ceil(L / 0.6)));
    for (let i = 0; i <= n; i++) { const p = el.getPointAtLength((L * i) / n); pts.push([p.x, p.y]); }
  } catch (e) { /* sin geometria */ }
  samp.set(id, pts);
  return pts;
}
function front(a, b) {
  const key = a < b ? a + '|' + b : b + '|' + a;
  if (fronts.has(key)) return fronts.get(key);
  const A = samples(a), B = samples(b), C = 1.5, grid = new Map();
  B.forEach((p) => { const kk = Math.floor(p[0] / C) + ',' + Math.floor(p[1] / C); (grid.get(kk) || grid.set(kk, []).get(kk)).push(p); });
  const runs = []; let cur = [], lastI = -10;
  A.forEach((p, i) => {
    const gx = Math.floor(p[0] / C), gy = Math.floor(p[1] / C);
    let hit = false;
    for (let dx = -1; dx <= 1 && !hit; dx++) for (let dy = -1; dy <= 1 && !hit; dy++) {
      const c = grid.get(gx + dx + ',' + (gy + dy));
      if (c) hit = c.some((q) => Math.abs(q[0] - p[0]) < C && Math.abs(q[1] - p[1]) < C);
    }
    if (!hit) return;
    if (i - lastI > 4 && cur.length) { runs.push(cur); cur = []; }
    cur.push(p); lastI = i;
  });
  if (cur.length) runs.push(cur);
  const res = runs.filter((r) => r.length >= 4).map((r) => r.filter((_, i) => i % 2 === 0 || i === r.length - 1));
  fronts.set(key, res);
  return res;
}

// ---------- Marcadores ----------
function scaled(x, y, parent) {
  const g = mk('g', null, parent);
  scal.push({ el: g, x, y });
  g.setAttribute('transform', `translate(${x} ${y}) scale(${1 / k})`);
  return g;
}
function projectIcon(kind, g) {
  switch (kind) {
    case 'factory':
      mk('path', { d: 'M-5 4V-1l3-2v2l3-2v2l3-2V4Z', fill: '#d8c8a0' }, g);
      mk('rect', { x: 2.4, y: -7, width: 1.8, height: 5, fill: '#d8c8a0' }, g);
      [0, 0.8, 1.6].forEach((d) => mk('circle', { cx: 3.3, cy: -8, r: 1.4, fill: '#cfc7b8', class: 'fx-smoke', style: `animation-delay:${d}s` }, g));
      break;
    case 'road':
      mk('path', { d: 'M-6 4 -2-4M6 4 2-4', stroke: '#d8c8a0', 'stroke-width': 1.2 }, g);
      mk('path', { d: 'M0 4V-4', stroke: '#e3c985', 'stroke-width': 1, 'stroke-dasharray': '1.6 1.4', class: 'fx-dash' }, g);
      break;
    case 'port':
      mk('path', { d: 'M0-5v8M-3-3h6M-4 1q4 4 8 0', fill: 'none', stroke: '#d8c8a0', 'stroke-width': 1.1 }, g);
      mk('path', { d: 'M-6 5q1.5-1.2 3 0t3 0 3 0 3 0', fill: 'none', stroke: '#7fb2d4', 'stroke-width': 0.9, class: 'fx-wave' }, g);
      break;
    case 'school':
      mk('path', { d: 'M-6-1 0-4l6 3-6 3Z', fill: '#d8c8a0' }, g);
      mk('path', { d: 'M-3.5 .5v2.5q3.5 2 7 0V.5', fill: 'none', stroke: '#d8c8a0', 'stroke-width': 1 }, g);
      mk('circle', { r: 6.5, fill: '#e3c985', 'fill-opacity': 0.25, class: 'fx-glow' }, g);
      break;
    case 'barracks':
      mk('path', { d: 'M-3 5V-6', stroke: '#d8c8a0', 'stroke-width': 1 }, g);
      mk('path', { d: 'M-3-6h7l-1.6 2.2L4-1.6h-7Z', fill: '#9a4a42', class: 'fx-flag' }, g);
      mk('path', { d: 'M-6 5h7', stroke: '#d8c8a0', 'stroke-width': 1.2 }, g);
      break;
    default:
      mk('circle', { r: 3, fill: '#d8c8a0' }, g);
  }
}
function divBox(d, color, g) {
  const tanks = (d.tanks || 0) > 0, planes = (d.planes || 0) > 0;
  mk('rect', { x: -9, y: -6, width: 18, height: 12, rx: 1.5, fill: '#0b1626', 'fill-opacity': 0.88, stroke: color, 'stroke-width': 1.2 }, g);
  if (tanks) mk('rect', { x: -6, y: -3.2, width: 12, height: 6.4, rx: 3.2, fill: 'none', stroke: color, 'stroke-width': 1 }, g);
  else mk('path', { d: 'M-9-6 9 6M9-6-9 6', stroke: color, 'stroke-width': 0.9 }, g);
  if (planes) mk('path', { d: 'M-3-8.5 0-10.5 3-8.5', fill: 'none', stroke: color, 'stroke-width': 1 }, g);
  const t = mk('text', { y: 14, 'text-anchor': 'middle', class: 'fx-dt' }, g);
  t.textContent = fmt(d.troops || 0);
  if (d.stance === 'attack' || d.stance === 'ataque') g.classList.add('fx-attack');
}

function signature(game) {
  return JSON.stringify([
    game.turn, game.player, !!game.active_event,
    vals(game.projects).map((p) => [p.id, p.owner, p.kind, p.turns_left]),
    vals(game.wars).map((w) => [w.a, w.b, w.last_combat]),
    vals(game.divisions).map((d) => [d.id, d.owner, d.location, d.troops, d.tanks, d.planes, d.stance]),
  ]);
}

export function update(game, S) {
  if (!worldR || !over || !game) return;
  worldR.append(over);
  over.append(partG);
  particles(game);
  const s = signature(game);
  if (s === sig) return;
  sig = s;
  scal = scal.filter((x) => partG.contains(x.el));
  [...over.children].forEach((c) => { if (c !== partG) c.remove(); });
  const me = game.player, turn = game.turn;
  const at = (id) => geoR[id];
  const wars = vals(game.wars);
  const enemy = (o) => wars.some((w) => (w.a === me && w.b === o) || (w.b === me && w.a === o));

  // Frentes
  const fg = mk('g', { class: 'fx-fronts' });
  over.insertBefore(fg, partG);
  wars.forEach((w) => {
    const hot = w.last_combat === turn;
    const runs = front(w.a, w.b);
    const cls = 'fx-front' + (hot ? ' hot' : '');
    if (runs.length) {
      runs.forEach((r) => {
        const pts = r.map((p) => p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(' ');
        mk('polyline', { points: pts, fill: 'none', stroke: '#c0392b', 'stroke-opacity': hot ? 0.45 : 0.25, 'stroke-width': hot ? 7 : 5, 'vector-effect': 'non-scaling-stroke', 'stroke-linecap': 'round', class: 'fx-fglow' }, fg);
        mk('polyline', { points: pts, fill: 'none', stroke: '#e06a50', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke', 'stroke-dasharray': '5 4', class: cls }, fg);
        if (hot) for (let i = 0; i < Math.min(4, Math.ceil(r.length / 12)); i++) {
          const p = r[Math.floor(((i + 0.5) / Math.min(4, Math.ceil(r.length / 12))) * (r.length - 1))];
          const sg = scaled(p[0], p[1], fg);
          mk('circle', { r: 5, fill: '#ffcc66', class: 'fx-flash', style: `animation-delay:${(i * 0.37).toFixed(2)}s` }, sg);
        }
      });
    } else if (at(w.a) && at(w.b)) {
      const A = at(w.a), B = at(w.b), mx = (A.cx + B.cx) / 2, my = (A.cy + B.cy) / 2 - Math.hypot(B.cx - A.cx, B.cy - A.cy) * 0.25;
      mk('path', { d: `M${A.cx} ${A.cy}Q${mx} ${my} ${B.cx} ${B.cy}`, fill: 'none', stroke: '#e06a50', 'stroke-opacity': 0.7, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', 'stroke-dasharray': '3 5', class: cls }, fg);
    }
  });

  // Obras en construccion
  const pg = mk('g', { class: 'fx-projs' });
  over.insertBefore(pg, partG);
  const byOwner = {};
  vals(game.projects).forEach((p) => { (byOwner[p.owner] = byOwner[p.owner] || []).push(p); });
  Object.keys(byOwner).forEach((o) => {
    const c = at(o); if (!c) return;
    const list = byOwner[o].slice(0, 5);
    list.forEach((p, i) => {
      const g = scaled(c.cx, c.cy, pg);
      const inner = mk('g', { transform: `translate(${(i - (list.length - 1) / 2) * 22} -22)`, class: 'fx-proj' + (o === me ? ' mine' : '') }, g);
      const prog = p.total_turns ? Math.max(0, Math.min(1, 1 - p.turns_left / p.total_turns)) : 0;
      const C = 2 * Math.PI * 10.5;
      mk('circle', { r: 9, fill: '#0b1626', 'fill-opacity': 0.9, stroke: '#07101d', 'stroke-width': 1 }, inner);
      mk('circle', { r: 10.5, fill: 'none', stroke: 'rgba(184,151,90,.25)', 'stroke-width': 2 }, inner);
      mk('circle', { r: 10.5, fill: 'none', stroke: o === me ? '#b8975a' : '#8a8f99', 'stroke-width': 2, 'stroke-dasharray': `${(C * prog).toFixed(1)} ${C.toFixed(1)}`, transform: 'rotate(-90)', 'stroke-linecap': 'round' }, inner);
      const ic = mk('g', null, inner);
      projectIcon(p.kind, ic);
      mk('title', null, inner).textContent = `${p.name || p.kind} · ${p.turns_left} turnos`;
    });
  });

  // Divisiones (propias y enemigas)
  const dg = mk('g', { class: 'fx-divs' });
  over.insertBefore(dg, partG);
  const byLoc = {};
  vals(game.divisions).forEach((d) => {
    if (d.owner !== me && !enemy(d.owner)) return;
    (byLoc[d.location] = byLoc[d.location] || []).push(d);
  });
  Object.keys(byLoc).forEach((loc) => {
    const c = at(loc); if (!c) return;
    const list = byLoc[loc].slice(0, 6);
    list.forEach((d, i) => {
      const g = scaled(c.cx, c.cy, dg);
      const inner = mk('g', { transform: `translate(${(i - (list.length - 1) / 2) * 22} 18)`, class: 'fx-div' }, g);
      divBox(d, d.owner === me ? '#e3c985' : '#e06a50', inner);
    });
  });

  // Pulso de evento activo
  if (game.active_event && at(me)) {
    const g = scaled(at(me).cx, at(me).cy, pg);
    mk('circle', { r: 16, fill: 'none', stroke: '#e3c985', 'stroke-width': 1.5, class: 'fx-pulse' }, g);
    mk('circle', { r: 16, fill: 'none', stroke: '#e3c985', 'stroke-width': 1.5, class: 'fx-pulse', style: 'animation-delay:1.2s' }, g);
  }
}

// Particulas flotantes por cambios en los recursos del jugador
function particles(game) {
  const me = game.player, c = game.countries && game.countries[me];
  if (!c) return;
  const now = { army: c.army || 0, tanks: c.tanks || 0, planes: c.planes || 0, industry: c.industry || 0 };
  const LBL = { army: 'tropas', tanks: 'tanques', planes: 'aviones', industry: 'industria' };
  if (prev && prev.me === me) {
    const g = geoR[me];
    let n = 0;
    if (g) Object.keys(now).forEach((key) => {
      const d = now[key] - prev.v[key];
      if (!d || Math.abs(d) < 0.01) return;
      const sg = scaled(g.cx, g.cy, partG);
      const t = mk('text', { x: (n % 2 ? 26 : -26), y: -30 - n * 4, 'text-anchor': 'middle', class: 'fx-float ' + (d > 0 ? 'up' : 'down'), style: `animation-delay:${(n * 0.25).toFixed(2)}s` }, sg);
      t.textContent = (d > 0 ? '+' : '−') + fmt(Math.abs(d)) + ' ' + LBL[key];
      n++;
      setTimeout(() => { sg.remove(); scal = scal.filter((x) => x.el !== sg); }, 3200);
    });
  }
  prev = { me, v: now };
}
