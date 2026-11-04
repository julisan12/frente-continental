"""Economia: ingresos, gastos, presupuesto, factores de estabilidad y proyectos."""
from __future__ import annotations

from typing import Dict, List

from . import constants as C
from . import state as S

Game = S.Game


def _stab_factor(c: dict) -> float:
    return C.STAB_BASE + c["stability"] / C.STAB_DIV


def trade_count(game: Game, ent: str) -> int:
    """Numero de tratados comerciales de la entidad (maximo 4 cuentan)."""
    n = sum(1 for t in game["treaties"] if t["type"] == "trade" and ent in (t["a"], t["b"]))
    return min(n, 4)


def income(game: Game, ent: str) -> float:
    """Ingreso por turno de la entidad: produccion de sus territorios x estabilidad x desarrollo."""
    home = game["countries"][ent]
    prod = 0.0
    for cid in S.territories_of(game, ent):
        c = game["countries"][cid]
        prod += c["production"] * (1.0 if cid == ent else C.OCCUPIED_YIELD)
    base = prod * _stab_factor(home) * (1 + home["development"] * C.DEV_BONUS)
    return base * (1 + C.TRADE_BONUS * trade_count(game, ent))


def expenses(game: Game, ent: str) -> float:
    """Mantenimiento de las divisiones de la entidad."""
    total = 0.0
    for d in S.divisions_of(game, ent):
        total += d["troops"] * C.UPKEEP_TROOP + d["tanks"] * C.UPKEEP_TANK + d["planes"] * C.UPKEEP_PLANE
    return total


def balance(game: Game, ent: str) -> float:
    """Ingreso menos gastos."""
    return income(game, ent) - expenses(game, ent)


def invest_pool(game: Game, ent: str) -> float:
    """Superavit invertible repartido por el presupuesto."""
    return max(0.0, balance(game, ent)) * C.BUDGET_SHARE


def gdp(game: Game, ent: str) -> float:
    """PIB aproximado."""
    return income(game, ent) * C.GDP_MULT


def stability_factors(game: Game, ent: str) -> List[Dict[str, float]]:
    """Lista [{label, value}] con el cambio de estabilidad esperado por turno."""
    home = game["countries"][ent]
    pool = invest_pool(game, ent)
    social = pool * home["budget"]["social"] / 100.0 / C.SOCIAL_COST_PER_POINT
    revert = 0.0
    if home["stability"] >= C.STAB_REVERT_MIN:
        # por debajo de STAB_REVERT_MIN no hay "retorno a la normalidad": el colapso es posible
        revert = (C.STAB_REVERT_TO - home["stability"]) * C.STAB_REVERT_RATE
    treaties = sum(1 for t in game["treaties"]
                   if t["type"] in ("alliance", "nap") and ent in (t["a"], t["b"]))
    wars = len(S.enemies_of(game, ent))
    out = [
        {"label": "Gasto social", "value": round(social, 2)},
        {"label": "Retorno a la normalidad", "value": round(revert, 2)},
        {"label": "Tratados y alianzas", "value": round(min(C.STAB_TREATY_CAP, treaties * C.STAB_TREATY_BONUS), 2)},
        {"label": "Guerras en curso", "value": round(-wars * C.STAB_WAR_PENALTY, 2)},
    ]
    return out


def add_forces(game: Game, ent: str, troops: float = 0, tanks: float = 0, planes: float = 0) -> None:
    """Agrega fuerzas a la division mas pequena de la entidad (o crea una)."""
    owned = [d for d in S.divisions_of(game, ent) if game["countries"][d["location"]]["owner"] == ent]
    if owned:
        d = min(owned, key=lambda x: S.raw_power(x["troops"], x["tanks"], x["planes"]))
        d["troops"] += troops
        d["tanks"] += tanks
        d["planes"] += planes
    else:
        places = S.territories_of(game, ent)
        if not places:
            return
        loc = ent if ent in places else places[0]
        n = len(S.divisions_of(game, ent)) + 1
        S.add_division(game, ent, loc, f"{n}ª División de Reserva", troops, tanks, planes, "defend")


def apply_budget(game: Game, ent: str) -> None:
    """Reparte el superavit invertible segun el presupuesto de la entidad."""
    home = game["countries"][ent]
    pool = invest_pool(game, ent)
    b = home["budget"]
    home["money"] -= pool
    add_forces(game, ent, troops=pool * b["army"] / 100.0 / C.RECRUIT_COST_PER_TROOP)
    home["infrastructure"] = min(100.0, home["infrastructure"] + pool * b["infrastructure"] / 100.0 / C.INFRA_COST_PER_POINT)
    ind = pool * b["industry"] / 100.0 / C.INDUSTRY_COST_PER_POINT
    home["industry"] += ind
    home["production"] = min(C.MAX_PRODUCTION * 3, home["production"] + ind * C.PRODUCTION_PER_INDUSTRY)


def economy_phase(game: Game) -> None:
    """Procesa la economia de todas las entidades vivas."""
    for ent in S.entities(game):
        home = game["countries"][ent]
        factors = stability_factors(game, ent)
        bal = balance(game, ent)
        home["money"] += bal
        apply_budget(game, ent)
        home["stability"] = max(0.0, min(100.0, home["stability"] + sum(f["value"] for f in factors)))
        if home["money"] < 0:
            home["money"] = 0.0
            home["stability"] = max(0.0, home["stability"] + C.NEGATIVE_MONEY_STABILITY)
            if ent == game["player"]:
                S.add_log(game, "Tesoro agotado: déficit presupuestario, estabilidad −8.", "econ")


def advance_projects(game: Game) -> None:
    """Avanza proyectos y aplica sus efectos al completarse."""
    remaining = []
    for p in game["projects"]:
        p["turns_left"] -= 1
        if p["turns_left"] > 0:
            remaining.append(p)
            continue
        ent = p["owner"]
        if not S.is_alive(game, ent):
            continue
        home = game["countries"][ent]
        effects = C.PROJECTS[p["kind"]][3]
        for k, v in effects.items():
            if k == "troops":
                add_forces(game, ent, troops=v)
            elif k in ("infrastructure", "stability"):
                home[k] = min(100.0, home[k] + v)
            else:
                home[k] = home[k] + v
        if ent == game["player"]:
            S.add_log(game, f"Proyecto completado: {p['name']}.", "econ")
    game["projects"] = remaining
