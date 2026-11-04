// Panel de acciones de la provincia seleccionada (hoja del mapa): recurso, infraestructura, obras,
// reclutamiento local, fortificaciones y ataque. Trabajador C (Tanda 1).
// API usada por mapfx.js/map.js: provPanel() devuelve el contenedor; refresh() lo vuelve a pintar.
import { h } from '../util.js';
import { getState, player, cname, extAction } from '../state.js';
import { TERRAIN } from '../data/provinces.js';
import * as P from '../engine/provinces.js';
import { iconHTML, relColor, selectedProv, markRecent, animate as FXQ, RES_COLOR, BUILD_COLOR } from './mapfx.js';
import { UNIT_TYPES } from '../engine/units.js';

let panelEl = null;
let currentTab = 'build'; // build, infra, recruit

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
  const unrest = game.ext && game.ext.unrest && game.ext.unrest[selPid];

  // Cabecera
  const head = h('div', { class: 'pp-head' },
    iconHTML(s.cap ? 'star' : 'flag', relColor(s.o), 28),
    h('div', { class: 'pp-head-info' },
      h('div', { class: 'pp-name' }, gp.n, s.cap ? h('span', { class: 'pp-tag' }, 'Capital') : null),
      h('div', { class: 'pp-sub' },
        h('i', { class: 'pp-terr', style: `background:${terr.color}` }), terr.name, ' · ', cname(s.o)),
      h('div', { class: 'pp-stats' },
        'Defensa: ', h('b', null, String(def)), ' · Guarnición: ', h('b', null, String(s.g || 0)))));

  if (unrest && unrest > 0) {
    const unrestBar = h('div', { class: 'pp-unrest' },
      h('span', { class: 'small muted' }, 'Descontento'),
      h('div', { class: 'bar warn', style: 'flex:1;height:6px;' },
        h('i', { style: `width:${unrest}%` })));
    head.append(unrestBar);
  }

  // Recurso
  const res = s.r && P.RES[s.r]
    ? h('div', { class: 'pp-res' }, iconHTML(P.RES[s.r].icon, RES_COLOR[s.r], 22), h('span', null, P.RES[s.r].name))
    : h('div', { class: 'pp-res muted' }, 'Sin recurso estratégico');

  // Cola de obra
  const queue = s.q && P.BUILD[s.q.kind]
    ? h('div', { class: 'pp-queue' }, iconHTML('crane', '#b8975a', 20), `En obra: ${P.BUILD[s.q.kind].name} · ${s.q.turns} turno${s.q.turns === 1 ? '' : 's'}`)
    : null;

  // Infraestructura: niveles y efectos
  const infraLevels = [];
  const b = s.b || {};
  for (const k of ['lab', 'carretera', 'ferrocarril', 'fuerte', 'linea']) {
    const lvl = b[k] || 0;
    if (lvl > 0) infraLevels.push(h('span', { class: 'pp-badge' }, iconHTML(P.BUILD[k].icon, BUILD_COLOR[k] || '#7a8a5a', 18), String(lvl)));
  }
  const infraEffects = [];
  const labLvl = b.lab || 0, roadLvl = b.carretera || 0, railLvl = b.ferrocarril || 0, fortLvl = b.fuerte || 0, lineLvl = b.linea || 0;
  if (labLvl > 0) infraEffects.push(`Investigación +${(labLvl * 0.12).toFixed(2)}`);
  if (roadLvl > 0 || railLvl > 0) infraEffects.push(`Movilidad +${Math.round((roadLvl * 3 + railLvl * 6))}%`);
  if (fortLvl > 0 || lineLvl > 0) infraEffects.push(`Defensa +${Math.round((fortLvl * 40 + lineLvl * 20))}%`);
  const infraSec = infraLevels.length > 0
    ? h('div', { class: 'pp-infra' },
        h('div', { class: 'pp-infra-lvl' }, ...infraLevels),
        infraEffects.length > 0 ? h('div', { class: 'pp-infra-fx small muted' }, infraEffects.join(' · ')) : null)
    : null;

  // Pestañas
  const tabs = h('div', { class: 'pp-tabs' },
    h('button', { class: currentTab === 'build' ? 'active' : '', onclick: () => { currentTab = 'build'; refresh(); } }, 'Construir'),
    h('button', { class: currentTab === 'infra' ? 'active' : '', onclick: () => { currentTab = 'infra'; refresh(); } }, 'Infraestructura'),
    h('button', { class: currentTab === 'recruit' ? 'active' : '', onclick: () => { currentTab = 'recruit'; refresh(); } }, 'Reclutar'));

  // Contenido de las pestañas
  let tabContent = null;
  if (currentTab === 'build') {
    const baseBuilds = ['base', 'fabrica', 'refineria', 'mina', 'granja'];
    const btns = [];
    for (const k of baseBuilds) {
      const B = P.BUILD[k]; const l = b[k] || 0;
      const needOk = !B.need || B.need.includes(s.r);
      const reqOk = !B.reqFn || B.reqFn(s);
      const reqOk2 = !B.req || Object.entries(B.req).every(([rk, rv]) => (b[rk] || 0) >= rv);
      const cost = P.build_cost(s, k);
      const why = !mine ? 'No es tuya' : !needOk ? 'Requiere ' + B.need.map((r) => P.RES[r].name).join('/') : !reqOk ? 'Requiere fábrica o capital' : !reqOk2 ? 'Requisitos no cumplidos' : l >= B.max ? 'Nivel máximo' : s.q ? 'Obra en curso' : '';
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
      btns.push(btn);
    }
    tabContent = h('div', { class: 'pp-builds' }, ...btns);
  } else if (currentTab === 'infra') {
    const infraBuilds = ['lab', 'carretera', 'ferrocarril', 'fuerte', 'linea'];
    const btns = [];
    for (const k of infraBuilds) {
      const B = P.BUILD[k]; const l = b[k] || 0;
      const needOk = !B.need || B.need.includes(s.r);
      const reqOk = !B.reqFn || B.reqFn(s);
      const reqOk2 = !B.req || Object.entries(B.req).every(([rk, rv]) => (b[rk] || 0) >= rv);
      const cost = P.build_cost(s, k);
      let why = !mine ? 'No es tuya' : !needOk ? 'Requiere ' + B.need.map((r) => P.RES[r].name).join('/') : l >= B.max ? 'Nivel máximo' : s.q ? 'Obra en curso' : '';
      if (!why && !reqOk) why = 'Requiere fábrica o capital';
      if (!why && !reqOk2) {
        const missing = Object.entries(B.req || {}).find(([rk, rv]) => (b[rk] || 0) < rv);
        if (missing) why = `Requiere ${P.BUILD[missing[0]].name} nv ${missing[1]}`;
      }
      const btn = h('button', { class: 'pp-b', disabled: !!why, title: why || `${B.name}: ${cost} · ${B.turns} t` },
        iconHTML(B.icon, BUILD_COLOR[k] || '#7a8a5a', 26),
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
      btns.push(btn);
    }
    tabContent = h('div', { class: 'pp-builds' }, ...btns);
  } else if (currentTab === 'recruit') {
    const canRecruit = mine && (s.cap || (b.base || 0) >= 1);
    if (!canRecruit) {
      tabContent = h('div', { class: 'pp-msg muted small' }, 'Requiere base militar o capital para reclutar.');
    } else {
      const btns = [];
      for (const [kind, U] of Object.entries(UNIT_TYPES)) {
        const hasTech = !U.tech || (game.ext && game.ext.techs && game.ext.techs[me] && game.ext.techs[me].done && game.ext.techs[me].done.includes(U.tech));
        const hasStock = !U.needs || Object.entries(U.needs).every(([r, amt]) => {
          void amt; // por ahora no validamos stock exacto, solo que exista el sistema
          return !game.ext || !game.ext.stock || !game.ext.stock[me] || true;
        });
        const why = !hasTech ? `Requiere tecnología ${U.tech}` : !hasStock ? 'Recursos insuficientes' : '';
        const btn = h('button', { class: 'pp-b', disabled: !!why, title: why || U.desc },
          iconHTML(U.icon, U.color, 26),
          h('span', { class: 'pp-bn' }, U.name),
          h('span', { class: 'pp-bl' }, `${U.troops}T ${U.tanks}B ${U.planes}A`),
          h('span', { class: 'pp-bc' }, why ? why : `${U.cost}`));
        if (!why) btn.addEventListener('click', async () => {
          btn.disabled = true;
          const pid = selPid;
          const ok = await extAction({ action: 'prov_recruit', pid, kind });
          if (ok) markRecent('r' + pid + kind);
          else btn.disabled = false;
        });
        btns.push(btn);
      }
      tabContent = h('div', { class: 'pp-builds' }, ...btns);
    }
  }

  // Botón de atacar
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

  panelEl.replaceChildren(head, res, queue || '', infraSec || '', atk || '', tabs, tabContent);
}
