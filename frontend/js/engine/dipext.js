// Diplomacia ampliada (Tanda 2, trabajador C): ataque por sorpresa, provocaciones (empeorar relaciones
// a propósito) y límite/capacidad del ejército. Estado en game.ext.dip. Puro: sin DOM.
// Interfaz estándar de módulo (features.EXT_MODULES): init, action, turn, pending.
//
// ESTADO (inicialización perezosa; partidas antiguas no deben romperse):
//   game.ext.dip = { surprise_turn: int|null, provoked: { 'target': turn }, log: [{turn, kind, target, text}] }
//   game.ext.surprise = { by, target, mult, turn } | undefined   (bandera temporal leída por military._amult)
//
// ACCIONES (ext_action -> action(game, body)): devuelve {ok,msg}|{ok:false,error} o null si no es suya.
//   { action:'surprise_attack', target: cid, divs?: [divisionId] }   ataque inmediato sin declaración previa
//   { action:'provoke', target: cid, kind: 'incidente'|'embajador'|'propaganda' }  empeora relaciones
//
// API para otros módulos/UI:
//   army_cap(game, cid) -> capacidad máxima de tropas (k); army_used(game, cid) -> tropas actuales (k)
//   army_check(game, ent, otype, params) -> string|null  (motivo de rechazo de una orden de reclutamiento)
//   surprise_preview(game, target) -> { rel_all, rel_allies, stab, cost, mult } (penalizaciones previstas)
import { ensure, ok, err } from './extutil.js';

/** Catálogo de provocaciones (nombre, coste, efecto en relación, estabilidad propia). El trabajador C lo completa. */
export const PROVOKE = {
  incidente: { name: 'Incidente fronterizo', cost: 15, rel: -12, stab: -1, desc: 'Escaramuzas y detenciones en la frontera.' },
  embajador: { name: 'Expulsar embajador', cost: 25, rel: -25, stab: -2, desc: 'Ruptura formal de relaciones diplomáticas.' },
  propaganda: { name: 'Campaña hostil', cost: 20, rel: -18, stab: 0, desc: 'Radio y prensa contra el gobierno vecino.' },
};

/** Parámetros del ataque sorpresa (penalizaciones). El trabajador C los ajusta. */
export const SURPRISE = { cost: 30, mult: 1.3, stab: -6, rel_all: -25, rel_allies: -40, rel_target: -20 };

export function init(game) {
  if (!game.ext) return;
  ensure(game.ext, 'dip', () => ({ surprise_turn: null, provoked: {}, log: [] }));
}

/** Acciones del jugador. Devuelve null si la acción no es de este módulo. (Stub: el trabajador C lo implementa.) */
export function action(game, body) {
  if (!body || !body.action) return null;
  if (body.action === 'surprise_attack' || body.action === 'provoke') return err('Acción no disponible todavía.');
  return null;
}

/** Fase de turno (tras UNITS y SUPPLY). `lines` son líneas del informe del jugador. */
export function turn(game, rng, lines) {
  void game; void rng; void lines;
}

/** Decisiones pendientes para el carrusel: [{text, kind, screen}]. */
export function pending(game) {
  void game;
  return [];
}

// ------------------------------------------------------------------ límite del ejército
/** Capacidad máxima de tropas (en miles) de la entidad. Stub generoso; el trabajador C define la fórmula. */
export function army_cap(game, cid) {
  const c = game.countries[cid];
  if (!c) return 0;
  return Math.round(60 + (c.population || 0) * 10);
}

/** Tropas actuales (k) de la entidad. */
export function army_used(game, cid) {
  return (game.divisions || []).filter((d) => d.owner === cid).reduce((s, d) => s + (d.troops || 0), 0);
}

/** Motivo (string) por el que una orden de reclutamiento no cabe en la capacidad, o null si cabe. */
export function army_check(game, ent, otype, params) {
  void game; void ent; void otype; void params;
  return null;
}

/** Penalizaciones previstas de un ataque sorpresa contra `target` (para la UI). */
export function surprise_preview(game, target) {
  void game; void target;
  return { ...SURPRISE };
}
