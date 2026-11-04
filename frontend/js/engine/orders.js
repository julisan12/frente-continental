// Port de backend/app/engine/orders.py
// Ordenes: validacion, cola (con pago inmediato), reembolso y resolucion civil/diplomatica.
import * as C from './constants.js';
import * as D from './diplomacy.js';
import * as E from './economy.js';
import * as S from './state.js';

const _has = (obj, k) => obj != null && k != null && Object.prototype.hasOwnProperty.call(obj, k);
const _get = (obj, k, dflt) => (_has(obj, k) ? obj[k] : dflt);

export const DIPLOMATIC = new Set(["propose_alliance", "nap", "trade", "send_resources", "break", "declare_war", "peace"]);
export const MILITARY = new Set(["move", "attack", "defend", "reorganize", "front"]);
export const ECONOMIC = new Set(["build", "stability", "recruit", "tanks", "planes", "project"]);
export const ALL_TYPES = new Set([...DIPLOMATIC, ...MILITARY, ...ECONOMIC]);
export const DIVISION_ORDERS = MILITARY;
export const TARGET_REQUIRED = new Set([...DIPLOMATIC, "move", "attack"]);

export const TREATY_KIND = { propose_alliance: "alliance", nap: "nap", trade: "trade" };

export class OrderError extends Error {
  // Error de validacion con mensaje en espanol.
  constructor(message) {
    super(message);
    this.name = "OrderError";
  }
}

export function _name(game, cid) {
  return S.display_name(game, cid);
}

// ---------------------------------------------------------------- costes y etiquetas
export function order_cost(otype, params) {
  // Coste en dinero de una orden.
  if (_has(C.ORDER_COSTS, otype)) {
    return Number(C.ORDER_COSTS[otype]);
  }
  if (otype === "send_resources") {
    return Number(_get(params, "amount", C.SEND_DEFAULT));
  }
  if (otype === "project") {
    return Number(C.PROJECTS[params["kind"]][1]);
  }
  return 0.0;
}

export function _label(game, otype, target, division, params) {
  const tn = _has(game["countries"], target) ? _name(game, target) : "";
  const dn = division ? division["name"] : "";
  const labels = {
    propose_alliance: `Proponer alianza a ${tn}`,
    nap: `Proponer pacto de no agresión a ${tn}`,
    trade: `Proponer tratado comercial a ${tn}`,
    send_resources: `Enviar ${S.money_str(_get(params, "amount", 0))} a ${tn}`,
    break: `Romper tratados con ${tn}`,
    declare_war: `Declarar la guerra a ${tn}`,
    peace: `Proponer la paz a ${tn}`,
    move: `Mover ${dn} a ${tn}`,
    attack: `Atacar ${tn} con ${dn}`,
    defend: `${dn}: postura defensiva`,
    reorganize: `${dn}: reorganizar`,
    front: `${dn}: desplegar en el frente`,
    build: "Construir industria",
    stability: "Programa de estabilidad",
    recruit: "Reclutar tropas",
    tanks: "Fabricar tanques",
    planes: "Fabricar aviones",
  };
  if (otype === "break" && _get(params, "treaty", null)) {
    const tnames = { alliance: "la alianza", nap: "el pacto de no agresión", trade: "el tratado comercial" };
    const tname = _get(tnames, params["treaty"], "los tratados");
    return `Romper ${tname} con ${tn}`;
  }
  if (otype === "project") {
    return `Proyecto: ${C.PROJECTS[params["kind"]][0]}`;
  }
  return labels[otype];
}

// ---------------------------------------------------------------- validacion
export function _check_diplomacy(game, ent, otype, target, params) {
  if (!_has(game["countries"], target)) {
    throw new OrderError("País objetivo desconocido.");
  }
  const other = S.owner_of(game, target);
  if (other === ent) {
    throw new OrderError("No puedes dirigir una acción diplomática a tu propio territorio.");
  }
  if (!S.is_alive(game, other)) {
    throw new OrderError("Ese país ya no existe como potencia.");
  }
  if (_has(TREATY_KIND, otype)) {
    const kind = TREATY_KIND[otype];
    if (S.at_war(game, ent, other)) {
      throw new OrderError("No se pueden proponer tratados a un país en guerra.");
    }
    if (S.has_treaty(game, kind, ent, other)) {
      throw new OrderError("Ya existe ese tratado.");
    }
  } else if (otype === "send_resources") {
    const amount = _get(params, "amount", C.SEND_DEFAULT);
    // isinstance(amount, (int, float)) and not bool  (typeof boolean != number en JS)
    if (typeof amount !== "number" || amount < C.SEND_MIN) {
      throw new OrderError(`El envío mínimo es ${S.money_str(C.SEND_MIN)}.`);
    }
    if (S.at_war(game, ent, other)) {
      throw new OrderError("No puedes enviar recursos a un país en guerra contigo.");
    }
  } else if (otype === "break") {
    const tk = _get(params, "treaty", null);
    if (tk !== null && tk !== undefined) {
      if (!["alliance", "nap", "trade"].includes(tk)) {
        throw new OrderError("Tipo de tratado desconocido.");
      }
      if (!S.has_treaty(game, tk, ent, other)) {
        throw new OrderError("No tienes ese tratado con ese país.");
      }
    } else if (!["alliance", "nap", "trade"].some((k) => S.has_treaty(game, k, ent, other))) {
      throw new OrderError("No tienes tratados con ese país.");
    }
  } else if (otype === "declare_war") {
    if (S.at_war(game, ent, other)) {
      throw new OrderError("Ya estás en guerra con ese país.");
    }
    if (S.has_treaty(game, "alliance", ent, other)) {
      throw new OrderError("Es tu aliado: rompe la alianza antes de declararle la guerra.");
    }
  } else if (otype === "peace") {
    if (!S.at_war(game, ent, other)) {
      throw new OrderError("No estás en guerra con ese país.");
    }
  }
}

export function _check_military(game, ent, otype, target, division_id) {
  const d = S.find_division(game, division_id || "");
  if (d === null || d === undefined) {
    throw new OrderError("División desconocida.");
  }
  if (d["owner"] !== ent) {
    throw new OrderError("Esa división no es tuya.");
  }
  for (const o of game["orders"]) {
    if (_get(o, "division_id", null) === d["id"] && _get(o, "owner", null) === ent) {
      throw new OrderError("Esa división ya tiene una orden este turno.");
    }
  }
  if (otype === "move" || otype === "attack") {
    if (!_has(game["countries"], target)) {
      throw new OrderError("Territorio objetivo desconocido.");
    }
    if (!S.is_adjacent(d["location"], target)) {
      throw new OrderError("El objetivo no es adyacente a la división.");
    }
    const town_owner = S.owner_of(game, target);
    const friends = new Set([ent, ...S.allies_of(game, ent)]);
    if (otype === "move") {
      if (target === d["location"]) {
        throw new OrderError("La división ya está allí.");
      }
      if (!friends.has(town_owner)) {
        throw new OrderError("Solo puedes mover divisiones a territorios propios o aliados.");
      }
    } else {
      if (town_owner === ent) {
        throw new OrderError("No puedes atacar tu propio territorio.");
      }
      if (friends.has(town_owner)) {
        throw new OrderError("No puedes atacar a un aliado.");
      }
      if (d["org"] < C.ORG_MIN_ATTACK) {
        throw new OrderError("La división tiene muy poca organización para atacar.");
      }
    }
  }
  return d;
}

export function _check_economy(game, ent, otype, params) {
  if (otype !== "project") {
    return;
  }
  const kind = _get(params, "kind", null);
  if (!_has(C.PROJECTS, kind)) {
    throw new OrderError("Tipo de proyecto desconocido.");
  }
  let active = 0;
  for (const p of game["projects"]) if (p["owner"] === ent) active += 1;
  let queued = 0;
  for (const o of game["orders"]) if (o["type"] === "project" && o["owner"] === ent) queued += 1;
  if (active + queued >= C.MAX_PROJECTS) {
    throw new OrderError(`Solo puedes tener ${C.MAX_PROJECTS} proyectos a la vez.`);
  }
}

export function queue_order(game, ent, otype, target = null, division_id = null, params = null) {
  // Valida, cobra y encola una orden. Lanza OrderError con un mensaje en espanol.
  if (target === undefined) target = null;
  if (division_id === undefined) division_id = null;
  params = { ...(params || {}) };
  if (game["ended"]) {
    throw new OrderError("La partida ha terminado.");
  }
  if (!ALL_TYPES.has(otype)) {
    throw new OrderError("Tipo de orden desconocido.");
  }
  if (TARGET_REQUIRED.has(otype) && !target) {
    throw new OrderError("Esta orden requiere un objetivo.");
  }
  let division = null;
  if (DIPLOMATIC.has(otype)) {
    _check_diplomacy(game, ent, otype, target, params);
    const other = S.owner_of(game, target);
    for (const o of game["orders"]) {
      if (o["owner"] === ent && o["type"] === otype && S.owner_of(game, o["target"]) === other) {
        throw new OrderError("Ya hay una orden igual pendiente para ese país.");
      }
    }
    if (otype === "send_resources") {
      params["amount"] = Number(_get(params, "amount", C.SEND_DEFAULT));
    }
  } else if (MILITARY.has(otype)) {
    division = _check_military(game, ent, otype, target, division_id);
  } else {
    _check_economy(game, ent, otype, params);
  }
  const cost = order_cost(otype, params);
  const home = game["countries"][ent];
  if (home["money"] + 1e-9 < cost) {
    throw new OrderError(`Fondos insuficientes: la orden cuesta ${S.money_str(cost)} y tienes ${S.money_str(home["money"])}.`);
  }
  home["money"] -= cost;
  const order = {
    id: S.next_id(game, "o"), type: otype, target: TARGET_REQUIRED.has(otype) ? target : null,
    division_id: division ? division["id"] : null, cost: cost, params: params,
    owner: ent, label: _label(game, otype, target, division, params),
  };
  game["orders"].push(order);
  return order;
}

export function delete_order(game, ent, order_id) {
  // Elimina una orden propia y reembolsa su coste.
  const orders = game["orders"];
  for (let i = 0; i < orders.length; i++) {
    const o = orders[i];
    if (o["id"] === order_id && o["owner"] === ent) {
      orders.splice(i, 1);
      game["countries"][ent]["money"] += o["cost"];
      return o;
    }
  }
  throw new OrderError("Orden no encontrada.");
}

// ---------------------------------------------------------------- resolucion civil
export function _apply_diplomatic(game, o, rng) {
  const ent = o["owner"];
  const other = S.owner_of(game, o["target"]);
  const t = o["type"];
  if (!S.is_alive(game, other) || other === ent) {
    return;
  }
  if (_has(TREATY_KIND, t)) {
    D.propose_treaty(game, TREATY_KIND[t], ent, other);
  } else if (t === "send_resources") {
    D.send_resources(game, ent, other, _get(o["params"], "amount", C.SEND_DEFAULT));
  } else if (t === "break") {
    D.break_treaties(game, ent, other, _get(o["params"], "treaty", null));
  } else if (t === "declare_war") {
    D.declare_war(game, ent, other, rng);
  } else if (t === "peace") {
    const [ok, why] = D.make_peace(game, ent, other);
    if (!ok && (game["player"] === ent || game["player"] === other)) {
      S.add_log(game, `${_name(game, other)} rechaza la paz: ${why}.`, "diplo");
    }
  }
}

export function _apply_economic(game, o) {
  const ent = o["owner"];
  const home = game["countries"][ent];
  const t = o["type"];
  if (t === "build") {
    home["industry"] += C.BUILD_INDUSTRY;
    home["production"] += C.BUILD_PRODUCTION;
  } else if (t === "stability") {
    // min(100.0, x): Python devuelve el primero salvo que x < 100.0
    const v = home["stability"] + C.STABILITY_GAIN;
    home["stability"] = v < 100.0 ? v : 100.0;
  } else if (t === "recruit") {
    E.add_forces(game, ent, C.RECRUIT_TROOPS, 0, 0);
  } else if (t === "tanks") {
    E.add_forces(game, ent, 0, C.TANKS_GAIN, 0);
  } else if (t === "planes") {
    E.add_forces(game, ent, 0, 0, C.PLANES_GAIN);
  } else if (t === "project") {
    const [name, cost, turns] = C.PROJECTS[o["params"]["kind"]];
    game["projects"].push({
      id: S.next_id(game, "p"), owner: ent, kind: o["params"]["kind"],
      name: name, turns_left: turns, total_turns: turns, cost: cost,
    });
  }
}

export function resolve_civil(game, orders, rng) {
  // Aplica ordenes diplomaticas y economicas (de jugador y de IA) en orden de emision.
  for (const o of orders) {
    if (DIPLOMATIC.has(o["type"]) && S.is_alive(game, o["owner"])) {
      _apply_diplomatic(game, o, rng);
    }
  }
  for (const o of orders) {
    if (ECONOMIC.has(o["type"]) && S.is_alive(game, o["owner"])) {
      _apply_economic(game, o);
    }
  }
}
