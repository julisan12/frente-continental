// Provincias funcionales: cada pais se divide en provincias con dueno propio, recursos,
// edificios (base, fabrica, refineria, mina, granja), cola de construccion y conquista por provincia.
// Estado en game.ext.prov / game.ext.cown. Puro: sin DOM.
import { PROV, toXY } from '../data/provinces.js';
import { capture } from './military.js';
import { at_war, divisions_of, sync_armies, land_adjacency } from './state.js';
import { on_prov_capture } from './units.js';

export const BUILD = {
  base:      { name: 'Base militar', cost: 60, turns: 2, max: 3, icon: 'base' },
  fabrica:   { name: 'Fábrica',      cost: 50, turns: 2, max: 3, icon: 'factory' },
  refineria: { name: 'Refinería',    cost: 70, turns: 2, max: 3, icon: 'refinery', need: ['petroleo', 'gas'] },
  mina:      { name: 'Mina',         cost: 55, turns: 2, max: 3, icon: 'mine', need: ['minerales', 'cobre'] },
  granja:    { name: 'Granja',       cost: 35, turns: 1, max: 3, icon: 'agri' },
};
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
let _geo = null;
/** Lista estatica de provincias: {pid, c, i, n, t, x, y} + vecinos. */
export function prov_geo() {
  if (_geo) return _geo;
  const list = [];
  for (const [cid, rows] of Object.entries(PROV)) {
    rows.forEach((r, i) => { const [x, y] = toXY(r[1], r[2]); list.push({ pid: cid + ':' + i, c: cid, i, n: r[0], t: r[3], x, y }); });
  }
  const byId = {}; for (const p of list) byId[p.pid] = p;
  let land = null; try { land = land_adjacency(); } catch (e) { land = null; }
  const adj = {}; for (const p of list) adj[p.pid] = new Set();
  for (const p of list) {
    const near = [];
    for (const q of list) {
      if (q === p) continue;
      if (q.c !== p.c && !(land && land[p.c] && land[p.c].has(q.c))) continue;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < (q.c === p.c ? 40 : 30)) near.push([d, q.pid]);
    }
    near.sort((a, b) => a[0] - b[0]);
    for (const [, qid] of near.slice(0, 5)) { adj[p.pid].add(qid); adj[qid].add(p.pid); }
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
  _geo = { list, byId, adj };
  return _geo;
}

// ------------------------------------------------------------------ estado
export function init_prov(game) {
  const e = game.ext;
  if (e.prov && e.cown) return;
  const G = prov_geo();
  e.prov = {}; e.cown = {};
  const byC = {};
  for (const p of G.list) {
    if (!game.countries[p.c]) continue;
    (byC[p.c] = byC[p.c] || []).push(p);
    const opts = RES_BY_T[p.t] || [null];
    const r = opts[hash(p.pid) % opts.length];
    e.prov[p.pid] = { c: p.c, o: game.countries[p.c].owner, r, cap: false, g: 0, b: { base: 0, fabrica: 0, refineria: 0, mina: 0, granja: 0 }, q: null };
  }
  for (const [cid, ps] of Object.entries(byC)) {
    e.cown[cid] = game.countries[cid].owner;
    let cap = ps.find((p) => CAP_RE.test(p.n));
    if (!cap) {
      const cx = ps.reduce((s, p) => s + p.x, 0) / ps.length, cy = ps.reduce((s, p) => s + p.y, 0) / ps.length;
      cap = ps.reduce((b, p) => (Math.hypot(p.x - cx, p.y - cy) < Math.hypot(b.x - cx, b.y - cy) ? p : b));
    }
    const pc = e.prov[cap.pid]; pc.cap = true; pc.b.base = 1; pc.b.fabrica = 1;
  }
}

const P = (game) => game.ext && game.ext.prov;
export function provs_of_country(game, cid) { return Object.keys(P(game) || {}).filter((pid) => P(game)[pid].c === cid); }

/** Tropas que defienden la provincia (k). */
export function prov_defense(game, pid) {
  const p = P(game)[pid]; const G = prov_geo(); const gp = G.byId[pid];
  let gar = p.g || 0;
  const c = game.countries[p.c];
  if (c && p.o === c.owner) {
    const n = provs_of_country(game, p.c).filter((q) => P(game)[q].o === p.o).length || 1;
    gar += divisions_of(game, p.o).filter((d) => d.location === p.c).reduce((s, d) => s + d.troops + d.tanks * 0.03 + d.planes * 0.04, 0) / n;
  }
  const mul = (TERR_DEF[gp && gp.t] || 1) * (1 + 0.35 * (p.b.base || 0)) * (p.cap ? 1.25 : 1);
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
  const att = prov_attack_power(game, ent) * (0.8 + 0.4 * r());
  const def = prov_defense(game, pid) * (0.8 + 0.4 * r());
  const name = prov_geo().byId[pid].n;
  const old = p.o;
  _loseTroops(game, ent, def * 0.25, null);
  const win = att > def;
  p.fx = { k: win ? 'win' : 'fail', t: game.turn };
  if (win) {
    _loseTroops(game, old, att * 0.15, p.c);
    p.o = ent; p.g = Math.round(att * 0.2 * 10) / 10; p.q = null;
    p.b.base = Math.max(0, p.b.base - 1);
    try { on_prov_capture(game, ent, pid, old); } catch (e) { /* botin/descontento opcionales */ }
    // pais completo: si cae la capital o todas sus provincias
    const own = game.countries[p.c].owner;
    const rest = provs_of_country(game, p.c).filter((q) => pr[q].o === own);
    if (own !== ent && (p.cap || rest.length === 0)) {
      capture(game, ent, p.c);
      _relocate(game, own, p.c);
      for (const q of provs_of_country(game, p.c)) if (pr[q].o === own) pr[q].o = ent;
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
  if (p.o !== ent) return { ok: false, error: 'La provincia no es tuya.' };
  if (p.q) return { ok: false, error: 'Ya hay una obra en curso.' };
  if (B.need && !B.need.includes(p.r)) return { ok: false, error: B.name + ' requiere ' + B.need.map((x) => RES[x].name).join(' o ') + '.' };
  const lvl = p.b[kind] || 0;
  if (lvl >= B.max) return { ok: false, error: 'Nivel máximo.' };
  const cost = Math.round(B.cost * (1 + 0.5 * lvl));
  const me = game.countries[ent];
  if (!free) { if ((me.money || 0) < cost) return { ok: false, error: 'Fondos insuficientes (' + cost + ').' }; me.money -= cost; }
  p.q = { kind, turns: B.turns };
  return { ok: true, msg: 'Obra iniciada: ' + B.name + ' en ' + prov_geo().byId[pid].n + '.' };
}

export function build_cost(p, kind) { return Math.round(BUILD[kind].cost * (1 + 0.5 * (p.b[kind] || 0))); }

// ------------------------------------------------------------------ turno
export function prov_turn(game, rng, lines) {
  const e = game.ext; if (!e) return; init_prov(game);
  const pr = e.prov; const me = game.player;
  // 1) sincroniza con conquistas del motor central (pais entero)
  for (const [cid, c] of Object.entries(game.countries)) {
    const was = e.cown[cid];
    if (was !== undefined && was !== c.owner) {
      for (const pid of provs_of_country(game, cid)) if (pr[pid].o === was) { pr[pid].o = c.owner; pr[pid].q = null; }
    }
    e.cown[cid] = c.owner;
  }
  // 2) colas de obra y rendimientos
  const gain = {};
  const add = (o, k, v) => { (gain[o] = gain[o] || { m: 0, s: 0, t: 0 })[k] += v; };
  for (const [pid, p] of Object.entries(pr)) {
    if (p.fx && game.turn - p.fx.t > 1) delete p.fx;
    if (p.q) {
      p.q.turns -= 1;
      if (p.q.turns <= 0) {
        p.b[p.q.kind] = (p.b[p.q.kind] || 0) + 1;
        if (p.o === me) lines.push('Obra terminada: ' + BUILD[p.q.kind].name + ' nv ' + p.b[p.q.kind] + ' en ' + prov_geo().byId[pid].n + '.');
        p.q = null;
      }
    }
    if (!game.countries[p.o]) continue;
    if (p.r) add(p.o, 'm', 1.5);
    add(p.o, 'm', 3 * p.b.fabrica + 6 * p.b.refineria + 4 * p.b.mina + 2 * p.b.granja);
    add(p.o, 's', 0.15 * p.b.granja);
    add(p.o, 't', 0.6 * p.b.base);
    if (p.g > 0 && p.o !== game.countries[p.c].owner) p.g = Math.min(60, p.g + 0.5 * p.b.base);
  }
  for (const [o, v] of Object.entries(gain)) {
    const c = game.countries[o]; if (!c) continue;
    c.money = (c.money || 0) + Math.round(v.m * 10) / 10;
    c.stability = Math.min(100, (c.stability || 0) + v.s);
    if (v.t > 0) { const ds = divisions_of(game, o); if (ds.length) ds[0].troops += v.t; }
  }
  if (gain[me] && gain[me].m > 0) lines.push('Provincias: +' + Math.round(gain[me].m) + ' de recursos y edificios.');
  // 3) IA: construye y ataca provincias limitrofes
  const owners = new Set(Object.values(pr).map((p) => p.o));
  for (const o of owners) {
    if (o === me || !game.countries[o]) continue;
    const mine = Object.keys(pr).filter((pid) => pr[pid].o === o);
    if (rng.random() < 0.3 && mine.length) {
      const pid = mine[Math.floor(rng.random() * mine.length)]; const p = pr[pid];
      const opts = Object.keys(BUILD).filter((k) => (!BUILD[k].need || BUILD[k].need.includes(p.r)) && p.b[k] < BUILD[k].max);
      const k = opts[Math.floor(rng.random() * opts.length)];
      if (k && (game.countries[o].money || 0) > build_cost(p, k) * 2) prov_build(game, o, pid, k, false);
    }
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

// ------------------------------------------------------------------ interfaz Tanda 1 (la rellena el trabajador C)
/**
 * Acciones de provincia del jugador no cubiertas por prov_attack/prov_build (p.ej. {action:'prov_recruit', pid, kind},
 * {action:'prov_line', pid}). Devuelve {ok,msg}|{ok:false,error} o null si la accion no es de este modulo.
 */
export function prov_action(game, ent, body) { void game; void ent; void body; return null; }
/** Suma de niveles de laboratorio en las provincias de la entidad (bono de investigacion). */
export function prov_lab_levels(game, ent) { void game; void ent; return 0; }
/** Multiplicador de defensa del territorio (pais) por fortalezas y lineas defensivas de sus provincias (>= 1). */
export function country_defense_mult(game, target) { void game; void target; return 1.0; }
/** Multiplicador logistico de ataque de la division d (carreteras/ferrocarril en su territorio de origen) (>= 1). */
export function attack_logistics_mult(game, d, target) { void game; void d; void target; return 1.0; }
/** Decisiones pendientes para el carrusel: [{text, kind, screen}]. */
export function prov_pending(game) { void game; return []; }
