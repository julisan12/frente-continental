// Panel de acciones de la provincia seleccionada (hoja del mapa): recurso, infraestructura, obras,
// reclutamiento local, fortificaciones y ataque. Trabajador C (Tanda 1).
// API usada por mapfx.js/map.js: provPanel() devuelve el contenedor; refresh() lo vuelve a pintar.
import { h, fmtMoney, fmtDec } from '../util.js';
import { getState, player, cname, extAction } from '../state.js';
import { TERRAIN } from '../data/provinces.js';
import * as P from '../engine/provinces.js';
import { iconHTML, relColor, selectedProv, markRecent, animate as FXQ, RES_COLOR, BUILD_COLOR } from './mapfx.js';
import { UNIT_TYPES, conquest_preview, RES_LABEL } from '../engine/units.js';
import { army_used, army_cap } from '../engine/dipext.js';
import * as ART from './art.js';
import * as FX from './mapfx.js';
import { TECHS } from '../engine/features.js';

const techName = (id) => { const t = (TECHS || []).find((x) => x.id === id); return t ? t.name : id; };


let selKind = null; // edificio seleccionado en Construir/Infraestructura (muestra la tarjeta de detalle)
let lastPid = null;

const INFRA_FX = {
  base: 'Habilita reclutar aquí, guarnición y −1,5 descontento por nivel',
  lab: 'Investigación +0,12 por nivel',
  carretera: 'Movilidad +3 % por nivel',
  ferrocarril: 'Movilidad +6 % por nivel',
  fuerte: 'Defensa +40 % por nivel',
  linea: 'Defensa +20 % por nivel',
};
const YKEYS = [['food', 'alimentos'], ['fuel', 'combustible'], ['goods', 'bienes'], ['metal', 'metal']];

/** Texto de un rendimiento {money, food, fuel, goods, metal}; vacío si no produce nada. */
function yieldText(y) {
  const parts = [];
  if (y.money > 0) parts.push(`+${fmtMoney(y.money)}`);
  for (const [k, n] of YKEYS) if (y[k] > 0) parts.push(`+${fmtDec(y[k])} ${n}`);
  return parts.join(' · ');
}

/** Rendimiento de la provincia si el edificio `kind` subiera un nivel (aplica y restaura el nivel). */
function yieldAfter(game, pid, p, kind) {
  const before = p.b[kind] || 0;
  p.b[kind] = before + 1;
  try { return P.prov_yield(game, pid); } finally { p.b[kind] = before; }
}

function resIcon(r) { return FX.RES_ICON ? FX.RES_ICON[r] : P.RES[r].icon; }

/** Etiqueta "+delta" entre rendimientos (solo lo que cambia). */
function yieldDelta(a, b) {
  const d = { money: Math.round((b.money - a.money) * 10) / 10 };
  for (const [k] of YKEYS) d[k] = Math.round((b[k] - a[k]) * 10) / 10;
  return yieldText(d);
}

/** Tarjeta de detalle de un edificio: ilustración nivel actual → siguiente, efectos, coste y botón Construir. */
function detailCard(game, pid, p, k, why, onBuild) {
  const B = P.BUILD[k]; const l = (p.b || {})[k] || 0;
  const cost = P.build_cost(p, k);
  const desc = ART.BUILDING_LEVEL_DESC && ART.BUILDING_LEVEL_DESC[k] && ART.BUILDING_LEVEL_DESC[k][l + 1];
  let fx = INFRA_FX[k] || '';
  if (!fx) { const dl = yieldDelta(P.prov_yield(game, pid), yieldAfter(game, pid, p, k)); fx = dl ? 'Producción: ' + dl : ''; }
  const go = h('button', { class: 'pp-go', disabled: !!why, title: why || '' }, why || 'Construir');
  if (!why) go.addEventListener('click', () => { go.disabled = true; onBuild(go); });
  return h('div', { class: 'pp-detail' },
    h('div', { class: 'pp-dt-title' }, B.name),
    h('div', { class: 'pp-dt-art' },
      h('figure', null, ART.artBuilding(k, l, { size: 80, title: `${B.name} nivel ${l}` }), h('figcaption', null, `Nivel ${l}`)),
      h('span', { class: 'pp-dt-arrow' }, '→'),
      h('figure', null, ART.artBuilding(k, Math.min(B.max, l + 1), { size: 80, title: `${B.name} nivel ${l + 1}` }), h('figcaption', null, `Nivel ${l + 1}`))),
    h('div', { class: 'pp-dt-desc small' }, desc || B.name),
    fx ? h('div', { class: 'pp-dt-fx small' }, fx) : null,
    h('div', { class: 'pp-dt-cost small muted' }, `Coste ${fmtMoney(cost)} · ${B.turns} turno${B.turns === 1 ? '' : 's'}`),
    go);
}

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
  if (lastPid !== selPid) { lastPid = selPid; selKind = null; }
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

  // Recurso y producción
  const yld = P.prov_yield(game, selPid);
  const prodTxt = yieldText(yld);
  const res = s.r && P.RES[s.r]
    ? h('div', { class: 'pp-res' }, ART.artResource(s.r, { size: 40, title: P.RES[s.r].name }),
        h('div', { class: 'pp-res-info' }, h('span', null, P.RES[s.r].name),
          h('small', { class: 'pp-prod' }, prodTxt ? 'Produce: ' + prodTxt : 'Sin producción')))
    : h('div', { class: 'pp-res muted' }, 'Sin recurso estratégico' + (prodTxt ? ' · Produce: ' + prodTxt : ''));

  // Cola de obra
  const queue = s.q && P.BUILD[s.q.kind]
    ? h('div', { class: 'pp-queue' }, iconHTML('crane', '#b8975a', 20), `En obra: ${P.BUILD[s.q.kind].name} · ${s.q.turns} turno${s.q.turns === 1 ? '' : 's'}`)
    : null;

  // Infraestructura: niveles y efectos
  const infraLevels = [];
  const b = s.b || {};
  for (const k of ['lab', 'labc', 'avenida', 'ferrocarril', 'fuerte', 'linea', 'aeropuerto', 'puerto', 'hospital', 'radar']) {
    const lvl = b[k] || 0;
    if (lvl > 0) infraLevels.push(h('span', { class: 'pp-badge' }, iconHTML(P.BUILD[k].icon, BUILD_COLOR[k] || '#7a8a5a', 18), String(lvl)));
  }
  const infraEffects = [];
  const labLvl = b.lab || 0, roadLvl = b.avenida || 0, railLvl = b.ferrocarril || 0, fortLvl = b.fuerte || 0, lineLvl = b.linea || 0;
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
  const buildTab = (kinds) => {
    const btns = []; let detail = null;
    for (const k of kinds) {
      const B = P.BUILD[k]; const l = b[k] || 0;
      const needOk = !B.need || B.need.includes(s.r);
      const reqOk = !B.reqFn || B.reqFn(s);
      const cost = P.build_cost(s, k);
      let why = !mine ? 'No es tuya' : !needOk ? 'Requiere ' + B.need.map((r) => P.RES[r].name).join('/') : l >= B.max ? 'Nivel máximo' : s.q ? 'Obra en curso' : '';
      if (!why && !reqOk) why = 'Requiere taller o capital';
      if (!why && B.req) {
        const missing = Object.entries(B.req).find(([rk, rv]) => (b[rk] || 0) < rv);
        if (missing) why = `Requiere ${P.BUILD[missing[0]].name} nv ${missing[1]}`;
      }
      const sel = selKind === k && !why;
      const btn = h('button', { class: 'pp-b' + (sel ? ' sel' : ''), disabled: !!why, title: why || `${B.name}: ${fmtMoney(cost)} · ${B.turns} t` },
        ART.artBuilding(k, l, { size: 56, title: B.name }),
        h('span', { class: 'pp-bn' }, B.name),
        h('span', { class: 'pp-bl' }, `${l}/${B.max}`),
        h('span', { class: 'pp-bc' }, why ? why : `${fmtMoney(cost)} · ${B.turns}t`));
      if (!why) btn.addEventListener('click', () => { selKind = selKind === k ? null : k; refresh(); });
      if (sel) {
        detail = detailCard(game, selPid, s, k, '', async (go) => {
          const pid = selPid;
          const ok = await extAction({ action: 'prov_build', pid, kind: k });
          if (ok) { selKind = null; markRecent('b' + pid + k); FXQ.build(pid, k, false); }
          else go.disabled = false;
        });
      }
      btns.push(btn);
    }
    return h('div', { class: 'pp-tabbody' }, detail || '', h('div', { class: 'pp-builds' }, ...btns));
  };
  let tabContent = null;
  if (currentTab === 'build') {
    tabContent = buildTab(Object.keys(P.BUILD).filter((k) => P.BUILD[k].group === 'eco' || k === 'base'));
  } else if (currentTab === 'infra') {
    tabContent = buildTab(Object.keys(P.BUILD).filter((k) => P.BUILD[k].group !== 'eco' && k !== 'base'));
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
        const why = !hasTech ? `Requiere ${techName(U.tech)}` : !hasStock ? 'Recursos insuficientes' : '';
        const btn = h('button', { class: 'pp-b pp-r', 'data-kind': kind, disabled: !!why, title: why || U.desc },
          ART.artUnit(kind, { size: 48, title: U.name }),
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
      let capTxt = '';
      try { capTxt = `Ejército ${fmtDec(army_used(game, me))} / ${fmtDec(army_cap(game, me))} k`; } catch (e) { /* opcional */ }
      tabContent = h('div', { class: 'pp-tabbody' }, capTxt ? h('div', { class: 'pp-cap small muted' }, capTxt) : '', h('div', { class: 'pp-builds' }, ...btns));
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

  // Botín estimado (bajo el botón de atacar)
  let atkBox = atk;
  if (atk) {
    let pv = null; try { pv = conquest_preview(game, selPid, me); } catch (e) { /* opcional */ }
    const sup = game.ext.supply && game.ext.supply[me];
    const lootBox = h('div', { class: 'pp-loot' });
    if (pv) {
      lootBox.append(h('div', { class: 'pp-loot-row' }, ART.artAction ? ART.artAction('loot', { size: 28, title: 'Botín' }) : '',
        h('span', null, `Botín estimado: +${fmtMoney(pv.money)}`,
          pv.res ? h('span', { class: 'pp-loot-res' }, ' · ', iconHTML(resIcon(s.r) || 'crate', RES_COLOR[s.r] || '#b8975a', 16), ` +${pv.amt} ${RES_LABEL[pv.res]}`) : '')));
      const fut = yieldText(pv.yield);
      if (fut) lootBox.append(h('div', { class: 'pp-loot-fut small muted' }, 'Luego producirá para ti: ' + fut));
      if (pv.res && sup && sup.short && sup.short[pv.res] > 0.05)
        lootBox.append(h('div', { class: 'pp-loot-warn small' }, `¡Alivia tu escasez de ${RES_LABEL[pv.res]}!`));
    }
    atkBox = h('div', { class: 'pp-atkwrap' }, atk, lootBox);
  }

  // Historial de botín (últimas 3 entradas del jugador)
  const mineLoot = ((game.ext && game.ext.loot) || []).filter((e) => e.by === me).slice(-3).reverse();
  const hist = mineLoot.length
    ? h('details', { class: 'pp-hist' }, h('summary', null, 'Botín reciente'),
        ...mineLoot.map((e) => h('div', { class: 'pp-hist-row small' }, h('b', null, `T${e.turn}`), ' ', e.text)))
    : null;

  panelEl.replaceChildren(head, res, queue || '', infraSec || '', atkBox || '', tabs, tabContent, hist || '');
}
