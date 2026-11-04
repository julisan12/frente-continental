"""Pruebas de los huecos de auditoria (sync de ejercitos, amenaza, niebla, deltas, frente, estabilidad)."""
from app.engine import constants as C
from app.engine import economy as E
from app.engine import military as M
from app.engine import state as S
from app.engine import views
from app.engine.rng import PortableRandom
from app.engine.turn import end_turn


def _troops_at(g, cid):
    return round(sum(d["troops"] for d in g["divisions"] if d["location"] == cid), 1)


def test_armies_synced_after_end_turn():
    g = S.new_game("Mexico", seed=3, game_id="sync")
    for _ in range(6):
        end_turn(g)
        for cid in g["countries"]:
            assert abs(g["countries"][cid]["army"] - _troops_at(g, cid)) < 0.11


def test_threat_is_0_100_and_toward_player():
    g = S.new_game("Panama", seed=1, game_id="thr")
    for cid in ("Brazil", "Colombia", "Costa Rica"):
        t = views.country_detail(g, cid)["threat"]
        assert isinstance(t, int) and 0 <= t <= 100
    other = "Colombia"
    S.set_rel(g, "Panama", other, -100) if hasattr(S, "set_rel") else S.add_rel(g, "Panama", other, -200)
    assert views.threat_to(g, other, "Panama") > 0
    assert views.threat_to(g, "Panama", "Panama") == 0


def test_fog_hides_non_allies():
    g = S.new_game("Argentina", seed=2, game_id="fog")
    v = views.game_view(g)
    assert all(d["owner"] == "Argentina" for d in v["divisions"])
    assert v["countries"]["Brazil"]["money"] is None and v["countries"]["Brazil"]["fog"]
    assert v["countries"]["Argentina"]["money"] == g["countries"]["Argentina"]["money"]
    est = views.country_detail(g, "Brazil")["army_estimate"]
    assert set(est) == {"troops", "tanks", "planes"}
    assert "forces" in v["summary"]


def test_deltas_fixed_after_turn():
    g = S.new_game("Chile", seed=4, game_id="dl")
    end_turn(g)
    d1 = views.game_view(g)["summary"]["deltas"]
    g["countries"]["Chile"]["money"] -= 50  # p.ej. ordenes encoladas que cobran al instante
    assert views.game_view(g)["summary"]["deltas"] == d1


def test_front_bonus_on_enemy_border():
    g = S.new_game("Argentina", seed=5, game_id="fr")
    nb = next(n for n in S.adjacency()["Argentina"] if n in g["countries"])
    divs = S.divisions_at(g, "Argentina")
    base = M.defense_strength(g, divs, "Argentina", PortableRandom(1))
    S.add_war(g, "Argentina", nb) if hasattr(S, "add_war") else g["wars"].append(
        {"a": "Argentina", "b": nb, "since_turn": g["turn"], "last_combat": g["turn"]})
    for d in S.divisions_of(g, "Argentina"):
        d["stance"] = "front"
    front = M.defense_strength(g, divs, "Argentina", PortableRandom(1))
    assert front > base


def test_no_stability_revert_below_min():
    g = S.new_game("Haiti", seed=6, game_id="st")
    g["countries"]["Haiti"]["stability"] = 0
    rev = next(f for f in E.stability_factors(g, "Haiti") if f["label"] == "Retorno a la normalidad")
    assert rev["value"] == 0
    assert C.STAB_REVERT_MIN > 0


def test_ai_never_signs_treaties_for_player():
    """Sin órdenes del jugador, ningún tratado puede incluirlo: la IA solo le hace ofertas."""
    from app.engine import state as S2
    from app.engine.turn import end_turn as _end
    offered = False
    for seed in (1, 2, 3):
        g = S2.new_game("Colombia", seed=seed)
        for _ in range(20):
            if g["ended"]:
                break
            g["active_event"] = None
            _end(g)
            assert not any(g["player"] in (t["a"], t["b"]) for t in g["treaties"])
        offered = offered or any("te ofrece" in l["text"] for l in g["logs"])
    assert offered
