// Mecánicas de ejército (Tanda 4): tipos de escuadra, tierra quemada, mantenimiento, convoyes de suministro,
// experiencia y niveles, reequipamiento, tropas en países neutrales, patrulla y puntos de movimiento navales.
// Puro: sin DOM. Interfaz estándar de módulo (features.EXT_MODULES): init, action, turn, pending.
//
// ESTADO (en las divisiones, todo opcional):
//   d.xp, d.lv          experiencia y nivel (0..5)
//   d.scorched          true = orden «Tierra quemada» (bombarderos)
//   d.unsup             turnos seguidos fuera de territorio propio/aliado sin convoy
//   d.patrol            { pids:[pid...] } | true  (aire y submarinos)
//   d.home              país de origen al enviarse a un neutral; d.foreign = país neutral donde está
//   d.mp_used           movimientos navales gastados este turno
//
// ACCIONES (ext_action):
//   form_join {id, div}                 añade una división (misma ubicación) a una formación
//   form_split {id, divs, name?}        saca divisiones de la formación (si quedan >=2 forman una nueva)
//   form_rename {id, name}
//   scorched_earth {div, on?}           bombarderos: +25 % daño, -40 % defensa, -20 % vida
//   retrofit {div | divs}               reequipa con las mejoras ya investigadas (coste pequeño)
//   train {div}                         entrena en el laboratorio nacional (experiencia)
//   send_neutral {div, target}          envía tropas a un país no beligerante (tensión)
//   recall {div}                        las devuelve a casa
//   patrol {div, pids?, on?}            patrulla (aire/submarino): ataca al contacto
//
// API: group_type(units), mods_of(game,d), upkeep_of(game,dOrGroup), form_type(game,form), retrofit_cost(game,d),
//      level_of(d), gain_xp(game,d,n), tension_of(kind), squad_of(game,d)
import { ensure, ok, err, news, r1, r2, clampN } from './extutil.js';
import * as S from './state.js';
import * as D from './diplomacy.js';
import { queue_order, OrderError } from './orders.js';
import { ROSTER } from './roster.js';
import { stock_of } from './supply.js';
import { prov_geo, prov_labc_level } from './provinces.js';
import * as AERO from './aero.js';

const kindOf = (d) => (d && ROSTER[d.kind] ? d.kind : 'inf');
const clsOf = (d) => (ROSTER[kindOf(d)] || {}).cls;
const MECH = new Set(['mec', 'apc', 'tl', 'tm', 'tp', 'at']);
const OFFENSIVE = new Set(['elite', 'heli', 'tl', 'tm', 'tp']);
const BOMBERS = new Set(['bomb', 'bpes', 'bestr']);
const XP_STEPS = [0, 10, 30, 60, 100, 160];
export const MAX_LEVEL = 5;
export const SCORCHED = { atk: 1.25, def: 0.6, hp: 0.8 };
const LEVEL_NAMES = ['Recluta', 'Regular', 'Veterano', 'Curtido', 'Élite', 'Legendario'];

/** Tipo de escuadra por composición. units: divisiones (con .kind). Devuelve {id,name,mods:{atk,def,hp,spd,dmg}}. */
export function group_type(units) {
  const list = (units || []).filter(Boolean);
  const mk = (id, name, m) => ({ id, name, mods: { atk: 1, def: 1, hp: 1, spd: 1, dmg: 1, ...(m || {}) } });
  if (list.length <= 1) return mk('individual', 'Individual');
  const kinds = list.map(kindOf);
  const n = list.length;
  const nav = kinds.every((k) => ROSTER[k].cls === 'nav');
  const drones = kinds.filter((k) => ROSTER[k].cls === 'drone').length;
  if (drones > 10) return mk('enjambre', 'Enjambre de drones', { dmg: 1.05 });
  if (nav) {
    if (kinds.includes('sub') && kinds.includes('porta')) return mk('escolta', 'Flota de escolta', { atk: 0.8, hp: 1.1, def: 1.07 });
    if (new Set(kinds).size >= 2) return mk('flota', 'Flota mixta');
  }
  if (kinds.every((k) => OFFENSIVE.has(k))) return mk('ofensivo', 'Ofensivo', { def: 0.8, atk: 1.15 });
  if (kinds.filter((k) => MECH.has(k)).length / n > 0.75) return mk('mecanizado', 'Mecanizado', { spd: 0.95, def: 1.02, hp: 1.02 });
  if (new Set(kinds).size > 1) return mk('mixto', 'Mixto');
  return mk('mixto', 'Escuadra uniforme');
}

export function squad_of(game, d) {
  const forms = game && game.ext && game.ext.forms && game.ext.forms[d.owner];
  if (!Array.isArray(forms)) return null;
  return forms.find((f) => f.divs.includes(d.id)) || null;
}

export function form_type(game, form) {
  const ds = (form.divs || []).map((id) => (game.divisions || []).find((x) => x.id === id)).filter(Boolean);
  return group_type(ds);
}

export function level_of(d) {
  const xp = (d && d.xp) || 0;
  let lv = 0;
  for (let i = 1; i < XP_STEPS.length; i++) if (xp >= XP_STEPS[i]) lv = i;
  return lv;
}

export function gain_xp(game, d, n) {
  if (!d || !(n > 0)) return;
  const before = level_of(d);
  d.xp = r1((d.xp || 0) + n);
  d.lv = level_of(d);
  if (d.lv > before && d.owner === game.player) news(game, `${d.name} asciende a ${LEVEL_NAMES[d.lv]} (nivel ${d.lv}).`, 'info');
}

/** Multiplicadores {atk,def,hp,spd} de la división: convoy, tierra quemada, nivel y tipo de escuadra. */
export function mods_of(game, d) {
  const m = { atk: 1, def: 1, hp: 1, spd: 1 };
  if (!d) return m;
  const k = kindOf(d);
  if (k === 'convoy') return { atk: 0, def: 0, hp: 1, spd: 1 };
  const lv = d.lv != null ? d.lv : level_of(d);
  m.atk *= 1 + 0.04 * lv; m.def *= 1 + 0.04 * lv; m.hp *= 1 + 0.03 * lv;
  if (d.scorched && BOMBERS.has(k)) { m.atk *= SCORCHED.atk; m.def *= SCORCHED.def; m.hp *= SCORCHED.hp; }
  const sq = squad_of(game, d);
  if (sq) {
    const t = form_type(game, sq).mods;
    m.atk *= t.atk * t.dmg; m.def *= t.def; m.hp *= t.hp; m.spd *= t.spd;
  }
  return m;
}

/** Mantenimiento (dinero/turno) de una división o de un grupo (array o formación {divs}). */
export function upkeep_of(game, dOrGroup) {
  if (Array.isArray(dOrGroup)) return r2(dOrGroup.reduce((s, d) => s + upkeep_of(game, d), 0));
  if (dOrGroup && Array.isArray(dOrGroup.divs) && !dOrGroup.kind) {
    const ds = dOrGroup.divs.map((id) => (game.divisions || []).find((x) => x.id === id)).filter(Boolean);
    return upkeep_of(game, ds);
  }
  const d = dOrGroup;
  const ut = d && ROSTER[kindOf(d)];
  if (!ut) return 0;
  let up = ut.upkeep + (ut.cls === 'drone' ? 0.4 : 0);
  up *= 1 + 0.06 * (d.lv || 0);
  if (d.scorched) up *= 1.15;
  return r2(up);
}

/** Tensión diplomática por turno (0..) que provoca una unidad en territorio ajeno neutral. */
export function tension_of(kind) {
  const ut = ROSTER[kind]; if (!ut) return 1;
  if (kind === 'explo') return 0.5;
  if (kind === 'convoy') return 1;
  const w = { inf: 3, mec: 5, apc: 5, at: 5, elite: 6, art: 7, tl: 8, tm: 10, tp: 12, cfort: 8 }[kind];
  if (w) return w;
  return ut.cls === 'nav' ? 6 : ut.cls === 'heli' ? 7 : ut.cls === 'air' ? 9 : 4;
}

export function retrofit_cost(game, d) {
  const ut = ROSTER[kindOf(d)]; if (!ut) return 0;
  const done = ((game.ext.techs && game.ext.techs[d.owner] && game.ext.techs[d.owner].done) || []);
  const upAll = (ut.up || []).filter((t) => done.includes(t)).length;
  const cur = d.up0 != null ? Math.min(d.up0, upAll) : upAll;
  return { cost: r2(ut.cost * 0.12 * (upAll - cur)), from: cur, to: upAll };
}

const divOf = (game, id, owner) => (game.divisions || []).find((x) => x.id === id && (!owner || x.owner === owner));
const MAX_MP = (d) => (ROSTER[kindOf(d)] || {}).spd || 1;

/** Motivo para rechazar una orden de movimiento naval por falta de puntos de movimiento (o null). */
export function order_check(game, d, type) {
  if (clsOf(d) !== 'nav' || (type !== 'move' && type !== 'attack')) return null;
  if ((d.mp_used || 0) >= MAX_MP(d)) return `${d.name}: sin puntos de movimiento este turno (${MAX_MP(d)}/${MAX_MP(d)}).`;
  return null;
}
export function on_move(game, d) {
  if (clsOf(d) === 'nav') d.mp_used = (d.mp_used || 0) + 1;
}

export function init(game) {
  if (!game.ext) return;
  ensure(game.ext, 'forms', () => ({}));
}

function _forms(game, me) { return ensure(game.ext.forms, me, () => []); }
function _nextFormId(forms) { return String(Math.max(0, ...forms.map((f) => Number(f.id) || 0)) + 1); }

export function action(game, body) {
  if (!body || !body.action || !game.ext) return null;
  const me = game.player;
  const a = body.action;
  if (!['form_join', 'form_split', 'form_rename', 'scorched_earth', 'retrofit', 'train', 'send_neutral', 'recall', 'patrol'].includes(a)) return null;

  if (a === 'form_join' || a === 'form_split' || a === 'form_rename') {
    const forms = _forms(game, me);
    const f = forms.find((x) => x.id === String(body.id || body.form_id));
    if (!f) return err('Formación no encontrada.');
    if (a === 'form_rename') {
      const nm = String(body.name || '').trim().slice(0, 40);
      if (!nm) return err('Nombre vacío.');
      f.name = nm; return ok(`Formación renombrada a "${nm}".`);
    }
    if (a === 'form_join') {
      const d = divOf(game, body.div, me);
      if (!d) return err('División no encontrada.');
      if (forms.some((x) => x.divs.includes(d.id))) return err('La división ya pertenece a una formación.');
      const first = divOf(game, f.divs[0], me);
      if (first && first.location !== d.location) return err('Debe estar en el mismo territorio que la formación.');
      f.divs.push(d.id);
      return ok(`${d.name} se une a "${f.name}" (${form_type(game, f).name}).`);
    }
    const ids = (body.divs || []).filter((id) => f.divs.includes(id));
    if (!ids.length) return err('Ninguna de esas divisiones pertenece a la formación.');
    f.divs = f.divs.filter((id) => !ids.includes(id));
    let msg = `${ids.length} división(es) salen de "${f.name}".`;
    if (ids.length >= 2) {
      const nid = _nextFormId(forms);
      forms.push({ id: nid, name: String(body.name || `Escuadra ${nid}`).slice(0, 40), divs: ids });
      msg += ` Nueva formación ${nid}.`;
    }
    if (f.divs.length < 2) { forms.splice(forms.indexOf(f), 1); msg += ` "${f.name}" se disuelve.`; }
    return ok(msg);
  }

  if (a === 'retrofit') {
    const ids = body.divs || (body.div ? [body.div] : []);
    let total = 0, n = 0;
    const c = game.countries[me];
    for (const id of ids) {
      const d = divOf(game, id, me); if (!d) continue;
      const r = retrofit_cost(game, d);
      if (r.to <= r.from) continue;
      if (c.money < r.cost) return err(`Dinero insuficiente para reequipar ${d.name} (${r.cost}).`);
      c.money = r2(c.money - r.cost); d.up0 = r.to; total += r.cost; n++;
    }
    if (!n) return err('Nada que reequipar: las unidades ya tienen las mejoras investigadas.');
    return ok(`${n} unidad(es) reequipada(s) por ${r2(total)}.`);
  }

  const d = divOf(game, body.div || body.id, me);
  if (!d) return err('División no encontrada.');
  const ut = ROSTER[kindOf(d)];

  if (a === 'scorched_earth') {
    if (!BOMBERS.has(kindOf(d))) return err('Solo los bombarderos pueden usar Tierra quemada.');
    d.scorched = body.on === undefined ? !d.scorched : !!body.on;
    return ok(d.scorched ? `${d.name}: Tierra quemada activada (+25 % daño, -40 % defensa, -20 % vida).` : `${d.name}: Tierra quemada desactivada.`);
  }

  if (a === 'train') {
    const lab = prov_labc_level(game, me);
    if (lab < 1) return err('Necesitas un Laboratorio central para entrenar.');
    if ((d.lv || 0) >= MAX_LEVEL) return err('Nivel máximo alcanzado.');
    const cost = r2(8 + ut.cost * 0.1);
    const c = game.countries[me];
    if (c.money < cost) return err(`Dinero insuficiente (${cost}).`);
    c.money = r2(c.money - cost);
    gain_xp(game, d, 6 + 3 * lab);
    return ok(`${d.name} entrena en el laboratorio: nivel ${d.lv}.`);
  }

  if (a === 'patrol') {
    if (!(clsOf(d) === 'air' || clsOf(d) === 'heli' || clsOf(d) === 'drone' || kindOf(d) === 'sub')) return err('Solo aviones, helicópteros, drones y submarinos patrullan.');
    const on = body.on === undefined ? !d.patrol : !!body.on;
    if (!on) { delete d.patrol; return ok(`${d.name}: patrulla cancelada.`); }
    d.patrol = { pids: Array.isArray(body.pids) ? body.pids.slice(0, 6) : [] };
    return ok(`${d.name} patrulla${d.patrol.pids.length ? ` entre ${d.patrol.pids.length} puntos` : ' su zona'} y atacará al contacto.`);
  }

  if (a === 'send_neutral') {
    const t = body.target;
    if (!game.countries[t] || game.countries[t].owner !== t) return err('País desconocido.');
    if (t === me || S.at_war(game, me, t) || S.allies_of(game, me).includes(t)) return err('Solo se envían tropas a países neutrales (ni aliados ni en guerra).');
    if (d.st === 'recarga' || d.st === 'carga' || d.st === 'marcha') return err(`${d.name} no puede moverse ahora.`);
    if (!S.is_adjacent(d.location, t) && !(clsOf(d) === 'nav' || clsOf(d) === 'air' || clsOf(d) === 'heli')) return err('El país neutral no es adyacente.');
    if (!d.foreign) d.home = d.location;
    d.foreign = t; d.location = t; d.st = 'marcha'; d.stt = game.turn;
    S.add_rel(game, me, t, -Math.round(tension_of(kindOf(d))));
    S.sync_armies(game);
    return ok(`${d.name} entra en ${game.countries[t].name} sin invitación: la tensión sube (${tension_of(kindOf(d))}/turno).`);
  }

  if (a === 'recall') {
    if (!d.foreign) return err('La división no está en un país neutral.');
    const home = d.home && game.countries[d.home] && S.owner_of(game, d.home) === me ? d.home : me;
    d.location = home; delete d.foreign; delete d.home; d.st = 'marcha'; d.stt = game.turn;
    S.sync_armies(game);
    return ok(`${d.name} regresa a casa.`);
  }
  return null;
}

// ------------------------------------------------------------------ turno
function _friendly(game, owner, cid) {
  const o = S.owner_of(game, cid);
  return o === owner || S.allies_of(game, owner).includes(o);
}

function _convoys_at(game, d) {
  return (game.divisions || []).some((x) => x !== d && x.owner === d.owner && x.location === d.location && x.kind === 'convoy' && (x.troops || 0) > 0);
}

export function turn(game, rng, lines) {
  if (!game.ext) return;
  const me = game.player;
  const divs = game.divisions || [];
  const forms = game.ext.forms || {};

  // limpieza de formaciones (todos los dueños) y reinicio de puntos navales
  for (const cid of Object.keys(forms)) {
    const ids = new Set(divs.filter((d) => d.owner === cid).map((d) => d.id));
    forms[cid] = (forms[cid] || []).map((f) => ({ ...f, divs: f.divs.filter((i) => ids.has(i)) })).filter((f) => f.divs.length >= 2);
  }
  for (const d of divs) { if (d.mp_used) d.mp_used = 0; }

  for (const d of [...divs]) {
    if (!ROSTER[d.kind]) continue;
    if (d.lv == null) d.lv = level_of(d);

    // suministro: sin territorio propio/aliado y sin convoy a mano
    if (d.kind !== 'convoy' && !d.foreign) {
      if (!_friendly(game, d.owner, d.location)) {
        if (_convoys_at(game, d)) d.unsup = 0;
        else {
          d.unsup = (d.unsup || 0) + 1;
          if (d.unsup > 2) {
            d.troops = r2(Math.max(0.1, (d.troops || 0) * 0.94));
            d.org = clampN((d.org == null ? 80 : d.org) - 8, 0, 100);
            if (d.owner === me && d.unsup === 3) news(game, `${d.name} sin suministros fuera de territorio: pierde fuerza y moral. Envía un convoy.`, 'warn');
          }
        }
      } else d.unsup = 0;
    }
    // experiencia: enfrentarse a enemigos en su territorio
    if (d.kind !== 'convoy') {
      const foes = S.divisions_at(game, d.location).some((x) => x.owner !== d.owner && S.at_war(game, d.owner, x.owner));
      if (foes) gain_xp(game, d, 2);
      else if (S.enemies_of && (S.enemies_of(game, d.owner) || []).length && d.location !== d.owner) gain_xp(game, d, 0.5);
    }
  }

  // tropas en países neutrales: tensión y posible declaración de guerra
  for (const d of [...divs]) {
    if (!d.foreign) continue;
    const t = d.foreign;
    if (!game.countries[t] || S.at_war(game, d.owner, t) || S.allies_of(game, d.owner).includes(t) || d.location !== t) { delete d.foreign; delete d.home; continue; }
    const w = tension_of(d.kind);
    S.add_rel(game, d.owner, t, -Math.max(1, Math.round(w / 2)));
    const rel = S.get_rel(game, d.owner, t);
    const p = clampN((w / 100) * (rel < -30 ? 2 : rel < 0 ? 1 : 0.4), 0, 0.5);
    if (rel < -20 && rng.random() < p) {
      try {
        if (D.declare_war(game, t, d.owner, rng, 'Invasión de tropas extranjeras')) {
          news(game, `${game.countries[t].name} declara la guerra a ${game.countries[d.owner].name} por las tropas en su territorio.`, 'war');
          delete d.foreign; delete d.home;
        }
      } catch (e) { /* diplomacia opcional */ }
    }
  }

  // patrullas: aire/submarinos atacan al contacto
  for (const d of [...divs]) {
    if (!d.patrol || d.st === 'recarga' || (d.troops || 0) + (d.planes || 0) + (d.tanks || 0) <= 0) continue;
    try {
      if (d.owner !== me && !d.patrol) continue;
      let targets = AERO.strike_targets(game, d);
      if (!targets.length) continue;
      const pids = d.patrol.pids && d.patrol.pids.length ? targets.filter((p) => d.patrol.pids.includes(p)) : targets;
      if (!pids.length) continue;
      // prioridad: convoyes
      const P = game.ext.prov || {};
      const conv = pids.filter((p) => divs.some((x) => x.kind === 'convoy' && x.owner === P[p].o && x.location === P[p].c));
      const pool = conv.length ? conv : pids;
      const pid = pool[Math.floor(rng.random() * pool.length)];
      const r = AERO.do_strike(game, d, pid, rng);
      if (d.owner === me && r && r.text) lines.push('Patrulla: ' + r.text);
    } catch (e) { /* patrulla opcional */ }
  }

  // IA: convoyes hacia tropas sin suministro, bombarderos con tierra quemada, enjambres de drones
  for (const cid of Object.keys(game.countries)) {
    if (cid === me || game.countries[cid].owner !== cid) continue;
    try { _ai(game, cid, rng); } catch (e) { /* IA opcional */ }
  }
}

function _ai(game, cid, rng) {
  const mine = (game.divisions || []).filter((d) => d.owner === cid);
  // tierra quemada en bombarderos sanos durante la guerra
  const warring = (game.wars || []).some((w) => w.a === cid || w.b === cid);
  for (const d of mine) if (BOMBERS.has(d.kind)) d.scorched = warring && (d.scorched === undefined ? rng.random() < 0.35 : d.scorched);
  // convoy hacia el grupo sin suministro más necesitado
  const needy = mine.filter((d) => d.kind !== 'convoy' && (d.unsup || 0) >= 1 && !_convoys_at(game, d));
  if (needy.length) {
    const target = needy[0];
    const cv = mine.find((d) => d.kind === 'convoy' && d.location !== target.location && !d.st && S.is_adjacent(d.location, target.location));
    if (cv) { try { queue_order(game, cid, 'move', target.location, cv.id, null); } catch (e) { if (!(e instanceof OrderError)) throw e; } }
  }
  // enjambres de drones
  const forms = _forms(game, cid);
  const grouped = new Set(forms.flatMap((f) => f.divs));
  const byLoc = {};
  for (const d of mine) if (clsOf(d) === 'drone' && !grouped.has(d.id)) (byLoc[d.location] = byLoc[d.location] || []).push(d);
  for (const list of Object.values(byLoc)) {
    if (list.length > 10) { const id = _nextFormId(forms); forms.push({ id, name: 'Enjambre ' + id, divs: list.map((d) => d.id) }); }
  }
}

export function pending(game) {
  if (!game.ext) return [];
  const me = game.player;
  const out = [];
  for (const d of game.divisions || []) {
    if (d.owner === me && d.kind !== 'convoy' && (d.unsup || 0) >= 2) out.push({ kind: 'army', text: `${d.name} lleva ${d.unsup} turnos sin suministros.`, div: d.id });
  }
  return out.slice(0, 5);
}
