// Port de backend/app/engine/turn.py
// Resolucion de un turno completo (1 mes).
import * as C from './constants.js';
import * as D from './diplomacy.js';
import * as E from './economy.js';
import * as EV from './events.js';
import * as M from './military.js';
import * as S from './state.js';
import * as P from './py.js';
import { generate_ai_orders } from './ai.js';
import { OrderError, resolve_civil } from './orders.js';

const _has = (obj, k) => obj != null && k != null && Object.prototype.hasOwnProperty.call(obj, k);

export function _snapshot(game) {
  const c = game["countries"][game["player"]];
  return {money: c["money"], stability: c["stability"], industry: c["industry"]};
}

export function compute_scores(game) {
  const out = {};
  for (const e of S.entities(game)) {
    if (S.is_alive(game, e)) {
      out[e] = S.territories_of(game, e).length * 10 + game["countries"][e]["industry"];
    }
  }
  return out;
}

export const scores = compute_scores;

export function _check_end(game) {
  const player = game["player"];
  const own = S.territories_of(game, player).length;
  if (!_has(game, "zero_stability_turns")) game["zero_stability_turns"] = {};
  const zst = game["zero_stability_turns"];
  if (own >= S.victory_target()) {
    Object.assign(game, {ended: true, winner: player, result: "victory", loss_reason: null});
    S.add_log(game, `¡Victoria! Controlas ${own} territorios del continente.`, "victory");
    return;
  }
  if (own === 0 || !S.is_alive(game, player)) {
    Object.assign(game, {ended: true, result: "defeat", loss_reason: "Tu nación ha sido ocupada."});
  } else if ((_has(zst, player) ? zst[player] : 0) >= C.ZERO_STABILITY_LOSS_TURNS) {
    Object.assign(game, {ended: true, result: "defeat",
      loss_reason: "El gobierno colapsó tras meses de inestabilidad total."});
  }
  if (P.truthy(game["ended"])) {
    S.add_log(game, `Derrota: ${game['loss_reason']}`, "defeat");
    return;
  }
  for (const ent of S.entities(game)) {
    if (ent !== player && S.is_alive(game, ent) && S.territories_of(game, ent).length >= S.victory_target()) {
      Object.assign(game, {ended: true, winner: ent, result: "defeat",
        loss_reason: `${S.display_name(game, ent)} domina el continente.`});
      S.add_log(game, `Derrota: ${game['loss_reason']}`, "defeat");
      return;
    }
  }
  if (game["turn"] >= C.MAX_TURNS) {
    const sc = compute_scores(game);
    const keys = Object.keys(sc);
    if (!keys.length) throw new Error("max() arg is an empty sequence");
    const best = P.maxBy(keys, (k) => sc[k]);
    // empate favorece al jugador, intencional
    if (best === player || (_has(sc, player) ? sc[player] : 0) >= sc[best]) {
      Object.assign(game, {ended: true, winner: player, result: "victory", loss_reason: null});
      S.add_log(game, "¡Victoria por supremacía! Al cabo de 4 años lideras el continente.", "victory");
    } else {
      // sin dominador: la nacion sobrevive a la Guerra Fria (tablas, no derrota)
      Object.assign(game, {ended: true, result: "draw", winner: best,
        loss_reason: `${S.display_name(game, best)} lidera el continente tras 4 años, pero tu nación sobrevive a la Guerra Fría.`});
      S.add_log(game, `Fin de la partida: ${game['loss_reason']}`, "info");
    }
  }
}

export function end_turn(game) {
  // Resuelve el turno actual y devuelve el informe {turn, lines, battles}.
  if (P.truthy(game["ended"])) {
    throw new OrderError("La partida ha terminado.");
  }
  if (P.truthy(game["active_event"])) {
    try {
      EV.apply_choice(game, 0);
    } catch (err) {
      if (!(err instanceof OrderError)) throw err;
      game["active_event"] = null;
    }
  }
  const turn = game["turn"];
  const before = _snapshot(game);
  game["_turn_lines"] = [];

  generate_ai_orders(game);
  const orders = game["orders"].slice();
  resolve_civil(game, orders, S.make_rng(game, "civil"));
  const battles = M.resolve_military(game, orders, S.make_rng(game, "war"));
  M.purge_dead(game);
  S.sync_armies(game);

  E.economy_phase(game);
  E.advance_projects(game);
  D.auto_ceasefire(game);
  D.relation_drift(game);
  EV.roll_events(game);
  // el reclutamiento pasivo, los proyectos y los eventos agregan fuerzas tras la fase militar
  S.sync_armies(game);

  if (!_has(game, "zero_stability_turns")) game["zero_stability_turns"] = {};
  const zst = game["zero_stability_turns"];
  for (const ent of S.entities(game)) {
    const c = _has(game["countries"], ent) ? game["countries"][ent] : null;
    if (c === null || c === undefined) {
      continue;
    }
    zst[ent] = c["stability"] <= 0 ? (_has(zst, ent) ? zst[ent] : 0) + 1 : 0;
  }

  _check_end(game);
  const after = _snapshot(game);
  const deltas = {};
  for (const k of ["money", "stability", "industry"]) {
    deltas[k] = P.pyRound(after[k] - before[k], 2);
  }
  game["last_deltas"] = deltas;
  game["orders"] = [];
  if (!P.truthy(game["ended"])) {
    game["turn"] = turn + 1;
    game["date"] = S.date_for_turn(game["turn"]);
  }
  const lines = _has(game, "_turn_lines") ? game["_turn_lines"] : [];
  delete game["_turn_lines"];
  const report = {turn: turn, lines: lines, battles: battles};
  game["last_report"] = report;
  return report;
}
