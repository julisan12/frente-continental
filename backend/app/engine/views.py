"""Vistas serializables de la partida para el cliente (con niebla de guerra)."""
from __future__ import annotations

import copy
import math
from typing import Any, Dict, List

from . import constants as C
from . import economy as E
from . import state as S

_HIDDEN = ("_turn_lines", "prev", "ai_memory")
_FORCES = ("army", "tanks", "planes")


def _friends(game: Dict[str, Any]) -> List[str]:
    """Jugador y sus aliados: ven datos exactos."""
    p = game["player"]
    return [p] + S.allies_of(game, p)


def _fog_factors(game: Dict[str, Any], key: str) -> List[float]:
    """Tres factores deterministas (por turno) de niebla de guerra: tropas, tanques, aviones."""
    rng = S.make_rng(game, "fog-" + key)
    lo, hi = C.FOG_RANGE
    return [rng.uniform(lo, hi), rng.uniform(lo, hi), rng.uniform(lo, hi)]


def _fog_country(game: Dict[str, Any], cid: str, c: Dict[str, Any]) -> None:
    """Oculta/perturba en `c` (copia del territorio cid) los datos que el jugador no conoce."""
    f = _fog_factors(game, cid)
    for i in range(3):
        k = _FORCES[i]
        c[k] = round(c.get(k, 0) * f[i], 1)
    c["money"] = None
    c["fog"] = True


def player_forces(game: Dict[str, Any], ent: str) -> Dict[str, float]:
    """Totales de las divisiones de la entidad (dondequiera que esten)."""
    t = k = a = 0.0
    for d in S.divisions_of(game, ent):
        t += d["troops"]
        k += d["tanks"]
        a += d["planes"]
    return {"troops": round(t, 1), "tanks": round(k, 1), "planes": round(a, 1)}


def threat_to(game: Dict[str, Any], src: str, dst: str) -> int:
    """Amenaza (0-100) que la entidad src supone para dst: poder relativo x hostilidad."""
    if src == dst or S.has_treaty(game, "alliance", src, dst):
        return 0
    ratio = S.entity_power(game, src) / max(1.0, S.entity_power(game, dst))
    if S.at_war(game, src, dst):
        hostility = 1.0
    else:
        rel = S.get_rel(game, src, dst)
        hostility = (C.THREAT_REL_ZERO - rel) / float(C.THREAT_REL_SPAN)
        hostility = max(0.0, min(1.0, hostility))
        if S.has_treaty(game, "nap", src, dst):
            hostility *= C.THREAT_NAP_FACTOR
    value = ratio * hostility * C.THREAT_SCALE
    return int(min(100.0, math.floor(value + 0.5)))


def game_view(game: Dict[str, Any]) -> Dict[str, Any]:
    view = {k: copy.deepcopy(v) for k, v in game.items() if k not in _HIDDEN}
    friends = _friends(game)
    for cid, c in view.get("countries", {}).items():
        c.pop("path", None)
        if c["owner"] not in friends:
            _fog_country(game, cid, c)
    view["divisions"] = [d for d in view.get("divisions", []) if d["owner"] in friends]
    p = game["player"]
    d = {"money": 0, "stability": 0, "industry": 0}
    last = game.get("last_deltas")
    if last:
        for k in d:
            d[k] = last.get(k, 0)
    view.pop("last_deltas", None)
    view["summary"] = {"income": E.income(game, p), "expenses": E.expenses(game, p),
                       "balance": E.balance(game, p), "deltas": d,
                       "forces": player_forces(game, p)}
    from .turn import compute_scores
    top = sorted(compute_scores(game).items(), key=lambda kv: -kv[1])[:5]
    view["ranking"] = [{"id": e, "name": S.display_name(game, e), "score": round(v, 1)} for e, v in top]
    view["max_turns"] = C.MAX_TURNS
    return view


def country_detail(game: Dict[str, Any], cid: str) -> Dict[str, Any]:
    if cid not in game["countries"]:
        raise ValueError("País desconocido.")
    c = copy.deepcopy(game["countries"][cid])
    c.pop("path", None)
    p = game["player"]
    owner = S.owner_of(game, cid)
    friends = _friends(game)
    if owner not in friends:
        _fog_country(game, cid, c)
    c["income"] = E.income(game, owner)
    c["expenses"] = E.expenses(game, owner)
    c["balance"] = E.balance(game, owner)
    c["gdp"] = E.gdp(game, owner)
    c["threat"] = threat_to(game, owner, p)
    c["relation"] = 100 if owner == p else S.get_rel(game, p, owner)
    c["allies"] = S.allies_of(game, owner)
    c["enemies"] = S.enemies_of(game, owner)
    est = player_forces(game, owner)
    if owner not in friends:
        f = _fog_factors(game, "ent-" + owner)
        est = {"troops": round(est["troops"] * f[0], 1), "tanks": round(est["tanks"] * f[1], 1),
               "planes": round(est["planes"] * f[2], 1)}
    c["army_estimate"] = est
    c["stability_factors"] = [dict(f, name=f["label"]) for f in E.stability_factors(game, owner)]
    oc = game["countries"][owner]
    ind = float(oc.get("industry", 0))
    prod = float(oc.get("production", 0))
    c["sector_output"] = {"industry": round(ind, 1), "agriculture": round(prod * 0.6, 1),
                          "services": round((ind + prod) * 0.4, 1)}
    return c
