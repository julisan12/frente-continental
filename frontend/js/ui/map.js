// Mapa SVG interactivo: seleccion, arrastre, zoom por pellizco/rueda, hoja de pais.
import { showNews } from './more.js';
import { h, svgEl, clamp } from '../util.js';
import { icon } from '../icons.js';
import { getState, setState, subscribe, player, ownerOf, isAllied, isAtWar, relation } from '../state.js';
import { countryPanel, countryButtons } from './country.js';
import * as F from '../engine/features.js';
import * as FX from './mapfx.js';

// Tanda 2: el viewBox lo da el mapa (S.map.viewBox: 'x y w h'); 'sur' = solo America del Sur.
const VB = { x: 0, y: 0, w: 500, h: 535 };
function setVB(str) {
  const n = String(str || '').trim().split(/[\s,]+/).map(Number);
  if (n.length === 4 && n.every((v) => Number.isFinite(v)) && n[2] > 0 && n[3] > 0) { VB.x = n[0]; VB.y = n[1]; VB.w = n[2]; VB.h = n[3]; }
  else { VB.x = 0; VB.y = 0; VB.w = 500; VB.h = 535; }
  if (svg) svg.setAttribute('viewBox', `${VB.x} ${VB.y} ${VB.w} ${VB.h}`);
}
const KM_PER_UNIT = 14;
let stage, svg, world, sheet, evBox, scaleLn, scaleTxt, geo = {}, built = null;
let view = { k: 1, x: 0, y: 0 }, k0 = 1, minK = 0.5, maxK = 14;
let sheetMin = false;
const pts = new Map();

// ---- Modos de mapa ----
const MODES = [['rel', 'Relaciones'], ['res', 'Recursos'], ['war', 'Guerra'], ['pol', 'Político']];
let mode = 'rel', modeBox = null, legendBox = null;
try {
  const v = localStorage.getItem('fc.mapmode');
  // Migrar valores antiguos (eco, mil, blq, pol) a 'rel'
  if (v && !['rel', 'res', 'war', 'pol'].includes(v)) {
    mode = 'rel';
    localStorage.setItem('fc.mapmode', 'rel');
  } else if (v && MODES.some((m) => m[0] === v)) {
    mode = v;
  }
} catch (e) { /* sin LS */ }
const cb = () => document.documentElement.dataset.cb === '1';
function lerpC(a, b, t) {
  const pa = a.match(/\w\w/g).map((x) => parseInt(x, 16)), pb = b.match(/\w\w/g).map((x) => parseInt(x, 16));
  return 'rgb(' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',') + ')';
}
function divColor(v) { // v -100..100
  const c = cb() ? ['e8710a', 'd9d9d9', '1f77d4'] : ['c0645a', '8a8c78', '6fa467'];
  const t = (Math.max(-100, Math.min(100, v)) + 100) / 200;
  return t < 0.5 ? lerpC(c[0], c[1], t * 2) : lerpC(c[1], c[2], (t - 0.5) * 2);
}
function modeFill(id, owner, g, fallback) {
  const me = g.player, c = g.countries[owner];
  if (mode === 'rel') {
    // Relaciones: gris neutro, ROJO guerra, VERDE aliados/bloque, AZUL jugador
    if (owner === me) return cb() ? '#1f77d4' : '#4f7a9a';
    if (isAtWar(owner, me)) return cb() ? '#e8710a' : '#9a4a42';
    // Verde para aliados o miembros del mismo bloque que el jugador
    const blocs = (g.ext && g.ext.blocs) || {};
    const myBloc = Object.keys(blocs).find((b) => (blocs[b] || []).includes(me));
    const isInMyBloc = myBloc && (blocs[myBloc] || []).includes(owner);
    if (isAllied(owner, me) || isInMyBloc) return cb() ? '#1f77d4' : '#6fa467';
    return '#8a8c78'; // gris neutro
  }
  if (mode === 'res') {
    // Recursos: colores apagados/neutros por país
    return fallback;
  }
  if (mode === 'war') {
    // Guerra: países en guerra con jugador en rojo, jugador en azul, resto neutral
    if (owner === me) return cb() ? '#1f77d4' : '#4f7a9a';
    if (isAtWar(owner, me)) return cb() ? '#e8710a' : '#9a4a42';
    return fallback;
  }
  if (mode === 'pol') {
    // Político: degradado continuo VERDE (+100) a ROJO (-100/guerra)
    if (owner === me) return cb() ? '#1f77d4' : '#4f7a9a';
    const rel = relation(me, owner);
    const war = isAtWar(owner, me);
    const v = war ? -100 : rel;
    return divColor(v);
  }
  return fallback;
}
function setMode(m) {
  mode = m;
  try { localStorage.setItem('fc.mapmode', m); } catch (e) { /* sin LS */ }
  colorize(); renderModes();
}
function renderModes() {
  if (!modeBox) return;
  modeBox.replaceChildren(...MODES.map(([id, label]) =>
    h('button', { 'aria-pressed': String(mode === id), onclick: () => setMode(id) }, label)));
  renderLegend();
}
function renderLegend() {
  if (!legendBox) return;
  legendBox.replaceChildren();
  legendBox.style.display = '';
  const sw = (col, t) => h('div', { class: 'sw' }, h('i', { style: { background: col } }), t);
  const grad = (a, b, mid) => h('div', { class: 'grad', style: { background: `linear-gradient(90deg,${a}${mid ? ',' + mid : ''},${b})` } });
  if (mode === 'rel') {
    legendBox.append(h('div', null, 'Relación con el jugador'),
      sw(cb() ? '#1f77d4' : '#4f7a9a', 'Mi país'),
      sw(cb() ? '#e8710a' : '#9a4a42', 'En guerra'),
      sw(cb() ? '#1f77d4' : '#6fa467', 'Aliado/bloque'),
      sw('#8a8c78', 'Neutral'));
  } else if (mode === 'res') {
    legendBox.append(h('div', null, 'Recursos y edificios'),
      h('div', { class: 'muted', style: { fontSize: '10px', marginTop: '3px' } }, 'Insignias visibles solo en este modo'));
  } else if (mode === 'war') {
    legendBox.append(h('div', null, 'Teatro de operaciones'),
      sw(cb() ? '#e8710a' : '#9a4a42', 'Enemigo en guerra'),
      sw(cb() ? '#1f77d4' : '#4f7a9a', 'Mi país'),
      h('div', { class: 'muted', style: { fontSize: '10px', marginTop: '3px' } }, 'Unidades y ocupación visible'));
  } else if (mode === 'pol') {
    legendBox.append(h('div', null, 'Gradiente político'), grad(divColor(-100), divColor(100), divColor(0)),
      h('div', { class: 'lg' }, h('span', null, 'Guerra'), h('span', null, 'Neutral'), h('span', null, 'Aliado')));
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
  // view: world -> viewBox; con viewBox desplazado (x,y) el origen de la vista es (VB.x, VB.y)
  const m = 60;
  const minX = VB.x + VB.w - (VB.x + VB.w) * view.k - m, maxX = VB.x - VB.x * view.k + m;
  const minY = VB.y + VB.h - (VB.y + VB.h) * view.k - m, maxY = VB.y - VB.y * view.k + m;
  view.x = clamp(view.x, Math.min(minX, maxX), Math.max(minX, maxX));
  view.y = clamp(view.y, Math.min(minY, maxY), Math.max(minY, maxY));
}

function toLocal(cx, cy) {
  const r = sRect();
  const s = Math.min(r.width / VB.w, r.height / VB.h);
  const ox = (r.width - VB.w * s) / 2, oy = (r.height - VB.h * s) / 2;
  return { x: (cx - r.left - ox) / s + VB.x, y: (cy - r.top - oy) / s + VB.y, s };
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
  view.k = k; view.x = VB.x + VB.w / 2 - g.cx * k; view.y = VB.y + VB.h / 2 - g.cy * k;
  clampPan(); apply();
}

function build() {
  const S = getState();
  const m = S.map;
  setVB(m.viewBox);
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
  try { FX.update(g, S, mode); } catch (e) { console.warn('mapfx', e); }
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
  svg = svgEl('svg', { viewBox: `${VB.x} ${VB.y} ${VB.w} ${VB.h}`, preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': 'Mapa político de América Latina', width: '100%', height: '100%' });
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
  container.append(stage, compass, bar, btns, h('div', { class: 'mapctl' }, modeBox, legendBox), evBox, sheet);
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
