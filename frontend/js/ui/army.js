// Pantalla de Ejercito: divisiones, ordenes militares y cola de ordenes.
import { h, fmtNum, fmtMoney, STANCE, MILITARY, orderLabel } from '../util.js';
import { icon } from '../icons.js';
import { statusPills } from './country.js';
import * as F from '../engine/features.js';
import { getState, player, cname, ownerOf, isAllied, neighborsOf, sendOrder, delOrder } from '../state.js';

let selId = null;
let picking = null; // 'move' | 'attack' | null

const LABEL = { move: 'Mover', attack: 'Atacar', defend: 'Defender', reorganize: 'Reorganizar', front: 'Establecer frente' };
const ICON = { move: 'play', attack: 'swords', defend: 'shield', reorganize: 'people', front: 'target' };

function divName(id) {
  const d = (getState().game.divisions || []).find((x) => x.id === id);
  return d ? d.name : String(id);
}

function targets(div, kind) {
  const me = player();
  const out = [];
  (neighborsOf(div.location) || []).forEach((id) => {
    const o = ownerOf(id);
    if (!o) return;
    if (kind === 'move' && (o === me || isAllied(o, me))) out.push(id);
    if (kind === 'attack' && o !== me && !isAllied(o, me)) out.push(id);
  });
  return out;
}

function order(div, type, target) {
  picking = null;
  return sendOrder({ type, division_id: div.id, target: target || div.location });
}

function divCard(div) {
  const on = div.id === selId;
  const queued = (getState().game.orders || []).filter((o) => o.division_id === div.id).length;
  return h('button', { class: 'item stack', 'aria-pressed': String(on), onclick: () => { selId = on ? null : div.id; picking = null; rerender(); } },
    h('div', { class: 'row' }, icon('helmet'), h('b', { class: 'grow' }, div.name),
      queued ? h('span', { class: 'pill' }, queued + ' orden' + (queued === 1 ? '' : 'es')) : null),
    h('div', { class: 'muted small' }, `${cname(div.location)} · ${STANCE[div.stance] || div.stance} · ${fmtNum(div.troops)}k tropas`
      + (div.tanks ? ` · ${fmtNum(div.tanks)} tanques` : '') + (div.planes ? ` · ${fmtNum(div.planes)} aviones` : '')),
    div.org != null ? h('div', { class: 'bar ' + (div.org < 30 ? 'bad' : div.org < 55 ? 'warn' : '') }, h('i', { style: { width: Math.max(0, Math.min(100, div.org)) + '%' } })) : null);
}

function actions(div) {
  const root = h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Órdenes para ' + div.name));
  if (picking) {
    const list = targets(div, picking);
    root.append(h('div', { class: 'muted small' }, picking === 'move' ? 'Elige a dónde mover la división.' : 'Elige el objetivo del ataque.'));
    if (!list.length) root.append(h('div', { class: 'empty' }, 'No hay destinos válidos junto a ' + cname(div.location) + '.'));
    list.forEach((id) => root.append(h('button', { class: 'btn block' + (picking === 'attack' ? ' danger' : ''), onclick: async () => { await order(div, picking, id); rerender(); } },
      icon(ICON[picking]), h('span', { class: 'grow' }, cname(id)), statusPills(id))));
    root.append(h('button', { class: 'btn block', onclick: () => { picking = null; rerender(); } }, icon('close'), 'Cancelar'));
    return root;
  }
  MILITARY.forEach((t) => {
    const needsTarget = t === 'move' || t === 'attack';
    root.append(h('button', {
      class: 'btn block' + (t === 'attack' ? ' danger' : ''),
      onclick: async () => {
        if (needsTarget) { picking = t; rerender(); } else { await order(div, t); rerender(); }
      },
    }, icon(ICON[t]), LABEL[t]));
  });
  return root;
}

function queue() {
  const g = getState().game;
  const orders = g.orders || [];
  const troops = new Set(orders.filter((o) => o.division_id).map((o) => o.division_id));
  const total = orders.reduce((s, o) => s + (o.cost || 0), 0);
  return h('div', { class: 'panel stack' },
    h('h3', { class: 'tag-uc' }, 'Órdenes en cola'),
    h('div', { class: 'muted small' }, `${orders.length} ${orders.length === 1 ? 'orden' : 'órdenes'} · ${troops.size} división${troops.size === 1 ? '' : 'es'} · costo ${fmtMoney(total)}`),
    orders.length ? h('div', { class: 'list' }, orders.map((o, i) =>
      h('div', { class: 'item row' },
        h('span', { class: 'grow' }, (i + 1) + '. ' + orderLabel(o, { cname, divName })),
        h('button', { class: 'iconbtn', 'aria-label': 'Eliminar orden ' + (i + 1), onclick: () => delOrder(o.id) }, icon('trash')))))
      : h('div', { class: 'empty' }, 'Sin órdenes. Selecciona una división para darle instrucciones.'));
}

// ---- Extensiones: unidades y estimador de batalla ----
let estTarget = null;
const pct = (v, max) => Math.max(0, Math.min(100, (v / (max || 1)) * 100));

function unitsPanel() {
  const info = F.UNIT_INFO;
  if (!info) return null;
  const rows = Object.keys(info).map((k) => info[k]);
  const mx = (key) => Math.max(1, ...rows.map((u) => Number(u[key]) || 0));
  const stat = (lbl, v, max) => h('div', { class: 'st' }, h('span', { class: 'muted' }, lbl), h('div', { class: 'bar' }, h('i', { style: { width: pct(v, max) + '%' } })), h('b', null, fmtNum(v)));
  return h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Unidades'),
    h('div', { class: 'cards' }, Object.keys(info).map((k) => {
      const u = info[k];
      return h('div', { class: 'card unit-card stack' },
        h('div', { class: 't' }, u.name || k),
        stat('Ataque', u.atk, mx('atk')), stat('Defensa', u.def, mx('def')), stat('Vida', u.hp, mx('hp')), stat('Veloc.', u.spd, mx('spd')),
        u.cost != null ? h('div', { class: 'muted small' }, 'Costo ' + fmtMoney(u.cost)) : null,
        u.desc ? h('div', { class: 'muted small' }, u.desc) : null);
    })));
}

function estPower(c) { return c ? (c.army || 0) + (c.tanks || 0) * 0.5 + (c.planes || 0) * 0.8 : 0; }

function estimator(tot) {
  const S = getState(), g = S.game, me = player();
  const ids = new Set();
  (g.divisions || []).filter((d) => d.owner === me).forEach((d) => (neighborsOf(d.location) || []).forEach((n) => { const o = ownerOf(n); if (o && o !== me) ids.add(o); }));
  (g.wars || []).forEach((w) => { if (w.a === me) ids.add(w.b); else if (w.b === me) ids.add(w.a); });
  const list = [...ids];
  const root = h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Estimador de batalla'));
  if (!list.length) { root.append(h('div', { class: 'empty' }, 'Sin vecinos ni guerras que evaluar.')); return root; }
  if (!estTarget || !list.includes(estTarget)) estTarget = list[0];
  const sel = h('select', { 'aria-label': 'Objetivo', onchange: (e) => { estTarget = e.target.value; rerender(); } },
    list.map((id) => { const o = h('option', { value: id }, cname(id)); if (id === estTarget) o.selected = true; return o; }));
  const atk = tot.troops + tot.tanks * 0.5 + tot.planes * 0.8;
  const def = estPower(g.countries[estTarget]);
  let p = null;
  try { if (typeof F.odds === 'function') p = F.odds(atk, def); } catch (e) { p = null; }
  if (p == null) p = atk + def > 0 ? atk / (atk + def) : 0.5;
  const pc = Math.round(p * 100);
  const [verdict, cls] = p >= 0.6 ? ['Favorable', 'odds-good'] : p >= 0.4 ? ['Incierta', 'odds-mid'] : ['Desfavorable', 'odds-bad'];
  const fog = g.countries[estTarget] && g.countries[estTarget].fog;
  root.append(sel,
    h('div', { class: 'grid2' },
      h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Tu ataque'), h('b', null, fmtNum(Math.round(atk)))),
      h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Defensa' + (fog ? ' est.' : '')), h('b', null, (fog ? '~' : '') + fmtNum(Math.round(def))))),
    h('div', { class: 'row' }, h('span', { class: 'odds-big ' + cls }, pc + '%'), h('b', { class: 'grow ' + cls }, verdict)),
    h('div', { class: 'bar ' + (p < 0.4 ? 'bad' : p < 0.6 ? 'warn' : '') }, h('i', { style: { width: pc + '%' } })),
    h('div', { class: 'muted small' }, 'Probabilidad estimada de victoria; no incluye terreno ni moral.'));
  return root;
}

function techBonuses() {
  const g = getState().game, me = player();
  const ext = g.ext;
  const done = ext && ext.techs && ext.techs[me] && ext.techs[me].done;
  const root = h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Bonos tecnológicos'));
  const T = F.TECHS;
  const names = (done || []).map((id) => {
    const t = Array.isArray(T) ? T.find((x) => x.id === id) : T && T[id];
    return { id, t };
  }).filter((x) => !x.t || x.t.branch !== 'eco');
  if (!names.length) { root.append(h('div', { class: 'empty' }, 'Sin tecnologías militares investigadas.')); return root; }
  root.append(h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '4px' } }, names.map((x) => h('span', { class: 'pill' }, (x.t && x.t.name) || x.id))));
  return root;
}

let host = null;
function rerender() { if (host) render(host); }

export function render(el) {
  host = el;
  el.replaceChildren();
  const S = getState();
  if (!S.game) return;
  const me = player();
  const divs = (S.game.divisions || []).filter((d) => d.owner === me);
  if (selId && !divs.some((d) => d.id === selId)) { selId = null; picking = null; }
  void S.game.countries[me];
  // totales de todas las divisiones del jugador (no solo las del territorio natal)
  const tot = divs.reduce((t, d) => ({ troops: t.troops + (d.troops || 0), tanks: t.tanks + (d.tanks || 0), planes: t.planes + (d.planes || 0) }), { troops: 0, tanks: 0, planes: 0 });
  const sel = divs.find((d) => d.id === selId);
  el.append(
    h('h2', null, 'Ejército'),
    h('div', { class: 'cards' },
      h('div', { class: 'card' }, h('div', { class: 't' }, 'Tropas'), h('div', { class: 'n' }, fmtNum(tot.troops) + 'k')),
      h('div', { class: 'card' }, h('div', { class: 't' }, 'Tanques'), h('div', { class: 'n' }, fmtNum(tot.tanks))),
      h('div', { class: 'card' }, h('div', { class: 't' }, 'Aviones'), h('div', { class: 'n' }, fmtNum(tot.planes)))),
    h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Divisiones'),
      divs.length ? h('div', { class: 'list' }, divs.map(divCard)) : h('div', { class: 'empty' }, 'No tienes divisiones. Recluta tropas en Economía.')),
    sel ? actions(sel) : null,
    queue());
  try {
    const ex = [unitsPanel(), estimator(tot), techBonuses()].filter(Boolean);
    el.append(...ex);
  } catch (e) { /* extensiones opcionales */ }
}
