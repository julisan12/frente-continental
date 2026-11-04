// Catálogo de unidades de la Tanda 3 (datos puros, sin DOM ni Node). Lo usan el motor (units.js, aero.js,
// provinces.js) y la interfaz (art.js, unitsheet.js, army.js, provpanel.js, mapfx.js).
//
// Campos de cada unidad (ROSTER[kind]):
//   name        nombre en español            cls   clase: inf|arm|art|air|drone|nav|heli
//   icon        nombre en icons.js (D añade 'u_<kind>'); si falta, el mapa usa un icono genérico
//   color       color del marcador en el mapa
//   hp          vida base (1..25)            atk/def ataque y defensa base (1..20)
//   spd         velocidad 0..5 (0 = estática: no puede moverse; 1 = lenta: tras moverse queda 1 turno en 'marcha')
//   cost        dinero (unidades internas)   upkeep  mantenimiento extra por turno (dinero)
//   turns       turnos de producción base (los talleres los reducen)
//   troops/tanks/planes  composición de la división al completarse (vida 100 %); la vida actual = fuerza/composición
//   needs       recursos al reclutar {fuel, metal, goods}
//   tech        tecnología que la desbloquea (id de features.TECHS) o null
//   req         edificios necesarios en la provincia de producción: {taller, aeropuerto, puerto, labc, fuerte}
//   up          tecnologías que mejoran sus estadísticas (+10 % atk/def/hp cada una; elite_u1 además +1 spd)
//   tags        etiquetas para emparejamientos: tank, heavy, static, ground, ranged...
//   vs          multiplicador de ataque CONTRA (clave: kind | tag | cls); por defecto 1
//   dmg         multiplicador de daño RECIBIDO DESDE (clave: kind | tag | cls); por defecto 1
//   range       alcance en saltos de país para bombardeos/incursiones (aire: desde su aeropuerto base; art: 1)
//   reload      turnos de recarga tras un bombardeo/incursión (estado 'recarga')
//   single      true = un solo uso (drones)
//   static      true = no se mueve ni ataca otros territorios; solo defiende su provincia/país
//   onlyStatic  true = solo daña edificios y unidades estáticas (bombardero estratégico)
//   desc        texto corto
export const CLASS_NAME = { inf: 'Infantería', arm: 'Blindados', art: 'Artillería', air: 'Aviación', drone: 'Drones', nav: 'Marina', heli: 'Helicópteros' };

export const ROSTER = {
  // ---------------------------------------------------------------- infantería
  explo: { name: 'Pelotón de exploración', cls: 'inf', icon: 'u_explo', color: '#8a9a5a', hp: 6, atk: 3, def: 3, spd: 3, cost: 50, upkeep: 0.5, turns: 1,
    troops: 6, tanks: 0, planes: 0, needs: {}, tech: null, req: {}, up: ['inf_e1', 'inf_e2', 'inf_e3'], tags: ['ground'],
    vs: {}, dmg: {}, desc: 'La unidad más barata. Daño, defensa y vida bajos, pero rápida y útil para explorar.' },
  inf: { name: 'Pelotón de infantería', cls: 'inf', icon: 'u_inf', color: '#7b8a4a', hp: 8, atk: 4, def: 5, spd: 2, cost: 80, upkeep: 0.8, turns: 2,
    troops: 10, tanks: 0, planes: 0, needs: { goods: 1 }, tech: null, req: {}, up: ['inf_i1', 'inf_i2', 'inf_i3'], tags: ['ground'],
    vs: {}, dmg: {}, desc: 'La unidad con la que empieza todo país: ataque y defensa normales, algo mejores que la exploración.' },
  mec: { name: 'Infantería mecanizada', cls: 'inf', icon: 'u_mec', color: '#8a7a4a', hp: 8, atk: 6, def: 3, spd: 4, cost: 130, upkeep: 1.2, turns: 2,
    troops: 8, tanks: 1, planes: 0, needs: { fuel: 2, metal: 1 }, tech: 'mec1', req: { taller: 1 }, up: ['mec_u1', 'mec_u2'], tags: ['ground', 'mech'],
    vs: {}, dmg: {}, desc: 'Semiorugas: muy rápida y con pegada, pero pésima defendiendo.' },
  elite: { name: 'Escuadrón de élite', cls: 'inf', icon: 'u_elite', color: '#8a5a9a', hp: 9, atk: 9, def: 6, spd: 1, cost: 220, upkeep: 3, turns: 3,
    troops: 5, tanks: 0, planes: 0, needs: { goods: 2 }, tech: 'elite', req: {}, up: ['elite_u1', 'elite_u2'], tags: ['ground'],
    vs: { tm: 1.5, tp: 1.6 }, dmg: {}, desc: 'Boinas: el mayor ataque del ejército y buena defensa. Lenta, cara y letal contra tanques medianos y pesados.' },
  // ---------------------------------------------------------------- blindados
  apc: { name: 'APC', cls: 'arm', icon: 'u_apc', color: '#5a6470', hp: 10, atk: 4, def: 5, spd: 3, cost: 150, upkeep: 1.5, turns: 2,
    troops: 6, tanks: 2, planes: 0, needs: { metal: 3, fuel: 2 }, tech: 'arm_apc', req: { taller: 1 }, up: [], tags: ['ground', 'mech'],
    vs: {}, dmg: {}, desc: 'Carro blindado básico: más vida que la mecanizada y la élite, con el daño de un pelotón.' },
  at: { name: 'Antitanque', cls: 'arm', icon: 'u_at', color: '#6a5a40', hp: 7, atk: 6, def: 5, spd: 2, cost: 160, upkeep: 1.5, turns: 2,
    troops: 4, tanks: 2, planes: 0, needs: { metal: 4, fuel: 1 }, tech: 'arm_at', req: { taller: 1 }, up: [], tags: ['ground', 'mech'],
    vs: { tank: 1.8, inf: 0.6 }, dmg: {}, desc: 'Cañón sobre semioruga: devastador contra blindados, flojo contra la infantería.' },
  tl: { name: 'Tanque ligero', cls: 'arm', icon: 'u_tl', color: '#5f6a5a', hp: 12, atk: 6, def: 6, spd: 4, cost: 190, upkeep: 2, turns: 3,
    troops: 3, tanks: 4, planes: 0, needs: { metal: 5, fuel: 3 }, tech: 'arm_tl', req: { taller: 2 }, up: [], tags: ['ground', 'mech', 'tank'],
    vs: { inf: 1.3, tm: 0.7, tp: 0.6, at: 0.7 }, dmg: {}, desc: 'Algo más de vida y daño que el APC, rápido y eficaz contra infantería; sufre ante medianos, pesados y antitanques.' },
  tm: { name: 'Tanque mediano', cls: 'arm', icon: 'u_tm', color: '#4f5a60', hp: 15, atk: 8, def: 8, spd: 2, cost: 260, upkeep: 3, turns: 3,
    troops: 3, tanks: 5, planes: 0, needs: { metal: 7, fuel: 4 }, tech: 'arm_tm', req: { taller: 3 }, up: [], tags: ['ground', 'mech', 'tank'],
    vs: { at: 1.3, apc: 1.3, mec: 1.3, tp: 0.6 }, dmg: {}, desc: 'Mejor ataque, vida y defensa. Sin velocidad: fuerte contra antitanques, APC y mecanizada; débil ante pesados.' },
  tp: { name: 'Tanque pesado', cls: 'arm', icon: 'u_tp', color: '#3f4a50', hp: 22, atk: 12, def: 12, spd: 1, cost: 420, upkeep: 5, turns: 4,
    troops: 3, tanks: 7, planes: 0, needs: { metal: 12, fuel: 6 }, tech: 'arm_tp', req: { taller: 4 }, up: [], tags: ['ground', 'mech', 'tank', 'heavy', 'bld'],
    vs: { arm: 1.3, art: 1.4 }, dmg: { at: 4, elite: 4, bomb: 4, bpes: 4 }, desc: 'Mucho daño, defensa y vida; eficaz contra blindados y artillería y daña edificios. Muy lento y sufre ×4 ante antitanques, élite y bombarderos.' },
  // ---------------------------------------------------------------- artillería
  art: { name: 'Cañón de artillería', cls: 'art', icon: 'u_art', color: '#8a5a3a', hp: 6, atk: 7, def: 2, spd: 2, cost: 140, upkeep: 1.2, turns: 2,
    troops: 4, tanks: 1, planes: 0, needs: { metal: 3 }, tech: 'art1', req: {}, up: ['art2', 'art3'], tags: ['ground', 'ranged'], range: 1, reload: 1,
    vs: {}, dmg: {}, desc: 'Bombardea una provincia vecina sin recibir fuego de vuelta. Daño moderado, frágil cuerpo a cuerpo.' },
  cfort: { name: 'Cañón de fortaleza', cls: 'art', icon: 'u_cfort', color: '#6b5a45', hp: 14, atk: 7, def: 12, spd: 0, cost: 260, upkeep: 1.5, turns: 3,
    troops: 4, tanks: 2, planes: 0, needs: { metal: 6 }, tech: 'art_cfort', req: { fuerte: 1 }, up: [], tags: ['ground', 'static'], static: true,
    vs: {}, dmg: {}, desc: 'Unidad estática de provincia: cara, con gran defensa y vida. Ideal para sostener una posición.' },
  cnav: { name: 'Cañón naval', cls: 'art', icon: 'u_cnav', color: '#4f6a8a', hp: 12, atk: 8, def: 10, spd: 0, cost: 260, upkeep: 1.5, turns: 3,
    troops: 4, tanks: 2, planes: 0, needs: { metal: 6 }, tech: 'art_cnav', req: { puerto: 1 }, up: [], tags: ['ground', 'static'], static: true,
    vs: { nav: 2.0 }, dmg: {}, desc: 'Como el cañón de fortaleza, pero con bonificación de daño contra barcos y portaaviones.' },
  misil: { name: 'Batería de misiles', cls: 'art', icon: 'u_misil', color: '#8a3a3a', hp: 5, atk: 10, def: 2, spd: 1, cost: 350, upkeep: 3, turns: 4,
    troops: 3, tanks: 2, planes: 0, needs: { metal: 8, goods: 3 }, tech: 'mis1', req: { taller: 3, labc: 1 }, up: ['mis2', 'mis3'], tags: ['ground', 'ranged'], range: 2, reload: 3,
    vs: {}, dmg: {}, desc: 'Misiles explosivos de alcance largo: golpea rápido y luego pasa varios turnos en recarga. Los modelos se desbloquean investigando.' },
  // ---------------------------------------------------------------- aviación (necesitan aeropuerto y radio de acción)
  caza: { name: 'Caza', cls: 'air', icon: 'u_caza', color: '#4a9a8f', hp: 8, atk: 7, def: 5, spd: 5, cost: 220, upkeep: 2.5, turns: 3,
    troops: 1, tanks: 0, planes: 3, needs: { fuel: 5, metal: 4 }, tech: 'air1', req: { aeropuerto: 1, taller: 2 }, up: ['air4'], tags: ['flying'], range: 2, reload: 1,
    vs: { air: 1.6, heli: 1.5, drone: 1.5, ground: 0.6, nav: 0.7 }, dmg: {}, desc: 'Eficaz contra aviones, helicópteros y drones; en desventaja contra todo lo demás.' },
  bestr: { name: 'Bombardero estratégico', cls: 'air', icon: 'u_bestr', color: '#3a6a70', hp: 9, atk: 9, def: 3, spd: 4, cost: 300, upkeep: 3, turns: 3,
    troops: 1, tanks: 0, planes: 3, needs: { fuel: 6, metal: 5 }, tech: 'air_bestr', req: { aeropuerto: 2, taller: 3 }, up: [], tags: ['flying'], range: 2, reload: 1, onlyStatic: true,
    vs: { static: 1.5 }, dmg: {}, desc: 'Solo daña edificios y unidades estáticas: avenidas, ferrocarriles, fortalezas y cañones de fortaleza o navales.' },
  bomb: { name: 'Bombardero', cls: 'air', icon: 'u_bomb', color: '#3f7a80', hp: 9, atk: 8, def: 3, spd: 4, cost: 280, upkeep: 3, turns: 3,
    troops: 1, tanks: 0, planes: 3, needs: { fuel: 6, metal: 5 }, tech: 'air_bomb', req: { aeropuerto: 1, taller: 2 }, up: ['air_bomb2', 'air_bomb3'], tags: ['flying'], range: 2, reload: 1,
    vs: { arm: 1.2 }, dmg: { caza: 1.5 }, desc: 'Sus bombas son más eficaces con cada nivel de investigación. Castiga especialmente a los tanques pesados.' },
  bpes: { name: 'Bombardero pesado', cls: 'air', icon: 'u_bpes', color: '#2f5a66', hp: 12, atk: 12, def: 3, spd: 3, cost: 450, upkeep: 4, turns: 4,
    troops: 1, tanks: 0, planes: 4, needs: { fuel: 9, metal: 8 }, tech: 'air_bpes', req: { aeropuerto: 3, taller: 4, labc: 2 }, up: [], tags: ['flying'], range: 3, reload: 2,
    vs: { arm: 1.2, bld: 1.3 }, dmg: { caza: 1.5 }, desc: 'Puede cargar ojivas explosivas, nucleares o bioquímicas (según investigación).' },
  heli: { name: 'Helicóptero', cls: 'heli', icon: 'u_heli', color: '#5a8a7a', hp: 7, atk: 6, def: 4, spd: 4, cost: 240, upkeep: 2.5, turns: 3,
    troops: 2, tanks: 0, planes: 2, needs: { fuel: 4, metal: 3 }, tech: 'air_heli', req: { aeropuerto: 1, taller: 2 }, up: [], tags: ['flying'], range: 1, reload: 1,
    vs: { arm: 1.3, inf: 1.1 }, dmg: { caza: 1.5 }, desc: 'Apoyo cercano: bueno contra blindados, vulnerable a los cazas. Radio corto.' },
  // ---------------------------------------------------------------- drones (un solo uso)
  dexp: { name: 'Dron explorador', cls: 'drone', icon: 'u_dexp', color: '#7a8a8a', hp: 2, atk: 0, def: 1, spd: 5, cost: 40, upkeep: 0, turns: 1,
    troops: 0.5, tanks: 0, planes: 1, needs: { goods: 1 }, tech: 'drone1', req: { aeropuerto: 1 }, up: [], tags: ['flying'], range: 3, single: true,
    vs: {}, dmg: {}, desc: 'Un solo uso: revela las tropas y edificios de un país durante 6 turnos.' },
  dkam: { name: 'Dron kamikaze', cls: 'drone', icon: 'u_dkam', color: '#8a4a3a', hp: 2, atk: 8, def: 1, spd: 5, cost: 90, upkeep: 0, turns: 1,
    troops: 0.5, tanks: 0, planes: 1, needs: { goods: 1, metal: 2 }, tech: 'drone1', req: { aeropuerto: 1 }, up: [], tags: ['flying'], range: 2, single: true,
    vs: { arm: 1.3, art: 1.3 }, dmg: {}, desc: 'Un solo uso: se estrella contra una provincia enemiga causando daño.' },
  dsen: { name: 'Dron señuelo', cls: 'drone', icon: 'u_dsen', color: '#8a8a5a', hp: 2, atk: 0, def: 1, spd: 5, cost: 60, upkeep: 0, turns: 1,
    troops: 0.5, tanks: 0, planes: 1, needs: { goods: 1 }, tech: 'drone1', req: { aeropuerto: 1 }, up: [], tags: ['flying'], range: 2, single: true,
    vs: {}, dmg: {}, desc: 'Un solo uso: engaña al enemigo y reduce un 20 % el próximo ataque contra la provincia elegida.' },
  // ---------------------------------------------------------------- marina (necesitan puerto + taller)
  barco: { name: 'Buque de guerra', cls: 'nav', icon: 'u_barco', color: '#3f6a9a', hp: 16, atk: 9, def: 9, spd: 3, cost: 320, upkeep: 3, turns: 4,
    troops: 2, tanks: 3, planes: 0, needs: { metal: 8, fuel: 4 }, tech: 'nav1', req: { puerto: 1, taller: 2 }, up: [], tags: ['naval'],
    vs: { nav: 1.2 }, dmg: { cnav: 2 }, desc: 'Escolta y bombardeo costero. Sin penalización por ruta marítima.' },
  sub: { name: 'Submarino', cls: 'nav', icon: 'u_sub', color: '#2f4a6a', hp: 9, atk: 10, def: 5, spd: 3, cost: 300, upkeep: 2.5, turns: 4,
    troops: 1, tanks: 2, planes: 0, needs: { metal: 7, fuel: 4 }, tech: 'nav_sub', req: { puerto: 1, taller: 3 }, up: [], tags: ['naval'],
    vs: { nav: 1.5, porta: 1.8 }, dmg: { cnav: 2 }, desc: 'Cazador silencioso: gran daño a barcos y portaaviones, poca defensa.' },
  porta: { name: 'Portaaviones', cls: 'nav', icon: 'u_porta', color: '#4a5a8a', hp: 20, atk: 6, def: 8, spd: 2, cost: 600, upkeep: 5, turns: 5,
    troops: 2, tanks: 2, planes: 4, needs: { metal: 14, fuel: 8 }, tech: 'nav_porta', req: { puerto: 2, taller: 4 }, up: [], tags: ['naval', 'airbase'],
    vs: {}, dmg: { cnav: 2, sub: 1.5 }, desc: 'Aeropuerto flotante: sostiene 2 aeronaves lejos de casa.' },
};
export const KINDS = Object.keys(ROSTER);

/** Tipos de la Tanda 1/2 → tipos nuevos (migración perezosa de partidas guardadas). */
export const MIGRATE_KIND = { mot: 'mec', arm: 'tl', mtn: 'inf', mar: 'inf', air: 'caza', esp: 'elite' };

/** Grupo de suelo de cada código de terreno de data/provinces.js. */
export const TERRAIN_GROUP = { B: 'bosque', S: 'bosque', T: 'bosque', M: 'montana', A: 'montana', P: 'llano', V: 'llano', E: 'llano', D: 'llano' };
export const SOIL_NAME = { bosque: 'Bosque', montana: 'Montaña', llano: 'Llano' };
/**
 * Modificadores de suelo por clase: atk/def = multiplicador de ataque/defensa; dmg = daño recibido;
 * move = bonificación de movimiento (1 = +1 de velocidad para todos en llano).
 *   bosque:  mecanizados/blindados ×0,8; infantería ×1,2.
 *   montaña: artillería a distancia ×1,25 atacando; blindados ×0,7; infantería ×0,85.
 *   llano:   blindados ×1,25; +1 velocidad a todos; infantería recibe ×1,25 de daño; artillería ×0,8 solo defendiendo.
 */
export const SOIL_MODS = {
  bosque: { inf: { atk: 1.2, def: 1.2 }, mech: { atk: 0.8, def: 0.8 }, arm: { atk: 0.8, def: 0.8 }, move: 0 },
  montana: { art: { atk: 1.25 }, arm: { atk: 0.7, def: 0.7 }, inf: { atk: 0.85, def: 0.85 }, move: 0 },
  llano: { arm: { atk: 1.25, def: 1.25 }, inf: { dmg: 1.25 }, art: { def: 0.8 }, move: 1 },
};

/** Multiplicador {atk, def, dmg} de la unidad `kind` sobre el código de terreno `t` (p.ej. 'M'). */
export function soil_mods(kind, t) {
  const out = { atk: 1, def: 1, dmg: 1, move: 0 };
  const g = TERRAIN_GROUP[t]; const ut = ROSTER[kind];
  if (!g || !ut) return out;
  const M = SOIL_MODS[g];
  out.move = M.move || 0;
  const keys = [ut.cls, ...(ut.tags || [])];
  for (const k of keys) {
    const m = M[k]; if (!m) continue;
    if (m.atk) out.atk *= m.atk; if (m.def) out.def *= m.def; if (m.dmg) out.dmg *= m.dmg;
  }
  return out;
}

/** Busca `key` en una tabla vs/dmg por kind, etiqueta o clase de la unidad `other`. */
export function lookup(table, other) {
  if (!table || !other) return 1;
  const ut = ROSTER[other];
  if (table[other] != null) return table[other];
  if (ut) {
    for (const t of ut.tags || []) if (table[t] != null) return table[t];
    if (table[ut.cls] != null) return table[ut.cls];
  }
  return 1;
}
