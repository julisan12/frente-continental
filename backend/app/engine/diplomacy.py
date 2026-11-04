"""Diplomacia: tratados, guerras, envios de recursos y paz (entre entidades)."""
from __future__ import annotations

from .rng import PortableRandom
from typing import Optional, Tuple

from . import constants as C
from . import state as S

Game = S.Game


def _name(game: Game, ent: str) -> str:
    return S.display_name(game, ent)


def _allied_conflict(game: Game, a: str, b: str) -> bool:
    """True si a esta en guerra con un aliado de b, o b con un aliado de a."""
    for ally in S.allies_of(game, b):
        if S.at_war(game, a, ally):
            return True
    for ally in S.allies_of(game, a):
        if S.at_war(game, b, ally):
            return True
    return False


def evaluate_treaty(game: Game, kind: str, a: str, b: str) -> Tuple[bool, str]:
    """Decide si b acepta un tratado propuesto por a. Devuelve (aceptado, motivo)."""
    rel = S.get_rel(game, a, b)
    if S.at_war(game, a, b):
        return False, "están en guerra"
    if kind == "alliance":
        if rel < C.ALLIANCE_MIN_REL:
            return False, "la relación es insuficiente"
        if _allied_conflict(game, a, b):
            return False, "está en guerra con un aliado del proponente"
    elif kind == "nap":
        if rel < C.NAP_MIN_REL:
            return False, "la relación es demasiado baja"
    elif kind == "trade":
        if rel < C.TRADE_MIN_REL:
            return False, "la relación es insuficiente"
    return True, ""


def propose_treaty(game: Game, kind: str, a: str, b: str) -> bool:
    """Intenta firmar un tratado; registra el resultado si involucra al jugador."""
    if S.has_treaty(game, kind, a, b):
        return False
    label = {"alliance": "alianza", "nap": "pacto de no agresión", "trade": "tratado comercial"}[kind]
    if b == game["player"] and a != game["player"]:
        # La IA no firma tratados en nombre del jugador: solo le ofrece el acuerdo (cada 6 turnos como mucho).
        if evaluate_treaty(game, kind, a, b)[0]:
            offers = game.setdefault("offers", {})
            key = f"{kind}|{a}"
            if game["turn"] - offers.get(key, -99) >= 6:
                offers[key] = game["turn"]
                S.add_log(game, f"{_name(game, a)} te ofrece {'una' if kind == 'alliance' else 'un'} {label}. "
                                f"Si te interesa, propónselo tú desde Diplomacia.", "diplo")
        return False
    ok, why = evaluate_treaty(game, kind, a, b)
    involves = game["player"] in (a, b)
    if ok:
        game["treaties"].append({"type": kind, "a": a, "b": b, "since_turn": game["turn"]})
        S.add_rel(game, a, b, 8)
        if involves or kind == "alliance":
            S.add_log(game, f"{_name(game, a)} y {_name(game, b)} firman {'una' if kind == 'alliance' else 'un'} {label}.", "diplo")
    elif involves:
        S.add_log(game, f"{_name(game, b)} rechaza la propuesta de {label}: {why}.", "diplo")
    return ok


def send_resources(game: Game, actor: str, target: str, amount: float) -> None:
    """Transfiere dinero al objetivo y mejora la relacion."""
    src = game["countries"][actor]
    dst = game["countries"][target]
    amount = min(amount, max(0.0, src["money"] + amount))  # el coste ya fue pagado en la cola
    dst["money"] += amount
    S.add_rel(game, actor, target, min(10, amount / 20.0))
    if game["player"] in (actor, target):
        S.add_log(game, f"{_name(game, actor)} envía {S.money_str(amount)} a {_name(game, target)}.", "diplo")


def relation_drift(game: Game) -> None:
    """Deriva de relaciones: +1 con tratado comercial, si no 1 punto hacia 0 (salvo guerra)."""
    for key, v in list(game["relations"].items()):
        a, _, b = key.partition("|")
        if S.has_treaty(game, "trade", a, b):
            game["relations"][key] = min(100, v + 1)
        elif v and not S.at_war(game, a, b) and not any(
                {t["a"], t["b"]} == {a, b} for t in game["treaties"]):
            game["relations"][key] = v - 1 if v > 0 else v + 1


def break_treaties(game: Game, actor: str, target: str, kind: Optional[str] = None) -> int:
    """Rompe tratados entre actor y target con penalizaciones (todos, o solo los de tipo `kind`)."""
    if kind in ("alliance", "nap", "trade"):
        n = S.remove_treaties(game, actor, target, [kind])
    else:
        n = S.remove_treaties(game, actor, target)
    if n:
        game["countries"][actor]["stability"] = max(0.0, game["countries"][actor]["stability"] - C.BREAK_STAB)
        S.add_rel(game, actor, target, -C.BREAK_REL)
        S.add_log(game, f"{_name(game, actor)} rompe sus tratados con {_name(game, target)}.", "diplo")
    return n


def declare_war(game: Game, actor: str, target: str, rng: PortableRandom, reason: str = "") -> bool:
    """Declara la guerra: estabilidad, relaciones y posible entrada de aliados del objetivo."""
    if actor == target or S.at_war(game, actor, target):
        return False
    home = game["countries"][actor]
    penalty = C.WAR_STAB
    if S.has_treaty(game, "nap", actor, target):
        penalty += C.BREAK_NAP_STAB
        S.add_log(game, f"{_name(game, actor)} rompe un pacto de no agresión con {_name(game, target)}.", "diplo")
    home["stability"] = max(0.0, home["stability"] - penalty)
    S.remove_treaties(game, actor, target)
    S.add_rel(game, actor, target, -C.WAR_REL)
    game["wars"].append({"a": actor, "b": target, "since_turn": game["turn"], "last_combat": game["turn"]})
    S.add_log(game, f"{_name(game, actor)} declara la guerra a {_name(game, target)}{reason}.", "war")
    for ally in S.allies_of(game, target):
        _ally_joins(game, ally, actor, rng)
    return True


def _ally_joins(game: Game, ally: str, enemy: str, rng: PortableRandom) -> None:
    """Un aliado del atacado puede unirse a la guerra."""
    if ally == enemy or S.at_war(game, ally, enemy) or S.has_treaty(game, "alliance", ally, enemy):
        return
    if S.has_treaty(game, "nap", ally, enemy) or rng.random() > 0.5:
        return
    game["wars"].append({"a": ally, "b": enemy, "since_turn": game["turn"], "last_combat": game["turn"]})
    S.remove_treaties(game, ally, enemy)
    S.add_rel(game, ally, enemy, -C.WAR_REL)
    S.add_log(game, f"{_name(game, ally)} entra en la guerra contra {_name(game, enemy)} en defensa de su aliado.", "war")


def make_peace(game: Game, a: str, b: str, forced: bool = False) -> Tuple[bool, str]:
    """Propone la paz; se acepta si la guerra tiene edad y no hubo combates recientes."""
    war = S.find_war(game, a, b)
    if war is None:
        return False, "no están en guerra"
    if not forced:
        if game["turn"] - war["since_turn"] < C.PEACE_MIN_AGE:
            return False, "la guerra es demasiado reciente"
        if game["turn"] - war.get("last_combat", war["since_turn"]) < 2:
            return False, "aún hay combates en curso"
    game["wars"].remove(war)
    S.add_rel(game, a, b, 10)
    S.add_log(game, f"{_name(game, a)} y {_name(game, b)} firman la paz.", "diplo")
    return True, ""


def auto_ceasefire(game: Game) -> None:
    """Termina guerras sin combates durante varios turnos."""
    for w in list(game["wars"]):
        if game["turn"] - w.get("last_combat", w["since_turn"]) >= C.CEASEFIRE_IDLE_TURNS:
            make_peace(game, w["a"], w["b"], forced=True)
