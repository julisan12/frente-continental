// Cabecera de estadisticas, navegacion inferior y pie con "Finalizar turno".
import { showNews } from './more.js';
import { play } from './sound.js';
import { h, fmtNum, fmtMoney, fmtSigned, deltaClass, toast } from '../util.js';
import { icon, emblem } from '../icons.js';
import { getState, setState, delOrder, endTurn, player } from '../state.js';
import { confirmModal, turnReport, gameOver, newGameFlow } from './modals.js';

const NAV = [
  ['map', 'map', 'Mapa'], ['country', 'flag', 'País'], ['economy', 'coins', 'Economía'],
  ['army', 'shield', 'Ejército'], ['diplomacy', 'rings', 'Diplomacia'], ['more', 'menu', 'Más'],
];

const go = (screen) => setState({ screen });

export function renderHeader(el) {
  const S = getState();
  const g = S.game;
  el.replaceChildren();
  if (!g) return;
  const c = g.countries[g.player];
  const sm = g.summary || {};
  const dl = sm.deltas || {};
  const allies = (g.treaties || []).filter((t) => t.type === 'alliance' && (t.a === g.player || t.b === g.player)).length;
  const wars = (g.wars || []).filter((w) => w.a === g.player || w.b === g.player).length;
  const stat = (label, val, delta, screen, money) => h('button', { class: 'stat', 'aria-label': label + ': ' + val, onclick: () => go(screen) },
    h('span', { class: 'l' }, label),
    h('span', { class: 'v' }, val),
    delta != null && delta !== 0 ? h('span', { class: 'd ' + deltaClass(delta) }, fmtSigned(delta, money)) : h('span', { class: 'd muted' }, ' '));
  el.append(
    h('div', { class: 'brand' }, emblem(), h('h1', null, 'Frente Continental')),
    h('div', { class: 'stats' },
      stat('Turno', g.max_turns ? `${g.turn}/${g.max_turns}` : String(g.turn), null, 'more'),
      stat('Dinero', fmtMoney(c.money), dl.money, 'economy', true),
      stat('Estab.', Math.round(c.stability) + '%', dl.stability, 'economy'),
      stat('Industria', fmtNum(c.industry), dl.industry, 'economy'),
      stat('Ejército', fmtNum(totalTroops(g)) + 'k', null, 'army'),
      stat('Diplom.', allies + ' / ' + wars, null, 'diplomacy')),
    h('div', { class: 'muted small', style: { textAlign: 'center' } }, g.date + ' · ' + c.name),
    ticker(g));
}

function ticker(g) {
  const news = g.ext && Array.isArray(g.ext.news) ? g.ext.news : [];
  const n = news[news.length - 1];
  if (!n) return null;
  return h('button', { class: 'ticker ' + (n.kind || 'info'), 'aria-label': 'Última noticia: ' + n.text, onclick: () => { showNews(); go('more'); } },
    'T' + n.turn + ' · ' + n.text);
}

// Tropas totales del jugador (todas sus divisiones, dondequiera que esten).
export function totalTroops(g) {
  const f = g.summary && g.summary.forces;
  if (f && f.troops != null) return f.troops;
  return (g.divisions || []).filter((d) => d.owner === g.player).reduce((s, d) => s + (d.troops || 0), 0);
}

export function renderNav(el) {
  const S = getState();
  el.replaceChildren(...NAV.map(([id, ic, label]) => {
    const badge = id === 'more' && S.game && S.game.active_event ? h('span', { class: 'badge', 'aria-hidden': 'true' }, '!') : null;
    return h('button', { 'aria-label': label, 'aria-current': S.screen === id ? 'page' : null, onclick: () => go(id) }, icon(ic), h('span', null, label), badge);
  }));
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
