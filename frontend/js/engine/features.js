// Sistemas ampliados (solo modo local): tecnologia, politica interna, bloques, pactos, espionaje,
// OEA, materias primas, indice de poder y logros. Todo el estado vive en game.ext.
// Este modulo NO toca el motor central: usa solo RNG nuevos (make_rng con sales propias) y se invoca
// desde localapi.js (ext_action al recibir una accion, ext_turn tras end_turn).
// Puro: sin DOM ni Node.

import {
  make_rng, get_rel, add_rel, at_war, enemies_of, is_alive, entities, country_index,
  land_adjacency, sync_armies, divisions_of, entity_power, territories_of,
} from './state.js';
import { init_prov, prov_attack, prov_build, prov_turn, prov_action, prov_lab_levels, prov_pending, use_game_geo } from './provinces.js';
import * as UNITS from './units.js';
import * as SUPPLY from './supply.js';
import * as DIPEXT from './dipext.js';
import * as AERO from './aero.js';
import { prov_labc_level } from './provinces.js';

/** Modulos de Tanda 1, 2 y 3 con interfaz estandar {init, action, turn, pending}. Orden fijo. */
export const EXT_MODULES = [UNITS, SUPPLY, DIPEXT, AERO];
const MODULE_SALT = ['units', 'supply', 'dipext', 'aero'];

const clampN = (v, a, b) => Math.min(b, Math.max(a, v));
const r2 = (x) => Math.round(x * 100) / 100;

// ------------------------------------------------------------------ catalogos
// Arbol de tecnologias. Campos: id, name, branch, cost (puntos), req (ids previos), lab (nivel del laboratorio nacional),
// labc (Tanda 3: nivel minimo de Laboratorio central en alguna provincia propia), desc, fx (efectos puntuales al completar).
// Las ramas de la Tanda 3 (unidades, edificios, moral, espionaje, misiles) desbloquean unidades (roster.tech/up) y edificios (BUILD.tech).
export const BRANCHES = [['inf', 'Infantería'], ['arm', 'Blindados'], ['art', 'Artillería'], ['air', 'Aviación'], ['nav', 'Marina'],
  ['mis', 'Misiles y ojivas'], ['bld', 'Edificios'], ['mor', 'Moral'], ['esp', 'Espionaje'], ['eco', 'Economía']];
export const TECHS = [
  // Infanteria
  { id: 'inf1', name: 'Doctrina de fusileros', branch: 'inf', cost: 2, req: [], lab: 0,
    desc: 'Entrenamiento moderno de la infantería de línea. +5% al poder de combate de la tropa.', fx: { def: 0.05 } },
  { id: 'inf2', name: 'Guerra de montaña y selva', branch: 'inf', cost: 3, req: ['inf1'], lab: 0,
    desc: 'Unidades especializadas en terreno difícil. +5% de ataque y +2% de defensa.', fx: { atk: 0.05, def: 0.02 } },
  { id: 'inf3', name: 'Movilización de reservas', branch: 'inf', cost: 5, req: ['inf2'], lab: 1,
    desc: 'Registro y entrenamiento de reservistas. +8% de efectivos y +1 de estabilidad.', fx: { def: 0.08, stab: 1 } },
  { id: 'inf4', name: 'Fuerzas especiales', branch: 'inf', cost: 7, req: ['inf3'], lab: 2,
    desc: 'Comandos para operaciones decisivas. +10% de ataque.', fx: { atk: 0.10 } },
  { id: 'inf_e1', name: 'Exploración I', branch: 'inf', cost: 2, req: [], lab: 0, desc: 'Mejora el pelotón de exploración: +10% de ataque, defensa y vida.', fx: {} },
  { id: 'inf_e2', name: 'Exploración II', branch: 'inf', cost: 3, req: ['inf_e1'], lab: 0, desc: 'Radios y prismáticos: +10% más al pelotón de exploración.', fx: {} },
  { id: 'inf_e3', name: 'Exploración III', branch: 'inf', cost: 4, req: ['inf_e2'], lab: 1, desc: 'Patrullas de largo alcance: +10% más al pelotón de exploración.', fx: {} },
  { id: 'inf_i1', name: 'Infantería I', branch: 'inf', cost: 2, req: ['inf1'], lab: 0, desc: 'Fusiles automáticos: +10% al pelotón de infantería.', fx: {} },
  { id: 'inf_i2', name: 'Infantería II', branch: 'inf', cost: 3, req: ['inf_i1'], lab: 0, desc: 'Morteros de pelotón: +10% más al pelotón de infantería.', fx: {} },
  { id: 'inf_i3', name: 'Infantería III', branch: 'inf', cost: 5, req: ['inf_i2'], lab: 1, desc: 'Chalecos y radios: +10% más al pelotón de infantería.', fx: {} },
  { id: 'mec1', name: 'Infantería mecanizada', branch: 'inf', cost: 3, req: ['arm1'], lab: 0, desc: 'Semiorugas para la tropa: desbloquea la infantería mecanizada (requiere taller).', fx: {} },
  { id: 'mec_u1', name: 'Mecanizada I', branch: 'inf', cost: 4, req: ['mec1'], lab: 0, desc: '+10% a la infantería mecanizada.', fx: {} },
  { id: 'mec_u2', name: 'Mecanizada II', branch: 'inf', cost: 6, req: ['mec_u1'], lab: 1, desc: '+10% más a la infantería mecanizada.', fx: {} },
  { id: 'elite', name: 'Escuadrón de élite', branch: 'inf', cost: 7, req: ['inf4'], lab: 2, labc: 1, desc: 'Boinas: desbloquea el escuadrón de élite. Requiere Laboratorio central.', fx: {} },
  { id: 'elite_u1', name: 'Élite: movilidad', branch: 'inf', cost: 5, req: ['elite'], lab: 2, desc: 'Transporte dedicado: el escuadrón de élite gana +1 de velocidad y +10%.', fx: {} },
  { id: 'elite_u2', name: 'Élite: veteranía', branch: 'inf', cost: 6, req: ['elite_u1'], lab: 2, desc: '+10% más al escuadrón de élite.', fx: {} },
  // Blindados
  { id: 'arm1', name: 'Motorización', branch: 'arm', cost: 3, req: [], lab: 0,
    desc: 'Camiones y transportes para la tropa. +5% de ataque de los blindados.', fx: { atk: 0.05 } },
  { id: 'arm_apc', name: 'APC', branch: 'arm', cost: 3, req: ['arm1'], lab: 0, desc: 'Carros blindados de transporte: desbloquea el APC (requiere taller).', fx: {} },
  { id: 'arm_at', name: 'Antitanque', branch: 'arm', cost: 4, req: ['arm_apc'], lab: 0, desc: 'Cañones sobre semioruga: desbloquea el antitanque.', fx: {} },
  { id: 'arm_tl', name: 'Tanque ligero', branch: 'arm', cost: 4, req: ['arm_apc'], lab: 0, desc: 'Desbloquea el tanque ligero (requiere taller nivel 2).', fx: {} },
  { id: 'arm2', name: 'Carros medios', branch: 'arm', cost: 4, req: ['arm1'], lab: 0,
    desc: 'Tanques de segunda generación. +6% de ataque y +3% de defensa.', fx: { atk: 0.06, def: 0.03 } },
  { id: 'arm_tm', name: 'Tanque mediano', branch: 'arm', cost: 6, req: ['arm_tl', 'arm2'], lab: 1, desc: 'Desbloquea el tanque mediano (requiere taller nivel 3).', fx: {} },
  { id: 'arm3', name: 'Blindaje compuesto', branch: 'arm', cost: 6, req: ['arm2'], lab: 1,
    desc: 'Mejor protección para las tripulaciones. +8% de defensa.', fx: { def: 0.08 } },
  { id: 'arm_tp', name: 'Tanque pesado', branch: 'arm', cost: 9, req: ['arm_tm', 'arm3'], lab: 2, labc: 2, desc: 'Desbloquea el tanque pesado (requiere fábrica). Exige Laboratorio central nivel 2.', fx: {} },
  { id: 'arm4', name: 'Guerra de maniobra', branch: 'arm', cost: 8, req: ['arm3'], lab: 2,
    desc: 'Doctrina de penetración profunda. +10% de ataque.', fx: { atk: 0.10 } },
  // Artilleria
  { id: 'art1', name: 'Artillería de campaña', branch: 'art', cost: 2, req: [], lab: 0,
    desc: 'Obuses estandarizados: desbloquea el cañón de artillería. +5% de ataque.', fx: { atk: 0.05 } },
  { id: 'art2', name: 'Control de fuego', branch: 'art', cost: 4, req: ['art1'], lab: 0,
    desc: 'Observadores y cálculo de tiro: +10% al cañón de artillería, +4% de ataque y defensa.', fx: { atk: 0.04, def: 0.04 } },
  { id: 'art3', name: 'Cohetes de saturación', branch: 'art', cost: 6, req: ['art2'], lab: 1,
    desc: 'Lanzacohetes múltiples: +10% más al cañón de artillería y +8% de ataque.', fx: { atk: 0.08 } },
  { id: 'art4', name: 'Defensa antiaérea', branch: 'art', cost: 7, req: ['art3'], lab: 2,
    desc: 'Baterías contra aviones. +10% de defensa.', fx: { def: 0.10 } },
  { id: 'art_cfort', name: 'Cañón de fortaleza', branch: 'art', cost: 4, req: ['art1'], lab: 0, desc: 'Piezas fijas de gran calibre: desbloquea el cañón de fortaleza (requiere fortaleza).', fx: {} },
  { id: 'art_cnav', name: 'Cañón naval', branch: 'art', cost: 5, req: ['art1', 'nav1'], lab: 0, desc: 'Baterías de costa: desbloquea el cañón naval (requiere puerto).', fx: {} },
  // Aviacion
  { id: 'air1', name: 'Cazas a reacción', branch: 'air', cost: 3, req: [], lab: 0,
    desc: 'Primera flota de reacción: desbloquea el caza (requiere aeropuerto). +5% de ataque aéreo.', fx: { atk: 0.05 } },
  { id: 'air2', name: 'Radar y alerta temprana', branch: 'air', cost: 4, req: ['air1'], lab: 0,
    desc: 'Detección de incursiones: permite construir radares. +5% de defensa.', fx: { def: 0.05 } },
  { id: 'air_heli', name: 'Helicópteros', branch: 'air', cost: 5, req: ['air1'], lab: 0, desc: 'Desbloquea el helicóptero de apoyo.', fx: {} },
  { id: 'air_bomb', name: 'Bombarderos', branch: 'air', cost: 5, req: ['air1'], lab: 0, desc: 'Desbloquea el bombardero.', fx: {} },
  { id: 'air_bomb2', name: 'Bombas mejoradas', branch: 'air', cost: 6, req: ['air_bomb'], lab: 1, desc: '+10% al bombardero.', fx: {} },
  { id: 'air_bomb3', name: 'Bombas pesadas', branch: 'air', cost: 8, req: ['air_bomb2'], lab: 1, desc: '+10% más al bombardero.', fx: {} },
  { id: 'air3', name: 'Bombarderos tácticos', branch: 'air', cost: 6, req: ['air2'], lab: 1,
    desc: 'Apoyo aéreo cercano. +8% de ataque.', fx: { atk: 0.08 } },
  { id: 'air_bestr', name: 'Bombardero estratégico', branch: 'air', cost: 7, req: ['air_bomb', 'air3'], lab: 1, desc: 'Desbloquea el bombardero estratégico (solo edificios y unidades estáticas).', fx: {} },
  { id: 'drone1', name: 'Drones', branch: 'air', cost: 6, req: ['air2'], lab: 1, desc: 'Desbloquea los drones explorador, kamikaze y señuelo (un solo uso).', fx: {} },
  { id: 'air_bpes', name: 'Bombardero pesado', branch: 'air', cost: 10, req: ['air_bestr'], lab: 2, labc: 2, desc: 'Desbloquea el bombardero pesado, capaz de cargar ojivas. Exige Laboratorio central nivel 2.', fx: {} },
  { id: 'air4', name: 'Supremacía aérea', branch: 'air', cost: 8, req: ['air3'], lab: 2,
    desc: 'Dominio del espacio aéreo: +10% al caza, +6% de ataque y defensa.', fx: { atk: 0.06, def: 0.06 } },
  // Marina
  { id: 'nav1', name: 'Flota de superficie', branch: 'nav', cost: 4, req: [], lab: 0, desc: 'Desbloquea el buque de guerra (requiere puerto y taller).', fx: {} },
  { id: 'nav_sub', name: 'Submarinos', branch: 'nav', cost: 6, req: ['nav1'], lab: 1, desc: 'Desbloquea el submarino.', fx: {} },
  { id: 'nav_porta', name: 'Portaaviones', branch: 'nav', cost: 10, req: ['nav1', 'air1'], lab: 2, desc: 'Desbloquea el portaaviones (puerto nivel 2 y fábrica).', fx: {} },
  // Misiles y ojivas
  { id: 'mis1', name: 'Batería de misiles M-1', branch: 'mis', cost: 7, req: ['art3'], lab: 1, labc: 1, desc: 'Misiles explosivos de alcance largo: desbloquea la batería de misiles. Exige Laboratorio central.', fx: {} },
  { id: 'mis2', name: 'Batería de misiles M-2', branch: 'mis', cost: 9, req: ['mis1'], lab: 2, labc: 2, desc: 'Modelo mejorado: +10% de daño a las baterías.', fx: {} },
  { id: 'mis3', name: 'Batería de misiles M-3', branch: 'mis', cost: 12, req: ['mis2'], lab: 2, labc: 3, desc: 'Modelo avanzado: +10% más de daño a las baterías.', fx: {} },
  { id: 'silo', name: 'Silos de misiles', branch: 'mis', cost: 10, req: ['mis2'], lab: 2, labc: 2, desc: 'Silos protegidos: las baterías ganan +1 de alcance y recargan un turno antes.', fx: {} },
  { id: 'oj_exp', name: 'Ojiva explosiva', branch: 'mis', cost: 6, req: ['air_bpes'], lab: 2, labc: 1, desc: 'Bombas de gran potencia para el bombardero pesado (×1,3 de daño).', fx: {} },
  { id: 'oj_nuc', name: 'Ojiva nuclear', branch: 'mis', cost: 14, req: ['oj_exp'], lab: 3, labc: 3, desc: 'Arma definitiva para el bombardero pesado (×2,5 de daño; gran coste diplomático).', fx: {} },
  { id: 'oj_bio', name: 'Ojiva bioquímica', branch: 'mis', cost: 12, req: ['oj_exp'], lab: 3, labc: 3, desc: 'Agente bioquímico para el bombardero pesado (×2 de daño y descontento en la provincia).', fx: {} },
  // Edificios
  { id: 'bld_aero', name: 'Aeropuertos', branch: 'bld', cost: 3, req: [], lab: 0, desc: 'Permite construir aeropuertos en las provincias.', fx: {} },
  { id: 'bld_puerto', name: 'Puertos militares', branch: 'bld', cost: 3, req: [], lab: 0, desc: 'Permite construir puertos en las provincias.', fx: {} },
  { id: 'bld_hosp', name: 'Hospitales de campaña', branch: 'bld', cost: 5, req: ['eco1'], lab: 1, desc: 'Permite construir hospitales que curan las unidades.', fx: {} },
  { id: 'bld_rail', name: 'Ferrocarril', branch: 'bld', cost: 6, req: ['eco1'], lab: 1, labc: 1, desc: 'Permite construir ferrocarriles. Exige Laboratorio central.', fx: {} },
  { id: 'bld_fab', name: 'Fábricas', branch: 'bld', cost: 7, req: ['eco2'], lab: 1, labc: 1, desc: 'Los talleres de nivel 3 pueden evolucionar a fábricas (niveles 4-6). Exige Laboratorio central.', fx: {} },
  // Moral
  { id: 'mor1', name: 'Propaganda nacional', branch: 'mor', cost: 3, req: [], lab: 0, desc: '+2 de estabilidad y −1 de descontento por turno en provincias ocupadas.', fx: { stab: 2, unrest: -1 } },
  { id: 'mor2', name: 'Servicios sociales', branch: 'mor', cost: 5, req: ['mor1'], lab: 1, desc: '+3 de estabilidad y −1 más de descontento por turno.', fx: { stab: 3, unrest: -1 } },
  { id: 'mor3', name: 'Orgullo patrio', branch: 'mor', cost: 7, req: ['mor2'], lab: 1, desc: '+4 de estabilidad, +5% de efectivos y la capital sube la moral de todo el país.', fx: { stab: 4, army: 0.05 } },
  // Espionaje
  { id: 'esp1', name: 'Red de informantes', branch: 'esp', cost: 3, req: [], lab: 0, desc: 'Las operaciones de espionaje cuestan un 20% menos.', fx: { spy_cost: -0.2 } },
  { id: 'esp2', name: 'Contraespionaje', branch: 'esp', cost: 5, req: ['esp1'], lab: 1, desc: 'Agentes mejor entrenados: −10 puntos de riesgo de captura.', fx: { spy_risk: -0.1 } },
  { id: 'esp3', name: 'Operaciones encubiertas', branch: 'esp', cost: 8, req: ['esp2'], lab: 1, labc: 1, desc: '−10 puntos más de riesgo y golpes de Estado más probables. Exige Laboratorio central.', fx: { spy_risk: -0.1 } },
  // Economia
  { id: 'eco1', name: 'Agricultura mecanizada', branch: 'eco', cost: 3, req: [], lab: 0,
    desc: 'Tractores y fertilizantes. +4% de industria y +1 de estabilidad.', fx: { ind: 0.04, stab: 1 } },
  { id: 'eco2', name: 'Petroquímica', branch: 'eco', cost: 5, req: ['eco1'], lab: 1,
    desc: 'Refinerías y plásticos. +6% de industria.', fx: { ind: 0.06 } },
  { id: 'eco3', name: 'Telecomunicaciones', branch: 'eco', cost: 6, req: ['eco1'], lab: 1,
    desc: 'Redes de radio y telefonía. +3% de industria y +0.2 de desarrollo.', fx: { ind: 0.03, dev: 0.2 } },
];
/** true si `cid` tiene investigada la tecnologia `id`. */
export function has_tech(game, cid, id) {
  const t = game && game.ext && game.ext.techs && game.ext.techs[cid];
  return !!(t && t.done && t.done.includes(id));
}
/** Suma de un efecto acumulable (spy_cost, spy_risk, unrest) de las tecnologias investigadas por `cid`. */
export function tech_fx_sum(game, cid, key) {
  const t = game && game.ext && game.ext.techs && game.ext.techs[cid];
  if (!t || !t.done) return 0;
  let s = 0;
  for (const id of t.done) { const tt = _tech(id); if (tt && tt.fx && tt.fx[key]) s += tt.fx[key]; }
  return s;
}

export const UNIT_INFO = {
  inf: { name: 'Infantería', atk: 3, def: 4, hp: 10, spd: 2, cost: 60,
    desc: 'Columna vertebral del ejército: barata, resistente y capaz de ocupar territorio.' },
  arm: { name: 'Blindados', atk: 8, def: 5, hp: 14, spd: 3, cost: 160,
    desc: 'Punta de lanza de las ofensivas. Caros, pero muy poderosos en terreno abierto.' },
  art: { name: 'Artillería', atk: 6, def: 2, hp: 7, spd: 1, cost: 110,
    desc: 'Fuego de apoyo que ablanda las defensas enemigas. Frágil si queda sola.' },
  air: { name: 'Aviación', atk: 9, def: 3, hp: 8, spd: 5, cost: 200,
    desc: 'Rápida y letal, golpea donde duele. Exige desarrollo industrial.' },
};

export const TAX = {
  baja: { name: 'Impuestos bajos', inc: 0.85, stab: 1 },
  media: { name: 'Impuestos medios', inc: 1, stab: 0 },
  alta: { name: 'Impuestos altos', inc: 1.2, stab: -1 },
};

export const LAWS = {
  eco: { name: 'Economía', opts: {
    civ: { name: 'Economía civil', desc: 'Prioriza el consumo y el comercio. +15% de ingresos, algo menos de reclutas.', mult: 1.15, fx: { troops: -0.003 } },
    mix: { name: 'Economía mixta', desc: 'Equilibrio entre civil y militar. Sin bonos ni penalizaciones.', mult: 1, fx: {} },
    war: { name: 'Economía de guerra', desc: 'La industria sirve al ejército. -15% de ingresos, más reclutas y menos estabilidad.', mult: 0.85, fx: { troops: 0.006, stab: -1 } },
  } },
  rec: { name: 'Reclutamiento', opts: {
    vol: { name: 'Voluntario', desc: 'Ejército profesional pequeño. Sin efectos.', fx: {} },
    lim: { name: 'Limitado', desc: 'Servicio selectivo. Algo más de tropas, -1 de estabilidad cada 4 turnos.', fx: { troops: 0.004, stab: -0.5 } },
    obl: { name: 'Obligatorio', desc: 'Servicio militar universal. Muchas tropas, pero descontento y menos población.', fx: { troops: 0.01, stab: -1, pop: -0.002 } },
  } },
  prensa: { name: 'Prensa', opts: {
    libre: { name: 'Prensa libre', desc: 'Crítica abierta. Mejor imagen exterior, estabilidad algo menor.', fx: { stab: -0.5, rel: 0.1 } },
    ctrl: { name: 'Prensa controlada', desc: 'Censura estatal. Más estabilidad, peor imagen exterior.', fx: { stab: 1, rel: -0.2 } },
  } },
  migr: { name: 'Migración', opts: {
    abierta: { name: 'Fronteras abiertas', desc: 'Llegan trabajadores. Crece la población y la industria, baja algo la estabilidad.', fx: { pop: 0.003, stab: -0.5 } },
    cerrada: { name: 'Fronteras cerradas', desc: 'Control migratorio estricto. Más estabilidad, población estancada.', fx: { stab: 0.5 } },
  } },
};

export const FOCI = [
  { id: 'industrializacion', name: 'Industrialización acelerada', desc: 'Fábricas por todo el país. +12% de industria.', turns: 4, fx: { ind: 0.12 } },
  { id: 'reforma_agraria', name: 'Reforma agraria', desc: 'Reparto de tierras. +4 de estabilidad y +0.2 de desarrollo.', turns: 4, fx: { stab: 4, dev: 0.2 } },
  { id: 'rearme', name: 'Programa de rearme', desc: 'Más tropas y vehículos. +10% de efectivos.', turns: 4, fx: { army: 0.10 } },
  { id: 'educacion', name: 'Campaña de alfabetización', desc: 'Escuelas rurales. +0.4 de desarrollo y puntos de investigación.', turns: 4, fx: { dev: 0.4, rp: 1 } },
  { id: 'infraestructura', name: 'Red vial nacional', desc: 'Carreteras y puertos. +10 de infraestructura.', turns: 4, fx: { infra: 10 } },
  { id: 'tesoro', name: 'Reforma fiscal', desc: 'Mejor recaudación. Ingreso único de dinero.', turns: 4, fx: { money: 90 } },
  { id: 'diplomacia', name: 'Ofensiva diplomática', desc: 'Giras y embajadas. +6 de relación con todos.', turns: 4, fx: { rel: 6 } },
  { id: 'orden', name: 'Plan de orden público', desc: 'Más policía y servicios. +6 de estabilidad.', turns: 4, fx: { stab: 6 } },
  { id: 'nacionalismo', name: 'Orgullo nacional', desc: 'Movilización patriótica. +3 de estabilidad y +5% de efectivos.', turns: 4, fx: { stab: 3, army: 0.05 } },
  { id: 'ciencia', name: 'Instituto de investigación', desc: 'Financia laboratorios. Puntos de investigación.', turns: 4, fx: { rp: 2.5 } },
  { id: 'explotacion', name: 'Explotación de recursos', desc: 'Minas y pozos a pleno. Dinero y +5% de industria.', turns: 4, fx: { money: 50, ind: 0.05 } },
  { id: 'modernizacion', name: 'Modernización del Estado', desc: 'Administración eficiente. +0.3 de desarrollo y +3% de industria.', turns: 4, fx: { dev: 0.3, ind: 0.03, stab: 1 } },
];

export const BLOCS = {
  mercosur: { name: 'Mercosur', desc: 'Mercado común del cono sur: comercio libre y coordinación aduanera.' },
  can: { name: 'Comunidad Andina', desc: 'Integración de los países andinos: aranceles comunes y cooperación.' },
  alba: { name: 'ALBA', desc: 'Alianza bolivariana de afinidad socialista y cooperación solidaria.' },
  sica: { name: 'SICA', desc: 'Sistema de integración centroamericano y del Caribe.' },
};

export const PACT_TYPES = {
  com: { name: 'Comercial', desc: 'Intercambio de bienes: ambos reciben ingresos extra cada turno.' },
  pna: { name: 'No agresión', desc: 'Compromiso de no atacarse mutuamente. Mejora la relación.' },
  def: { name: 'Defensa mutua', desc: 'Apoyo ante agresiones. Requiere mucha confianza.' },
  acc: { name: 'Acceso militar', desc: 'Permite el paso y las bases de tropas amigas.' },
};
export const PACT_MONTHS = [6, 12, 24];

export const SPY_OPS = {
  reveal: { name: 'Revelar', cost: 40, risk: 0.10, desc: 'Obtiene inteligencia sobre el objetivo durante 6 turnos.' },
  steal: { name: 'Robar tecnología', cost: 60, risk: 0.30, desc: 'Sustrae planos y avances: sumas puntos de investigación.' },
  sabotage: { name: 'Sabotaje', cost: 80, risk: 0.35, desc: 'Destruye parte de la industria del objetivo.' },
  coup: { name: 'Golpe de Estado', cost: 200, risk: 0.45, desc: 'Derroca al gobierno del objetivo. Más probable si es inestable.' },
};

export const ACHIEVEMENTS = [
  { id: 'regional', name: 'Potencia regional', desc: 'Sé la mayor potencia de tu región.' },
  { id: 'top3', name: 'Podio continental', desc: 'Entra entre las 3 mayores potencias.' },
  { id: 'eco', name: 'Gigante económico', desc: 'Lidera el continente en economía.' },
  { id: 'mil', name: 'Primer ejército', desc: 'Lidera el continente en poder militar.' },
  { id: 'hegemon', name: 'Hegemón', desc: 'Sé la primera potencia con 1.5 veces el poder de la segunda.' },
  { id: 'sabio', name: 'Sabio', desc: 'Investiga 8 tecnologías.' },
  { id: 'diplomatico', name: 'Diplomático', desc: 'Pertenece a 2 bloques regionales.' },
  { id: 'espia', name: 'Maestro espía', desc: 'Completa 3 operaciones de espionaje con éxito.' },
];

const _REGIONS_RAW = {
  norte: { name: 'Norte y Centroamérica', ids: ['Mexico', 'Guatemala', 'Belize', 'Honduras', 'El Salvador', 'Nicaragua', 'Costa Rica', 'Panama'] },
  caribe: { name: 'Caribe', ids: ['Cuba', 'Haiti', 'Dominican Rep.', 'Jamaica'] },
  andes: { name: 'Región Andina', ids: ['Colombia', 'Venezuela', 'Ecuador', 'Peru', 'Bolivia'] },
  sur: { name: 'Cono Sur', ids: ['Argentina', 'Chile', 'Uruguay', 'Paraguay'] },
  atl: { name: 'Atlántico', ids: ['Brazil', 'Guyana', 'Suriname'] },
};
export const REGIONS = {};
for (const [k, v] of Object.entries(_REGIONS_RAW)) REGIONS[k] = { name: v.name, ids: v.ids };

function _fixRegions() {
  let idx = null;
  try { idx = country_index(); } catch (e) { return; }
  for (const k of Object.keys(REGIONS)) REGIONS[k].ids = _REGIONS_RAW[k].ids.filter((i) => i in idx);
}

export const COMMODITIES = {
  cafe: { name: 'Café', res: ['café'] },
  cobre: { name: 'Cobre', res: ['cobre'] },
  petroleo: { name: 'Petróleo', res: ['petróleo'] },
  azucar: { name: 'Azúcar', res: ['azúcar'] },
  carne: { name: 'Carne', res: ['carne'] },
};

const INITIAL_BLOCS = {
  mercosur: ['Brazil', 'Argentina', 'Uruguay', 'Paraguay'],
  can: ['Colombia', 'Ecuador', 'Peru', 'Bolivia'],
  alba: ['Venezuela', 'Cuba', 'Nicaragua'],
  sica: ['Guatemala', 'Belize', 'Honduras', 'El Salvador', 'Nicaragua', 'Costa Rica', 'Panama', 'Dominican Rep.'],
};
const PACT_REL_MIN = { com: -10, pna: 0, def: 25, acc: 15 };
const PACT_REL_GAIN = { com: 4, pna: 8, def: 12, acc: 8 };
const LAB_MAX = 3;
const MAX_BLOCS = 2;

// ------------------------------------------------------------------ ayudantes
function _ids(game) { return Object.keys(game.countries); }
function _alive(game, cid) { return game.countries[cid] && game.countries[cid].owner === cid; }
function _aliveIds(game) { return _ids(game).filter((c) => _alive(game, c)); }
function _name(game, cid) { const c = game.countries[cid]; return c ? c.name : cid; }
function _tech(id) { return TECHS.find((t) => t.id === id) || null; }
const st_has = (e, cid, id) => !!(e.techs[cid] && e.techs[cid].done.includes(id));

function _blank_tech() { return { rp: 0, done: [], cur: null, prog: 0 }; }
function _blank_policy() {
  return { tax: 'media', laws: { eco: 'mix', rec: 'vol', prensa: 'libre', migr: 'abierta' }, focus: null, foci_done: [] };
}

function _news(game, text, kind = 'info') {
  const e = game.ext;
  e.news.push({ turn: game.turn, text, kind });
  if (e.news.length > 60) e.news.splice(0, e.news.length - 60);
}

function _ensure_country(game, cid) {
  const e = game.ext;
  if (!e.techs[cid]) e.techs[cid] = _blank_tech();
  if (e.labs[cid] === undefined) e.labs[cid] = 0;
  if (!e.policy[cid]) e.policy[cid] = _blank_policy();
  if (!e.policy[cid].laws) e.policy[cid].laws = _blank_policy().laws;
  if (!e.policy[cid].foci_done) e.policy[cid].foci_done = [];
  if (!e.intel[cid]) e.intel[cid] = {};
  if (!e.power[cid]) e.power[cid] = [];
  if (!e.ach[cid]) e.ach[cid] = [];
}

function _clampStab(c) { c.stability = clampN(c.stability, 0, 100); }

/** Aplica efectos puntuales (tecnologias y enfoques) a un pais. */
function _applyFx(game, cid, fx) {
  const c = game.countries[cid];
  if (!c) return;
  if (fx.ind) { c.industry = r2(c.industry * (1 + fx.ind)); c.production = r2(c.production * (1 + fx.ind * 0.5)); }
  if (fx.stab) { c.stability = r2(c.stability + fx.stab); _clampStab(c); }
  if (fx.dev) c.development = r2(clampN(c.development + fx.dev, 0, 10));
  if (fx.money) c.money = r2(c.money + fx.money);
  if (fx.infra) c.infrastructure = r2(clampN(c.infrastructure + fx.infra, 0, 100));
  if (fx.rp) _gainRp(game, cid, fx.rp);
  if (fx.rel) {
    for (const o of _aliveIds(game)) if (o !== cid) add_rel(game, cid, o, fx.rel);
  }
  const mt = (fx.atk || 0), md = (fx.def || 0), ma = (fx.army || 0);
  if (mt || md || ma) {
    for (const d of divisions_of(game, cid)) {
      if (md || ma) d.troops = r2(d.troops * (1 + md + ma));
      if (mt || ma) { d.tanks = r2(d.tanks * (1 + mt + ma)); d.planes = r2(d.planes * (1 + mt * 0.5)); }
    }
    sync_armies(game);
  }
}

function _gainRp(game, cid, x) {
  const t = game.ext.techs[cid];
  if (t.cur) t.prog = r2(t.prog + x); else t.rp = r2(t.rp + x);
}

function _bloc_ids_of(game, cid) {
  return Object.keys(game.ext.blocs).filter((b) => game.ext.blocs[b].includes(cid));
}

// ------------------------------------------------------------------ init
export function init_ext(game) {
  _fixRegions();
  try { use_game_geo(game); } catch (er) { /* geometria opcional */ }
  if (!game.ext) {
    game.ext = {
      v: 1, techs: {}, labs: {}, policy: {}, blocs: {}, pacts: [], intel: {}, spy_log: [],
      power: {}, ach: {}, prices: { cur: { cafe: 100, cobre: 100, petroleo: 100, azucar: 100, carne: 100 }, hist: [] },
      oas: [], news: [],
    };
    // Tanda 2: en el mapa "América del Sur" solo existen los paises de game.countries
    for (const b of Object.keys(INITIAL_BLOCS)) game.ext.blocs[b] = INITIAL_BLOCS[b].filter((i) => i in game.countries);
  }
  const e = game.ext;
  for (const k of ['techs', 'labs', 'policy', 'blocs', 'intel', 'power', 'ach']) if (!e[k]) e[k] = {};
  for (const k of ['pacts', 'spy_log', 'oas', 'news']) if (!e[k]) e[k] = [];
  if (!e.prices) e.prices = { cur: { cafe: 100, cobre: 100, petroleo: 100, azucar: 100, carne: 100 }, hist: [] };
  for (const cid of _ids(game)) _ensure_country(game, cid);
  const P = _power_all(game);
  for (const cid of _ids(game)) {
    const h = e.power[cid];
    if (!h.length || h[h.length - 1].turn !== game.turn) h.push({ turn: game.turn, ...P[cid] });
  }
  if (!e.prices.hist.length) e.prices.hist.push({ turn: game.turn, ...e.prices.cur });
  try { init_prov(game); } catch (er) { /* provincias opcionales */ }
  for (const m of EXT_MODULES) { try { m.init(game); } catch (er) { /* modulo opcional */ } }
  return game;
}

// ------------------------------------------------------------------ indice de poder
function _raw_all(game) {
  const raw = {};
  const ids = _ids(game);
  const e = game.ext;
  for (const cid of ids) {
    if (!_alive(game, cid)) { raw[cid] = null; continue; }
    const terr = territories_of(game, cid);
    let eco = 0, dev = 0;
    for (const t of terr) {
      const c = game.countries[t];
      eco += c.industry + c.production * 0.5 + Math.max(0, c.money) * 0.1;
      dev += c.development;
    }
    const mil = entity_power(game, cid);
    const techN = e && e.techs[cid] ? e.techs[cid].done.length : 0;
    const lab = e && e.labs[cid] ? e.labs[cid] : 0;
    let infl = 0;
    for (const o of ids) if (o !== cid && _alive(game, o)) infl += Math.max(0, get_rel(game, cid, o));
    infl += (e ? _bloc_ids_of(game, cid).length * 20 + e.pacts.filter((p) => p.a === cid || p.b === cid).length * 10 : 0);
    raw[cid] = { eco, mil, terr: terr.length, tech: techN * 3 + dev * 2 + lab * 2, infl };
  }
  return raw;
}

function _power_all(game) {
  const raw = _raw_all(game);
  const keys = ['eco', 'mil', 'terr', 'tech', 'infl'];
  const mx = {};
  for (const k of keys) mx[k] = Math.max(1e-9, ...Object.values(raw).filter(Boolean).map((r) => r[k]));
  const out = {};
  let mt = 1e-9;
  for (const cid of Object.keys(raw)) {
    const r = raw[cid];
    if (!r) { out[cid] = { total: 0, eco: 0, mil: 0, terr: 0, tech: 0, infl: 0 }; continue; }
    const o = {};
    for (const k of keys) o[k] = r2(100 * r[k] / mx[k]);
    o.total = o.eco * 0.35 + o.mil * 0.30 + o.terr * 0.15 + o.tech * 0.10 + o.infl * 0.10;
    mt = Math.max(mt, o.total);
    out[cid] = o;
  }
  for (const cid of Object.keys(out)) {
    const o = out[cid];
    out[cid] = { total: r2(100 * o.total / mt), eco: o.eco, mil: o.mil, terr: o.terr, tech: o.tech, infl: o.infl };
  }
  return out;
}

export function power_index(game, cid) {
  const P = _power_all(game);
  return P[cid] || { total: 0, eco: 0, mil: 0, terr: 0, tech: 0, infl: 0 };
}

export function odds(attack, defense) {
  const a = Math.max(0, Number(attack) || 0), d = Math.max(0, Number(defense) || 0);
  if (a + d <= 0) return 0.5;
  const ratio = (a + 1e-6) / (d + 1e-6);
  return clampN(1 / (1 + Math.exp(-2.2 * Math.log(ratio))), 0, 1);
}

export function research_rate(game, cid) {
  const c = game.countries[cid];
  if (!c || !_alive(game, cid)) return 0;
  const lab = game.ext && game.ext.labs[cid] ? game.ext.labs[cid] : 0;
  let plab = 0;
  try { plab = prov_lab_levels(game, cid) || 0; } catch (e) { plab = 0; }
  const rate = 0.24 + c.development * 0.06 + c.industry / 600 + lab * 0.25 + plab * 0.12;
  return r2(rate);
}

// ------------------------------------------------------------------ acciones del jugador
const ok = (msg) => ({ ok: true, msg });
const err = (error) => ({ ok: false, error });

function _bordersMember(game, cid, members) {
  const land = land_adjacency();
  return members.some((m) => m !== cid && land[cid] && land[cid].has(m));
}

export function ext_action(game, body) {
  if (!game.ext) init_ext(game);
  try { use_game_geo(game); } catch (er) { /* geometria opcional */ }
  if (game.ended) return err('La partida ya terminó.');
  const e = game.ext;
  const me = game.player;
  const pc = game.countries[me];
  _ensure_country(game, me);
  const b = body || {};
  switch (b.action) {
    case 'prov_attack': {
      init_prov(game);
      const r = prov_attack(game, me, b.pid, make_rng(game, 'prov' + b.pid), false);
      return r.ok ? ok(r.msg) : err(r.error);
    }
    case 'prov_build': {
      init_prov(game);
      const r = prov_build(game, me, b.pid, b.kind, false);
      return r.ok ? ok(r.msg) : err(r.error);
    }
    case 'research': {
      const t = _tech(b.tech);
      if (!t) return err('Tecnología desconocida.');
      const st = e.techs[me];
      if (st.done.includes(t.id)) return err('Esa tecnología ya está investigada.');
      if (st.cur === t.id) return err('Ya la estás investigando.');
      const missing = t.req.filter((r) => !st.done.includes(r));
      if (missing.length) return err(`Faltan requisitos: ${missing.map((r) => _tech(r).name).join(', ')}.`);
      if ((e.labs[me] || 0) < t.lab) return err(`Requiere laboratorio nivel ${t.lab}.`);
      if (t.labc) { let lc = 0; try { lc = prov_labc_level(game, me); } catch (er) { lc = 0; }
        if (lc < t.labc) return err(`Requiere Laboratorio central nivel ${t.labc} en alguna provincia.`); }
      if (st.cur) st.rp = r2(st.rp + st.prog * 0.5); // cambiar de proyecto pierde la mitad del avance
      st.cur = t.id; st.prog = r2(st.rp); st.rp = 0;
      return ok(`Investigación iniciada: ${t.name}.`);
    }
    case 'lab': {
      const lv = e.labs[me] || 0;
      if (lv >= LAB_MAX) return err('El laboratorio ya está al nivel máximo.');
      const cost = 70 * (lv + 1);
      if (pc.money < cost) return err(`Fondos insuficientes (se necesitan ${cost}).`);
      pc.money = r2(pc.money - cost);
      e.labs[me] = lv + 1;
      return ok(lv === 0 ? 'Laboratorio construido.' : `Laboratorio mejorado al nivel ${lv + 1}.`);
    }
    case 'tax': {
      if (!TAX[b.level]) return err('Nivel de impuestos inválido.');
      e.policy[me].tax = b.level;
      return ok(`${TAX[b.level].name} establecidos.`);
    }
    case 'law': {
      const L = LAWS[b.law];
      if (!L || !L.opts[b.value]) return err('Ley inválida.');
      if (e.policy[me].laws[b.law] === b.value) return err('Esa ley ya está vigente.');
      e.policy[me].laws[b.law] = b.value;
      return ok(`${L.name}: ${L.opts[b.value].name}.`);
    }
    case 'focus': {
      const pol = e.policy[me];
      const f = FOCI.find((x) => x.id === b.id);
      if (!f) return err('Enfoque desconocido.');
      if (pol.focus) return err('Ya hay un enfoque nacional en curso.');
      if (pol.foci_done.includes(f.id)) return err('Ese enfoque ya se completó.');
      pol.focus = { id: f.id, left: f.turns };
      return ok(`Enfoque nacional iniciado: ${f.name}.`);
    }
    case 'bloc_join': {
      const bl = BLOCS[b.bloc];
      if (!bl) return err('Bloque desconocido.');
      const members = e.blocs[b.bloc] || [];
      if (members.includes(me)) return err('Ya perteneces a ese bloque.');
      if (_bloc_ids_of(game, me).length >= MAX_BLOCS) return err(`Solo puedes pertenecer a ${MAX_BLOCS} bloques.`);
      if (!members.length) return err('El bloque no tiene miembros.');
      if (!_bordersMember(game, me, members)) return err('Debes tener frontera terrestre con algún miembro.');
      const ms = members.filter((m) => m !== me);
      const avg = ms.reduce((s, m) => s + get_rel(game, me, m), 0) / ms.length;
      if (avg < 10) return err(`Relación media insuficiente con los miembros (${Math.round(avg)}, se requiere 10).`);
      members.push(me);
      e.blocs[b.bloc] = members;
      for (const m of ms) add_rel(game, me, m, 8);
      _news(game, `${pc.name} ingresa a ${bl.name}.`, 'dip');
      return ok(`Ahora eres miembro de ${bl.name}.`);
    }
    case 'bloc_leave': {
      const bl = BLOCS[b.bloc];
      if (!bl) return err('Bloque desconocido.');
      const members = e.blocs[b.bloc] || [];
      if (!members.includes(me)) return err('No perteneces a ese bloque.');
      e.blocs[b.bloc] = members.filter((m) => m !== me);
      for (const m of e.blocs[b.bloc]) add_rel(game, me, m, -10);
      _news(game, `${pc.name} abandona ${bl.name}.`, 'dip');
      return ok(`Has salido de ${bl.name}.`);
    }
    case 'pact': {
      const pt = PACT_TYPES[b.type];
      const tgt = b.target;
      if (!pt) return err('Tipo de pacto inválido.');
      if (!PACT_MONTHS.includes(Number(b.months))) return err('Duración inválida.');
      if (!tgt || tgt === me || !_alive(game, tgt)) return err('Objetivo inválido.');
      if (at_war(game, me, tgt)) return err('No se puede pactar con un país en guerra contigo.');
      if (e.pacts.some((p) => p.type === b.type && ((p.a === me && p.b === tgt) || (p.a === tgt && p.b === me)))) {
        return err('Ya existe un pacto de ese tipo con ese país.');
      }
      const rel = get_rel(game, me, tgt);
      const need = PACT_REL_MIN[b.type];
      if (rel < need) {
        return err(`${_name(game, tgt)} rechaza el pacto ${pt.name.toLowerCase()}: la relación (${rel}) es menor a ${need}.`);
      }
      const months = Number(b.months);
      e.pacts.push({ type: b.type, a: me, b: tgt, since: game.turn, until: game.turn + months });
      add_rel(game, me, tgt, PACT_REL_GAIN[b.type]);
      _news(game, `Pacto ${pt.name.toLowerCase()} entre ${pc.name} y ${_name(game, tgt)} por ${months} meses.`, 'dip');
      return ok(`${_name(game, tgt)} acepta el pacto ${pt.name.toLowerCase()} por ${months} meses.`);
    }
    case 'pact_cancel': {
      let i = -1;
      if (Number.isInteger(b.index)) i = b.index;
      else i = e.pacts.findIndex((p) => p.type === b.type && (p.a === b.target || p.b === b.target) && (p.a === me || p.b === me));
      const p = e.pacts[i];
      if (!p || (p.a !== me && p.b !== me)) return err('Pacto no encontrado.');
      e.pacts.splice(i, 1);
      const other = p.a === me ? p.b : p.a;
      add_rel(game, me, other, -6);
      return ok(`Pacto con ${_name(game, other)} cancelado.`);
    }
    case 'spy': {
      const op = SPY_OPS[b.op];
      const tgt = b.target;
      if (!op) return err('Operación inválida.');
      if (!tgt || tgt === me || !_alive(game, tgt)) return err('Objetivo inválido.');
      const opCost = Math.round(op.cost * (1 + tech_fx_sum(game, me, 'spy_cost')));
      if (pc.money < opCost) return err(`Fondos insuficientes (se necesitan ${opCost}).`);
      pc.money = r2(pc.money - opCost);
      const rng = make_rng(game, 'spy' + game.turn + e.spy_log.length);
      const tc = game.countries[tgt];
      let risk = op.risk;
      if (b.op === 'coup') risk = tc.stability < 40 ? 0.35 : 0.75;
      risk = clampN(risk + tech_fx_sum(game, me, 'spy_risk'), 0.03, 0.95);
      const caught = rng.random() < (b.op === 'coup' ? Math.min(risk, 0.5) : risk);
      let success = !caught;
      if (b.op === 'coup' && success) success = rng.random() < (tc.stability < 40 ? 0.65 : 0.25) + (st_has(e, me, 'esp3') ? 0.15 : 0);
      const entry = { turn: game.turn, op: b.op, target: tgt, ok: success, caught };
      e.spy_log.push(entry);
      if (e.spy_log.length > 60) e.spy_log.splice(0, e.spy_log.length - 60);
      if (caught) {
        add_rel(game, me, tgt, -40);
        pc.stability = r2(pc.stability - 3); _clampStab(pc);
        _news(game, `Agentes de ${pc.name} capturados en ${tc.name} (${op.name.toLowerCase()}).`, 'spy');
        return ok(`Operación descubierta: -40 de relación con ${tc.name} y -3 de estabilidad.`);
      }
      if (!success) {
        _news(game, `Fracasa un intento de golpe en ${tc.name}.`, 'spy');
        return ok('La operación fracasó sin que te descubrieran.');
      }
      if (b.op === 'reveal') {
        e.intel[me][tgt] = game.turn + 6;
        return ok(`Inteligencia sobre ${tc.name} disponible durante 6 turnos.`);
      }
      if (b.op === 'steal') {
        const gain = 1.5 + rng.random() * 1.5;
        _gainRp(game, me, r2(gain));
        return ok(`Tecnología sustraída: +${r2(gain)} puntos de investigación.`);
      }
      if (b.op === 'sabotage') {
        const f = 0.08 + rng.random() * 0.07;
        tc.industry = r2(tc.industry * (1 - f));
        tc.production = r2(tc.production * (1 - f * 0.5));
        _news(game, `Sabotaje en la industria de ${tc.name}.`, 'spy');
        return ok(`Sabotaje exitoso: la industria de ${tc.name} cae ${Math.round(f * 100)}%.`);
      }
      // coup
      tc.stability = r2(Math.max(5, tc.stability - 30)); _clampStab(tc);
      tc.alignment = pc.alignment;
      add_rel(game, me, tgt, 15);
      for (const o of _aliveIds(game)) if (o !== me && o !== tgt) add_rel(game, o, tgt, -2);
      _news(game, `Golpe de Estado en ${tc.name}: nuevo gobierno de orientación ${pc.alignment}.`, 'spy');
      return ok(`Golpe de Estado exitoso en ${tc.name}.`);
    }
    case 'oas_vote': {
      const last = e.oas[e.oas.length - 1];
      if (!last) return err('No hay votaciones de la OEA.');
      if (last.player_vote) return err('Ya votaste en la última sesión.');
      if (b.vote !== 'yes' && b.vote !== 'no') return err('Voto inválido.');
      last.player_vote = b.vote;
      if (b.vote === 'yes') last.yes += 1; else last.no += 1;
      last.result = last.yes > last.no ? 'aprobada' : 'rechazada';
      return ok(`Voto registrado: ${b.vote === 'yes' ? 'a favor' : 'en contra'}.`);
    }
    default: {
      // Tanda 1: provincias (acciones nuevas) y modulos con interfaz estandar
      init_prov(game);
      let r = null;
      try { r = prov_action(game, me, b); } catch (e2) { r = err(e2 && e2.message ? e2.message : String(e2)); }
      if (r) return r.ok ? ok(r.msg) : err(r.error);
      for (const m of EXT_MODULES) {
        try { r = m.action(game, b); } catch (e2) { r = err(e2 && e2.message ? e2.message : String(e2)); }
        if (r) return r.ok ? ok(r.msg) : err(r.error);
      }
      return err('Acción desconocida.');
    }
  }
}

// ------------------------------------------------------------------ turno
const OAS_TOPICS = [
  'Condena a las intervenciones extranjeras', 'Fondo regional de desarrollo', 'Embargo comercial a un país miembro',
  'Misión de observación electoral', 'Pacto continental contra el comercio ilegal', 'Reforma de la carta de la OEA',
];

function _tech_effects_tick(game, cid) {
  const pol = game.ext.policy[cid];
  const c = game.countries[cid];
  const tax = TAX[pol.tax] || TAX.media;
  const eco = LAWS.eco.opts[pol.laws.eco] || LAWS.eco.opts.mix;
  const m = tax.inc * eco.mult;
  if (m !== 1) c.money = r2(c.money + c.industry * 0.2 * (m - 1) * 0.1 * 10 / 10);
  let dStab = tax.stab, troops = 0, pop = 0, rel = 0;
  for (const k of Object.keys(LAWS)) {
    const o = LAWS[k].opts[pol.laws[k]];
    if (!o || !o.fx) continue;
    dStab += o.fx.stab || 0; troops += o.fx.troops || 0; pop += o.fx.pop || 0; rel += o.fx.rel || 0;
  }
  if (game.turn % 4 === 0 && dStab) { c.stability = r2(c.stability + dStab); _clampStab(c); }
  if (troops) {
    for (const d of divisions_of(game, cid)) d.troops = r2(Math.max(0, d.troops * (1 + troops)));
    sync_armies(game);
  }
  if (pop) c.population = r2(Math.max(0, c.population * (1 + pop)));
  if (rel && game.turn % 6 === 0) for (const o of _aliveIds(game)) if (o !== cid) add_rel(game, cid, o, Math.round(rel * 6) || (rel > 0 ? 1 : -1));
}

// Objetivos de investigacion de la IA, por orden de prioridad (se llega a ellos pasando por sus requisitos).
const AI_TECH_GOALS = ['arm_apc', 'art1', 'air1', 'bld_aero', 'arm_tl', 'eco1', 'arm_at', 'air_bomb', 'arm2', 'arm_tm', 'air2', 'bld_puerto', 'nav1',
  'drone1', 'eco2', 'bld_fab', 'air_heli', 'nav_sub', 'art3', 'arm3', 'mis1', 'air3', 'air_bestr', 'arm_tp', 'nav_porta', 'mec1', 'air_bpes', 'elite', 'art_cfort', 'silo'];
const AI_RESEARCH_MULT = 1.4;   // la IA investiga algo mas rapido (llega a las unidades avanzadas a tiempo)
let _goalCache = null;
function _goal_rank() {
  // id de tecnica -> posicion del objetivo mas prioritario del que es requisito (o el propio objetivo)
  if (_goalCache) return _goalCache;
  const rank = {};
  const visit = (id, i) => {
    if (rank[id] !== undefined && rank[id] <= i) return;
    rank[id] = i;
    const t = TECHS.find((x) => x.id === id);
    if (t) for (const r of t.req) visit(r, i);
  };
  AI_TECH_GOALS.forEach((g, i) => visit(g, i));
  return (_goalCache = rank);
}

function _ai_pick_tech(game, cid, rng) {
  const st = game.ext.techs[cid];
  const lab = game.ext.labs[cid] || 0;
  let lc = 0; try { lc = prov_labc_level(game, cid); } catch (er) { lc = 0; }
  const opts = TECHS.filter((t) => !st.done.includes(t.id) && t.lab <= lab && (t.labc || 0) <= lc && t.req.every((r) => st.done.includes(r)));
  if (!opts.length) return null;
  // prioridad guiada hacia el ejercito avanzado, con algo de variedad (peso base para todas)
  const rank = _goal_rank();
  const ws = opts.map((t) => 0.4 + (rank[t.id] !== undefined ? 6 / (1 + rank[t.id] * 0.35) : 0));
  let r = rng.random() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < opts.length; i++) { r -= ws[i]; if (r <= 0) return opts[i].id; }
  return opts[opts.length - 1].id;
}

export function ext_turn(game) {
  if (!game.ext) init_ext(game);
  try { use_game_geo(game); } catch (er) { /* geometria opcional */ }
  const lines = [];
  if (game.ended) return lines;
  const e = game.ext;
  const me = game.player;
  const turn = game.turn;
  const alive = _aliveIds(game);
  for (const cid of _ids(game)) _ensure_country(game, cid);
  const rngAI = make_rng(game, 'extai');
  const rngEv = make_rng(game, 'extev');

  // --- investigacion, politica y enfoques
  for (const cid of alive) {
    const st = e.techs[cid];
    const c = game.countries[cid];
    // IA: laboratorio y enfoques ocasionales
    if (cid !== me) {
      if (turn % 6 === 0 && (e.labs[cid] || 0) < 2 && c.money > 200) {
        c.money = r2(c.money - 70 * ((e.labs[cid] || 0) + 1)); e.labs[cid] = (e.labs[cid] || 0) + 1;
      }
      const pol = e.policy[cid];
      if (!pol.focus && turn % 8 === 0) {
        const left = FOCI.filter((f) => !pol.foci_done.includes(f.id));
        if (left.length) { const f = left[Math.floor(rngAI.random() * left.length)]; pol.focus = { id: f.id, left: f.turns }; }
      }
      if (!st.cur) {
        const t = _ai_pick_tech(game, cid, rngAI);
        if (t) { st.cur = t; st.prog = st.rp; st.rp = 0; }
      }
    }
    if (st.cur) {
      st.prog = r2(st.prog + research_rate(game, cid) * (cid === me ? 1 : AI_RESEARCH_MULT));
      const t = _tech(st.cur);
      if (t && st.prog >= t.cost) {
        st.done.push(t.id);
        st.prog = r2(st.prog - t.cost);
        st.cur = null;
        _applyFx(game, cid, t.fx);
        if (cid === me) {
          lines.push(`Investigación completada: ${t.name}.`);
          _news(game, `${c.name} completa la investigación «${t.name}».`, 'tech');
        } else if (rngEv.random() < 0.35) {
          _news(game, `${c.name} desarrolla «${t.name}».`, 'tech');
        }
        if (cid === me) st.prog = 0;
      }
    }
    _tech_effects_tick(game, cid);
    const pol = e.policy[cid];
    if (pol.focus) {
      pol.focus.left -= 1;
      if (pol.focus.left <= 0) {
        const f = FOCI.find((x) => x.id === pol.focus.id);
        pol.focus = null;
        if (f) {
          pol.foci_done.push(f.id);
          _applyFx(game, cid, f.fx);
          if (cid === me) {
            lines.push(`Enfoque nacional completado: ${f.name}.`);
            _news(game, `${c.name} completa el enfoque «${f.name}».`, 'eco');
          }
        }
      }
    }
  }

  // --- pactos
  const keep = [];
  for (const p of e.pacts) {
    if (!_alive(game, p.a) || !_alive(game, p.b) || at_war(game, p.a, p.b)) {
      if (p.a === me || p.b === me) lines.push(`El pacto ${PACT_TYPES[p.type].name.toLowerCase()} con ${_name(game, p.a === me ? p.b : p.a)} se rompe.`);
      continue;
    }
    if (turn >= p.until) {
      if (p.a === me || p.b === me) {
        lines.push(`Expiró el pacto ${PACT_TYPES[p.type].name.toLowerCase()} con ${_name(game, p.a === me ? p.b : p.a)}.`);
        _news(game, `Expira el pacto ${PACT_TYPES[p.type].name.toLowerCase()} entre ${_name(game, p.a)} y ${_name(game, p.b)}.`, 'dip');
      }
      continue;
    }
    if (p.type === 'com') {
      for (const x of [p.a, p.b]) game.countries[x].money = r2(game.countries[x].money + game.countries[x].industry * 0.01);
    }
    keep.push(p);
  }
  e.pacts = keep;

  // --- bloques
  for (const bk of Object.keys(e.blocs)) {
    let mem = e.blocs[bk].filter((m) => _alive(game, m));
    for (const m of mem) game.countries[m].money = r2(game.countries[m].money + game.countries[m].industry * 0.008);
    const out = new Set();
    for (const w of game.wars) {
      if (mem.includes(w.a) && mem.includes(w.b)) out.add(w.a);
    }
    if (out.size) {
      mem = mem.filter((m) => !out.has(m));
      for (const m of out) {
        const msg = `${_name(game, m)} es expulsado de ${BLOCS[bk].name} por atacar a un miembro.`;
        _news(game, msg, 'dip');
        if (m === me) lines.push(msg);
      }
    }
    e.blocs[bk] = mem;
    if (turn % 12 === 6 && mem.length > 1) {
      for (let i = 0; i < mem.length; i++) for (let j = i + 1; j < mem.length; j++) add_rel(game, mem[i], mem[j], 2);
      _news(game, `Cumbre de ${BLOCS[bk].name}: los miembros estrechan lazos.`, 'dip');
      if (mem.includes(me)) lines.push(`Cumbre de ${BLOCS[bk].name}: +2 de relación entre miembros.`);
    }
  }

  // --- materias primas
  const pr = e.prices;
  const rngP = make_rng(game, 'extprice');
  for (const k of Object.keys(COMMODITIES)) {
    const p = pr.cur[k];
    const np = p * (1 + (rngP.random() - 0.5) * 0.1) + (100 - p) * 0.04;
    pr.cur[k] = r2(clampN(np, 40, 200));
  }
  pr.hist.push({ turn, ...pr.cur });
  if (pr.hist.length > 120) pr.hist.splice(0, pr.hist.length - 120);
  for (const cid of alive) {
    const c = game.countries[cid];
    let d = 0;
    for (const k of Object.keys(COMMODITIES)) {
      const n = (c.resources || []).filter((r) => COMMODITIES[k].res.includes(r)).length;
      d += n * (pr.cur[k] - 100) / 100 * 6;
    }
    if (d) c.money = r2(c.money + d);
  }

  // --- OEA cada 6 turnos
  if (turn % 6 === 0) {
    const topic = OAS_TOPICS[Math.floor(rngEv.random() * OAS_TOPICS.length)];
    const proposer = alive[Math.floor(rngEv.random() * alive.length)];
    let yes = 0, no = 0;
    for (const cid of alive) {
      if (cid === me) continue;
      const aff = get_rel(game, cid, proposer) + (game.countries[cid].alignment === game.countries[proposer].alignment ? 15 : -10) + (rngEv.random() - 0.5) * 40;
      if (cid === proposer || aff > 0) yes++; else no++;
    }
    e.oas.push({ turn, topic, yes, no, result: yes > no ? 'aprobada' : 'rechazada' });
    if (e.oas.length > 30) e.oas.splice(0, e.oas.length - 30);
    _news(game, `OEA: «${topic}» (${yes} a favor, ${no} en contra). Puedes emitir tu voto.`, 'dip');
    lines.push(`Sesión de la OEA: «${topic}». Puedes votar en Diplomacia.`);
  }

  // --- poder, historial y logros
  const P = _power_all(game);
  for (const cid of _ids(game)) {
    const h = e.power[cid];
    h.push({ turn, ...P[cid] });
    if (h.length > 240) h.splice(0, h.length - 240);
  }
  if (_alive(game, me)) {
    const got = e.ach[me];
    const grant = (id, cond) => {
      if (cond && !got.some((a) => a.id === id)) {
        got.push({ id, turn });
        const a = ACHIEVEMENTS.find((x) => x.id === id);
        lines.push(`Logro desbloqueado: ${a.name}.`);
        _news(game, `Logro desbloqueado: ${a.name}.`, 'info');
      }
    };
    const ranked = alive.slice().sort((a, b) => P[b].total - P[a].total);
    const region = Object.values(REGIONS).find((r) => r.ids.includes(me));
    const regTop = region ? region.ids.filter((i) => _alive(game, i)).sort((a, b) => P[b].total - P[a].total)[0] : null;
    grant('regional', regTop === me);
    grant('top3', ranked.indexOf(me) >= 0 && ranked.indexOf(me) < 3);
    grant('eco', alive.every((c) => P[me].eco >= P[c].eco));
    grant('mil', alive.every((c) => P[me].mil >= P[c].mil));
    const second = ranked[1] ? P[ranked[1]].total : 0;
    grant('hegemon', ranked[0] === me && P[me].total >= 1.5 * second && turn > 12);
    grant('sabio', e.techs[me].done.length >= 8);
    grant('diplomatico', _bloc_ids_of(game, me).length >= 2);
    grant('espia', e.spy_log.filter((s) => s.ok && !s.caught).length >= 3);
  }

  // --- noticias de guerra del turno (breves)
  for (const w of game.wars) {
    if ((w.a === me || w.b === me) && turn % 6 === 0) {
      _news(game, `Continúa la guerra entre ${_name(game, w.a)} y ${_name(game, w.b)}.`, 'war');
      break;
    }
  }
  try { prov_turn(game, make_rng(game, 'provai'), lines); } catch (er) { /* provincias opcionales */ }
  EXT_MODULES.forEach((m, i) => {
    try { m.turn(game, make_rng(game, 'ext-' + (MODULE_SALT[i] || i)), lines); } catch (er) { console && console.warn && console.warn('ext module turn', er); }
  });
  void enemies_of; void entities; void is_alive;
  return lines;
}

/** Decisiones y avisos pendientes del jugador (para el carrusel de noticias): [{text, kind, screen}]. */
export function ext_pending(game) {
  const out = [];
  if (!game || !game.ext) return out;
  try { out.push(...(prov_pending(game) || [])); } catch (e) { /* opcional */ }
  for (const m of EXT_MODULES) { try { out.push(...(m.pending(game) || [])); } catch (e) { /* opcional */ } }
  return out;
}
