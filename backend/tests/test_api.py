from fastapi.testclient import TestClient

from app.main import app

c = TestClient(app)


def new(player="Argentina", seed=7):
    r = c.post("/api/games", json={"player": player, "seed": seed})
    assert r.status_code == 200, r.text
    return r.json()


def test_health():
    r = c.get("/api/health")
    assert r.status_code == 200 and r.json()["ok"] is True


def test_map():
    m = c.get("/api/map").json()
    assert m["viewBox"] == "0 0 500 535" and len(m["countries"]) == 24
    assert "path" in m["countries"][0]


def test_new_game_keys():
    g = new()
    for k in ("id", "player", "turn", "date", "countries", "relations", "treaties", "wars",
              "divisions", "orders", "summary", "winner", "active_event", "ended", "result", "loss_reason"):
        assert k in g, k
    assert "prev" not in g and "ai_memory" not in g
    assert g["summary"]["deltas"]["money"] == 0
    assert c.get(f"/api/games/{g['id']}").status_code == 200


def test_invalid_country():
    assert c.post("/api/games", json={"player": "Narnia"}).status_code == 400


def test_404():
    assert c.get("/api/games/nope").status_code == 404
    assert c.get("/api/games/../x").status_code in (404, 400)
    assert c.post("/api/games/nope/end-turn").status_code == 404


def test_budget_and_country():
    g = new()
    r = c.put(f"/api/games/{g['id']}/budget",
              json={"army": 40, "social": 20, "infrastructure": 20, "industry": 20})
    assert r.status_code == 200
    assert r.json()["game"]["countries"]["Argentina"]["budget"]["army"] == 40
    d = c.get(f"/api/games/{g['id']}/country/Brazil").json()
    assert d["army_estimate"] and d["stability_factors"][0]["name"]
    assert c.get(f"/api/games/{g['id']}/country/Zzz").status_code == 404


def test_order_refund_and_bad_order():
    g = new()
    gid = g["id"]
    assert c.post(f"/api/games/{gid}/orders", json={"type": "bogus"}).status_code == 400
    money0 = g["countries"]["Argentina"]["money"]
    for t in ("Chile", "Uruguay", "Bolivia", "Paraguay", "Brazil"):
        r = c.post(f"/api/games/{gid}/orders", json={"type": "ceasefire", "target": t})
        if r.status_code == 200:
            break
    # use any order type that costs money
    from app.engine import orders as O
    for otype in sorted(O.ALL_TYPES):
        for t in ("Chile", "Uruguay", "Brazil"):
            r = c.post(f"/api/games/{gid}/orders", json={"type": otype, "target": t})
            if r.status_code == 200:
                game = r.json()["game"]
                if game["orders"]:
                    o = game["orders"][-1]
                    r2 = c.delete(f"/api/games/{gid}/orders/{o['id']}")
                    assert r2.status_code == 200
                    assert r2.json()["game"]["countries"]["Argentina"]["money"] >= \
                        game["countries"]["Argentina"]["money"]
                    return
    raise AssertionError("no order could be queued")


def test_end_turn():
    g = new()
    r = c.post(f"/api/games/{g['id']}/end-turn")
    assert r.status_code == 200
    j = r.json()
    assert j["game"]["turn"] == 2 and "lines" in j["report"]


def test_24_turns():
    g = new("Chile", seed=3)
    for _ in range(24):
        r = c.post(f"/api/games/{g['id']}/end-turn")
        if r.status_code == 400:
            break
        assert r.status_code == 200, r.text


def test_budget_must_sum_100():
    g = new()
    r = c.put(f"/api/games/{g['id']}/budget",
              json={"army": 10, "social": 10, "infrastructure": 10, "industry": 10})
    assert r.status_code == 400
