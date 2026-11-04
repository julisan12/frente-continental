// Ficha de unidad (Tanda 2, trabajador D): ilustración, estadísticas, tabla de terreno y bonos activos de una división.
import { h, fmtNum, fmtDec, fmtMoney, STANCE } from '../util.js';
import { artUnit } from './art.js';
import { openModal } from './modals.js';
import { getState, player, cname, ownerOf, isAllied } from '../state.js';
import { UNIT_TYPES, kind_of, unit_stats, ensure_div } from '../engine/units.js';
import { CLASS_NAME, SOIL_NAME, SOIL_MODS, TERRAIN_GROUP, soil_mods } from '../engine/roster.js';
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

const TAG_NAME = { tank: 'tanques', heavy: 'pesados', static: 'estáticas', ground: 'terrestres', ranged: 'artillería a distancia', mech: 'mecanizadas',
  bld: 'edificios', flying: 'aéreas', naval: 'navales', airbase: 'portaaviones', inf: 'infantería', arm: 'blindados', art: 'artillería', air: 'aviación',
  drone: 'drones', nav: 'marina', heli: 'helicópteros' };
/** Nombre en español de una clave de emparejamiento (tipo, etiqueta o clase). */
export function matchName(key) {
  if (UNIT_TYPES[key]) return UNIT_TYPES[key].name;
  return TAG_NAME[key] || CLASS_NAME[key] || key;
}

function matchTable(title, table, goodWhenHigh) {
  const ents = Object.entries(table || {});
  if (!ents.length) return null;
  return h('div', { class: 'us-match' },
    h('div', { class: 'muted small' }, title),
    ents.map(([k, v]) => h('div', { class: 'us-row' }, h('span', null, matchName(k)),
      h('b', { class: (goodWhenHigh ? v > 1 : v < 1) ? 'good' : 'bad' }, mulTxt(v)))));
}

function soilTable(kind, here) {
  const hereG = here ? TERRAIN_GROUP[here] : null;
  const head = h('div', { class: 'us-soilrow us-soilhead muted small' }, h('span', null, 'Suelo'), h('b', null, 'Atq'), h('b', null, 'Def'), h('b', null, 'Daño'), h('b', null, 'Mov'));
  const cell = (m) => h('b', { class: m > 1.001 ? 'good' : m < 0.999 ? 'bad' : '' }, m === 1 ? '—' : mulTxt(m));
  const rows = Object.keys(SOIL_MODS).map((g) => {
    const m = soil_mods(kind, Object.keys(TERRAIN_GROUP).find((t) => TERRAIN_GROUP[t] === g));
    return h('div', { class: 'us-soilrow' + (g === hereG ? ' here' : '') },
      h('span', null, SOIL_NAME[g] + (g === hereG ? ' (aquí)' : '')), cell(m.atk), cell(m.def),
      h('b', { class: m.dmg > 1.001 ? 'bad' : m.dmg < 0.999 ? 'good' : '' }, m.dmg === 1 ? '—' : mulTxt(m.dmg)),
      h('b', { class: m.move > 0 ? 'good' : '' }, m.move ? '+' + m.move : '—'));
  });
  return h('div', { class: 'us-soil' }, head, rows);
}

const STATE_TXT = { lista: 'Lista', carga: 'En carga (no ataca ni defiende)', marcha: 'En marcha (no ataca ni defiende)' };
function stateText(st) {
  if (st.state === 'recarga') return `En recarga${st.rl ? ` · ${st.rl} turno${st.rl === 1 ? '' : 's'}` : ''}`;
  return STATE_TXT[st.state] || st.state;
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
  ensure_div(g, div);
  const kind = kind_of(div);
  const ut = UNIT_TYPES[kind] || UNIT_TYPES.inf;
  const st = unit_stats(g, div) || {};
  const here = dominantTerrain(g, div.location);
  const needs = ut.needs && Object.keys(ut.needs).length ? Object.entries(ut.needs).map(([r, v]) => `${RES_NAMES[r] || r} ${v}`).join(', ') : 'Ninguna';
  const org = Math.max(0, Math.min(100, div.org == null ? 100 : div.org));
  const vida = Math.round((st.vida == null ? 1 : st.vida) * 100);
  const done = (g.ext && g.ext.techs && g.ext.techs[div.owner] && g.ext.techs[div.owner].done) || [];
  const bon = bonuses(g, div, kind);
  if (st.state !== 'lista') bon.unshift(['Estado: ' + stateText(st), st.state === 'carga' ? 'recibe ×2 de daño' : 'no puede atacar ni defender', 'bad']);
  let baseName = null;
  if (div.base) { try { baseName = prov_geo().byId[div.base].n; } catch (e) { baseName = div.base; } }
  let m;
  const close = () => m.close();
  m = openModal([
    h('div', { class: 'us-head' },
      h('div', { class: 'art-card us-art' }, artUnit(kind, { size: 96, title: ut.name })),
      h('div', { class: 'stack grow' },
        h('h2', { style: { textAlign: 'left', margin: 0 } }, div.name),
        h('div', { class: 'muted' }, `${ut.name} · ${CLASS_NAME[ut.cls] || ut.cls}`),
        h('div', { class: 'muted small' }, `${cname(div.location)} · ${STANCE[div.stance] || div.stance || '—'}`))),
    h('div', { class: 'muted small' }, ut.desc),
    h('div', { class: 'us-sec' }, 'Estadísticas'),
    h('div', { class: 'us-row' }, h('span', { class: 'muted' }, 'Vida'), h('b', { class: vida < 40 ? 'bad' : '' }, `${fmtDec(st.hpNow)} / ${fmtDec(st.hp)} (${vida} %)`)),
    h('div', { class: 'bar ' + (vida < 30 ? 'bad' : vida < 60 ? 'warn' : '') }, h('i', { style: { width: vida + '%' } })),
    row('Ataque', fmtDec(st.atk), st.up ? 'good' : ''),
    row('Defensa', fmtDec(st.def), st.up ? 'good' : ''),
    row('Velocidad', String(st.spd) + (st.spd === 0 ? ' (estática)' : '')),
    row('Coste', fmtMoney(st.cost)),
    row('Mantenimiento por turno', fmtMoney(st.upkeep)),
    row('Estado', stateText(st), st.state === 'lista' ? 'good' : 'bad'),
    baseName ? row('Base', baseName) : null,
    row('Efectivos', `${fmtNum(div.troops)}k tropas` + (div.tanks ? ` · ${fmtNum(div.tanks)} tanques` : '') + (div.planes ? ` · ${fmtNum(div.planes)} aviones` : '')),
    h('div', { class: 'us-row' }, h('span', { class: 'muted' }, 'Organización'), h('b', null, Math.round(org) + '%')),
    h('div', { class: 'bar ' + (org < 30 ? 'bad' : org < 55 ? 'warn' : '') }, h('i', { style: { width: org + '%' } })),
    row('Poder', fmtDec(division_power({ troops: div.troops || 0, tanks: div.tanks || 0, planes: div.planes || 0, org }))),
    row('Tecnología requerida', ut.tech ? techName(ut.tech) : 'Ninguna'),
    row('Necesidades', needs),
    h('div', { class: 'us-sec' }, 'Emparejamientos'),
    matchTable('Ventajas (ataque contra)', ut.vs, true) || h('div', { class: 'muted small' }, 'Sin ventajas especiales.'),
    matchTable('Debilidades (daño recibido de)', ut.dmg, false) || h('div', { class: 'muted small' }, 'Sin debilidades especiales.'),
    h('div', { class: 'us-sec' }, 'Suelo'),
    soilTable(kind, here),
    h('div', { class: 'us-sec' }, `Mejoras investigadas (${st.up || 0}/${(ut.up || []).length})`),
    (ut.up || []).length
      ? (ut.up).map((id) => h('div', { class: 'us-row' }, h('span', { class: done.includes(id) ? '' : 'muted' }, techName(id)), h('b', { class: done.includes(id) ? 'good' : 'muted' }, done.includes(id) ? '+10 %' : 'pendiente')))
      : h('div', { class: 'muted small' }, 'Esta unidad no tiene mejoras propias.'),
    h('div', { class: 'us-sec' }, 'Bonos activos'),
    ...bon.map(([a, b, cls]) => h('div', { class: 'us-row' }, h('span', null, a), h('b', { class: cls }, b))),
    h('div', { class: 'acts' },
      h('button', { class: 'btn primary', onclick: () => { close(); selectDivision(div.id); } }, 'Órdenes'),
      h('button', { class: 'btn', onclick: close }, 'Cerrar')),
  ], { label: 'Ficha de ' + div.name });
  return m;
}
