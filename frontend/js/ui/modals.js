// Modales: selector de pais, informe de turno, confirmaciones.
import { h, ALIGN } from '../util.js';
import { icon } from '../icons.js';
import { getState, setState, cname, setGame } from '../state.js';
import * as api from '../api.js';
import { VARIANTS, variant_of } from '../data/provinces.js';
import { count_provinces } from '../engine/provinces.js';
import { SCENARIOS, DEFAULT_SCENARIO } from '../engine/scenarios.js';

const TURN_OPTS = [[48, '48 (4 años)'], [96, '96 (8 años)'], [128, '128 (clásico)'], [200, '200'], [0, 'Sin límite']];

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

const LSV = {
  get() { try { return localStorage.getItem('fc.variant'); } catch (e) { return null; } },
  set(v) { try { localStorage.setItem('fc.variant', v); } catch (e) { /* sin almacenamiento */ } },
};

// Silueta del mapa (SVG) a partir de los path de los paises de la variante.
function silhouette(countries, viewBox) {
  const paths = countries.map((c) => `<path d="${c.path}" fill="${c.color || '#8a7a55'}" stroke="rgba(10,15,25,.7)" stroke-width="0.8"/>`).join('');
  return `<svg viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${paths}</svg>`;
}

/** Elige escenario, duración, mapa y país. Devuelve {id, variant, scenario, max_turns} o null. */
export function startPicker({ canCancel = false } = {}) {
  const S = getState();
  const local = api.isLocal();
  return new Promise((res) => {
    let sel = null;
    let m;
    let variant = LSV.get();
    if (!VARIANTS[variant] || (!local && variant !== 'latam')) variant = 'latam';
    let scen = DEFAULT_SCENARIO;
    let turns = 128;
    const btnGo = h('button', { class: 'btn primary', disabled: true, onclick: () => {
      LSV.set(variant); m.close();
      const out = { id: sel, variant };
      if (local) { if (scen !== DEFAULT_SCENARIO) out.scenario = scen; if (turns !== 128) out.max_turns = turns; }
      res(out);
    } }, 'Comenzar partida');
    const scRow = h('div', { class: 'ng-chips' });
    const scDesc = h('p', { class: 'muted small' });
    const tRow = h('div', { class: 'ng-chips' });
    function renderScen() {
      const sc = SCENARIOS[scen];
      scRow.replaceChildren(...Object.entries(SCENARIOS).map(([k, v]) => h('button', {
        class: 'pill', 'aria-pressed': String(k === scen), disabled: (!local && k !== DEFAULT_SCENARIO) || null,
        onclick: () => {
          scen = k;
          if (v.variant && VARIANTS[v.variant]) variant = v.variant;
          renderScen(); renderMaps(); renderCountries();
        },
      }, v.name)));
      scDesc.textContent = sc.desc + (local ? '' : ' (Los escenarios históricos solo están en modo sin conexión.)');
    }
    function renderTurns() {
      tRow.replaceChildren(...TURN_OPTS.map(([n, label]) => h('button', {
        class: 'pill', 'aria-pressed': String(n === turns), disabled: (!local && n !== 128) || null,
        onclick: () => { turns = n; renderTurns(); },
      }, label)));
    }
    const info = h('p', { class: 'muted small' }, 'Elige el país que gobernarás.');
    const mapRow = h('div', { class: 'mapopts' });
    const grid = h('div', { class: 'pickgrid' });
    let full = S.map && S.map.variant === 'latam' ? S.map : null;

    function renderCountries() {
      const ids = VARIANTS[variant].ids;
      const sug = SCENARIOS[scen].suggest || [];
      const list = ((full || S.map).countries).filter((c) => !ids || ids.includes(c.id))
        .sort((a, b) => (sug.includes(b.id) - sug.includes(a.id)) || a.name.localeCompare(b.name, 'es'));
      if (sel && !list.some((c) => c.id === sel)) { sel = null; btnGo.disabled = true; info.textContent = 'Elige el país que gobernarás.'; }
      grid.replaceChildren(...list.map((c) => h('button', {
        class: 'item' + (sug.includes(c.id) ? ' sug' : ''), 'aria-pressed': String(c.id === sel), 'data-id': c.id,
        onclick: () => {
          sel = c.id;
          [...grid.children].forEach((x) => x.setAttribute('aria-pressed', x.dataset.id === c.id ? 'true' : 'false'));
          btnGo.disabled = false;
          info.textContent = `${c.name} · ${ALIGN[c.alignment] || c.alignment} · Poder ${c.power}`;
        },
      }, h('span', { class: 'grow' }, c.name), h('span', { class: 'muted small' }, (sug.includes(c.id) ? 'Protagonista · ' : '') + 'Poder ' + c.power))));
    }
    function renderMaps() {
      const countries = (full || S.map).countries;
      mapRow.replaceChildren(...Object.entries(VARIANTS).map(([k, v]) => {
        const cs = countries.filter((c) => !v.ids || v.ids.includes(c.id));
        const np = count_provinces(k);
        const forced = SCENARIOS[scen].variant;
        const off = (!local && k !== 'latam') || (forced && k !== forced);
        return h('button', {
          class: 'mapopt', 'aria-pressed': String(k === variant), disabled: off || null, 'data-variant': k,
          onclick: () => { variant = k; renderMaps(); renderCountries(); },
        },
        h('span', { class: 'mapsil', html: silhouette(cs, v.viewBox) }),
        h('span', { class: 'maptxt' },
          h('strong', null, v.name),
          h('span', { class: 'small muted' }, v.desc),
          h('span', { class: 'small' }, `${cs.length} países${np ? ' · ~' + np + ' provincias' : ''}`),
          off ? h('span', { class: 'small muted' }, !local && k !== 'latam' ? 'Solo en modo sin conexión' : 'No disponible en este escenario') : null));
      }));
    }
    renderScen(); renderTurns(); renderMaps(); renderCountries();
    if (!full) {
      // el mapa activo puede ser otra variante: se pide el completo para dibujar ambas siluetas
      api.getMap('latam').then((mm) => { if (mm && mm.countries) { full = mm; renderMaps(); renderCountries(); } }).catch(() => {});
    }
    m = openModal([
      h('h2', null, 'Nueva partida'),
      h('p', { class: 'muted small' }, 'Elige el escenario, la duración, el mapa y tu país.'),
      h('h3', { class: 'tag-uc' }, 'Escenario'),
      scRow,
      scDesc,
      h('h3', { class: 'tag-uc' }, 'Duración (turnos, 1 por mes)'),
      tRow,
      h('h3', { class: 'tag-uc' }, 'Mapa'),
      mapRow,
      h('h3', { class: 'tag-uc' }, 'País'),
      grid,
      info,
      h('div', { class: 'acts' },
        canCancel ? h('button', { class: 'btn', onclick: () => { m.close(); res(null); } }, 'Cancelar') : null,
        btnGo),
    ], { dismissible: canCancel, label: 'Elegir mapa y país', onDismiss: () => res(null) });
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

const VICTORY_NAMES = {
  conquest: 'Conquista', economic: 'Dominio económico', diplomatic: 'Hegemonía diplomática', survival: 'Supervivencia',
};

/** Filas de progreso hacia cada victoria a partir de view.victory_progress. `main` resalta la lograda. */
export function victoryRows(vp, main = null) {
  if (!vp) return null;
  const pct = (a, b) => Math.max(0, Math.min(100, b > 0 ? Math.round((a / b) * 100) : 0));
  const row = (key, label, detail, p) => h('div', { class: 'vp-row' + (key === main ? ' main' : '') },
    h('div', { class: 'vp-head' }, h('b', null, label), h('span', { class: 'muted' }, detail)),
    h('div', { class: 'vp-bar' }, h('i', { style: 'width:' + p + '%' })));
  const c = vp.conquest, e = vp.economic, d = vp.diplomatic, s = vp.survival;
  return h('div', { class: 'vp-list' },
    row('conquest', VICTORY_NAMES.conquest, c.own + ' / ' + c.target + ' territorios', pct(c.own, c.target)),
    row('economic', VICTORY_NAMES.economic, 'PIB ' + e.mine + ' vs ' + e.best_rival + ' (x' + e.ratio + '), racha ' + e.streak + '/' + e.need, pct(e.streak, e.need)),
    row('diplomatic', VICTORY_NAMES.diplomatic, d.allies + ' de ' + (d.allies + d.others) + ' aliados, racha ' + d.streak + '/' + d.need, pct(d.streak, d.need)),
    row('survival', VICTORY_NAMES.survival, s.max_turns ? 'Turno ' + s.turn + ' / ' + s.max_turns + ', puesto ' + s.rank : 'Turno ' + s.turn + ' (sin límite), puesto ' + s.rank, s.max_turns ? pct(s.turn, s.max_turns) : 0));
}

export function gameOver(game) {
  const won = game.result ? game.result === 'victory' : game.winner === game.player;
  const lost = game.result === 'defeat' || (!won && game.winner);
  const vt = game.victory_type;
  const vtName = vt && VICTORY_NAMES[vt] ? VICTORY_NAMES[vt] : null;
  let text;
  if (won) text = vtName ? 'Victoria por ' + vtName.toLowerCase() + '.' : 'Tu nación domina el continente.';
  else if (game.loss_reason) text = game.loss_reason;
  else if (game.winner) text = 'Ganador: ' + cname(game.winner) + '.';
  else text = 'La partida ha terminado.';
  return new Promise((res) => {
    let m;
    m = openModal([
      h('h2', null, won ? 'Victoria' : lost ? 'Derrota' : 'Fin de la partida'),
      h('p', null, text),
      !won && game.loss_reason && game.winner && !game.loss_reason.includes(cname(game.winner)) ? h('p', { class: 'muted small' }, 'Ganador: ' + cname(game.winner) + '.') : null,
      victoryRows(game.victory_progress, won ? vt : null),
      h('div', { class: 'acts' },
        h('button', { class: 'btn', onclick: () => { m.close(); res(false); } }, 'Seguir viendo'),
        h('button', { class: 'btn primary', onclick: () => { m.close(); res(true); } }, 'Nueva partida')),
    ], { dismissible: false, label: 'Fin de partida' });
  });
}

/** Flujo de partida nueva. loadMap(variant) (de main.js) recarga el mapa si la variante cambia. */
export async function newGameFlow(first = false, loadMap = null) {
  const pick = await startPicker({ canCancel: !first });
  if (!pick) return false;
  const g = await api.newGame(pick.id, pick.variant, { scenario: pick.scenario, max_turns: pick.max_turns });
  if (!g) {
    if (first) return newGameFlow(true, loadMap);
    return false;
  }
  const v = variant_of(g);
  const cur = (getState().map && getState().map.variant) || 'latam';
  if (loadMap && v !== cur) { try { await loadMap(v); } catch (e) { /* se queda el mapa actual */ } }
  setState({ selected: null, diploTarget: null, screen: 'map' });
  setGame(g);
  return true;
}
