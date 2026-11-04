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
