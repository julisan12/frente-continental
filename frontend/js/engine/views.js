// Vistas serializables de la partida para el cliente (con niebla de guerra).
// Port 1:1 de backend/app/engine/views.py
import * as C from './constants.js';
import * as E from './economy.js';
import * as S from './state.js';
import * as T from './turn.js';
import { pyRound } from './py.js';

const _HIDDEN = ["_turn_lines", "prev", "ai_memory"];
const _FORCES = ["army", "tanks", "planes"];

function _deepcopy(v) {
  if (v === undefined) return undefined;
  if (typeof structuredClone === "function") return structuredClone(v);
  return JSON.parse(JSON.stringify(v));
}

export function _friends(game) {
  // Jugador y sus aliados: ven datos exactos.
  const p = game["player"];
  return [p, ...S.allies_of(game, p)];
}

export function _fog_factors(game, key) {
  // Tres factores deterministas (por turno) de niebla de guerra: tropas, tanques, aviones.
  const rng = S.make_rng(game, "fog-" + key);
  const [lo, hi] = C.FOG_RANGE;
  return [rng.uniform(lo, hi), rng.uniform(lo, hi), rng.uniform(lo, hi)];
}

export function _fog_country(game, cid, c) {
  // Oculta/perturba en `c` (copia del territorio cid) los datos que el jugador no conoce.
  const f = _fog_factors(game, cid);
  for (let i = 0; i < 3; i++) {
    const k = _FORCES[i];
    c[k] = pyRound((k in c ? c[k] : 0) * f[i], 1);
  }
  c["money"] = null;
  c["fog"] = true;
}

export function player_forces(game, ent) {
  // Totales de las divisiones de la entidad (dondequiera que esten).
  let t = 0.0, k = 0.0, a = 0.0;
  for (const d of S.divisions_of(game, ent)) {
    t += d["troops"];
    k += d["tanks"];
    a += d["planes"];
  }
  return { "troops": pyRound(t, 1), "tanks": pyRound(k, 1), "planes": pyRound(a, 1) };
}

export function threat_to(game, src, dst) {
  // Amenaza (0-100) que la entidad src supone para dst: poder relativo x hostilidad.
  if (src === dst || S.has_treaty(game, "alliance", src, dst)) return 0;
  const pd = S.entity_power(game, dst);
  const ratio = S.entity_power(game, src) / (pd > 1.0 ? pd : 1.0);
  let hostility;
  if (S.at_war(game, src, dst)) {
    hostility = 1.0;
  } else {
    const rel = S.get_rel(game, src, dst);
    hostility = (C.THREAT_REL_ZERO - rel) / C.THREAT_REL_SPAN;
    hostility = Math.max(0.0, Math.min(1.0, hostility));
    if (S.has_treaty(game, "nap", src, dst)) hostility *= C.THREAT_NAP_FACTOR;
  }
  const value = ratio * hostility * C.THREAT_SCALE;
  return Math.trunc(Math.min(100.0, Math.floor(value + 0.5)));
}

export function game_view(game) {
  const view = {};
  for (const [k, v] of Object.entries(game)) {
    if (!_HIDDEN.includes(k)) view[k] = _deepcopy(v);
  }
  const friends = _friends(game);
  for (const [cid, c] of Object.entries(view["countries"] || {})) {
    delete c["path"];
    if (!friends.includes(c["owner"])) _fog_country(game, cid, c);
  }
  view["divisions"] = (view["divisions"] || []).filter(d => friends.includes(d["owner"]));
  const p = game["player"];
  const d = { "money": 0, "stability": 0, "industry": 0 };
  const last = game["last_deltas"];
  if (last && Object.keys(last).length) {
    for (const k of Object.keys(d)) d[k] = (k in last) ? last[k] : 0;
  }
  delete view["last_deltas"];
  view["summary"] = {
    "income": E.income(game, p), "expenses": E.expenses(game, p),
    "balance": E.balance(game, p), "deltas": d,
    "forces": player_forces(game, p),
  };
  const items = Object.entries(T.compute_scores(game));
  // sorted(..., key=-score): estable
  const top = items.map((kv, i) => [kv, i])
    .sort((x, y) => (y[0][1] - x[0][1]) || (x[1] - y[1]))
    .map(x => x[0]).slice(0, 5);
  view["ranking"] = top.map(([e, v]) => ({ "id": e, "name": S.display_name(game, e), "score": pyRound(v, 1) }));
  view["max_turns"] = C.MAX_TURNS;
  return view;
}

export function country_detail(game, cid) {
  if (!Object.prototype.hasOwnProperty.call(game["countries"], cid)) throw new Error("País desconocido.");
  const c = _deepcopy(game["countries"][cid]);
  delete c["path"];
  const p = game["player"];
  const owner = S.owner_of(game, cid);
  const friends = _friends(game);
  if (!friends.includes(owner)) _fog_country(game, cid, c);
  c["income"] = E.income(game, owner);
  c["expenses"] = E.expenses(game, owner);
  c["balance"] = E.balance(game, owner);
  c["gdp"] = E.gdp(game, owner);
  c["threat"] = threat_to(game, owner, p);
  c["relation"] = owner === p ? 100 : S.get_rel(game, p, owner);
  c["allies"] = S.allies_of(game, owner);
  c["enemies"] = S.enemies_of(game, owner);
  let est = player_forces(game, owner);
  if (!friends.includes(owner)) {
    const f = _fog_factors(game, "ent-" + owner);
    est = {
      "troops": pyRound(est["troops"] * f[0], 1), "tanks": pyRound(est["tanks"] * f[1], 1),
      "planes": pyRound(est["planes"] * f[2], 1),
    };
  }
  c["army_estimate"] = est;
  c["stability_factors"] = E.stability_factors(game, owner).map(f => ({ ...f, "name": f["label"] }));
  const oc = game["countries"][owner];
  const ind = Number(("industry" in oc) ? oc["industry"] : 0);
  const prod = Number(("production" in oc) ? oc["production"] : 0);
  c["sector_output"] = {
    "industry": pyRound(ind, 1), "agriculture": pyRound(prod * 0.6, 1),
    "services": pyRound((ind + prod) * 0.4, 1),
  };
  return c;
}
