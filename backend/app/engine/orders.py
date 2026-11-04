"""Ordenes: validacion, cola (con pago inmediato), reembolso y resolucion civil/diplomatica."""
from __future__ import annotations

from .rng import PortableRandom
from typing import Any, Dict, List, Optional

from . import constants as C
from . import diplomacy as D
from . import economy as E
from . import state as S

Game = S.Game

DIPLOMATIC = {"propose_alliance", "nap", "trade", "send_resources", "break", "declare_war", "peace"}
MILITARY = {"move", "attack", "defend", "reorganize", "front"}
ECONOMIC = {"build", "stability", "recruit", "tanks", "planes", "project"}
ALL_TYPES = DIPLOMATIC | MILITARY | ECONOMIC
DIVISION_ORDERS = MILITARY
TARGET_REQUIRED = DIPLOMATIC | {"move", "attack"}

TREATY_KIND = {"propose_alliance": "alliance", "nap": "nap", "trade": "trade"}


class OrderError(ValueError):
    """Error de validacion con mensaje en espanol."""


def _name(game: Game, cid: str) -> str:
    return S.display_name(game, cid)


# ---------------------------------------------------------------- costes y etiquetas
def order_cost(otype: str, params: Dict[str, Any]) -> float:
    """Coste en dinero de una orden."""
    if otype in C.ORDER_COSTS:
        return float(C.ORDER_COSTS[otype])
    if otype == "send_resources":
        return float(params.get("amount", C.SEND_DEFAULT))
    if otype == "project":
        return float(C.PROJECTS[params["kind"]][1])
    return 0.0


def _label(game: Game, otype: str, target: Optional[str], division: Optional[dict], params: Dict[str, Any]) -> str:
    tn = _name(game, target) if target in game["countries"] else ""
    dn = division["name"] if division else ""
    labels = {
        "propose_alliance": f"Proponer alianza a {tn}",
        "nap": f"Proponer pacto de no agresión a {tn}",
        "trade": f"Proponer tratado comercial a {tn}",
        "send_resources": f"Enviar {S.money_str(params.get('amount', 0))} a {tn}",
        "break": f"Romper tratados con {tn}",
        "declare_war": f"Declarar la guerra a {tn}",
        "peace": f"Proponer la paz a {tn}",
        "move": f"Mover {dn} a {tn}",
        "attack": f"Atacar {tn} con {dn}",
        "defend": f"{dn}: postura defensiva",
        "reorganize": f"{dn}: reorganizar",
        "front": f"{dn}: desplegar en el frente",
        "build": "Construir industria",
        "stability": "Programa de estabilidad",
        "recruit": "Reclutar tropas",
        "tanks": "Fabricar tanques",
        "planes": "Fabricar aviones",
    }
    if otype == "break" and params.get("treaty"):
        tname = {"alliance": "la alianza", "nap": "el pacto de no agresión", "trade": "el tratado comercial"}.get(params["treaty"], "los tratados")
        return f"Romper {tname} con {tn}"
    if otype == "project":
        return f"Proyecto: {C.PROJECTS[params['kind']][0]}"
    return labels[otype]


# ---------------------------------------------------------------- validacion
def _check_diplomacy(game: Game, ent: str, otype: str, target: str, params: Dict[str, Any]) -> None:
    if target not in game["countries"]:
        raise OrderError("País objetivo desconocido.")
    other = S.owner_of(game, target)
    if other == ent:
        raise OrderError("No puedes dirigir una acción diplomática a tu propio territorio.")
    if not S.is_alive(game, other):
        raise OrderError("Ese país ya no existe como potencia.")
    if otype in TREATY_KIND:
        kind = TREATY_KIND[otype]
        if S.at_war(game, ent, other):
            raise OrderError("No se pueden proponer tratados a un país en guerra.")
        if S.has_treaty(game, kind, ent, other):
            raise OrderError("Ya existe ese tratado.")
    elif otype == "send_resources":
        amount = params.get("amount", C.SEND_DEFAULT)
        if not isinstance(amount, (int, float)) or isinstance(amount, bool) or amount < C.SEND_MIN:
            raise OrderError(f"El envío mínimo es {S.money_str(C.SEND_MIN)}.")
        if S.at_war(game, ent, other):
            raise OrderError("No puedes enviar recursos a un país en guerra contigo.")
    elif otype == "break":
        tk = params.get("treaty")
        if tk is not None:
            if tk not in ("alliance", "nap", "trade"):
                raise OrderError("Tipo de tratado desconocido.")
            if not S.has_treaty(game, tk, ent, other):
                raise OrderError("No tienes ese tratado con ese país.")
        elif not any(S.has_treaty(game, k, ent, other) for k in ("alliance", "nap", "trade")):
            raise OrderError("No tienes tratados con ese país.")
    elif otype == "declare_war":
        if S.at_war(game, ent, other):
            raise OrderError("Ya estás en guerra con ese país.")
        if S.has_treaty(game, "alliance", ent, other):
            raise OrderError("Es tu aliado: rompe la alianza antes de declararle la guerra.")
    elif otype == "peace":
        if not S.at_war(game, ent, other):
            raise OrderError("No estás en guerra con ese país.")


def _check_military(game: Game, ent: str, otype: str, target: Optional[str], division_id: Optional[str]) -> dict:
    d = S.find_division(game, division_id or "")
    if d is None:
        raise OrderError("División desconocida.")
    if d["owner"] != ent:
        raise OrderError("Esa división no es tuya.")
    for o in game["orders"]:
        if o.get("division_id") == d["id"] and o.get("owner") == ent:
            raise OrderError("Esa división ya tiene una orden este turno.")
    if otype in ("move", "attack"):
        if target not in game["countries"]:
            raise OrderError("Territorio objetivo desconocido.")
        if not S.is_adjacent(d["location"], target):
            raise OrderError("El objetivo no es adyacente a la división.")
        town_owner = S.owner_of(game, target)
        friends = {ent, *S.allies_of(game, ent)}
        if otype == "move":
            if target == d["location"]:
                raise OrderError("La división ya está allí.")
            if town_owner not in friends:
                raise OrderError("Solo puedes mover divisiones a territorios propios o aliados.")
        else:
            if town_owner == ent:
                raise OrderError("No puedes atacar tu propio territorio.")
            if town_owner in friends:
                raise OrderError("No puedes atacar a un aliado.")
            if d["org"] < C.ORG_MIN_ATTACK:
                raise OrderError("La división tiene muy poca organización para atacar.")
    return d


def _check_economy(game: Game, ent: str, otype: str, params: Dict[str, Any]) -> None:
    if otype != "project":
        return
    kind = params.get("kind")
    if kind not in C.PROJECTS:
        raise OrderError("Tipo de proyecto desconocido.")
    active = sum(1 for p in game["projects"] if p["owner"] == ent)
    queued = sum(1 for o in game["orders"] if o["type"] == "project" and o["owner"] == ent)
    if active + queued >= C.MAX_PROJECTS:
        raise OrderError(f"Solo puedes tener {C.MAX_PROJECTS} proyectos a la vez.")


def queue_order(game: Game, ent: str, otype: str, target: Optional[str] = None,
                division_id: Optional[str] = None, params: Optional[Dict[str, Any]] = None) -> dict:
    """Valida, cobra y encola una orden. Lanza OrderError con un mensaje en espanol."""
    params = dict(params or {})
    if game.get("ended"):
        raise OrderError("La partida ha terminado.")
    if otype not in ALL_TYPES:
        raise OrderError("Tipo de orden desconocido.")
    if otype in TARGET_REQUIRED and not target:
        raise OrderError("Esta orden requiere un objetivo.")
    division = None
    if otype in DIPLOMATIC:
        _check_diplomacy(game, ent, otype, target, params)
        other = S.owner_of(game, target)
        for o in game["orders"]:
            if o["owner"] == ent and o["type"] == otype and S.owner_of(game, o["target"]) == other:
                raise OrderError("Ya hay una orden igual pendiente para ese país.")
        if otype == "send_resources":
            params["amount"] = float(params.get("amount", C.SEND_DEFAULT))
    elif otype in MILITARY:
        division = _check_military(game, ent, otype, target, division_id)
    else:
        _check_economy(game, ent, otype, params)
    cost = order_cost(otype, params)
    home = game["countries"][ent]
    if home["money"] + 1e-9 < cost:
        raise OrderError(f"Fondos insuficientes: la orden cuesta {S.money_str(cost)} y tienes {S.money_str(home['money'])}.")
    home["money"] -= cost
    order = {"id": S.next_id(game, "o"), "type": otype, "target": target if otype in TARGET_REQUIRED else None,
             "division_id": division["id"] if division else None, "cost": cost, "params": params,
             "owner": ent, "label": _label(game, otype, target, division, params)}
    game["orders"].append(order)
    return order


def delete_order(game: Game, ent: str, order_id: str) -> dict:
    """Elimina una orden propia y reembolsa su coste."""
    for o in game["orders"]:
        if o["id"] == order_id and o["owner"] == ent:
            game["orders"].remove(o)
            game["countries"][ent]["money"] += o["cost"]
            return o
    raise OrderError("Orden no encontrada.")


# ---------------------------------------------------------------- resolucion civil
def _apply_diplomatic(game: Game, o: dict, rng: PortableRandom) -> None:
    ent = o["owner"]
    other = S.owner_of(game, o["target"])
    t = o["type"]
    if not S.is_alive(game, other) or other == ent:
        return
    if t in TREATY_KIND:
        D.propose_treaty(game, TREATY_KIND[t], ent, other)
    elif t == "send_resources":
        D.send_resources(game, ent, other, o["params"].get("amount", C.SEND_DEFAULT))
    elif t == "break":
        D.break_treaties(game, ent, other, o["params"].get("treaty"))
    elif t == "declare_war":
        D.declare_war(game, ent, other, rng)
    elif t == "peace":
        ok, why = D.make_peace(game, ent, other)
        if not ok and game["player"] in (ent, other):
            S.add_log(game, f"{_name(game, other)} rechaza la paz: {why}.", "diplo")


def _apply_economic(game: Game, o: dict) -> None:
    ent = o["owner"]
    home = game["countries"][ent]
    t = o["type"]
    if t == "build":
        home["industry"] += C.BUILD_INDUSTRY
        home["production"] += C.BUILD_PRODUCTION
    elif t == "stability":
        home["stability"] = min(100.0, home["stability"] + C.STABILITY_GAIN)
    elif t == "recruit":
        E.add_forces(game, ent, troops=C.RECRUIT_TROOPS)
    elif t == "tanks":
        E.add_forces(game, ent, tanks=C.TANKS_GAIN)
    elif t == "planes":
        E.add_forces(game, ent, planes=C.PLANES_GAIN)
    elif t == "project":
        name, cost, turns, _ = C.PROJECTS[o["params"]["kind"]]
        game["projects"].append({"id": S.next_id(game, "p"), "owner": ent, "kind": o["params"]["kind"],
                                 "name": name, "turns_left": turns, "total_turns": turns, "cost": cost})


def resolve_civil(game: Game, orders: List[dict], rng: PortableRandom) -> None:
    """Aplica ordenes diplomaticas y economicas (de jugador y de IA) en orden de emision."""
    for o in orders:
        if o["type"] in DIPLOMATIC and S.is_alive(game, o["owner"]):
            _apply_diplomatic(game, o, rng)
    for o in orders:
        if o["type"] in ECONOMIC and S.is_alive(game, o["owner"]):
            _apply_economic(game, o)
