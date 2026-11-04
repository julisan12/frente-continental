// Economia: ingresos, gastos, presupuesto, factores de estabilidad y proyectos.
// Port 1:1 de backend/app/engine/economy.py
import * as C from './constants.js';
import * as S from './state.js';
import { pyRound } from './py.js';

export function _stab_factor(c) {
  return C.STAB_BASE + c["stability"] / C.STAB_DIV;
}

export function trade_count(game, ent) {
  // Numero de tratados comerciales de la entidad (maximo 4 cuentan).
  let n = 0;
  for (const t of game["treaties"]) {
    if (t["type"] === "trade" && (ent === t["a"] || ent === t["b"])) n += 1;
  }
  return Math.min(n, 4);
}

export function income(game, ent) {
  // Ingreso por turno: produccion de sus territorios x estabilidad x desarrollo.
  const home = game["countries"][ent];
  let prod = 0.0;
  for (const cid of S.territories_of(game, ent)) {
    const c = game["countries"][cid];
    prod += c["production"] * (cid === ent ? 1.0 : C.OCCUPIED_YIELD);
  }
  const base = prod * _stab_factor(home) * (1 + home["development"] * C.DEV_BONUS);
  return base * (1 + C.TRADE_BONUS * trade_count(game, ent));
}

export function expenses(game, ent) {
  // Mantenimiento de las divisiones de la entidad.
  let total = 0.0;
  for (const d of S.divisions_of(game, ent)) {
    total += d["troops"] * C.UPKEEP_TROOP + d["tanks"] * C.UPKEEP_TANK + d["planes"] * C.UPKEEP_PLANE;
  }
  return total;
}

export function balance(game, ent) {
  return income(game, ent) - expenses(game, ent);
}

export function invest_pool(game, ent) {
  const b = balance(game, ent);
  return (b > 0.0 ? b : 0.0) * C.BUDGET_SHARE;
}

export function gdp(game, ent) {
  return income(game, ent) * C.GDP_MULT;
}

export function stability_factors(game, ent) {
  // Lista [{label, value}] con el cambio de estabilidad esperado por turno.
  const home = game["countries"][ent];
  const pool = invest_pool(game, ent);
  const social = pool * home["budget"]["social"] / 100.0 / C.SOCIAL_COST_PER_POINT;
  let revert = 0.0;
  if (home["stability"] >= C.STAB_REVERT_MIN) {
    revert = (C.STAB_REVERT_TO - home["stability"]) * C.STAB_REVERT_RATE;
  }
  let treaties = 0;
  for (const t of game["treaties"]) {
    if ((t["type"] === "alliance" || t["type"] === "nap") && (ent === t["a"] || ent === t["b"])) treaties += 1;
  }
  const wars = S.enemies_of(game, ent).length;
  const out = [
    { "label": "Gasto social", "value": pyRound(social, 2) },
    { "label": "Retorno a la normalidad", "value": pyRound(revert, 2) },
    { "label": "Tratados y alianzas", "value": pyRound(Math.min(C.STAB_TREATY_CAP, treaties * C.STAB_TREATY_BONUS), 2) },
    { "label": "Guerras en curso", "value": pyRound(-wars * C.STAB_WAR_PENALTY, 2) },
  ];
  return out;
}

/**
 * Agrega fuerzas a la division mas pequena de la entidad (o crea una).
 * Acepta add_forces(game, ent, troops, tanks, planes) o add_forces(game, ent, {troops, tanks, planes})
 * (equivalente a los kwargs de Python).
 */
export function add_forces(game, ent, troops = 0, tanks = 0, planes = 0) {
  if (troops !== null && typeof troops === "object") {
    const kw = troops;
    troops = kw.troops ?? 0;
    tanks = kw.tanks ?? 0;
    planes = kw.planes ?? 0;
  }
  const owned = S.divisions_of(game, ent).filter(d => game["countries"][d["location"]]["owner"] === ent);
  if (owned.length) {
    // min() con key: el primero con el valor minimo gana
    let d = owned[0];
    let best = S.raw_power(d["troops"], d["tanks"], d["planes"]);
    for (let i = 1; i < owned.length; i++) {
      const x = owned[i];
      const v = S.raw_power(x["troops"], x["tanks"], x["planes"]);
      if (v < best) { best = v; d = x; }
    }
    d["troops"] += troops;
    d["tanks"] += tanks;
    d["planes"] += planes;
  } else {
    const places = S.territories_of(game, ent);
    if (!places.length) return;
    const loc = places.includes(ent) ? ent : places[0];
    const n = S.divisions_of(game, ent).length + 1;
    S.add_division(game, ent, loc, `${n}ª División de Reserva`, troops, tanks, planes, "defend");
  }
}

export function apply_budget(game, ent) {
  // Reparte el superavit invertible segun el presupuesto de la entidad.
  const home = game["countries"][ent];
  const pool = invest_pool(game, ent);
  const b = home["budget"];
  home["money"] -= pool;
  add_forces(game, ent, pool * b["army"] / 100.0 / C.RECRUIT_COST_PER_TROOP);
  home["infrastructure"] = Math.min(100.0, home["infrastructure"] + pool * b["infrastructure"] / 100.0 / C.INFRA_COST_PER_POINT);
  const ind = pool * b["industry"] / 100.0 / C.INDUSTRY_COST_PER_POINT;
  home["industry"] += ind;
  home["production"] = Math.min(C.MAX_PRODUCTION * 3, home["production"] + ind * C.PRODUCTION_PER_INDUSTRY);
}

export function economy_phase(game) {
  // Procesa la economia de todas las entidades vivas.
  for (const ent of S.entities(game)) {
    const home = game["countries"][ent];
    const factors = stability_factors(game, ent);
    const bal = balance(game, ent);
    home["money"] += bal;
    apply_budget(game, ent);
    let s = 0;
    for (const f of factors) s += f["value"];
    home["stability"] = Math.max(0.0, Math.min(100.0, home["stability"] + s));
    if (home["money"] < 0) {
      home["money"] = 0.0;
      home["stability"] = Math.max(0.0, home["stability"] + C.NEGATIVE_MONEY_STABILITY);
      if (ent === game["player"]) {
        S.add_log(game, "Tesoro agotado: déficit presupuestario, estabilidad −8.", "econ");
      }
    }
  }
}

export function advance_projects(game) {
  // Avanza proyectos y aplica sus efectos al completarse.
  const remaining = [];
  for (const p of game["projects"]) {
    p["turns_left"] -= 1;
    if (p["turns_left"] > 0) {
      remaining.push(p);
      continue;
    }
    const ent = p["owner"];
    if (!S.is_alive(game, ent)) continue;
    const home = game["countries"][ent];
    const effects = C.PROJECTS[p["kind"]][3];
    for (const [k, v] of Object.entries(effects)) {
      if (k === "troops") {
        add_forces(game, ent, v);
      } else if (k === "infrastructure" || k === "stability") {
        home[k] = Math.min(100.0, home[k] + v);
      } else {
        home[k] = home[k] + v;
      }
    }
    if (ent === game["player"]) {
      S.add_log(game, `Proyecto completado: ${p['name']}.`, "econ");
    }
  }
  game["projects"] = remaining;
}
