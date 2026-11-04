// Diplomacia ampliada (Tanda 2, trabajador C): ataque por sorpresa, provocaciones (empeorar relaciones
// a propósito) y límite/capacidad del ejército. Estado en game.ext.dip. Puro: sin DOM.
// Interfaz estándar de módulo (features.EXT_MODULES): init, action, turn, pending.
//
// ESTADO (inicialización perezosa; partidas antiguas no deben romperse):
//   game.ext.dip = { surprise_turn: int|null, provoked: { 'target': turn }, log: [{turn, kind, target, text}] }
//   game.ext.surprise = { by, target, mult, turn } | undefined   (bandera temporal leída por military._amult)
//
// ACCIONES (ext_action -> action(game, body)): devuelve {ok,msg}|{ok:false,error} o null si no es suya.
//   { action:'surprise_attack', target: cid, divs?: [divisionId] }   ataque inmediato sin declaración previa
//   { action:'provoke', target: cid, kind: 'incidente'|'embajador'|'propaganda' }  empeora relaciones
//
// API para otros módulos/UI:
//   army_cap(game, cid) -> capacidad máxima de tropas (k); army_used(game, cid) -> tropas actuales (k)
//   army_check(game, ent, otype, params) -> string|null  (motivo de rechazo de una orden de reclutamiento)
//   army_room(game, cid) -> tropas (k) que aun caben (capacidad - usadas - reclutas en cola)
//   surprise_preview(game, target) -> { cost, mult, stab, rel_*, divs, attack_est, defense_est, countries_affected, reason }
import { ensure, ok, err, news, aliveIds, nameOf, clampN } from './extutil.js';
import * as S from './state.js';
import * as C from './constants.js';
import * as D from './diplomacy.js';
import * as M from './military.js';

/** Catalogo de provocaciones: coste, efecto en relacion con el objetivo, estabilidad propia/ajena. */
export const PROVOKE = {
  incidente: { name: 'Incidente fronterizo', cost: 15, rel: -12, stab: -1, ally_rel: 0, target_stab: 0, desc: 'Escaramuzas y detenciones en la frontera.' },
  embajador: { name: 'Expulsar embajador', cost: 25, rel: -25, stab: -2, ally_rel: -5, target_stab: 0, desc: 'Ruptura formal de relaciones. También enfría a sus aliados y cancela pactos de no agresión.' },
  propaganda: { name: 'Campaña hostil', cost: 20, rel: -18, stab: 0, ally_rel: 0, target_stab: -2, desc: 'Radio y prensa contra el gobierno vecino; desgasta su estabilidad.' },
};

/** Parametros del ataque sorpresa. */
export const SURPRISE = { cost: 30, mult: 1.3, stab: -6, rel_all: -25, rel_allies: -40, rel_target: -20 };

// Limite del ejercito (miles de tropas)
const CAP_BASE = 80, CAP_POP = 10, CAP_BASE_LVL = 15, CAP_FORT = 10;
const CAP_REC = { vol: 1.0, lim: 1.2, obl: 1.5 };
const CAP_TECH_BONUS = 0.15;
const NO_CAP = 1e9;
const LOG_MAX = 40;

const _dip = (game) => (game.ext ? ensure(game.ext, 'dip', () => ({ surprise_turn: null, provoked: {}, log: [] })) : null);
const _norm = (d) => {
  if (!d.provoked) d.provoked = {};
  if (!Array.isArray(d.log)) d.log = [];
  if (d.surprise_turn === undefined) d.surprise_turn = null;
  return d;
};
function dipOf(game) {
  const d = _dip(game);
  return d ? _norm(d) : null;
}
function dlog(game, kind, target, text) {
  const d = dipOf(game);
  if (!d) return;
  d.log.push({ turn: game.turn, kind, target, text });
  if (d.log.length > LOG_MAX) d.log.splice(0, d.log.length - LOG_MAX);
}

export function init(game) {
  if (!game.ext) return;
  dipOf(game);
}

// ------------------------------------------------------------------ utilidades
function blocsOf(game, cid) {
  const b = (game.ext && game.ext.blocs) || {};
  return Object.keys(b).filter((k) => (b[k] || []).includes(cid));
}

/** Entidad dueña del territorio/pais `t` (acepta id de entidad o de territorio). */
function ownerOfT(game, t) {
  const c = game.countries[t];
  return c ? c.owner : null;
}

/** Divisiones propias validas para atacar `target` por sorpresa. */
function valid_divs(game, me, target, only) {
  const busy = new Set((game.orders || []).filter((o) => o.owner === me && o.division_id).map((o) => o.division_id));
  return S.divisions_of(game, me).filter((d) =>
    (!only || only.includes(d.id)) && !busy.has(d.id) && d.org >= C.ORG_MIN_ATTACK
    && S.raw_power(d.troops, d.tanks, d.planes) >= 0.5 && S.is_adjacent(d.location, target));
}

/** Motivo por el que no se puede atacar por sorpresa a `target`, o null. */
function surprise_reason(game, me, target) {
  const o = ownerOfT(game, target);
  if (!game.countries[target] || o === null) return 'Territorio desconocido.';
  if (o === me) return 'No puedes atacar tu propio territorio.';
  if (!S.is_alive(game, o)) return 'Ese país ya no existe.';
  if (S.has_treaty(game, 'alliance', me, o)) return 'Es tu aliado: rompe la alianza primero.';
  if (S.at_war(game, me, o)) return 'Ya estás en guerra: usa un ataque normal.';
  const d = _dip(game);
  if (d && d.surprise_turn === game.turn) return 'Ya lanzaste un ataque sorpresa este turno.';
  return null;
}

/** Quienes sufren que penalizacion: aliados del objetivo y miembros de sus bloques. */
function affected(game, me, o) {
  const close = new Set(S.allies_of(game, o));
  for (const b of blocsOf(game, o)) for (const m of game.ext.blocs[b]) close.add(m);
  close.delete(me); close.delete(o);
  const others = aliveIds(game).filter((c) => c !== me && c !== o);
  return { close: others.filter((c) => close.has(c)), rest: others.filter((c) => !close.has(c)) };
}

// ------------------------------------------------------------------ vista previa del ataque sorpresa
export function surprise_preview(game, target) {
  const out = { cost: SURPRISE.cost, mult: SURPRISE.mult, stab: SURPRISE.stab, rel_all: SURPRISE.rel_all,
    rel_allies: SURPRISE.rel_allies, rel_target: SURPRISE.rel_target, divs: [], attack_est: 0, defense_est: 0,
    countries_affected: 0, allies_affected: 0, reason: null };
  const me = game.player;
  if (!game.ext) { out.reason = 'Disponible en modo sin conexión (local).'; return out; }
  const why = surprise_reason(game, me, target);
  const o = ownerOfT(game, target);
  if (o && !why) {
    const a = affected(game, me, o);
    out.countries_affected = a.close.length + a.rest.length;
    out.allies_affected = a.close.length;
  }
  const divs = game.countries[target] ? valid_divs(game, me, target) : [];
  out.divs = divs.map((d) => d.id);
  if (!divs.length && !why) out.reason = 'Ninguna división propia adyacente con organización suficiente.';
  else out.reason = why;
  if (divs.length && game.countries[target]) {
    const rng = { random: () => 0.5 };
    const prev = game.ext.surprise;
    game.ext.surprise = { by: me, target, mult: SURPRISE.mult, turn: game.turn };
    try {
      out.attack_est = Math.round(M.attack_strength(game, divs, target, rng));
      let defs = M.defenders_at(game, target, me);
      // En la vista del cliente las divisiones ajenas estan ocultas por la niebla de guerra: se estiman
      // con las cifras (difusas) del territorio.
      const tc = game.countries[target];
      if (!defs.length && tc && (tc.army > 0 || tc.tanks > 0 || tc.planes > 0)) {
        defs = [{ owner: tc.owner, troops: tc.army || 0, tanks: tc.tanks || 0, planes: tc.planes || 0, org: 100, stance: 'idle', location: target }];
        out.fogged = true;
      }
      out.defense_est = Math.round(M.defense_strength(game, defs, target, rng));
    } finally {
      if (prev === undefined) delete game.ext.surprise; else game.ext.surprise = prev;
    }
  }
  return out;
}

// ------------------------------------------------------------------ acciones
function surprise_attack(game, body) {
  const me = game.player;
  const pc = game.countries[me];
  const target = body.target;
  const why = surprise_reason(game, me, target);
  if (why) return err(why);
  const o = ownerOfT(game, target);
  if (pc.money < SURPRISE.cost) return err('Fondos insuficientes para el ataque sorpresa.');
  const only = Array.isArray(body.divs) && body.divs.length ? body.divs : null;
  const divs = valid_divs(game, me, target, only);
  if (!divs.length) return err('Necesitas divisiones propias adyacentes con organización suficiente.');

  const dip = dipOf(game);
  const a = affected(game, me, o);
  const sharedBlocs = blocsOf(game, me).filter((b) => blocsOf(game, o).includes(b));
  const msgs = [];
  pc.money -= SURPRISE.cost;
  dip.surprise_turn = game.turn;

  const rng = S.make_rng(game, 'surprise' + game.turn);
  game.ext.surprise = { by: me, target, mult: SURPRISE.mult, turn: game.turn };
  let battle;
  try {
    D.declare_war(game, me, o, rng, ' en un ataque sorpresa');
    battle = M.resolve_assault(game, me, target, divs, rng);
  } finally {
    delete game.ext.surprise;
  }
  M.purge_dead(game);
  S.sync_armies(game);

  // Penalizaciones de reputacion (ganes o pierdas)
  pc.stability = clampN(pc.stability + SURPRISE.stab, 0, 100);
  for (const c of a.rest) S.add_rel(game, me, c, SURPRISE.rel_all);
  for (const c of a.close) S.add_rel(game, me, c, SURPRISE.rel_allies);
  S.add_rel(game, me, o, SURPRISE.rel_target);
  if (game.ext.pacts) game.ext.pacts = game.ext.pacts.filter((p) => !((p.a === me && p.b === o) || (p.a === o && p.b === me)));
  for (const b of sharedBlocs) {
    game.ext.blocs[b] = game.ext.blocs[b].filter((m) => m !== me);
    news(game, `${nameOf(game, me)} es expulsado del bloque tras atacar a un miembro.`, 'dip');
    msgs.push('expulsado de un bloque');
  }
  const res = battle.won ? (battle.captured ? 'victoria, territorio capturado' : 'victoria') : 'rechazado';
  const txt = `Ataque sorpresa sobre ${nameOf(game, target)}: ${res} (ataque ${battle.attack} vs defensa ${battle.defense}).`;
  dlog(game, 'surprise', o, txt);
  dip.last_battle = { ...battle, turn: game.turn, mult: SURPRISE.mult, affected: a.close.length + a.rest.length };
  news(game, `${nameOf(game, me)} lanza un ataque sorpresa contra ${nameOf(game, o)}: ${res}. Los demás países desconfían.`, 'war');
  return ok(`${txt} Estabilidad ${SURPRISE.stab - C.WAR_STAB}, relación ${SURPRISE.rel_all} con ${a.rest.length} países`
    + ` y ${SURPRISE.rel_allies} con ${a.close.length} cercanos al objetivo.${msgs.length ? ' Fuiste ' + msgs.join(', ') + '.' : ''}`);
}

function provoke(game, body) {
  const me = game.player;
  const pc = game.countries[me];
  const spec = PROVOKE[body.kind];
  if (!spec) return err('Tipo de provocación desconocido.');
  const o = ownerOfT(game, body.target);
  if (o === null || o === me) return err('País objetivo no válido.');
  if (!S.is_alive(game, o)) return err('Ese país ya no existe.');
  if (S.has_treaty(game, 'alliance', me, o)) return err('Rompe la alianza primero.');
  const dip = dipOf(game);
  if (dip.provoked[o] === game.turn) return err('Ya presionaste a ese país este turno.');
  if (pc.money < spec.cost) return err('Fondos insuficientes.');
  pc.money -= spec.cost;
  dip.provoked[o] = game.turn;
  const before = S.get_rel(game, me, o);
  S.add_rel(game, me, o, spec.rel);
  pc.stability = clampN(pc.stability + spec.stab, 0, 100);
  if (spec.target_stab) game.countries[o].stability = clampN(game.countries[o].stability + spec.target_stab, 0, 100);
  let extra = '';
  if (spec.ally_rel) for (const al of S.allies_of(game, o)) if (al !== me) S.add_rel(game, me, al, spec.ally_rel);
  if (body.kind === 'embajador') {
    const had = S.remove_treaties(game, me, o, ['nap']);
    const pacts = game.ext.pacts || [];
    const keep = pacts.filter((p) => !(p.type === 'pna' && ((p.a === me && p.b === o) || (p.a === o && p.b === me))));
    if (had || keep.length !== pacts.length) {
      game.ext.pacts = keep;
      S.add_rel(game, me, o, -6);
      extra = ' El pacto de no agresión quedó cancelado (−6).';
    }
  }
  const after = S.get_rel(game, me, o);
  const txt = `${spec.name} contra ${nameOf(game, o)}: relación ${before} → ${after}.${extra}`;
  dlog(game, 'provoke', o, txt);
  news(game, `${nameOf(game, me)} presiona a ${nameOf(game, o)} (${spec.name.toLowerCase()}).`, 'dip');
  return ok(txt);
}

/** Acciones del jugador. Devuelve null si la accion no es de este modulo. */
export function action(game, body) {
  if (!body || !body.action) return null;
  if (body.action !== 'surprise_attack' && body.action !== 'provoke') return null;
  if (!game.ext) return err('Disponible solo en modo sin conexión (local).');
  if (body.action === 'surprise_attack') return surprise_attack(game, body);
  return provoke(game, body);
}

/** Fase de turno (tras UNITS y SUPPLY). */
export function turn(game, rng, lines) {
  void rng; void lines;
  const d = game.ext && game.ext.dip;
  if (!d) return;
  _norm(d);
  // limpia marcas viejas
  for (const k of Object.keys(d.provoked)) if (d.provoked[k] < game.turn - 3) delete d.provoked[k];
  delete game.ext.surprise;
}

/** Decisiones pendientes para el carrusel: [{text, kind, screen}]. */
export function pending(game) {
  if (!game.ext) return [];
  const cap = army_cap(game, game.player);
  const used = army_used(game, game.player);
  if (cap > 0 && used / cap >= 0.9) {
    return [{ text: `Ejército al ${Math.min(99, Math.floor(100 * used / cap))}% de su capacidad`, kind: 'mil', screen: 'army' }];
  }
  return [];
}

// ------------------------------------------------------------------ limite del ejercito
/** Capacidad maxima de tropas (miles). Sin game.ext: valor enorme (sin limite). */
export function army_cap(game, cid) {
  if (!game.ext) return NO_CAP;
  let pop = 0;
  for (const c of Object.values(game.countries)) if (c.owner === cid) pop += c.population || 0;
  let bases = 0, forts = 0;
  const prov = game.ext.prov || {};
  for (const p of Object.values(prov)) {
    if (p.o !== cid || !p.b) continue;
    bases += p.b.base || 0;
    forts += p.b.fuerte || 0;
  }
  const pol = game.ext.policy && game.ext.policy[cid];
  const rec = (pol && pol.laws && CAP_REC[pol.laws.rec]) || 1.0;
  const tech = game.ext.techs && game.ext.techs[cid];
  const bonus = tech && (tech.done || []).includes('inf3') ? 1 + CAP_TECH_BONUS : 1;
  return Math.round((CAP_BASE + pop * CAP_POP + CAP_BASE_LVL * bases + CAP_FORT * forts) * rec * bonus);
}

/** Tropas actuales (k) de la entidad. */
export function army_used(game, cid) {
  return (game.divisions || []).filter((d) => d.owner === cid).reduce((s, d) => s + (d.troops || 0), 0);
}

function queued_recruits(game, cid) {
  return (game.orders || []).filter((o) => o.owner === cid && o.type === 'recruit').length * C.RECRUIT_TROOPS;
}

/** Tropas (k) que todavia caben: capacidad - usadas - reclutas en cola. */
export function army_room(game, cid) {
  return army_cap(game, cid) - army_used(game, cid) - queued_recruits(game, cid);
}

/** Motivo (string) por el que una orden de reclutamiento no cabe en la capacidad, o null si cabe. */
export function army_check(game, ent, otype, params) {
  if (!game.ext) return null;
  let add;
  if (otype === 'recruit') add = C.RECRUIT_TROOPS;
  else if (otype === 'unit_recruit') add = Number(params && params.troops) || 0;
  else return null;
  const cap = army_cap(game, ent);
  const used = army_used(game, ent) + queued_recruits(game, ent);
  if (used + add > cap) {
    return `Capacidad del ejército agotada (${Math.round(used)}/${cap} k). Construye bases militares o cambia la ley de reclutamiento.`;
  }
  return null;
}
