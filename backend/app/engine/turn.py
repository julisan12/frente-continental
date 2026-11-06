"""Resolucion de un turno completo (1 mes)."""
from __future__ import annotations

from typing import Dict

from . import constants as C
from . import diplomacy as D
from . import economy as E
from . import events as EV
from . import military as M
from . import state as S
from .ai import generate_ai_orders
from .orders import OrderError, resolve_civil

Game = S.Game


def _snapshot(game: Game) -> Dict[str, float]:
    c = game["countries"][game["player"]]
    return {"money": c["money"], "stability": c["stability"], "industry": c["industry"]}


def compute_scores(game: Game) -> Dict[str, float]:
    return {e: len(S.territories_of(game, e)) * 10 + game["countries"][e]["industry"]
            for e in S.entities(game) if S.is_alive(game, e)}


scores = compute_scores


def _econ_state(game: Game):
    """(industria propia, industria del mejor rival, cumple liderazgo)."""
    player = game["player"]
    mine = game["countries"][player]["industry"]
    rivals = [game["countries"][e]["industry"] for e in S.entities(game)
              if e != player and S.is_alive(game, e)]
    best = max(rivals) if rivals else 0
    return mine, best, bool(S.is_alive(game, player) and mine >= best * C.ECON_LEAD_RATIO)


def _diplo_state(game: Game):
    """(aliados vivos, otros paises vivos, cumple hegemonia diplomatica)."""
    player = game["player"]
    others = [e for e in S.entities(game) if e != player and S.is_alive(game, e)]
    allies = [a for a in S.allies_of(game, player) if a in others]
    ok = bool(S.is_alive(game, player) and others and len(allies) >= len(others) * C.DIPLO_ALLY_SHARE)
    return len(allies), len(others), ok


def update_streaks(game: Game) -> None:
    st = game.setdefault("streaks", {"econ": 0, "diplo": 0})
    st["econ"] = st.get("econ", 0) + 1 if _econ_state(game)[2] else 0
    st["diplo"] = st.get("diplo", 0) + 1 if _diplo_state(game)[2] else 0


def victory_progress(game: Game) -> dict:
    """Progreso hacia cada tipo de victoria (para la vista)."""
    player = game["player"]
    st = game.get("streaks") or {}
    own = len(S.territories_of(game, player))
    target = S.victory_target()
    mine, best, _ = _econ_state(game)
    na, no, _ = _diplo_state(game)
    sc = compute_scores(game)
    rank = 1 + sum(1 for e, v in sc.items() if e != player and v > sc.get(player, 0))
    return {
        "conquest": {"own": own, "target": target},
        "economic": {"mine": round(mine, 1), "best_rival": round(best, 1),
                     "ratio": C.ECON_LEAD_RATIO, "streak": st.get("econ", 0), "need": C.ECON_WIN_TURNS},
        "diplomatic": {"allies": na, "others": no, "share": C.DIPLO_ALLY_SHARE,
                       "streak": st.get("diplo", 0), "need": C.DIPLO_WIN_TURNS},
        "survival": {"turn": game["turn"], "max_turns": C.MAX_TURNS,
                     "score": round(sc.get(player, 0), 1), "rank": rank},
    }


def _check_end(game: Game) -> None:
    player = game["player"]
    own = len(S.territories_of(game, player))
    zst = game.setdefault("zero_stability_turns", {})
    if own >= S.victory_target():
        game.update(ended=True, winner=player, result="victory",
                    loss_reason=None, victory_type="conquest")
        S.add_log(game, f"¡Victoria! Controlas {own} territorios del continente.", "victory")
        return
    if own == 0 or not S.is_alive(game, player):
        game.update(ended=True, result="defeat", loss_reason="Tu nación ha sido ocupada.")
    elif zst.get(player, 0) >= C.ZERO_STABILITY_LOSS_TURNS:
        game.update(ended=True, result="defeat",
                    loss_reason="El gobierno colapsó tras meses de inestabilidad total.")
    if game.get("ended"):
        S.add_log(game, f"Derrota: {game['loss_reason']}", "defeat")
        return
    for ent in S.entities(game):
        if ent != player and S.is_alive(game, ent) and len(S.territories_of(game, ent)) >= S.victory_target():
            game.update(ended=True, winner=ent, result="defeat",
                        loss_reason=f"{S.display_name(game, ent)} domina el continente.")
            S.add_log(game, f"Derrota: {game['loss_reason']}", "defeat")
            return
    st = game.get("streaks") or {}
    if st.get("econ", 0) >= C.ECON_WIN_TURNS:
        game.update(ended=True, winner=player, result="victory", loss_reason=None,
                    victory_type="economic")
        S.add_log(game, "¡Victoria económica! Tu nación domina la economía del continente.", "victory")
        return
    if st.get("diplo", 0) >= C.DIPLO_WIN_TURNS:
        game.update(ended=True, winner=player, result="victory", loss_reason=None,
                    victory_type="diplomatic")
        S.add_log(game, "¡Victoria diplomática! Lideras un bloque que abarca el continente.", "victory")
        return
    if game["turn"] >= C.MAX_TURNS:
        scores = compute_scores(game)
        best = max(scores, key=scores.get)
        # empate favorece al jugador, intencional
        if best == player or scores.get(player, 0) >= scores[best]:
            game.update(ended=True, winner=player, result="victory", loss_reason=None,
                        victory_type="survival")
            S.add_log(game, "¡Victoria por supremacía! Al cabo de 10 años lideras el continente.", "victory")
        else:
            # sin dominador: la nacion sobrevive a la Guerra Fria (tablas, no derrota)
            game.update(ended=True, result="draw", winner=best,
                        loss_reason=f"{S.display_name(game, best)} lidera el continente tras 10 años, "
                                    "pero tu nación sobrevive a la Guerra Fría.")
            S.add_log(game, f"Fin de la partida: {game['loss_reason']}", "info")


def end_turn(game: Game) -> dict:
    """Resuelve el turno actual y devuelve el informe {turn, lines, battles}."""
    if game.get("ended"):
        raise OrderError("La partida ha terminado.")
    if game.get("active_event"):
        try:
            EV.apply_choice(game, 0)
        except OrderError:
            game["active_event"] = None
    turn = game["turn"]
    before = _snapshot(game)
    game["_turn_lines"] = []

    generate_ai_orders(game)
    orders = list(game["orders"])
    resolve_civil(game, orders, S.make_rng(game, "civil"))
    battles = M.resolve_military(game, orders, S.make_rng(game, "war"))
    M.purge_dead(game)
    S.sync_armies(game)

    E.economy_phase(game)
    E.advance_projects(game)
    D.auto_ceasefire(game)
    D.relation_drift(game)
    EV.roll_events(game)
    # el reclutamiento pasivo, los proyectos y los eventos agregan fuerzas tras la fase militar
    S.sync_armies(game)

    zst = game.setdefault("zero_stability_turns", {})
    for ent in S.entities(game):
        c = game["countries"].get(ent)
        if c is None:
            continue
        zst[ent] = zst.get(ent, 0) + 1 if c["stability"] <= 0 else 0

    update_streaks(game)
    _check_end(game)
    after = _snapshot(game)
    game["last_deltas"] = {k: round(after[k] - before[k], 2) for k in ("money", "stability", "industry")}
    game["orders"] = []
    if not game.get("ended"):
        game["turn"] = turn + 1
        game["date"] = S.date_for_turn(game["turn"])
    lines = game.pop("_turn_lines", [])
    report = {"turn": turn, "lines": lines, "battles": battles}
    game["last_report"] = report
    return report
