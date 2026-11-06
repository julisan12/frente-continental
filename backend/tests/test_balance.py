from app.engine import constants as C
from app.engine import state as S
from app.engine.turn import end_turn

PLAYERS = ["Argentina", "Peru", "Brasil", "Chile", "Colombia", "Venezuela"]


def _play(player, seed):
    g = S.new_game(player, seed=seed, game_id="bal")
    while not g["ended"] and g["turn"] <= C.MAX_TURNS:
        end_turn(g)
    return g


def test_balance_passive_games():
    ids = {x["id"] for x in S.load_countries()}
    players = [p for p in PLAYERS if p in ids] or sorted(ids)[:6]
    durations = []
    for i, p in enumerate(players):
        g = _play(p, 100 + i)
        assert g["ended"], p
        assert g["turn"] <= C.MAX_TURNS
        durations.append(g["turn"])
    assert sum(durations) / len(durations) >= 10, durations


def test_duracion_y_progreso_victoria():
    from app.engine.views import game_view
    assert C.MAX_TURNS == 128
    g = S.new_game("Argentina", seed=7, game_id="vp")
    end_turn(g)
    vp = game_view(g)["victory_progress"]
    for k in ("conquest", "economic", "diplomatic", "survival"):
        assert k in vp
    assert set(g["streaks"]) == {"econ", "diplo"}


def test_fin_de_partida_con_tipo_de_victoria():
    g = _play("Argentina", 5)
    assert g["ended"]
    if g.get("victory_type"):
        assert g["victory_type"] in ("conquest", "economic", "diplomatic", "survival")
