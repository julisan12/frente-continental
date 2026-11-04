"""Militar: movimientos, posturas, combate y conquista de territorios."""
from __future__ import annotations

from .rng import PortableRandom
from collections import defaultdict
from typing import Dict, List, Optional, Set, Tuple

from . import constants as C
from . import diplomacy as D
from . import state as S

Game = S.Game
Battle = Dict[str, object]


def _name(game: Game, ent: str) -> str:
    return S.display_name(game, ent)


# ---------------------------------------------------------------- calculo de fuerzas
def attack_strength(game: Game, divs: List[dict], target: str, rng: PortableRandom) -> float:
    """Fuerza de ataque total (con penalizacion maritima si no hay ruta terrestre)."""
    total = 0.0
    for d in divs:
        p = S.division_power(d)
        if S.is_sea_route(d["location"], target):
            p *= 1 - C.SEA_PENALTY
        own = S.owner_of(game, d["location"])
        if own != d["owner"] and own not in S.allies_of(game, d["owner"]):
            p *= C.SUPPLY_PENALTY  # fuera de suministro
        total += p
    lo, span = C.ATTACK_RANGE
    return total * C.ATTACK_FACTOR * (lo + rng.random() * span)


def defenders_at(game: Game, target: str, attacker: str) -> List[dict]:
    """Divisiones que defienden el territorio: del dueno y sus aliados (no aliados del atacante)."""
    owner = S.owner_of(game, target)
    friends = {owner, *S.allies_of(game, owner)}
    friends -= {attacker, *S.allies_of(game, attacker)}
    return [d for d in S.divisions_at(game, target) if d["owner"] in friends]


def is_enemy_border(game: Game, cid: str) -> bool:
    """True si el territorio linda con algun territorio de una entidad en guerra con su dueno."""
    owner = S.owner_of(game, cid)
    for nb in S.adjacency().get(cid, []):
        if nb in game["countries"] and S.at_war(game, owner, S.owner_of(game, nb)):
            return True
    return False


def has_front(game: Game, ent: str) -> bool:
    """True si la entidad tiene alguna division en postura 'front' (frente establecido)."""
    for d in S.divisions_of(game, ent):
        if d["stance"] == "front":
            return True
    return False


def defense_strength(game: Game, divs: List[dict], target: str, rng: PortableRandom) -> float:
    """Fuerza de defensa: divisiones con bonos de postura + milicia local + infraestructura.

    Frente establecido: si el dueno del territorio tiene alguna division en postura 'front'
    y el territorio es fronterizo con enemigos, sus divisiones defensoras ganan FRONT_BONUS.
    """
    rec = game["countries"][target]
    owner = rec["owner"]
    front = has_front(game, owner) and is_enemy_border(game, target)
    total = C.MILITIA_BASE + rec["infrastructure"] * C.MILITIA_INFRA
    for d in divs:
        mult = 1.0
        if d["stance"] == "defend":
            mult += C.DEFEND_BONUS
        if front and d["owner"] == owner:
            mult += C.FRONT_BONUS
        total += S.division_power(d) * mult
    if owner == target:
        total *= 1 + C.HOME_DEFENSE_BONUS  # defensa de la patria: el territorio de origen resiste mejor
    lo, span = C.DEFENSE_RANGE
    return total * C.DEFENSE_FACTOR * (lo + rng.random() * span) * (1 + rec["infrastructure"] * C.INFRA_DEF_BONUS)


# ---------------------------------------------------------------- perdidas y limpieza
def _scale(d: dict, fraction: float) -> int:
    """Reduce las fuerzas de una division; devuelve las tropas perdidas."""
    fraction = max(0.0, min(C.MAX_LOSS_FRACTION if fraction < 1 else 1.0, fraction))
    lost = d["troops"] * fraction
    d["troops"] -= lost
    d["tanks"] *= 1 - fraction
    d["planes"] *= 1 - fraction
    return lost


def purge_dead(game: Game) -> None:
    """Elimina divisiones aniquiladas y entidades sin territorios."""
    alive = set(S.entities(game))
    game["divisions"] = [d for d in game["divisions"]
                         if d["owner"] in alive and S.raw_power(d["troops"], d["tanks"], d["planes"]) >= 0.5]
    for ent in [c for c in game["countries"] if c not in alive]:
        _eliminate(game, ent)


def _eliminate(game: Game, ent: str) -> None:
    """Limpia tratados, guerras, proyectos y ordenes de una entidad sin territorios."""
    game["treaties"] = [t for t in game["treaties"] if ent not in (t["a"], t["b"])]
    game["wars"] = [w for w in game["wars"] if ent not in (w["a"], w["b"])]
    game["projects"] = [p for p in game["projects"] if p["owner"] != ent]
    game["orders"] = [o for o in game["orders"] if o.get("owner") != ent]
    done = game.setdefault("eliminated", {})
    if ent not in done:
        done[ent] = game["turn"]
        S.add_log(game, f"{_name(game, ent)} ha sido eliminado como potencia independiente.", "war")


# ---------------------------------------------------------------- conquista
def capture(game: Game, attacker: str, target: str) -> None:
    """Transfiere el territorio al atacante con botin economico."""
    rec = game["countries"][target]
    old_owner = rec["owner"]
    ind = rec["industry"] * C.CAPTURE_INDUSTRY
    prod = rec["production"] * C.CAPTURE_PRODUCTION
    rec["industry"] -= ind
    rec["production"] -= prod
    home = game["countries"][attacker]
    home["industry"] += ind
    home["production"] += prod
    if old_owner == target:
        loot = rec["money"] * C.CAPTURE_MONEY
        rec["money"] -= loot
        home["money"] += loot
    rec["owner"] = attacker
    home["stability"] = min(100.0, home["stability"] + C.CAPTURE_STAB_GAIN)
    game["countries"][old_owner]["stability"] = max(0.0, game["countries"][old_owner]["stability"] - C.CAPTURE_STAB_LOSS)
    S.add_rel(game, attacker, old_owner, -10)
    S.add_log(game, f"{_name(game, attacker)} conquista {_name(game, target)} (antes de {_name(game, old_owner)}).", "war")


def _retreat(game: Game, d: dict, lost_cid: str, attacker: str) -> None:
    """Hace retroceder a una division derrotada a un territorio amigo adyacente, o la aniquila."""
    friends = {d["owner"], *S.allies_of(game, d["owner"])}
    options = [n for n in sorted(S.adjacency().get(lost_cid, set()))
               if S.owner_of(game, n) in friends and S.owner_of(game, n) != attacker]
    if options:
        d["location"] = options[0]
        d["org"] = max(10, d["org"] - 20)
    else:
        d["troops"] = d["tanks"] = d["planes"] = 0.0


# ---------------------------------------------------------------- resolucion de un asalto
def resolve_assault(game: Game, attacker: str, target: str, divs: List[dict], rng: PortableRandom) -> Battle:
    """Resuelve el ataque combinado de `divs` contra `target`."""
    defender = S.owner_of(game, target)
    if not S.at_war(game, attacker, defender):
        D.declare_war(game, attacker, defender, rng, " al atacar su territorio")
    defs = defenders_at(game, target, attacker)
    att = attack_strength(game, divs, target, rng)
    dfn = defense_strength(game, defs, target, rng)
    won = att > dfn
    att_lost = def_lost = 0.0
    if won:
        frac = min(C.MAX_LOSS_FRACTION, C.WIN_LOSS * dfn / max(att, 0.01))
        for d in divs:
            att_lost += _scale(d, frac)
            d["org"] = max(0, d["org"] - C.ORG_ATTACK_COST)
        for d in defs:
            def_lost += d["troops"] * C.DEFEATED_DEF_LOSS
            _scale_full(d, C.DEFEATED_DEF_LOSS)
        capture(game, attacker, target)
        for d in defs:
            _retreat(game, d, target, attacker)
        for d in divs:
            d["location"] = target
            d["stance"] = "idle"
    else:
        frac_a = min(C.MAX_LOSS_FRACTION, C.LOSE_ATT_LOSS * dfn / max(att, 0.01))
        frac_d = min(C.MAX_LOSS_FRACTION, C.LOSE_DEF_LOSS * att / max(dfn, 0.01))
        for d in divs:
            att_lost += _scale(d, frac_a)
            d["org"] = max(0, d["org"] - C.ORG_LOSE_COST)
        for d in defs:
            def_lost += _scale(d, frac_d)
    war = S.find_war(game, attacker, defender)
    if war:
        war["last_combat"] = game["turn"]
    S.add_log(game, f"Batalla por {_name(game, target)}: {_name(game, attacker)} "
                    f"{'vence' if won else 'es rechazado'} ({att:.0f} contra {dfn:.0f}).", "war")
    return {"target": target, "target_name": _name(game, target), "attacker": attacker,
            "defender": defender, "attack": round(att, 1), "defense": round(dfn, 1), "won": won,
            "attacker_losses": round(att_lost, 1), "defender_losses": round(def_lost, 1),
            "captured": won}


def _scale_full(d: dict, fraction: float) -> None:
    """Pierde `fraction` de todas las fuerzas sin tope de perdida."""
    d["troops"] *= 1 - fraction
    d["tanks"] *= 1 - fraction
    d["planes"] *= 1 - fraction


# ---------------------------------------------------------------- resolucion de ordenes
def _valid_division(game: Game, order: dict) -> Optional[dict]:
    d = S.find_division(game, order.get("division_id", ""))
    if d is None or d["owner"] != order.get("owner"):
        return None
    return d


def resolve_stances(game: Game, orders: List[dict]) -> Set[str]:
    """Aplica defend/front/reorganize. Devuelve ids de divisiones que se reorganizan."""
    reorg: Set[str] = set()
    for o in orders:
        d = _valid_division(game, o)
        if d is None:
            continue
        if o["type"] == "defend":
            d["stance"] = "defend"
        elif o["type"] == "front":
            d["stance"] = "front"
        elif o["type"] == "reorganize":
            reorg.add(d["id"])
    return reorg


def resolve_moves(game: Game, orders: List[dict]) -> Set[str]:
    """Aplica los movimientos validos; devuelve ids de divisiones movidas."""
    moved: Set[str] = set()
    for o in orders:
        if o["type"] != "move":
            continue
        d = _valid_division(game, o)
        if d is None:
            continue
        tgt = o.get("target")
        if tgt not in game["countries"] or not S.is_adjacent(d["location"], tgt):
            continue
        town_owner = S.owner_of(game, tgt)
        if town_owner != d["owner"] and town_owner not in S.allies_of(game, d["owner"]):
            continue
        d["location"] = tgt
        d["stance"] = "idle"
        moved.add(d["id"])
    return moved


def resolve_attacks(game: Game, orders: List[dict], rng: PortableRandom) -> Tuple[List[Battle], Set[str]]:
    """Agrupa y resuelve los ataques. Devuelve (batallas, ids de atacantes)."""
    groups: Dict[Tuple[str, str], List[dict]] = defaultdict(list)
    for o in orders:
        if o["type"] != "attack":
            continue
        d = _valid_division(game, o)
        tgt = o.get("target")
        if d is None or tgt not in game["countries"] or d["org"] < C.ORG_MIN_ATTACK:
            continue
        if not S.is_adjacent(d["location"], tgt):
            continue
        defender = S.owner_of(game, tgt)
        att = d["owner"]
        if defender == att or defender in S.allies_of(game, att):
            continue
        groups[(att, tgt)].append(d)
    battles: List[Battle] = []
    attackers: Set[str] = set()
    for (att, tgt), divs in sorted(groups.items()):
        divs = [d for d in divs if S.raw_power(d["troops"], d["tanks"], d["planes"]) >= 0.5]
        if not divs or not S.is_alive(game, att):
            continue
        defender = S.owner_of(game, tgt)
        if defender == att or defender in S.allies_of(game, att):
            continue
        attackers.update(d["id"] for d in divs)
        battles.append(resolve_assault(game, att, tgt, divs, rng))
        purge_dead(game)
    return battles, attackers


def recover_org(game: Game, skip: Set[str], reorg: Set[str]) -> None:
    """Recupera organizacion segun la postura (excepto atacantes)."""
    for d in game["divisions"]:
        if d["id"] in skip:
            continue
        if d["id"] in reorg:
            gain = C.ORG_REORG
        elif d["stance"] == "defend" or d["stance"] == "front":
            gain = C.ORG_DEFEND
        else:
            gain = C.ORG_IDLE
        d["org"] = min(100, d["org"] + gain)


def resolve_military(game: Game, orders: List[dict], rng: PortableRandom) -> List[Battle]:
    """Fase militar completa: posturas, movimientos, ataques y recuperacion."""
    reorg = resolve_stances(game, orders)
    resolve_moves(game, orders)
    battles, attackers = resolve_attacks(game, orders, rng)
    recover_org(game, attackers, reorg)
    purge_dead(game)
    return battles
