// Interfaz de las mecánicas de Ejército 2: nivel y experiencia, mantenimiento, suministro,
// tipos de escuadra, reequipo, entrenamiento, tierra quemada, patrulla, tropas en países neutrales.
import { h, fmtNum, fmtDec, fmtMoney } from '../util.js';
import { icon } from '../icons.js';
import { getState, player, cname, extAction } from '../state.js';
import { kind_of } from '../engine/units.js';
import { ROSTER } from '../engine/roster.js';
import { at_war, allies_of, is_adjacent } from '../engine/state.js';
import * as A2 from '../engine/army2.js';
import { artUnit } from './art.js';
import { confirmModal, openModal } from './modals.js';

export const LEVEL_NAMES = ['Recluta', 'Regular', 'Veterano', 'Curtido', 'Élite', 'Legendario'];
export const XP_STEPS = [0, 10, 30, 60, 100, 160];
export const BOMBERS = new Set(['bomb', 'bpes', 'bestr']);
const FLY = new Set(['air', 'heli', 'drone']);

const rk = (d) => kind_of(d);
const cls = (d) => (ROSTER[rk(d)] || {}).cls;
const pct = (v, max) => Math.max(0, Math.min(100, (v / (max || 1)) * 100));
const mod = (v) => (v >= 1 ? '+' : '') + Math.round((v - 1) * 100) + '%';

/** Dinero/turno de mantenimiento mostrado en la misma escala que el resto del dinero. */
export const upkeepText = (v) => fmtMoney(v) + '/turno';

export function levelInfo(d) {
  const lv = d.lv != null ? d.lv : A2.level_of(d);
  const xp = d.xp || 0;
  const lo = XP_STEPS[lv], hi = XP_STEPS[lv + 1];
  return { lv, xp, name: LEVEL_NAMES[lv] || 'Recluta', next: hi, pct: hi == null ? 100 : pct(xp - lo, hi - lo) };
}

export function navMoves(d) {
  if (cls(d) !== 'nav') return null;
  const max = (ROSTER[rk(d)] || {}).spd || 1;
  return { max, left: Math.max(0, max - (d.mp_used || 0)) };
}

/** Total de mantenimiento del ejército del jugador. */
export function armyUpkeep() {
  const g = getState().game, me = player();
  const mine = (g.divisions || []).filter((d) => d.owner === me);
  return A2.upkeep_of(g, mine);
}

/** Resumen compacto para la tarjeta de división: nivel, XP, mantenimiento, suministro, movimiento naval. */
export function cardExtras(d) {
  const g = getState().game;
  const li = levelInfo(d);
  const nm = navMoves(d);
  const unsup = d.unsup || 0;
  const pills = [h('span', { class: 'pill lv-pill lv-' + li.lv, title: 'Nivel ' + li.lv + ' de ' + A2.MAX_LEVEL }, icon('bolt'), li.name)];
  if (unsup >= 2) pills.push(h('span', { class: 'pill bad', title: 'Sin suministro varios turnos: pierde vida y organización' }, 'Hambre'));
  else if (unsup >= 1) pills.push(h('span', { class: 'pill warn', title: 'Sin suministro este turno' }, 'Sin suministro'));
  if (d.scorched) pills.push(h('span', { class: 'pill warn' }, 'Tierra quemada'));
  if (d.patrol) pills.push(h('span', { class: 'pill' }, 'Patrulla'));
  if (d.foreign) pills.push(h('span', { class: 'pill warn' }, 'En ' + cname(d.foreign)));
  if (nm) pills.push(h('span', { class: 'pill' + (nm.left ? '' : ' bad'), title: 'Puntos de movimiento naval restantes' }, 'Mov. ' + nm.left + '/' + nm.max));
  const sq = A2.squad_of(g, d);
  return h('div', { class: 'stack army-x' },
    h('div', { class: 'row wrap', style: { gap: '4px' } }, pills),
    h('div', { class: 'row small', style: { gap: '6px', alignItems: 'center' } }, h('span', { class: 'muted' }, 'XP'),
      h('div', { class: 'bar xp grow' }, h('i', { style: { width: li.pct + '%' } })),
      h('b', null, li.next == null ? 'máx.' : fmtNum(li.xp) + '/' + li.next)),
    h('div', { class: 'muted small' }, 'Mantenimiento ' + upkeepText(A2.upkeep_of(g, d)) + (sq ? ' · ' + sq.name : '')));
}

/** Ficha legible de la unidad seleccionada: tipo, modificadores, nivel, mantenimiento. */
export function detail(d) {
  const g = getState().game;
  const ut = ROSTER[rk(d)] || {};
  const m = A2.mods_of(g, d);
  const li = levelInfo(d);
  const sq = A2.squad_of(g, d);
  const t = sq ? A2.form_type(g, sq) : null;
  const rows = [
    ['Tipo', (ut.name || rk(d)) + (ut.cls ? ' · ' + ut.cls : '')],
    ['Nivel', li.lv + ' · ' + li.name + (li.next == null ? '' : ' (' + fmtNum(li.xp) + '/' + li.next + ' XP)')],
    ['Ataque', mod(m.atk)], ['Defensa', mod(m.def)], ['Vida', mod(m.hp)], ['Velocidad', mod(m.spd)],
    ['Mantenimiento', upkeepText(A2.upkeep_of(g, d))],
    ['Escuadra', t ? sq.name + ' · ' + t.name : 'Ninguna (individual)'],
  ];
  const nm = navMoves(d);
  if (nm) rows.push(['Movimiento naval', nm.left + ' de ' + nm.max + ' este turno']);
  if (d.unsup) rows.push(['Suministro', d.unsup >= 2 ? 'Hambre (' + d.unsup + ' turnos)' : 'Sin suministro']);
  return h('div', { class: 'army-detail' }, rows.map(([k, v]) => h('div', { class: 'row small' }, h('span', { class: 'muted grow' }, k), h('b', null, v))));
}

const act = async (body, rerender) => { await extAction(body); rerender(); };

function neutralTargets(d) {
  const g = getState().game, me = player();
  const allies = allies_of(g, me);
  return Object.keys(g.countries).filter((c) => g.countries[c].owner === c && c !== me && !at_war(g, me, c) && !allies.includes(c)
    && (is_adjacent(d.location, c) || ['nav', 'air', 'heli'].includes(cls(d))));
}

/** Botones de Ejército 2 para una división. */
export function actions(d, rerender) {
  const g = getState().game;
  const k = rk(d);
  const c = cls(d);
  const box = h('div', { class: 'stack army-acts' }, h('div', { class: 'muted small tag-uc' }, 'Mejoras y operaciones'), detail(d));
  const row = h('div', { class: 'army-btns' });
  const rf = A2.retrofit_cost(g, d);
  row.append(h('button', { class: 'btn small', disabled: rf.to <= rf.from, title: 'Aplica las mejoras investigadas a la unidad',
    onclick: () => act({ action: 'retrofit', div: d.id }, rerender) }, icon('flask'),
  rf.to > rf.from ? 'Reequipar (' + fmtMoney(rf.cost) + ')' : 'Reequipado'));
  const maxed = (d.lv || 0) >= A2.MAX_LEVEL;
  row.append(h('button', { class: 'btn small', disabled: maxed, title: 'Necesita Laboratorio central. Cuesta dinero y da experiencia.',
    onclick: () => act({ action: 'train', div: d.id }, rerender) }, icon('bolt'),
  maxed ? 'Nivel máximo' : 'Entrenar (' + fmtMoney(8 + (ROSTER[k].cost || 0) * 0.1) + ')'));
  if (BOMBERS.has(k)) {
    row.append(h('button', { class: 'btn small' + (d.scorched ? ' danger' : ''), 'aria-pressed': String(!!d.scorched),
      title: '+25 % daño, -40 % defensa, -20 % vida, +15 % mantenimiento',
      onclick: () => act({ action: 'scorched_earth', div: d.id }, rerender) }, icon('fire'), d.scorched ? 'Tierra quemada: sí' : 'Tierra quemada'));
  }
  if (FLY.has(c) || k === 'sub') {
    row.append(h('button', { class: 'btn small' + (d.patrol ? ' on' : ''), 'aria-pressed': String(!!d.patrol),
      title: 'Patrulla su zona y ataca al contacto',
      onclick: () => act({ action: 'patrol', div: d.id }, rerender) }, icon('target'), d.patrol ? 'Cancelar patrulla' : 'Patrullar'));
  }
  if (d.foreign) {
    row.append(h('button', { class: 'btn small', onclick: () => act({ action: 'recall', div: d.id }, rerender) }, icon('people'), 'Retirar a casa'));
  } else {
    const blocked = ['carga', 'marcha', 'recarga'].includes(d.st);
    row.append(h('button', { class: 'btn small danger', disabled: blocked, title: blocked ? 'No puede moverse ahora' : 'Entrar en un país neutral',
      onclick: () => sendNeutral(d, rerender) }, icon('swords'), 'Enviar a neutral'));
  }
  box.append(row);
  return box;
}

async function sendNeutral(d, rerender) {
  const list = neutralTargets(d);
  if (!list.length) { await confirmModal({ title: 'Sin destinos', text: 'No hay países neutrales a tu alcance.', okText: 'Entendido', cancelText: 'Cerrar' }); return; }
  const tension = Math.round(A2.tension_of(rk(d)));
  const pick = await new Promise((res) => {
    let m;
    const done = (v) => { m.close(); res(v); };
    m = openModal([h('h2', null, 'Enviar ' + d.name + ' a un país neutral'),
      h('p', { class: 'muted small' }, 'Entrar sin invitación provoca tensión diplomática: -' + tension + ' de relación al entrar.'),
      h('div', { class: 'list' }, list.map((cid) => h('button', { class: 'btn block', onclick: () => done(cid) }, icon('swords'), cname(cid)))),
      h('button', { class: 'btn block', onclick: () => done(null) }, icon('close'), 'Cancelar')],
    { dismissible: true, label: 'Enviar a país neutral', onDismiss: () => res(null) });
  });
  if (!pick) return;
  const ok = await confirmModal({ title: 'Provocar a ' + cname(pick) + '?', text: 'La relación con ' + cname(pick) + ' bajará ' + tension + ' puntos al entrar.', okText: 'Enviar', cancelText: 'Cancelar', danger: true });
  if (ok) await act({ action: 'send_neutral', div: d.id, target: pick }, rerender);
}

/** Tipo, modificadores, nivel medio y mantenimiento de una formación. */
export function formInfo(fm) {
  const g = getState().game;
  const t = A2.form_type(g, fm);
  const members = (fm.divs || []).map((id) => (g.divisions || []).find((x) => x.id === id)).filter(Boolean);
  const lv = members.length ? members.reduce((s, x) => s + (x.lv || 0), 0) / members.length : 0;
  const mods = [['atk', 'Ataque'], ['def', 'Defensa'], ['hp', 'Vida'], ['spd', 'Velocidad'], ['dmg', 'Daño']]
    .filter(([key]) => Math.abs((t.mods[key] || 1) - 1) > 0.001).map(([key, lab]) => lab + ' ' + mod(t.mods[key]));
  return h('div', { class: 'stack army-x' },
    h('div', { class: 'row wrap', style: { gap: '4px' } },
      h('span', { class: 'pill' }, icon('squad'), t.name),
      h('span', { class: 'pill' }, 'Nivel medio ' + fmtDec(lv)),
      mods.map((x) => h('span', { class: 'pill' }, x))),
    h('div', { class: 'muted small' }, 'Mantenimiento ' + upkeepText(A2.upkeep_of(g, fm))));
}

/** Controles de formación: unir, separar, renombrar. */
export function formControls(fm, rerender) {
  const g = getState().game, me = player();
  const members = (g.divisions || []).filter((d) => d.owner === me && fm.divs.includes(d.id));
  const loc = members.length ? members[0].location : null;
  const inForm = new Set(((g.ext.forms && g.ext.forms[me]) || []).flatMap((f) => f.divs));
  const joinable = (g.divisions || []).filter((d) => d.owner === me && d.location === loc && !inForm.has(d.id));
  const box = h('div', { class: 'stack army-forms' });
  box.append(h('button', { class: 'btn small', onclick: async () => {
    const nm = window.prompt('Nuevo nombre de la formación', fm.name);
    if (nm && nm.trim()) await act({ action: 'form_rename', id: fm.id, name: nm.trim() }, rerender);
  } }, icon('check'), 'Renombrar'));
  if (joinable.length) {
    box.append(h('div', { class: 'muted small' }, 'Unir al grupo (mismo territorio):'),
      h('div', { class: 'army-btns' }, joinable.map((d) => h('button', { class: 'btn small', onclick: () => act({ action: 'form_join', id: fm.id, div: d.id }, rerender) },
        icon('plus'), d.name))));
  }
  if (members.length >= 2) {
    const sel = new Set();
    box.append(h('div', { class: 'muted small' }, 'Separar divisiones (2 o más forman un grupo nuevo, 1 sale suelta):'),
      ...members.map((d) => h('label', { class: 'row', style: { padding: '2px' } },
        h('input', { type: 'checkbox', onchange: (e) => { if (e.target.checked) sel.add(d.id); else sel.delete(d.id); } }), h('span', null, d.name))),
      h('button', { class: 'btn small', onclick: async () => { if (!sel.size) return; await act({ action: 'form_split', id: fm.id, divs: [...sel] }, rerender); } }, icon('close'), 'Separar'));
  }
  return box;
}

export { artUnit };
