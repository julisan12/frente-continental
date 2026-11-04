// Mapa pintado (relieve horneado en canvas), provincias funcionales y animaciones de combate/obra.
import { h, svgEl } from '../util.js';
import { ICON_PATHS } from '../icons.js';
import { getState, player, isAtWar, isAllied, ownerOf } from '../state.js';
import { toXY } from '../data/provinces.js';
import * as P from '../engine/provinces.js';
import * as PP from './provpanel.js';
import { UNIT_TYPES, kind_of } from '../engine/units.js';

const VW = 500, VH = 535;
const LS = 'fc.mapfx';
const ELEV = { M: 1, A: 0.8, E: 0.35, B: 0.3, D: 0.25, V: 0.2, T: 0.18, P: 0.12, S: 0.1 };
const TINT = {
  S: [30, 96, 36, 0.4], T: [70, 124, 48, 0.26], B: [64, 98, 52, 0.24], D: [222, 186, 120, 0.26],
  A: [170, 146, 112, 0.18], M: [128, 108, 84, 0.16], E: [178, 160, 108, 0.16], P: [150, 172, 92, 0.1], V: [186, 170, 92, 0.16],
};
export const RES_COLOR = { petroleo: '#3a3530', gas: '#2f7fe0', minerales: '#8b5fd0', cobre: '#d0702a', agro: '#6fae2e', madera: '#8a5a2c' };
export const RES_ICON = { petroleo: 'res_oil', gas: 'res_gas', minerales: 'res_min', cobre: 'res_cu', agro: 'res_agro', madera: 'res_wood' };
export const SUP_ICON = { food: 'wheat', fuel: 'fire', goods: 'box', metal: 'ingot' };
export const SUP_NAME = { food: 'Alimentos', fuel: 'Combustible', goods: 'Bienes', metal: 'Metal' };
export const INFRA_LEGEND = [['#c9a866', 'Carretera'], ['#3a3f46', 'Ferrocarril'], ['#6b5a45', 'Fortaleza'], ['#2b1d10', 'Línea defensiva']];
export const BUILD_COLOR = { base: '#7a2e2a', fabrica: '#5a6470', refineria: '#c98a2a', mina: '#6e5a48', granja: '#5b8a32' };
const TCODES = Object.keys(ELEV);
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

let enabled = true;
try { if (/[?&]debug=1/.test(location.search)) window.__fxMoves = 0; } catch (e) { /* sin window */ }
try { enabled = localStorage.getItem(LS) !== '0'; } catch (e) { /* sin storage */ }

let svgR = null, defsR = null, worldR = null, countriesR = [];
let ocean = null, paint = null, root = null, gOcc = null, gSel = null, gBadge = null, gLbl = null, gUnits = null, gInfra = null;
let bakeCache = null; // { land, sea } blob URLs
let selPid = null, lastSig = '', zoomCls = '', currentMode = 'rel';
let cellsById = null, geoById = {};

export const isEnabled = () => enabled;
export function setEnabled(v) {
  enabled = !!v;
  try { localStorage.setItem(LS, enabled ? '1' : '0'); } catch (e) { /* */ }
  if (svgR) svgR.classList.toggle('fx-off', !enabled);
}
export const anchor = () => paint;

// ---------- geometria ----------
function clipHalf(poly, a, b) {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, nx = b[0] - a[0], ny = b[1] - a[1];
  const f = (p) => (p[0] - mx) * nx + (p[1] - my) * ny;
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i + 1) % poly.length], fa = f(A), fb = f(B);
    if (fa <= 0) out.push(A);
    if ((fa <= 0) !== (fb <= 0)) { const t = fa / (fa - fb); out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]); }
  }
  return out;
}
function voronoi(sites) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  sites.forEach((s) => { x0 = Math.min(x0, s[0]); y0 = Math.min(y0, s[1]); x1 = Math.max(x1, s[0]); y1 = Math.max(y1, s[1]); });
  const M = 90, box = [[x0 - M, y0 - M], [x1 + M, y0 - M], [x1 + M, y1 + M], [x0 - M, y1 + M]];
  return sites.map((s, i) => {
    let poly = box;
    for (let j = 0; j < sites.length && poly.length; j++) if (j !== i) poly = clipHalf(poly, s, sites[j]);
    return poly;
  });
}
function geoList() { try { return P.prov_geo().list; } catch (e) { return []; } }
function provCells() {
  if (cellsById) return cellsById;
  cellsById = {};
  const by = {};
  geoList().forEach((p) => { (by[p.c] = by[p.c] || []).push(p); });
  for (const list of Object.values(by)) {
    const cs = voronoi(list.map((p) => [p.x, p.y]));
    list.forEach((p, i) => { cellsById[p.pid] = cs[i]; });
  }
  return cellsById;
}
const polyD = (poly) => poly.length ? 'M' + poly.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z' : '';
const pathOf = (cid) => { const c = countriesR.find((x) => x.id === cid); return c ? c.path : ''; };

// ---------- ruido ----------
function hash(x, y) { let n = x * 374761393 + y * 668265263; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, o) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; } return s; }

const canvas = (w, hgt) => { const c = document.createElement('canvas'); c.width = w; c.height = hgt; return c; };
const idle = () => new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 400 }) : setTimeout(r, 30)));
const toURL = (c) => new Promise((r) => {
  if (c.toBlob) c.toBlob((b) => r(b ? URL.createObjectURL(b) : c.toDataURL()), 'image/png');
  else r(c.toDataURL());
});

// ---------- horneado del relieve ----------
async function bake() {
  if (bakeCache) return bakeCache;
  const LW = 500, LH = 535; // resolucion del calculo
  const cells = provCells();
  const geo = geoList();
  const land = new Path2D();
  countriesR.forEach((c) => { try { land.addPath(new Path2D(c.path)); } catch (e) { /* */ } });

  // 1) mapas de elevacion, tinte y terreno por celda
  const elev = canvas(LW, LH), tint = canvas(LW, LH), terr = canvas(LW, LH);
  const ex = elev.getContext('2d'), tx = tint.getContext('2d'), rx = terr.getContext('2d');
  ex.fillStyle = '#000'; ex.fillRect(0, 0, LW, LH);
  for (const c of countriesR) {
    let cp; try { cp = new Path2D(c.path); } catch (e) { continue; }
    for (const g of [ex, tx, rx]) { g.save(); g.clip(cp); }
    geo.filter((p) => p.c === c.id).forEach((p) => {
      const cell = cells[p.pid]; if (!cell || !cell.length) return;
      const pp = new Path2D(polyD(cell));
      const e = ELEV[p.t] ?? 0.2, t = TINT[p.t] || [150, 150, 110, 0.25];
      ex.fillStyle = `rgb(${Math.round(e * 255)},0,0)`; ex.fill(pp);
      tx.fillStyle = `rgba(${t[0]},${t[1]},${t[2]},${t[3]})`; tx.fill(pp);
      rx.fillStyle = `rgb(${TCODES.indexOf(p.t) + 1},0,0)`; rx.fill(pp);
    });
    for (const g of [ex, tx, rx]) g.restore();
  }
  await idle();
  // 2) desenfoque (transiciones suaves entre provincias)
  const blur = (src, px) => {
    const o = canvas(LW, LH), g = o.getContext('2d');
    if ('filter' in g) { g.filter = `blur(${px}px)`; g.drawImage(src, 0, 0); }
    else { g.globalAlpha = 0.25; for (let dx = -2; dx <= 2; dx += 2) for (let dy = -2; dy <= 2; dy += 2) g.drawImage(src, dx * px / 2, dy * px / 2); }
    return o;
  };
  const eB = blur(elev, 7).getContext('2d').getImageData(0, 0, LW, LH).data;
  const tB = blur(tint, 4).getContext('2d').getImageData(0, 0, LW, LH).data;
  const rD = rx.getImageData(0, 0, LW, LH).data;
  await idle();
  // 3) altura final = base + ruido montañoso, sombreado NO, nieve, motas de selva
  const H = new Float32Array(LW * LH);
  for (let y = 0; y < LH; y++) {
    for (let x = 0; x < LW; x++) {
      const i = y * LW + x, e = eB[i * 4] / 255;
      const n = fbm(x / 22, y / 22, 5);
      const ridge = 1 - Math.abs(fbm(x / 9 + 7, y / 9 + 3, 4) * 2 - 1);
      H[i] = e * (0.55 + 0.45 * n) + e * e * ridge * 0.55 + n * 0.04;
    }
    if (y % 90 === 89) await idle();
  }
  const out = new ImageData(LW, LH), od = out.data;
  const SEL = TCODES.indexOf('S') + 1, TRO = TCODES.indexOf('T') + 1;
  for (let y = 1; y < LH - 1; y++) {
    for (let x = 1; x < LW - 1; x++) {
      const i = y * LW + x, j = i * 4;
      let r = tB[j], g = tB[j + 1], b = tB[j + 2], a = tB[j + 3] / 255;
      if (a > 0) { r /= a; g /= a; b /= a; } // des-premultiplicar
      const over = (cr, cg, cb, ca) => {
        if (ca <= 0) return;
        const na = ca + a * (1 - ca);
        r = (cr * ca + r * a * (1 - ca)) / na; g = (cg * ca + g * a * (1 - ca)) / na; b = (cb * ca + b * a * (1 - ca)) / na; a = na;
      };
      // motas de selva / vegetacion tropical
      const tc = rD[j];
      if (tc === SEL || tc === TRO) {
        const s = hash(x, y * 3), m = fbm(x / 3, y / 3, 2);
        if (m > 0.55) over(18, 62, 24, (m - 0.55) * 1.6 * (tc === SEL ? 1 : 0.6));
        else if (s > 0.93) over(90, 140, 60, 0.35);
      }
      // sombreado de colinas (luz desde el noroeste)
      const dzx = (H[i + 1] - H[i - 1]) * 9, dzy = (H[i + LW] - H[i - LW]) * 9;
      const sh = Math.max(-1, Math.min(1, -(dzx + dzy) * 0.9));
      if (sh > 0) over(255, 246, 222, sh * 0.26); else over(28, 18, 8, -sh * 0.5);
      // nieve en cumbres andinas
      const hh = H[i];
      if (hh > 0.72) over(246, 248, 252, Math.min(0.92, (hh - 0.72) * 3.2) * (0.75 + 0.25 * Math.max(0, sh)));
      // grano de papel
      over(40, 30, 15, hash(x * 7, y * 5) * 0.04);
      od[j] = r; od[j + 1] = g; od[j + 2] = b; od[j + 3] = Math.round(a * 255);
    }
    if (y % 90 === 89) await idle();
  }
  const lo = canvas(LW, LH); lo.getContext('2d').putImageData(out, 0, 0);
  // 4) composicion a 2x, recortado a tierra, fronteras provinciales
  const S2 = 2, hi = canvas(VW * S2, VH * S2), hx = hi.getContext('2d');
  hx.setTransform(S2, 0, 0, S2, 0, 0);
  hx.save(); hx.clip(land); hx.imageSmoothingQuality = 'high'; hx.drawImage(lo, 0, 0, VW, VH); hx.restore();
  hx.lineWidth = 0.35; hx.strokeStyle = 'rgba(30,20,10,.45)'; hx.setLineDash([1.2, 0.8]);
  for (const c of countriesR) {
    let cp; try { cp = new Path2D(c.path); } catch (e) { continue; }
    hx.save(); hx.clip(cp);
    geo.filter((p) => p.c === c.id).forEach((p) => { const cell = cells[p.pid]; if (cell && cell.length) hx.stroke(new Path2D(polyD(cell))); });
    hx.restore();
  }
  hx.setLineDash([]);
  // sombra interna de costa
  hx.save(); hx.clip(land); hx.lineWidth = 2.4; hx.strokeStyle = 'rgba(20,12,4,.22)'; hx.stroke(land); hx.restore();
  await idle();
  // 5) oceano: azul marino con brillo costero y reticula
  const sea = canvas(LW, LH), sx = sea.getContext('2d');
  const grd = sx.createLinearGradient(0, 0, LW * 0.4, LH);
  grd.addColorStop(0, '#0d2340'); grd.addColorStop(1, '#081830');
  sx.fillStyle = grd; sx.fillRect(0, 0, LW, LH);
  const sd = sx.getImageData(0, 0, LW, LH), sdd = sd.data;
  for (let i = 0; i < LW * LH; i++) {
    const x = i % LW, y = (i / LW) | 0, n = fbm(x / 40, y / 40, 4) - 0.5;
    sdd[i * 4] += n * 14; sdd[i * 4 + 1] += n * 20; sdd[i * 4 + 2] += n * 30;
  }
  sx.putImageData(sd, 0, 0);
  const glow = canvas(LW, LH), gx = glow.getContext('2d');
  gx.lineWidth = 7; gx.strokeStyle = 'rgba(60,150,170,.9)'; gx.stroke(land);
  gx.lineWidth = 2; gx.strokeStyle = 'rgba(150,215,220,.9)'; gx.stroke(land);
  sx.globalAlpha = 0.45; sx.drawImage(blur(glow, 6), 0, 0); sx.globalAlpha = 1;
  sx.strokeStyle = 'rgba(170,200,225,.13)'; sx.lineWidth = 0.6;
  for (let lat = -60; lat <= 20; lat += 10) { const a = toXY(lat, -100), b = toXY(lat, -20); sx.beginPath(); sx.moveTo(a[0], a[1]); sx.lineTo(b[0], b[1]); sx.stroke(); }
  for (let lon = -100; lon <= -20; lon += 10) { const a = toXY(25, lon), b = toXY(-65, lon); sx.beginPath(); sx.moveTo(a[0], a[1]); sx.lineTo(b[0], b[1]); sx.stroke(); }
  // desvanecer bordes al color del fondo para evitar costuras
  const EDGE = 'rgba(10,26,44,', fw = Math.round(LW * 0.12);
  for (const [x0, y0, x1, y1, rx0, ry0, rw, rh] of [[0,0,fw,0,0,0,fw,LH],[LW,0,LW-fw,0,LW-fw,0,fw,LH],[0,0,0,fw,0,0,LW,fw],[0,LH,0,LH-fw,0,LH-fw,LW,fw]]) {
    const g = sx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, EDGE + '1)'); g.addColorStop(1, EDGE + '0)');
    sx.fillStyle = g; sx.fillRect(rx0, ry0, rw, rh);
  }
  const [landURL, seaURL] = await Promise.all([toURL(hi), toURL(sea)]);
  bakeCache = { land: landURL, sea: seaURL };
  return bakeCache;
}

// ---------- capas vectoriales ----------
const STROKE = { fill: 'none', stroke: '#fff', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
const hexPts = (r) => Array.from({ length: 6 }, (_, k) => { const a = Math.PI / 6 + k * Math.PI / 3; return (Math.cos(a) * r).toFixed(2) + ',' + (Math.sin(a) * r).toFixed(2); }).join(' ');
/** Insignia vectorial: forma 'hex' (recursos), 'sq' (edificios) o 'circ' (unidades); borde crema y sombra. */
function badgeG(name, color, r, shape, lv) {
  const shp = (extra) => shape === 'hex' ? svgEl('polygon', { points: hexPts(r * 1.08), ...extra })
    : shape === 'sq' ? svgEl('rect', { x: -r * 0.92, y: -r * 0.92, width: r * 1.84, height: r * 1.84, rx: r * 0.36, ...extra })
    : svgEl('circle', { r, ...extra });
  const sc = (r * 1.2) / 24;
  const g = svgEl('g', { class: 'fx-ico' },
    shp({ fill: 'rgba(8,12,20,.38)', transform: `translate(${(r * 0.12).toFixed(2)} ${(r * 0.2).toFixed(2)})`, stroke: 'none', class: 'fx-bsh' }),
    shp({ fill: color, stroke: '#f3e6c4', 'stroke-width': r * 0.17, 'stroke-linejoin': 'round' }),
    svgEl('path', { d: ICON_PATHS[name] || ICON_PATHS.info, transform: `scale(${sc.toFixed(3)}) translate(-12 -12)`, ...STROKE }));
  if (lv > 1) g.append(svgEl('circle', { cx: r * 0.78, cy: r * 0.78, r: r * 0.46, fill: '#1b2230', stroke: '#f3e6c4', 'stroke-width': r * 0.1 }),
    svgEl('text', { class: 'fx-lv', x: r * 0.78, y: r * 0.8 }, String(lv)));
  return g;
}
const COLOR_RES = Object.fromEntries(Object.entries(RES_COLOR).map(([k, c]) => [c, k]));
const OLD_RES_ICON = new Set(['oil', 'gas', 'minerals', 'agri', 'derrick']);
export function iconHTML(name, color, size = 22) {
  const rk = COLOR_RES[color];
  const isRes = !!rk && OLD_RES_ICON.has(name);
  if (isRes) name = RES_ICON[rk];
  if (RES_ICON[name]) name = RES_ICON[name];
  return h('span', { class: 'fx-badge' + (isRes || name.startsWith('res_') ? ' fx-hex' : ''), style: `--c:${color};width:${size}px;height:${size}px` },
    svgEl('svg', { viewBox: '0 0 24 24', width: size * 0.62, height: size * 0.62 },
      svgEl('path', { d: ICON_PATHS[name] || ICON_PATHS.info, ...STROKE })));
}

export function init(svg, defs, world, geo, countries) {
  svgR = svg; defsR = defs; worldR = world; countriesR = countries || [];
  svg.classList.toggle('fx-off', !enabled);
  ocean = svgEl('image', { class: 'fxl fx-ocean', x: -VW, y: -VH, width: VW * 3, height: VH * 3, preserveAspectRatio: 'none' });
  paint = svgEl('image', { class: 'fxl fx-paint', x: 0, y: 0, width: VW, height: VH, preserveAspectRatio: 'none' });
  gOcc = svgEl('g', { class: 'fxl fx-occ' });
  gSel = svgEl('g', { class: 'fx-selp' });
  gBadge = svgEl('g', { class: 'fxl fx-badges' });
  gLbl = svgEl('g', { class: 'fxl fx-plbl' });
  gUnits = svgEl('g', { class: 'fxl fx-units' });
  gInfra = svgEl('g', { class: 'fxl fx-infra' });
  root = svgEl('g', { class: 'fx-root' }, gOcc, gSel, gInfra, gBadge, gLbl, gUnits);
  world.prepend(ocean);
  world.append(paint, root);
  lastSig = ''; zoomCls = '';
  geoById = {};
  for (const [cid, g] of Object.entries(geo)) geoById[cid] = g;
  const show = (c) => {
    // oceano: mosaico simple alrededor (el horneado cubre el VB central)
    ocean.setAttribute('href', c.sea); ocean.setAttribute('x', 0); ocean.setAttribute('y', 0); ocean.setAttribute('width', VW); ocean.setAttribute('height', VH);
    paint.setAttribute('href', c.land);
  };
  if (bakeCache) show(bakeCache);
  else setTimeout(() => bake().then(show).catch((e) => console.warn('mapfx bake', e)), 60);
}

export function relColor(o) {
  const me = player();
  if (o === me) return '#b8975a';
  if (isAtWar(me, o)) return document.documentElement.dataset.cb === '1' ? '#e8710a' : '#9a4a42';
  if (isAllied(me, o)) return '#6b7f4a';
  const S = getState(); return (S.mapById[o] && S.mapById[o].color) || '#777';
}

function drawLayers(game, S) {
  const pr = game.ext && game.ext.prov; if (!pr || !root) return;
  const cells = provCells(), geo = geoList();
  const me = game.player;

  // ocupacion (solo visible en modo 'war')
  gOcc.replaceChildren();
  if (currentMode === 'war') {
    const byC = {};
    for (const p of geo) { const s = pr[p.pid]; if (s && s.o !== ownerOf(p.c)) (byC[p.c] = byC[p.c] || []).push([p, s]); }
    for (const [cid, list] of Object.entries(byC)) {
      const id = 'fxc-' + cid;
      if (!defsR.querySelector('#' + CSS.escape(id))) defsR.append(svgEl('clipPath', { id }, svgEl('path', { d: pathOf(cid) })));
      const g = svgEl('g', { 'clip-path': `url(#${id})` });
      list.forEach(([p, s]) => g.append(svgEl('path', { d: polyD(cells[p.pid] || []), fill: relColor(s.o), class: 'fx-occp' })));
      gOcc.append(g);
    }
  }

  // insignias: recurso (hexagono, siempre en 'res'; z2 en otros modos) y edificios (cuadrados, z1 en 'res')
  gBadge.replaceChildren();
  for (const p of geo) {
    const s = pr[p.pid]; if (!s) continue;
    const blds = [];
    for (const [k, lv] of Object.entries(s.b || {})) {
      if (lv > 0 && P.BUILD[k] && !INFRA_KEYS.has(k)) blds.push([P.BUILD[k].icon, BUILD_COLOR[k] || '#555', lv]);
    }
    if (s.q) blds.push(['crane', '#b8975a', 0]);
    const px = p.x.toFixed(1);
    if (s.r && P.RES[s.r]) {
      const g = svgEl('g', { class: 'fx-b-res', transform: `translate(${px} ${p.y.toFixed(1)})` });
      g.append(svgEl('g', { class: 'fx-bsc' }, badgeG(RES_ICON[s.r] || P.RES[s.r].icon, RES_COLOR[s.r] || '#555', 5.4, 'hex', 0)));
      gBadge.append(g);
    }
    if (blds.length) {
      const g = svgEl('g', { class: 'fx-b-bld', transform: `translate(${px} ${(p.y + (s.r ? 10.5 : 0)).toFixed(1)})` });
      const inner = svgEl('g', { class: 'fx-bsc' });
      const shown = blds.slice(0, 4), extra = blds.length - shown.length, n = shown.length + (extra ? 1 : 0);
      shown.forEach(([ic, col, lv], k) => {
        const b = badgeG(ic, col, 4.4, 'sq', lv);
        b.setAttribute('transform', `translate(${((k - (n - 1) / 2) * 9.6).toFixed(1)} 0)`);
        inner.append(b);
      });
      if (extra) inner.append(svgEl('text', { class: 'fx-more', x: ((n - 1) / 2 * 9.6).toFixed(1), y: 0.4 }, '+' + extra));
      g.append(inner); gBadge.append(g);
    }
  }

  drawInfra(pr, geo, cells);

  // nombres de provincia (siempre)
  gLbl.replaceChildren();
  for (const p of geo) {
    const s = pr[p.pid]; if (!s) continue;
    gLbl.append(svgEl('g', { transform: `translate(${p.x.toFixed(1)} ${(p.y + 7).toFixed(1)})` },
      svgEl('text', { class: 'fx-pn fx-sc' + (s.cap ? ' cap' : '') }, p.n)));
  }

  // marcadores de unidades (solo visible en modo 'war')
  gUnits.replaceChildren();
  if (currentMode === 'war' && game.divisions) {
    drawUnits(game, S);
  }

  drawSel();
}

const INFRA_KEYS = new Set(['carretera', 'ferrocarril', 'fuerte', 'linea']);
function clipFor(cid) {
  const id = 'fxc-' + cid;
  if (!defsR.querySelector('#' + CSS.escape(id))) defsR.append(svgEl('clipPath', { id }, svgEl('path', { d: pathOf(cid) })));
  return id;
}
/** Capa de infraestructura: carreteras, ferrocarril, fortalezas y lineas defensivas (recortada al pais). */
function drawInfra(pr, geo, cells) {
  gInfra.replaceChildren();
  const G = P.prov_geo(), adj = G.adj;
  const lvl = (pid, k) => (pr[pid] && pr[pid].b && pr[pid].b[k]) || 0;
  const byC = {};
  const slot = (cid) => byC[cid] || (byC[cid] = { road: {}, rail: {}, fort: [], line: [] });
  for (const p of geo) {
    const st = pr[p.pid]; if (!st || !st.b) continue;
    const b = st.b, S = slot(p.c);
    // trazos hacia el punto medio de cada vecina conectada (cada provincia dibuja su mitad)
    for (const [key, dst] of [['carretera', S.road], ['ferrocarril', S.rail]]) {
      const l0 = b[key] || 0; if (l0 < 1) continue;
      let any = false;
      for (const q of adj[p.pid] || []) {
        const lq = lvl(q, key); if (lq < 1) continue;
        any = true;
        const g = G.byId[q], l = Math.min(l0, lq);
        (dst[l] = dst[l] || []).push(`M${p.x.toFixed(1)} ${p.y.toFixed(1)}L${((p.x + g.x) / 2).toFixed(1)} ${((p.y + g.y) / 2).toFixed(1)}`);
      }
      if (!any) { // tramo corto hacia la vecina propia mas cercana
        let best = null, bd = Infinity;
        for (const q of adj[p.pid] || []) { const g = G.byId[q]; if (!pr[q] || pr[q].o !== st.o) continue; const d = (g.x - p.x) ** 2 + (g.y - p.y) ** 2; if (d < bd) { bd = d; best = g; } }
        if (best) (dst[l0] = dst[l0] || []).push(`M${p.x.toFixed(1)} ${p.y.toFixed(1)}L${(p.x + (best.x - p.x) * 0.3).toFixed(1)} ${(p.y + (best.y - p.y) * 0.3).toFixed(1)}`);
      }
    }
    if ((b.fuerte || 0) >= 1) S.fort.push([p, b.fuerte]);
    if ((b.linea || 0) >= 1) S.line.push([p, b.linea, st.o]);
  }
  const RW = { 1: 1.5, 2: 2.1, 3: 2.7 };
  for (const [cid, S] of Object.entries(byC)) {
    const g = svgEl('g', { 'clip-path': `url(#${clipFor(cid)})` });
    // lineas defensivas: zigzag en los lados que miran a otro dueno
    const zz = [];
    for (const [p, lv, owner] of S.line) {
      const cell = cells[p.pid]; let hit = false;
      if (cell && cell.length > 2) {
        for (let i = 0; i < cell.length; i++) {
          const a = cell[i], c2 = cell[(i + 1) % cell.length], mx = (a[0] + c2[0]) / 2, my = (a[1] + c2[1]) / 2;
          const dp = Math.hypot(mx - p.x, my - p.y); let q2 = null, qd = Infinity;
          for (const q of adj[p.pid] || []) { const gq = G.byId[q]; const d = Math.hypot(mx - gq.x, my - gq.y); if (d < qd) { qd = d; q2 = q; } }
          if (!q2 || qd - dp > 1.6 || !pr[q2] || pr[q2].o === owner) continue;
          hit = true; zz.push(zigzag(a, c2, p, lv));
        }
      }
      if (!hit) zz.push(zigzag([p.x - 7, p.y - 9], [p.x + 7, p.y - 9], p, lv));
    }
    if (zz.length) { const d = zz.join(''); g.append(svgEl('path', { d, class: 'fx-line-c' }), svgEl('path', { d, class: 'fx-line' })); }
    for (const l of [1, 2, 3]) if (S.road[l]) { const d = S.road[l].join(''); g.append(svgEl('path', { d, class: 'fx-road-c', 'stroke-width': RW[l] + 1.5 }), svgEl('path', { d, class: 'fx-road', 'stroke-width': RW[l] })); }
    for (const l of [1, 2]) if (S.rail[l]) { const d = S.rail[l].join(''); g.append(svgEl('path', { d, class: 'fx-rail-c', 'stroke-width': RW[l] + 1.4 + l * 0.4 }), svgEl('path', { d, class: 'fx-rail', 'stroke-width': RW[l] + 0.4 + l * 0.4 })); }
    for (const [p, lv] of S.fort) {
      const f = svgEl('g', { class: 'fx-inf-sym', transform: `translate(${(p.x + 8).toFixed(1)} ${(p.y - 6).toFixed(1)})` });
      f.append(svgEl('g', { class: 'fx-bsc' }, fortG(lv)));
      g.append(f);
    }
    gInfra.append(g);
  }
}
function zigzag(a, b, p, lv) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  const steps = Math.max(2, Math.round(len / 2.2)), nx = -dy / len, ny = dx / len;
  // desplazamiento hacia el interior de la celda
  const sgn = ((p.x - a[0]) * nx + (p.y - a[1]) * ny) >= 0 ? 1 : -1, amp = 0.8 + 0.3 * lv;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, off = sgn * (1 + (i % 2 ? amp : -amp * 0.2));
    d += (i ? 'L' : 'M') + (a[0] + dx * t + nx * off).toFixed(1) + ' ' + (a[1] + dy * t + ny * off).toFixed(1);
  }
  return d;
}
/** Simbolo de bastion: muralla con almenas; nivel 2 = doble muralla con torres doradas. */
function fortG(lv) {
  const body = 'M-4.4 3.6V-1.6h1.8V-3.4h1.6v1.8h2v-1.8h1.6v1.8h1.8v-1.8h1.6v1.8H4.4V3.6z';
  const g = svgEl('g', { class: 'fx-fort' });
  g.append(svgEl('ellipse', { cx: 0.4, cy: 4, rx: 5.6, ry: 1.4, fill: 'rgba(8,12,20,.35)' }));
  if (lv >= 2) g.append(svgEl('path', { d: 'M-6.2 4.4V-3.6h1.6v-1.6h1.6v1.6h1.2 M6.2 4.4V-3.6H4.6v-1.6H3', fill: '#8a7448', stroke: '#f3e6c4', 'stroke-width': 0.5, 'stroke-linejoin': 'round' }));
  g.append(svgEl('path', { d: body, fill: lv >= 2 ? '#8a6a3a' : '#6b5a45', stroke: '#f3e6c4', 'stroke-width': 0.6, 'stroke-linejoin': 'round' }),
    svgEl('path', { d: 'M-1.2 3.6V.6a1.2 1.2 0 0 1 2.4 0v3', fill: '#1b140c' }));
  return g;
}

function drawUnits(game, S) {
  if (!gUnits || !game.divisions) return;
  const me = game.player;

  // Agrupar divisiones propias y aliadas por país
  const byCountry = {};
  for (const d of game.divisions) {
    const loc = d.location;
    if (!loc) continue;
    if (!byCountry[loc]) byCountry[loc] = [];
    byCountry[loc].push(d);
  }

  // Dibujar marcadores por país
  for (const [cid, divs] of Object.entries(byCountry)) {
    const g = geoById[cid];
    if (!g) continue;

    // Agrupar por tipo
    const byType = {};
    for (const d of divs) { const kind = kind_of(d); byType[kind] = (byType[kind] || 0) + 1; }

    // Una insignia por tipo, en fila centrada sobre el pais
    const types = Object.keys(byType), n = Math.min(types.length, 6);
    const row = svgEl('g', { transform: `translate(${g.cx.toFixed(1)} ${(g.cy - 10).toFixed(1)})`, class: 'fx-unit' });
    const inner = svgEl('g', { class: 'fx-bsc' });
    types.slice(0, 6).forEach((kind, i) => {
      const ut = UNIT_TYPES[kind] || UNIT_TYPES.inf;
      const badge = badgeG(ut.icon || 'infantry', ut.color || '#7b8a4a', 5, 'circ', byType[kind]);
      badge.setAttribute('transform', `translate(${((i - (n - 1) / 2) * 11.2).toFixed(1)} 0)`);
      inner.append(badge);
    });
    row.append(inner); gUnits.append(row);
  }

  // Marcadores de estimación para países EN GUERRA con el jugador
  for (const [cid, c] of Object.entries(game.countries)) {
    if (!c || cid === me || !isAtWar(cid, me)) continue;
    const g = geoById[cid];
    if (!g) continue;

    const army = c.army || 0, tanks = c.tanks || 0, planes = c.planes || 0;
    if (army === 0 && tanks === 0 && planes === 0) continue;

    const ug = svgEl('g', { transform: `translate(${g.cx.toFixed(1)} ${g.cy.toFixed(1)})`, class: 'fx-unit fx-enemy' });
    const inner = svgEl('g', { class: 'fx-sc' });
    const badge = svgEl('g', { class: 'fx-ico' },
      svgEl('circle', { r: 5, fill: '#9a4a42', stroke: '#f3e6c4', 'stroke-width': 0.8 }),
      svgEl('text', { class: 'fx-est', x: 0, y: 0.8 }, '?'));
    inner.append(badge);
    ug.append(inner);
    gUnits.append(ug);
  }
}

function drawSel() {
  if (!gSel) return;
  gSel.replaceChildren();
  if (!selPid) return;
  const gp = P.prov_geo().byId[selPid]; const cell = provCells()[selPid];
  if (!gp || !cell) return;
  const id = 'fxc-' + gp.c;
  if (!defsR.querySelector('#' + CSS.escape(id))) defsR.append(svgEl('clipPath', { id }, svgEl('path', { d: pathOf(gp.c) })));
  gSel.append(svgEl('g', { 'clip-path': `url(#${id})` },
    svgEl('path', { d: polyD(cell), class: 'fx-selfill' }),
    svgEl('path', { d: polyD(cell), class: 'fx-seledge' })));
}

export function apply(k) {
  if (!root) return;
  const ik = 1 / Math.max(1, k * 0.85);
  root.style.setProperty('--ik', ik.toFixed(3));
  root.style.setProperty('--bk', (ik * Math.min(1.45, 0.88 + 0.1 * k)).toFixed(3)); // insignias: crecen con el zoom, con tope
  const z = (k >= 1.8 ? ' z1' : '') + (k >= 3.2 ? ' z2' : '');
  const m = ' m-' + currentMode;
  const cls = 'fx-root' + z + m;
  if (cls !== root.getAttribute('class')) root.setAttribute('class', cls);
  zoomCls = z;
}

// ---------- estado del juego ----------
let prevLv = null, seenFx = new Set(), firstUpdate = true;
const recent = new Map(); // animaciones lanzadas por el jugador (evitar duplicado)

// ---------- movimiento de unidades ----------
let prevLoc = null, prevGame = null, prevTurn = -1, pendingMoves = [];
const mapVisible = () => !!(svgR && svgR.isConnected && document.querySelector('.map-screen:not([hidden])'));
function trackMoves(game) {
  const gid = String(game.id ?? '') + '|' + game.player;
  if (gid !== prevGame || game.turn < prevTurn) { prevGame = gid; prevLoc = null; pendingMoves = []; }
  prevTurn = game.turn;
  const cur = {};
  for (const d of game.divisions || []) if (d && d.location) cur[d.id] = d.location;
  if (prevLoc) {
    for (const d of game.divisions || []) {
      const from = prevLoc[d.id];
      if (from && d.location && from !== d.location && geoById[from] && geoById[d.location]) pendingMoves.push({ from, to: d.location, kind: kind_of(d) });
    }
    if (pendingMoves.length > 24) pendingMoves = pendingMoves.slice(-24);
  }
  prevLoc = cur;
  if (pendingMoves.length && reduced()) pendingMoves = [];
  flushMoves();
}
// Reproduce los movimientos pendientes cuando el mapa esta visible y no hay un modal (informe de turno) encima.
let flushTimer = 0;
function flushMoves() {
  if (!pendingMoves.length) return;
  const modal = document.querySelector('#modal-root .overlay');
  if (mapVisible() && !modal && enabled) {
    pendingMoves.slice(0, 8).forEach((m, i) => FXQ.move(m.from, m.to, m.kind, null, 300 + i * 120));
    pendingMoves = [];
    return;
  }
  if (!flushTimer) flushTimer = setTimeout(() => { flushTimer = 0; flushMoves(); }, 400);
}

let lastGameKey = '';
export function update(game, S, mode) {
  currentMode = mode || 'rel';
  // partida distinta (nueva partida o cambio de variante): sin animaciones de obras/combates heredadas
  const gkey = game ? String(game.id ?? '') + '|' + (game.variant || 'latam') : '';
  if (gkey !== lastGameKey) { lastGameKey = gkey; prevLv = null; seenFx = new Set(); firstUpdate = true; lastSig = ''; }
  try { if (game) trackMoves(game); } catch (e) { console.warn('mapfx move', e); }
  const pr = game && game.ext && game.ext.prov; if (!pr) return;
  const sig = game.turn + '|' + currentMode + '|' + (game.divisions || []).map((d) => d.id + d.location).join(',') + '|' + Object.entries(pr).map(([k, s]) => k + s.o + JSON.stringify(s.b) + (s.q ? s.q.kind + s.q.turns : '') + (s.fx ? s.fx.k + s.fx.t : '')).join(',');
  if (sig === lastSig) return;
  lastSig = sig;
  drawLayers(game, S);
  // obras completadas y combates del turno
  const lv = {};
  let n = 0;
  for (const [pid, s] of Object.entries(pr)) {
    for (const [k, l] of Object.entries(s.b || {})) {
      lv[pid + ':' + k] = l;
      if (prevLv && l > (prevLv[pid + ':' + k] || 0) && !recent.has('b' + pid + k) && n < 6) { n++; FXQ.build(pid, k, true); }
    }
    if (s.fx && s.fx.t >= game.turn - 1) {
      const key = pid + ':' + s.fx.t + ':' + s.fx.k;
      if (!seenFx.has(key)) {
        seenFx.add(key);
        if (!firstUpdate && !recent.has('a' + pid) && n < 6) { n++; FXQ.attack(pid, s.fx.k === 'win', s.o); }
      }
    }
  }
  prevLv = lv; firstUpdate = false;
  fillPanel();
  apply(1); // Forzar actualización de clase
}

export function pickProv(cid, wx, wy) {
  let best = null, bd = Infinity;
  for (const p of geoList()) {
    if (p.c !== cid) continue;
    const d = (p.x - wx) ** 2 + (p.y - wy) ** 2;
    if (d < bd) { bd = d; best = p.pid; }
  }
  return best;
}
export function selectProv(pid) {
  selPid = pid || null;
  drawSel();
  fillPanel();
}

// ---------- panel de provincia (delegado a provpanel.js) ----------
export const selectedProv = () => selPid;
/** Marca una animacion lanzada por el jugador para no repetirla al recibir el estado (key: 'b'+pid+kind | 'a'+pid). */
export function markRecent(key) { recent.set(key, Date.now()); setTimeout(() => recent.delete(key), 8000); }
export function provPanel() { return PP.provPanel(); }
function fillPanel() { try { PP.refresh(); } catch (e) { console.warn('provpanel', e); } }

// ---------- animaciones en canvas ----------
let cv = null, cx = null, effects = [], raf = 0, dpr = 1;

function ensureCanvas() {
  const host = svgR && svgR.parentNode; if (!host) return false;
  if (!cv || cv.parentNode !== host) {
    cv = h('canvas', { class: 'fx-canvas' });
    host.append(cv); cx = cv.getContext('2d');
  }
  dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = host.clientWidth, hh = host.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(hh * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); }
  return true;
}
function projector() {
  const m = worldR && worldR.getScreenCTM(); const r = cv.getBoundingClientRect();
  if (!m) return null;
  return { pt: (x, y) => [m.a * x + m.c * y + m.e - r.left, m.b * x + m.d * y + m.f - r.top], k: Math.hypot(m.a, m.b) };
}
function push(e) {
  if (!enabled || !ensureCanvas()) return;
  e.t0 = performance.now() + (e.delay || 0);
  effects.push(e);
  if (!raf) raf = requestAnimationFrame(frame);
}
function frame(now) {
  raf = 0;
  const pj = projector(); if (!pj) { effects = []; return; }
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cx.clearRect(0, 0, cv.width, cv.height);
  effects = effects.filter((e) => {
    const t = (now - e.t0) / 1000;
    if (t < 0) return true;
    if (t > e.dur) { if (e.end) e.end(); return false; }
    cx.save(); e.draw(cx, t, pj); cx.restore();
    return true;
  });
  if (effects.length) raf = requestAnimationFrame(frame);
  else cx.clearRect(0, 0, cv.width, cv.height);
}
const ease = (t) => 1 - (1 - t) ** 3;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function geoOf(pid) { return P.prov_geo().byId[pid]; }
function originFor(pid, ent) {
  const G = P.prov_geo(); const pr = getState().game.ext.prov;
  for (const q of G.adj[pid] || []) if (pr[q] && pr[q].o === ent) return G.byId[q];
  const g = G.byId[pid]; return { x: g.x - 30, y: g.y - 20 };
}

function floatText(x, y, txt, color, delay = 0, size = 15) {
  push({ dur: 2.2, delay, draw(c, t, pj) {
    const [sx, sy] = pj.pt(x, y);
    const a = t < 0.2 ? t / 0.2 : 1 - clamp01((t - 1.5) / 0.7);
    c.globalAlpha = a;
    c.font = `800 ${size}px "Cinzel", Georgia, serif`; c.textAlign = 'center';
    c.lineWidth = 4; c.strokeStyle = 'rgba(7,12,20,.9)'; c.fillStyle = color;
    const yy = sy - 18 - ease(clamp01(t / 1.6)) * 26;
    c.strokeText(txt, sx, yy); c.fillText(txt, sx, yy);
  } });
}

/** Botin de conquista: dinero y recurso ganado, en texto flotante dorado con el icono del recurso. */
function lootText(x, y, loot, delay) {
  const lines = [];
  if (loot.money) lines.push([null, '+$' + Math.round(loot.money * 10) + ' M']);
  if (loot.res && loot.amt) lines.push([SUP_ICON[loot.res], '+' + loot.amt + ' ' + (SUP_NAME[loot.res] || loot.res)]);
  if (!lines.length) return;
  const paths = lines.map(([ic]) => ic ? new Path2D(ICON_PATHS[ic]) : null);
  push({ dur: 2.6, delay, draw(c, t, pj) {
    const [sx, sy] = pj.pt(x, y);
    const a = t < 0.25 ? t / 0.25 : 1 - clamp01((t - 1.9) / 0.7), rise = ease(clamp01(t / 1.8)) * 22;
    c.globalAlpha = a; c.textAlign = 'center'; c.font = '800 13px "Cinzel", Georgia, serif'; c.lineJoin = 'round';
    lines.forEach(([ic, txt], i) => {
      const yy = sy - 40 - rise + i * 17, w = c.measureText(txt).width, off = ic ? 9 : 0;
      c.lineWidth = 4; c.strokeStyle = 'rgba(7,12,20,.92)'; c.fillStyle = '#f0c45a';
      c.strokeText(txt, sx + off, yy); c.fillText(txt, sx + off, yy);
      if (ic) {
        c.save(); c.translate(sx - w / 2 - 2, yy - 14); c.scale(16 / 24, 16 / 24);
        c.strokeStyle = 'rgba(7,12,20,.92)'; c.lineWidth = 5; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(paths[i]);
        c.strokeStyle = '#f0c45a'; c.lineWidth = 2.2; c.stroke(paths[i]); c.restore();
      }
    });
  } });
}

function explosion(x, y, delay, big = 1) {
  const parts = Array.from({ length: 14 }, () => ({ a: Math.random() * Math.PI * 2, v: 40 + Math.random() * 90, s: 1 + Math.random() * 2.2 }));
  const smoke = Array.from({ length: 5 }, () => ({ dx: (Math.random() - 0.5) * 18, r: 6 + Math.random() * 6 }));
  push({ dur: 2.0, delay, draw(c, t, pj) {
    const [sx, sy] = pj.pt(x, y);
    // destello
    if (t < 0.15) { c.globalAlpha = 1 - t / 0.15; c.fillStyle = '#fff6d0'; c.beginPath(); c.arc(sx, sy, 26 * big, 0, 7); c.fill(); }
    // bola de fuego
    if (t < 0.7) {
      const r = (8 + ease(t / 0.7) * 16) * big, g = c.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, 'rgba(255,250,210,1)'); g.addColorStop(0.35, 'rgba(255,170,50,.95)'); g.addColorStop(0.75, 'rgba(200,60,20,.7)'); g.addColorStop(1, 'rgba(80,20,10,0)');
      c.globalAlpha = 1 - t / 0.7; c.fillStyle = g; c.beginPath(); c.arc(sx, sy, r, 0, 7); c.fill();
    }
    // onda expansiva
    if (t < 0.6) { c.globalAlpha = (1 - t / 0.6) * 0.8; c.strokeStyle = '#ffe2a0'; c.lineWidth = 2.5; c.beginPath(); c.arc(sx, sy, (6 + ease(t / 0.6) * 38) * big, 0, 7); c.stroke(); }
    // escombros
    c.fillStyle = '#3a2a1a';
    parts.forEach((p) => {
      const tt = Math.min(t, 0.9);
      const px = sx + Math.cos(p.a) * p.v * tt * big, py = sy + Math.sin(p.a) * p.v * tt * big + 120 * tt * tt;
      c.globalAlpha = 1 - clamp01(t / 0.9); c.fillRect(px, py, p.s, p.s);
    });
    // humo
    smoke.forEach((m, i) => {
      const tt = t - 0.15 - i * 0.06; if (tt <= 0) return;
      c.globalAlpha = 0.55 * (1 - clamp01(tt / 1.7));
      c.fillStyle = i % 2 ? 'rgba(70,64,58,1)' : 'rgba(110,104,96,1)';
      c.beginPath(); c.arc(sx + m.dx * (1 + tt), sy - tt * 28, (m.r + tt * 12) * big, 0, 7); c.fill();
    });
  } });
}

function shell(o, d, delay, onHit) {
  const trail = [];
  push({ dur: 0.75, delay, end: onHit, draw(c, t, pj) {
    const u = t / 0.75;
    const [ax, ay] = pj.pt(o.x, o.y), [bx, by] = pj.pt(d.x, d.y);
    const mx = (ax + bx) / 2, my = Math.min(ay, by) - 40 - Math.hypot(bx - ax, by - ay) * 0.25;
    const q = (a, m, b) => (1 - u) * (1 - u) * a + 2 * (1 - u) * u * m + u * u * b;
    const x = q(ax, mx, bx), y = q(ay, my, by);
    trail.push([x, y]); if (trail.length > 9) trail.shift();
    c.lineCap = 'round';
    for (let i = 1; i < trail.length; i++) {
      c.globalAlpha = i / trail.length * 0.7; c.strokeStyle = '#ffcf7a'; c.lineWidth = 1 + i * 0.35;
      c.beginPath(); c.moveTo(trail[i - 1][0], trail[i - 1][1]); c.lineTo(trail[i][0], trail[i][1]); c.stroke();
    }
    c.globalAlpha = 1; c.fillStyle = '#fff2c0'; c.beginPath(); c.arc(x, y, 2.6, 0, 7); c.fill();
    // fogonazo del cañon
    if (u < 0.15) { c.globalAlpha = 1 - u / 0.15; c.fillStyle = '#ffd27a'; c.beginPath(); c.arc(ax, ay, 9, 0, 7); c.fill(); }
  } });
}

const FXQ = {
  // descarga de artilleria inmediata al pulsar (mientras responde el servidor)
  barrage(pid, ent) {
    const d = geoOf(pid); if (!d) return;
    if (reduced()) return;
    const o = originFor(pid, ent);
    for (let i = 0; i < 3; i++) {
      const jx = (Math.random() - 0.5) * 6, jy = (Math.random() - 0.5) * 6;
      shell(o, { x: d.x + jx, y: d.y + jy }, i * 180, () => explosion(d.x + jx, d.y + jy, 0, 0.8 + Math.random() * 0.4));
    }
  },
  attack(pid, win, ent, afterBarrage) {
    const d = geoOf(pid); if (!d) return;
    const delay = afterBarrage ? 900 : 0;
    if (!afterBarrage && !reduced()) {
      const o = originFor(pid, ent);
      for (let i = 0; i < 2; i++) shell(o, d, i * 200, () => explosion(d.x, d.y, 0, 1));
    }
    const at = afterBarrage ? delay : 800;
    if (win) {
      const col = relColor(ent);
      push({ dur: 2.4, delay: at, draw(c, t, pj) {
        const [sx, sy] = pj.pt(d.x, d.y);
        const rise = ease(clamp01(t / 0.4)), a = 1 - clamp01((t - 1.9) / 0.5);
        c.globalAlpha = a;
        c.strokeStyle = '#2a2016'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx, sy - 26 * rise); c.stroke();
        const top = sy - 26 * rise, wv = Math.sin(t * 9) * 2.5;
        c.fillStyle = col; c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(sx, top); c.quadraticCurveTo(sx + 8, top + wv, sx + 16, top + 1);
        c.lineTo(sx + 16, top + 10); c.quadraticCurveTo(sx + 8, top + 9 + wv, sx, top + 9); c.closePath(); c.fill(); c.stroke();
        c.globalAlpha = a * (1 - clamp01(t / 0.8)); c.strokeStyle = col; c.lineWidth = 3;
        c.beginPath(); c.arc(sx, sy, 6 + t * 40, 0, 7); c.stroke();
      } });
      floatText(d.x, d.y, '¡CONQUISTADA!', '#f3dc9a', at + 200);
      try {
        const pst = getState().game.ext.prov[pid];
        const lt = pst && pst.fx && pst.fx.loot;
        if (lt) lootText(d.x, d.y, lt, at + 700);
      } catch (e) { /* sin botin */ }
    } else {
      floatText(d.x, d.y, 'REPELIDO', '#ff8a74', at + 100);
    }
  },
  /** Marcha de una unidad entre dos paises: marcador con icono que recorre una curva con estela y "pop" al llegar. */
  move(fromCid, toCid, kind, color, delay = 0) {
    const a = geoById[fromCid], b = geoById[toCid]; if (!a || !b || reduced()) return;
    if (typeof window !== 'undefined' && window.__fxMoves !== undefined) window.__fxMoves++;
    const ut = UNIT_TYPES[kind] || UNIT_TYPES.inf, col = color || ut.color || '#7b8a4a';
    const ip = new Path2D(ICON_PATHS[ut.icon] || ICON_PATHS.info);
    const trail = [], D = 1.1;
    push({ dur: D + 0.55, delay, draw(c, t, pj) {
      const [ax, ay] = pj.pt(a.cx, a.cy), [bx, by] = pj.pt(b.cx, b.cy);
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const mx = (ax + bx) / 2 - (by - ay) / len * len * 0.18, my = (ay + by) / 2 + (bx - ax) / len * len * 0.18 - 14;
      const at = (u) => [(1 - u) * (1 - u) * ax + 2 * (1 - u) * u * mx + u * u * bx, (1 - u) * (1 - u) * ay + 2 * (1 - u) * u * my + u * u * by];
      const u = t < D ? (t / D < 0.5 ? 2 * (t / D) ** 2 : 1 - 2 * (1 - t / D) ** 2) : 1, [x, y] = at(u);
      if (t < D) { trail.push([x, y]); if (trail.length > 14) trail.shift(); }
      const fade = t < D ? 1 : 1 - clamp01((t - D) / 0.55);
      // estela
      trail.forEach(([tx, ty], i) => { c.globalAlpha = (i / trail.length) * 0.5 * fade; c.fillStyle = '#f3dc9a'; c.beginPath(); c.arc(tx, ty, 1 + i * 0.18, 0, 7); c.fill(); });
      // marcador
      c.globalAlpha = fade; c.fillStyle = col; c.strokeStyle = '#f3e6c4'; c.lineWidth = 2;
      c.beginPath(); c.arc(x, y, 11, 0, 7); c.fill(); c.stroke();
      c.save(); c.translate(x, y); c.scale(14 / 24, 14 / 24); c.translate(-12, -12);
      c.strokeStyle = '#fff'; c.lineWidth = 2.4; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(ip); c.restore();
      // pop al llegar
      if (t >= D) { const q = (t - D) / 0.55; c.globalAlpha = 1 - q; c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.arc(bx, by, 11 + q * 26, 0, 7); c.stroke(); }
    } });
  },
  build(pid, kind, quick) {
    const d = geoOf(pid); const B = P.BUILD[kind]; if (!d || !B) return;
    const col = BUILD_COLOR[kind] || '#b8975a';
    const ip = new Path2D(ICON_PATHS[B.icon] || ICON_PATHS.info), crane = new Path2D(ICON_PATHS.crane);
    const T = quick || reduced() ? 0 : 1.4; // duracion de la grua
    if (T) {
      const sparks = [];
      push({ dur: T, draw(c, t, pj) {
        const [sx, sy] = pj.pt(d.x, d.y);
        const a = clamp01(t / 0.2) * (1 - clamp01((t - T + 0.25) / 0.25));
        c.globalAlpha = a;
        // grua (icono a 30px) con el gancho bajando
        c.save(); c.translate(sx - 15, sy - 34); c.scale(30 / 24, 30 / 24);
        c.strokeStyle = '#f0c45a'; c.lineWidth = 2.2; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(crane); c.restore();
        const hookY = sy - 26 + Math.abs(Math.sin(t * 4)) * 14;
        c.strokeStyle = '#d8d2c0'; c.lineWidth = 1; c.beginPath(); c.moveTo(sx + 10, sy - 30); c.lineTo(sx + 10, hookY); c.stroke();
        c.fillStyle = '#7a6a50'; c.fillRect(sx + 6, hookY, 8, 5);
        // chispas de soldadura
        if (Math.random() < 0.7) sparks.push({ x: sx + (Math.random() - 0.5) * 10, y: sy - 3, vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 60, t0: t });
        c.fillStyle = '#ffe28a';
        for (const s of sparks) {
          const tt = t - s.t0; if (tt > 0.5) continue;
          c.globalAlpha = a * (1 - tt / 0.5);
          c.fillRect(s.x + s.vx * tt, s.y + s.vy * tt + 160 * tt * tt, 1.6, 1.6);
        }
        // andamio / barra de progreso
        c.globalAlpha = a; c.fillStyle = 'rgba(7,12,20,.75)'; c.fillRect(sx - 16, sy + 6, 32, 4);
        c.fillStyle = col === '#5a6470' ? '#9aa6b4' : col; c.fillRect(sx - 16, sy + 6, 32 * clamp01(t / T), 4);
      } });
    }
    const at = T * 1000;
    push({ dur: 1.6, delay: at, draw(c, t, pj) {
      const [sx, sy] = pj.pt(d.x, d.y);
      const pop = t < 0.25 ? ease(t / 0.25) * 1.25 : 1.25 - 0.25 * clamp01((t - 0.25) / 0.2);
      const a = 1 - clamp01((t - 1.2) / 0.4);
      c.globalAlpha = a * (1 - clamp01(t / 0.9)); c.strokeStyle = '#f3dc9a'; c.lineWidth = 2.5;
      c.beginPath(); c.arc(sx, sy - 6, 8 + ease(clamp01(t / 0.9)) * 30, 0, 7); c.stroke();
      c.globalAlpha = a; c.save(); c.translate(sx, sy - 6); c.scale(pop, pop);
      c.fillStyle = col; c.strokeStyle = '#f3e6c4'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 13, 0, 7); c.fill(); c.stroke();
      c.scale(16 / 24, 16 / 24); c.translate(-12, -12); c.strokeStyle = '#fff'; c.lineWidth = 2.4; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(ip);
      c.restore();
    } });
    floatText(d.x, d.y - 4, '+1 ' + B.name, '#d9e8a0', at + 150, 13);
  },
};
export const animate = FXQ;
