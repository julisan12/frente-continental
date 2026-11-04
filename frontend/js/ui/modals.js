// Modales: selector de pais, informe de turno, confirmaciones.
import { h, ALIGN } from '../util.js';
import { icon } from '../icons.js';
import { getState, setState, cname, setGame } from '../state.js';
import * as api from '../api.js';

let F = {};
import('../engine/features.js').then((m) => { F = m; }).catch(() => {});

// onDismiss: se llama si el usuario cierra tocando fuera o con Escape (para resolver la promesa del modal).
export function openModal(nodes, { dismissible = true, label = 'Diálogo', onDismiss = null } = {}) {
  const root = document.getElementById('modal-root');
  const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': label }, nodes);
  const ov = h('div', { class: 'overlay' }, modal);
  const onKey = (e) => { if (e.key === 'Escape' && dismissible) dismiss(); };
  function close() { document.removeEventListener('keydown', onKey); ov.remove(); }
  function dismiss() { close(); if (onDismiss) onDismiss(); }
  if (dismissible) ov.addEventListener('click', (e) => { if (e.target === ov) dismiss(); });
  document.addEventListener('keydown', onKey);
  root.append(ov);
  const first = modal.querySelector('button');
  if (first) first.focus({ preventScroll: true });
  return { close, el: modal };
}

export function confirmModal({ title, text, okText = 'Aceptar', cancelText = 'Cancelar', danger = false }) {
  return new Promise((res) => {
    let m;
    const done = (v) => { m.close(); res(v); };
    m = openModal([
      h('h2', null, title),
      h('p', null, text),
      h('div', { class: 'acts' },
        h('button', { class: 'btn', onclick: () => done(false) }, cancelText),
        h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => done(true) }, okText)),
    ], { label: title, onDismiss: () => res(false) });
  });
}

export function amountModal({ title, text, min = 1, max = 100, value = 10, step = 1 }) {
  return new Promise((res) => {
    const inp = h('input', { type: 'number', min, max, step, value, inputmode: 'numeric', 'aria-label': 'Cantidad' });
    let m;
    const done = (v) => { m.close(); res(v); };
    m = openModal([
      h('h2', null, title), h('p', null, text),
      h('div', { class: 'field' }, inp),
      h('div', { class: 'acts' },
        h('button', { class: 'btn', onclick: () => done(null) }, 'Cancelar'),
        h('button', { class: 'btn primary', onclick: () => done(Math.max(min, Math.min(max, parseInt(inp.value, 10) || min))) }, 'Confirmar')),
    ], { label: title, onDismiss: () => res(null) });
  });
}

export function startPicker({ canCancel = false } = {}) {
  const S = getState();
  return new Promise((res) => {
    let sel = null;
    let m;
    const list = [...S.map.countries].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const btnGo = h('button', { class: 'btn primary', disabled: true, onclick: () => { m.close(); res(sel); } }, 'Comenzar partida');
    const info = h('p', { class: 'muted small' }, 'Elige el país que gobernarás.');
    const cells = list.map((c) => {
      const b = h('button', {
        class: 'item', 'aria-pressed': 'false', 'data-id': c.id,
        onclick: () => {
          sel = c.id;
          cells.forEach((x) => x.setAttribute('aria-pressed', x.dataset.id === c.id ? 'true' : 'false'));
          btnGo.disabled = false;
          info.textContent = `${c.name} · ${ALIGN[c.alignment] || c.alignment} · Poder ${c.power}`;
        },
      }, h('span', { class: 'grow' }, c.name), h('span', { class: 'muted small' }, 'Poder ' + c.power));
      return b;
    });
    m = openModal([
      h('h2', null, 'Elige tu país'),
      h('p', { class: 'muted small' }, 'América Latina, 1962. La Guerra Fría llega al continente.'),
      h('div', { class: 'pickgrid' }, cells),
      info,
      h('div', { class: 'acts' },
        canCancel ? h('button', { class: 'btn', onclick: () => { m.close(); res(null); } }, 'Cancelar') : null,
        btnGo),
    ], { dismissible: canCancel, label: 'Elegir país', onDismiss: () => res(null) });
  });
}

export function menuModal(game) {
  return new Promise((res) => {
    let m;
    const go = (v) => { m.close(); res(v); };
    m = openModal([
      h('h2', null, 'Frente Continental'),
      h('p', null, `Tienes una partida guardada: ${cname(game.player)}, turno ${game.turn} (${game.date}).`),
      h('div', { class: 'acts' },
        h('button', { class: 'btn', onclick: () => go('new') }, 'Nueva partida'),
        h('button', { class: 'btn primary', onclick: () => go('continue') }, 'Continuar')),
    ], { dismissible: false, label: 'Menú principal' });
  });
}

function battleText(b) {
  if (typeof b === 'string') return b;
  if (b.text) return b.text;
  // backend: {target, target_name, attacker, defender, attack, defense, won, attacker_losses, defender_losses, captured}
  const loc = b.target_name || (b.target ? cname(b.target) : '');
  const a = b.attacker, d = b.defender;
  let t = 'Batalla';
  if (loc) t += ' en ' + loc;
  if (a && d) t += ': ' + cname(a) + ' contra ' + cname(d);
  if (b.attack != null && b.defense != null) t += ' (ataque ' + Math.round(b.attack) + ' / defensa ' + Math.round(b.defense) + ')';
  if (b.won != null && a && d) t += '. Vence ' + cname(b.won ? a : d) + (b.won && b.captured ? ' y captura ' + (loc || 'el territorio') : '') + '.';
  if (b.attacker_losses != null || b.defender_losses != null) {
    t += ' Bajas: ' + Math.round(b.attacker_losses || 0) + 'k atacante, ' + Math.round(b.defender_losses || 0) + 'k defensor.';
  }
  return t;
}

function oddsText(b) {
  try {
    if (!F.odds || !b || typeof b !== 'object' || typeof b.attack !== 'number' || typeof b.defense !== 'number') return null;
    const p = F.odds(b.attack, b.defense);
    if (typeof p !== 'number' || isNaN(p)) return null;
    return h('div', { class: 'muted small' }, 'Probabilidad estimada: ' + Math.round(p * 100) + '%');
  } catch (e) { return null; }
}

export function turnReport(report) {
  return new Promise((res) => {
    const lines = (report && report.lines) || [];
    const battles = (report && report.battles) || [];
    let m;
    m = openModal([
      h('h2', null, 'Informe del turno ' + (report ? report.turn : '')),
      h('div', { class: 'stack' },
        lines.length ? lines.map((l) => h('div', { class: 'logline' }, typeof l === 'string' ? l : (l.text || ''))) : h('p', { class: 'muted' }, 'Sin novedades.'),
        battles.length ? h('h3', { class: 'tag-uc' }, 'Batallas') : null,
        battles.map((b) => h('div', { class: 'logline war' }, icon('swords'), ' ', battleText(b), oddsText(b)))),
      h('div', { class: 'acts' }, h('button', { class: 'btn primary', onclick: () => { m.close(); res(); } }, 'Continuar')),
    ], { label: 'Informe de turno', onDismiss: () => res() });
  });
}

export function gameOver(game) {
  const won = game.result ? game.result === 'victory' : game.winner === game.player;
  const lost = game.result === 'defeat' || (!won && game.winner);
  let text;
  if (won) text = 'Tu nación domina el continente.';
  else if (game.loss_reason) text = game.loss_reason;
  else if (game.winner) text = 'Ganador: ' + cname(game.winner) + '.';
  else text = 'La partida ha terminado.';
  return new Promise((res) => {
    let m;
    m = openModal([
      h('h2', null, won ? 'Victoria' : lost ? 'Derrota' : 'Fin de la partida'),
      h('p', null, text),
      !won && game.loss_reason && game.winner && !game.loss_reason.includes(cname(game.winner)) ? h('p', { class: 'muted small' }, 'Ganador: ' + cname(game.winner) + '.') : null,
      h('div', { class: 'acts' },
        h('button', { class: 'btn', onclick: () => { m.close(); res(false); } }, 'Seguir viendo'),
        h('button', { class: 'btn primary', onclick: () => { m.close(); res(true); } }, 'Nueva partida')),
    ], { dismissible: false, label: 'Fin de partida' });
  });
}

export async function newGameFlow(first = false) {
  const id = await startPicker({ canCancel: !first });
  if (!id) return false;
  const g = await api.newGame(id);
  if (!g) {
    if (first) return newGameFlow(true);
    return false;
  }
  setState({ selected: null, diploTarget: null, screen: 'map' });
  setGame(g);
  return true;
}
