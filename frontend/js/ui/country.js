// Ficha de pais reutilizable (hoja del mapa y pantalla "Pais").
import { h, fmtNum, fmtMoney, ALIGN, clamp } from '../util.js';
import { icon } from '../icons.js';
import * as F from '../engine/features.js';
import { getState, setState, cname, ownerOf, player, relation, isAllied, isAtWar, loadDetail, detail } from '../state.js';

export function statusPills(cid) {
  const me = player();
  const owner = ownerOf(cid);
  const out = [];
  if (owner === me) out.push(h('span', { class: 'pill me' }, 'Tuyo'));
  else if (isAtWar(owner, me)) out.push(h('span', { class: 'pill war' }, 'En guerra'));
  else if (isAllied(owner, me)) out.push(h('span', { class: 'pill ally' }, 'Aliado'));
  if (owner !== cid) out.push(h('span', { class: 'pill' }, 'Ocupado por ' + cname(owner)));
  return out;
}

export function relBar(v) {
  const pct = clamp((v + 100) / 2, 0, 100);
  const cls = v < -30 ? 'bad' : v < 10 ? 'warn' : '';
  return h('div', { class: 'bar ' + cls, role: 'img', 'aria-label': 'Relación ' + v }, h('i', { style: { width: pct + '%' } }));
}

export function countryPanel(cid) {
  const S = getState();
  const g = S.game;
  const m = S.mapById[cid];
  const c = g.countries[cid];
  if (!m || !c) return h('div', { class: 'empty' }, 'Selecciona un país en el mapa.');
  loadDetail(cid);
  const d = detail(cid);
  const owner = ownerOf(cid);
  const me = player();
  const kv = (k, v, wide) => h('div', { class: 'kv', style: wide ? { gridColumn: '1 / -1' } : null }, h('span', { class: 'muted' }, k), h('b', null, v));
  const root = h('div', { class: 'stack' });
  root.append(
    h('div', { class: 'row' }, h('h2', { class: 'grow' }, m.name), statusPills(cid)),
    h('div', { class: 'sub' }, (ALIGN[c.alignment] || c.alignment) + ' · Poder ' + (m.power != null ? m.power : '-')),
    h('div', { class: 'grid2' },
      kv('Población', fmtNum(c.population) + ' M'),
      kv('Industria', fmtNum(c.industry)),
      kv('Ejército', (c.fog ? '~' : '') + fmtNum(c.army) + 'k'),
      kv('Tanques', (c.fog ? '~' : '') + fmtNum(c.tanks)),
      kv('Aviones', (c.fog ? '~' : '') + fmtNum(c.planes)),
      kv('Tesoro', c.money == null ? 'Desconocido' : fmtMoney(c.money)),
    ),
    h('div', { class: 'muted small' }, 'Estabilidad ' + Math.round(c.stability) + '%'),
    h('div', { class: 'bar ' + (c.stability < 30 ? 'bad' : c.stability < 50 ? 'warn' : '') }, h('i', { style: { width: clamp(c.stability, 0, 100) + '%' } })),
  );
  const allies = (g.treaties || []).filter((t) => t.type === 'alliance' && (t.a === owner || t.b === owner)).map((t) => cname(t.a === owner ? t.b : t.a));
  const foes = (g.wars || []).filter((w) => w.a === owner || w.b === owner).map((w) => cname(w.a === owner ? w.b : w.a));
  root.append(h('div', { class: 'small' }, h('span', { class: 'muted' }, 'Aliados: '), allies.length ? allies.join(', ') : 'ninguno'));
  if (foes.length) root.append(h('div', { class: 'small' }, h('span', { class: 'muted' }, 'En guerra con: '), foes.join(', ')));
  if ((c.resources || []).length) root.append(h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '4px' } }, c.resources.map((r) => h('span', { class: 'pill' }, r))));
  if (owner !== me || cid !== me) {
    const rv = d && d.relation != null ? d.relation : relation(me, owner);
    if (owner !== me) {
      root.append(h('div', { class: 'muted small' }, 'Relación con ' + cname(owner) + ': ' + rv), relBar(rv));
    }
  }
  if (d && cid !== me) {
    root.append(h('div', { class: 'grid2' },
      d.threat != null ? kv('Amenaza', Math.round(d.threat) + '/100') : null,
      d.army_estimate != null ? kv('Ejército est.', armyEst(d.army_estimate), true) : null));
  }
  try { extPanels(root, cid, g, me); } catch (e) { /* extensiones opcionales */ }
  return root;
}

function extPanels(root, cid, g, me) {
  const ext = g.ext;
  let pi = null;
  try { if (typeof F.power_index === 'function') pi = F.power_index(g, cid); } catch (e) { pi = null; }
  if (pi && pi.total != null) {
    const parts = [['eco', 'Economía'], ['mil', 'Militar'], ['terr', 'Territorio'], ['tech', 'Tecnología'], ['infl', 'Influencia']].filter(([k]) => pi[k] != null);
    const mx = Math.max(1, ...parts.map(([k]) => Number(pi[k]) || 0));
    root.append(h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Índice de poder'),
      h('div', { class: 'row' }, h('b', { class: 'grow' }, 'Total'), h('b', null, fmtNum(Math.round(pi.total)))),
      parts.map(([k, lbl]) => h('div', { class: 'stack', style: { gap: '2px' } },
        h('div', { class: 'row small' }, h('span', { class: 'muted grow' }, lbl), h('b', null, fmtNum(Math.round(pi[k])))),
        h('div', { class: 'bar' }, h('i', { style: { width: clamp((Number(pi[k]) / mx) * 100, 0, 100) + '%' } }))))));
  }
  if (ext) {
    const done = (ext.techs && ext.techs[cid] && ext.techs[cid].done) || [];
    const labs = ext.labs && ext.labs[cid];
    if (ext.techs || ext.labs) {
      root.append(h('div', { class: 'small' }, h('span', { class: 'muted' }, 'Ciencia: '), done.length + ' tecnologías · laboratorio nivel ' + (labs || 0)));
    }
    if (cid !== me && ext.intel && ext.intel[me] && ext.intel[me][cid] >= g.turn) {
      root.append(h('div', { class: 'row' }, h('span', { class: 'pill ally' }, 'Inteligencia activa')));
    }
  }
}

// army_estimate = {troops, tanks, planes} (antes era un numero: se toleran ambos)
export function armyEst(e) {
  if (e == null) return '?';
  if (typeof e === 'number') return '~' + fmtNum(e) + 'k';
  return '~' + fmtNum(e.troops) + 'k · ' + fmtNum(e.tanks) + ' tanq. · ' + fmtNum(e.planes) + ' av.';
}

export function countryButtons(cid) {
  const me = player();
  const owner = ownerOf(cid);
  const b = [];
  if (owner !== me) {
    b.push(h('button', { class: 'btn sm', onclick: () => setState({ diploTarget: owner, screen: 'diplomacy' }) }, icon('rings'), 'Diplomacia'));
  }
  if (getState().screen !== 'country') b.push(h('button', { class: 'btn sm', onclick: () => setState({ selected: cid, screen: 'country' }) }, icon('flag'), 'Ver ficha'));
  return b;
}
