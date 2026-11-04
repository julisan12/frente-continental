// Tanda 3, trabajador C: aviación, aeropuertos, drones, baterías de misiles, bombardeo de artillería a distancia,
// radares, marina y helicópteros. Módulo con la interfaz estándar de features.EXT_MODULES {init, action, turn, pending}.
// Puro: sin DOM. Todo el estado nuevo vive en game.ext.* con inicialización PEREZOSA.
//
// ESTADO (propuesta; C puede ampliarlo):
//   game.divisions[i].base   pid del aeropuerto/puerto base de una aeronave/dron/barco (null = sin base)
//   game.divisions[i].st     estado: undefined | 'recarga' (aeronave/misil tras un ataque) | 'carga' (ferrocarril) | 'marcha' (unidad lenta)
//   game.divisions[i].rl     turnos de recarga restantes (st === 'recarga')
//   game.ext.aero = { strikes: [{turn, by, kind, pid, text}], decoys: {pid: turn}, intel: {cid: {by: turn}} }
//
// ACCIONES (ext_action -> action(game, body)): devuelve {ok,msg}|{ok:false,error} o null si no es suya.
//   { action:'strike', div, pid }      bombardeo/incursión de art|misil|bomb|bpes|bestr|heli|dkam sobre la provincia pid
//   { action:'drone', div, pid|cid }   dron explorador (revela) o señuelo (protege una provincia)
//   { action:'rebase', div, pid }      cambia el aeropuerto/puerto base de una aeronave o barco
//
// GANCHOS que usan otros módulos (mantener firmas):
//   can_act(game, d) -> bool               false si la división está en recarga/en carga/marcha (no ataca ni defiende)
//   recruit_check(game, ent, kind, pid) -> string|null   motivo por el que no cabe otra aeronave/barco en pid (capacidad)
//   strike_targets(game, d) -> [pid]       provincias enemigas alcanzables por la división d
//   on_prov_lost(game, pid, old_owner)     el aeropuerto/puerto de pid cambió de dueño: reubicar o perder aeronaves
//   range_ok(game, d, cid) -> bool         el país cid está dentro del radio de la aeronave d desde su base
import { ensure, ok, err, news } from './extutil.js';
import { ROSTER } from './roster.js';

export const AIRPORT_CAP = 2;     // aeronaves (aviones + drones + helicópteros) por nivel de aeropuerto
export const PORT_CAP = 2;        // barcos por nivel de puerto

export function init(game) {
  if (!game.ext) return;
  ensure(game.ext, 'aero', () => ({ strikes: [], decoys: {}, intel: {} }));
}

export function action(game, body) {
  void game; void body; void ok; void err; void news; void ROSTER;
  return null; // TODO(C): strike / drone / rebase
}

export function turn(game, rng, lines) {
  void game; void rng; void lines; // TODO(C): recargas, radio de acción, IA, radar, curación en puertos/aeropuertos
}

export function pending(game) {
  void game;
  return [];
}

export function can_act(game, d) {
  void game;
  return !(d && (d.st === 'recarga' || d.st === 'carga' || d.st === 'marcha'));
}
export function recruit_check(game, ent, kind, pid) { void game; void ent; void kind; void pid; return null; }
export function strike_targets(game, d) { void game; void d; return []; }
export function on_prov_lost(game, pid, old_owner) { void game; void pid; void old_owner; }
export function range_ok(game, d, cid) { void game; void d; void cid; return true; }
