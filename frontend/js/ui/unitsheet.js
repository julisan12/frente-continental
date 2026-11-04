// Ficha de unidad (Tanda 2, trabajador D): ilustración, estadísticas, tabla de terreno y bonos activos de una división.
import { h, fmtNum, fmtDec, fmtMoney, STANCE } from '../util.js';
import { artUnit } from './art.js';
import { openModal } from './modals.js';
import { getState, player, cname, ownerOf, isAllied } from '../state.js';
import { UNIT_TYPES, MODS, kind_of } from '../engine/units.js';
import { TERRAIN } from '../data/provinces.js';
import { prov_geo, attack_logistics_mult } from '../engine/provinces.js';
import { division_power } from '../engine/state.js';
import * as C from '../engine/constants.js';
import * as F from '../engine/features.js';
import { selectDivision } from './army.js';

export const RES_NAMES = { food: 'Alimentos', fuel: 'Combustible', goods: 'Bienes', metal: 'Metal' };

/** Terreno dominante del territorio `cid` (el más frecuente entre sus provincias); null si no se conoce. */
export function dominantTerrain(game, cid) {
  const pr = game && game.ext && game.ext.prov;
  if (!pr) return null;
  let geo = null;
  try { geo = prov_geo(); } catch (e) { return null; }
  const count = {};
  for (const [pid, p] of Object.entries(pr)) {
    if (p.c !== cid) continue;
    const gp = geo.byId[pid];
    if (gp && gp.t) count[gp.t] = (count[gp.t] || 0) + 1;
  }
  let best = null, max = 0;
  for (const [t, n] of Object.entries(count)) if (n > max) { max = n; best = t; }
  return best;
}

function techName(id) {
  const t = Array.isArray(F.TECHS) ? F.TECHS.find((x) => x.id === id) : null;
  return t ? t.name : id;
}

const mulTxt = (m) => '×' + fmtDec(m, 2);
const mulCls = (m) => (m > 1.001 ? 'good' : m < 0.999 ? 'bad' : '');

function row(label, value, cls) {
  return h('div', { class: 'us-row' }, h('span', { class: 'muted' }, label), h('b', { class: cls || '' }, value));
}

function terrainTable(game, kind, here) {
  const terr = (MODS[kind] && MODS[kind].terr) || {};
  const rows = Object.keys(TERRAIN).map((t) => {
    const m = terr[t];
    const txt = m == null ? '—' : mulTxt(m);
    const cls = m == null ? 'neutral' : m > 1 ? 'good' : m < 1 ? 'bad' : 'neutral';
    return h('div', { class: 'us-terr ' + cls + (t === here ? ' here' : '') },
      h('i', { class: 'us-sw', style: { background: TERRAIN[t].color } }), h('span', { class: 'grow' }, TERRAIN[t].name + (t === here ? ' (aquí)' : '')), h('b', null, txt));
  });
  return h('div', { class: 'us-terrs' }, rows);
}

function bonuses(game, div, kind) {
  const out = [];
  const me = player();
  const forms = (game.ext && game.ext.forms && game.ext.forms[div.owner]) || [];
  const fm = forms.find((f) => f.divs.includes(div.id));
  if (fm && fm.divs.length >= 2) {
    const kinds = new Set();
    fm.divs.forEach((id) => { const d = (game.divisions || []).find((x) => x.id === id); if (d && d.location === div.location) kinds.add(kind_of(d)); });
    out.push(kinds.size >= 2 ? ['Armas combinadas (' + fm.name + ')', '×1,10 en ataque y defensa', 'good'] : ['Formación ' + fm.name, 'sin bono: faltan tipos distintos en el mismo territorio', '']);
  }
  let lg = 1;
  try { lg = attack_logistics_mult(game, div, div.location); } catch (e) { lg = 1; }
  if (lg > 1.001) out.push(['Logística (carreteras y ferrocarril)', mulTxt(lg) + ' en ataque', 'good']);
  const own = ownerOf(div.location);
  if (own !== div.owner && !isAllied(own, div.owner) && own !== me) out.push(['Fuera de suministro', '×' + fmtDec(C.SUPPLY_PENALTY, 2) + ' en ataque', 'bad']);
  if (!out.length) out.push(['Sin bonos activos', '', '']);
  return out;
}

export function openUnitSheet(div) {
  const g = getState().game;
  if (!g || !div) return null;
  const kind = kind_of(div);
  const ut = UNIT_TYPES[kind] || UNIT_TYPES.inf;
  const here = dominantTerrain(g, div.location);
  const upkeep = (div.troops || 0) * C.UPKEEP_TROOP + (div.tanks || 0) * C.UPKEEP_TANK + (div.planes || 0) * C.UPKEEP_PLANE;
  const fuel = (div.tanks || 0) * 0.10 + (div.planes || 0) * 0.20;
  const needs = ut.needs && Object.keys(ut.needs).length ? Object.entries(ut.needs).map(([r, v]) => `${RES_NAMES[r] || r} ${v}`).join(', ') : 'Ninguna';
  const org = Math.max(0, Math.min(100, div.org == null ? 100 : div.org));
  const bon = bonuses(g, div, kind);
  let m;
  const close = () => m.close();
  m = openModal([
    h('div', { class: 'us-head' },
      h('div', { class: 'art-card us-art' }, artUnit(kind, { size: 96, title: ut.name })),
      h('div', { class: 'stack grow' },
        h('h2', { style: { textAlign: 'left', margin: 0 } }, div.name),
        h('div', { class: 'muted' }, ut.name),
        h('div', { class: 'muted small' }, `${cname(div.location)} · ${STANCE[div.stance] || div.stance || '—'}`))),
    h('div', { class: 'muted small' }, ut.desc),
    h('div', { class: 'us-sec' }, 'Estadísticas'),
    row('Tropas', fmtNum(div.troops) + 'k'),
    row('Tanques', fmtNum(div.tanks || 0)),
    row('Aviones', fmtNum(div.planes || 0)),
    h('div', { class: 'us-row' }, h('span', { class: 'muted' }, 'Organización'), h('b', null, Math.round(org) + '%')),
    h('div', { class: 'bar ' + (org < 30 ? 'bad' : org < 55 ? 'warn' : '') }, h('i', { style: { width: org + '%' } })),
    row('Poder', fmtDec(division_power({ troops: div.troops || 0, tanks: div.tanks || 0, planes: div.planes || 0, org })) ),
    row('Ataque del tipo', mulTxt(ut.atk), mulCls(ut.atk)),
    row('Defensa del tipo', mulTxt(ut.def), mulCls(ut.def)),
    row('Mantenimiento por turno', fmtMoney(upkeep)),
    row('Combustible aprox.', fmtDec(fuel, 2) + ' por turno'),
    row('Tecnología requerida', ut.req || ut.tech ? techName(ut.req || ut.tech) : 'Ninguna'),
    row('Necesidades', needs),
    h('div', { class: 'us-sec' }, 'Terreno'),
    h('div', { class: 'muted small' }, (MODS[kind] && MODS[kind].desc) || ''),
    terrainTable(g, kind, here),
    h('div', { class: 'us-sec' }, 'Bonos activos'),
    ...bon.map(([a, b, cls]) => h('div', { class: 'us-row' }, h('span', null, a), h('b', { class: cls }, b))),
    h('div', { class: 'acts' },
      h('button', { class: 'btn primary', onclick: () => { close(); selectDivision(div.id); } }, 'Órdenes'),
      h('button', { class: 'btn', onclick: close }, 'Cerrar')),
  ], { label: 'Ficha de ' + div.name });
  return m;
}
