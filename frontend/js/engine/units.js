// Unidades especializadas, formaciones (agrupaciones), modificadores de combate (tipo y terreno),
// botin de guerra y descontento en provincias conquistadas. Estado en game.ext.* (ver abajo).
// Puro: sin DOM. Se invoca desde features.js (init/action/turn/pending) y mediante ganchos
// opcionales desde military.js / provinces.js. Cuando game.ext no existe, todos los ganchos son neutros.
//
// ESTADO (inicializacion perezosa; partidas antiguas no deben romperse):
//   game.divisions[i].kind : 'inf'|'mot'|'arm'|'art'|'mtn'|'mar'|'air'|'esp'  (si falta, se infiere por el nombre)
//   game.ext.forms[cid]    : [{ id, name, divs:[divisionId...] }]   formaciones (agrupaciones de divisiones)
//   game.ext.unrest[pid]   : 0..100  descontento en provincias ocupadas (dueno != pais original)
//   game.ext.loot          : [{ turn, by, from, pid, name, money, res, amt, text }]  registro de botin (max 40); res: food|fuel|goods|metal|null
//
// ACCIONES (ext_action -> action(game, body)): devuelve {ok,msg}|{ok:false,error} o null si no es suya.
//   { action:'unit_recruit', kind, pid? }   recluta/produce una unidad del tipo en la provincia pid (propia) o en la capital
//   { action:'form_create', name, divs:[ids] } / { action:'form_dissolve', id } / { action:'form_order', id, type, target }
//
import { ensure, ok, err, news, r1, r2 } from './extutil.js';
import { sync_armies, at_war, is_sea_route, next_id, allies_of, raw_power } from './state.js';
import { queue_order, OrderError } from './orders.js';
import { stock_of } from './supply.js';
import { prov_geo, prov_yield, prov_targets, prov_labc_level, BUILD } from './provinces.js';
import * as AERO from './aero.js';
import * as F from './features.js';
import { army_check } from './dipext.js';
import { ROSTER, MIGRATE_KIND, soil_mods, lookup, TERRAIN_GROUP } from './roster.js';

// Tanda 3: el catálogo vive en roster.js (ROSTER). UNIT_TYPES se mantiene como alias por compatibilidad.
export { ROSTER, KINDS, CLASS_NAME, MIGRATE_KIND, soil_mods, lookup, TERRAIN_GROUP, SOIL_NAME, SOIL_MODS } from './roster.js';
export const UNIT_TYPES = ROSTER;

/** Tipo de una division (si falta `kind` o es un tipo antiguo, se infiere/migra). */
export function kind_of(d) {
  if (d.kind && ROSTER[d.kind]) return d.kind;
  if (d.kind && MIGRATE_KIND[d.kind]) return MIGRATE_KIND[d.kind];
  const n = String(d.name || '');
  if (/Blindad/i.test(n)) return 'tl';
  if (/Aerotransport|Aérea|Aerea/i.test(n)) return 'caza';
  if (/Motorizad|Mecanizad|Caballer/i.test(n)) return 'mec';
  if (/Artiller/i.test(n)) return 'art';
  if (/Especial|élite|elite/i.test(n)) return 'elite';
  return 'inf';
}

// ---- Ganchos de la Tanda 3 (firmas estables, usadas por military/orders/provinces/aero y la interfaz) ----
//
// FORMULA DE COMBATE (Tanda 3):
//   ataque de una division  = (atk/4) x suelo.atk x emparejamiento(vs) x [armas combinadas 1,10] x [x1,33 marina por mar]
//   defensa de una division = (def/5) x suelo.def / emparejamiento_enemigo x [armas combinadas 1,10]
//   atk/def ya incluyen +10 % por cada mejora investigada (unit_stats). El suelo es el terreno dominante del pais
//   objetivo (soil_mods). El emparejamiento es la media, ponderada por poder, de lookup(vs, tipo_enemigo) sobre las
//   divisiones enfrentadas (game.ext.battle); sin batalla en curso vale 1.
//   perdidas (loss_mult) = lookup(dmg, enemigo) x suelo.dmg x [en carga x2] x [fortaleza -5 %/nivel defendiendo];
//   la artilleria a distancia no sufre perdidas al atacar.
const AIR_CLS = new Set(['air', 'drone', 'heli', 'nav']);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Garantiza kind y `full` (composicion al 100 %) de una division; perezoso para partidas antiguas. */
export function ensure_div(game, d) {
  if (!d) return d;
  if (!d.kind || !ROSTER[d.kind]) d.kind = kind_of(d);
  if (!d.full) {
    const ut = ROSTER[d.kind];
    d.full = { troops: Math.max(ut.troops, d.troops || 0), tanks: Math.max(ut.tanks, d.tanks || 0), planes: Math.max(ut.planes, d.planes || 0) };
  }
  return d;
}

function _done(game, cid) {
  const t = game && game.ext && game.ext.techs && game.ext.techs[cid];
  return (t && t.done) || [];
}

/** Vida de la division 0..1: efectivos actuales / efectivos al 100 % (d.full). */
export function vida_of(game, d) {
  ensure_div(game, d);
  const f = d.full;
  const full = raw_power(f.troops, f.tanks, f.planes);
  if (full <= 0) return 1;
  return clamp01(raw_power(d.troops || 0, d.tanks || 0, d.planes || 0) / full);
}

/** Estadisticas efectivas de una division (o de un tipo + dueno) con las mejoras ya aplicadas. */
export function unit_stats(game, dOrKind, owner) {
  const d = dOrKind && typeof dOrKind === 'object' ? dOrKind : null;
  const kind = d ? kind_of(d) : dOrKind;
  const ut = ROSTER[kind];
  if (!ut) return null;
  const own = owner || (d && d.owner) || (game && game.player);
  const done = _done(game, own);
  const up = (ut.up || []).filter((t) => done.includes(t)).length;
  const k = 1 + 0.1 * up;
  const vida = d ? vida_of(game, d) : 1;
  const hp = Math.round(ut.hp * k * 10) / 10;
  let state = 'lista';
  if (d && (d.st === 'recarga' || d.st === 'carga' || d.st === 'marcha')) state = d.st;
  return {
    kind, name: ut.name, cls: ut.cls,
    hp, atk: Math.round(ut.atk * k * 100) / 100, def: Math.round(ut.def * k * 100) / 100,
    spd: ut.spd + (kind === 'elite' && done.includes('elite_u1') ? 1 : 0),
    cost: ut.cost, upkeep: ut.upkeep + (ut.cls === 'drone' ? 0.4 : 0), turns: ut.turns,
    vida, hpNow: Math.round(hp * vida * 10) / 10, up, state, rl: d && d.rl != null ? d.rl : 0,
  };
}

/** Repone `frac` (0..1) de la fuerza maxima de la division, sin pasar de d.full. */
export function heal(game, d, frac) {
  ensure_div(game, d);
  const f = d.full;
  const fr = clamp01(frac == null ? 1 : frac);
  d.troops = Math.min(f.troops, (d.troops || 0) + f.troops * fr);
  d.tanks = Math.min(f.tanks, (d.tanks || 0) + f.tanks * fr);
  d.planes = Math.min(f.planes, (d.planes || 0) + f.planes * fr);
  return d;
}

function _wavg(list, fn) {
  let w = 0, s = 0;
  for (const x of list) {
    const p = Math.max(0.1, raw_power(x.troops || 0, x.tanks || 0, x.planes || 0));
    w += p; s += p * fn(x);
  }
  return w > 0 ? s / w : 1;
}
const _arr = (x) => (Array.isArray(x) ? x : x ? [x] : []);

/** Emparejamiento (media ponderada) de `vs` de la division d contra las divisiones `opp`. */
export function matchup_vs(d, opp) {
  const ut = ROSTER[kind_of(d)];
  const list = _arr(opp);
  if (!ut || !list.length) return 1;
  return _wavg(list, (o) => lookup(ut.vs, kind_of(o)));
}
/** Multiplicador de daño recibido por d desde las divisiones `opp`. */
export function matchup_dmg(d, opp) {
  const ut = ROSTER[kind_of(d)];
  const list = _arr(opp);
  if (!ut || !list.length) return 1;
  return _wavg(list, (o) => lookup(ut.dmg, kind_of(o)));
}

/** Multiplicador de pérdidas de la división d frente a las divisiones `opp` (emparejamientos: tp ×4 ante at/elite/bomb,
 *  artillería a distancia atacando → 0, fortaleza, suelo). attacking = true si d es atacante. */
export function loss_mult(game, d, opp, attacking) {
  const kind = kind_of(d);
  const ut = ROSTER[kind];
  if (!ut) return 1.0;
  if (attacking && (ut.tags || []).includes('ranged')) return 0;
  const list = _arr(opp);
  let m = matchup_dmg(d, list);
  // suelo: dominante del pais donde se combate (el del defensor)
  const where = attacking ? (list[0] && list[0].location) : d.location;
  if (where && game.ext) {
    const T = _dominant_terrain(game, where);
    if (T) m *= soil_mods(kind, T).dmg || 1;
  }
  if (d.st === 'carga') m *= 2;
  if (!attacking && game.ext && game.ext.prov) {
    let lv = 0;
    for (const p of Object.values(game.ext.prov)) if (p.c === d.location && p.o === d.owner && (p.b.fuerte || 0) > lv) lv = p.b.fuerte;
    m *= 1 - Math.min(0.5, 0.05 * lv);
  }
  return Math.max(0, m);
}

/** false si la división no puede atacar ni defender (en carga, recarga, marcha). */
export function can_act(game, d) {
  if (!d) return true;
  if (d.st === 'recarga' || d.st === 'carga' || d.st === 'marcha') return false;
  try { return AERO.can_act(game, d) !== false; } catch (e) { return true; }
}

/** Motivo (string) por el que la división no puede recibir la orden `type` (move|attack|defend|front|reorganize), o null. */
export function order_check_div(game, d, type, target) {
  if (!d) return null;
  ensure_div(game, d);
  const ut = ROSTER[d.kind];
  if (!ut) return null;
  if (type === 'move' || type === 'attack') {
    if (ut.static || ut.spd === 0) return type === 'move' ? `${ut.name}: unidad estática, no puede moverse.` : `${ut.name}: unidad estática, solo defiende su territorio.`;
    if (d.st === 'carga') return `${d.name} está en carga (ferrocarril): no puede moverse ni atacar este turno.`;
    if (d.st === 'recarga') return `${d.name} está en recarga${d.rl ? ` (${d.rl} turno${d.rl === 1 ? '' : 's'})` : ''}: no puede moverse ni atacar.`;
    if (d.st === 'marcha') return `${d.name} está en marcha: no puede moverse ni atacar este turno.`;
  }
  if (type === 'attack' && AIR_CLS.has(ut.cls) && target) {
    let r = true;
    try { r = AERO.range_ok(game, d, target); } catch (e) { r = true; }
    if (r === false) return `${d.name}: el objetivo está fuera de su radio de acción desde la base.`;
  }
  return null;
}

/** Cola de producción de `cid`: [{id, kind, pid, left, total}]. */
export function prod_queue(game, cid) { const q = game.ext && game.ext.prodq && game.ext.prodq[cid]; return Array.isArray(q) ? q : []; }

function _prov_name(pid) { try { const g = prov_geo().byId[pid]; return g ? g.n : pid; } catch (e) { return pid; } }

/** Provincia de producción por defecto de `ent`: su capital (o la primera provincia propia). */
export function default_pid(game, ent) {
  const pr = game.ext && game.ext.prov; if (!pr) return null;
  let first = null;
  for (const [pid, p] of Object.entries(pr)) {
    if (p.o !== ent) continue;
    if (p.cap) return pid;
    if (!first) first = pid;
  }
  return first;
}

/** Turnos de producción de `kind` en la provincia `pid` (los talleres los reducen). */
export function prod_turns(game, kind, pid) {
  const ut = ROSTER[kind]; if (!ut) return 1;
  const p = pid && game.ext && game.ext.prov && game.ext.prov[pid];
  return Math.max(1, ut.turns - Math.floor(((p && p.b && p.b.taller) || 0) / 2));
}

/** Motivo por el que `ent` no puede producir `kind` en la provincia `pid` (tecnología, edificios, recursos, capacidad), o null. */
export function recruit_check(game, ent, kind, pid) {
  const ut = ROSTER[kind];
  if (!ut) return 'Tipo de unidad desconocido.';
  const c = game.countries[ent];
  if (!c) return 'País no encontrado.';
  if (ut.tech && game.ext && game.ext.techs && game.ext.techs[ent] && !_done(game, ent).includes(ut.tech)) {
    const t = F.TECHS && F.TECHS.find((x) => x.id === ut.tech);
    return `Requiere la tecnología: ${t ? t.name : ut.tech}.`;
  }
  const pr = game.ext && game.ext.prov;
  if (pr) {
    const id = pid || default_pid(game, ent);
    const p = id && pr[id];
    if (!p) return 'No tienes una provincia donde producir.';
    if (p.o !== ent) return 'La provincia de producción no es tuya.';
    for (const [k, lv] of Object.entries(ut.req || {})) {
      const have = k === 'labc' ? prov_labc_level(game, ent) : ((p.b && p.b[k]) || 0);
      if (have < lv) {
        const B = BUILD[k];
        const nm = B ? (k === 'taller' && lv >= 4 ? 'Fábrica' : B.name) : k;
        return `Requiere ${nm} nivel ${lv}${k === 'labc' ? ' en tu país' : ' en la provincia'} (tienes ${have}).`;
      }
    }
  }
  if ((c.money || 0) < ut.cost) return `Fondos insuficientes (se necesitan ${ut.cost}).`;
  if (game.ext && game.ext.stock && game.ext.stock[ent]) {
    const st = stock_of(game, ent);
    for (const [res, qty] of Object.entries(ut.needs || {})) {
      if ((st[res] || 0) < qty) return `Recursos insuficientes: ${res} (se necesitan ${qty}, tienes ${Math.floor(st[res] || 0)}).`;
    }
  }
  const queuedT = prod_queue(game, ent).reduce((s, q) => s + ((ROSTER[q.kind] && ROSTER[q.kind].troops) || 0), 0);
  const ac = army_check(game, ent, 'unit_recruit', { troops: ut.troops + queuedT });
  if (ac) return ac;
  if (AIR_CLS.has(ut.cls)) {
    let r = null;
    try { r = AERO.recruit_check(game, ent, kind, pid || default_pid(game, ent)); } catch (e) { r = null; }
    if (r) return r;
  }
  return null;
}

/** Encola la producción de `kind` para `ent` (descuenta dinero y recursos). Devuelve {ok,msg}|{ok:false,error}. */
export function enqueue_unit(game, ent, kind, pid) {
  const ut = ROSTER[kind];
  if (!ut) return err('Tipo de unidad desconocido.');
  if (game.ext && game.ext.prov && pid && !game.ext.prov[pid]) return err('Provincia desconocida.');
  const where = pid || default_pid(game, ent) || null;
  const why = recruit_check(game, ent, kind, where);
  if (why) return err(why);
  const c = game.countries[ent];
  c.money = Math.round((c.money - ut.cost) * 100) / 100;
  if (game.ext && game.ext.stock && game.ext.stock[ent]) {
    const st = stock_of(game, ent);
    for (const [res, qty] of Object.entries(ut.needs || {})) st[res] = Math.max(0, (st[res] || 0) - qty);
  }
  const total = prod_turns(game, kind, where);
  const q = ensure(game.ext.prodq, ent, () => []);
  q.push({ id: next_id(game, 'q'), kind, pid: where, left: total, total });
  const loc = where ? _prov_name(where) : c.name;
  return ok(`${ut.name} en producción en ${loc}: ${total} turno${total === 1 ? '' : 's'}.`);
}

function _ordinal(n) {
  return ['', '1ª', '2ª', '3ª', '4ª', '5ª', '6ª', '7ª', '8ª', '9ª', '10ª', '11ª', '12ª', '13ª', '14ª', '15ª'][n] || n + 'ª';
}

/** Crea la división de una producción terminada; null si ya no hay donde situarla. */
function _spawn(game, cid, q) {
  const ut = ROSTER[q.kind];
  const pr = game.ext && game.ext.prov;
  let pid = q.pid;
  if (pr && (!pr[pid] || pr[pid].o !== cid)) pid = default_pid(game, cid);
  let location = cid;
  if (pr && pid) location = pr[pid].c;
  else if (pr) return null;
  const count = (game.divisions || []).filter((d) => d.owner === cid && d.kind === q.kind).length + 1;
  const div = {
    id: next_id(game, 'd'), name: `${_ordinal(count)} ${ut.name}`, owner: cid, location, kind: q.kind,
    troops: ut.troops, tanks: ut.tanks, planes: ut.planes, stance: 'idle', org: 80,
    full: { troops: ut.troops, tanks: ut.tanks, planes: ut.planes },
  };
  if (AIR_CLS.has(ut.cls)) div.base = pid || null;
  game.divisions.push(div);
  return div;
}

/** Poder de ataque de `ent` contra la provincia `pid` (suelo por clase, estados); null = usar el cálculo clásico. */
export function prov_strike_power(game, ent, pid) {
  if (!game.ext || !game.ext.prov) return null;
  let T = null;
  try { const gp = prov_geo().byId[pid]; T = gp && gp.t; } catch (e) { return null; }
  let sum = 0;
  for (const d of game.divisions || []) {
    if (d.owner !== ent) continue;
    const kind = kind_of(d); const ut = ROSTER[kind];
    if (!ut || ut.static || ut.single || ut.onlyStatic) continue;
    if (!can_act(game, d)) continue;
    const st = unit_stats(game, d);
    const base = (d.troops || 0) + (d.tanks || 0) * 0.03 + (d.planes || 0) * 0.04;
    sum += base * (st.atk / 4) * (T ? soil_mods(kind, T).atk : 1);
  }
  return Math.round(sum * 0.3 * 10) / 10;
}

/** Aviso de movimiento de una división (ferrocarril «en carga», unidades lentas «en marcha», avenidas). */
export function on_move(game, d, from, to) {
  if (!game.ext || !d) return;
  ensure_div(game, d);
  const ut = ROSTER[d.kind];
  if (!ut || d.st === 'recarga' || AIR_CLS.has(ut.cls)) return;
  const pr = game.ext.prov;
  const has = (cid, key) => !!pr && Object.values(pr).some((p) => p.c === cid && p.o === d.owner && (p.b[key] || 0) > 0);
  if (has(from, 'ferrocarril') && has(to, 'ferrocarril')) {
    d.st = 'carga'; d.stt = game.turn;
    d.org = Math.min(100, (d.org == null ? 80 : d.org) + 15);
    return;
  }
  const spd = unit_stats(game, d).spd;
  if (spd !== 1) return;
  const flat = TERRAIN_GROUP[_dominant_terrain(game, to)] === 'llano';
  if (has(to, 'avenida') || flat) return;
  d.st = 'marcha'; d.stt = game.turn;
}

// ------------------------------------------------------------------ interfaz estandar
export function init(game) {
  if (!game.ext) return;
  ensure(game.ext, 'forms', () => ({}));
  ensure(game.ext, 'unrest', () => ({}));
  ensure(game.ext, 'loot', () => []);
  // Inferir y persistir kinds de todas las divisiones existentes
  ensure(game.ext, 'prodq', () => ({}));
  for (const d of game.divisions || []) ensure_div(game, d);
}

/** Acciones del jugador. Devuelve null si la accion no es de este modulo. */
export function action(game, body) {
  if (!body || !body.action) return null;
  const me = game.player;
  const c = game.countries[me];
  if (!c) return err('País no encontrado.');

  if (body.action === 'unit_recruit') {
    ensure(game.ext, 'prodq', () => ({}));
    return enqueue_unit(game, me, body.kind, body.pid || null);
  }

  if (body.action === 'prod_cancel') {
    ensure(game.ext, 'prodq', () => ({}));
    const q = prod_queue(game, me);
    const i = q.findIndex((x) => x.id === body.id);
    if (i < 0) return err('Producción no encontrada.');
    const it = q.splice(i, 1)[0];
    const ut = ROSTER[it.kind];
    const back = Math.round(ut.cost * 0.5 * 100) / 100;
    c.money = Math.round((c.money + back) * 100) / 100;
    return ok(`Producción cancelada: ${ut.name}. Se reembolsa el 50 % (${back}).`);
  }

  if (body.action === 'form_create') {
    const divs = body.divs || body.div_ids || [];
    if (divs.length < 2) return err('Se necesitan al menos 2 divisiones para crear una formación.');
    // Validar que todas las divisiones existen, son del jugador y están en el mismo territorio
    const myDivs = (game.divisions || []).filter(d => d.owner === me && divs.includes(d.id));
    if (myDivs.length !== divs.length) return err('Una o más divisiones no existen o no te pertenecen.');
    const loc = myDivs[0].location;
    if (!myDivs.every(d => d.location === loc)) return err('Todas las divisiones deben estar en el mismo territorio.');
    // Verificar que no estén en otra formación
    const forms = game.ext.forms[me] || [];
    for (const f of forms) {
      if (f.divs.some(id => divs.includes(id))) return err('Una o más divisiones ya pertenecen a otra formación.');
    }
    // Crear formación
    const nextId = Math.max(0, ...forms.map(f => Number(f.id) || 0)) + 1;
    const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
    const name = body.name || (romans[nextId - 1] || String(nextId)) + ' Cuerpo de Ejército';
    forms.push({ id: String(nextId), name, divs });
    game.ext.forms[me] = forms;
    return ok(`Formación "${name}" creada con ${divs.length} divisiones.`);
  }

  if (body.action === 'form_dissolve') {
    const forms = game.ext.forms[me] || [];
    const idx = forms.findIndex(f => f.id === String(body.id || body.form_id));
    if (idx < 0) return err('Formación no encontrada.');
    const f = forms.splice(idx, 1)[0];
    return ok(`Formación "${f.name}" disuelta.`);
  }

  if (body.action === 'form_order') {
    const forms = game.ext.forms[me] || [];
    const form = forms.find(f => f.id === String(body.id || body.form_id));
    if (!form) return err('Formación no encontrada.');
    const type = body.type || body.otype;
    if (!['move', 'attack', 'defend', 'reorganize', 'front'].includes(type)) return err('Orden no válida para una formación.');
    const target = body.target || null;
    let okN = 0; const skipped = [];
    for (const did of form.divs) {
      const d = (game.divisions || []).find(x => x.id === did && x.owner === me);
      if (!d) continue;
      try { queue_order(game, me, type, target || d.location, did, null); okN++; }
      catch (e) { if (e instanceof OrderError) skipped.push(`${d.name}: ${e.message}`); else throw e; }
    }
    if (!okN) return err(skipped[0] || 'Ninguna división pudo recibir la orden.');
    return ok(`${okN} ${okN === 1 ? 'orden encolada' : 'órdenes encoladas'} para "${form.name}"` + (skipped.length ? `; ${skipped.length} omitida: ${skipped[0]}` : '.'));
  }

  return null;
}

/** Fase de turno (tras prov_turn). `lines` son lineas del informe del jugador. */
export function turn(game, rng, lines) {
  if (!game.ext) return;
  const me = game.player;

  ensure(game.ext, 'prodq', () => ({}));
  for (const d of game.divisions || []) {
    ensure_div(game, d);
    // estados temporales: «marcha» y «carga» duran el turno siguiente al movimiento; la recarga la lleva aero.js
    if ((d.st === 'marcha' || d.st === 'carga') && (d.stt == null || game.turn - d.stt >= 2)) { delete d.st; delete d.stt; }
    if (d.st === 'recarga' && d.rl == null) d.rl = (ROSTER[d.kind] && ROSTER[d.kind].reload) || 1;
  }

  // producciones: cuentan un turno y, al terminar, nace la division
  for (const cid of Object.keys(game.ext.prodq)) {
    const q = game.ext.prodq[cid];
    if (!Array.isArray(q) || !game.countries[cid]) { delete game.ext.prodq[cid]; continue; }
    const rest = [];
    for (const it of q) {
      it.left -= 1;
      if (it.left > 0) { rest.push(it); continue; }
      const ut = ROSTER[it.kind];
      let why = null;
      if (AIR_CLS.has(ut.cls)) { try { why = AERO.recruit_check(game, cid, it.kind, it.pid); } catch (e) { why = null; } }
      const div = why ? null : _spawn(game, cid, it);
      if (!div) {
        const c = game.countries[cid];
        c.money = Math.round((c.money + ut.cost) * 100) / 100;
        if (cid === me) { lines.push(`No se pudo completar ${ut.name}: ${why || 'sin provincia disponible'}. Se reembolsa el coste.`); news(game, `${ut.name} cancelada: ${why || 'sin provincia disponible'}.`, 'mil'); }
        continue;
      }
      if (cid === me) {
        lines.push(`Producción terminada: ${div.name}.`);
        news(game, `${div.name} termina su producción en ${game.countries[div.location].name}.`, 'mil');
      }
    }
    game.ext.prodq[cid] = rest;
  }
  sync_armies(game);

  // mantenimiento de unidades (ROSTER.upkeep; 0,4 extra por dron)
  for (const d of game.divisions || []) {
    const ut = ROSTER[d.kind]; const oc = game.countries[d.owner];
    if (!ut || !oc) continue;
    oc.money = Math.max(0, Math.round((oc.money - ut.upkeep - (ut.cls === 'drone' ? 0.4 : 0)) * 100) / 100);
  }

  // IA recluta tipos variados
  const alive = Object.keys(game.countries).filter(cid => game.countries[cid].owner === cid);
  for (const cid of alive) {
    if (cid === me) continue;
    if (game.countries[cid].money <= 250) continue;
    if (rng.random() > 0.25) continue;
    _ai_recruit(game, cid, rng);
  }

  // Limpiar formaciones: divisiones desaparecidas o separadas
  const forms = game.ext.forms[me] || [];
  const keep = [];
  for (const f of forms) {
    const divs = (game.divisions || []).filter(d => f.divs.includes(d.id) && d.owner === me);
    if (divs.length < 2) {
      if (f.divs.some(id => (game.divisions || []).some(d => d.id === id && d.owner === me))) {
        lines.push(`Formación "${f.name}" disuelta: menos de 2 divisiones.`);
      }
      continue;
    }
    const loc = divs[0].location;
    if (!divs.every(d => d.location === loc)) {
      lines.push(`Formación "${f.name}" disuelta: las divisiones se separaron.`);
      continue;
    }
    f.divs = divs.map(d => d.id);
    keep.push(f);
  }
  game.ext.forms[me] = keep;

  // Descontento en provincias ocupadas
  if (!game.ext.prov) return;
  const prov = game.ext.prov;
  const unrest = game.ext.unrest;
  const countries = game.countries;
  let stabLoss = 0;
  for (const [pid, p] of Object.entries(prov)) {
    if (p.o === p.c) {
      // Provincia recuperada: borrar descontento
      if (unrest[pid]) delete unrest[pid];
      continue;
    }
    const occupier = countries[p.c];
    if (!occupier || occupier.owner !== p.o) continue; // Ocupante debe ser dueño del país
    let u = unrest[pid] || 0;
    // Incremento base
    const originalAlive = countries[p.c] && countries[p.c].owner === p.c;
    u += originalAlive ? 3 : 1;
    u += F.tech_fx_sum(game, p.o, 'unrest'); // propaganda y servicios sociales (negativo)
    // Reducción por bases
    u -= 1.5 * (p.b.base || 0);
    // Reducción por guarnición (p.g / 10, tope 2)
    u -= 0.5 * Math.min(2, (p.g || 0) / 10);
    // Reducción si están en paz con el país original
    if (originalAlive && !at_war(game, p.o, p.c)) u -= 1;
    // Reducción si hay divisiones 'esp' del ocupante en el país
    const hasEsp = (game.divisions || []).some(d => d.owner === p.o && d.location === p.c && kind_of(d) === 'elite');
    if (hasEsp) u -= 2;
    unrest[pid] = Math.max(0, Math.min(100, Math.round(u * 10) / 10));

    // Efectos
    if (unrest[pid] >= 60 && p.o === me) stabLoss += 0.3;
    if (unrest[pid] >= 80 && rng.random() < 0.15) {
      // REVUELTA
      const origOwner = originalAlive ? p.c : p.o;
      p.o = origOwner;
      p.g = 0;
      p.b.base = Math.max(0, (p.b.base || 0) - 1);
      unrest[pid] = 30;
      const gp = prov_geo().byId[pid];
      news(game, `Revuelta en ${gp ? gp.n : pid}: vuelve a ${countries[origOwner].name}.`, 'unrest');
      if (p.o === me || p.c === me) lines.push(`¡Revuelta en ${gp ? gp.n : pid}!`);
    }
  }
  if (stabLoss > 0 && countries[me]) {
    const loss = Math.min(2, stabLoss);
    countries[me].stability = Math.max(0, Math.min(100, countries[me].stability - loss));
    if (loss >= 0.5) lines.push(`Descontento en provincias ocupadas: -${Math.round(loss * 10) / 10} estabilidad.`);
  }
}

/** Decisiones pendientes para el carrusel de noticias: [{text, kind, screen}]. */
export function pending(game) {
  const out = [];
  if (!game.ext) return out;
  const me = game.player;
  const unrest = game.ext.unrest;
  const prov = game.ext.prov;
  for (const q of prod_queue(game, me)) {
    if (q.left === 1 && ROSTER[q.kind]) out.push({ text: `Producción termina el próximo turno: ${ROSTER[q.kind].name}`, kind: 'mil', screen: 'army' });
  }
  if (prov && unrest) {
    const high = Object.entries(unrest).filter(([pid, u]) => {
      const p = prov[pid];
      return u >= 60 && p && p.o === me;
    }).sort((a, b) => b[1] - a[1]).slice(0, 3);
    for (const [pid, u] of high) {
      let gp = null;
      try { gp = prov_geo().byId[pid]; } catch (e) { /* opcional */ }
      out.push({ text: `Descontento alto en ${gp ? gp.n : pid} (${Math.round(u)})`, kind: 'unrest', screen: 'map' });
    }
  }
  // Formaciones sugeridas
  const divsByLoc = {};
  for (const d of (game.divisions || []).filter(d => d.owner === me)) {
    if (!divsByLoc[d.location]) divsByLoc[d.location] = [];
    divsByLoc[d.location].push(d);
  }
  const forms = game.ext.forms[me] || [];
  const inForm = new Set(forms.flatMap(f => f.divs));
  for (const [loc, divs] of Object.entries(divsByLoc)) {
    const free = divs.filter(d => !inForm.has(d.id));
    if (free.length >= 2) {
      out.push({ text: 'Tienes divisiones sin formación en el mismo territorio: puedes agruparlas', kind: 'info', screen: 'army' });
      break;
    }
  }
  // Escasez: sugerir conquistar provincias que produzcan el recurso que falta
  try {
    const sup = game.ext.supply && game.ext.supply[me];
    if (sup && sup.short && prov) {
      const G = prov_geo();
      const al = allies_of(game, me);
      const cand = new Set(prov_targets(game, me));
      for (const [pid, p] of Object.entries(prov)) {
        if (p.o !== me) continue;
        for (const q of G.adj[pid] || []) {
          const pq = prov[q];
          if (pq && pq.o !== me && game.countries[pq.o] && !al.includes(pq.o)) cand.add(q);
        }
      }
      let n = 0;
      for (const res of ['fuel', 'food', 'metal', 'goods']) {
        if (n >= 2) break;
        if (!((sup.short[res] || 0) > 0.05)) continue;
        for (const q of cand) {
          const pq = prov[q];
          if (RES_TO_STOCK[pq.r] !== res) continue;
          out.push({ text: `Escasez de ${RES_LABEL[res]}: ${G.byId[q].n} (${game.countries[pq.o].name}) produce ${P_RES[pq.r]} — conquistarla la aliviaría`, kind: 'supply', screen: 'map' });
          n++;
          break;
        }
      }
    }
  } catch (e) { /* opcional */ }
  return out.slice(0, 6);
}

// ------------------------------------------------------------------ ganchos
/** Tabla de modificadores de suelo por unidad (para la UI), coherente con roster.soil_mods.
 *  terr[codigo] = multiplicador de ataque; soil[grupo] = {atk, def, dmg, move}. */
export const MODS = {};
for (const k of Object.keys(ROSTER)) {
  const terr = {}; const soil = {};
  for (const t of ['S', 'M', 'D', 'P', 'V', 'B', 'E', 'T', 'A']) { const m = soil_mods(k, t); if (m.atk !== 1) terr[t] = m.atk; }
  for (const [g, t] of [['bosque', 'B'], ['montana', 'M'], ['llano', 'P']]) soil[g] = soil_mods(k, t);
  MODS[k] = { terr, soil, desc: ROSTER[k].desc };
}

/** Multiplicador de ataque de una division contra el territorio `target` (formula de combate; ver cabecera de ganchos). */
export function div_attack_mult(game, d, target) {
  if (!game.ext) return 1.0;
  ensure_div(game, d);
  const kind = d.kind;
  const ut = ROSTER[kind];
  if (!ut) return 1.0;
  let m = unit_stats(game, d).atk / 4;
  const T = _dominant_terrain(game, target);
  if (T) m *= soil_mods(kind, T).atk;
  const b = game.ext.battle;
  if (b) m *= matchup_vs(d, b.def);
  // marina: compensa la penalizacion maritima general
  if (ut.cls === 'nav' && is_sea_route(d.location, target)) m *= 1.33;
  if (_in_combined_arms_formation(game, d)) m *= 1.10;
  return m;
}

/** Multiplicador de defensa de una division en `target`. */
export function div_defense_mult(game, d, target) {
  if (!game.ext) return 1.0;
  ensure_div(game, d);
  const kind = d.kind;
  const ut = ROSTER[kind];
  if (!ut) return 1.0;
  let m = unit_stats(game, d).def / 5;
  const T = _dominant_terrain(game, target);
  if (T) m *= soil_mods(kind, T).def;
  const b = game.ext.battle;
  if (b) m /= Math.max(0.25, matchup_vs_many(b.att, d));
  if (_in_combined_arms_formation(game, d)) m *= 1.10;
  return m;
}

/** Emparejamiento medio de las divisiones `atts` (atacantes) contra la division d (su `vs` sobre el tipo de d). */
function matchup_vs_many(atts, d) {
  const dk = kind_of(d);
  const list = _arr(atts);
  if (!list.length) return 1;
  return _wavg(list, (a) => { const u = ROSTER[kind_of(a)]; return u ? lookup(u.vs, dk) : 1; });
}

/** IA: recluta un tipo variado en una provincia con base/capital/taller/aeropuerto. */
function _ai_recruit(game, cid, rng) {
  const pr = game.ext && game.ext.prov;
  const c = game.countries[cid];
  let cands = [];
  if (pr) {
    cands = Object.keys(pr).filter((pid) => { const p = pr[pid]; return p.o === cid && (p.cap || (p.b.base || 0) > 0); });
    if (!cands.length) { const d = default_pid(game, cid); if (d) cands = [d]; }
    if (!cands.length) return;
  } else cands = [null];
  const pid = cands[Math.floor(rng.random() * cands.length)];
  const p = pid && pr[pid];
  const early = game.turn < 15;
  const owned = {};
  for (const d of game.divisions || []) if (d.owner === cid) owned[d.kind] = (owned[d.kind] || 0) + 1;
  for (const q of prod_queue(game, cid)) owned[q.kind] = (owned[q.kind] || 0) + 1;
  const opts = [];
  for (const k of Object.keys(ROSTER)) {
    const ut = ROSTER[k];
    if (ut.cls === 'drone' || (c.money - ut.cost) < 120) continue;
    if (recruit_check(game, cid, k, pid)) continue;
    let w = 1 / (1 + (owned[k] || 0));
    if (ut.cls === 'inf') w *= early ? 3 : 1.2;
    if (p && ((p.b.taller || 0) >= 1) && ut.cls === 'arm') w *= 2.5;
    if (p && ((p.b.aeropuerto || 0) >= 1) && (ut.cls === 'air' || ut.cls === 'heli')) w *= 2.5;
    if (ut.cls === 'nav') w *= 1.5;
    if (ut.static) w *= 0.5;
    opts.push([k, w]);
  }
  if (!opts.length) return;
  let r = rng.random() * opts.reduce((a, x) => a + x[1], 0);
  let pick = opts[0][0];
  for (const [k, w] of opts) { r -= w; if (r <= 0) { pick = k; break; } }
  enqueue_unit(game, cid, pick, pid);
}

/** Conquista de un pais entero (military.capture): botin y descontento. */
export function on_capture(game, attacker, target, old_owner) {
  if (!game.ext) return;

  // Botín de recursos (30% del stock del viejo dueño)
  const loot = {};
  if (game.ext.stock && game.ext.stock[old_owner] && game.ext.stock[attacker]) {
    const oldStock = game.ext.stock[old_owner];
    const newStock = game.ext.stock[attacker];
    for (const res of ['food', 'fuel', 'goods', 'metal']) {
      const amt = Math.floor((oldStock[res] || 0) * 0.3);
      if (amt > 0) {
        oldStock[res] = Math.max(0, (oldStock[res] || 0) - amt);
        newStock[res] = (newStock[res] || 0) + amt;
        loot[res] = amt;
      }
    }
  }

  // Registrar botín (dinero ya lo hace military.capture)
  const cname = game.countries[target].name;
  const money = Math.round(game.countries[target].money * 0.25);
  const keys = Object.keys(loot).sort((x, y) => loot[y] - loot[x]);
  const parts = keys.map(k => `+${loot[k]} ${RES_LABEL[k]}`);
  _push_loot(game, {
    turn: game.turn, by: attacker, from: old_owner, pid: null, name: cname, money,
    res: keys[0] || null, amt: keys.length ? loot[keys[0]] : 0,
    text: `Conquista de ${cname}: +$${_m10(money)} M` + (parts.length ? ' y ' + parts.join(', ') : '')
  });

  news(game, `${game.countries[attacker].name} saquea ${cname}.`, 'war');
}

const RES_TO_STOCK = { petroleo: 'fuel', gas: 'fuel', minerales: 'metal', cobre: 'metal', agro: 'food', madera: 'goods' };
const BUILD_TO_STOCK = [['refineria', 'fuel'], ['mina', 'metal'], ['granja', 'food'], ['taller', 'goods']];
export const RES_LABEL = { food: 'alimentos', fuel: 'combustible', goods: 'bienes', metal: 'metal' };
const P_RES = { petroleo: 'petróleo', gas: 'gas', minerales: 'minerales', cobre: 'cobre', agro: 'cultivos', madera: 'madera' };
const _m10 = (m) => Math.round(m * 10);

/** Calculo comun (sin efectos) del botin de la provincia `pid` cuyo dueno actual/anterior es `owner`. */
function _loot_calc(game, pid, owner) {
  const p = game.ext && game.ext.prov && game.ext.prov[pid];
  if (!p) return null;
  const b = p.b || {};
  const econ = (b.taller || 0) + (b.refineria || 0) + (b.mina || 0) + (b.granja || 0);
  const fixed = 15 + 8 * econ + 4 * ((b.avenida || 0) + (b.ferrocarril || 0)) + (p.cap ? 20 : 0);
  const ownerMoney = Math.max(0, (game.countries[owner] && game.countries[owner].money) || 0);
  const fromOwner = ownerMoney * 0.06;
  const yld = prov_yield(game, pid);
  const ostock = (game.ext.stock && game.ext.stock[owner]) || {};
  let res = RES_TO_STOCK[p.r] || null, amt = 0;
  if (res) {
    amt = Math.max(6, 0.25 * (ostock[res] || 0)) + 3 * (yld[res] || 0);
  } else {
    let best = 0;
    for (const [bk, rs] of BUILD_TO_STOCK) if ((b[bk] || 0) > best) { best = b[bk]; res = rs; }
    if (res) amt = 3 * (yld[res] || 0);
  }
  amt = res ? Math.floor(amt) : 0;
  if (amt <= 0) res = null;
  return { money: r1(fixed + fromOwner), fixed, fromOwner, res, amt, yield: yld };
}

/** Vista previa de la recompensa de conquistar `pid` (misma formula; no modifica el estado). */
export function conquest_preview(game, pid, attacker) {
  void attacker;
  const empty = { money: 0, res: null, amt: 0, yield: { money: 0, food: 0, fuel: 0, goods: 0, metal: 0 } };
  const p = game.ext && game.ext.prov && game.ext.prov[pid];
  if (!p) return empty;
  const c = _loot_calc(game, pid, p.o);
  return c ? { money: c.money, res: c.res, amt: c.amt, yield: c.yield } : empty;
}

function _push_loot(game, entry) {
  if (!Array.isArray(game.ext.loot)) game.ext.loot = [];
  game.ext.loot.push(entry);
  if (game.ext.loot.length > 40) game.ext.loot.splice(0, game.ext.loot.length - 40);
}

/** Conquista de una provincia (provinces.prov_attack): botin y descontento. */
export function on_prov_capture(game, attacker, pid, old_owner) {
  if (!game.ext || !game.ext.prov) return;
  const p = game.ext.prov[pid];
  const att = game.countries[attacker], old = game.countries[old_owner];
  if (!p || !att || !old) return;
  const c = _loot_calc(game, pid, old_owner);
  if (!c) return;

  // Dinero: la parte fija la genera la provincia; el 6 % sale del tesoro del dueno (nunca negativo)
  const taken = Math.min(Math.max(0, old.money || 0), c.fromOwner);
  old.money = r2(Math.max(0, (old.money || 0) - taken));
  const money = r1(c.fixed + taken);
  att.money = r2((att.money || 0) + money);

  // Recurso: requisa; el dueno anterior pierde solo lo que tenia
  let res = c.res, amt = c.amt;
  if (res && game.ext.stock) {
    const ost = stock_of(game, old_owner), ast = stock_of(game, attacker);
    ost[res] = Math.max(0, (ost[res] || 0) - amt);
    ast[res] = (ast[res] || 0) + amt;
  } else { res = null; amt = 0; }

  p.fx = Object.assign(p.fx || { k: 'win', t: game.turn }, { loot: { money, res, amt } });

  let gp = null;
  try { gp = prov_geo().byId[pid]; } catch (e) { /* opcional */ }
  const name = gp ? gp.n : pid;
  const gain = `+$${_m10(money)} M` + (res ? ` y +${amt} ${RES_LABEL[res]}` : '');
  _push_loot(game, { turn: game.turn, by: attacker, from: old_owner, pid, name, money, res, amt, text: `${name}: ${gain}` });
  if (old_owner === game.player) {
    news(game, `${att.name} requisa ${name}: −$${_m10(money)} M` + (res ? ` y −${amt} ${RES_LABEL[res]}` : ''), 'war');
  } else {
    news(game, `${att.name} conquista ${name}: ${gain}`, 'war');
  }

  // Inicializar descontento
  let unrest = 35;
  if (p.cap) unrest += 15;
  const hasEsp = (game.divisions || []).some(d => d.owner === attacker && d.location === p.c && kind_of(d) === 'elite');
  if (hasEsp) unrest -= 10;
  if (!game.ext.unrest) game.ext.unrest = {};
  game.ext.unrest[pid] = Math.max(0, Math.min(100, unrest));
}

// ------------------------------------------------------------------ ayudantes internos
const _terrCache = new WeakMap();
/** Codigo de terreno dominante del pais `cid` (cache por partida; los terrenos no cambian). */
function _dominant_terrain(game, cid) {
  const pr = game.ext && game.ext.prov;
  if (!pr) return 'P';
  let cache = _terrCache.get(pr);
  if (!cache) { cache = {}; _terrCache.set(pr, cache); }
  if (cache[cid]) return cache[cid];
  let geo = null;
  try { geo = prov_geo(); } catch (e) { return 'P'; }
  const count = {};
  for (const pid of Object.keys(pr)) {
    if (pr[pid].c !== cid) continue;
    const gp = geo.byId[pid];
    if (gp && gp.t) count[gp.t] = (count[gp.t] || 0) + 1;
  }
  let max = 0, dom = 'P';
  for (const [t, n] of Object.entries(count)) if (n > max) { max = n; dom = t; }
  cache[cid] = dom;
  return dom;
}

function _in_combined_arms_formation(game, d) {
  if (!game.ext || !game.ext.forms) return false;
  const forms = game.ext.forms[d.owner] || [];
  const form = forms.find(f => f.divs.includes(d.id));
  if (!form || form.divs.length < 2) return false;

  const kinds = new Set();
  for (const divId of form.divs) {
    const div = (game.divisions || []).find(dd => dd.id === divId);
    if (div && div.location === d.location) kinds.add(div.kind || kind_of(div));
  }
  return kinds.size >= 2;
}

/** Multiplicador de rendimiento por descontento (para supply/provinces). */
export function unrest_yield_mult(game, pid) {
  if (!game.ext || !game.ext.unrest) return 1.0;
  const u = game.ext.unrest[pid] || 0;
  return 1 - u / 200;
}
