// Humo del motor extendido (Tanda 4 incluida): partidas JS con IA durante N turnos, sin excepciones.
// Uso: node tools/sim_ext.mjs [TURNS=40] [player,player,...]
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const eng = (m) => import(pathToFileURL(path.join(ROOT, 'frontend/js/engine', m)).href);
const S = await eng('state.js');
const T = await eng('turn.js');
const F = await eng('features.js');
S.set_countries_data(JSON.parse(readFileSync(path.join(ROOT, 'backend/app/data/countries.json'), 'utf8')));

const turns = Number(process.argv[2] || 40);
const ids = S.load_countries().map((c) => c.id);
const players = process.argv[3] ? process.argv[3].split(',') : ids.slice(0, 3);
let bad = 0;
for (const pl of players) {
  try {
    const game = S.new_game(pl, 1, 'simext00'); F.init_ext(game);
    let convoys = 0, forms = 0;
    for (let i = 0; i < turns && !game.ended; i++) {
      T.end_turn(game); F.ext_turn(game);
      convoys = Math.max(convoys, game.divisions.filter((d) => d.kind === 'convoy').length,
        JSON.stringify((game.ext && game.ext.prodq) || {}).split('"convoy"').length - 1);
      forms = Math.max(forms, Object.values((game.ext && game.ext.forms) || {}).reduce((s, l) => s + l.length, 0));
    }
    // acciones nuevas con datos inválidos: no deben lanzar excepciones
    for (const a of ['form_join', 'form_split', 'form_rename', 'scorched_earth', 'retrofit', 'train', 'send_neutral', 'recall', 'patrol']) {
      F.ext_action(game, { action: a, div: 'x', id: '1', target: 'x' });
    }
    console.log(`OK ${pl}: turno ${game.turn}, convoyes max ${convoys}, formaciones max ${forms}`);
  } catch (e) { bad++; console.log(`FALLO ${pl}: ${e.stack}`); }
}
process.exit(bad ? 1 : 0);
