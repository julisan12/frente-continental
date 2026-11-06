// Escenarios: recreaciones de guerras latinoamericanas sobre el mismo motor.
// Cada escenario fija año de inicio, guerras y alianzas iniciales. 'guerra_fria' es el clásico (sin cambios).
import * as S from './state.js';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export const SCENARIOS = {
  guerra_fria: {
    name: 'Guerra Fría (1962)', year: 1962, variant: null, suggest: [],
    desc: 'La partida clásica: paz frágil, bloques y revoluciones. Tú decides quién dispara primero.',
    wars: [], alliances: [],
  },
  pacifico: {
    name: 'Guerra del Pacífico (1879)', year: 1879, variant: 'sur', suggest: ['Chile', 'Peru', 'Bolivia'],
    desc: 'Chile contra la alianza de Perú y Bolivia por el salitre de Atacama.',
    wars: [['Chile', 'Peru'], ['Chile', 'Bolivia']], alliances: [['Peru', 'Bolivia']],
    hostile: [['Argentina', 'Chile']],
  },
  chaco: {
    name: 'Guerra del Chaco (1932)', year: 1932, variant: 'sur', suggest: ['Bolivia', 'Paraguay'],
    desc: 'Bolivia y Paraguay se disputan el Chaco Boreal; el resto del continente observa.',
    wars: [['Bolivia', 'Paraguay']], alliances: [],
    hostile: [['Argentina', 'Bolivia']],
  },
  futbol: {
    name: 'Guerra del Fútbol (1969)', year: 1969, variant: 'latam', suggest: ['Honduras', 'El Salvador'],
    desc: 'Honduras y El Salvador van a la guerra tras las eliminatorias del Mundial.',
    wars: [['Honduras', 'El Salvador']], alliances: [],
    hostile: [['Guatemala', 'Honduras']],
  },
  beagle: {
    name: 'Conflicto del Beagle (1978)', year: 1978, variant: 'sur', suggest: ['Argentina', 'Chile'],
    desc: 'Argentina y Chile al borde de la guerra por las islas del canal Beagle.',
    wars: [['Argentina', 'Chile']], alliances: [],
    hostile: [['Peru', 'Chile'], ['Bolivia', 'Chile']],
  },
  cenepa: {
    name: 'Guerra del Cenepa (1995)', year: 1995, variant: 'sur', suggest: ['Peru', 'Ecuador'],
    desc: 'Perú y Ecuador combaten en la cordillera del Cóndor.',
    wars: [['Peru', 'Ecuador']], alliances: [],
    hostile: [],
  },
};

export const DEFAULT_SCENARIO = 'guerra_fria';
export const scenario_of = (game) => (game && SCENARIOS[game.scenario] ? game.scenario : DEFAULT_SCENARIO);

/** Aplica el escenario a una partida recién creada (antes de init_ext). */
export function apply_scenario(game, sid) {
  const sc = SCENARIOS[sid];
  if (!sc || sid === DEFAULT_SCENARIO) return;
  game.scenario = sid;
  if (sc.year !== 1962) game.start_year = sc.year;
  game.date = S.date_for_turn(1, game.start_year);
  const has = (c) => game.countries[c] !== undefined;
  const owner = (c) => game.countries[c].owner;
  for (const [a, b] of sc.alliances || []) {
    if (!has(a) || !has(b)) continue;
    const oa = owner(a), ob = owner(b);
    if (oa === ob || S.has_treaty(game, 'alliance', oa, ob)) continue;
    game.treaties.push({ type: 'alliance', a: oa, b: ob, since_turn: 1 });
    S.set_rel(game, oa, ob, 70);
  }
  for (const [a, b] of sc.hostile || []) {
    if (has(a) && has(b) && owner(a) !== owner(b)) S.set_rel(game, owner(a), owner(b), -40);
  }
  const lines = [];
  for (const [a, b] of sc.wars || []) {
    if (!has(a) || !has(b)) continue;
    const oa = owner(a), ob = owner(b);
    if (oa === ob || S.find_war(game, oa, ob)) continue;
    S.remove_treaties(game, oa, ob);
    // last_combat adelantado: evita el alto el fuego automático en los primeros turnos
    game.wars.push({ a: oa, b: ob, since_turn: 1, last_combat: 5 });
    S.set_rel(game, oa, ob, -80);
    lines.push(`${game.countries[a].name} y ${game.countries[b].name} están en guerra.`);
  }
  const pname = game.countries[game.player] ? game.countries[game.player].name : game.player;
  const head = `${MESES[0]} de ${sc.year}. ${sc.name.replace(/ \(\d+\)$/, '')}: ${pname} entra en escena.`;
  if (game.logs.length) game.logs[game.logs.length - 1].text = head; else S.add_log(game, head, 'info');
  for (const l of lines) S.add_log(game, l, 'war');
}
