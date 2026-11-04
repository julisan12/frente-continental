// Suministro: la poblacion, la industria y el ejercito consumen recursos cada turno (alimentos, combustible,
// bienes, metal); la produccion sale de las provincias (recurso + edificios). La escasez penaliza (estabilidad,
// produccion, organizacion, descontento). Estado en game.ext.stock / game.ext.supply. Puro: sin DOM.
// Se invoca desde features.js (init/action/turn/pending) y desde orders.js (order_check) cuando game.ext existe.
//
// ESTADO (inicializacion perezosa):
//   game.ext.stock[cid]  : { food, fuel, goods, metal }   existencias (unidades abstractas)
//   game.ext.supply[cid] : { prod:{food,fuel,goods,metal}, cons:{...}, net:{...}, short:{food:0..1,...}, prev:{troops,tanks,planes} }
//                          informe del ultimo turno (para la UI) + snapshot para detectar producciones nuevas
//
// ACCIONES: { action:'buy', res, amount } compra en el mercado (precio crece con la cantidad y la escasez regional),
//           { action:'sell', res, amount }, { action:'trade', target, give, get, amount } (intercambio con otro pais).
//
import { ensure, ok, err } from './extutil.js';

export const RESOURCES = {
  food:  { name: 'Alimentos',   icon: 'wheat', color: '#8aa23f' },
  fuel:  { name: 'Combustible', icon: 'oil',   color: '#3d3732' },
  goods: { name: 'Bienes',      icon: 'box',   color: '#b98a3e' },
  metal: { name: 'Metal',       icon: 'ingot', color: '#8a8f99' },
};

// ------------------------------------------------------------------ interfaz estandar (la rellena el trabajador E)
export function init(game) {
  if (!game.ext) return;
  ensure(game.ext, 'stock', () => ({}));
  ensure(game.ext, 'supply', () => ({}));
}

/** Acciones del jugador. Devuelve null si la accion no es de este modulo. */
export function action(game, body) {
  void ok; void err; void game; void body;
  return null;
}

/** Fase de turno (tras units.turn). `lines`: lineas del informe del jugador. */
export function turn(game, rng, lines) {
  void game; void rng; void lines;
}

/** Decisiones/avisos pendientes para el carrusel: [{text, kind, screen}]. */
export function pending(game) {
  void game;
  return [];
}

/**
 * Gancho de orders.queue_order: devuelve un mensaje de error (string) si la orden economica `otype`
 * ('recruit'|'tanks'|'planes'|'build'|'project') no puede pagarse con las existencias, o null si procede.
 */
export function order_check(game, ent, otype, params) {
  void game; void ent; void otype; void params;
  return null;
}

/** Existencias de un pais (siempre un objeto). */
export function stock_of(game, cid) {
  if (!game.ext) return { food: 0, fuel: 0, goods: 0, metal: 0 };
  const st = ensure(game.ext, 'stock', () => ({}));
  return ensure(st, cid, () => ({ food: 0, fuel: 0, goods: 0, metal: 0 }));
}
