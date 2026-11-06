// Cabecera de estadisticas, navegacion inferior y pie con "Finalizar turno".
import { showNews } from './more.js';
import { play } from './sound.js';
import { h, fmtNum, fmtCompact, fmtExact, wordsOf, toast, MONEY_SCALE } from '../util.js';
import { icon, emblem } from '../icons.js';
import { getState, setState, delOrder, endTurn, player } from '../state.js';
import { confirmModal, turnReport, gameOver, newGameFlow } from './modals.js';
import { newsTicker, destroyTicker } from './ticker.js';
import { maybeWorldModal } from './world.js';
import { countTasks, countByScreen, goTo } from './tasks.js';

const NAV = [
  ['map', 'map', 'Mapa'], ['country', 'flag', 'País'], ['economy', 'coins', 'Economía'],
  ['army', 'shield', 'Ejército'], ['research', 'flask', 'Investig.'], ['diplomacy', 'rings', 'Diplom.'], ['tasks', 'check', 'Por mi cuenta'], ['more', 'menu', 'Más'],
];

const go = (screen) => setState({ screen });

// Contador de la cabecera: icono + valor compacto; el nombre y la cifra exacta van en title/aria-label.
function chip(ic, label, val, exact, screen, warn, rc) {
  const full = label + ': ' + exact;
  return h('button', { class: 'stat' + (warn ? ' warn' : '') + (rc ? ' rc rc-' + rc : ''), title: full, 'aria-label': full, onclick: () => (screen === 'more' ? goTo('more') : go(screen)) },
    icon(ic), h('span', { class: 'v' }, val));
}

export function renderHeader(el) {
  const S = getState();
  const g = S.game;
  el.replaceChildren();
  if (!g) {
    destroyTicker();
    return;
  }
  const me = g.player;
  const c = g.countries[me];
  const dollars = c.money * MONEY_SCALE * 1e6;
  const w = wordsOf(Math.round(dollars));
  const moneyExact = '$ ' + fmtNum(c.money * MONEY_SCALE) + ' M' + (w ? ' (' + w + ')' : '');
  const troops = totalTroops(g);
  const chips = [chip('r_money', 'Dinero', fmtCompact(c.money, { money: true }), moneyExact, 'economy', false, 'money')];
  if (g.ext) {
    const stock = (g.ext.stock && g.ext.stock[me]) || {};
    const short = (g.ext.supply && g.ext.supply[me] && g.ext.supply[me].short) || {};
    [['food', 'r_food', 'Alimentos'], ['fuel', 'r_fuel', 'Combustible'], ['goods', 'r_goods', 'Bienes'], ['metal', 'r_metal', 'Metal']].forEach(([res, ic, name]) => {
      const v = stock[res] || 0;
      chips.push(chip(ic, name, fmtCompact(v) + ' t', fmtExact(v) + ' toneladas' + (short[res] > 0.05 ? ' · escasez' : ''), 'economy', short[res] > 0.05, res));
    });
  }
  chips.push(
    chip('shield', 'Ejército', fmtCompact(troops * 1000), fmtExact(troops * 1000) + ' tropas', 'army'),
    chip('heart', 'Estabilidad', Math.round(c.stability) + '%', Math.round(c.stability) + '%', 'economy', c.stability < 25),
    chip('hourglass', 'Turno', g.max_turns ? `${g.turn}/${g.max_turns}` : String(g.turn), g.max_turns ? `${g.turn} de ${g.max_turns}` : String(g.turn), 'more'));
  const tickerEl = newsTicker(g);
  el.append(
    h('div', { class: 'brand' }, emblem(), h('h1', null, 'Frente Continental'),
      h('span', { class: 'when' }, g.date + ' · ' + c.name)),
    h('div', { class: 'stats res' + (g.ext ? '' : ' few') }, chips),
    tickerEl);
}


// Tropas totales del jugador (todas sus divisiones, dondequiera que esten).
export function totalTroops(g) {
  const f = g.summary && g.summary.forces;
  if (f && f.troops != null) return f.troops;
  return (g.divisions || []).filter((d) => d.owner === g.player).reduce((s, d) => s + (d.troops || 0), 0);
}

// Insignias por pantalla: tareas urgentes/pendientes de «Por mi cuenta» agrupadas por su pantalla destino.
function countDecisionsByScreen(g) {
  if (!g) return {};
  const c = countByScreen(g);
  delete c.map; // el mapa nunca llevó insignia
  return c;
}

export function renderNav(el) {
  const S = getState();
  const counts = countDecisionsByScreen(S.game);
  const badgeOf = (id) => {
    if (id === 'tasks') { const n = countTasks(S.game); return n > 0 ? [String(Math.min(n, 9)), ' num'] : null; }
    if (id === 'more' && S.game && S.game.active_event) return ['!', ''];
    if (counts[id] > 0) return [String(Math.min(counts[id], 9)), ' num'];
    return null;
  };
  // Reutiliza los 8 botones: solo se actualizan atributos y la insignia (sin parpadeo ni saltos).
  if (el.children.length !== NAV.length) {
    el.replaceChildren(...NAV.map(([id, ic, label]) => h('button', { 'data-nav': id, 'aria-label': ({ tasks: 'Por mi cuenta', diplomacy: 'Diplomacia' })[id] || label, onclick: () => go(id) },
      icon(ic), h('span', { class: 'nl' + (id === 'tasks' ? ' nl2' : '') }, label))));
  }
  NAV.forEach(([id], i) => {
    const b = el.children[i];
    if (S.screen === id) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    const bd = badgeOf(id);
    let sp = b.querySelector('.badge');
    if (!bd) { if (sp) sp.remove(); return; }
    if (!sp) { sp = h('span', { 'aria-hidden': 'true' }); b.append(sp); }
    sp.className = 'badge' + bd[1];
    if (sp.textContent !== bd[0]) sp.textContent = bd[0];
  });
}

let ending = false; // evita dobles toques: una sola confirmación/turno a la vez
async function doEnd() {
  if (ending) return;
  ending = true;
  try { await doEndInner(); } finally { ending = false; }
}

async function doEndInner() {
  const S = getState();
  if (S.busy || !S.game || S.game.ended) return;
  if (S.game.active_event) {
    play('alert');
    toast('Resuelve el evento pendiente antes de terminar el turno', 'warn');
    showNews();
    go('more');
    return;
  }
  const n = (S.game.orders || []).length;
  const ok = await confirmModal({
    title: 'Finalizar turno',
    text: n ? `Se ejecutarán ${n} ${n === 1 ? 'orden' : 'órdenes'} y avanzará el tiempo.` : 'No has dado ninguna orden. ¿Finalizar el turno de todos modos?',
    okText: 'Finalizar',
  });
  if (!ok) return;
  const r = await endTurn();
  if (!r) return;
  play('turn');
  if (r.report) await turnReport(r.report);
  await maybeWorldModal();
  const g = getState().game;
  if (g && g.ended) play(g.result === 'victory' || g.winner === g.player ? 'win' : 'alert');
  if (g && g.ended && await gameOver(g)) await newGameFlow(false);
}

export function renderFooter(el) {
  const S = getState();
  el.replaceChildren();
  if (!S.game) return;
  const orders = S.game.orders || [];
  el.append(h('div', { class: 'endrow' },
    h('button', {
      class: 'btn btn-undo', 'aria-label': 'Deshacer última orden', disabled: !orders.length || S.busy,
      onclick: () => { const o = orders[orders.length - 1]; if (o) delOrder(o.id); },
    }, icon('undo')),
    h('button', { class: 'btn primary btn-end', disabled: S.busy || S.game.ended, onclick: doEnd },
      icon('play'), S.busy ? 'Procesando...' : 'Finalizar turno', h('span', { class: 'cnt' }, ' (' + orders.length + ')'))));
}

export const isMe = (id) => id === player();
