// Estado del juego: datos estaticos, ayudantes de consulta y creacion de partidas.
// Port fiel de backend/app/engine/state.py (mismos nombres de funcion, misma forma JSON).
// Puro: sin DOM ni Node. Antes de usar hay que llamar set_countries_data(lista).

import * as C from './constants.js';
import { PortableRandom } from './rng.js';
import { pyRound, pymod, floordiv, cmp, sortedBy } from './py.js';
import { VARIANTS } from '../data/provinces.js';

// ---------------------------------------------------------------- datos estaticos
let _countries = null;
let _index = null;
let _adjMaps = null;
let _adjLists = null;
let _variantIds = null; // Tanda 2: ids de la variante de mapa activa (null = todos)
let _variant = 'latam';

/** Variante de mapa activa ('latam' | 'sur'). */
export function current_variant() { return _variant; }

/** Fija la variante de mapa: load_countries()/country_index() solo ven sus paises. 'latam' restaura todo. */
export function use_variant(variant) {
  const v = VARIANTS[variant] ? variant : 'latam';
  const ids = VARIANTS[v].ids;
  const same = v === _variant && (ids ? _variantIds === ids : _variantIds === null);
  _variant = v;
  _variantIds = ids || null;
  if (!same) { _index = null; _adjMaps = null; _adjLists = null; }
}

/** Lista completa de paises (sin filtrar por variante). */
export function all_countries() {
  if (!_countries) throw new Error('Datos de paises no cargados: llame a set_countries_data().');
  return _countries;
}

/** Registra la lista de paises (equivale a leer countries.json). Reinicia las caches. */
export function set_countries_data(list) {
  _countries = list;
  _index = null;
  _adjMaps = null;
  _adjLists = null;
  _filtered = null;
}

let _filtered = null;
/** Devuelve la lista de paises de la variante activa (hay que haber llamado set_countries_data). */
export function load_countries() {
  if (!_countries) throw new Error('Datos de paises no cargados: llame a set_countries_data().');
  if (!_variantIds) return _countries;
  if (!_filtered || _filtered.ids !== _variantIds || _filtered.src !== _countries) {
    _filtered = { ids: _variantIds, src: _countries, list: _countries.filter((c) => _variantIds.includes(c.id)) };
  }
  return _filtered.list;
}

/** Devuelve {id: datos estaticos}. */
export function country_index() {
  if (!_index) {
    _index = {};
    for (const c of load_countries()) _index[c.id] = c;
  }
  return _index;
}

function _adjacency_maps() {
  if (_adjMaps) return _adjMaps;
  const idx = country_index();
  const land = {}, sea = {};
  for (const cid of Object.keys(idx)) { land[cid] = new Set(); sea[cid] = new Set(); }
  for (const cid of Object.keys(idx)) {
    const c = idx[cid];
    for (const n of (c.neighbors || [])) {
      if (n in idx) { land[cid].add(n); land[n].add(cid); }
    }
    for (const n of (c.sea || [])) {
      if (n in idx) { sea[cid].add(n); sea[n].add(cid); }
    }
  }
  for (const cid of Object.keys(idx)) {
    for (const n of land[cid]) sea[cid].delete(n);
  }
  _adjMaps = [land, sea];
  return _adjMaps;
}

/** Adyacencia terrestre simetrica: {id: Set}. */
export function land_adjacency() {
  return _adjacency_maps()[0];
}

function _adjacency_lists() {
  if (_adjLists) return _adjLists;
  const [land, sea] = _adjacency_maps();
  _adjLists = {};
  for (const cid of Object.keys(land)) {
    _adjLists[cid] = sortedBy([...new Set([...land[cid], ...sea[cid]])]);
  }
  return _adjLists;
}

/** Adyacencia terrestre + maritima simetrica, como listas ORDENADAS. No modificar (cacheado). */
export function adjacency() {
  return _adjacency_lists();
}

/** True si a y b son vecinos por tierra o mar. */
export function is_adjacent(a, b) {
  const [land, sea] = _adjacency_maps();
  return (land[a] ? land[a].has(b) : false) || (sea[a] ? sea[a].has(b) : false);
}

/** True si la unica conexion es maritima. */
export function is_sea_route(a, b) {
  const sea = _adjacency_maps()[1];
  return sea[a] ? sea[a].has(b) : false;
}

// ---------------------------------------------------------------- claves y fechas
/** Clave de relacion con ids ordenados. */
export function pair_key(a, b) {
  const [x, y] = cmp(a, b) <= 0 ? [a, b] : [b, a];
  return `${x}|${y}`;
}

/** Fecha 'Ene 1962' para el turno (1 = enero 1962). */
export function date_for_turn(turn) {
  const m = pymod(turn - 1, 12);
  const y = C.START_YEAR + floordiv(turn - 1, 12);
  return `${C.MONTHS[m]} ${y}`;
}

/** Territorios necesarios para ganar. */
export function victory_target() {
  return Math.ceil(load_countries().length * C.VICTORY_FRACTION);
}

// ---------------------------------------------------------------- relaciones
/** Relacion entre dos entidades (-100..100). */
export function get_rel(game, a, b) {
  const v = game.relations[pair_key(a, b)];
  return v === undefined ? 0 : Math.trunc(v);
}

/** Fija la relacion con recorte a -100..100. */
export function set_rel(game, a, b, value) {
  game.relations[pair_key(a, b)] = Math.max(-100, Math.min(100, pyRound(value)));
}

/** Suma a la relacion. */
export function add_rel(game, a, b, delta) {
  set_rel(game, a, b, get_rel(game, a, b) + delta);
}

// ---------------------------------------------------------------- tratados y guerras
/** {x, y} == {a, b} como conjuntos de Python. */
function _same_pair(x, y, a, b) {
  if (a === b) return x === a && y === a;
  return (x === a && y === b) || (x === b && y === a);
}

/** Busca un tratado de tipo kind entre a y b. */
export function find_treaty(game, kind, a, b) {
  for (const t of game.treaties) {
    if (t.type === kind && _same_pair(t.a, t.b, a, b)) return t;
  }
  return null;
}

/** True si existe tratado. */
export function has_treaty(game, kind, a, b) {
  return find_treaty(game, kind, a, b) !== null;
}

/** Elimina tratados entre a y b; devuelve cuantos. */
export function remove_treaties(game, a, b, kinds = null) {
  const keep = [];
  let n = 0;
  for (const t of game.treaties) {
    if (_same_pair(t.a, t.b, a, b) && (kinds === null || kinds === undefined || kinds.includes(t.type))) {
      n += 1;
    } else {
      keep.push(t);
    }
  }
  game.treaties = keep;
  return n;
}

/** Aliados de una entidad. */
export function allies_of(game, ent) {
  const out = [];
  for (const t of game.treaties) {
    if (t.type === 'alliance') {
      if (t.a === ent) out.push(t.b);
      else if (t.b === ent) out.push(t.a);
    }
  }
  return out;
}

/** Guerra entre a y b si existe. */
export function find_war(game, a, b) {
  for (const w of game.wars) {
    if (_same_pair(w.a, w.b, a, b)) return w;
  }
  return null;
}

/** True si a y b estan en guerra. */
export function at_war(game, a, b) {
  return find_war(game, a, b) !== null;
}

/** Entidades en guerra con ent. */
export function enemies_of(game, ent) {
  const out = [];
  for (const w of game.wars) {
    if (w.a === ent) out.push(w.b);
    else if (w.b === ent) out.push(w.a);
  }
  return out;
}

// ---------------------------------------------------------------- territorios y divisiones
/** Ids de territorios cuyo dueno es ent. */
export function territories_of(game, ent) {
  const out = [];
  for (const cid of Object.keys(game.countries)) {
    if (game.countries[cid].owner === ent) out.push(cid);
  }
  return out;
}

/** Dueno actual del territorio. */
export function owner_of(game, cid) {
  return game.countries[cid].owner;
}

/** Una entidad vive si posee al menos un territorio. */
export function is_alive(game, ent) {
  return Object.values(game.countries).some((c) => c.owner === ent);
}

/** Entidades vivas (ordenadas). */
export function entities(game) {
  const s = new Set(Object.values(game.countries).map((c) => c.owner));
  return sortedBy([...s]);
}

/** Divisiones de una entidad. */
export function divisions_of(game, ent) {
  return game.divisions.filter((d) => d.owner === ent);
}

/** Divisiones ubicadas en un territorio. */
export function divisions_at(game, cid) {
  return game.divisions.filter((d) => d.location === cid);
}

/** Busca una division por id. */
export function find_division(game, did) {
  for (const d of game.divisions) {
    if (d.id === did) return d;
  }
  return null;
}

/** Poder bruto sin organizacion. */
export function raw_power(troops, tanks, planes) {
  return troops + tanks * C.TANK_POWER + planes * C.PLANE_POWER;
}

/** Poder de una division escalado por organizacion. */
export function division_power(d) {
  return raw_power(d.troops, d.tanks, d.planes) * d.org / 100.0;
}

/** Poder bruto total de una entidad. */
export function entity_power(game, ent) {
  let t = 0;
  for (const d of divisions_of(game, ent)) t += raw_power(d.troops, d.tanks, d.planes);
  return t;
}

/** Tropas totales de una entidad. */
export function entity_troops(game, ent) {
  let t = 0;
  for (const d of divisions_of(game, ent)) t += d.troops;
  return t;
}

/** Recalcula army/tanks/planes de cada territorio desde las divisiones ubicadas alli. */
export function sync_armies(game) {
  for (const c of Object.values(game.countries)) {
    c.army = 0.0; c.tanks = 0.0; c.planes = 0.0;
  }
  for (const d of game.divisions) {
    const c = game.countries[d.location];
    c.army += d.troops;
    c.tanks += d.tanks;
    c.planes += d.planes;
  }
  for (const c of Object.values(game.countries)) {
    for (const k of ['army', 'tanks', 'planes']) c[k] = pyRound(c[k], 1);
  }
}

/** Genera ids unicos por prefijo. */
export function next_id(game, prefix) {
  if (!('counters' in game)) game.counters = {};
  const counters = game.counters;
  counters[prefix] = (counters[prefix] || 0) + 1;
  return `${prefix}${counters[prefix]}`;
}

/** Agrega una linea al registro (y al reporte del turno en curso). */
export function add_log(game, text, kind = 'info') {
  game.logs.push({ turn: game.turn, text, kind });
  if (game.logs.length > C.MAX_LOGS) {
    game.logs.splice(0, game.logs.length - C.MAX_LOGS);
  }
  if ('_turn_lines' in game) game._turn_lines.push(text);
}

/** RNG determinista por semilla y turno. */
export function make_rng(game, salt = '') {
  if (!salt) return new PortableRandom(game.seed * 1000 + game.turn);
  return new PortableRandom(`${game.seed}-${game.turn}-${salt}`);
}

/** Rasgo fijo (por semilla) que marca a los agresivos. */
export function is_aggressive(game, ent) {
  return new PortableRandom(`agg-${game.seed}-${ent}`).random() < C.AI_AGGRESSIVE_SHARE;
}

/** Formato de dinero en pantalla (x10). */
export function money_str(value) {
  return `$${pyRound(value * 10)} M`;
}

/** Nombre en pantalla de un territorio/entidad. */
export function display_name(game, cid) {
  return game.countries[cid].name;
}

/** Crea una division. */
export function add_division(game, owner, location, name, troops, tanks, planes, stance = 'idle') {
  const d = {
    id: next_id(game, 'd'), name, owner, location,
    troops: Number(troops), tanks: Number(tanks), planes: Number(planes),
    stance, org: 100,
  };
  game.divisions.push(d);
  return d;
}

// ---------------------------------------------------------------- nueva partida
export function _initial_relations(game, rng) {
  const idx = country_index();
  const land = land_adjacency();
  const ids = Object.keys(idx);
  for (let i = 0; i < ids.length; i++) {
    const a = ids[i];
    for (let j = i + 1; j < ids.length; j++) {
      const b = ids[j];
      const ca = idx[a].alignment, cb = idx[b].alignment;
      let rel = 0;
      if (ca === cb) {
        rel += 20 + (ca === 'no_alineado' ? 5 : 0);
      } else if (ca === 'socialista' || cb === 'socialista') {
        rel -= 30;
      }
      const noise = land[a].has(b) ? 18 : 8;
      rel += rng.randint(-noise, noise);
      set_rel(game, a, b, rel);
    }
  }
}

export function _make_country(c) {
  const p = c.power;
  // Si existe campo "start", usar valores explícitos; si no, fórmula por power (compatibilidad)
  if ('start' in c && c.start) {
    const s = c.start;
    return {
      id: c.id, name: c.name, owner: c.id,
      money: Number(s.money), industry: Number(s.industry),
      production: Number(s.production), army: 0.0, tanks: 0.0, planes: 0.0,
      stability: Number(s.stability), development: Number(s.development),
      population: Number(s.population),
      infrastructure: Number(s.infrastructure),
      budget: { army: 25, social: 25, infrastructure: 25, industry: 25 },
      alignment: c.alignment, resources: Array.from(c.resources || []),
    };
  } else {
    return {
      id: c.id, name: c.name, owner: c.id,
      money: p * C.START_MONEY, industry: p * C.START_INDUSTRY,
      production: p * C.START_PRODUCTION, army: 0.0, tanks: 0.0, planes: 0.0,
      stability: C.START_STABILITY, development: pyRound(1 + p * 0.25, 2),
      population: (c.id in C.POP_OVERRIDE) ? C.POP_OVERRIDE[c.id] : p * C.START_POP_FACTOR,
      infrastructure: 30 + p * 4,
      budget: { army: 25, social: 25, infrastructure: 25, industry: 25 },
      alignment: c.alignment, resources: Array.from(c.resources || []),
    };
  }
}

export function _spawn_divisions(game) {
  for (const c of load_countries()) {
    const p = c.power;
    const cid = c.id;
    // Si existe campo "start", usar valores explícitos; si no, fórmula por power
    let army_total, tanks_total, planes_total;
    if ('start' in c && c.start) {
      const s = c.start;
      army_total = Number(s.army);
      tanks_total = Number(s.tanks);
      planes_total = Number(s.planes);
    } else {
      army_total = p * C.START_ARMY;
      tanks_total = p * C.START_TANKS;
      planes_total = p * C.START_PLANES;
    }
    const first = p >= 5 ? 'Infantería Motorizada' : 'Infantería';
    const second = ['Blindada', 'Mecanizada', 'Aerotransportada', 'de Caballería Blindada'][pymod(p, 4)];
    add_division(game, cid, cid, `1ª División de ${first}`, army_total * 0.6,
      tanks_total * 0.3, planes_total * 0.3, 'defend');
    add_division(game, cid, cid, `2ª División ${second}`, army_total * 0.4,
      tanks_total * 0.7, planes_total * 0.7, 'idle');
  }
}

/** Id de partida: 8 caracteres hexadecimales. */
function _new_game_id() {
  const bytes = new Uint8Array(4);
  const g = (typeof globalThis !== 'undefined') ? globalThis : {};
  if (g.crypto && typeof g.crypto.getRandomValues === 'function') {
    g.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 4; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

/** Crea una partida nueva con el pais `player`. */
export function new_game(player, seed = null, game_id = null, variant = 'latam') {
  use_variant(variant);
  const idx = country_index();
  if (!(player in idx)) throw new Error(_variant !== 'latam' && all_countries().some((c) => c.id === player) ? 'País fuera del mapa elegido.' : 'País desconocido.');
  if (seed === null || seed === undefined) seed = 1 + Math.floor(Math.random() * 1000000);
  else seed = Math.trunc(Number(seed));
  const countries = {};
  for (const c of load_countries()) countries[c.id] = _make_country(c);
  const game = {
    id: game_id || _new_game_id(), version: C.VERSION, player, variant: _variant,
    turn: 1, date: date_for_turn(1),
    countries,
    relations: {}, treaties: [], wars: [], divisions: [], orders: [],
    projects: [], logs: [], active_event: null, ended: false, winner: null,
    seed, counters: {}, zero_stability_turns: {}, result: null,
    loss_reason: null, last_report: null,
  };
  _initial_relations(game, new PortableRandom(seed));
  _spawn_divisions(game);
  sync_armies(game);
  add_log(game, `Enero de 1962. ${idx[player].name} entra en la Guerra Fría.`, 'info');
  return game;
}
