// Tanda 3, trabajador C: aviación, aeropuertos, drones, baterías de misiles, bombardeo de artillería a distancia,
// radares, marina y helicópteros. Módulo con la interfaz estándar de features.EXT_MODULES {init, action, turn, pending}.
// Puro: sin DOM. Todo el estado nuevo vive en game.ext.* con inicialización PEREZOSA.
//
// ESTADO:
//   game.divisions[i].base   pid del aeropuerto/puerto base de una aeronave/dron/helicóptero/barco (null = sin base)
//   game.divisions[i].st     undefined | 'recarga' (tras un ataque o un cambio de base) | 'carga' | 'marcha' (de otros módulos)
//   game.divisions[i].rl     turnos de recarga restantes (st === 'recarga')
//   game.ext.aero = { strikes: [{turn, by, kind, pid, text, dmg}], decoys: {pid: turn}, intel: {cid: {by: turno_fin}} }
//
// ACCIONES (ext_action -> action(game, body)): devuelve {ok,msg}|{ok:false,error} o null si no es suya.
//   { action:'strike', div, pid, oj? }  bombardeo/incursión de art|misil|caza|bomb|bpes|bestr|heli|dkam sobre la provincia pid
//   { action:'drone', div, pid|cid }    dron explorador (revela un país) o señuelo (protege una provincia propia)
//   { action:'rebase', div, pid }       cambia el aeropuerto/puerto base de una aeronave o barco
//
// GANCHOS que usan otros módulos (mantener firmas):
//   can_act, recruit_check, strike_targets, on_prov_lost, range_ok, is_revealed, strike_estimate
import { ensure, ok, err, news, r1 } from './extutil.js';
import { is_alive, at_war, sync_armies, adjacency, add_rel, raw_power, entities, make_rng } from './state.js';
import { prov_geo, prov_defense } from './provinces.js';
import { ROSTER, MIGRATE_KIND, lookup, soil_mods } from './roster.js';
import { stock_of } from './supply.js';

export const AIRPORT_CAP = 2;     // aeronaves (aviones + drones + helicópteros) por nivel de aeropuerto
export const PORT_CAP = 2;        // barcos por nivel de puerto
export const PORTA_SLOTS = 2;     // plazas aéreas extra por portaaviones propio en el país
export const AI_STRIKE_PROB = 0.3;
const STRIKE_LOG_MAX = 60;
const HEAL_FRAC = 0.15, HEAL_COST = 0.5;
const STATIC_BLD = ['avenida', 'ferrocarril', 'fuerte', 'aeropuerto', 'puerto', 'radar'];

// ------------------------------------------------------------------ utilidades
export function kind_of(d) {
  if (d.kind && ROSTER[d.kind]) return d.kind;
  if (d.kind && MIGRATE_KIND[d.kind]) return MIGRATE_KIND[d.kind];
  return 'inf';
}
const spec = (d) => ROSTER[kind_of(d)];
/** Composición al 100 % de la división (d.full si A la fijó; si no, la del roster). */
const full_of = (d) => { const sp = spec(d); const f = d.full || {}; return { troops: f.troops != null ? f.troops : sp.troops, tanks: f.tanks != null ? f.tanks : sp.tanks, planes: f.planes != null ? f.planes : sp.planes }; };
export const is_flyer = (d) => ['air', 'drone', 'heli'].includes(spec(d).cls);
export const is_naval = (d) => spec(d).cls === 'nav';
export const has_base = (d) => is_flyer(d) || is_naval(d);
const P = (game) => game.ext && game.ext.prov;
const A = (game) => (game.ext ? ensure(game.ext, 'aero', () => ({ strikes: [], decoys: {}, intel: {} })) : { strikes: [], decoys: {}, intel: {} });
const pname = (pid) => { const g = prov_geo().byId[pid]; return g ? g.n : pid; };
const cname = (game, cid) => (game.countries[cid] ? game.countries[cid].name : cid);
const done_techs = (game, cid) => { const t = game.ext && game.ext.techs && game.ext.techs[cid]; return (t && t.done) || []; };
const has_t = (game, cid, id) => done_techs(game, cid).includes(id);

// distancia en saltos de país (BFS sobre tierra + mar), cacheada por mapa de adyacencia
const _bfs = new WeakMap();
export function hops(a, b) {
  if (a === b) return 0;
  const adj = adjacency();
  let cache = _bfs.get(adj);
  if (!cache) { cache = {}; _bfs.set(adj, cache); }
  let dist = cache[a];
  if (!dist) {
    dist = { [a]: 0 };
    const q = [a];
    for (let i = 0; i < q.length; i++) {
      for (const n of adj[q[i]] || []) if (dist[n] === undefined) { dist[n] = dist[q[i]] + 1; q.push(n); }
    }
    cache[a] = dist;
  }
  return dist[b] === undefined ? 99 : dist[b];
}

/** Edificio de base que necesita la división (aeropuerto|puerto|null). */
function base_kind(d) { return is_flyer(d) ? 'aeropuerto' : is_naval(d) ? 'puerto' : null; }

/** Plazas del aeropuerto/puerto pid para el dueño ent. */
function capacity(game, ent, pid, bk) {
  const p = P(game) && P(game)[pid];
  if (!p || p.o !== ent) return 0;
  const lv = p.b[bk] || 0;
  if (bk === 'puerto') return PORT_CAP * lv;
  let cap = AIRPORT_CAP * lv;
  if (lv > 0) cap += PORTA_SLOTS * (game.divisions || []).filter((x) => x.owner === ent && kind_of(x) === 'porta' && x.location === p.c).length;
  return cap;
}
/** Plazas totales de la base pid (aeropuerto|puerto) para el dueño ent. */
export function base_capacity(game, ent, pid, bk) { return capacity(game, ent, pid, bk); }
function occupants(game, ent, pid, bk, except) {
  return (game.divisions || []).filter((x) => x !== except && x.owner === ent && x.base === pid && base_kind(x) === bk);
}
function base_valid(game, d) {
  const bk = base_kind(d); if (!bk || !d.base) return false;
  const p = P(game) && P(game)[d.base];
  return !!(p && p.o === d.owner && (p.b[bk] || 0) >= 1);
}
function base_country(game, d) {
  const p = P(game) && d.base && P(game)[d.base];
  return p && base_valid(game, d) ? p.c : d.location;
}
function range_of(game, d) {
  const sp = spec(d);
  let r = sp.range || 0;
  if (kind_of(d) === 'misil' && has_t(game, d.owner, 'silo')) r += 1;
  return r;
}
/** Candidatos de base (pid de aeropuertos/puertos propios con hueco) ordenados por distancia a `from` (país). */
function base_candidates(game, d, from, maxHops) {
  const bk = base_kind(d); const pr = P(game); if (!bk || !pr) return [];
  const out = [];
  for (const [pid, p] of Object.entries(pr)) {
    if (p.o !== d.owner || (p.b[bk] || 0) < 1) continue;
    const dist = hops(from, p.c);
    if (dist > maxHops) continue;
    if (occupants(game, d.owner, pid, bk, d).length + 1 > capacity(game, d.owner, pid, bk)) continue;
    out.push({ pid, dist });
  }
  out.sort((a, b) => a.dist - b.dist || (a.pid < b.pid ? -1 : 1));
  return out.map((x) => x.pid);
}
export function rebase_candidates(game, d) {
  if (!has_base(d)) return [];
  const from = base_country(game, d);
  return base_candidates(game, d, from, spec(d).range || 3).filter((pid) => pid !== d.base);
}
/** Asigna base perezosamente (aeropuerto/puerto propio más cercano con hueco, o null). */
export function ensure_base(game, d) {
  if (!has_base(d) || d.base !== undefined) return d.base;
  const c = base_candidates(game, d, d.location, 99);
  d.base = c.length ? c[0] : null;
  return d.base;
}

// ------------------------------------------------------------------ interfaz estándar
export function init(game) {
  if (!game.ext) return;
  ensure(game.ext, 'aero', () => ({ strikes: [], decoys: {}, intel: {} }));
}

// ------------------------------------------------------------------ ganchos
export function can_act(game, d) {
  void game;
  return !(d && (d.st === 'recarga' || d.st === 'carga' || d.st === 'marcha'));
}

export function recruit_check(game, ent, kind, pid) {
  const sp = ROSTER[kind]; if (!sp || !pid) return null;
  const bk = ['air', 'drone', 'heli'].includes(sp.cls) ? 'aeropuerto' : sp.cls === 'nav' ? 'puerto' : null;
  if (!bk) return null;
  const p = P(game) && P(game)[pid];
  if (!p) return null;
  if (p.o !== ent) return 'La provincia de producción no es tuya.';
  const cap = capacity(game, ent, pid, bk);
  if (cap <= 0) return bk === 'aeropuerto' ? 'Esta provincia no tiene aeropuerto.' : 'Esta provincia no tiene puerto.';
  const used = occupants(game, ent, pid, bk).length;
  // las unidades ya en cola de producción hacia pid también ocupan plaza
  const q = (game.ext && game.ext.prodq && game.ext.prodq[ent]) || [];
  // al terminar una producción, units.turn ya descontó `left`: los ya terminados (left <= 0, incluida la propia) no cuentan
  const queued = q.filter((x) => (x.left == null || x.left > 0) && x.pid === pid && ROSTER[x.kind] && (bk === 'aeropuerto' ? ['air', 'drone', 'heli'].includes(ROSTER[x.kind].cls) : ROSTER[x.kind].cls === 'nav')).length;
  if (used + queued + 1 > cap) return `${bk === 'aeropuerto' ? 'Aeropuerto' : 'Puerto'} lleno (${used + queued}/${cap} plazas). Amplíalo o usa otra provincia.`;
  return null;
}

export function range_ok(game, d, cid) {
  if (!d || !game.countries[cid]) return false;
  const r = range_of(game, d);
  if (!r) return false;
  return hops(base_country(game, d), cid) <= r;
}

/** Provincias enemigas alcanzables por la división d (pids). */
export function strike_targets(game, d) {
  const pr = P(game); if (!pr || !d) return [];
  const sp = spec(d);
  if (!sp.range || sp.static || sp.cls === 'nav') return [];
  if (['dexp', 'dsen'].includes(kind_of(d))) return [];
  const out = [];
  if (sp.cls === 'art' && kind_of(d) === 'art') {
    const G = prov_geo(); const seen = new Set();
    for (const [pid, p] of Object.entries(pr)) {
      if (p.c !== d.location || p.o !== d.owner) continue;
      for (const q of G.adj[pid] || []) {
        const pq = pr[q];
        if (pq && !seen.has(q) && pq.o !== d.owner && at_war(game, d.owner, pq.o)) { seen.add(q); out.push(q); }
      }
    }
    return out;
  }
  const from = base_country(game, d);
  const r = range_of(game, d);
  const cache = {};
  for (const [pid, p] of Object.entries(pr)) {
    if (p.o === d.owner || !at_war(game, d.owner, p.o)) continue;
    if (cache[p.c] === undefined) cache[p.c] = hops(from, p.c) <= r;
    if (cache[p.c]) out.push(pid);
  }
  return out;
}

/** Un edificio base (aeropuerto/puerto) cambió de dueño: reubica o pierde las aeronaves/barcos afectados. */
export function on_prov_lost(game, pid, old_owner) {
  void old_owner;
  if (!game.ext) return;
  let changed = false;
  for (const d of [...(game.divisions || [])]) {
    if (d.base !== pid || !has_base(d)) continue;
    if (!base_valid(game, d)) changed = relocate(game, d, []) || changed;
  }
  if (changed) sync_armies(game);
}

export function is_revealed(game, by, cid) {
  const a = game.ext && game.ext.aero;
  const t = a && a.intel && a.intel[cid] && a.intel[cid][by];
  return t !== undefined && t >= game.turn;
}

// ------------------------------------------------------------------ reubicación y pérdida
function lose_unit(game, d, lines, why) {
  game.divisions = game.divisions.filter((x) => x !== d);
  const t = `${d.name} de ${cname(game, d.owner)} ${why}.`;
  news(game, t, 'mil');
  if (lines && d.owner === game.player) lines.push(t);
}
/** Intenta reubicar d en otra base; si no, la pierde. Devuelve true si cambió algo. */
function relocate(game, d, lines) {
  const from = d.location;
  const c = base_candidates(game, d, from, spec(d).range || 3).filter((pid) => pid !== d.base);
  if (c.length) {
    const p = P(game)[c[0]];
    d.base = c[0]; d.location = p.c;
    const t = `${d.name} de ${cname(game, d.owner)} se traslada a la base de ${pname(c[0])}.`;
    news(game, t, 'mil');
    if (lines && d.owner === game.player) lines.push(t);
    return true;
  }
  lose_unit(game, d, lines, is_naval(d) ? 'se perdió al quedarse sin puerto' : 'se quedó sin combustible al perder su base');
  return true;
}

// ------------------------------------------------------------------ daño
function upgrades(game, d) {
  const sp = spec(d); let n = 0;
  const skip = kind_of(d) === 'bomb' ? ['air_bomb2', 'air_bomb3'] : [];
  for (const t of sp.up || []) if (!skip.includes(t) && has_t(game, d.owner, t)) n++;
  return 1 + 0.1 * n;
}
function health(d) {
  const f = full_of(d);
  const full = raw_power(f.troops, f.tanks, f.planes) || 1;
  return Math.max(0.25, Math.min(1, raw_power(d.troops, d.tanks, d.planes) / full));
}
export function warhead_of(game, d, want) {
  if (kind_of(d) !== 'bpes') return null;
  const order = ['nuc', 'bio', 'exp'];
  const avail = order.filter((o) => has_t(game, d.owner, 'oj_' + o));
  if (want && avail.includes(want)) return want;
  return avail[0] || null;
}
const WARHEAD_MULT = { exp: 1.3, nuc: 2.5, bio: 2 };

export const RADAR_RANGE = 2;      // provincias de alcance de detección del radar
export const RADAR_FACTOR = 0.65;  // multiplicador de daño aéreo/misiles sobre zona cubierta

/** Provincia con radar propio del defensor a RADAR_RANGE saltos o menos (o en el mismo país si no hay geografía). */
function radar_of(game, p) {
  const pr = P(game);
  let pid = null;
  for (const k of Object.keys(pr)) if (pr[k] === p) { pid = k; break; }
  if (pid !== null) {
    try {
      const adj = prov_geo().adj;
      let frontier = [pid]; const seen = new Set([pid]);
      for (let h = 0; h <= RADAR_RANGE; h++) {
        const next = [];
        for (const q of frontier) {
          const pq = pr[q];
          if (pq && pq.o === p.o && (pq.b.radar || 0) >= 1) return true;
          for (const n of adj[q] || []) if (!seen.has(n)) { seen.add(n); next.push(n); }
        }
        frontier = next;
      }
      return false;
    } catch (e) { /* cae al cálculo por país */ }
  }
  for (const q of Object.values(pr)) if (q.c === p.c && q.o === p.o && (q.b.radar || 0) >= 1) return true;
  return false;
}

/** Cobertura de radar sobre una provincia (para la IA y la interfaz). */
export function radar_covers(game, pid) { const p = P(game) && P(game)[pid]; return !!p && radar_of(game, p); }

/** Daño base y modificadores (sin consumir nada). */
export function strike_estimate(game, d, pid, oj) {
  const p = P(game) && P(game)[pid]; if (!p) return 0;
  const kind = kind_of(d); const sp = spec(d);
  const g = prov_geo().byId[pid];
  let dmg = sp.atk * upgrades(game, d) * health(d);
  if (kind === 'bomb') dmg *= 1 + 0.1 * (['air_bomb2', 'air_bomb3'].filter((t) => has_t(game, d.owner, t)).length);
  const wh = warhead_of(game, d, oj);
  if (wh) dmg *= WARHEAD_MULT[wh];
  dmg *= soil_mods(kind, g && g.t).atk;
  const a = game.ext && game.ext.aero;
  if (a && a.decoys[pid] !== undefined && a.decoys[pid] >= game.turn - 1) dmg *= 0.8;
  if (sp.cls !== 'art' || kind === 'misil') if (radar_of(game, p)) dmg *= RADAR_FACTOR;
  return r1(dmg);
}

export function do_strike(game, d, pid, rng, oj) {
  const pr = P(game); const p = pr[pid];
  const kind = kind_of(d); const sp = spec(d);
  const g = prov_geo().byId[pid];
  const a = A(game);
  let dmg = sp.atk * upgrades(game, d) * health(d);
  if (kind === 'bomb') dmg *= 1 + 0.1 * (['air_bomb2', 'air_bomb3'].filter((t) => has_t(game, d.owner, t)).length);
  const wh = warhead_of(game, d, oj);
  if (wh) dmg *= WARHEAD_MULT[wh];
  dmg *= soil_mods(kind, g && g.t).atk;
  const notes = [];
  if (a.decoys[pid] !== undefined && a.decoys[pid] >= game.turn - 1) { dmg *= 0.8; delete a.decoys[pid]; notes.push('un señuelo desvió parte del ataque'); }
  const defender = p.o;
  const air = sp.cls !== 'art' || kind === 'misil';
  if (air && radar_of(game, p)) {
    dmg *= RADAR_FACTOR;
    news(game, `El radar de ${cname(game, defender)} detecta ${kind === 'misil' ? 'misiles' : 'aviones'} de ${cname(game, d.owner)} sobre ${pname(pid)}.`, 'war');
    notes.push('el radar redujo el daño');
  }
  dmg = r1(dmg);
  // --- efectos
  const onlyStatic = !!sp.onlyStatic;
  if (!onlyStatic) p.g = Math.max(0, r1((p.g || 0) - dmg * 0.5));
  if (wh === 'nuc') {
    for (const e of entities(game)) if (e !== d.owner) add_rel(game, d.owner, e, -30);
    notes.push('condena internacional');
  }
  if (wh === 'bio') {
    const un = ensure(game.ext, 'unrest', () => ({}));
    un[pid] = Math.min(100, (un[pid] || 0) + 30);
    notes.push('descontento +30');
  }
  let bld = null;
  if (onlyStatic) {
    const lvls = STATIC_BLD.filter((k) => (p.b[k] || 0) >= 1);
    if (lvls.length) {
      bld = lvls[Math.min(lvls.length - 1, Math.floor(rng.random() * lvls.length))];
      p.b[bld] -= 1;
      notes.push(`−1 nivel de ${bld}`);
    }
  }
  // divisiones enemigas en el país de la provincia
  const hit = [];
  for (const t of game.divisions) {
    if (t.location !== p.c || t.owner === d.owner || !at_war(game, d.owner, t.owner)) continue;
    const tk = kind_of(t); const ts = ROSTER[tk];
    if (onlyStatic && !ts.static) continue;
    let f = dmg * 0.012 * lookup(sp.vs, tk) * lookup(ts.dmg, kind) * (t.st === 'carga' ? 2 : 1) * (tk === 'convoy' ? 2.5 : 1);
    if (f <= 0) continue;
    f = Math.min(0.6, f);
    t.troops *= 1 - f; t.tanks *= 1 - f; t.planes *= 1 - f;
    hit.push({ id: t.id, f });
  }
  if (hit.length) {
    const dead = new Set(game.divisions.filter((t) => hit.some((h) => h.id === t.id) && raw_power(t.troops, t.tanks, t.planes) < 0.5).map((t) => t.id));
    if (dead.size) game.divisions = game.divisions.filter((t) => !dead.has(t.id));
    const one = hit.length === 1;
    notes.push(`${hit.length} ${one ? 'división enemiga alcanzada' : 'divisiones enemigas alcanzadas'}${dead.size ? `, ${dead.size} ${dead.size === 1 ? 'destruida' : 'destruidas'}` : ''}`);
  }
  // --- estado del atacante
  let reload = sp.reload || 1;
  if (kind === 'misil' && has_t(game, d.owner, 'silo')) reload = Math.max(1, reload - 1);
  if (sp.single) game.divisions = game.divisions.filter((x) => x !== d);
  else { d.st = 'recarga'; d.rl = kind === 'art' ? 1 : reload; }
  sync_armies(game);
  const verb = kind === 'art' ? 'bombardea' : kind === 'misil' ? 'lanza misiles sobre' : kind === 'dkam' ? 'estrella un dron kamikaze contra' : kind === 'heli' ? 'ataca desde el aire a' : 'bombardea';
  const text = `${cname(game, d.owner)} ${verb} ${pname(pid)} (${cname(game, p.c)}) con ${d.name}: daño ${dmg}${notes.length ? ' · ' + notes.join(', ') : ''}.`;
  news(game, text, 'war');
  a.strikes.push({ turn: game.turn, by: d.owner, kind, pid, text, dmg });
  if (a.strikes.length > STRIKE_LOG_MAX) a.strikes.splice(0, a.strikes.length - STRIKE_LOG_MAX);
  return { dmg, text, notes };
}

// ------------------------------------------------------------------ acciones
export function action(game, body) {
  if (!body || !game.ext) return null;
  const me = game.player;
  if (body.action !== 'strike' && body.action !== 'drone' && body.action !== 'rebase') return null;
  init(game);
  const d = (game.divisions || []).find((x) => x.id === body.div);
  if (!d || d.owner !== me) return err('División no encontrada.');
  const kind = kind_of(d); const sp = spec(d);
  if (has_base(d)) ensure_base(game, d);

  if (body.action === 'rebase') {
    if (!has_base(d)) return err('Solo las aeronaves y los barcos tienen base.');
    const bk = base_kind(d);
    const p = P(game)[body.pid];
    if (!p || p.o !== me || (p.b[bk] || 0) < 1) return err(`Elige un ${bk} propio.`);
    if (body.pid === d.base) return err('Ya está basada ahí.');
    if (hops(base_country(game, d), p.c) > (sp.range || 3)) return err('Fuera de su radio de acción.');
    if (occupants(game, me, body.pid, bk, d).length + 1 > capacity(game, me, body.pid, bk)) return err('Esa base está llena.');
    d.base = body.pid; d.location = p.c;
    d.st = 'recarga'; d.rl = Math.max(d.rl || 0, 1);
    sync_armies(game);
    return ok(`${d.name} cambia de base a ${pname(body.pid)} (lista el próximo turno).`);
  }

  if (!can_act(game, d)) return err(`${d.name} no está disponible (${d.st === 'recarga' ? 'en recarga ' + (d.rl || 1) + ' t' : d.st}).`);
  if (has_base(d) && is_flyer(d) && !base_valid(game, d)) return err(`${d.name} no tiene aeropuerto base propio.`);

  if (body.action === 'drone') {
    const a = A(game);
    if (kind === 'dexp') {
      const cid = body.cid || (P(game)[body.pid] && P(game)[body.pid].c);
      if (!cid || !game.countries[cid]) return err('Elige un país.');
      if (!range_ok(game, d, cid)) return err('Fuera del radio del dron.');
      const until = game.turn + 6;
      (a.intel[cid] = a.intel[cid] || {})[me] = until;
      game.divisions = game.divisions.filter((x) => x !== d);
      sync_armies(game);
      const t = `Dron explorador sobre ${cname(game, cid)}: tropas y edificios revelados hasta el turno ${until}.`;
      news(game, t, 'spy');
      return ok(t);
    }
    if (kind === 'dsen') {
      const p = P(game)[body.pid];
      if (!p || p.o !== me) return err('Elige una provincia propia para proteger.');
      if (!range_ok(game, d, p.c)) return err('Fuera del radio del dron.');
      a.decoys[body.pid] = game.turn;
      game.divisions = game.divisions.filter((x) => x !== d);
      sync_armies(game);
      return ok(`Señuelo desplegado sobre ${pname(body.pid)}: el próximo ataque causará un 20 % menos.`);
    }
    return err('Esta unidad no es un dron explorador ni señuelo.');
  }

  // strike
  if (sp.single && kind !== 'dkam') return err('Usa la acción del dron.');
  const targets = strike_targets(game, d);
  if (!targets.length && !(P(game) && P(game)[body.pid])) return err('Sin objetivos en alcance.');
  const p = P(game)[body.pid];
  if (!p) return err('Provincia desconocida.');
  if (p.o === me) return err('No puedes atacar tu propia provincia.');
  if (!at_war(game, me, p.o)) return err('Debes estar en guerra con su dueño.');
  if (!targets.includes(body.pid)) return err('Fuera del alcance de esta unidad.');
  const rng = make_rng(game, 'strike' + d.id + ':' + game.turn + ':' + A(game).strikes.length);
  const r = do_strike(game, d, body.pid, rng, body.oj);
  return ok(r.text, { damage: r.dmg });
}

// ------------------------------------------------------------------ turno
function heal(game, d) {
  const sp = full_of(d);
  let any = false;
  for (const [k, full] of [['troops', sp.troops], ['tanks', sp.tanks], ['planes', sp.planes]]) {
    if (full > 0 && d[k] < full) { d[k] = Math.min(full, d[k] + full * HEAL_FRAC); any = true; }
  }
  return any;
}
function needs_heal(d) {
  const sp = full_of(d);
  return (sp.troops > 0 && d.troops < sp.troops) || (sp.tanks > 0 && d.tanks < sp.tanks) || (sp.planes > 0 && d.planes < sp.planes);
}

export function turn(game, rng, lines) {
  if (!game.ext || !P(game)) return;
  init(game);
  const me = game.player;
  // 1) recargas
  for (const d of game.divisions) {
    if (d.st !== 'recarga') continue;
    d.rl = (d.rl || 1) - 1;
    if (d.rl <= 0) { delete d.st; delete d.rl; }
  }
  // 2) bases: asignar, validar, capacidad
  for (const d of [...game.divisions]) {
    if (!has_base(d)) continue;
    if (d.base === undefined) { ensure_base(game, d); continue; }
    if (d.base !== null && !base_valid(game, d)) relocate(game, d, lines);
  }
  const bks = ['aeropuerto', 'puerto'];
  for (const bk of bks) {
    const groups = {};
    for (const d of game.divisions) if (d.base && has_base(d) && base_kind(d) === bk) (groups[d.owner + '|' + d.base] = groups[d.owner + '|' + d.base] || []).push(d);
    for (const list of Object.values(groups)) {
      const cap = capacity(game, list[0].owner, list[0].base, bk);
      if (list.length > cap) {
        // las excedentes (las últimas) se reubican o se pierden; los drones de un solo uso se reubican primero
        const extra = list.slice(cap);
        for (const d of extra) relocate(game, d, lines);
      }
    }
  }
  // 3) curación en base
  for (const d of game.divisions) {
    if (!has_base(d) || !base_valid(game, d) || !needs_heal(d)) continue;
    const p = P(game)[d.base];
    if (d.location !== p.c) continue;
    const st = game.ext.stock ? stock_of(game, d.owner) : null;
    if (st) { if ((st.goods || 0) < HEAL_COST) continue; st.goods = r1(st.goods - HEAL_COST); }
    heal(game, d);
  }
  sync_armies(game);
  // 4) IA
  for (const ent of entities(game)) {
    if (ent === me || !is_alive(game, ent)) continue;
    if (!game.wars.some((w) => w.a === ent || w.b === ent)) continue;
    // drones de un solo uso: exploradores sobre un enemigo y señuelos sobre una provincia propia (se consumen)
    for (const d of [...game.divisions]) {
      if (d.owner !== ent || !['dexp', 'dsen'].includes(kind_of(d)) || !can_act(game, d) || (is_flyer(d) && !base_valid(game, d))) continue;
      if (rng.random() > 0.5) continue;
      if (kind_of(d) === 'dexp') {
        const foes = [...new Set(Object.values(P(game)).filter((p) => p.o !== ent && at_war(game, ent, p.o)).map((p) => p.o))].filter((c) => range_ok(game, d, c));
        if (!foes.length) continue;
        const cid = foes[Math.floor(rng.random() * foes.length)];
        (A(game).intel[cid] = A(game).intel[cid] || {})[ent] = game.turn + 6;
        game.divisions = game.divisions.filter((x) => x !== d);
        A(game).drone_uses = (A(game).drone_uses || 0) + 1;
        if (cid === me) lines.push(`${cname(game, ent)} sobrevuela tu territorio con un dron explorador.`);
      } else {
        const own = Object.entries(P(game)).filter(([, p]) => p.o === ent && range_ok(game, d, p.c));
        if (!own.length) continue;
        own.sort((x, y) => (y[1].cap ? 1 : 0) - (x[1].cap ? 1 : 0) || rng.random() - 0.5);
        A(game).decoys[own[0][0]] = game.turn;
        game.divisions = game.divisions.filter((x) => x !== d);
        A(game).drone_uses = (A(game).drone_uses || 0) + 1;
      }
    }
    sync_armies(game);
    if (rng.random() > AI_STRIKE_PROB) continue;
    const mine = game.divisions.filter((d) => d.owner === ent && can_act(game, d) && !ROSTER[kind_of(d)].static && ROSTER[kind_of(d)].range && !['dexp', 'dsen'].includes(kind_of(d)) && (!is_flyer(d) || base_valid(game, d)));
    let shots = 0;
    for (const d of mine) {
      if (shots >= 2) break;
      const targets = strike_targets(game, d);
      if (!targets.length) continue;
      let best = null, bd = Infinity;
      const flyer = is_flyer(d) || ['dexp', 'dkam', 'heli', 'bomb', 'bpes'].includes(kind_of(d));
      for (const t of targets) {
        let df = prov_defense(game, t);
        // los convoyes son objetivo prioritario; el radar enemigo desanima a los aviones
        const pt = P(game)[t];
        if (game.divisions.some((x) => x.location === pt.c && x.owner === pt.o && x.kind === 'convoy')) df *= 0.4;
        if (flyer && radar_of(game, pt)) df *= 1.3;
        if (df < bd) { bd = df; best = t; }
      }
      if (best === null) continue;
      const r = do_strike(game, d, best, rng, null);
      shots++;
      if (game.countries[P(game)[best].o] && P(game)[best].o === me) lines.push(r.text);
    }
  }
}

export function pending(game) {
  const out = [];
  if (!game.ext || !P(game)) return out;
  const me = game.player;
  const mine = game.divisions.filter((d) => d.owner === me);
  const nobase = mine.filter((d) => is_flyer(d) && !base_valid(game, d));
  if (nobase.length) out.push({ text: `${nobase.length === 1 ? nobase[0].name : nobase.length + ' aeronaves'} sin aeropuerto base: reasígnala${nobase.length === 1 ? '' : 's'}`, kind: 'mil', screen: 'army' });
  const ending = mine.filter((d) => d.st === 'recarga' && (d.rl || 1) <= 1 && ROSTER[kind_of(d)].range);
  if (ending.length) out.push({ text: `${ending.length === 1 ? ending[0].name : ending.length + ' unidades'} termina${ending.length === 1 ? '' : 'n'} su recarga`, kind: 'mil', screen: 'army' });
  const byKind = {};
  for (const d of mine) {
    if (!can_act(game, d) || !ROSTER[kind_of(d)].range || (is_flyer(d) && !base_valid(game, d))) continue;
    const t = strike_targets(game, d);
    if (t.length) byKind[kind_of(d)] = (byKind[kind_of(d)] || 0) + 1;
  }
  const names = Object.keys(byKind);
  if (names.length) out.push({ text: `Tus ${ROSTER[names[0]].name.toLowerCase()}${names.length > 1 ? ' y otras unidades' : ''} pueden atacar objetivos enemigos`, kind: 'war', screen: 'map' });
  return out.slice(0, 3);
}
