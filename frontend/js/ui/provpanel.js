// Panel de acciones de la provincia seleccionada (hoja del mapa): recurso, infraestructura, obras,
// reclutamiento local, fortificaciones y ataque. Lo rellena el trabajador C (Tanda 1).
// API usada por mapfx.js/map.js: provPanel() devuelve el contenedor; refresh() lo vuelve a pintar.
import { h } from '../util.js';
import { getState, player, cname, extAction } from '../state.js';
import { TERRAIN } from '../data/provinces.js';
import * as P from '../engine/provinces.js';
import { iconHTML, relColor, selectedProv, markRecent, animate as FXQ, RES_COLOR, BUILD_COLOR } from './mapfx.js';

let panelEl = null;

export function provPanel() {
  if (!panelEl) panelEl = h('div', { class: 'prov-panel' });
  refresh();
  return panelEl;
}

export function refresh() {
  if (!panelEl) return;
  const S = getState(), game = S.game;
  const pr = game && game.ext && game.ext.prov;
  const selPid = selectedProv();
  const gp = selPid && P.prov_geo().byId[selPid];
  const s = pr && selPid && pr[selPid];
  if (!gp || !s || (S.selected && gp.c !== S.selected)) { panelEl.replaceChildren(); panelEl.hidden = true; return; }
  panelEl.hidden = false;
  const me = player(), mine = s.o === me;
  const terr = TERRAIN[gp.t] || { name: gp.t, color: '#777' };
  let def = 0, pow = 0;
  try { def = P.prov_defense(game, selPid); pow = P.prov_attack_power(game, me); } catch (e) { /* */ }
  const canAtk = !mine && (P.prov_targets(game, me) || []).includes(selPid);

  const head = h('div', { class: 'pp-head' },
    iconHTML(s.cap ? 'star' : 'flag', relColor(s.o), 28),
    h('div', null,
      h('div', { class: 'pp-name' }, gp.n, s.cap ? h('span', { class: 'pp-tag' }, 'Capital') : null),
      h('div', { class: 'pp-sub' },
        h('i', { class: 'pp-terr', style: `background:${terr.color}` }), terr.name, ' · ', cname(s.o), ' · Defensa ', String(def))));

  const res = s.r && P.RES[s.r]
    ? h('div', { class: 'pp-res' }, iconHTML(P.RES[s.r].icon, RES_COLOR[s.r], 22), h('span', null, P.RES[s.r].name))
    : h('div', { class: 'pp-res muted' }, 'Sin recurso estratégico');

  const queue = s.q && P.BUILD[s.q.kind]
    ? h('div', { class: 'pp-queue' }, iconHTML('crane', '#b8975a', 20), `En obra: ${P.BUILD[s.q.kind].name} · ${s.q.turns} turno${s.q.turns === 1 ? '' : 's'}`)
    : null;

  const builds = h('div', { class: 'pp-builds' });
  for (const [k, B] of Object.entries(P.BUILD)) {
    const l = (s.b && s.b[k]) || 0;
    const needOk = !B.need || B.need.includes(s.r);
    const cost = P.build_cost(s, k);
    const why = !mine ? 'No es tuya' : !needOk ? 'Requiere ' + B.need.map((r) => P.RES[r].name).join('/') : l >= B.max ? 'Nivel máximo' : s.q ? 'Obra en curso' : '';
    const btn = h('button', { class: 'pp-b', disabled: !!why, title: why || `${B.name}: ${cost} · ${B.turns} t` },
      iconHTML(B.icon, BUILD_COLOR[k] || '#777', 26),
      h('span', { class: 'pp-bn' }, B.name),
      h('span', { class: 'pp-bl' }, `${l}/${B.max}`),
      h('span', { class: 'pp-bc' }, why ? why : `${cost} · ${B.turns}t`));
    if (!why) btn.addEventListener('click', async () => {
      btn.disabled = true;
      const pid = selPid;
      const ok = await extAction({ action: 'prov_build', pid, kind: k });
      if (ok) { markRecent('b' + pid + k); FXQ.build(pid, k, false); }
      else btn.disabled = false;
    });
    builds.append(btn);
  }

  let atk = null;
  if (canAtk) {
    const ratio = def > 0 ? pow / def : 9;
    const cls = ratio >= 1.2 ? 'odds-good' : ratio >= 0.8 ? 'odds-mid' : 'odds-bad';
    atk = h('button', { class: 'pp-atk' },
      iconHTML('artillery', '#9a4a42', 26),
      h('span', null, 'Atacar provincia', h('small', null, ` −${P.ATTACK_COST}`)),
      h('span', { class: 'pp-odds ' + cls }, `${pow} vs ${def}`));
    atk.addEventListener('click', async () => {
      atk.disabled = true;
      const pid = selPid;
      FXQ.barrage(pid, me);
      const ok = await extAction({ action: 'prov_attack', pid });
      const st = getState().game.ext.prov[pid];
      if (ok) { markRecent('a' + pid); FXQ.attack(pid, st && st.o === me, me, true); }
      else atk.disabled = false;
    });
  }
  panelEl.replaceChildren(head, res, queue || '', atk || '', h('div', { class: 'pp-h' }, 'Construir'), builds);
}
