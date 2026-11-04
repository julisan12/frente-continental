// Tanda 3, trabajador C: interfaz de incursiones aéreas, bombardeos de artillería/misiles, drones y bases.
// API usada por otros módulos (mantener firmas):
//   strikeButtons(pid)  -> elemento con los botones «Bombardear/Incursión» disponibles contra la provincia pid, o null
//   airPanel()          -> panel de la pantalla Ejército con aeronaves, bases, radio y estado de recarga, o null
import { h } from '../util.js';
import { getState, player, extAction, cname } from '../state.js';
import { prov_geo } from '../engine/provinces.js';
import { ROSTER } from '../engine/roster.js';
import * as AERO from '../engine/aero.js';
import { artUnit } from './art.js';

const pname = (pid) => { const g = prov_geo().byId[pid]; return g ? g.n : pid; };
const game = () => getState().game;
const mineDivs = () => (game().divisions || []).filter((d) => d.owner === player());

function unitIcon(kind) {
  try { return artUnit(kind, { size: 28 }); } catch (e) { return h('span', {}, ''); }
}

function stateLabel(d) {
  if (d.st === 'recarga') return `recarga ${d.rl || 1} t`;
  if (d.st === 'carga') return 'en carga';
  if (d.st === 'marcha') return 'en marcha';
  return null;
}

function verbFor(kind, d) {
  if (kind === 'art') return `Bombardear con ${d.name}`;
  if (kind === 'misil') return `Misiles: ${d.name}`;
  if (kind === 'dkam') return 'Lanzar dron kamikaze';
  if (kind === 'bestr') return `Bombardeo estratégico: ${d.name}`;
  return `Incursión: ${d.name}`;
}

/** Botones de ataque a distancia disponibles contra la provincia pid. */
export function strikeButtons(pid) {
  const g = game(); const pr = g && g.ext && g.ext.prov;
  if (!pr || !pr[pid]) return null;
  const me = player();
  if (pr[pid].o === me) return null;
  const btns = [];
  for (const d of mineDivs()) {
    const kind = AERO.kind_of(d); const sp = ROSTER[kind];
    if (!sp || !sp.range || sp.static || kind === 'dexp' || kind === 'dsen') continue;
    let targets; try { targets = AERO.strike_targets(g, d); } catch (e) { continue; }
    if (!targets.includes(pid)) continue;
    const st = stateLabel(d);
    const est = AERO.strike_estimate(g, d, pid);
    const b = h('button', { class: 'btn strike-btn' + (st ? ' strike-wait' : ''), 'data-div': d.id, disabled: !!st, title: sp.desc },
      unitIcon(kind),
      h('span', { class: 'strike-txt' }, h('b', {}, verbFor(kind, d)), h('small', {}, st ? `${st} · daño ~${est}` : `daño ~${est}${sp.single ? ' · un solo uso' : ''}`)));
    if (!st) b.addEventListener('click', async () => { b.disabled = true; const okk = await extAction({ action: 'strike', div: d.id, pid }); if (!okk) b.disabled = false; });
    btns.push(b);
  }
  // drones señuelo sobre provincias propias no se muestran aquí (ver airPanel)
  if (!btns.length) return null;
  return h('div', { class: 'strike-box' }, h('div', { class: 'strike-h' }, 'Ataque a distancia'), btns);
}

function countryPicker(onPick) {
  const g = game();
  const ids = [...new Set(Object.values(g.countries).filter((c) => c.owner !== player()).map((c) => c.id))];
  const sel = h('select', { class: 'strike-sel' }, ids.map((id) => h('option', { value: id }, cname(id))));
  return h('div', { class: 'strike-row' }, sel, h('button', { class: 'btn', onclick: () => onPick(sel.value) }, 'Reconocer'));
}

function unitRow(d) {
  const g = game(); const kind = AERO.kind_of(d); const sp = ROSTER[kind];
  const st = stateLabel(d);
  const nav = AERO.is_naval(d);
  const baseTxt = d.base ? pname(d.base) : 'sin base';
  const range = (sp.range || 0) + (kind === 'misil' && g.ext.techs && g.ext.techs[player()] && g.ext.techs[player()].done.includes('silo') ? 1 : 0);
  const row = h('div', { class: 'strike-unit' + (st ? ' strike-wait' : '') + (!d.base ? ' strike-warn' : '') },
    unitIcon(kind),
    h('div', { class: 'strike-info' }, h('b', {}, d.name),
      h('small', {}, `${nav ? 'Puerto' : 'Base'}: ${baseTxt}${sp.range ? ` · radio ${range}` : ''} · ${st || 'lista'}`)));
  const acts = h('div', { class: 'strike-acts' });
  const cands = AERO.rebase_candidates(g, d);
  if (cands.length) {
    const b = h('button', { class: 'btn', 'data-act': 'rebase' }, 'Cambiar base');
    b.addEventListener('click', () => {
      const sel = h('select', { class: 'strike-sel' }, cands.map((pid) => h('option', { value: pid }, `${pname(pid)} (${cname(g.ext.prov[pid].c)})`)));
      const go = h('button', { class: 'btn primary' }, 'Trasladar');
      go.addEventListener('click', () => extAction({ action: 'rebase', div: d.id, pid: sel.value }));
      acts.replaceChildren(sel, go);
    });
    acts.append(b);
  }
  if (kind === 'dexp') {
    const b = h('button', { class: 'btn', 'data-act': 'recon' }, 'Reconocimiento');
    b.addEventListener('click', () => acts.replaceChildren(countryPicker((cid) => extAction({ action: 'drone', div: d.id, cid }))));
    acts.append(b);
  }
  if (kind === 'dsen') {
    const own = Object.keys(g.ext.prov).filter((pid) => g.ext.prov[pid].o === player() && AERO.range_ok(g, d, g.ext.prov[pid].c));
    if (own.length) {
      const b = h('button', { class: 'btn', 'data-act': 'decoy' }, 'Desplegar señuelo');
      b.addEventListener('click', () => {
        const sel = h('select', { class: 'strike-sel' }, own.map((pid) => h('option', { value: pid }, pname(pid))));
        acts.replaceChildren(sel, h('button', { class: 'btn primary', onclick: () => extAction({ action: 'drone', div: d.id, pid: sel.value }) }, 'Proteger'));
      });
      acts.append(b);
    }
  }
  if (acts.children.length) row.append(acts);
  return row;
}

/** Panel de la pantalla Ejército: aeronaves y barcos con base, radio y recarga. */
export function airPanel() {
  const g = game(); if (!g || !g.ext) return null;
  const list = mineDivs().filter((d) => AERO.has_base(d));
  if (!list.length) return null;
  const used = {};
  list.forEach((d) => { if (d.base) used[d.base] = (used[d.base] || 0) + 1; });
  const bases = Object.keys(used).map((pid) => {
    const nav = list.some((d) => d.base === pid && AERO.is_naval(d));
    return `${pname(pid)}: ${used[pid]}/${AERO.base_capacity(g, player(), pid, nav ? 'puerto' : 'aeropuerto')}`;
  });
  return h('div', { class: 'strike-panel' },
    h('div', { class: 'strike-h' }, 'Aviación y marina'),
    bases.length ? h('div', { class: 'strike-caps' }, 'Plazas: ' + bases.join(' · ')) : null,
    list.map(unitRow));
}
