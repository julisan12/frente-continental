// Pantalla de Ejercito: divisiones, ordenes militares y cola de ordenes.
import { h, fmtNum, fmtDec, fmtMoney, STANCE, MILITARY, orderLabel } from '../util.js';
import { icon } from '../icons.js';
import { statusPills } from './country.js';
import * as F from '../engine/features.js';
import { getState, player, cname, ownerOf, isAllied, neighborsOf, sendOrder, delOrder, extAction } from '../state.js';
import { UNIT_TYPES, MODS, kind_of, div_attack_mult } from '../engine/units.js';
import { division_power, is_sea_route } from '../engine/state.js';
import { attack_logistics_mult, country_defense_mult } from '../engine/provinces.js';
import { army_cap, army_used } from '../engine/dipext.js';
import * as C from '../engine/constants.js';
import { TERRAIN } from '../data/provinces.js';
import { artUnit } from './art.js';
import { openUnitSheet, dominantTerrain, RES_NAMES } from './unitsheet.js';

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
  const k = kind_of(div);
  const ut = UNIT_TYPES[k];
  const typeName = ut ? ut.name : '';
  const divIcon = h('span', { class: 'art-card unit-art', role: 'button', tabindex: '0', 'aria-label': 'Ficha de ' + div.name,
    onclick: (e) => { e.stopPropagation(); openUnitSheet(div); } }, artUnit(k, { size: 44 }));
  return h('button', { class: 'item stack', 'aria-pressed': String(on), onclick: () => { selId = on ? null : div.id; picking = null; rerender(); } },
    h('div', { class: 'row', style: { alignItems: 'center', gap: '8px' } }, divIcon, h('b', { class: 'grow' }, div.name + (typeName ? ' · ' + typeName : '')),
      queued ? h('span', { class: 'pill' }, queued + ' orden' + (queued === 1 ? '' : 'es')) : null,
      h('span', { class: 'btn small sheet-btn', role: 'button', onclick: (e) => { e.stopPropagation(); openUnitSheet(div); } }, 'Ficha')),
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

function techLabel(id) {
  const t = Array.isArray(F.TECHS) ? F.TECHS.find((x) => x.id === id) : null;
  return t ? t.name : id;
}

function unitsPanel() {
  const g = getState().game, me = player();
  if (!g || !UNIT_TYPES) return null;
  const techs = g.ext && g.ext.techs && g.ext.techs[me] && g.ext.techs[me].done ? g.ext.techs[me].done : [];
  const home = g.countries[me];
  return h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Reclutar unidades'),
    h('div', { class: 'cards' }, Object.keys(UNIT_TYPES).map((k) => {
      const u = UNIT_TYPES[k];
      const hasReq = !u.tech || techs.includes(u.tech);
      const canAfford = home && home.money >= u.cost;
      const needsText = u.needs && Object.keys(u.needs).length ? Object.entries(u.needs).map(([r, v]) => `${RES_NAMES[r] || r} ${v}`).join(', ') : '';
      return h('div', { class: 'card unit-card stack' },
        h('div', { class: 'row', style: { alignItems: 'center', gap: '8px' } },
          h('div', { class: 'art-card' }, artUnit(k, { size: 56 })),
          h('b', { class: 'grow' }, u.name)),
        h('div', { class: 'muted small' }, u.desc),
        h('div', { class: 'muted small' }, `${fmtNum(u.troops)}k tropas` + (u.tanks ? ` · ${fmtNum(u.tanks)} tanques` : '') + (u.planes ? ` · ${fmtNum(u.planes)} aviones` : '')),
        h('div', { class: 'muted small' }, `Atq ${u.atk > 1 ? '+' : ''}${Math.round((u.atk - 1) * 100)}% · Def ${u.def > 1 ? '+' : ''}${Math.round((u.def - 1) * 100)}%`),
        u.tech ? h('div', { class: 'muted small' + (hasReq ? '' : ' warn') }, hasReq ? `✓ ${techLabel(u.tech)}` : `⚠ Requiere ${techLabel(u.tech)}`) : null,
        needsText ? h('div', { class: 'muted small' }, `Recursos: ${needsText}`) : null,
        h('button', {
          class: 'btn block' + (!hasReq || !canAfford ? ' disabled' : ''),
          disabled: !hasReq || !canAfford,
          onclick: async () => { await extAction({ action: 'unit_recruit', kind: k }); rerender(); },
        }, icon('plus'), `Reclutar (${fmtMoney(u.cost)})`));
    })));
}

let estExcl = new Set(); // divisiones excluidas del cálculo

function estimator() {
  const g = getState().game, me = player();
  const mine = (g.divisions || []).filter((d) => d.owner === me);
  const ids = new Set();
  mine.forEach((d) => (neighborsOf(d.location) || []).forEach((n) => { const o = ownerOf(n); if (o && o !== me && !isAllied(o, me)) ids.add(n); }));
  const enemies = new Set();
  (g.wars || []).forEach((w) => { if (w.a === me) enemies.add(w.b); else if (w.b === me) enemies.add(w.a); });
  Object.keys(g.countries).forEach((id) => { if (enemies.has(ownerOf(id))) ids.add(id); });
  const list = [...ids].sort((a, b) => cname(a).localeCompare(cname(b), 'es'));
  const root = h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Estimador de batalla'));
  if (!list.length) { root.append(h('div', { class: 'empty' }, 'Sin territorios vecinos ni en guerra que evaluar.')); return root; }
  if (!estTarget || !list.includes(estTarget)) estTarget = list[0];
  const target = estTarget;
  const tc = g.countries[target];
  const sel = h('select', { 'aria-label': 'Territorio objetivo', onchange: (e) => { estTarget = e.target.value; rerender(); } },
    list.map((id) => { const o = h('option', { value: id }, cname(id) + (ownerOf(id) !== id ? ' (de ' + cname(ownerOf(id)) + ')' : '')); if (id === target) o.selected = true; return o; }));
  root.append(sel);

  // ---- ataque: divisiones propias adyacentes al objetivo
  const adj = mine.filter((d) => d.location !== target && (neighborsOf(d.location) || []).includes(target));
  const terr = dominantTerrain(g, target);
  const terrName = terr && TERRAIN[terr] ? TERRAIN[terr].name : null;
  const rangeA = C.ATTACK_RANGE[0] + C.ATTACK_RANGE[1] / 2;
  let atk = 0, seaAny = false, supAny = false, logiW = 0, logiP = 0;
  const kindMods = {};
  const used = adj.filter((d) => !estExcl.has(d.id));
  used.forEach((d) => {
    const k = kind_of(d);
    let p = division_power(d);
    const am = div_attack_mult(g, d, target);
    let lg = 1; try { lg = attack_logistics_mult(g, d, target); } catch (e) { lg = 1; }
    p *= am * lg;
    if (is_sea_route(d.location, target)) { p *= 1 - C.SEA_PENALTY; seaAny = true; }
    const own = ownerOf(d.location);
    if (own !== me && !isAllied(own, me)) { p *= C.SUPPLY_PENALTY; supAny = true; }
    atk += p;
    logiW += lg * division_power(d); logiP += division_power(d);
    const mt = terr && MODS[k] && MODS[k].terr ? MODS[k].terr[terr] : null;
    if (mt && mt !== 1) kindMods[k] = mt;
  });
  atk *= C.ATTACK_FACTOR * rangeA;

  // ---- defensa (estimada con la vista del jugador)
  const infra = (tc && tc.infrastructure) || 0;
  const garrison = tc ? (tc.army || 0) + (tc.tanks || 0) * C.TANK_POWER + (tc.planes || 0) * C.PLANE_POWER : 0;
  const infDef = UNIT_TYPES.inf.def * ((MODS.inf.terr && terr && MODS.inf.terr[terr]) || 1);
  const cdm = country_defense_mult(g, target);
  const home = ownerOf(target) === target ? 1 + C.HOME_DEFENSE_BONUS : 1;
  const rangeD = C.DEFENSE_RANGE[0] + C.DEFENSE_RANGE[1] / 2;
  const def = (C.MILITIA_BASE + infra * C.MILITIA_INFRA + garrison * 0.85 * (1 + C.DEFEND_BONUS * 0.5) * infDef * cdm * home)
    * C.DEFENSE_FACTOR * rangeD * (1 + infra * C.INFRA_DEF_BONUS);

  let p = null;
  try { if (typeof F.odds === 'function') p = F.odds(atk, def); } catch (e) { p = null; }
  if (p == null) p = atk + def > 0 ? atk / (atk + def) : 0.5;
  const pc = Math.round(p * 100);
  const [verdict, cls] = p >= 0.6 ? ['Favorable', 'odds-good'] : p >= 0.4 ? ['Incierta', 'odds-mid'] : ['Desfavorable', 'odds-bad'];
  const fog = tc && tc.fog;

  // ---- casillas de divisiones atacantes
  if (adj.length) {
    root.append(h('div', { class: 'muted small' }, 'Divisiones propias junto al objetivo (toca para incluir/excluir):'),
      h('div', { class: 'row est-divs' }, adj.map((d) => h('button', { class: 'btn small' + (estExcl.has(d.id) ? ' off' : ' primary'), 'aria-pressed': String(!estExcl.has(d.id)),
        onclick: () => { if (estExcl.has(d.id)) estExcl.delete(d.id); else estExcl.add(d.id); rerender(); } }, d.name))));
  } else {
    root.append(h('div', { class: 'muted small warn' }, 'Ninguna división propia es adyacente a este territorio: el ataque estimado es 0.'));
  }

  // ---- desglose de modificadores
  const mods = [];
  if (terrName) mods.push(['Terreno dominante', terrName]);
  Object.entries(kindMods).forEach(([k, m]) => mods.push([`${UNIT_TYPES[k].name} en ${terrName.toLowerCase()}`, '×' + fmtDec(m, 2), m > 1 ? 'good' : 'bad']));
  if (logiP > 0 && logiW / logiP > 1.001) mods.push(['Logística (vías y carreteras)', '×' + fmtDec(logiW / logiP, 2), 'good']);
  if (cdm > 1.001) mods.push(['Fortalezas del defensor', '×' + fmtDec(cdm, 2), 'bad']);
  if (home > 1) mods.push(['Defensa en territorio de origen', '+' + Math.round(C.HOME_DEFENSE_BONUS * 100) + ' %', 'bad']);
  if (seaAny) mods.push(['Desembarco', '−' + Math.round(C.SEA_PENALTY * 100) + ' %', 'bad']);
  if (supAny) mods.push(['Fuera de suministro', '−' + Math.round((1 - C.SUPPLY_PENALTY) * 100) + ' %', 'bad']);
  if (infDef !== 1) mods.push(['Infantería defensora en ' + (terrName || 'terreno'), '×' + fmtDec(infDef, 2), 'bad']);

  root.append(
    h('div', { class: 'grid2' },
      h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Tu ataque'), h('b', null, fmtNum(Math.round(atk)))),
      h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Defensa' + (fog ? ' est.' : '')), h('b', null, (fog ? '~' : '') + fmtNum(Math.round(def))))),
    h('div', { class: 'row' }, h('span', { class: 'odds-big ' + cls }, pc + '%'), h('b', { class: 'grow ' + cls }, verdict)),
    h('div', { class: 'bar ' + (p < 0.4 ? 'bad' : p < 0.6 ? 'warn' : '') }, h('i', { style: { width: pc + '%' } })),
    mods.length ? h('div', { class: 'est-mods' }, mods.map(([a, b, c]) => h('div', { class: 'us-row' }, h('span', { class: 'muted small' }, a), h('b', { class: c || '' }, b)))) : null,
    h('div', { class: 'muted small' }, 'Incluye tipo de unidad, terreno, logística y fortificaciones; la organización y la niebla de guerra siguen siendo estimadas.'));
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

let formSelecting = false;
let formTarget = null;
let formAction = null;

function formationsPanel() {
  const g = getState().game, me = player();
  if (!g || !g.ext || !g.ext.forms) return null;
  const forms = g.ext.forms[me] || [];
  const divs = (g.divisions || []).filter((d) => d.owner === me);
  const root = h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Formaciones'));
  if (!forms.length && !formSelecting) {
    root.append(h('div', { class: 'empty' }, 'Sin formaciones activas.'));
  }
  forms.forEach((fm) => {
    const members = divs.filter((d) => fm.divs.includes(d.id));
    const loc = members.length ? members[0].location : '?';
    root.append(h('div', { class: 'item stack' },
      h('div', { class: 'row' }, icon('people'), h('b', { class: 'grow' }, fm.name),
        h('button', { class: 'iconbtn', 'aria-label': 'Disolver', onclick: async () => { await extAction({ action: 'form_dissolve', form_id: fm.id }); rerender(); } }, icon('close'))),
      h('div', { class: 'muted small' }, `${cname(loc)} · ${members.length} división${members.length === 1 ? '' : 'es'}`),
      h('div', { class: 'muted small' }, members.map((d) => d.name).join(', ')),
      !formAction || formTarget !== fm.id ? h('div', { class: 'row', style: { gap: '4px', marginTop: '4px' } },
        h('button', { class: 'btn small', onclick: () => { formTarget = fm.id; formAction = 'move'; rerender(); } }, icon('play'), 'Mover'),
        h('button', { class: 'btn small danger', onclick: () => { formTarget = fm.id; formAction = 'attack'; rerender(); } }, icon('swords'), 'Atacar'),
        h('button', { class: 'btn small', onclick: () => { formTarget = fm.id; formAction = 'defend'; rerender(); } }, icon('shield'), 'Defender'))
        : null));
    if (formAction && formTarget === fm.id) {
      const list = formAction === 'move' || formAction === 'attack' ? (neighborsOf(loc) || []).filter((id) => {
        const o = ownerOf(id);
        if (!o) return false;
        if (formAction === 'move') return o === me || isAllied(o, me);
        return o !== me && !isAllied(o, me);
      }) : [];
      if (formAction === 'defend') {
        root.append(h('div', { class: 'muted small' }, 'Todas las divisiones adoptarán postura defensiva.'),
          h('button', { class: 'btn block', onclick: async () => { await extAction({ action: 'form_order', form_id: fm.id, otype: 'defend' }); formAction = null; formTarget = null; rerender(); } }, icon('shield'), 'Confirmar defensa'),
          h('button', { class: 'btn block', onclick: () => { formAction = null; formTarget = null; rerender(); } }, icon('close'), 'Cancelar'));
      } else if (list.length) {
        root.append(h('div', { class: 'muted small' }, formAction === 'move' ? 'Elige destino:' : 'Elige objetivo:'),
          ...list.map((id) => h('button', { class: 'btn block' + (formAction === 'attack' ? ' danger' : ''), onclick: async () => { await extAction({ action: 'form_order', form_id: fm.id, otype: formAction, target: id }); formAction = null; formTarget = null; rerender(); } }, icon(formAction === 'move' ? 'play' : 'swords'), cname(id))),
          h('button', { class: 'btn block', onclick: () => { formAction = null; formTarget = null; rerender(); } }, icon('close'), 'Cancelar'));
      } else {
        root.append(h('div', { class: 'empty' }, 'Sin destinos válidos.'),
          h('button', { class: 'btn block', onclick: () => { formAction = null; formTarget = null; rerender(); } }, icon('close'), 'Cancelar'));
      }
    }
  });
  if (!formSelecting) {
    root.append(h('button', { class: 'btn block', onclick: () => { formSelecting = true; rerender(); } }, icon('plus'), 'Crear formación'));
  } else {
    const byLoc = {};
    divs.forEach((d) => { if (!byLoc[d.location]) byLoc[d.location] = []; byLoc[d.location].push(d); });
    const locs = Object.keys(byLoc).filter((loc) => byLoc[loc].length >= 2);
    if (!locs.length) {
      root.append(h('div', { class: 'empty' }, 'Necesitas al menos 2 divisiones en el mismo territorio.'),
        h('button', { class: 'btn block', onclick: () => { formSelecting = false; rerender(); } }, icon('close'), 'Cancelar'));
    } else {
      const loc = locs[0];
      const selected = new Set();
      root.append(h('div', { class: 'muted small' }, 'Selecciona divisiones en ' + cname(loc) + ':'),
        ...byLoc[loc].map((d) => h('label', { class: 'row', style: { padding: '4px' } },
          h('input', { type: 'checkbox', onchange: (e) => { if (e.target.checked) selected.add(d.id); else selected.delete(d.id); } }), h('span', null, d.name))),
        h('button', { class: 'btn block', onclick: async () => { if (selected.size < 2) return; await extAction({ action: 'form_create', div_ids: [...selected] }); formSelecting = false; rerender(); } }, icon('check'), 'Crear'),
        h('button', { class: 'btn block', onclick: () => { formSelecting = false; rerender(); } }, icon('close'), 'Cancelar'));
    }
  }
  return root;
}

function modsPanel() {
  if (!UNIT_TYPES) return null;
  const MODS = {
    inf: { good: ['B', 'V', 'P'], bad: ['S', 'M', 'D', 'A'] },
    mot: { good: ['P', 'V', 'E', 'D'], bad: ['S', 'M', 'A'] },
    arm: { good: ['P', 'D', 'V'], bad: ['S', 'M', 'A', 'B'] },
    art: { good: ['P', 'E'], bad: ['M', 'A'] },
    mtn: { good: ['M', 'A'], bad: ['P', 'D', 'V'] },
    mar: { good: ['S', 'T'], bad: ['D', 'A'] },
    air: { good: ['P', 'V', 'D'], bad: ['M', 'S'] },
    esp: { good: ['B', 'S', 'T'], bad: [] }
  };
  const TNAMES = { S: 'Selva', M: 'Montaña', D: 'Desierto', P: 'Pampa', V: 'Sabana', B: 'Bosque', E: 'Estepa', T: 'Tropical', A: 'Altiplano' };
  const root = h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Ventajas y desventajas'));
  Object.keys(UNIT_TYPES).forEach((k) => {
    const u = UNIT_TYPES[k];
    const m = MODS[k];
    if (!m) return;
    const good = m.good.map((t) => TNAMES[t] || t).join(', ');
    const bad = m.bad.map((t) => TNAMES[t] || t).join(', ');
    root.append(h('div', { class: 'item stack' },
      h('div', { class: 'row', style: { alignItems: 'center', gap: '8px' } },
        h('div', { class: 'unit-icon', style: { backgroundColor: u.color } }, icon(u.icon)),
        h('b', null, u.name)),
      good ? h('div', { class: 'muted small' }, `✓ Favorables: ${good}`) : null,
      bad ? h('div', { class: 'muted small' }, `✗ Desfavorables: ${bad}`) : null));
  });
  return root;
}

function lootPanel() {
  const g = getState().game, me = player();
  if (!g || !g.ext || !g.ext.loot) return null;
  const entries = g.ext.loot.filter((e) => e.by === me).slice(-5).reverse();
  const root = h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Botín de guerra'));
  if (!entries.length) {
    root.append(h('div', { class: 'empty' }, 'Sin botines recientes.'));
  } else {
    entries.forEach((e) => {
      const parts = [];
      if (e.money) parts.push(fmtMoney(e.money));
      if (e.res && e.amt) parts.push(`+${fmtNum(e.amt)} ${RES_NAMES[e.res] || e.res}`);
      root.append(h('div', { class: 'item stack' },
        h('div', { class: 'row' }, icon('trophy'), h('b', { class: 'grow' }, e.text || e.name || 'Captura'), h('span', { class: 'muted small' }, `Turno ${e.turn}`)),
        parts.length ? h('div', { class: 'muted small' }, parts.join(' · ')) : null));
    });
  }
  return root;
}

let host = null;
/** Selecciona una división en la pantalla Ejército (la usa la ficha de unidad). */
export function selectDivision(id) { selId = id; picking = null; rerender(); }
function rerender() { if (host) render(host); }

function capacityBar(me) {
  let used = 0, cap = 0;
  try { used = army_used(getState().game, me); cap = army_cap(getState().game, me); } catch (e) { return null; }
  if (!cap) return null;
  const p = pct(used, cap);
  return h('div', { class: 'cap-box' },
    h('div', { class: 'row' }, h('span', { class: 'muted small grow' }, 'Capacidad'), h('b', null, `${fmtNum(used)} / ${fmtNum(cap)} k`)),
    h('div', { class: 'bar ' + (p >= 100 ? 'bad' : p >= 85 ? 'warn' : '') }, h('i', { style: { width: p + '%' } })));
}

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
    capacityBar(me),
    h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Divisiones'),
      divs.length ? h('div', { class: 'list' }, divs.map(divCard)) : h('div', { class: 'empty' }, 'No tienes divisiones. Recluta tropas en Economía.')),
    sel ? actions(sel) : null,
    queue());
  // cada panel opcional falla por separado: un error en uno no oculta los demás
  [unitsPanel, formationsPanel, modsPanel, lootPanel, estimator, techBonuses].forEach((fn) => {
    try { const n = fn(); if (n) el.append(n); } catch (e) { console.warn('army:', fn.name, e); }
  });
}
