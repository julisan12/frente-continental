// Arnes de paridad: ejecuta el mismo guion que tools/parity.py con el motor JS y compara
// turno a turno contra Python (referencia). Imprime la PRIMERA divergencia de cada partida.
// Uso: node tools/parity.mjs [TURNS] [player,player,...] [seeds]   (por defecto 40, matriz completa, 1,2,3)
//      node tools/parity.mjs sweep [TURNS]   -> solo JS: los 24 paises x semilla 1, busca excepciones.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const eng = (m) => import(pathToFileURL(path.join(ROOT, 'frontend/js/engine', m)).href);
const S = await eng('state.js');
const O = await eng('orders.js');
const EV = await eng('events.js');
const V = await eng('views.js');
const T = await eng('turn.js');
S.set_countries_data(JSON.parse(readFileSync(path.join(ROOT, 'backend/app/data/countries.json'), 'utf8')));

// ---- guion: copia exacta de PLAN/BUDGETS de tools/parity.py
const PLAN = [
  [{ type: 'build' }, { type: 'project', params: { kind: 'factory' } }],
  [{ type: 'recruit' }, { type: 'trade', target: '@nb0' }],
  [{ type: 'tanks' }, { type: 'nap', target: '@nb1' }, { type: 'bogus' }],
  [{ type: 'planes' }, { type: 'project', params: { kind: 'road' } },
    { type: 'send_resources', target: '@nb0', params: { amount: 50 } }],
  [{ type: 'stability' }, { type: 'propose_alliance', target: '@ent1' }, { type: 'move', target: 'Nowhere', division_id: 'x' }],
  [{ type: 'project', params: { kind: 'barracks' } },
    { type: 'send_resources', target: '@nb1', params: { amount: 10 } }, { cancel: 'missing' }],
  [{ type: 'build' }, { type: 'break', target: '@nb0', params: { treaty: 'trade' } },
    { type: 'project', params: { kind: 'nope' } }],
  [{ type: 'recruit' }, { type: 'project', params: { kind: 'school' } }, { cancel: 'last' }],
  [{ type: 'declare_war', target: '@nb0', only_turns: [8, 28] }, { type: 'project', params: { kind: 'port' } },
    { type: 'trade', target: '@ent2' }],
  [{ type: 'peace', target: '@war' }, { type: 'break', target: '@ent2' }, { type: 'declare_war' }],
];
const BUDGETS = [
  { army: 25, social: 25, infrastructure: 25, industry: 25 },
  { army: 40, social: 20, infrastructure: 20, industry: 20 },
  { army: 10, social: 30, infrastructure: 30, industry: 30.4 },
  { army: 50, social: 10, infrastructure: 10, industry: 10 },
  { army: -5, social: 55, infrastructure: 25, industry: 25 },
];
const DIV_MODES = 6;
const pyS = (v) => (v === null || v === undefined ? 'None' : String(v));
const sortedStr = (a) => [...a].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));

function set_budget(game, vals) {
  const v = Object.values(vals);
  if (v.some((x) => x < 0)) throw new Error('El presupuesto no puede ser negativo.');
  let s = 0; for (const x of v) s += x;
  if (Math.abs(s - 100.0) > 0.5) throw new Error('El presupuesto debe sumar 100%.');
  game.countries[game.player].budget = { ...vals };
}

function resolve_target(game, tag) {
  const p = game.player;
  if (tag === null || tag === undefined || !tag.startsWith('@')) return tag ?? null;
  const adj = S.adjacency();
  if (tag.startsWith('@nb')) {
    const set = new Set();
    for (const t of S.territories_of(game, p)) for (const n of adj[t]) if (S.owner_of(game, n) !== p) set.add(n);
    const nbs = sortedStr(set); const k = parseInt(tag.slice(3), 10);
    return nbs.length ? nbs[k % nbs.length] : null;
  }
  if (tag.startsWith('@ent')) {
    const ents = S.entities(game).filter((e) => e !== p && S.is_alive(game, e)); const k = parseInt(tag.slice(4), 10);
    return ents.length ? ents[k % ents.length] : null;
  }
  if (tag === '@war') {
    const ws = sortedStr(Object.entries(game.countries).filter(([, c]) => S.at_war(game, p, c.owner)).map(([cid]) => cid));
    return ws.length ? ws[0] : null;
  }
  return null;
}

function attempt(game, log, desc, fn) {
  try { fn(); log.push([desc, 'ok']); } catch (e) {
    if (e instanceof TypeError || e instanceof ReferenceError || e instanceof RangeError || e instanceof SyntaxError) throw e;
    log.push([desc, 'ERR ' + e.message]);
  }
}

function division_orders(game, log, turn) {
  const p = game.player; const adj = S.adjacency();
  const divs = [...S.divisions_of(game, p)].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const friends = new Set([p, ...S.allies_of(game, p)]);
  divs.slice(0, 6).forEach((d, i) => {
    let mode = (turn + i) % DIV_MODES; const near = adj[d.location];
    let otype = null; let target = null;
    if (mode === 0 || mode === 5) {
      const cands = mode === 0 ? near.filter((n) => S.at_war(game, p, S.owner_of(game, n)))
        : turn >= 20 ? near.filter((n) => !friends.has(S.owner_of(game, n))) : [];
      if (cands.length) { otype = 'attack'; target = cands[(turn + i) % cands.length]; } else mode = 1;
    }
    if (mode === 1) {
      const cands = near.filter((n) => friends.has(S.owner_of(game, n)));
      if (cands.length) { otype = 'move'; target = cands[(turn + i) % cands.length]; } else otype = 'defend';
    } else if (mode === 2) otype = 'defend';
    else if (mode === 3) otype = 'front';
    else if (mode === 4) otype = 'reorganize';
    attempt(game, log, `div ${d.id} ${otype} ${pyS(target)}`, () => O.queue_order(game, p, otype, target, d.id, null));
  });
  if (divs.length && turn % 4 === 1) attempt(game, log, 'dup ' + divs[0].id, () => O.queue_order(game, p, 'defend', null, divs[0].id, null));
}

function play_turn(game, turn) {
  const p = game.player; const log = [];
  const ev = game.active_event;
  if (ev) {
    const n = ev.options.length;
    if (turn % 3 === 0) attempt(game, log, 'choice 99', () => EV.apply_choice(game, 99));
    if (turn % 4 !== 0) { const opt = n ? turn % n : 0; attempt(game, log, `choice ${opt}`, () => EV.apply_choice(game, opt)); }
  } else if (turn % 6 === 5) attempt(game, log, 'choice none', () => EV.apply_choice(game, 0));
  if (turn % 5 === 0) { const b = BUDGETS[Math.floor(turn / 5) % BUDGETS.length]; attempt(game, log, 'budget', () => set_budget(game, b)); }
  for (const spec of PLAN[turn % PLAN.length]) {
    if ('cancel' in spec) {
      const mine = game.orders.filter((o) => o.owner === p);
      const oid = spec.cancel === 'last' && mine.length ? mine[mine.length - 1].id : 'o-nope';
      attempt(game, log, 'cancel ' + oid, () => O.delete_order(game, p, oid));
      continue;
    }
    if (spec.only_turns && !spec.only_turns.includes(turn)) continue;
    const target = resolve_target(game, spec.target);
    const params = spec.params ? structuredClone(spec.params) : null;
    attempt(game, log, `${spec.type} ${pyS(target)}`, () => O.queue_order(game, p, spec.type, target, spec.division_id ?? null, params));
  }
  division_orders(game, log, turn);
  return log;
}

const J = (x) => JSON.parse(JSON.stringify(x));
function* runJS(player, seed, turns) {
  let game = S.new_game(player, seed, 'parity00');
  const roundtrip = !!process.env.PARITY_ROUNDTRIP; // simula guardar/cargar en localStorage cada turno
  yield { turn: 0, state: J(game), view: J(V.game_view(game)) };
  const names = S.load_countries().map((c) => c.id);
  for (let i = 0; i < turns; i++) {
    if (game.ended) break;
    if (roundtrip) game = J(game);
    const turn = game.turn;
    const log = play_turn(game, turn);
    const pre_view = J(V.game_view(game));
    const report = T.end_turn(game);
    const details = {};
    for (const cid of sortedStr(new Set([player, resolve_target(game, '@nb0') || player, names[turn % names.length]]))) {
      try { details[cid] = J(V.country_detail(game, cid)); } catch (e) {
        if (e instanceof TypeError || e instanceof ReferenceError) throw e;
        details[cid] = 'ERR ' + e.message;
      }
    }
    yield { turn, actions: log, pre_view, report: J(report), state: J(game), view: J(V.game_view(game)), details };
  }
}

// Comparacion exacta (valores, tipos, orden de claves). Devuelve null o [ruta, py, js].
function diff(a, b, p = '') {
  if (typeof a !== typeof b || (a === null) !== (b === null) || Array.isArray(a) !== Array.isArray(b)) return [p, a, b];
  if (a === null || typeof a !== 'object') {
    if (typeof a === 'number' && Object.is(a, -0) !== Object.is(b, -0) && a === b) return null; // -0.0 vs 0
    return a === b ? null : [p, a, b];
  }
  if (Array.isArray(a)) {
    if (a.length !== b.length) return [p + '.length', a.length, b.length];
    for (let i = 0; i < a.length; i++) { const d = diff(a[i], b[i], `${p}[${i}]`); if (d) return d; }
    return null;
  }
  const ka = Object.keys(a); const kb = Object.keys(b);
  for (const k of ka) if (!(k in b)) return [`${p}.${k}`, a[k], '<missing>'];
  for (const k of kb) if (!(k in a)) return [`${p}.${k}`, '<missing>', b[k]];
  for (const k of ka) { const d = diff(a[k], b[k], `${p}.${k}`); if (d) return d; }
  if (ka.join('|') !== kb.join('|')) return [p + ' <key order>', ka, kb];
  return null;
}

const short = (v) => { const s = JSON.stringify(v); return s && s.length > 300 ? s.slice(0, 300) + '...' : s; };

function compare(player, seed, turns) {
  const py = spawnSync('python', [path.join(ROOT, 'tools/parity.py'), player, String(seed), String(turns)],
    { encoding: 'utf8', maxBuffer: 1 << 30, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  if (py.status !== 0) return { ok: false, msg: 'Python fallo: ' + py.stderr.slice(-2000) };
  const pyRecs = py.stdout.trim().split('\n').map((l) => JSON.parse(l));
  let n = 0;
  try {
    for (const rec of runJS(player, seed, turns)) {
      const ref = pyRecs[n++];
      if (!ref) return { ok: false, msg: `JS tiene mas turnos que Python (turno ${rec.turn})` };
      const d = diff(ref, rec);
      if (d) return { ok: false, msg: `turno ${rec.turn}: ${d[0]}\n    py: ${short(d[1])}\n    js: ${short(d[2])}` };
    }
  } catch (e) { return { ok: false, msg: `excepcion JS en registro ${n}: ${e.stack}` }; }
  if (n !== pyRecs.length) return { ok: false, msg: `Python tiene ${pyRecs.length} registros, JS ${n}` };
  const last = pyRecs[pyRecs.length - 1].state;
  return { ok: true, msg: `${n - 1} turnos identicos (fin: ${last.result || 'en curso'}, turno ${last.turn})` };
}

const args = process.argv.slice(2);
if (args[0] === 'sweep') {
  const turns = Number(args[1] || 100); let bad = 0;
  for (const c of S.load_countries()) {
    try {
      let last = null; for (const r of runJS(c.id, 1, turns)) last = r;
      console.log(`OK  ${c.id}: turno ${last.state.turn} ${last.state.result || ''}`);
    } catch (e) { bad++; console.log(`ERR ${c.id}: ${e.stack}`); }
  }
  console.log(bad ? `${bad} partidas con excepcion` : 'barrido sin excepciones');
  process.exit(bad ? 1 : 0);
}
const turns = Number(args[0] || 40);
const players = args[1] ? args[1].split(',') : ['Mexico', 'Brazil', 'Cuba', 'Argentina', 'Haiti', 'Belize'];
const seeds = args[2] ? args[2].split(',').map(Number) : [1, 2, 3];
let fails = 0;
for (const pl of players) for (const sd of seeds) {
  const r = compare(pl, sd, turns);
  if (!r.ok) fails++;
  console.log(`${r.ok ? 'OK  ' : 'DIFF'} ${pl} seed ${sd}: ${r.msg}`);
}
console.log(fails ? `${fails} partidas divergen` : 'PARIDAD TOTAL');
process.exit(fails ? 1 : 0);
