// Pantalla de Diplomacia.
import { h, fmtMoney, ALIGN, MONEY_SCALE, SEND_MIN, SEND_DEFAULT, toast } from '../util.js';
import { icon } from '../icons.js';
import { getState, setState, player, cname, ownerOf, relation, isAtWar, partners, sendOrder, loadDetail, detail } from '../state.js';
import { relBar, statusPills, armyEst } from './country.js';
import { amountModal, confirmModal } from './modals.js';
import * as ST from '../state.js';
import * as F from '../engine/features.js';

let tab = 'dip';
const TABS = [['dip', 'Diplomacia'], ['ali', 'Alianzas'], ['tra', 'Acuerdos'], ['gue', 'Guerras'], ['blo', 'Bloques'], ['pac', 'Tratados'], ['esp', 'Espionaje']];
const TYPE = { alliance: 'Alianza', nap: 'Pacto de no agresión', trade: 'Acuerdo comercial' };

function actions(t) {
  const me = player();
  const S = getState();
  const has = (type) => (S.game.treaties || []).some((x) => x.type === type && ((x.a === me && x.b === t) || (x.b === me && x.a === t)));
  const war = isAtWar(me, t);
  const o = (type, params) => sendOrder({ type, target: t, ...(params ? { params } : {}) });
  const b = (label, ic, fn, cls = '') => h('button', { class: 'btn block ' + cls, onclick: fn }, icon(ic), label);
  return h('div', { class: 'stack' },
    war ? b('Proponer paz', 'rings', () => o('peace')) : null,
    !has('alliance') && !war ? b('Proponer alianza', 'rings', () => o('propose_alliance')) : null,
    !has('nap') && !war ? b('Pacto de no agresión', 'shield', () => o('nap')) : null,
    !has('trade') && !war ? b('Acuerdo comercial', 'coins', () => o('trade')) : null,
    b('Enviar recursos', 'plane', async () => {
      // cantidades en pantalla en millones (x MONEY_SCALE); el backend usa unidades internas (SEND_MIN del motor)
      const money = Math.floor(S.game.countries[me].money);
      if (money < SEND_MIN) { toast('El envío mínimo es ' + fmtMoney(SEND_MIN) + '.', 'err'); return; }
      const n = await amountModal({ title: 'Enviar recursos', text: 'Cantidad en millones de $ a enviar a ' + cname(t) + ' (mínimo ' + fmtMoney(SEND_MIN) + ', máximo ' + fmtMoney(money) + ').', min: SEND_MIN * MONEY_SCALE, max: money * MONEY_SCALE, value: Math.min(SEND_DEFAULT, money) * MONEY_SCALE, step: MONEY_SCALE });
      if (n) o('send_resources', { amount: Math.max(SEND_MIN, Math.min(money, Math.round(n / MONEY_SCALE))) });
    }),
    (has('alliance') || has('nap') || has('trade')) ? b('Romper tratado', 'close', async () => {
      const type = ['alliance', 'nap', 'trade'].find(has);
      if (await confirmModal({ title: 'Romper tratado', text: `¿Romper el tratado (${TYPE[type]}) con ${cname(t)}? Las relaciones empeorarán.`, okText: 'Romper', danger: true })) o('break', { treaty: type });
    }) : null,
    !war ? b('Declarar guerra', 'swords', async () => {
      if (await confirmModal({ title: 'Declarar guerra', text: `¿Declarar la guerra a ${cname(t)}? Esta decisión afectará la estabilidad y a tus aliados.`, okText: 'Declarar guerra', danger: true })) o('declare_war');
    }, 'danger') : null);
}

function target(el) {
  const S = getState();
  const me = player();
  const list = partners();
  let t = S.diploTarget || ownerOf(S.selected || '') || null;
  if (!t || t === me || !S.game.countries[t]) t = list[0];
  if (t && !list.includes(t)) list.unshift(t);
  if (!t) return h('div', { class: 'empty' }, 'No hay países con los que negociar.');
  loadDetail(t);
  const d = detail(t);
  const c = S.game.countries[t];
  const rv = d && d.relation != null ? d.relation : relation(me, t);
  const sel = h('select', { class: 'field', 'aria-label': 'País objetivo', onchange: (e) => setState({ diploTarget: e.target.value }) },
    list.map((id) => h('option', { value: id, selected: id === t }, cname(id))));
  return h('div', { class: 'stack' },
    h('div', { class: 'panel stack' },
      h('div', { class: 'row' }, h('h2', { class: 'grow' }, cname(t)), statusPills(t)),
      sel,
      h('div', { class: 'muted small' }, 'Relación: ' + rv), relBar(rv),
      h('div', { class: 'grid2' },
        h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Amenaza'), h('b', null, d && d.threat != null ? Math.round(d.threat) + '/100' : '?')),
        h('div', { class: 'kv', style: { gridColumn: '1 / -1' } }, h('span', { class: 'muted' }, 'Ejército est.'), h('b', null, d && d.army_estimate != null ? armyEst(d.army_estimate) : '?')),
        h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Alineamiento'), h('b', null, ALIGN[c.alignment] || c.alignment)))),
    h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Acciones'), actions(t)),
    h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Países'),
      h('div', { class: 'list' }, list.map((id) => h('button', { class: 'item', 'aria-pressed': String(id === t), onclick: () => setState({ diploTarget: id }) },
        h('span', { class: 'grow' }, cname(id)), statusPills(id), h('span', { class: 'muted small' }, relation(me, id)))))));
}

function treatyList(types, withBreak) {
  const S = getState();
  const me = player();
  const l = (S.game.treaties || []).filter((x) => types.includes(x.type) && (x.a === me || x.b === me));
  if (!l.length) return h('div', { class: 'empty' }, 'Ninguno por ahora.');
  return h('div', { class: 'list' }, l.map((x) => {
    const other = x.a === me ? x.b : x.a;
    return h('div', { class: 'item' }, h('span', { class: 'grow' }, `${TYPE[x.type] || x.type}: ${cname(other)}`), h('span', { class: 'muted small' }, 'desde T' + x.since_turn),
      withBreak ? h('button', { class: 'btn sm', onclick: () => sendOrder({ type: 'break', target: other, params: { treaty: x.type } }) }, 'Romper') : null);
  }));
}

function wars() {
  const S = getState();
  const me = player();
  const l = (S.game.wars || []).filter((w) => w.a === me || w.b === me);
  if (!l.length) return h('div', { class: 'empty' }, 'Estás en paz.');
  return h('div', { class: 'list' }, l.map((w) => {
    const other = w.a === me ? w.b : w.a;
    return h('button', { class: 'item', onclick: () => setState({ diploTarget: other, selected: other, screen: 'map' }) },
      icon('swords'), h('span', { class: 'grow' }, 'Guerra contra ' + cname(other)), h('span', { class: 'muted small' }, 'desde T' + w.since_turn));
  }));
}

// ---- Pestañas extendidas (requieren game.ext, modo local) ----
const ext = () => { const g = getState().game; return g && g.ext; };
const act = (body) => (ST.extAction ? ST.extAction(body) : Promise.resolve());
const noExt = () => h('div', { class: 'panel' }, h('div', { class: 'empty' }, 'Disponible en modo sin conexión (local).'));

function others() {
  const S = getState();
  const me = player();
  return Object.keys(S.game.countries).filter((id) => id !== me);
}
function tgtSel(cur, onchange) {
  return h('select', { class: 'field', 'aria-label': 'País objetivo', onchange: (e) => onchange(e.target.value) },
    others().map((id) => h('option', { value: id, selected: id === cur }, cname(id))));
}
function sharesBorder(me, members) {
  const S = getState();
  const nb = (S.mapById && S.mapById[me] && S.mapById[me].neighbors) || [];
  return members.some((m) => m !== me && nb.includes(m));
}

function blocos() {
  const e = ext();
  if (!e) return noExt();
  const me = player();
  const BL = F.BLOCS || {};
  const blocs = e.blocs || {};
  const mineN = Object.keys(blocs).filter((b) => (blocs[b] || []).includes(me)).length;
  return h('div', { class: 'stack' },
    h('p', { class: 'muted small' }, 'Para unirte a un bloque necesitas frontera terrestre con algún miembro y relación media ≥ 10 con los miembros. Máximo 2 bloques.'),
    Object.entries(BL).map(([id, b]) => {
      const members = blocs[id] || [];
      const inB = members.includes(me);
      const rels = members.filter((m) => m !== me).map((m) => relation(me, m));
      const avg = rels.length ? Math.round(rels.reduce((a, c) => a + c, 0) / rels.length) : 0;
      const border = sharesBorder(me, members);
      const okRel = !rels.length || avg >= 10;
      const can = !inB && border && okRel && mineN < 2;
      return h('div', { class: 'panel stack' },
        h('div', { class: 'row' }, h('h3', { class: 'grow' }, b.name), inB ? h('span', { class: 'pill me' }, 'Miembro') : null),
        h('div', { class: 'muted small' }, b.desc),
        h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Relación media'), h('b', null, rels.length ? String(avg) : '-')),
        h('div', { class: 'row wrapr', style: { flexWrap: 'wrap', gap: '4px' } },
          members.length ? members.map((m) => h('span', { class: 'pill' + (m === me ? ' me' : '') }, cname(m))) : h('span', { class: 'muted small' }, 'Sin miembros')),
        inB
          ? h('button', { class: 'btn danger block', onclick: async () => {
            if (await confirmModal({ title: 'Salir del bloque', text: `¿Abandonar ${b.name}? Tus relaciones con los miembros empeorarán.`, okText: 'Salir', danger: true })) act({ action: 'bloc_leave', bloc: id });
          } }, 'Abandonar bloque')
          : h('div', { class: 'stack' },
            h('button', { class: 'btn primary block', disabled: !can, onclick: () => act({ action: 'bloc_join', bloc: id }) }, 'Unirse'),
            !can ? h('div', { class: 'muted small' }, mineN >= 2 ? 'Ya perteneces a 2 bloques.' : !border ? 'Requiere frontera con un miembro.' : !okRel ? 'Relación media insuficiente (≥ 10).' : '') : null));
    }));
}

const pf = { type: 'com', target: null, months: 12 };
function pactos(el) {
  const e = ext();
  if (!e) return noExt();
  const S = getState();
  const me = player();
  const PT = F.PACT_TYPES || {};
  const MONTHS = F.PACT_MONTHS || [6, 12, 24];
  const turn = S.game.turn || 0;
  const list = (e.pacts || []).map((p, i) => ({ p, i })).filter(({ p }) => p.a === me || p.b === me);
  if (!pf.target || pf.target === me || !S.game.countries[pf.target]) pf.target = others()[0];
  if (!PT[pf.type]) pf.type = Object.keys(PT)[0];
  const redraw = () => render(el);
  const active = h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Tratados activos'),
    list.length ? h('div', { class: 'list' }, list.map(({ p, i }) => {
      const other = p.a === me ? p.b : p.a;
      const left = Math.max(0, (p.until || 0) - turn);
      return h('div', { class: 'item' },
        h('span', { class: 'grow' }, `${(PT[p.type] && PT[p.type].name) || p.type}: ${cname(other)}`),
        h('span', { class: 'muted small' }, left + ' meses'),
        h('button', { class: 'btn sm', onclick: async () => {
          if (await confirmModal({ title: 'Cancelar tratado', text: `¿Cancelar el tratado con ${cname(other)}? Las relaciones empeorarán.`, okText: 'Cancelar tratado', danger: true })) act({ action: 'pact_cancel', index: i });
        } }, 'Cancelar'));
    })) : h('div', { class: 'empty' }, 'Sin tratados activos.'));
  const form = h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Proponer tratado'),
    tgtSel(pf.target, (v) => { pf.target = v; redraw(); }),
    h('div', { class: 'optrow' }, Object.entries(PT).map(([k, t]) =>
      h('button', { class: 'btn sm' + (pf.type === k ? ' sel' : ''), 'aria-pressed': String(pf.type === k), onclick: () => { pf.type = k; redraw(); } }, t.name))),
    PT[pf.type] ? h('div', { class: 'muted small' }, PT[pf.type].desc) : null,
    h('div', { class: 'optrow' }, MONTHS.map((m) =>
      h('button', { class: 'btn sm' + (pf.months === m ? ' sel' : ''), 'aria-pressed': String(pf.months === m), onclick: () => { pf.months = m; redraw(); } }, m + ' meses'))),
    h('button', { class: 'btn primary block', disabled: !pf.target, onclick: () => act({ action: 'pact', type: pf.type, target: pf.target, months: pf.months }) }, 'Proponer'));
  return h('div', { class: 'stack' }, active, form);
}

const sp = { target: null };
function espionaje(el) {
  const e = ext();
  if (!e) return noExt();
  const S = getState();
  const me = player();
  const turn = S.game.turn || 0;
  const OPS = F.SPY_OPS || {};
  if (!sp.target || sp.target === me || !S.game.countries[sp.target]) sp.target = others()[0];
  const t = sp.target;
  const redraw = () => render(el);
  const until = e.intel && e.intel[me] && e.intel[me][t];
  const c = t && S.game.countries[t];
  const peek = until != null && until >= turn && c
    ? h('div', { class: 'grid2' },
      h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Ejército'), h('b', null, String(Math.round(c.army || 0)))),
      h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Tanques'), h('b', null, String(Math.round(c.tanks || 0)))),
      h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Aviones'), h('b', null, String(Math.round(c.planes || 0)))),
      h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Dinero'), h('b', null, fmtMoney(c.money || 0))),
      h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Estabilidad'), h('b', null, String(Math.round(c.stability || 0)))),
      h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Vigente'), h('b', null, Math.max(0, until - turn) + ' meses')))
    : h('div', { class: 'empty' }, 'Sin inteligencia vigente. Realiza una operación de revelación.');
  const ops = h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Operaciones'),
    Object.entries(OPS).map(([k, o]) => h('div', { class: 'item stack' },
      h('div', { class: 'row' }, h('b', { class: 'grow' }, o.name), h('span', { class: 'muted small' }, 'Coste ' + fmtMoney(o.cost) + ' · Riesgo ' + Math.round((o.risk || 0) * (o.risk <= 1 ? 100 : 1)) + '%')),
      h('div', { class: 'muted small' }, o.desc),
      h('button', { class: 'btn sm' + (k === 'coup' ? ' danger' : ''), disabled: !t, onclick: async () => {
        if (k === 'coup' && !(await confirmModal({ title: 'Golpe de Estado', text: `¿Instigar un golpe de Estado en ${cname(t)}? Si te descubren, habrá consecuencias diplomáticas graves.`, okText: 'Ejecutar', danger: true }))) return;
        act({ action: 'spy', op: k, target: t });
      } }, 'Ejecutar'))));
  const log = (e.spy_log || []).slice(-10).reverse();
  return h('div', { class: 'stack' },
    h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Objetivo'), tgtSel(t, (v) => { sp.target = v; redraw(); }), peek),
    ops,
    h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Registro'),
      log.length ? h('div', { class: 'list' }, log.map((l) => h('div', { class: 'item' },
        h('span', { class: 'grow' }, `${(OPS[l.op] && OPS[l.op].name) || l.op}: ${cname(l.target)}`),
        h('span', { class: 'pill ' + (l.ok ? 'ally' : 'war') }, l.ok ? 'Éxito' : (l.caught ? 'Descubierto' : 'Fallo')),
        h('span', { class: 'muted small' }, 'T' + l.turn)))) : h('div', { class: 'empty' }, 'Sin operaciones.')));
}

export function render(el) {
  el.replaceChildren();
  if (!getState().game) return;
  const tabs = h('div', { class: 'tabs', role: 'tablist' }, TABS.map(([id, l]) =>
    h('button', { class: 'tab', role: 'tab', 'aria-selected': String(tab === id), onclick: () => { tab = id; render(el); } }, l)));
  let body;
  if (tab === 'dip') body = target(el);
  else if (tab === 'ali') body = treatyList(['alliance'], true);
  else if (tab === 'tra') body = treatyList(['nap', 'trade'], true);
  else if (tab === 'gue') body = wars();
  else if (tab === 'blo') body = blocos();
  else if (tab === 'pac') body = pactos(el);
  else body = espionaje(el);
  el.append(h('h2', null, 'Diplomacia'), tabs, body);
}
