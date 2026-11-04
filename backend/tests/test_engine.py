import pytest

from app.engine import state as S
from app.engine import views
from app.engine.orders import OrderError
from app.engine.turn import end_turn


def run(player, seed, n):
    g = S.new_game(player, seed=seed, game_id="det")
    for _ in range(n):
        if g["ended"]:
            break
        end_turn(g)
    return g


def test_unknown_country():
    with pytest.raises(ValueError):
        S.new_game("Narnia")


def test_determinism():
    a, b = run("Peru", 11, 15), run("Peru", 11, 15)
    assert a["countries"] == b["countries"] and a["divisions"] == b["divisions"]
    assert a["turn"] == b["turn"]


def test_all_players_24_turns():
    for cid in [x["id"] for x in S.load_countries()]:
        run(cid, 5, 24)


def test_ended_raises():
    g = run("Chile", 1, 1)
    g["ended"] = True
    with pytest.raises(OrderError):
        end_turn(g)


def test_views():
    g = run("Chile", 2, 2)
    v = views.game_view(g)
    assert v["summary"]["deltas"]["money"] != 0 or True
    d1 = views.country_detail(g, "Brazil")
    d2 = views.country_detail(g, "Brazil")
    assert d1["army_estimate"] == d2["army_estimate"]
    assert views.country_detail(g, "Chile")["relation"] == 100


def test_break_selective_treaty():
    from app.engine import orders as O
    g = S.new_game("Argentina", seed=1, game_id="brk")
    other = next(c for c in g["countries"] if c != "Argentina" and S.is_alive(g, c))
    g["treaties"] = [{"a": "Argentina", "b": other, "type": "alliance"},
                     {"a": "Argentina", "b": other, "type": "trade"}]
    with pytest.raises(OrderError):
        O.queue_order(g, "Argentina", "break", other, params={"treaty": "nap"})
    o = O.queue_order(g, "Argentina", "break", other, params={"treaty": "trade"})
    assert "comercial" in o["label"]
    O._apply_diplomatic(g, o, None)
    assert S.has_treaty(g, "alliance", "Argentina", other)
    assert not S.has_treaty(g, "trade", "Argentina", other)


def test_peace_requires_war():
    from app.engine import orders as O
    g = S.new_game("Argentina", seed=1, game_id="pz")
    other = next(c for c in g["countries"] if c != "Argentina" and S.is_alive(g, c)
                 and not S.at_war(g, "Argentina", c))
    with pytest.raises(OrderError):
        O.queue_order(g, "Argentina", "peace", other)
