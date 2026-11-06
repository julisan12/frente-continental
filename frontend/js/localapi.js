// API local (sin conexión): implementa en el navegador las mismas rutas que backend/app/main.py
// usando el motor portado a JavaScript (js/engine/*). Las partidas se guardan en localStorage.
// Los errores se lanzan como {status, detail}, igual que espera api.js.
import * as S from './engine/state.js';
import * as O from './engine/orders.js';
import * as EV from './engine/events.js';
import * as views from './engine/views.js';
import { VERSION } from './engine/constants.js';
import { end_turn } from './engine/turn.js';
import { init_ext, ext_action, ext_turn } from './engine/features.js';
import { VARIANTS, variant_of } from './data/provinces.js';
import { use_game_geo } from './engine/provinces.js';
import { SCENARIOS, apply_scenario } from './engine/scenarios.js';
import { MAX_TURNS } from './engine/constants.js';

const PREFIX = 'fc_local_game_';
const INDEX_KEY = 'fc_local_games';
const MAX_GAMES = 6;
const ID_RE = /^[A-Za-z0-9]{1,64}$/;

let _ready = null;
let _mapCache = {};

const fail = (status, detail) => { throw { status, detail }; };
const bad = (e) => fail(400, (e && e.message) || String(e));

const LS = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* nada */ } },
};

// ------------------------------------------------------------------ datos de países
function dataUrls() {
  const urls = [];
  const rel = (p) => { try { urls.push(new URL(p, document.baseURI).href); } catch { /* ignorar */ } };
  rel('data/countries.json');
  rel('./data/countries.json');
  rel('../backend/app/data/countries.json');
  rel('../../backend/app/data/countries.json');
  return [...new Set(urls)];
}

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

/** Carga data/countries.json (ruta relativa: funciona en http, file:// y Capacitor) y configura el motor. */
export function ready() {
  if (_ready) return _ready;
  _ready = (async () => {
    let list = null;
    let lastErr = null;
    for (const u of dataUrls()) {
      try {
        const j = await fetchJson(u);
        if (Array.isArray(j)) { list = j; break; }
        if (j && Array.isArray(j.countries)) { list = j.countries; break; }
      } catch (e) { lastErr = e; }
    }
    if (!list) {
      _ready = null;
      fail(0, 'No se pudieron cargar los datos del mapa (data/countries.json).' + (lastErr ? ' ' + lastErr.message : ''));
    }
    S.set_countries_data(list);
    return true;
  })();
  return _ready;
}

// ------------------------------------------------------------------ almacenamiento
function index() {
  try { const j = JSON.parse(LS.get(INDEX_KEY) || '[]'); return Array.isArray(j) ? j : []; } catch { return []; }
}
const setIndex = (ids) => LS.set(INDEX_KEY, JSON.stringify(ids));

function cleanup(keepId) {
  // Conserva como máximo MAX_GAMES partidas (las más recientes); borra las demás.
  let ids = index().filter((i) => i !== keepId);
  ids.push(keepId);
  while (ids.length > MAX_GAMES) LS.del(PREFIX + ids.shift());
  setIndex(ids);
}

function save(game) {
  if (!ID_RE.test(String(game.id))) throw new Error('Identificador de partida inválido.');
  const txt = JSON.stringify(game);
  if (!LS.set(PREFIX + game.id, txt)) {
    // Sin espacio: libera partidas antiguas (de la más vieja a la más nueva) y reintenta.
    // Nunca borra la partida activa del jugador (fc_game_id_local) ni la que se está guardando.
    const active = LS.get('fc_game_id_local') || LS.get('fc_game_id');
    const victims = index().filter((i) => i !== game.id && i !== active);
    let ok = false;
    while (!ok && victims.length) {
      const v = victims.shift();
      LS.del(PREFIX + v);
      setIndex(index().filter((i) => i !== v));
      ok = LS.set(PREFIX + game.id, txt);
    }
    if (!ok) fail(500, 'No se pudo guardar la partida (almacenamiento lleno).');
  }
  cleanup(game.id);
}

function load(gid) {
  if (typeof gid !== 'string' || !ID_RE.test(gid)) return null;
  const txt = LS.get(PREFIX + gid);
  if (!txt) return null;
  try { return JSON.parse(txt); } catch { return null; }
}

export const exists = (gid) => load(gid) !== null;
export function deleteGame(gid) { LS.del(PREFIX + gid); setIndex(index().filter((i) => i !== gid)); }

/** Activa la variante de mapa y la geometria de provincias de la partida antes de operar con ella. */
function activate(g) {
  S.use_variant(variant_of(g));
  try { use_game_geo(g); } catch { /* geometria opcional */ }
  return g;
}
const get = (gid) => activate(load(gid) || fail(404, 'Partida no encontrada.'));

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : null));

// ------------------------------------------------------------------ rutas
export function health() { return { ok: true, version: VERSION, variants: Object.keys(VARIANTS) }; }

export function getMap(variant) {
  const v = VARIANTS[variant] ? variant : 'latam';
  if (!_mapCache[v]) {
    const keys = ['id', 'name', 'color', 'path', 'neighbors', 'sea', 'power', 'alignment', 'resources'];
    const ids = VARIANTS[v].ids;
    _mapCache[v] = {
      viewBox: VARIANTS[v].viewBox, variant: v,
      countries: S.all_countries().filter((c) => !ids || ids.includes(c.id)).map((c) => { const o = {}; keys.forEach((k) => { o[k] = k in c ? c[k] : null; }); return o; }),
    };
  }
  return _mapCache[v];
}

export function createGame(body) {
  body = body || {};
  if (typeof body.player !== 'string') fail(422, 'Solicitud no válida.');
  let seed = body.seed == null ? undefined : num(body.seed);
  if (body.seed != null && seed === null) fail(422, 'Solicitud no válida.');
  if (seed === undefined) seed = null;
  if (body.variant != null && !VARIANTS[body.variant]) fail(422, 'Variante de mapa no válida.');
  if (body.scenario != null && !SCENARIOS[body.scenario]) fail(422, 'Escenario no válido.');
  const sc = body.scenario == null ? null : SCENARIOS[body.scenario];
  let maxT = null;
  if (body.max_turns != null) { maxT = num(body.max_turns); if (maxT === null || maxT < 0 || maxT > 1000 || maxT !== Math.trunc(maxT)) fail(422, 'Cantidad de turnos no válida.'); }
  const variant = sc && sc.variant ? sc.variant : (body.variant == null ? 'latam' : body.variant);
  let g;
  try {
    g = S.new_game(body.player, seed, null, variant);
    if (maxT !== null && maxT !== MAX_TURNS) g.max_turns = maxT;
    if (sc) apply_scenario(g, body.scenario);
    activate(g); init_ext(g);
  } catch (e) { bad(e); }
  save(g);
  return views.game_view(g);
}

export function getGame(gid) {
  const g = get(gid);
  if (!g.ext || !g.ext.v) { try { init_ext(g); save(g); } catch { /* sin ext */ } } else init_ext(g);
  return views.game_view(g);
}

export function addOrder(gid, body) {
  body = body || {};
  if (typeof body.type !== 'string') fail(422, 'Solicitud no válida.');
  const g = get(gid);
  try {
    O.queue_order(g, g.player, body.type, body.target == null ? null : body.target,
      body.division_id == null ? null : body.division_id, body.params == null ? null : body.params);
  } catch (e) { bad(e); }
  save(g);
  return { game: views.game_view(g) };
}

export function delOrder(gid, orderId) {
  const g = get(gid);
  try { O.delete_order(g, g.player, orderId); } catch (e) { bad(e); }
  save(g);
  return { game: views.game_view(g) };
}

export function setBudget(gid, body) {
  const g = get(gid);
  const vals = {};
  for (const k of ['army', 'social', 'infrastructure', 'industry']) {
    const v = num(body && body[k]);
    if (v === null) fail(422, 'Solicitud no válida.');
    vals[k] = v;
  }
  if (Object.values(vals).some((v) => v < 0)) fail(400, 'El presupuesto no puede ser negativo.');
  const total = Object.values(vals).reduce((a, b) => a + b, 0);
  if (Math.abs(total - 100.0) > 0.5) fail(400, 'El presupuesto debe sumar 100%.');
  g.countries[g.player].budget = vals;
  save(g);
  return { game: views.game_view(g) };
}

export function eventChoice(gid, body) {
  const g = get(gid);
  const opt = num(body && body.option);
  if (opt === null || !Number.isInteger(opt)) fail(422, 'Solicitud no válida.');
  try { EV.apply_choice(g, opt); } catch (e) { bad(e); }
  save(g);
  return { game: views.game_view(g) };
}

export function endTurn(gid) {
  const g = get(gid);
  let report;
  try { report = end_turn(g); } catch (e) { bad(e); }
  try {
    const extLines = ext_turn(g);
    if (extLines && extLines.length) {
      if (report && Array.isArray(report.lines)) report.lines.push(...extLines);
      if (g.last_report && Array.isArray(g.last_report.lines) && g.last_report.lines !== (report && report.lines)) g.last_report.lines.push(...extLines);
    }
  } catch (e) { /* los sistemas ampliados nunca deben romper el turno */ }
  save(g);
  return { game: views.game_view(g), report };
}

export function extRoute(gid, body) {
  const g = get(gid);
  let r;
  try { r = ext_action(g, body || {}); } catch (e) { bad(e); }
  if (!r || !r.ok) fail(400, (r && r.error) || 'Acción no válida.');
  save(g);
  return { game: views.game_view(g), msg: r.msg };
}

export function country(gid, cid) {
  const g = get(gid);
  try { return views.country_detail(g, cid); } catch (e) { fail(404, (e && e.message) || String(e)); }
}

// ------------------------------------------------------------------ enrutador (misma forma que fetch en api.js)
const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

/** Despacha method + path ('/games/abc/orders') como lo haría el servidor. Devuelve el JSON de respuesta. */
export async function handle(method, path, body) {
  await ready();
  const p = path.split('?')[0].split('/').filter(Boolean).map(dec);
  const m = method.toUpperCase();
  if (m === 'GET' && p[0] === 'health' && p.length === 1) return health();
  if (m === 'GET' && p[0] === 'map' && p.length === 1) return getMap(new URLSearchParams(path.split('?')[1] || '').get('variant'));
  if (p[0] === 'games') {
    if (m === 'POST' && p.length === 1) return createGame(body);
    const gid = p[1];
    if (p.length === 2 && m === 'GET') return getGame(gid);
    if (p.length === 3 && p[2] === 'orders' && m === 'POST') return addOrder(gid, body);
    if (p.length === 4 && p[2] === 'orders' && m === 'DELETE') return delOrder(gid, p[3]);
    if (p.length === 3 && p[2] === 'budget' && m === 'PUT') return setBudget(gid, body);
    if (p.length === 4 && p[2] === 'events' && p[3] === 'choice' && m === 'POST') return eventChoice(gid, body);
    if (p.length === 3 && p[2] === 'end-turn' && m === 'POST') return endTurn(gid);
    if (p.length === 3 && p[2] === 'ext' && m === 'POST') return extRoute(gid, body);
    if (p.length === 4 && p[2] === 'country' && m === 'GET') return country(gid, p[3]);
  }
  return fail(404, 'Not Found');
}
