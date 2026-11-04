// Diplomacia: tratados, guerras, envios de recursos y paz (entre entidades).
// Port 1:1 de backend/app/engine/diplomacy.py
import * as C from './constants.js';
import * as S from './state.js';

export function _name(game, ent) {
  return S.display_name(game, ent);
}

export function _allied_conflict(game, a, b) {
  // True si a esta en guerra con un aliado de b, o b con un aliado de a.
  for (const ally of S.allies_of(game, b)) {
    if (S.at_war(game, a, ally)) return true;
  }
  for (const ally of S.allies_of(game, a)) {
    if (S.at_war(game, b, ally)) return true;
  }
  return false;
}

export function evaluate_treaty(game, kind, a, b) {
  // Decide si b acepta un tratado propuesto por a. Devuelve [aceptado, motivo].
  const rel = S.get_rel(game, a, b);
  if (S.at_war(game, a, b)) return [false, "están en guerra"];
  if (kind === "alliance") {
    if (rel < C.ALLIANCE_MIN_REL) return [false, "la relación es insuficiente"];
    if (_allied_conflict(game, a, b)) return [false, "está en guerra con un aliado del proponente"];
  } else if (kind === "nap") {
    if (rel < C.NAP_MIN_REL) return [false, "la relación es demasiado baja"];
  } else if (kind === "trade") {
    if (rel < C.TRADE_MIN_REL) return [false, "la relación es insuficiente"];
  }
  return [true, ""];
}

const _TREATY_LABEL = { "alliance": "alianza", "nap": "pacto de no agresión", "trade": "tratado comercial" };

export function propose_treaty(game, kind, a, b) {
  // Intenta firmar un tratado; registra el resultado si involucra al jugador.
  if (S.has_treaty(game, kind, a, b)) return false;
  if (!Object.prototype.hasOwnProperty.call(_TREATY_LABEL, kind)) throw new Error(`KeyError: '${kind}'`);
  const label = _TREATY_LABEL[kind];
  if (b === game["player"] && a !== game["player"]) {
    // La IA no firma tratados en nombre del jugador: solo le ofrece el acuerdo (cada 6 turnos como mucho).
    if (evaluate_treaty(game, kind, a, b)[0]) {
      if (game["offers"] == null) game["offers"] = {};
      const offers = game["offers"];
      const key = `${kind}|${a}`;
      const last = Object.prototype.hasOwnProperty.call(offers, key) ? offers[key] : -99;
      if (game["turn"] - last >= 6) {
        offers[key] = game["turn"];
        S.add_log(game, `${_name(game, a)} te ofrece ${kind === 'alliance' ? 'una' : 'un'} ${label}. `
          + `Si te interesa, propónselo tú desde Diplomacia.`, "diplo");
      }
    }
    return false;
  }
  const [ok, why] = evaluate_treaty(game, kind, a, b);
  const involves = game["player"] === a || game["player"] === b;
  if (ok) {
    game["treaties"].push({ "type": kind, "a": a, "b": b, "since_turn": game["turn"] });
    S.add_rel(game, a, b, 8);
    if (involves || kind === "alliance") {
      S.add_log(game, `${_name(game, a)} y ${_name(game, b)} firman ${kind === 'alliance' ? 'una' : 'un'} ${label}.`, "diplo");
    }
  } else if (involves) {
    S.add_log(game, `${_name(game, b)} rechaza la propuesta de ${label}: ${why}.`, "diplo");
  }
  return ok;
}

export function send_resources(game, actor, target, amount) {
  // Transfiere dinero al objetivo y mejora la relacion.
  const src = game["countries"][actor];
  const dst = game["countries"][target];
  const m = src["money"] + amount;
  const cap = m > 0.0 ? m : 0.0;           // max(0.0, ...)
  amount = cap < amount ? cap : amount;     // min(amount, ...) -> el primero en empate
  dst["money"] += amount;
  const r = amount / 20.0;
  S.add_rel(game, actor, target, r < 10 ? r : 10);  // min(10, r)
  if (game["player"] === actor || game["player"] === target) {
    S.add_log(game, `${_name(game, actor)} envía ${S.money_str(amount)} a ${_name(game, target)}.`, "diplo");
  }
}

export function relation_drift(game) {
  // Deriva de relaciones: +1 con tratado comercial, si no 1 punto hacia 0 (salvo guerra).
  for (const [key, v] of Object.entries(game["relations"])) {
    const idx = key.indexOf("|");
    const a = idx >= 0 ? key.slice(0, idx) : key;
    const b = idx >= 0 ? key.slice(idx + 1) : "";
    if (S.has_treaty(game, "trade", a, b)) {
      game["relations"][key] = Math.min(100, v + 1);
    } else if (v && !S.at_war(game, a, b) && !game["treaties"].some(
      t => _sameSet(t["a"], t["b"], a, b))) {
      game["relations"][key] = v > 0 ? v - 1 : v + 1;
    }
  }
}

function _sameSet(x, y, a, b) {
  // {x, y} == {a, b}
  const s1 = new Set([x, y]);
  const s2 = new Set([a, b]);
  if (s1.size !== s2.size) return false;
  for (const e of s1) if (!s2.has(e)) return false;
  return true;
}

export function break_treaties(game, actor, target, kind = null) {
  // Rompe tratados entre actor y target con penalizaciones (todos, o solo los de tipo `kind`).
  let n;
  if (kind === "alliance" || kind === "nap" || kind === "trade") {
    n = S.remove_treaties(game, actor, target, [kind]);
  } else {
    n = S.remove_treaties(game, actor, target);
  }
  if (n) {
    game["countries"][actor]["stability"] = Math.max(0.0, game["countries"][actor]["stability"] - C.BREAK_STAB);
    S.add_rel(game, actor, target, -C.BREAK_REL);
    S.add_log(game, `${_name(game, actor)} rompe sus tratados con ${_name(game, target)}.`, "diplo");
  }
  return n;
}

export function declare_war(game, actor, target, rng, reason = "") {
  // Declara la guerra: estabilidad, relaciones y posible entrada de aliados del objetivo.
  if (actor === target || S.at_war(game, actor, target)) return false;
  const home = game["countries"][actor];
  let penalty = C.WAR_STAB;
  if (S.has_treaty(game, "nap", actor, target)) {
    penalty += C.BREAK_NAP_STAB;
    S.add_log(game, `${_name(game, actor)} rompe un pacto de no agresión con ${_name(game, target)}.`, "diplo");
  }
  home["stability"] = Math.max(0.0, home["stability"] - penalty);
  S.remove_treaties(game, actor, target);
  S.add_rel(game, actor, target, -C.WAR_REL);
  game["wars"].push({ "a": actor, "b": target, "since_turn": game["turn"], "last_combat": game["turn"] });
  S.add_log(game, `${_name(game, actor)} declara la guerra a ${_name(game, target)}${reason}.`, "war");
  for (const ally of S.allies_of(game, target)) {
    _ally_joins(game, ally, actor, rng);
  }
  return true;
}

export function _ally_joins(game, ally, enemy, rng) {
  // Un aliado del atacado puede unirse a la guerra.
  if (ally === enemy || S.at_war(game, ally, enemy) || S.has_treaty(game, "alliance", ally, enemy)) return;
  if (S.has_treaty(game, "nap", ally, enemy) || rng.random() > 0.5) return;
  game["wars"].push({ "a": ally, "b": enemy, "since_turn": game["turn"], "last_combat": game["turn"] });
  S.remove_treaties(game, ally, enemy);
  S.add_rel(game, ally, enemy, -C.WAR_REL);
  S.add_log(game, `${_name(game, ally)} entra en la guerra contra ${_name(game, enemy)} en defensa de su aliado.`, "war");
}

export function make_peace(game, a, b, forced = false) {
  // Propone la paz; se acepta si la guerra tiene edad y no hubo combates recientes.
  const war = S.find_war(game, a, b);
  if (war === null || war === undefined) return [false, "no están en guerra"];
  if (!forced) {
    if (game["turn"] - war["since_turn"] < C.PEACE_MIN_AGE) return [false, "la guerra es demasiado reciente"];
    const lc = ("last_combat" in war) ? war["last_combat"] : war["since_turn"];
    if (game["turn"] - lc < 2) return [false, "aún hay combates en curso"];
  }
  const idx = game["wars"].indexOf(war);
  if (idx >= 0) game["wars"].splice(idx, 1);
  S.add_rel(game, a, b, 10);
  S.add_log(game, `${_name(game, a)} y ${_name(game, b)} firman la paz.`, "diplo");
  return [true, ""];
}

export function auto_ceasefire(game) {
  // Termina guerras sin combates durante varios turnos.
  for (const w of [...game["wars"]]) {
    const lc = ("last_combat" in w) ? w["last_combat"] : w["since_turn"];
    if (game["turn"] - lc >= C.CEASEFIRE_IDLE_TURNS) {
      make_peace(game, w["a"], w["b"], true);
    }
  }
}
