"""Simula partidas con el jugador pasivo. Uso: python tools/simulate.py [turnos] [semillas]"""
import sys
import traceback
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from app.engine import state as S  # noqa: E402
from app.engine.turn import end_turn  # noqa: E402

TURNS = int(sys.argv[1]) if len(sys.argv) > 1 else 60
SEEDS = int(sys.argv[2]) if len(sys.argv) > 2 else 1

winners, results, ends, errors = Counter(), Counter(), [], []
dist = Counter()
for cid in [c["id"] for c in S.load_countries()]:
    for seed in range(1, SEEDS + 1):
        g = S.new_game(cid, seed=seed)
        try:
            while g["turn"] <= TURNS and not g["ended"]:
                end_turn(g)
        except Exception:
            errors.append((cid, seed, g["turn"], traceback.format_exc()))
            continue
        results[g["result"] or "none"] += 1
        winners[g["winner"] or "-"] += 1
        ends.append(g["turn"])
        sizes = sorted((len(S.territories_of(g, e)) for e in S.entities(g)), reverse=True)
        dist[sizes[0]] += 1
        print(f"{cid:12s} s{seed} turn={g['turn']:3d} result={g['result']} winner={g['winner']} top={sizes[:3]}")
print("results", dict(results))
print("winners", dict(winners))
print("avg end turn", sum(ends) / max(1, len(ends)), "min", min(ends, default=0), "max", max(ends, default=0))
print("largest-empire size distribution", sorted(dist.items()))
print("exceptions", len(errors))
for e in errors[:3]:
    print(e[0], e[1], e[2]); print(e[3])
