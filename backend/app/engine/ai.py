"""IA de los paises no controlados por el jugador: economia, diplomacia y operaciones militares."""
from __future__ import annotations

from typing import Dict, List, Optional

from . import constants as C
from . import economy as E
from . import state as S
from .orders import OrderError, queue_order

Game = S.Game


def _try(game: Game, ent: str, otype: str, target: Optional[str] = None,
         division_id: Optional[str] = None, params: Optional[dict] = None) -> bool:
    try:
        queue_order(game, ent, otype, target=target, division_id=division_id, params=params)
        return True
    except OrderError:
        return False


def _memory(game: Game, ent: str) -> dict:
    mem = game.setdefault("ai_memory", {})
    return mem.setdefault(ent, {"last_attack": -99})


def _neighbor_owners(game: Game, ent: str) -> Dict[str, str]:
    """owner -> un territorio fronterizo de ese owner."""
    adj = S.adjacency()
    out: Dict[str, str] = {}
    for t in S.territories_of(game, ent):
        for nb in adj.get(t, []):
            if nb not in game["countries"]:
                continue
            o = S.owner_of(game, nb)
            if o != ent and S.is_alive(game, o):
                out.setdefault(o, nb)
    return out


def _threat(game: Game, ent: str) -> float:
    """Poder enemigo vecino relativo al propio."""
    mine = max(1.0, S.entity_power(game, ent))
    hostile = 0.0
    for o in _neighbor_owners(game, ent):
        if S.at_war(game, ent, o) or S.get_rel(game, ent, o) <= C.AI_HOSTILE_REL:
            hostile += S.entity_power(game, o)
    return hostile / mine


def _economy(game: Game, ent: str, rng) -> None:
    c = game["countries"][ent]
    bal = E.balance(game, ent)
    threat = _threat(game, ent)
    if c["stability"] < C.AI_MIN_STABILITY:
        _try(game, ent, "stability")
    if threat > 0.9 or S.enemies_of(game, ent):
        for t in ("recruit", "tanks", "planes"):
            if c["money"] > C.ORDER_COSTS[t] * 1.5:
                _try(game, ent, t)
    if bal > C.AI_MIN_BALANCE and c["money"] > C.ORDER_COSTS["build"] * 2:
        _try(game, ent, "build")
    if c["money"] > 400 and rng.random() < 0.3:
        kind = rng.choice(list(C.PROJECTS))
        if c["money"] > C.PROJECTS[kind][1] * 2:
            _try(game, ent, "project", target=ent, params={"kind": kind})
    if c["money"] > 300 and rng.random() < 0.35:
        _try(game, ent, "recruit")


def _diplomacy(game: Game, ent: str, rng) -> None:
    for o, terr in _neighbor_owners(game, ent).items():
        if S.at_war(game, ent, o):
            continue
        rel = S.get_rel(game, ent, o)
        if rel >= C.ALLIANCE_MIN_REL and not S.has_treaty(game, "alliance", ent, o) and rng.random() < 0.25:
            _try(game, ent, "propose_alliance", target=terr)
        elif rel >= C.TRADE_MIN_REL and not S.has_treaty(game, "trade", ent, o) and rng.random() < 0.3:
            _try(game, ent, "trade", target=terr)
        elif rel >= C.NAP_MIN_REL and not S.has_treaty(game, "nap", ent, o) and rng.random() < 0.2:
            _try(game, ent, "nap", target=terr)


def _peace(game: Game, ent: str) -> None:
    mine = S.entity_power(game, ent)
    for foe in S.enemies_of(game, ent):
        if S.entity_power(game, foe) > mine * 1.2 or game["countries"][ent]["stability"] < 30:
            terr = S.territories_of(game, foe)
            if terr:
                _try(game, ent, "peace", target=terr[0])


def _offensive(game: Game, ent: str, rng) -> None:
    if game["turn"] < C.AI_START_TURN:
        return
    c = game["countries"][ent]
    mem = _memory(game, ent)
    mine = S.entity_power(game, ent)
    aggressive = S.is_aggressive(game, ent)
    targets = []
    for o, terr in _neighbor_owners(game, ent).items():
        if S.has_treaty(game, "alliance", ent, o):
            continue
        theirs = max(1.0, S.entity_power(game, o))
        if (aggressive and game["turn"] >= C.AI_GRUDGE_START and theirs < mine * C.AI_WEAK_RATIO
                and not S.has_treaty(game, "nap", ent, o)):
            S.add_rel(game, ent, o, -C.AI_GRUDGE)
        at_war = S.at_war(game, ent, o)
        willing = (mine > theirs * C.AI_OFFENSIVE_RATIO and S.get_rel(game, ent, o) < C.AI_HOSTILE_REL
                   and c["stability"] > C.AI_MIN_STABILITY
                   and game["turn"] - mem["last_attack"] >= C.AI_ATTACK_COOLDOWN)
        if at_war and mine >= theirs * 0.9:
            targets.append(o)
        elif willing and not S.has_treaty(game, "nap", ent, o):
            targets.append(o)
    if not targets:
        return
    adj = S.adjacency()
    ready = [d for d in S.divisions_of(game, ent) if d["org"] >= C.ORG_MIN_ATTACK]
    busy = {o.get("division_id") for o in game["orders"] if o.get("owner") == ent}
    # agrupa divisiones por territorio objetivo adyacente
    groups: Dict[str, List[dict]] = {}
    for d in ready:
        if d["id"] in busy:
            continue
        for nb in adj.get(d["location"], []):
            if nb in game["countries"] and S.owner_of(game, nb) in targets:
                groups.setdefault(nb, []).append(d)
    used = set()
    launched = False
    order = sorted(groups, key=lambda t: sum(S.division_power(x) for x in S.divisions_at(game, t)))
    for nb in order:
        foe = S.owner_of(game, nb)
        defense = sum(S.division_power(x) for x in S.divisions_at(game, nb))
        divs = [d for d in groups[nb] if d["id"] not in used]
        divs.sort(key=S.division_power, reverse=True)
        chosen, total = [], 0.0
        for d in divs:
            chosen.append(d)
            total += S.division_power(d)
            if total >= defense * C.AI_ATTACK_MARGIN:
                break
        if not chosen or (total < defense * C.AI_ATTACK_MARGIN and not S.at_war(game, ent, foe)):
            continue
        for d in chosen:
            if _try(game, ent, "attack", target=nb, division_id=d["id"]):
                used.add(d["id"])
                launched = True
    if launched:
        mem["last_attack"] = game["turn"]
    _reposition(game, ent, targets, used)


def _reposition(game: Game, ent: str, targets: List[str], used: set) -> None:
    """Mueve divisiones ociosas hacia la frontera con los objetivos."""
    adj = S.adjacency()
    tset = set(targets)
    own = set(S.territories_of(game, ent))
    border = {t for t in own if any(nb in game["countries"] and S.owner_of(game, nb) in tset
                                     for nb in adj.get(t, []))}
    if not border:
        return
    busy = {o.get("division_id") for o in game["orders"] if o.get("owner") == ent}
    for d in S.divisions_of(game, ent):
        if d["id"] in busy or d["id"] in used or d["location"] in border:
            continue
        # BFS por territorios propios hasta la frontera
        prev = {d["location"]: None}
        queue = [d["location"]]
        goal = None
        while queue and goal is None:
            cur = queue.pop(0)
            for nb in adj.get(cur, []):
                if nb in prev or nb not in own:
                    continue
                prev[nb] = cur
                if nb in border:
                    goal = nb
                    break
                queue.append(nb)
        if goal is None:
            continue
        step = goal
        while prev[step] != d["location"]:
            step = prev[step]
        _try(game, ent, "move", target=step, division_id=d["id"])


def _defensive(game: Game, ent: str) -> None:
    busy = {o.get("division_id") for o in game["orders"] if o.get("owner") == ent}
    adj = S.adjacency()
    enemies = set(S.enemies_of(game, ent))
    for d in S.divisions_of(game, ent):
        if d["id"] in busy:
            continue
        if d["org"] < C.ORG_REORG:
            _try(game, ent, "reorganize", division_id=d["id"])
            continue
        threatened = any(nb in game["countries"] and S.owner_of(game, nb) in enemies
                         for nb in adj.get(d["location"], []))
        if threatened and d.get("stance") != "defend":
            _try(game, ent, "defend", division_id=d["id"])


def generate_ai_orders(game: Game) -> None:
    """Genera las ordenes de todas las entidades IA vivas."""
    for ent in S.entities(game):
        if ent == game["player"] or not S.is_alive(game, ent):
            continue
        rng = S.make_rng(game, f"ai-{ent}")
        try:
            _peace(game, ent)
            _offensive(game, ent, rng)
            _defensive(game, ent)
            _diplomacy(game, ent, rng)
            _economy(game, ent, rng)
        except OrderError:
            pass
