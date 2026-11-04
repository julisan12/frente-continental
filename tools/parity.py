"""Arnes de paridad Python (referencia) vs motor JS (frontend/js/engine).

Uso: python tools/parity.py PLAYER SEED TURNS > salida.jsonl
Juega TURNS turnos con un jugador guionizado (ver PLAN) usando las mismas funciones
que las rutas de la API y emite una linea JSON por turno con el estado completo,
el informe, la vista de partida y algunas fichas de pais. tools/parity.mjs ejecuta
el mismo guion con el motor JS y compara.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.engine import events as EV  # noqa: E402
from app.engine import orders as O  # noqa: E402
from app.engine import state as S  # noqa: E402
from app.engine import views  # noqa: E402
from app.engine.turn import end_turn  # noqa: E402

# Guion como datos (debe ser identico en tools/parity.mjs). Indexado por turno % 10.
PLAN = [
    [{"type": "build"}, {"type": "project", "params": {"kind": "factory"}}],
    [{"type": "recruit"}, {"type": "trade", "target": "@nb0"}],
    [{"type": "tanks"}, {"type": "nap", "target": "@nb1"}, {"type": "bogus"}],
    [{"type": "planes"}, {"type": "project", "params": {"kind": "road"}},
     {"type": "send_resources", "target": "@nb0", "params": {"amount": 50}}],
    [{"type": "stability"}, {"type": "propose_alliance", "target": "@ent1"}, {"type": "move", "target": "Nowhere", "division_id": "x"}],
    [{"type": "project", "params": {"kind": "barracks"}},
     {"type": "send_resources", "target": "@nb1", "params": {"amount": 10}}, {"cancel": "missing"}],
    [{"type": "build"}, {"type": "break", "target": "@nb0", "params": {"treaty": "trade"}},
     {"type": "project", "params": {"kind": "nope"}}],
    [{"type": "recruit"}, {"type": "project", "params": {"kind": "school"}}, {"cancel": "last"}],
    [{"type": "declare_war", "target": "@nb0", "only_turns": [8, 28]}, {"type": "project", "params": {"kind": "port"}},
     {"type": "trade", "target": "@ent2"}],
    [{"type": "peace", "target": "@war"}, {"type": "break", "target": "@ent2"}, {"type": "declare_war"}],
]
BUDGETS = [
    {"army": 25, "social": 25, "infrastructure": 25, "industry": 25},
    {"army": 40, "social": 20, "infrastructure": 20, "industry": 20},
    {"army": 10, "social": 30, "infrastructure": 30, "industry": 30.4},
    {"army": 50, "social": 10, "infrastructure": 10, "industry": 10},  # no suma 100: error
    {"army": -5, "social": 55, "infrastructure": 25, "industry": 25},  # negativo: error
]
DIV_MODES = 6


def set_budget(game, vals):
    """Replica la validacion de PUT /budget (main.py)."""
    vals = {k: float(v) for k, v in vals.items()}
    if any(v < 0 for v in vals.values()):
        raise ValueError("El presupuesto no puede ser negativo.")
    if abs(sum(vals.values()) - 100.0) > 0.5:
        raise ValueError("El presupuesto debe sumar 100%.")
    game["countries"][game["player"]]["budget"] = vals


def resolve_target(game, tag):
    p = game["player"]
    if tag is None or not tag.startswith("@"):
        return tag
    adj = S.adjacency()
    if tag.startswith("@nb"):
        nbs = sorted({n for t in S.territories_of(game, p) for n in adj[t] if S.owner_of(game, n) != p})
        k = int(tag[3:])
        return nbs[k % len(nbs)] if nbs else None
    if tag.startswith("@ent"):
        ents = [e for e in S.entities(game) if e != p and S.is_alive(game, e)]
        k = int(tag[4:])
        return ents[k % len(ents)] if ents else None
    if tag == "@war":
        ws = sorted(cid for cid, c in game["countries"].items() if S.at_war(game, p, c["owner"]))
        return ws[0] if ws else None
    return None


def attempt(game, log, desc, fn):
    try:
        fn()
        log.append([desc, "ok"])
    except ValueError as e:
        log.append([desc, "ERR " + str(e)])


def division_orders(game, log, turn):
    p = game["player"]
    adj = S.adjacency()
    divs = sorted(S.divisions_of(game, p), key=lambda d: d["id"])
    friends = {p, *S.allies_of(game, p)}
    for i, d in enumerate(divs[:6]):
        mode = (turn + i) % DIV_MODES
        loc = d["location"]
        near = adj[loc]
        otype, target = None, None
        if mode in (0, 5):
            if mode == 0:
                cands = [n for n in near if S.at_war(game, p, S.owner_of(game, n))]
            elif turn >= 20:
                cands = [n for n in near if S.owner_of(game, n) not in friends]
            else:
                cands = []
            if cands:
                otype, target = "attack", cands[(turn + i) % len(cands)]
            else:
                mode = 1
        if mode == 1:
            cands = [n for n in near if S.owner_of(game, n) in friends]
            if cands:
                otype, target = "move", cands[(turn + i) % len(cands)]
            else:
                otype = "defend"
        elif mode == 2:
            otype = "defend"
        elif mode == 3:
            otype = "front"
        elif mode == 4:
            otype = "reorganize"
        desc = f"div {d['id']} {otype} {target}"
        attempt(game, log, desc, lambda: O.queue_order(game, p, otype, target, d["id"], None))
    if divs and turn % 4 == 1:
        # orden duplicada para la misma division: error esperado
        attempt(game, log, "dup " + divs[0]["id"], lambda: O.queue_order(game, p, "defend", None, divs[0]["id"], None))


def play_turn(game, turn):
    p = game["player"]
    log = []
    ev = game.get("active_event")
    if ev:
        n = len(ev["options"])
        if turn % 3 == 0:
            attempt(game, log, "choice 99", lambda: EV.apply_choice(game, 99))
        if turn % 4 != 0:
            opt = turn % n if n else 0
            attempt(game, log, f"choice {opt}", lambda: EV.apply_choice(game, opt))
    elif turn % 6 == 5:
        attempt(game, log, "choice none", lambda: EV.apply_choice(game, 0))
    if turn % 5 == 0:
        b = BUDGETS[(turn // 5) % len(BUDGETS)]
        attempt(game, log, "budget", lambda: set_budget(game, b))
    for spec in PLAN[turn % len(PLAN)]:
        if "cancel" in spec:
            mine = [o for o in game["orders"] if o["owner"] == p]
            oid = mine[-1]["id"] if (spec["cancel"] == "last" and mine) else "o-nope"
            attempt(game, log, "cancel " + oid, lambda: O.delete_order(game, p, oid))
            continue
        if "only_turns" in spec and turn not in spec["only_turns"]:
            continue
        target = resolve_target(game, spec.get("target"))
        params = spec.get("params")
        desc = f"{spec['type']} {target}"
        attempt(game, log, desc, lambda: O.queue_order(game, p, spec["type"], target, spec.get("division_id"), params))
    division_orders(game, log, turn)
    return log


def run(player, seed, turns):
    game = S.new_game(player, seed=seed, game_id="parity00")
    out = sys.stdout
    out.write(json.dumps({"turn": 0, "state": game, "view": views.game_view(game)}, ensure_ascii=False) + "\n")
    names = [c["id"] for c in S.load_countries()]
    for i in range(turns):
        if game.get("ended"):
            break
        turn = game["turn"]
        log = play_turn(game, turn)
        pre_view = views.game_view(game)
        report = end_turn(game)
        details = {}
        for cid in sorted({player, resolve_target(game, "@nb0") or player, names[turn % len(names)]}):
            try:
                details[cid] = views.country_detail(game, cid)
            except ValueError as e:
                details[cid] = "ERR " + str(e)
        rec = {"turn": turn, "actions": log, "pre_view": pre_view, "report": report, "state": game,
               "view": views.game_view(game), "details": details}
        out.write(json.dumps(rec, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    run(sys.argv[1], int(sys.argv[2]), int(sys.argv[3]))
