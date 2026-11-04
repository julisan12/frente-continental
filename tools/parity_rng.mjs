// Paridad de la base del port JS contra Python:
//   1) rng.js == rng.py para semillas int y str, miles de tiradas de cada metodo.
//   2) state.new_game(player, seed) JSON identico (ignorando "id"), incluido el orden de claves.
//   3) py.js: pyRound / fmtFixed / pyStr contra Python sobre muchos valores.
// Uso: node tools/parity_rng.mjs   (requiere `python` en el PATH)
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PortableRandom } = await import(path.join(ROOT, 'frontend/js/engine/rng.js').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));
const S = await import(path.join(ROOT, 'frontend/js/engine/state.js').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));
const P = await import(path.join(ROOT, 'frontend/js/engine/py.js').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));

const SEEDS = [0, 1, 7, 42, 1962, -5, 123456789, 1000 * 42 + 3, 'hola', 'agg-42-Brazil', '42-7-eventos', 'ñandú ☃', ''];
const N = 3000;

function jsDraws(seed) {
  const r = new PortableRandom(seed);
  const out = { u32: [], random: [], randint: [], randrange: [], randrange2: [], randrange3: [], uniform: [], choice: [], shuffle: [], sample: [] };
  for (let i = 0; i < N; i++) out.u32.push(r.next_u32());
  for (let i = 0; i < N; i++) out.random.push(r.random());
  for (let i = 0; i < N; i++) out.randint.push(r.randint(-18, 18));
  for (let i = 0; i < N; i++) out.randrange.push(r.randrange(1 + (i % 50)));
  for (let i = 0; i < N; i++) out.randrange2.push(r.randrange(-10, 10 + (i % 7)));
  for (let i = 0; i < N; i++) out.randrange3.push(r.randrange(3, 100, 7));
  for (let i = 0; i < N; i++) out.uniform.push(r.uniform(0.82, 0.34));
  const seq = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  for (let i = 0; i < N; i++) out.choice.push(r.choice(seq));
  for (let i = 0; i < 200; i++) { const l = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]; r.shuffle(l); out.shuffle.push(l); }
  for (let i = 0; i < 200; i++) out.sample.push(r.sample(seq, 1 + (i % 7)));
  out.state = r.getstate();
  return out;
}

const PY_SCRIPT = `
import sys, json
sys.stdin.reconfigure(encoding="utf-8"); sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, r"${path.join(ROOT, 'backend').replace(/\\/g, '\\\\')}")
from app.engine.rng import PortableRandom
from app.engine import state as S
req = json.load(sys.stdin)
N = req["n"]
res = {"rng": {}, "games": {}, "py": {}}
for seed in req["seeds"]:
    r = PortableRandom(seed)
    out = {"u32": [], "random": [], "randint": [], "randrange": [], "randrange2": [], "randrange3": [], "uniform": [], "choice": [], "shuffle": [], "sample": []}
    for i in range(N): out["u32"].append(r.next_u32())
    for i in range(N): out["random"].append(r.random())
    for i in range(N): out["randint"].append(r.randint(-18, 18))
    for i in range(N): out["randrange"].append(r.randrange(1 + (i % 50)))
    for i in range(N): out["randrange2"].append(r.randrange(-10, 10 + (i % 7)))
    for i in range(N): out["randrange3"].append(r.randrange(3, 100, 7))
    for i in range(N): out["uniform"].append(r.uniform(0.82, 0.34))
    seq = ["a", "b", "c", "d", "e", "f", "g"]
    for i in range(N): out["choice"].append(r.choice(seq))
    for i in range(200):
        l = list(range(10)); r.shuffle(l); out["shuffle"].append(l)
    for i in range(200): out["sample"].append(r.sample(seq, 1 + (i % 7)))
    out["state"] = list(r.getstate())
    res["rng"][str(len(res["rng"]))] = out
for player, seed in req["games"]:
    g = S.new_game(player, seed=seed)
    del g["id"]
    res["games"][f"{player}|{seed}"] = g
vals = req["values"]
res["py"]["round0"] = [round(v) for v in vals]
res["py"]["round1"] = [round(v, 1) for v in vals]
res["py"]["round2"] = [round(v, 2) for v in vals]
res["py"]["fixed1"] = [f"{v:.1f}" for v in vals]
res["py"]["fixed0"] = [f"{v:.0f}" for v in vals]
res["py"]["signed1"] = [f"{v:+.1f}" for v in vals]
res["py"]["str"] = [str(float(v)) for v in vals]
res["py"]["money"] = [S.money_str(v) for v in vals]
json.dump(res, sys.stdout)
`;

const GAMES = [['Brazil', 1], ['Argentina', 42], ['Cuba', 7], ['Mexico', 1962], ['Haiti', 999999], ['Chile', 3]];
const VALUES = [];
{
  const r = new PortableRandom('py-vals');
  for (let i = 0; i < 2000; i++) VALUES.push((r.random() - 0.5) * Math.pow(10, r.randint(-3, 6)));
  for (let i = 0; i < 400; i++) VALUES.push(r.randint(-500, 500) / 2);      // empates .5
  for (let i = 0; i < 400; i++) VALUES.push(r.randint(-5000, 5000) / 20);   // empates .x5
  for (let i = 0; i < 400; i++) VALUES.push(r.randint(-5000, 5000) / 200);  // empates .xx5
  VALUES.push(0.5, 1.5, 2.5, -0.5, -1.5, 2.675, 1.005, 0.125, 0.375, 1e16, 1e-5, 0.0001, 123456789.125, 70, 3, 0.1 + 0.2, 1 / 3);
}

const py = spawnSync('python', ['-c', PY_SCRIPT], {
  input: JSON.stringify({ seeds: SEEDS, n: N, games: GAMES, values: VALUES }),
  encoding: 'utf8', maxBuffer: 1 << 28,
});
if (py.status !== 0) { console.error(py.stderr); process.exit(1); }
const ref = JSON.parse(py.stdout);

let failures = 0;
function fail(msg) { failures++; if (failures <= 30) console.log('FALLO: ' + msg); }

// --- 1) RNG
for (const seed of SEEDS) {
  const a = jsDraws(seed), b = ref.rng[String(SEEDS.indexOf(seed))];
  for (const k of Object.keys(a)) {
    const sa = JSON.stringify(a[k]), sb = JSON.stringify(b[k]);
    if (sa !== sb) {
      let i = 0; while (i < a[k].length && JSON.stringify(a[k][i]) === JSON.stringify(b[k][i])) i++;
      fail(`rng seed=${JSON.stringify(seed)} metodo=${k} primer indice distinto=${i} js=${JSON.stringify(a[k][i])} py=${JSON.stringify(b[k][i])}`);
    }
  }
}
console.log(`RNG: ${SEEDS.length} semillas x ${N} tiradas por metodo comparadas.`);

// --- 2) new_game
S.set_countries_data(JSON.parse(readFileSync(path.join(ROOT, 'backend/app/data/countries.json'), 'utf8')));
function deepDiff(a, b, p = '') {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return `${p}: lista ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
    for (let i = 0; i < a.length; i++) { const d = deepDiff(a[i], b[i], `${p}[${i}]`); if (d) return d; }
    return null;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.join(',') !== kb.join(',')) return `${p}: claves/orden ${ka} vs ${kb}`;
    for (const k of ka) { const d = deepDiff(a[k], b[k], `${p}.${k}`); if (d) return d; }
    return null;
  }
  if (!Object.is(a, b) && !(typeof a === 'number' && typeof b === 'number' && a === b)) return `${p}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
  return null;
}
for (const [player, seed] of GAMES) {
  const g = JSON.parse(JSON.stringify(S.new_game(player, seed)));
  delete g.id;
  const d = deepDiff(g, ref.games[`${player}|${seed}`]);
  if (d) fail(`new_game(${player}, ${seed}) ${d}`);
}
console.log(`new_game: ${GAMES.length} partidas comparadas.`);

// --- 3) py.js
const checks = {
  round0: (v) => P.pyRound(v), round1: (v) => P.pyRound(v, 1), round2: (v) => P.pyRound(v, 2),
  fixed1: (v) => P.fmtFixed(v, 1), fixed0: (v) => P.fmtFixed(v, 0), signed1: (v) => P.fmtSigned(v, 1),
  str: (v) => P.pyStr(v, true), money: (v) => S.money_str(v),
};
for (const [k, fn] of Object.entries(checks)) {
  VALUES.forEach((v, i) => {
    const js = fn(v), p = ref.py[k][i];
    if (!Object.is(js, p) && js !== p) fail(`py.${k}(${v}) js=${JSON.stringify(js)} py=${JSON.stringify(p)}`);
  });
}
console.log(`py.js: ${VALUES.length} valores x ${Object.keys(checks).length} funciones comparadas.`);

if (failures) { console.log(`\n${failures} fallos.`); process.exit(1); }
console.log('\nPARIDAD OK: rng.js, state.new_game y py.js coinciden con Python.');
