// Mapa SVG interactivo: seleccion, arrastre, zoom por pellizco/rueda, hoja de pais.
import { showNews } from './more.js';
import { h, svgEl, clamp } from '../util.js';
import { icon } from '../icons.js';
import { getState, setState, subscribe, player, ownerOf, isAllied, isAtWar, relation } from '../state.js';
import { countryPanel, countryButtons } from './country.js';
import * as F from '../engine/features.js';
import * as FX from './mapfx.js';

const VB = { w: 500, h: 535 };
const KM_PER_UNIT = 14;
let stage, svg, world, sheet, evBox, scaleLn, scaleTxt, geo = {}, built = null;
let view = { k: 1, x: 0, y: 0 }, k0 = 1, minK = 0.5, maxK = 14;
let sheetMin = false;
const pts = new Map();

// ---- Modos de mapa ----
const MODES = [['pol', 'Político'], ['rel', 'Relaciones'], ['eco', 'Economía'], ['mil', 'Militar'], ['blq', 'Bloques']];
let mode = 'pol', modeBox = null, legendBox = null;
try { const v = localStorage.getItem('fc.mapmode'); if (MODES.some((m) => m[0] === v)) mode = v; } catch (e) { /* sin LS */ }
const cb = () => document.documentElement.dataset.cb === '1';
const hasBlocs = () => { const g = getState().game; return !!(g && g.ext && g.ext.blocs && Object.keys(g.ext.blocs).length); };
function lerpC(a, b, t) {
  const pa = a.match(/\w\w/g).map((x) => parseInt(x, 16)), pb = b.match(/\w\w/g).map((x) => parseInt(x, 16));
  return 'rgb(' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',') + ')';
}
function divColor(v) { // v -100..100
  const c = cb() ? ['e8710a', 'd9d9d9', '1f77d4'] : ['c0645a', '8a8c78', '6fa467'];
  const t = (Math.max(-100, Math.min(100, v)) + 100) / 200;
  return t < 0.5 ? lerpC(c[0], c[1], t * 2) : lerpC(c[1], c[2], (t - 0.5) * 2);
}
function seqColor(t) {
  t = Math.max(0, Math.min(1, t));
  if (cb()) return t < 0.5 ? lerpC('440154', '21918c', t * 2) : lerpC('21918c', 'fde725', (t - 0.5) * 2);
  return lerpC('2b3a2a', 'd3b160', t);
}
const BLOC_COLS = ['#b8975a', '#4f7a9a', '#9a4a42', '#7b8a4a', '#8a5a9a', '#4a9a8f'];
const BLOC_CB = ['#1f77d4', '#e8710a', '#f2c200', '#7f7f7f', '#8c564b', '#17becf'];
function milOf(c) { return c ? (c.army || 0) + (c.tanks || 0) * 0.5 + (c.planes || 0) * 0.8 : 0; }
function modeFill(id, owner, g, fallback) {
  const me = g.player, c = g.countries[owner];
  if (mode === 'rel') {
    if (owner === me) return cb() ? '#f2c200' : '#b8975a';
    if (isAtWar(owner, me)) return cb() ? '#e8710a' : '#9a4a42';
    if (isAllied(owner, me)) return cb() ? '#1f77d4' : '#6b7f4a';
    return divColor(relation(me, owner));
  }
  if (mode === 'eco' || mode === 'mil') {
    const f = mode === 'eco' ? (x) => (x ? x.industry || 0 : 0) : milOf;
    const mx = Math.max(1, ...Object.keys(g.countries).map((k) => f(g.countries[k])));
    return seqColor(Math.sqrt(f(c) / mx));
  }
  if (mode === 'blq') {
    const ids = Object.keys((g.ext && g.ext.blocs) || {});
    const i = ids.findIndex((b) => (g.ext.blocs[b] || []).includes(owner));
    return i < 0 ? '#3a3d33' : (cb() ? BLOC_CB : BLOC_COLS)[i % BLOC_COLS.length];
  }
  return fallback;
}
function blocName(id) { try { return (F.BLOCS && F.BLOCS[id] && F.BLOCS[id].name) || id; } catch (e) { return id; } }
function setMode(m) {
  mode = m;
  try { localStorage.setItem('fc.mapmode', m); } catch (e) { /* sin LS */ }
  colorize(); renderModes();
}
function renderModes() {
  if (!modeBox) return;
  if (mode === 'blq' && !hasBlocs()) mode = 'pol';
  modeBox.replaceChildren(...MODES.filter((m) => m[0] !== 'blq' || hasBlocs()).map(([id, label]) =>
    h('button', { 'aria-pressed': String(mode === id), onclick: () => setMode(id) }, label)));
  renderLegend();
}
function renderLegend() {
  if (!legendBox) return;
  legendBox.replaceChildren();
  if (mode === 'pol') { legendBox.style.display = 'none'; return; }
  legendBox.style.display = '';
  const sw = (col, t) => h('div', { class: 'sw' }, h('i', { style: { background: col } }), t);
  const grad = (a, b, mid) => h('div', { class: 'grad', style: { background: `linear-gradient(90deg,${a}${mid ? ',' + mid : ''},${b})` } });
  if (mode === 'rel') {
    legendBox.append(h('div', null, 'Relación contigo'), grad(divColor(-100), divColor(100), divColor(0)),
      h('div', { class: 'lg' }, h('span', null, '-100'), h('span', null, '0'), h('span', null, '+100')),
      sw(cb() ? '#e8710a' : '#9a4a42', 'En guerra'), sw(cb() ? '#1f77d4' : '#6b7f4a', 'Aliado'));
  } else if (mode === 'eco' || mode === 'mil') {
    legendBox.append(h('div', null, mode === 'eco' ? 'Industria' : 'Fuerza militar'), grad(seqColor(0), seqColor(1)),
      h('div', { class: 'lg' }, h('span', null, 'Baja'), h('span', null, 'Alta')));
  } else if (mode === 'blq') {
    const ids = Object.keys(getState().game.ext.blocs);
    legendBox.append(h('div', null, 'Bloques'), ...ids.map((b, i) => sw((cb() ? BLOC_CB : BLOC_COLS)[i % BLOC_COLS.length], blocName(b))), sw('#3a3d33', 'Sin bloque'));
  }
}

function parseGeo(path) {
  const subs = path.split(/(?=M)/).map((s) => (s.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) || []).map(Number)).filter((a) => a.length >= 6);
  let best = null, bbox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const n of subs) {
    let a = 0, cx = 0, cy = 0;
    const p = [];
    for (let i = 0; i + 1 < n.length; i += 2) p.push([n[i], n[i + 1]]);
    p.forEach(([x, y]) => { bbox = [Math.min(bbox[0], x), Math.min(bbox[1], y), Math.max(bbox[2], x), Math.max(bbox[3], y)]; });
    for (let i = 0; i < p.length; i++) {
      const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length];
      const cr = x0 * y1 - x1 * y0;
      a += cr; cx += (x0 + x1) * cr; cy += (y0 + y1) * cr;
    }
    a /= 2;
    if (Math.abs(a) > 1e-6 && (!best || Math.abs(a) > best.area)) best = { area: Math.abs(a), x: cx / (6 * a), y: cy / (6 * a) };
  }
  if (!best) best = { area: 0, x: (bbox[0] + bbox[2]) / 2, y: (bbox[1] + bbox[3]) / 2 };
  return { bbox, cx: best.x, cy: best.y, w: bbox[2] - bbox[0] };
}

let rafQ = 0, rectC = null, seaLbls = null, ctryLbls = null, stars = null;
function sRect() { return rectC || (rectC = svg.getBoundingClientRect()); }
function apply() {
  if (rafQ) return;
  rafQ = requestAnimationFrame(() => { rafQ = 0; applyNow(); });
}
function applyNow() {
  if (!world) return; // ResizeObserver puede disparar antes de build()
  world.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
  FX.apply(view.k);
  const inv = 1 / view.k;
  if (!ctryLbls) ctryLbls = [...world.querySelectorAll('[data-lbl]')]
    .sort((a, b) => { const A = geo[a.dataset.lbl], B = geo[b.dataset.lbl]; const ar = (g) => (g.bbox[2] - g.bbox[0]) * (g.bbox[3] - g.bbox[1]); return ar(B) - ar(A); });
  const placed = [];
  ctryLbls.forEach((t) => {
    const g = geo[t.dataset.lbl];
    let show = g.w * view.k > 38;
    if (show) { // evita solapes en pantalla: el país mayor conserva su etiqueta
      const hw = t.textContent.length * 6.2 + 3, sx = g.cx * view.k, sy = g.cy * view.k;
      show = !placed.some((p) => Math.abs(p[0] - sx) < p[2] + hw && Math.abs(p[1] - sy) < 20);
      if (show) placed.push([sx, sy, hw]);
    }
    t.style.display = show ? '' : 'none';
    t.setAttribute('transform', `translate(${g.cx} ${g.cy + 1}) scale(${inv})`);
  });
  (stars || (stars = [...world.querySelectorAll('[data-star]')])).forEach((t) => {
    const g = geo[t.dataset.star];
    if (!g) return; // la estrella aun no tiene pais asignado (antes de colorize)
    t.setAttribute('transform', `translate(${g.cx} ${g.cy - 9 * inv}) scale(${inv})`);
  });
  (seaLbls || (seaLbls = [...world.querySelectorAll('.sealbl')])).forEach((t) => {
    t.setAttribute('transform', `translate(${t.dataset.x} ${t.dataset.y}) scale(${inv})`);
  });
  if (scaleLn) {
    const nice = [10, 25, 50, 100, 250, 500, 1000, 2500].find((n) => (n / KM_PER_UNIT) * view.k * rate() >= 40) || 2500;
    scaleLn.style.width = (nice / KM_PER_UNIT) * view.k * rate() + 'px';
    scaleTxt.textContent = nice + ' km';
  }
}
// misma escala que toLocal(): con 'xMidYMid meet' manda el lado que limita
function rate() { const r = sRect(); return Math.min(r.width / VB.w, r.height / VB.h) || 1; }

function clampPan() {
  const m = 60;
  view.x = clamp(view.x, VB.w - VB.w * view.k - 0 - m, m);
  view.y = clamp(view.y, VB.h - VB.h * view.k - m, m);
}

function toLocal(cx, cy) {
  const r = sRect();
  const s = Math.min(r.width / VB.w, r.height / VB.h);
  const ox = (r.width - VB.w * s) / 2, oy = (r.height - VB.h * s) / 2;
  return { x: (cx - r.left - ox) / s, y: (cy - r.top - oy) / s, s };
}
function zoomAt(cx, cy, nk) {
  nk = clamp(nk, minK, maxK);
  const p = toLocal(cx, cy);
  const wx = (p.x - view.x) / view.k, wy = (p.y - view.y) / view.k;
  view.k = nk; view.x = p.x - wx * nk; view.y = p.y - wy * nk;
  clampPan(); apply();
}
function fit() {
  view = { k: 1, x: 0, y: 0 }; k0 = 1; apply();
}
function centerOn(cid) {
  const g = geo[cid];
  if (!g) return fit();
  const k = Math.max(2.4, Math.min(5, 220 / Math.max(g.w, 30)));
  view.k = k; view.x = VB.w / 2 - g.cx * k; view.y = VB.h / 2 - g.cy * k;
  clampPan(); apply();
}

function build() {
  const S = getState();
  const m = S.map;
  geo = {};
  m.countries.forEach((c) => { geo[c.id] = parseGeo(c.path); });
  world = svgEl('g', { id: 'world' });
  svg.replaceChildren();
  // Fondo del oceano y cuadricula militar.
  const defs = svgEl('defs');
  seaLbls = ctryLbls = stars = null;
  svg.append(defs, svgEl('rect', { x: -500, y: -500, width: 1500, height: 1500, fill: 'var(--ocean, #0a1a2c)', 'data-ocean': 1 }), world);
  m.countries.forEach((c) => {
    world.append(svgEl('path', { d: c.path, 'data-id': c.id, id: 'ctry-' + String(c.id).replace(/[^a-zA-Z0-9_-]/g, '_'), fill: c.color, stroke: '#07101d', 'stroke-linejoin': 'round', class: 'ctry', tabindex: -1 }));
  });
  [['Océano Pacífico', 40, 330], ['Océano Atlántico', 440, 150], ['Mar Caribe', 235, 55]].forEach(([t, x, y]) => {
    world.append(svgEl('text', { class: 'sealbl', 'data-x': x, 'data-y': y, 'text-anchor': 'middle' }, t));
  });
  m.countries.forEach((c) => {
    world.append(svgEl('text', { class: 'lbl', 'data-lbl': c.id, 'text-anchor': 'middle', 'pointer-events': 'none' }, c.name));
  });
  world.append(svgEl('text', { class: 'star', 'data-star': 'x', 'text-anchor': 'middle', 'pointer-events': 'none', fill: '#e3c985', 'font-size': 14, style: 'display:none' }, '★'));
  try { FX.init(svg, defs, world, geo, m.countries); } catch (e) { console.warn('mapfx init', e); }
  built = m;
}

function colorize() {
  const S = getState();
  const g = S.game;
  if (!g || !world) return;
  const me = g.player;
  world.querySelectorAll('[data-id]').forEach((p) => {
    const id = p.dataset.id;
    const owner = ownerOf(id);
    const mc = S.mapById[id];
    let fill = mc.color, op = 0.92;
    if (owner === me) { fill = '#b8975a'; }
    else if (isAtWar(owner, me)) { fill = '#9a4a42'; }
    else if (isAllied(owner, me)) { fill = '#6b7f4a'; }
    else if (owner !== id) { fill = (S.mapById[owner] || mc).color; }
    if (mode !== 'pol') { try { fill = modeFill(id, owner, g, fill); } catch (e) { /* conserva político */ } }
    p.setAttribute('fill', fill);
    p.setAttribute('fill-opacity', op);
    p.classList.toggle('sel', S.selected === id);
    p.setAttribute('stroke', S.selected === id ? '#f1e3b8' : '#07101d');
  });
  const star = world.querySelector('[data-star]');
  star.dataset.star = me;
  star.style.display = '';
  const sel = world.querySelector('.ctry.sel');
  if (sel) world.insertBefore(sel, FX.anchor() || null); // sobre las demas, bajo provincias
  try { FX.update(g, S); } catch (e) { console.warn('mapfx', e); }
  world.append(star);
  apply();
}

function renderSheet() {
  const S = getState();
  sheet.replaceChildren();
  if (!S.selected || !S.game) { sheet.style.display = 'none'; return; }
  sheet.style.display = '';
  sheet.classList.toggle('min', sheetMin);
  sheet.append(
    h('button', { class: 'grab', 'aria-label': sheetMin ? 'Expandir ficha' : 'Contraer ficha', onclick: () => { sheetMin = !sheetMin; renderSheet(); } }),
    h('div', { class: 'body' }, countryPanel(S.selected), FX.provPanel(), h('div', { class: 'btns' }, countryButtons(S.selected),
      h('button', { class: 'btn sm', onclick: () => setState({ selected: null }) }, icon('close'), 'Cerrar'))));
}

function renderEvent() {
  const g = getState().game;
  evBox.replaceChildren();
  if (!g || !g.active_event) return;
  const ev = g.active_event;
  evBox.append(h('button', { class: 'evcard', 'aria-label': 'Evento activo: abrir', onclick: () => { showNews(); setState({ screen: 'more' }); } },
    h('b', null, icon('alert'), 'Evento'), h('span', { class: 't' }, ev.title || ev.name || 'Decisión pendiente')));
}

function onTap(e) {
  const t = e.target.closest && e.target.closest('[data-id]');
  const S = getState();
  if (t) {
    sheetMin = false;
    if (e.clientX != null) {
      try {
        const p = toLocal(e.clientX, e.clientY);
        FX.selectProv(FX.pickProv(t.dataset.id, (p.x - view.x) / view.k, (p.y - view.y) / view.k));
      } catch (err) { console.warn('pickProv', err); }
    }
    setState({ selected: t.dataset.id });
  }
  else if (S.selected) { FX.selectProv(null); setState({ selected: null }); }
}

function bindGestures() {
  const ptr = new Map();
  let start = null, moved = false, pinch = null;
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId);
    ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptr.size === 1) { start = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, target: e.target }; moved = false; }
    if (ptr.size === 2) {
      const [a, b] = [...ptr.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k };
      moved = true;
    }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!ptr.has(e.pointerId)) return;
    ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptr.size === 2 && pinch) {
      const [a, b] = [...ptr.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch.k * d / pinch.d);
    } else if (ptr.size === 1 && start) {
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 6) return;
      moved = true;
      const s = toLocal(0, 0).s;
      view.x = start.vx + dx / s; view.y = start.vy + dy / s;
      clampPan(); apply();
    }
  });
  const up = (e) => {
    const was = ptr.has(e.pointerId);
    ptr.delete(e.pointerId);
    if (ptr.size < 2) pinch = null;
    if (was && ptr.size === 0 && start && !moved && e.type === 'pointerup') onTap({ target: start.target, clientX: start.x, clientY: start.y });
    if (ptr.size === 0) start = null;
    else if (ptr.size === 1) { const [p] = [...ptr.values()]; start = { x: p.x, y: p.y, vx: view.x, vy: view.y, target: null }; moved = true; }
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, view.k * (e.deltaY < 0 ? 1.18 : 1 / 1.18)); }, { passive: false });
}

function btn(label, ic, fn) { return h('button', { class: 'iconbtn', 'aria-label': label, title: label, onclick: fn }, icon(ic)); }

export function mount(container) {
  stage = h('div', { class: 'map-stage' });
  svg = svgEl('svg', { viewBox: `0 0 ${VB.w} ${VB.h}`, preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': 'Mapa político de América Latina', width: '100%', height: '100%' });
  stage.append(svg);
  scaleLn = h('div', { class: 'ln' });
  scaleTxt = h('span', null, '');
  evBox = h('div', { class: 'evbox', style: { position: 'absolute', top: '8px', right: '8px', zIndex: 3 } });
  sheet = h('div', { class: 'sheet', style: { display: 'none', touchAction: 'pan-y' } });
  const compass = h('div', { class: 'compass', 'aria-hidden': 'true', html:
    '<svg viewBox="-20 -20 40 40" width="46" height="46"><circle r="17" fill="rgba(7,13,24,.7)" stroke="#b8975a" stroke-width="1"/><path d="M0 -16 L4 0 L0 16 L-4 0Z" fill="#b8975a"/><path d="M-16 0 L0 -3 L16 0 L0 3Z" fill="#7d6a42"/><text y="-19" text-anchor="middle" font-size="7" fill="#e3c985" font-family="serif">N</text></svg>' });
  const bar = h('div', { class: 'scalebar', 'aria-hidden': 'true' }, scaleLn, scaleTxt);
  const btns = h('div', { class: 'mapbtns' },
    btn('Acercar', 'plus', () => { const r = svg.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, view.k * 1.5); }),
    btn('Alejar', 'minus', () => { const r = svg.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, view.k / 1.5); }),
    btn('Centrar en mi país', 'target', () => centerOn(player())),
    btn('Texturas y provincias', 'map', () => FX.setEnabled(!FX.isEnabled())),
    btn('Ver todo el mapa', 'globe', fit));
  modeBox = h('div', { class: 'mapmodes', role: 'group', 'aria-label': 'Modo de mapa' });
  legendBox = h('div', { class: 'maplegend', 'aria-hidden': 'true', style: { display: 'none' } });
  container.append(stage, compass, bar, btns, modeBox, legendBox, evBox, sheet);
  bindGestures();
  new ResizeObserver(() => { rectC = null; apply(); }).observe(stage);
  addEventListener('scroll', () => { rectC = null; }, { passive: true });
}

export function update() {
  const S = getState();
  if (!S.map || !S.game || !svg) return;
  if (built !== S.map) { build(); fit(); }
  renderModes();
  colorize();
  renderSheet();
  renderEvent();
}

export function show() {
  update();
  apply();
}

export function focusPlayer() { centerOn(player()); }
void subscribe;
