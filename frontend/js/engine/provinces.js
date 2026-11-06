// Provincias funcionales: cada pais se divide en provincias con dueno propio, recursos,
// edificios (base, fabrica, refineria, mina, granja), cola de construccion y conquista por provincia.
// Estado en game.ext.prov / game.ext.cown. Puro: sin DOM.
import { PROV, toXY, VARIANTS, variant_of, subdivide, group_states } from '../data/provinces.js';
import { capture } from './military.js';
import { at_war, divisions_of, sync_armies, land_adjacency, use_variant, all_countries } from './state.js';
import * as UNITS from './units.js';
import * as AERO from './aero.js';
import { stock_of } from './supply.js';
import { ROSTER } from './roster.js';
import { news } from './extutil.js';

// Tanda 3: catálogo de edificios. Claves ESTABLES (las usan art.js, provpanel.js, mapfx.js, units.js, aero.js).
//   group    pestaña del panel: eco | mil | infra
//   levels   nombres por nivel (opcional; 'taller' evoluciona a 'Fábrica' en los niveles 4-6)
//   tech     tecnología necesaria (id de features.TECHS)    labc  nivel mínimo de Laboratorio central en el país
//   unique   solo uno por jugador (capital)                 reqFn(p, game, ent) condición adicional (string = motivo)
export const BUILD = {
  // economía
  granja:    { name: 'Granja',       cost: 35, turns: 1, max: 3, icon: 'agri', group: 'eco' },
  mina:      { name: 'Mina',         cost: 55, turns: 2, max: 3, icon: 'mine', group: 'eco', need: ['minerales', 'cobre'] },
  refineria: { name: 'Refinería',    cost: 70, turns: 2, max: 3, icon: 'refinery', group: 'eco', need: ['petroleo', 'gas'] },
  taller:    { name: 'Taller',       cost: 60, turns: 2, max: 6, icon: 'factory', group: 'eco',
    levels: ['', 'Taller nv 1', 'Taller nv 2', 'Taller nv 3', 'Fábrica nv 1', 'Fábrica nv 2', 'Fábrica nv 3'],
    desc: 'Niveles 1-3 (taller): producción de unidades más rápida y requisito de blindados, mecanizados, aviones y drones. Niveles 4-6 (fábrica): bonificación a los recursos de la provincia.' },
  // militar
  base:      { name: 'Base militar', cost: 60, turns: 2, max: 3, icon: 'base', group: 'mil' },
  fuerte:    { name: 'Fortaleza',    cost: 85, turns: 3, max: 5, icon: 'fort', group: 'mil', desc: '+10 % de daño defendiendo y +5 % de resistencia por nivel.' },
  linea:     { name: 'Línea defensiva', cost: 40, turns: 1, max: 2, icon: 'trench', group: 'mil' },
  aeropuerto: { name: 'Aeropuerto',  cost: 120, turns: 3, max: 3, icon: 'airport', group: 'mil', tech: 'bld_aero', desc: 'Necesario para crear y sostener aviones, drones y helicópteros: 2 aeronaves por nivel.' },
  puerto:    { name: 'Puerto',       cost: 110, turns: 3, max: 2, icon: 'port', group: 'mil', tech: 'bld_puerto', desc: 'Permite construir barcos, submarinos y portaaviones (con taller/fábrica en la misma provincia).' },
  hospital:  { name: 'Hospital',     cost: 160, turns: 3, max: 2, icon: 'hospital', group: 'mil', tech: 'bld_hosp', desc: 'Cura las unidades terrestres del territorio cada turno a cambio de suministros.' },
  radar:     { name: 'Radar',        cost: 130, turns: 2, max: 2, icon: 'radar', group: 'mil', tech: 'air2', desc: 'Detecta aviones y misiles enemigos. Debe estar al menos a una provincia de cualquier frontera extranjera.' },
  capital:   { name: 'Capital',      cost: 300, turns: 2, max: 1, icon: 'star', group: 'mil', unique: true, desc: 'Una por jugador. Sube la moral de la provincia; construir otra destruye la anterior con una penalización de moral allí.' },
  // infraestructura
  avenida:   { name: 'Avenidas',     cost: 50, turns: 2, max: 1, icon: 'road', group: 'infra', desc: 'Bonificación de transporte solo para las unidades de su dueño.' },
  ferrocarril: { name: 'Ferrocarril', cost: 90, turns: 3, max: 2, icon: 'rail', group: 'infra', req: { avenida: 1 }, tech: 'bld_rail', desc: 'Movimiento muy rápido entre provincias con ferrocarril; las unidades «en carga» no atacan ni defienden.' },
  lab:       { name: 'Laboratorio',  cost: 90, turns: 3, max: 2, icon: 'lab', group: 'infra', reqFn: (p) => (p.b.taller >= 1 || p.cap) },
  labc:      { name: 'Laboratorio central', cost: 220, turns: 4, max: 3, icon: 'labc', group: 'infra', desc: 'Caro, pero su nivel desbloquea las tecnologías avanzadas: ojivas, bombarderos pesados, baterías de misiles, silos, tanques pesados, élite, fábricas y ferrocarriles.' },
};
export const BUILD_KEYS = Object.keys(BUILD);
export const BUILD_GROUPS = { eco: 'Economía', mil: 'Militar', infra: 'Infraestructura' };
/** Claves antiguas (Tanda 1/2) → nueva clave. */
const MIGRATE_BUILD = { fabrica: 'taller', carretera: 'avenida' };
export const PROV_VERSION = 3;

/** Nombre del edificio `kind` al nivel `lv` (p.ej. taller 4 → 'Fábrica nv 1'). */
export function build_name(kind, lv) {
  const B = BUILD[kind]; if (!B) return kind;
  if (B.levels && B.levels[lv]) return B.levels[lv];
  return B.name;
}

/** Migración perezosa de los edificios de una partida guardada antigua a las claves de la Tanda 3. */
export function migrate_prov(game) {
  const e = game.ext; if (!e || !e.prov) return;
  if ((e.pv || 0) >= PROV_VERSION) return;
  for (const p of Object.values(e.prov)) {
    const b = p.b || (p.b = {});
    for (const [oldK, newK] of Object.entries(MIGRATE_BUILD)) {
      if (b[oldK] != null) { b[newK] = Math.max(b[newK] || 0, Math.min(BUILD[newK].max, b[oldK])); delete b[oldK]; }
    }
    for (const k of BUILD_KEYS) if (typeof b[k] !== 'number') b[k] = 0;
    for (const k of Object.keys(b)) if (!BUILD[k]) delete b[k];
    b.capital = p.cap ? 1 : 0;
    if (p.q && MIGRATE_BUILD[p.q.kind]) p.q.kind = MIGRATE_BUILD[p.q.kind];
    if (p.q && !BUILD[p.q.kind]) p.q = null;
  }
  e.pv = PROV_VERSION;
}

/** Nivel máximo de Laboratorio central entre las provincias de `ent` (desbloqueo de tecnologías). */
export function prov_labc_level(game, ent) {
  const pr = game.ext && game.ext.prov; if (!pr) return 0;
  let m = 0;
  for (const p of Object.values(pr)) if (p.o === ent && (p.b.labc || 0) > m) m = p.b.labc;
  return m;
}

/** Nivel máximo del edificio `kind` entre las provincias de `ent`. */
export function prov_max_level(game, ent, kind) {
  const pr = game.ext && game.ext.prov; if (!pr) return 0;
  let m = 0;
  for (const p of Object.values(pr)) if (p.o === ent && (p.b[kind] || 0) > m) m = p.b[kind];
  return m;
}

const techDone = (game, ent, id) => {
  const t = game && game.ext && game.ext.techs && game.ext.techs[ent];
  return !!(t && t.done && t.done.includes(id));
};

/** Nivel del edificio `kind` en la provincia `pid` (0 si no existe). */
export function prov_building_level(game, pid, kind) {
  const p = game && game.ext && game.ext.prov && game.ext.prov[pid];
  return (p && p.b && p.b[kind]) || 0;
}

/** Fortaleza media (nivel de «fuerte») de las provincias del dueño del país `cid` dentro de ese país. */
export function prov_fort_level(game, cid) {
  const pr = game && game.ext && game.ext.prov; const c = game && game.countries[cid];
  if (!pr || !c) return 0;
  let sum = 0, n = 0;
  for (const p of Object.values(pr)) if (p.c === cid && p.o === c.owner) { sum += (p.b.fuerte || 0); n++; }
  return n ? Math.round((sum / n) * 100) / 100 : 0;
}

/**
 * Motivo (string) por el que `ent` NO puede iniciar `kind` en la provincia `pid`, o null si puede.
 * Comprueba dueño, obra en curso, recurso, técnica, requisitos, nivel máximo, fábrica, radar y puerto.
 * Simplificación: el puerto puede construirse en cualquier provincia (no se exige costa).
 */
export function build_check(game, ent, pid, kind) {
  const pr = P(game); const p = pr && pr[pid]; const B = BUILD[kind];
  if (!p || !B) return 'Construcción no válida.';
  if (p.o !== ent) return 'La provincia no es tuya.';
  if (p.q) return 'Ya hay una obra en curso.';
  const lvl = (p.b && p.b[kind]) || 0;
  if (lvl >= B.max) return 'Nivel máximo.';
  if (B.need && !B.need.includes(p.r)) return B.name + ' requiere ' + B.need.map((x) => RES[x].name).join(' o ') + '.';
  if (B.tech && !techDone(game, ent, B.tech)) return B.name + ' requiere la tecnología «' + techTitle(B.tech) + '».';
  if (B.labc && prov_labc_level(game, ent) < B.labc) return B.name + ' requiere Laboratorio central nivel ' + B.labc + '.';
  if (B.reqFn) {
    const r = B.reqFn(p, game, ent);
    if (typeof r === 'string') return r;
    if (r === false) return kind === 'lab' ? 'Laboratorio requiere taller o capital.' : B.name + ' no se puede construir aquí.';
  }
  if (B.req) {
    for (const [k, v] of Object.entries(B.req)) {
      if ((p.b[k] || 0) < v) return B.name + ' requiere ' + BUILD[k].name + ' nivel ' + v + '.';
    }
  }
  if (kind === 'taller' && lvl >= 3 && !techDone(game, ent, 'bld_fab')) return 'La fábrica (taller nv 4+) requiere la tecnología «Fábricas».';
  if (kind === 'radar') {
    if (!techDone(game, ent, 'air2')) return 'Radar requiere la tecnología «Radar y alerta temprana».';
    const G = prov_geo();
    for (const q of G.adj[pid] || []) {
      const gq = G.byId[q];
      if (gq && gq.c !== p.c) return 'El radar no puede estar en una provincia fronteriza (limita con ' + (game.countries[gq.c] ? game.countries[gq.c].name : gq.c) + ').';
    }
  }
  return null;
}

/** Si construir `kind` en `pid` destruiría una capital existente de `ent`, devuelve el nombre de su provincia (si no, null). */
export function capital_replaces(game, ent, pid, kind) {
  if (kind !== 'capital') return null;
  const pr = P(game); if (!pr) return null;
  for (const [q, p] of Object.entries(pr)) if (q !== pid && p.o === ent && (p.b.capital || 0) > 0) return prov_geo().byId[q].n;
  return null;
}

/** Marca `pid` como la capital de `ent`: destruye las anteriores (−4 de estabilidad; +25 de descontento si estaban en país ocupado). */
function set_capital(game, ent, pid) {
  const pr = P(game); const G = prov_geo();
  let moved = null;
  for (const [q, p] of Object.entries(pr)) {
    if (q === pid || p.o !== ent || !(p.b.capital > 0)) continue;
    p.b.capital = 0; p.cap = false; moved = q;
    if (p.c !== ent) { // capital ocupada (de un pais conquistado)
      const u = game.ext.unrest || (game.ext.unrest = {});
      u[q] = Math.min(100, (u[q] || 0) + 25);
    }
  }
  const np = pr[pid]; np.cap = true; np.b.capital = 1;
  if (moved && game.countries[ent]) {
    game.countries[ent].stability = Math.max(0, (game.countries[ent].stability || 0) - 4);
    news(game, 'La capital se traslada a ' + G.byId[pid].n + ' (−4 de estabilidad: penalización de moral).', 'eco');
  }
  return moved;
}

function techTitle(id) {
  const names = { bld_aero: 'Aeropuertos', bld_puerto: 'Puertos militares', bld_hosp: 'Hospitales de campaña', bld_rail: 'Ferrocarril', bld_fab: 'Fábricas', air2: 'Radar y alerta temprana' };
  return names[id] || id;
}

export const RES = {
  petroleo: { name: 'Petróleo', icon: 'oil' },
  gas: { name: 'Gas', icon: 'gas' },
  minerales: { name: 'Minerales', icon: 'minerals' },
  cobre: { name: 'Cobre', icon: 'minerals' },
  agro: { name: 'Agro', icon: 'agri' },
  madera: { name: 'Madera', icon: 'derrick' },
};
export const ATTACK_COST = 20;
const TERR_DEF = { M: 1.4, A: 1.4, S: 1.25, B: 1.15, T: 1.1 };
const RES_BY_T = {
  D: ['petroleo', 'gas', 'minerales', null], E: ['petroleo', 'gas', 'minerales', null],
  M: ['minerales', 'cobre', null], A: ['minerales', 'cobre', null],
  P: ['agro', 'agro', null], V: ['agro', 'petroleo', null],
  S: ['madera', 'agro', null, 'petroleo'], T: ['agro', 'madera', null], B: ['madera', 'agro', null],
};
const CAP_RE = /capital|distrito federal|ciudad de|bogot|caracas|lima|santiago|buenos aires|brasil|quito|la paz|asunci|montevideo|managua|tegucigalpa|san jos|panam|habana|kingston|santo domingo|port-au|guatemala|san salvador|belmop|ottawa|washington|columbia|paramaribo|georgetown|cayenne|nassau|m[eé]xico/i;

function hash(s) { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }

// ------------------------------------------------------------------ geometria estatica
// Tanda 2: la geometria depende de la variante de mapa y de la densidad (1 = original, 2 = subdividida).
// Se cachea una geometria por clave 'variante|densidad'; prov_geo() devuelve la activa.
const _geos = {};
let _geo = null;

function geoKey(game) {
  const dn = game && game.ext && game.ext.geo ? game.ext.geo.density : null;
  const dens = dn === 0 || dn === 2 ? dn : 1; // 0 = estados (por defecto), 1 = departamentos (original), 2 = subdividida
  return { variant: variant_of(game), density: dens };
}
/**
 * Selecciona la geometria de provincias de la partida (variante + densidad). Las partidas antiguas
 * (sin game.ext.geo) usan densidad 1 = la lista original. Barata: cachea por clave.
 */
export function use_game_geo(game) {
  const k = geoKey(game);
  use_variant(k.variant);
  const key = k.variant + '|' + k.density;
  _geo = _geos[key] || (_geos[key] = build_geo(k.variant, k.density));
}
/** Filas de provincias de un pais para la densidad pedida. */
function rows_for(cid, density) {
  const base = PROV[cid];
  if (density === 0) return group_states(cid, base);
  if (density < 2) return base.map((r, i) => [r[0], r[1], r[2], r[3], i, null]);
  const c = all_countries().find((x) => x.id === cid);
  return subdivide(cid, base, c && c.path);
}
/** Numero de provincias de una variante (densidad 2) sin alterar la geometria activa. null si faltan datos. */
const _cnt = {};
export function count_provinces(variant) {
  const v = VARIANTS[variant] ? variant : 'latam';
  if (_cnt[v] != null) return _cnt[v];
  try {
    const ids = VARIANTS[v].ids;
    let n = 0;
    for (const cid of Object.keys(PROV)) if (!ids || ids.includes(cid)) n += rows_for(cid, 2).length;
    return (_cnt[v] = n);
  } catch (e) { return null; }
}
function build_geo(variant, density) {
  const ids = VARIANTS[variant].ids;
  const list = [];
  for (const cid of Object.keys(PROV)) {
    if (ids && !ids.includes(cid)) continue;
    rows_for(cid, density).forEach((r, i) => {
      const [x, y] = toXY(r[1], r[2]);
      const o = { pid: cid + ':' + i, c: cid, i, n: r[0], t: r[3], x, y };
      if (density >= 2) { o.parent = PROV[cid][r[4]][0]; o.sub = r[5]; }
      if (density === 0) o.members = r[6];
      list.push(o);
    });
  }
  const byId = {}; for (const p of list) byId[p.pid] = p;
  let land = null; try { land = land_adjacency(); } catch (e) { land = null; }
  const adj = {}; for (const p of list) adj[p.pid] = new Set();
  const intra = density >= 2 ? 30 : density === 0 ? 60 : 40, inter = density >= 2 ? 24 : density === 0 ? 48 : 30, keepN = density >= 2 ? 4 : density === 0 ? 4 : 5;
  for (const p of list) {
    const near = [];
    for (const q of list) {
      if (q === p) continue;
      if (q.c !== p.c && !(land && land[p.c] && land[p.c].has(q.c))) continue;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < (q.c === p.c ? intra : inter)) near.push([d, q.pid]);
    }
    near.sort((a, b) => a[0] - b[0]);
    for (const [, qid] of near.slice(0, keepN)) { adj[p.pid].add(qid); adj[qid].add(p.pid); }
  }
  // garantiza que cada pais tenga al menos un vinculo con cada vecino terrestre
  if (land) {
    const byC = {}; for (const p of list) (byC[p.c] = byC[p.c] || []).push(p);
    for (const [a, set] of Object.entries(land)) {
      if (!byC[a]) continue;
      for (const b of set) {
        if (!byC[b]) continue;
        if (byC[a].some((p) => [...adj[p.pid]].some((q) => byId[q].c === b))) continue;
        let best = null;
        for (const p of byC[a]) for (const q of byC[b]) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (!best || d < best[0]) best = [d, p.pid, q.pid]; }
        if (best) { adj[best[1]].add(best[2]); adj[best[2]].add(best[1]); }
      }
    }
  }
  return { list, byId, adj };
}
/** Lista estatica de provincias activa: {pid, c, i, n, t, x, y[, parent, sub]} + vecinos. */
export function prov_geo() {
  if (!_geo) use_game_geo(null);
  return _geo;
}

// ------------------------------------------------------------------ estado
export function init_prov(game) {
  const e = game.ext;
  if (e.prov && e.cown) { migrate_prov(game); return; }
  if (!e.prov && !e.geo) e.geo = { density: 0 }; // partida nueva: estados (pocas provincias grandes); las guardadas conservan su densidad
  use_game_geo(game);
  const G = prov_geo();
  e.prov = {}; e.cown = {};
  const byC = {};
  for (const p of G.list) {
    if (!game.countries[p.c]) continue;
    (byC[p.c] = byC[p.c] || []).push(p);
    const opts = RES_BY_T[p.t] || [null];
    const r = opts[hash(p.pid) % opts.length];
    const b = {}; for (const k of BUILD_KEYS) b[k] = 0;
    e.prov[p.pid] = { c: p.c, o: game.countries[p.c].owner, r, cap: false, g: 0, b, q: null };
  }
  for (const [cid, ps] of Object.entries(byC)) {
    e.cown[cid] = game.countries[cid].owner;
    let cap = ps.find((p) => CAP_RE.test(p.parent || p.n)) || ps.find((p) => p.members && p.members.some((m) => CAP_RE.test(m)));
    if (cap && cap.parent) { // subdividida: la parte mas cercana al centroide original
      const o = PROV[cid].find((r) => r[0] === cap.parent), [ox, oy] = o ? toXY(o[1], o[2]) : [cap.x, cap.y];
      cap = ps.filter((p) => p.parent === cap.parent).reduce((b, p) => (Math.hypot(p.x - ox, p.y - oy) < Math.hypot(b.x - ox, b.y - oy) ? p : b));
    }
    if (!cap) {
      const cx = ps.reduce((s, p) => s + p.x, 0) / ps.length, cy = ps.reduce((s, p) => s + p.y, 0) / ps.length;
      cap = ps.reduce((b, p) => (Math.hypot(p.x - cx, p.y - cy) < Math.hypot(b.x - cx, b.y - cy) ? p : b));
    }
    const pc = e.prov[cap.pid]; pc.cap = true; pc.b.base = 1; pc.b.taller = 1; pc.b.capital = 1;
  }
  e.pv = PROV_VERSION;
}

const P = (game) => game.ext && game.ext.prov;
export function provs_of_country(game, cid) { return Object.keys(P(game) || {}).filter((pid) => P(game)[pid].c === cid); }

/** Tropas que defienden la provincia (k). Fortaleza ×(1+0,10/nivel); los cañones estáticos del dueño suman def×0,5. */
export function prov_defense(game, pid) {
  const p = P(game)[pid]; const G = prov_geo(); const gp = G.byId[pid];
  let gar = p.g || 0;
  const c = game.countries[p.c];
  if (c && p.o === c.owner) {
    const n = provs_of_country(game, p.c).filter((q) => P(game)[q].o === p.o).length || 1;
    const here = divisions_of(game, p.o).filter((d) => d.location === p.c);
    gar += here.reduce((s, d) => s + d.troops + d.tanks * 0.03 + d.planes * 0.04, 0) / n;
    for (const d of here) {
      const k = d.kind || UNITS.kind_of(d);
      if ((k === 'cfort' || k === 'cnav') && ROSTER[k]) gar += ROSTER[k].def * 0.5;
    }
  }
  const mul = (TERR_DEF[gp && gp.t] || 1) * (1 + 0.35 * (p.b.base || 0)) * (p.cap ? 1.25 : 1)
    * (1 + 0.10 * (p.b.fuerte || 0)) * (1 + 0.2 * (p.b.linea || 0));
  return Math.round((gar + 4) * mul * 10) / 10;
}

export function prov_attack_power(game, ent) {
  return Math.round(divisions_of(game, ent).reduce((s, d) => s + d.troops + d.tanks * 0.03 + d.planes * 0.04, 0) * 0.3 * 10) / 10;
}

/** Provincias atacables por ent (en guerra y adyacentes a alguna suya). */
export function prov_targets(game, ent) {
  const pr = P(game); if (!pr) return [];
  const G = prov_geo(); const out = new Set();
  for (const [pid, p] of Object.entries(pr)) {
    if (p.o !== ent) continue;
    for (const q of G.adj[pid] || []) { const pq = pr[q]; if (pq && pq.o !== ent && at_war(game, ent, pq.o)) out.add(q); }
  }
  return [...out];
}

function _loseTroops(game, ent, amount, where) {
  let divs = divisions_of(game, ent);
  if (where) { const w = divs.filter((d) => d.location === where); if (w.length) divs = w; }
  const tot = divs.reduce((s, d) => s + d.troops, 0);
  if (tot <= 0) return;
  const f = Math.min(0.6, amount / tot);
  for (const d of divs) d.troops = Math.max(0, d.troops * (1 - f));
}

function _relocate(game, loser, cid) {
  const home = Object.keys(game.countries).find((k) => k !== cid && game.countries[k].owner === loser);
  for (const d of divisions_of(game, loser)) {
    if (d.location !== cid) continue;
    if (home) d.location = home; else d.troops = d.tanks = d.planes = 0;
  }
}

/** Resuelve un ataque a una provincia. Devuelve {ok, msg, win} o {ok:false, error}. */
export function prov_attack(game, ent, pid, rng, free) {
  const pr = P(game); const p = pr && pr[pid];
  if (!p) return { ok: false, error: 'Provincia desconocida.' };
  if (p.o === ent) return { ok: false, error: 'La provincia ya es tuya.' };
  if (!at_war(game, ent, p.o)) return { ok: false, error: 'Debes estar en guerra con su dueño.' };
  if (!prov_targets(game, ent).includes(pid)) return { ok: false, error: 'No tienes provincias limítrofes con ella.' };
  const me = game.countries[ent];
  if (!free) { if ((me.money || 0) < ATTACK_COST) return { ok: false, error: 'Fondos insuficientes (' + ATTACK_COST + ').' }; me.money -= ATTACK_COST; }
  const r = () => (rng ? rng.random() : Math.random());
  let basePow = null;
  try { basePow = UNITS.prov_strike_power(game, ent, pid); } catch (e) { basePow = null; }
  const att = (typeof basePow === 'number' && isFinite(basePow) ? basePow : prov_attack_power(game, ent)) * (0.8 + 0.4 * r());
  const def = prov_defense(game, pid) * (0.8 + 0.4 * r());
  const name = prov_geo().byId[pid].n;
  const old = p.o;
  _loseTroops(game, ent, def * 0.25, null);
  const win = att > def;
  p.fx = { k: win ? 'win' : 'fail', t: game.turn };
  if (win) {
    _loseTroops(game, old, att * 0.15 * (1 - 0.05 * (p.b.fuerte || 0)), p.c);
    p.o = ent; p.g = Math.round(att * 0.2 * 10) / 10; p.q = null;
    p.b.base = Math.max(0, p.b.base - 1);
    p.b.linea = 0;
    p.b.fuerte = Math.max(0, (p.b.fuerte || 0) - 1);
    for (const k of ['aeropuerto', 'puerto', 'radar']) p.b[k] = Math.max(0, (p.b[k] || 0) - 1);
    p.b.capital = 0; // la capital (edificio) no se hereda; p.cap sigue marcando la capital histórica
    try { AERO.on_prov_lost(game, pid, old); } catch (e) { /* aviación opcional */ }
    try { UNITS.on_prov_capture(game, ent, pid, old); } catch (e) { /* botin/descontento opcionales */ }
    // pais completo: si cae la capital o todas sus provincias
    const own = game.countries[p.c].owner;
    const rest = provs_of_country(game, p.c).filter((q) => pr[q].o === own);
    if (own !== ent && (p.cap || rest.length === 0)) {
      capture(game, ent, p.c);
      _relocate(game, own, p.c);
      for (const q of provs_of_country(game, p.c)) if (pr[q].o === own) { pr[q].o = ent; pr[q].b.capital = 0; try { AERO.on_prov_lost(game, q, own); } catch (e) { /* opcional */ } }
      game.ext.cown[p.c] = ent;
    }
  } else {
    p.g = Math.max(0, (p.g || 0) - att * 0.1);
  }
  sync_armies(game);
  return { ok: true, win, msg: (win ? 'Conquistada ' : 'Ataque rechazado en ') + name + ' (' + Math.round(att) + ' vs ' + Math.round(def) + ').' };
}

export function prov_build(game, ent, pid, kind, free) {
  const pr = P(game); const p = pr && pr[pid]; const B = BUILD[kind];
  if (!p || !B) return { ok: false, error: 'Construcción no válida.' };
  const why = build_check(game, ent, pid, kind);
  if (why) return { ok: false, error: why };
  const cost = build_cost(p, kind);
  const me = game.countries[ent];
  if (!free) { if ((me.money || 0) < cost) return { ok: false, error: 'Fondos insuficientes (' + cost + ').' }; me.money -= cost; }
  p.q = { kind, turns: B.turns };
  return { ok: true, msg: 'Obra iniciada: ' + build_name(kind, (p.b[kind] || 0) + 1) + ' en ' + prov_geo().byId[pid].n + '.' };
}

export function build_cost(p, kind) { return Math.round(BUILD[kind].cost * (1 + 0.5 * (p.b[kind] || 0))); }

const LAND_CLS = ['inf', 'arm', 'art'];
const HEAL_GOODS = 0.5;
function div_missing(d) {
  const ut = ROSTER[d.kind || UNITS.kind_of(d)]; if (!ut) return false;
  return d.troops < ut.troops - 0.01 || d.tanks < ut.tanks - 0.01 || d.planes < ut.planes - 0.01;
}
/** Cura local de reserva si UNITS.heal no existe: recupera `frac` de la composicion completa. */
function heal_local(d, frac) {
  const ut = ROSTER[d.kind || UNITS.kind_of(d)]; if (!ut) return;
  d.troops = Math.min(ut.troops, d.troops + ut.troops * frac);
  d.tanks = Math.min(ut.tanks, d.tanks + ut.tanks * frac);
  d.planes = Math.min(ut.planes, d.planes + ut.planes * frac);
}
/** Hospitales: por pais, el mejor hospital del dueño cura 10 % x nivel de cada division terrestre danada (0,5 bienes c/u). */
function hospital_turn(game, lines) {
  const pr = game.ext.prov; const me = game.player;
  const best = {}; // dueño|pais -> nivel
  for (const p of Object.values(pr)) {
    if ((p.b.hospital || 0) > 0 && game.countries[p.o]) { const k = p.o + '|' + p.c; best[k] = Math.max(best[k] || 0, p.b.hospital); }
  }
  const healed = {}, dry = {};
  for (const [k, lv] of Object.entries(best)) {
    const [o, cid] = k.split('|');
    const st = stock_of(game, o);
    for (const d of divisions_of(game, o)) {
      if (d.location !== cid) continue;
      const kind = d.kind || UNITS.kind_of(d); const ut = ROSTER[kind];
      if (!ut || !LAND_CLS.includes(ut.cls) || !div_missing(d)) continue;
      if ((st.goods || 0) < HEAL_GOODS) { dry[o] = true; continue; }
      st.goods = Math.round(((st.goods || 0) - HEAL_GOODS) * 100) / 100;
      if (typeof UNITS.heal === 'function') UNITS.heal(game, d, 0.10 * lv); else heal_local(d, 0.10 * lv);
      healed[o] = (healed[o] || 0) + 1;
    }
  }
  if (healed[me]) { const n = healed[me]; lines.push('Hospitales: ' + n + (n === 1 ? ' división curada' : ' divisiones curadas') + ' (−' + (Math.round(n * HEAL_GOODS * 10) / 10) + ' bienes).'); }
  if (dry[me]) lines.push('Hospitales sin bienes: algunas divisiones heridas no se curan.');
}

/** IA: 1 obra cada 3 turnos. Primero economia (granja/mina/refineria/taller 1-3), luego militar e infraestructura. */
const AI_ECO = ['granja', 'mina', 'refineria', 'taller'];
const AI_MIL = [['fuerte', 2], ['aeropuerto', 1], ['hospital', 1], ['base', 2], ['puerto', 1], ['labc', 1], ['avenida', 2], ['ferrocarril', 1], ['lab', 1], ['aeropuerto', 2], ['puerto', 2], ['labc', 2], ['taller', 9]];
// Edificios que sostienen unidades avanzadas: se prefieren provincias con taller (aire/marina exigen taller 2-4 en la misma provincia)
const AI_NEEDS_TALLER = ['aeropuerto', 'puerto'];
function ai_build(game, o, rng, rich) {
  const pr = game.ext.prov; const money = game.countries[o].money || 0;
  const mine = Object.keys(pr).filter((pid) => pr[pid].o === o);
  if (!mine.length) return;
  const total = (k) => mine.reduce((s, pid) => s + (pr[pid].b[k] || 0), 0);
  const ecoLv = AI_ECO.reduce((s, k) => s + (k === 'taller' ? mine.reduce((a, pid) => a + Math.min(3, pr[pid].b.taller || 0), 0) : total(k)), 0);
  const tryKinds = (kinds, shuffle) => {
    const order = shuffle ? kinds.slice().sort(() => rng.random() - 0.5) : kinds;
    for (const k of order) {
      const opts = mine.filter((pid) => !build_check(game, o, pid, k) && !(k === 'taller' && kinds === AI_ECO && (pr[pid].b.taller || 0) >= 3) && build_cost(pr[pid], k) * 1.2 <= money);
      if (opts.length) {
        let pool = opts;
        if (AI_NEEDS_TALLER.includes(k)) { const w = opts.filter((q) => (pr[q].b.taller || 0) >= 2); if (w.length) pool = w; }
        else if (k === 'taller' && kinds !== AI_ECO) { const w = opts.filter((q) => (pr[q].b.aeropuerto || 0) + (pr[q].b.puerto || 0) > 0); if (w.length) pool = w; }
        const pid = pool[Math.floor(rng.random() * pool.length)]; return prov_build(game, o, pid, k, false).ok;
      }
    }
    return false;
  };
  const ecoGoal = 2 + Math.floor(mine.length / 8) + Math.floor(game.turn / 10);
  if (ecoLv < ecoGoal + (rich ? 2 + Math.floor(mine.length / 4) : 0) && tryKinds(AI_ECO, true)) return;
  for (const [k, goal] of AI_MIL) {
    if (total(k) >= goal + (k === 'fuerte' ? Math.floor(mine.length / 8) : 0) + (rich ? 1 + Math.floor(mine.length / 6) : 0)) continue;
    if (tryKinds([k])) return;
  }
  tryKinds(AI_ECO, true);
}

// ------------------------------------------------------------------ turno
export function prov_turn(game, rng, lines) {
  const e = game.ext; if (!e) return; init_prov(game);
  const pr = e.prov; const me = game.player;
  // 1) sincroniza con conquistas del motor central (pais entero)
  for (const [cid, c] of Object.entries(game.countries)) {
    const was = e.cown[cid];
    if (was !== undefined && was !== c.owner) {
      for (const pid of provs_of_country(game, cid)) if (pr[pid].o === was) { pr[pid].o = c.owner; pr[pid].q = null; pr[pid].b.capital = 0; try { AERO.on_prov_lost(game, pid, was); } catch (e) { /* opcional */ } }
    }
    e.cown[cid] = c.owner;
  }
  // 2) colas de obra y rendimientos
  const gain = {};
  const add = (o, k, v) => { (gain[o] = gain[o] || { m: 0, s: 0, t: 0 })[k] += v; };
  const G = prov_geo();
  for (const [pid, p] of Object.entries(pr)) {
    if (p.fx && game.turn - p.fx.t > 1) delete p.fx;
    if (p.q) {
      p.q.turns -= 1;
      if (p.q.turns <= 0) {
        const kind = p.q.kind;
        p.b[kind] = (p.b[kind] || 0) + 1;
        p.q = null;
        if (kind === 'capital') set_capital(game, p.o, pid);
        if (p.o === me) {
          const txt = 'Obra terminada: ' + build_name(kind, p.b[kind]) + ' en ' + G.byId[pid].n + '.';
          lines.push(txt); news(game, txt, 'eco');
          if (kind === 'taller' && p.b.taller === 3 && techDone(game, me, 'bld_fab')) {
            const t2 = 'Puedes evolucionar el taller de ' + G.byId[pid].n + ' a fábrica.';
            lines.push(t2); news(game, t2, 'eco');
          }
        }
      }
    }
    if (!game.countries[p.o]) continue;
    add(p.o, 'm', prov_yield(game, pid).money);
    add(p.o, 's', 0.15 * p.b.granja);
    add(p.o, 't', 0.6 * p.b.base);
    if (p.g > 0 && p.o !== game.countries[p.c].owner) p.g = Math.min(60, p.g + 0.5 * p.b.base);
  }
  // 2b) avenidas: +5 de organizacion a las divisiones del DUEÑO en el pais (nunca a otros)
  const roads = new Set();
  for (const p of Object.values(pr)) if ((p.b.avenida || 0) > 0 && game.countries[p.o]) roads.add(p.o + '|' + p.c);
  for (const key of roads) {
    const [o, cid] = key.split('|');
    for (const d of divisions_of(game, o)) if (d.location === cid) d.org = Math.min(100, (d.org || 0) + 5);
  }
  // 2c) capital: calma el descontento (−2 en su provincia; con «Orgullo patrio» −1 en todas las del pais)
  const un = game.ext.unrest;
  if (un) {
    for (const [pid, p] of Object.entries(pr)) {
      if (!(p.b.capital > 0) || !game.countries[p.o]) continue;
      if (un[pid]) un[pid] = Math.max(0, un[pid] - 2);
      if (techDone(game, p.o, 'mor3')) {
        for (const [q, pq] of Object.entries(pr)) if (pq.o === p.o && q !== pid && un[q]) un[q] = Math.max(0, un[q] - 1);
      }
    }
  }
  // 2d) hospitales: curan las divisiones terrestres del dueño en el pais de la provincia
  hospital_turn(game, lines);
  for (const [o, v] of Object.entries(gain)) {
    const c = game.countries[o]; if (!c) continue;
    c.money = (c.money || 0) + Math.round(v.m * 10) / 10;
    c.stability = Math.min(100, (c.stability || 0) + v.s);
    if (v.t > 0) { const ds = divisions_of(game, o); if (ds.length) ds[0].troops += v.t; }
  }
  if (gain[me] && gain[me].m > 0) lines.push('Provincias: +' + Math.round(gain[me].m) + ' de recursos y edificios.');
  // 3) IA: construye con criterio y ataca provincias limitrofes
  const owners = new Set(Object.values(pr).map((p) => p.o));
  for (const o of owners) {
    if (o === me || !game.countries[o]) continue;
    if ((game.turn + hash(o)) % 3 === 0) ai_build(game, o, rng);
    // sumidero de caja: con el tesoro por encima de la reserva, obras extra cada turno (hasta 3)
    const surplus = (game.countries[o].money || 0) - (350 + 6 * game.turn);
    if (surplus > 0) for (let n = 0, m = Math.min(3, 1 + Math.floor(surplus / 500)); n < m && (game.countries[o].money || 0) > 350 + 6 * game.turn; n++) ai_build(game, o, rng, true);
    const tg = prov_targets(game, o);
    if (tg.length && rng.random() < 0.35) {
      const pid = tg.reduce((b, q) => (prov_defense(game, q) < prov_defense(game, b) ? q : b));
      if (prov_attack_power(game, o) > prov_defense(game, pid) * 1.1) {
        const tgtOwner = pr[pid].o;
        const res = prov_attack(game, o, pid, rng, true);
        if (res.ok && tgtOwner === me) lines.push((res.win ? '¡Perdiste ' : 'Resististe en ') + prov_geo().byId[pid].n + ' ante ' + o + '.');
      }
    }
  }
}

// ------------------------------------------------------------------ interfaz Tanda 1
/**
 * Rendimientos de una provincia por turno: {money, food, fuel, goods, metal}.
 * money = 1.5 por recurso + edificios + carretera/ferrocarril.
 * food = 1.5*agro + 1.2*granja; fuel = 2*(petroleo/gas) + 2.5*refineria;
 * metal = 1.5*(minerales/cobre) + 2*mina; goods = 1.0*fabrica + 0.5*madera.
 */
export function prov_yield(game, pid) {
  const pr = P(game); const p = pr && pr[pid];
  if (!p) return { money: 0, food: 0, fuel: 0, goods: 0, metal: 0 };
  let money = 0, food = 0, fuel = 0, goods = 0, metal = 0;
  if (p.r === 'agro') food += 1.5;
  if (p.r === 'petroleo' || p.r === 'gas') fuel += 2;
  if (p.r === 'minerales' || p.r === 'cobre') metal += 1.5;
  if (p.r === 'madera') goods += 0.5;
  if (p.r) money += 1.5;
  food += 1.2 * (p.b.granja || 0);
  fuel += 2.5 * (p.b.refineria || 0);
  metal += 2 * (p.b.mina || 0);
  goods += 0.5 * Math.min(3, p.b.taller || 0) + 1.0 * Math.max(0, (p.b.taller || 0) - 3);
  money += 2 * Math.min(3, p.b.taller || 0) + 4 * Math.max(0, (p.b.taller || 0) - 3) + 6 * (p.b.refineria || 0) + 4 * (p.b.mina || 0) + 2 * (p.b.granja || 0) + 0.6 * (p.b.avenida || 0) + 1.5 * (p.b.ferrocarril || 0);
  const f = 1 + 0.10 * Math.max(0, (p.b.taller || 0) - 3); // fábrica: +10 % por nivel a dinero y recursos
  const r = (x) => Math.round(x * f * 10) / 10;
  return { money: r(money), food: r(food), fuel: r(fuel), goods: r(goods), metal: r(metal) };
}

/**
 * Acciones de provincia del jugador no cubiertas por prov_attack/prov_build (p.ej. {action:'prov_recruit', pid, kind}).
 * Devuelve {ok,msg}|{ok:false,error} o null si la accion no es de este modulo.
 */
export function prov_action(game, ent, body) {
  if (body.action === 'capital_move') return prov_build(game, ent, body.pid, 'capital', false);
  if (body.action === 'prov_recruit') {
    const pr = P(game); const p = pr && pr[body.pid];
    if (!p) return { ok: false, error: 'Provincia desconocida.' };
    if (p.o !== ent) return { ok: false, error: 'La provincia no es tuya.' };
    if (!p.cap && (p.b.base || 0) < 1) return { ok: false, error: 'Requiere base militar o capital.' };
    // Delega en UNITS.action (el trabajador D lo completará)
    try {
      const res = UNITS.action ? UNITS.action(game, { action: 'unit_recruit', kind: body.kind, pid: body.pid }) : null;
      return res || { ok: false, error: 'Reclutamiento no implementado aún.' };
    } catch (e) {
      return { ok: false, error: 'Reclutamiento no disponible.' };
    }
  }
  return null;
}

/** Suma de niveles de laboratorio en las provincias de la entidad (bono de investigacion). */
export function prov_lab_levels(game, ent) {
  const pr = P(game); if (!pr) return 0;
  let sum = 0;
  for (const [pid, p] of Object.entries(pr)) {
    if (p.o === ent) sum += (p.b.lab || 0) + 2 * (p.b.labc || 0); // el laboratorio central cuenta el doble
  }
  return sum;
}

/** Multiplicador de defensa del territorio (pais) por fortalezas y lineas defensivas de sus provincias (>= 1). */
export function country_defense_mult(game, target) {
  const pr = P(game); if (!pr) return 1.0;
  let fortSum = 0, lineSum = 0;
  for (const [pid, p] of Object.entries(pr)) {
    if (p.c === target) {
      fortSum += (p.b.fuerte || 0);
      lineSum += (p.b.linea || 0);
    }
  }
  const fortMult = Math.min(0.5, fortSum * 0.05);
  const lineMult = Math.min(0.2, lineSum * 0.04);
  return 1.0 + fortMult + lineMult;
}

/** Multiplicador logistico de ataque de la division d (carreteras/ferrocarril en su territorio de origen) (>= 1). */
export function attack_logistics_mult(game, d, target) {
  void target;
  const pr = P(game); if (!pr) return 1.0;
  const loc = d.location;
  const provs = Object.keys(pr).filter((pid) => pr[pid].c === loc && pr[pid].o === d.owner);
  if (provs.length === 0) return 1.0;
  let railSum = 0, roadSum = 0;
  for (const pid of provs) {
    const p = pr[pid];
    railSum += (p.b.ferrocarril || 0);
    roadSum += (p.b.avenida || 0);
  }
  const railAvg = railSum / provs.length;
  const roadAvg = roadSum / provs.length;
  return Math.min(1.25, 1 + 0.06 * railAvg + 0.03 * roadAvg);
}

/** Decisiones pendientes para el carrusel: [{text, kind, screen}]. */
export function prov_pending(game) {
  const pr = P(game); if (!pr) return [];
  const me = game.player; const list = [];
  const mine = Object.keys(pr).filter((pid) => pr[pid].o === me);
  const myMoney = (game.countries[me] && game.countries[me].money) || 0;
  const G = prov_geo();
  let canBuild = 0;
  for (const pid of mine) {
    const p = pr[pid]; const gp = G.byId[pid];
    if (p.q) {
      if (p.q.turns === 1) list.push({ text: 'Obra terminará: ' + build_name(p.q.kind, (p.b[p.q.kind] || 0) + 1) + ' en ' + gp.n, kind: 'eco', screen: 'map' });
      continue;
    }
    if ((p.b.taller || 0) === 3 && techDone(game, me, 'bld_fab') && !build_check(game, me, pid, 'taller') && build_cost(p, 'taller') <= myMoney) {
      list.push({ text: 'Puedes evolucionar el taller de ' + gp.n + ' a fábrica', kind: 'eco', screen: 'map' });
      continue;
    }
    if (canBuild < 1 && Object.keys(BUILD).some((k) => !build_check(game, me, pid, k) && build_cost(p, k) <= myMoney)) {
      canBuild++; list.push({ text: 'Puedes construir en ' + gp.n, kind: 'eco', screen: 'map' });
    }
  }
  return list.slice(0, 4);
}
