// Pantalla de Economia: gestion, industria, infraestructura, presupuesto, estabilidad.
import { h, fmtNum, fmtDec, fmtMoney, fmtSigned, deltaClass, COSTS, PROJECT_KIND, clamp, toast } from '../util.js';
import { icon } from '../icons.js';
import * as ST from '../state.js';
import * as F from '../engine/features.js';
import * as SUPPLY from '../engine/supply.js';
import { confirmModal } from './modals.js';
import { getState, setState, player, sendOrder, saveBudget, detail, loadDetail } from '../state.js';

let tab = 'gestion';
let budTimer = null;
let draft = null;
let draftGame = null; // id de la partida a la que pertenece draft
const TABS = [['gestion', 'Gestión'], ['suministro', 'Suministro'], ['industria', 'Industria'], ['infra', 'Infraestructura'], ['presupuesto', 'Presupuesto'], ['estabilidad', 'Estabilidad'], ['politica', 'Política'], ['investigacion', 'Investigación']];
const SECTOR = { industry: 'Industria', agriculture: 'Agricultura', services: 'Servicios' };
const BUD = [['army', 'Ejército'], ['social', 'Social'], ['infrastructure', 'Infraestructura'], ['industry', 'Industria']];

function flat(d) { return d ? { ...d, ...(d.country || {}) , ...d } : null; }
const card = (t, n, cls) => h('div', { class: 'card' }, h('div', { class: 't' }, t), h('div', { class: 'n ' + (cls || '') }, n));

function orderBtn(label, ic, cost, order, sub) {
  return h('button', { class: 'btn block', onclick: () => sendOrder(order) },
    icon(ic), h('span', { class: 'grow' }, label + (sub ? ' ' + sub : '')), cost != null ? h('span', { class: 'muted small' }, fmtMoney(cost)) : null);
}

function topCards(c, d) {
  const sm = getState().game.summary || {};
  const inc = d && d.income != null ? d.income : sm.income;
  const exp = d && d.expenses != null ? d.expenses : sm.expenses;
  const bal = d && d.balance != null ? d.balance : sm.balance;
  return h('div', { class: 'cards' },
    card('PIB', d && d.gdp != null ? fmtMoney(d.gdp) : '-'),
    card('Ingresos', inc != null ? fmtMoney(inc) : '-', 'up'),
    card('Gastos', exp != null ? fmtMoney(exp) : '-', 'down'),
    card('Balance', bal != null ? fmtSigned(bal, true) : '-', deltaClass(bal || 0)));
}

function gestion(c, d) {
  const e = ext();
  const me = player();
  const supply = e && e.supply && e.supply[me];
  const hasShortage = supply && supply.short && Object.values(supply.short).some(v => v > 0.05);

  return h('div', { class: 'stack' }, topCards(c, d),
    hasShortage ? h('div', { class: 'panel warn' },
      h('div', { class: 'row' }, icon('shortage'), h('b', { class: 'grow' }, 'Escasez de recursos'),
        h('button', { class: 'btn sm', onclick: () => { tab = 'suministro'; render(document.getElementById('economy')); } }, 'Ver'))) : null,
    h('div', { class: 'panel stack' },
      h('h3', { class: 'tag-uc' }, 'Indicadores'),
      h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Tesoro'), h('b', null, fmtMoney(c.money))),
      h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Industria'), h('b', null, fmtNum(c.industry))),
      h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Producción'), h('b', null, fmtNum(c.production))),
      h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Desarrollo'), h('b', null, fmtDec(c.development, 2))),
      h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Población'), h('b', null, fmtNum(c.population) + ' M')),
      (c.resources || []).length ? h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '4px' } }, c.resources.map((r) => h('span', { class: 'pill' }, r))) : null),
    h('div', { class: 'panel stack' },
      h('h3', { class: 'tag-uc' }, 'Órdenes rápidas'),
      orderBtn('Reclutar tropas', 'helmet', COSTS.recruit, { type: 'recruit', target: c.id }),
      orderBtn('Producir tanques', 'tank', COSTS.tanks, { type: 'tanks', target: c.id }),
      orderBtn('Producir aviones', 'plane', COSTS.planes, { type: 'planes', target: c.id }),
      orderBtn('Programa de estabilidad', 'heart', COSTS.stability, { type: 'stability', target: c.id })));
}

function sectorChart(d) {
  const so = d && d.sector_output;
  const entries = so ? Object.entries(so).map(([k, v]) => [k, typeof v === 'number' ? v : (v && (v.income != null ? v.income : v.value)) || 0]) : [];
  if (!entries.length) return h('div', { class: 'empty' }, 'Sin datos sectoriales todavía.');
  const max = Math.max(1, ...entries.map((e) => Math.abs(e[1])));
  return h('div', { class: 'chart stack', role: 'img', 'aria-label': 'Producción por sector' },
    entries.map(([k, v]) => h('div', { class: 'row' },
      h('span', { class: 'small', style: { width: '96px', flex: 'none', textTransform: 'capitalize' } }, SECTOR[k] || k),
      h('div', { class: 'bar grow' }, h('i', { style: { width: (Math.abs(v) / max * 100) + '%' } })),
      h('b', { class: 'small', style: { width: '48px', flex: 'none', textAlign: 'right' } }, fmtNum(v)))));
}

function projects(kinds) {
  const g = getState().game;
  const me = player();
  const mine = (g.projects || []).filter((p) => p.owner === me);
  const list = kinds ? mine.filter((p) => kinds.includes(p.kind)) : mine;
  if (!list.length) return h('div', { class: 'empty' }, 'Sin proyectos en curso.');
  return h('div', { class: 'list' }, list.map((p) => {
    const done = p.total_turns ? clamp((p.total_turns - p.turns_left) / p.total_turns * 100, 0, 100) : 0;
    return h('div', { class: 'item stack' },
      h('div', { class: 'row' }, icon((PROJECT_KIND[p.kind] && p.kind) || 'factory'), h('b', { class: 'grow' }, (PROJECT_KIND[p.kind] || {}).name || p.name || p.kind),
        h('span', { class: 'muted small' }, p.turns_left + (p.turns_left === 1 ? ' turno' : ' turnos'))),
      h('div', { class: 'bar' }, h('i', { style: { width: done + '%' } })));
  }));
}

function projBtn(kind) {
  const k = PROJECT_KIND[kind];
  return h('button', { class: 'btn block', onclick: () => sendOrder({ type: 'project', target: player(), params: { kind } }) },
    icon(kind),
    h('span', { class: 'grow stack', style: { gap: '1px', textAlign: 'left' } }, h('span', null, k.name), h('span', { class: 'muted small' }, k.desc)),
    h('span', { class: 'muted small', style: { flex: 'none' } }, fmtMoney(COSTS.project[kind])));
}

function industria(c, d) {
  return h('div', { class: 'stack' },
    h('div', { class: 'cards' }, card('Industria', fmtNum(c.industry)), card('Producción', fmtNum(c.production))),
    h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Producción por sector'), sectorChart(d)),
    h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Inversión'),
      orderBtn('Construir industria', 'factory', COSTS.build, { type: 'build', target: c.id }),
      projBtn('factory')),
    h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Proyectos'), projects(['factory'])));
}

function infra(c) {
  return h('div', { class: 'stack' },
    h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Infraestructura ' + Math.round(c.infrastructure || 0) + '%'),
      h('div', { class: 'bar' }, h('i', { style: { width: clamp(c.infrastructure || 0, 0, 100) + '%' } }))),
    h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Nuevos proyectos'),
      ['road', 'port', 'school', 'barracks'].map(projBtn)),
    h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'En curso'), projects(['road', 'port', 'school', 'barracks'])));
}

function normalize(b, changed) {
  const keys = BUD.map((x) => x[0]);
  const others = keys.filter((k) => k !== changed);
  let rest = 100 - b[changed];
  const sum = others.reduce((s, k) => s + b[k], 0);
  others.forEach((k) => { b[k] = sum > 0 ? Math.round(b[k] / sum * rest) : Math.floor(rest / others.length); });
  let diff = 100 - keys.reduce((s, k) => s + b[k], 0);
  for (let i = 0; diff !== 0 && i < 200; i++) {
    const k = others[i % others.length];
    const step = diff > 0 ? 1 : -1;
    if (b[k] + step >= 0 && b[k] + step <= 100) { b[k] += step; diff -= step; }
  }
}

function presupuesto(c) {
  if (!draft) draft = { ...c.budget };
  const root = h('div', { class: 'stack' });
  const rows = {};
  const refresh = () => BUD.forEach(([k]) => {
    rows[k].pct.textContent = draft[k] + '%';
    rows[k].bar.style.width = draft[k] + '%';
    rows[k].range.value = draft[k];
  });
  const change = (k, v) => {
    draft[k] = clamp(Math.round(v), 0, 100);
    normalize(draft, k);
    refresh();
    clearTimeout(budTimer);
    budTimer = setTimeout(() => saveBudget({ ...draft }), 600);
  };
  root.append(h('p', { class: 'muted small' }, 'Reparte el 100% del presupuesto. Al mover una partida, las demás se ajustan.'));
  BUD.forEach(([k, label]) => {
    const pct = h('b', { class: 'pct' }, draft[k] + '%');
    const bar = h('i', { style: { width: draft[k] + '%' } });
    const range = h('input', { type: 'range', min: 0, max: 100, step: 1, value: draft[k], 'aria-label': label, oninput: (e) => change(k, +e.target.value) });
    rows[k] = { pct, bar, range };
    root.append(h('div', { class: 'slrow panel stack' },
      h('div', { class: 'row' }, h('span', { class: 'nm grow' }, label), pct),
      h('div', { class: 'bar' }, bar),
      h('div', { class: 'ctl row' },
        h('button', { class: 'iconbtn', 'aria-label': 'Reducir ' + label, onclick: () => change(k, draft[k] - 5) }, icon('minus')),
        range,
        h('button', { class: 'iconbtn', 'aria-label': 'Aumentar ' + label, onclick: () => change(k, draft[k] + 5) }, icon('plus')))));
  });
  return root;
}

// ---- Pestañas extendidas (requieren game.ext, modo local) ----
const ext = () => { const g = getState().game; return g && g.ext; };
const act = (body) => (ST.extAction ? ST.extAction(body) : Promise.resolve());
const noExt = () => h('div', { class: 'panel' }, h('div', { class: 'empty' }, 'Disponible en modo sin conexión (local).'));
const BRANCHES = [['inf', 'Infantería'], ['arm', 'Blindados'], ['art', 'Artillería'], ['air', 'Aviación'], ['eco', 'Economía']];

function spark(vals) {
  if (!vals || vals.length < 2) return h('span', { class: 'muted small' }, '-');
  const mn = Math.min(...vals), mx = Math.max(...vals), rg = (mx - mn) || 1;
  const pts = vals.map((v, i) => (i / (vals.length - 1) * 100).toFixed(1) + ',' + (28 - (v - mn) / rg * 26).toFixed(1)).join(' ');
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 -1 100 31'); svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'spark'); svg.setAttribute('aria-hidden', 'true');
  const pl = document.createElementNS(ns, 'polyline');
  pl.setAttribute('points', pts);
  svg.append(pl);
  return svg;
}

function politica() {
  const e = ext();
  if (!e) return noExt();
  const me = player();
  const pol = (e.policy && e.policy[me]) || { tax: 'media', laws: {}, focus: null, foci_done: [] };
  const TAX = F.TAX || {}, LAWS = F.LAWS || {}, FOCI = F.FOCI || [];
  const taxes = h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Impuestos'),
    h('div', { class: 'optrow' }, Object.entries(TAX).map(([k, t]) =>
      h('button', { class: 'btn' + (pol.tax === k ? ' sel' : ''), 'aria-pressed': String(pol.tax === k), onclick: () => { if (pol.tax !== k) act({ action: 'tax', level: k }); } },
        h('span', { class: 'stack', style: { gap: '1px' } }, h('b', null, t.name),
          h('span', { class: 'small ' + deltaClass(t.inc) }, 'Ingresos ' + fmtSigned(t.inc)),
          h('span', { class: 'small ' + deltaClass(t.stab) }, 'Estab. ' + fmtSigned(t.stab)))))));
  const laws = h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Leyes'),
    Object.entries(LAWS).map(([lk, law]) => {
      const cur = (pol.laws || {})[lk];
      const opt = (law.opts || {})[cur];
      return h('div', { class: 'stack' },
        h('b', null, law.name),
        h('div', { class: 'optrow' }, Object.entries(law.opts || {}).map(([ok, o]) =>
          h('button', { class: 'btn sm' + (cur === ok ? ' sel' : ''), 'aria-pressed': String(cur === ok), onclick: () => { if (cur !== ok) act({ action: 'law', law: lk, value: ok }); } }, o.name))),
        opt ? h('div', { class: 'muted small' }, opt.desc) : null);
    }));
  const fc = pol.focus && FOCI.find((x) => x.id === pol.focus.id);
  const done = pol.foci_done || [];
  const avail = FOCI.filter((x) => !done.includes(x.id) && !(pol.focus && pol.focus.id === x.id));
  const focus = h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Foco nacional'),
    fc ? h('div', { class: 'stack' },
      h('div', { class: 'row' }, h('b', { class: 'grow' }, fc.name), h('span', { class: 'muted small' }, pol.focus.left + (pol.focus.left === 1 ? ' turno' : ' turnos'))),
      h('div', { class: 'bar' }, h('i', { style: { width: clamp((fc.turns - pol.focus.left) / (fc.turns || 1) * 100, 0, 100) + '%' } })),
      h('div', { class: 'muted small' }, fc.desc)) : h('div', { class: 'muted small' }, 'Sin foco activo.'),
    avail.length ? h('div', { class: 'list' }, avail.map((x) => h('div', { class: 'item stack' },
      h('div', { class: 'row' }, h('b', { class: 'grow' }, x.name), h('span', { class: 'muted small' }, x.turns + ' turnos')),
      h('div', { class: 'muted small' }, x.desc),
      h('button', { class: 'btn sm', disabled: !!pol.focus, onclick: () => act({ action: 'focus', id: x.id }) }, 'Adoptar')))) : null,
    done.length ? h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '4px' } }, done.map((id) => {
      const f = FOCI.find((x) => x.id === id);
      return h('span', { class: 'pill ally' }, (f ? f.name : id));
    })) : null);
  const pr = e.prices || {};
  const COM = F.COMMODITIES || {};
  const ids = Object.keys(pr.cur || COM);
  const hist = pr.hist || [];
  const mk = h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Mercados'),
    ids.length ? h('div', { class: 'list' }, ids.map((id) => {
      const vals = hist.map((x) => x[id]).filter((v) => typeof v === 'number');
      const cur = (pr.cur || {})[id];
      const prev = vals.length > 1 ? vals[vals.length - 2] : cur;
      return h('div', { class: 'item' }, h('span', { class: 'grow' }, (COM[id] && COM[id].name) || id),
        spark(vals), h('b', null, cur != null ? fmtDec(cur, 2) : '-'),
        h('span', { class: 'small ' + deltaClass((cur || 0) - (prev || 0)) }, fmtSigned(Math.round(((cur || 0) - (prev || 0)) * 100) / 100)));
    })) : h('div', { class: 'empty' }, 'Sin datos de mercado todavía.'));
  return h('div', { class: 'stack' }, taxes, laws, focus, mk);
}

function investigacion() {
  const e = ext();
  if (!e) return noExt();
  const me = player();
  const T = (e.techs && e.techs[me]) || { rp: 0, done: [], cur: null, prog: 0 };
  const lab = (e.labs && e.labs[me]) || 0;
  const TECHS = F.TECHS || [];
  const rate = F.research_rate ? F.research_rate(getState().game, me) : null;
  const cur = T.cur && TECHS.find((t) => t.id === T.cur);
  const done = T.done || [];
  const nm = (id) => (TECHS.find((t) => t.id === id) || {}).name || id;
  const head = h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Investigación'),
    h('div', { class: 'cards' }, card('Puntos', fmtDec(T.rp || 0, 1)), card('Por turno', rate != null ? '+' + fmtDec(rate, 1) : '-', 'up')),
    cur ? h('div', { class: 'stack' },
      h('div', { class: 'row' }, h('b', { class: 'grow' }, cur.name), h('span', { class: 'muted small' }, Math.round(T.prog || 0) + ' / ' + cur.cost)),
      h('div', { class: 'bar' }, h('i', { style: { width: clamp((T.prog || 0) / (cur.cost || 1) * 100, 0, 100) + '%' } }))) :
      h('div', { class: 'muted small' }, 'Sin investigación en curso.'));
  const labp = h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Laboratorio'),
    h('div', { class: 'row' }, h('b', { class: 'grow' }, 'Nivel ' + lab + '/3'), h('div', { class: 'bar grow' }, h('i', { style: { width: lab / 3 * 100 + '%' } }))),
    h('button', { class: 'btn block', disabled: lab >= 3, onclick: async () => {
      if (await confirmModal({ title: 'Mejorar laboratorio', text: '¿Invertir en mejorar el laboratorio al nivel ' + (lab + 1) + '? Aumenta los puntos de investigación por turno.', okText: 'Mejorar' })) act({ action: 'lab' });
    } }, icon('school'), lab >= 3 ? 'Nivel máximo' : 'Mejorar laboratorio'));
  const tree = BRANCHES.map(([bk, bl]) => {
    const list = TECHS.filter((t) => t.branch === bk);
    if (!list.length) return null;
    return h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, bl),
      h('div', { class: 'list' }, list.map((t) => {
        const isDone = done.includes(t.id);
        const reqs = [].concat(t.req || []);
        const missing = reqs.filter((r) => !done.includes(r));
        const labMiss = (t.lab || 0) > lab;
        const locked = !isDone && (missing.length || labMiss);
        const researching = T.cur === t.id;
        return h('div', { class: 'item stack' + (locked ? ' locked' : '') },
          h('div', { class: 'row' }, h('b', { class: 'grow' }, t.name),
            isDone ? h('span', { class: 'pill ally' }, icon('check'), ' Hecho') : researching ? h('span', { class: 'pill me' }, 'En curso') : h('span', { class: 'muted small' }, t.cost + ' pts')),
          h('div', { class: 'muted small' }, t.desc),
          locked ? h('div', { class: 'small down' }, 'Requiere: ' + [...missing.map(nm), ...(labMiss ? ['Laboratorio ' + t.lab] : [])].join(', ')) : null,
          !isDone && !locked && !researching ? h('button', { class: 'btn sm', onclick: () => act({ action: 'research', tech: t.id }) }, 'Investigar') : null);
      })));
  });
  return h('div', { class: 'stack' }, head, labp, tree);
}

function suministro() {
  const e = ext();
  if (!e) return noExt();
  const me = player();
  const c = getState().game.countries[me];
  const stock = SUPPLY.stock_of(getState().game, me);
  const supply = (e.supply && e.supply[me]) || { prod: {}, cons: {}, net: {}, short: {} };

  if (!supply.prod || Object.keys(supply.prod).length === 0) {
    return h('div', { class: 'panel' }, h('div', { class: 'muted' }, 'Se calculará al finalizar el turno.'));
  }

  const resCards = Object.entries(SUPPLY.RESOURCES).map(([res, info]) => {
    const stk = stock[res] || 0;
    const prod = (supply.prod && supply.prod[res]) || 0;
    const cons = (supply.cons && supply.cons[res]) || 0;
    const net = (supply.net && supply.net[res]) || 0;
    const short = (supply.short && supply.short[res]) || 0;
    const turns = cons > 0 ? stk / cons : 999;

    return h('div', { class: 'panel stack res-card' },
      h('div', { class: 'row' }, icon(info.icon), h('b', { class: 'grow' }, info.name)),
      h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Existencias'), h('b', null, fmtDec(stk, 1))),
      h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Producción/turno'), h('span', { class: 'up' }, '+' + fmtDec(prod, 1))),
      h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Consumo/turno'), h('span', { class: 'down' }, '-' + fmtDec(cons, 1))),
      h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Balance'), h('b', { class: deltaClass(net) }, fmtSigned(net, false))),
      h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Reservas'), h('span', null, turns < 999 ? fmtDec(turns, 1) + ' turnos' : '∞')),
      short > 0.01 ? h('div', { class: 'warn' },
        h('div', { class: 'small' }, icon('alert'), ` Escasez ${Math.round(short * 100)}%`),
        h('div', { class: 'bar bad' }, h('i', { style: { width: Math.min(100, short * 100) + '%' } }))) : null,
      short > 0.01 ? h('div', { class: 'muted small' }, _shortageDesc(res)) : null);
  });

  const marketPanel = h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Mercado'),
    h('div', { class: 'muted small' }, 'Compra y venta de recursos. Los precios varían según la oferta y demanda regional.'),
    Object.entries(SUPPLY.RESOURCES).map(([res, info]) => {
      const price5 = _marketPrice(res, 5);
      const price20 = _marketPrice(res, 20);
      const limit = _marketLimit();
      return h('div', { class: 'stack', style: { gap: '6px' } },
        h('div', { class: 'row' }, icon(info.icon), h('b', { class: 'grow' }, info.name),
          h('span', { class: 'muted small' }, `Límite: ${limit}`)),
        h('div', { class: 'row', style: { gap: '4px' } },
          h('button', { class: 'btn sm', onclick: () => act({ action: 'buy', res, amount: 5 }) },
            `Comprar 5 ($${fmtDec(price5 * 5, 0)}M)`),
          h('button', { class: 'btn sm', onclick: () => act({ action: 'buy', res, amount: 20 }) },
            `Comprar 20 ($${fmtDec(price20 * 20, 0)}M)`),
          h('button', { class: 'btn sm', onclick: () => act({ action: 'sell', res, amount: 10 }) },
            `Vender 10 ($${fmtDec(_marketPrice(res, 10) * 0.6 * 10, 0)}M)`)));
    }));

  const tradePanel = h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Intercambio'),
    h('div', { class: 'muted small' }, 'Intercambia recursos 1:1 con países amigos (pacto comercial o relación ≥20).'),
    h('div', { class: 'small' }, 'Función disponible próximamente.'));

  return h('div', { class: 'stack supply-view' }, h('div', { class: 'res-grid' }, ...resCards), marketPanel, tradePanel);
}

function _shortageDesc(res) {
  if (res === 'food') return 'Hambruna: pierde estabilidad y población.';
  if (res === 'fuel') return 'Tus divisiones pierden organización.';
  if (res === 'goods') return 'Descontento: pierde estabilidad.';
  if (res === 'metal') return 'La industria se deteriora.';
  return '';
}

function _marketPrice(res, amount) {
  const g = getState().game;
  const base = { food: 4, fuel: 7, goods: 6, metal: 6 }[res] || 5;
  const alive = Object.keys(g.countries).filter(c => g.countries[c].owner === c);
  let shortCount = 0;
  for (const cid of alive) {
    const sup = g.ext && g.ext.supply && g.ext.supply[cid];
    if (sup && sup.short && sup.short[res] > 0) shortCount++;
  }
  const regShort = alive.length > 0 ? shortCount / alive.length : 0;
  return r2(base * (1 + 0.5 * regShort) * (1 + amount / 40));
}

function _marketLimit() {
  const g = getState().game;
  const me = player();
  const c = g.countries[me];
  return 20 + Math.floor((c.infrastructure || 0) / 10) * 2;
}

function estabilidad(c, d) {
  const f = (d && d.stability_factors) || [];
  return h('div', { class: 'stack' },
    h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Estabilidad ' + Math.round(c.stability) + '%'),
      h('div', { class: 'bar ' + (c.stability < 30 ? 'bad' : c.stability < 50 ? 'warn' : '') }, h('i', { style: { width: clamp(c.stability, 0, 100) + '%' } }))),
    h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Factores'),
      f.length ? h('div', { class: 'list' }, f.map((x) => {
        const name = typeof x === 'string' ? x : (x.name || x.label || x.text || '');
        const val = typeof x === 'object' ? (x.value != null ? x.value : x.delta) : null;
        return h('div', { class: 'item' }, h('span', { class: 'grow' }, name), val != null ? h('b', { class: deltaClass(val) }, fmtSigned(val)) : null);
      })) : h('div', { class: 'empty' }, 'Sin factores calculados.')),
    h('div', { class: 'panel stack' }, orderBtn('Programa de estabilidad', 'heart', COSTS.stability, { type: 'stability', target: c.id })));
}

export function render(el) {
  const S = getState();
  el.replaceChildren();
  if (!S.game) return;
  const me = player();
  const c = S.game.countries[me];
  loadDetail(me);
  const d = flat(detail(me));
  if (tab !== 'presupuesto' || draftGame !== S.game.id) draft = null;
  draftGame = S.game.id;
  const tabs = h('div', { class: 'tabs', role: 'tablist' }, TABS.map(([id, l]) =>
    h('button', { class: 'tab', role: 'tab', 'aria-selected': String(tab === id), onclick: () => { tab = id; render(el); } }, l)));
  const body = { gestion, suministro, industria, infra, presupuesto, estabilidad, politica, investigacion }[tab];
  el.append(h('h2', null, 'Economía'), tabs, h('div', { class: 'stack' }, body(c, d)));
}
void setState; void toast;
