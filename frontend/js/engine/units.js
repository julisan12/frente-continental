// Unidades especializadas, formaciones (agrupaciones), modificadores de combate (tipo y terreno),
// botin de guerra y descontento en provincias conquistadas. Estado en game.ext.* (ver abajo).
// Puro: sin DOM. Se invoca desde features.js (init/action/turn/pending) y mediante ganchos
// opcionales desde military.js / provinces.js. Cuando game.ext no existe, todos los ganchos son neutros.
//
// ESTADO (inicializacion perezosa; partidas antiguas no deben romperse):
//   game.divisions[i].kind : 'inf'|'mot'|'arm'|'art'|'mtn'|'mar'|'air'|'esp'  (si falta, se infiere por el nombre)
//   game.ext.forms[cid]    : [{ id, name, divs:[divisionId...] }]   formaciones (agrupaciones de divisiones)
//   game.ext.unrest[pid]   : 0..100  descontento en provincias ocupadas (dueno != pais original)
//   game.ext.loot          : [{ turn, by, from, money, text }]  registro de botin (max 40)
//
// ACCIONES (ext_action -> action(game, body)): devuelve {ok,msg}|{ok:false,error} o null si no es suya.
//   { action:'unit_recruit', kind, pid? }   recluta/produce una unidad del tipo en la provincia pid (propia) o en la capital
//   { action:'form_create', name, divs:[ids] } / { action:'form_dissolve', id } / { action:'form_order', id, type, target }
//
import { ensure, ok, err } from './extutil.js';

/** Catalogo de tipos de unidad. icon = nombre en icons.js ICON_PATHS; color para el mapa. */
export const UNIT_TYPES = {
  inf: { name: 'Infantería', icon: 'infantry', color: '#7b8a4a', troops: 12, tanks: 0, planes: 0, cost: 80, tech: null, needs: {},
    atk: 1.0, def: 1.15, desc: 'Columna vertebral del ejército: barata, sólida en defensa y en terreno difícil.' },
  mot: { name: 'Infantería motorizada', icon: 'truck', color: '#8a7a4a', troops: 10, tanks: 2, planes: 0, cost: 120, tech: 'arm1', needs: { fuel: 2 },
    atk: 1.1, def: 1.0, desc: 'Camiones y transportes: más rápida y con pegada en llanura.' },
  arm: { name: 'Blindados', icon: 'tank', color: '#5a6470', troops: 6, tanks: 6, planes: 0, cost: 170, tech: 'arm2', needs: { metal: 6, fuel: 4 },
    atk: 1.35, def: 1.0, desc: 'Punta de lanza en pampa y sabana; sufre en selva y montaña.' },
  art: { name: 'Artillería', icon: 'artillery', color: '#8a5a3a', troops: 6, tanks: 1, planes: 0, cost: 130, tech: 'art1', needs: { metal: 4 },
    atk: 1.25, def: 0.8, desc: 'Fuego de apoyo que ablanda fortificaciones. Frágil si queda sola.' },
  mtn: { name: 'Cazadores de montaña', icon: 'mountain', color: '#6b5a45', troops: 10, tanks: 0, planes: 0, cost: 110, tech: 'inf2', needs: {},
    atk: 1.05, def: 1.1, desc: 'Especialistas en montaña y altiplano.' },
  mar: { name: 'Infantería de marina', icon: 'anchor', color: '#4f7a9a', troops: 9, tanks: 0, planes: 0, cost: 130, tech: 'inf3', needs: { fuel: 1 },
    atk: 1.1, def: 1.0, desc: 'Sin penalización por desembarco marítimo.' },
  air: { name: 'Aviación táctica', icon: 'plane', color: '#4a9a8f', troops: 2, tanks: 0, planes: 4, cost: 200, tech: 'air1', needs: { fuel: 6, metal: 4 },
    atk: 1.3, def: 0.9, desc: 'Rápida y letal; exige combustible cada turno.' },
  esp: { name: 'Fuerzas especiales', icon: 'star', color: '#8a5a9a', troops: 5, tanks: 0, planes: 0, cost: 160, tech: 'inf4', needs: {},
    atk: 1.4, def: 1.0, desc: 'Comandos de élite: golpes decisivos y menos descontento en la ocupación.' },
};

/** Tipo de una division (si falta `kind`, se infiere por el nombre). */
export function kind_of(d) {
  if (d.kind && UNIT_TYPES[d.kind]) return d.kind;
  const n = String(d.name || '');
  if (/Blindad/i.test(n)) return 'arm';
  if (/Aerotransport|Aérea|Aerea/i.test(n)) return 'air';
  if (/Motorizad|Mecanizad|Caballer/i.test(n)) return 'mot';
  if (/Artiller/i.test(n)) return 'art';
  if (/Montaña|Montana/i.test(n)) return 'mtn';
  if (/Marina/i.test(n)) return 'mar';
  if (/Especial/i.test(n)) return 'esp';
  return 'inf';
}

// ------------------------------------------------------------------ interfaz estandar (la rellena el trabajador D)
export function init(game) {
  if (!game.ext) return;
  ensure(game.ext, 'forms', () => ({}));
  ensure(game.ext, 'unrest', () => ({}));
  ensure(game.ext, 'loot', () => []);
}

/** Acciones del jugador. Devuelve null si la accion no es de este modulo. */
export function action(game, body) {
  void ok; void err;
  return null;
}

/** Fase de turno (tras prov_turn). `lines` son lineas del informe del jugador. */
export function turn(game, rng, lines) {
  void game; void rng; void lines;
}

/** Decisiones pendientes para el carrusel de noticias: [{text, kind, screen}]. */
export function pending(game) {
  void game;
  return [];
}

// ------------------------------------------------------------------ ganchos (neutros sin ext)
/** Multiplicador de ataque de una division contra el territorio `target` (tipo + terreno). */
export function div_attack_mult(game, d, target) { void game; void d; void target; return 1.0; }
/** Multiplicador de defensa de una division en `target`. */
export function div_defense_mult(game, d, target) { void game; void d; void target; return 1.0; }
/** Conquista de un pais entero (military.capture): botin y descontento. */
export function on_capture(game, attacker, target, old_owner) { void game; void attacker; void target; void old_owner; }
/** Conquista de una provincia (provinces.prov_attack): botin y descontento. */
export function on_prov_capture(game, attacker, pid, old_owner) { void game; void attacker; void pid; void old_owner; }
