// Panel de acciones de la provincia seleccionada (hoja del mapa): suelo y modificadores, pestañas
// Economía / Militar / Infraestructura / Reclutar, tarjeta de detalle de cada edificio y de cada unidad,
// cola de producción de la provincia, ataque, botín y descontento.
// API usada por mapfx.js/map.js: provPanel() devuelve el contenedor; refresh() lo vuelve a pintar.
import { h, fmtMoney, fmtDec } from '../util.js';
import { getState, player, cname, extAction } from '../state.js';
import { TERRAIN } from '../data/provinces.js';
import * as P from '../engine/provinces.js';
import { iconHTML, relColor, selectedProv, markRecent, animate as FXQ, RES_COLOR, BUILD_COLOR } from './mapfx.js';
import { ROSTER, CLASS_NAME, TERRAIN_GROUP, SOIL_NAME, conquest_preview, RES_LABEL, recruit_check, prod_queue } from '../engine/units.js';
import { army_used, army_cap } from '../engine/dipext.js';
import * as ART from './art.js';
import * as FX from './mapfx.js';
import { TECHS } from '../engine/features.js';
import { strikeButtons } from './strike.js';
import { confirmModal } from './modals.js';

const techName = (id) => { const t = (TECHS || []).find((x) => x.id === id); return t ? t.name : id; };

let selKind = null; // edificio seleccionado (muestra la tarjeta de detalle)
let selUnit = null; // unidad seleccionada en Reclutar
let lastPid = null;
let currentTab = 'eco'; // eco | mil | infra | recruit
let lastScrollKey = ''; // para llevar la tarjeta de detalle a la vista solo al cambiar la selección

/** Modificadores del suelo, en texto, por grupo (ver SOIL_MODS de roster.js). */
const SOIL_TEXT = {
  bosque: 'Infantería ×1,2 · Mecanizados y blindados ×0,8',
  montana: 'Artillería a distancia ×1,25 · Blindados ×0,7 · Infantería ×0,85',
  llano: 'Blindados ×1,25 · +1 velocidad · Infantería recibe ×1,25 · Artillería def ×0,8',
};

/** Efecto legible de cada edificio (por nivel); `next` = nivel que se construiría. */
function effectText(k, next) {
  switch (k) {
    case 'granja': return '+1,2 alimentos, +2 de dinero y +0,15 de estabilidad por nivel.';
    case 'mina': return '+2 de metal y +4 de dinero por nivel.';
    case 'refineria': return '+2,5 de combustible y +6 de dinero por nivel.';
    case 'taller': return next >= 4
      ? 'Fábrica: +10 % de dinero y de recursos de la provincia por nivel de fábrica, +1 de bienes y +4 de dinero. Exige la técnica «Fábricas».'
      : 'Taller: +0,5 bienes y +2 de dinero por nivel. Acelera la producción y es requisito de blindados, mecanizados, aviación y drones.';
    case 'base': return 'Permite reclutar aquí. +35 % de defensa y −1,5 de descontento por nivel; +0,6 tropas por turno.';
    case 'fuerte': return '+10 % de defensa por nivel; el defensor pierde un 5 % menos de guarnición por nivel. Permite cañones de fortaleza.';
    case 'linea': return '+20 % de defensa por nivel.';
    case 'aeropuerto': return 'Sostiene 2 aeronaves por nivel (aviones, drones y helicópteros).';
    case 'puerto': return 'Permite barcos, submarinos y portaaviones (con taller); 2 barcos por nivel. Los cañones navales lo exigen.';
    case 'hospital': return 'Cada turno cura un 10 % por nivel a tus divisiones terrestres en este país, a cambio de 0,5 bienes por división curada.';
    case 'radar': return 'Detecta aviones y misiles enemigos. Solo en provincias interiores: ninguna vecina de otro país.';
    case 'capital': return '−2 de descontento por turno en su provincia (con «Orgullo patrio», −1 en todo el país). Única: construir otra destruye la anterior (−4 de estabilidad).';
    case 'avenida': return '+5 de organización por turno a tus divisiones en el país (no a las de otros). Requisito del ferrocarril.';
    case 'ferrocarril': return '+1,5 de dinero. Movimiento muy rápido entre provincias con ferrocarril; las unidades «en carga» no atacan ni defienden.';
    case 'lab': return 'Investigación +0,12 por nivel. Exige taller o capital.';
    case 'labc': return 'Cuenta ×2 para la investigación. Su nivel desbloquea las tecnologías avanzadas (ojivas, bombarderos pesados, silos, tanques pesados, élite, fábricas y ferrocarriles).';
    default: return '';
  }
}

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

/** Tarjeta de detalle de un edificio: ilustración nivel actual → siguiente, efectos, coste, motivo de bloqueo y botón. */
function detailCard(game, pid, p, k, why, onBuild) {
  const B = P.BUILD[k]; const l = (p.b || {})[k] || 0; const nx = Math.min(B.max, l + 1);
  const cost = P.build_cost(p, k);
  const dl = yieldDelta(P.prov_yield(game, pid), yieldAfter(game, pid, p, k));
  const go = h('button', { class: 'pp-go', disabled: !!why, title: why || '' }, why || (k === 'taller' && l >= 3 ? 'Evolucionar a fábrica' : 'Construir'));
  if (!why) go.addEventListener('click', () => { go.disabled = true; onBuild(go); });
  return h('div', { class: 'pp-detail' },
    h('div', { class: 'pp-dt-title' }, P.build_name(k, nx)),
    h('div', { class: 'pp-dt-art' },
      h('figure', null, ART.artBuilding(k, l, { size: 80, title: `${B.name} nivel ${l}` }), h('figcaption', null, l ? P.build_name(k, l) : 'Solar')),
      h('span', { class: 'pp-dt-arrow' }, '→'),
      h('figure', null, ART.artBuilding(k, nx, { size: 80, title: `${B.name} nivel ${nx}` }), h('figcaption', null, P.build_name(k, nx)))),
    h('div', { class: 'pp-dt-desc small' }, effectText(k, nx) || B.desc || B.name),
    dl ? h('div', { class: 'pp-dt-fx small' }, 'Producción: ' + dl) : null,
    h('div', { class: 'pp-dt-cost small muted' }, `Coste ${fmtMoney(cost)} · ${B.turns} turno${B.turns === 1 ? '' : 's'} · nivel ${nx}/${B.max}`),
    why ? h('div', { class: 'pp-why small' }, why) : null,
    go);
}

/** Tarjeta de detalle de una unidad del roster. */
function unitDetail(kind, why, onRecruit) {
  const U = ROSTER[kind];
  const needs = Object.entries(U.needs || {}).map(([r, n]) => `${n} ${RES_LABEL[r] || r}`).join(', ');
  const reqs = Object.entries(U.req || {}).map(([b, n]) => `${P.BUILD[b] ? P.BUILD[b].name : b} nv ${n}`).join(', ');
  const go = h('button', { class: 'pp-go', disabled: !!why, title: why || '' }, why || 'Reclutar');
  if (!why) go.addEventListener('click', () => { go.disabled = true; onRecruit(go); });
  return h('div', { class: 'pp-detail' },
    h('div', { class: 'pp-dt-title' }, U.name),
    h('div', { class: 'pp-dt-art' }, ART.artUnit(kind, { size: 80, title: U.name })),
    h('div', { class: 'pp-dt-desc small' }, U.desc),
    h('div', { class: 'pp-dt-fx small' }, `Vida ${U.hp} · Ataque ${U.atk} · Defensa ${U.def} · Velocidad ${U.spd}`),
    h('div', { class: 'pp-dt-cost small muted' }, `Coste ${fmtMoney(U.cost)} · mant. ${U.upkeep} · ${U.turns} turno${U.turns === 1 ? '' : 's'}` + (needs ? ` · Consume ${needs}` : '') + (reqs ? ` · Requiere ${reqs}` : '')),
    why ? h('div', { class: 'pp-why small' }, why) : null,
    go);
}

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
  if (lastPid !== selPid) { lastPid = selPid; selKind = null; selUnit = null; }
  const me = player(), mine = s.o === me;
  const terr = TERRAIN[gp.t] || { name: gp.t, color: '#777' };
  const soil = TERRAIN_GROUP[gp.t];
  let def = 0, pow = 0;
  try { def = P.prov_defense(game, selPid); pow = P.prov_attack_power(game, me); } catch (e) { /* */ }
  const canAtk = !mine && (P.prov_targets(game, me) || []).includes(selPid);
  const unrest = game.ext && game.ext.unrest && game.ext.unrest[selPid];

  // Cabecera: nombre, suelo (grupo + terreno original), dueño, defensa y modificadores por clase
  const head = h('div', { class: 'pp-head' },
    iconHTML(s.cap ? 'star' : 'flag', relColor(s.o), 28),
    h('div', { class: 'pp-head-info' },
      h('div', { class: 'pp-name' }, gp.n, s.cap ? h('span', { class: 'pp-tag' }, 'Capital') : null),
      h('div', { class: 'pp-sub' },
        h('i', { class: 'pp-terr', style: `background:${terr.color}` }),
        h('b', null, SOIL_NAME[soil] || terr.name), ' (' + terr.name + ') · ', cname(s.o)),
      soil ? h('div', { class: 'pp-soil small' }, SOIL_TEXT[soil]) : null,
      h('div', { class: 'pp-stats' },
        'Defensa: ', h('b', null, String(def)), ' · Guarnición: ', h('b', null, String(s.g || 0)))));

  if (unrest && unrest > 0) {
    head.append(h('div', { class: 'pp-unrest' },
      h('span', { class: 'small muted' }, 'Descontento'),
      h('div', { class: 'bar warn', style: 'flex:1;height:6px;' }, h('i', { style: `width:${unrest}%` }))));
  }

  // Recurso y producción
  const yld = P.prov_yield(game, selPid);
  const prodTxt = yieldText(yld);
  const res = s.r && P.RES[s.r]
    ? h('div', { class: 'pp-res' }, iconHTML(resIcon(s.r) || 'crate', RES_COLOR[s.r] || '#b8975a', 34),
        h('div', { class: 'pp-res-info' }, h('span', { style: 'color:' + (RES_COLOR[s.r] || 'inherit') }, (FX.RES_NAME && FX.RES_NAME[s.r]) || P.RES[s.r].name),
          h('small', { class: 'pp-prod' }, prodTxt ? 'Produce: ' + prodTxt : 'Sin producción')))
    : h('div', { class: 'pp-res muted' }, 'Sin recurso estratégico' + (prodTxt ? ' · Produce: ' + prodTxt : ''));

  // Cola de obra
  const queue = s.q && P.BUILD[s.q.kind]
    ? h('div', { class: 'pp-queue' }, iconHTML('crane', '#b8975a', 20), `En obra: ${P.build_name(s.q.kind, ((s.b || {})[s.q.kind] || 0) + 1)} · ${s.q.turns} turno${s.q.turns === 1 ? '' : 's'}`)
    : null;

  // Edificios existentes (insignias con nivel)
  const b = s.b || {};
  const badges = [];
  for (const k of P.BUILD_KEYS) {
    const lvl = b[k] || 0;
    if (lvl > 0 && k !== 'taller') badges.push(h('span', { class: 'pp-badge', title: P.build_name(k, lvl) }, iconHTML(P.BUILD[k].icon, BUILD_COLOR[k] || '#7a8a5a', 18), String(lvl)));
  }
  const infraSec = badges.length
    ? h('div', { class: 'pp-infra' }, h('div', { class: 'pp-infra-lvl' }, ...badges))
    : null;

  // Pestañas
  const TABS = [['eco', 'Economía'], ['mil', 'Militar'], ['infra', 'Infraestr.'], ['recruit', 'Reclutar']];
  const tabs = h('div', { class: 'pp-tabs', role: 'tablist' },
    ...TABS.map(([id, label]) => h('button', { class: currentTab === id ? 'active' : '', role: 'tab', 'aria-selected': currentTab === id ? 'true' : 'false', 'data-tab': id,
      onclick: () => { currentTab = id; refresh(); } }, label)));

  // Tarjetas de edificios de un grupo
  const buildTab = (kinds) => {
    const btns = []; let detail = null;
    for (const k of kinds) {
      const B = P.BUILD[k]; const l = b[k] || 0;
      const cost = P.build_cost(s, k);
      const why = !mine ? 'No es tuya' : P.build_check(game, me, selPid, k) || '';
      const sel = selKind === k;
      const nm = l >= B.max ? P.build_name(k, l) : P.build_name(k, l + 1);
      const btn = h('button', { class: 'pp-b' + (sel ? ' sel' : '') + (why ? ' blocked' : ''), 'data-kind': k, title: why || `${nm}: ${fmtMoney(cost)} · ${B.turns} t` },
        ART.artBuilding(k, l, { size: 56, title: B.name }),
        h('span', { class: 'pp-bn' }, nm),
        h('span', { class: 'pp-bl' }, `${l}/${B.max}`),
        h('span', { class: 'pp-bc' }, why ? why : `${fmtMoney(cost)} · ${B.turns}t`));
      btn.addEventListener('click', () => { selKind = selKind === k ? null : k; refresh(); });
      if (sel) {
        detail = detailCard(game, selPid, s, k, why, async (go) => {
          const pid = selPid;
          const repl = P.capital_replaces(game, me, pid, k);
          if (repl && !(await confirmModal({ title: 'Trasladar la capital', text: `Construir una capital nueva destruirá la actual en ${repl} (−4 de estabilidad y descontento si está ocupada). ¿Continuar?`, okText: 'Trasladar', danger: true }))) { go.disabled = false; return; }
          const ok = await extAction({ action: 'prov_build', pid, kind: k });
          if (ok) { selKind = null; markRecent('b' + pid + k); FXQ.build(pid, k, false); } else go.disabled = false;
          refresh();
        });
      }
      btns.push(btn);
    }
    return h('div', { class: 'pp-tabbody' }, detail || '', h('div', { class: 'pp-builds' }, ...btns));
  };

  // Pestaña Reclutar
  const recruitTab = () => {
    const canRecruit = mine && (s.cap || (b.base || 0) >= 1 || (b.capital || 0) >= 1);
    if (!canRecruit) return h('div', { class: 'pp-msg muted small' }, mine ? 'Requiere base militar o capital en esta provincia para reclutar.' : 'Solo puedes reclutar en tus provincias.');
    const done = (game.ext && game.ext.techs && game.ext.techs[me] && game.ext.techs[me].done) || [];
    const whyOf = (kind) => {
      const U = ROSTER[kind];
      if (U.tech && !done.includes(U.tech)) return `Requiere ${techName(U.tech)}`;
      let r = null; try { r = recruit_check(game, me, kind, selPid); } catch (e) { r = null; }
      return r || '';
    };
    let capTxt = '';
    try { capTxt = `Ejército ${fmtDec(army_used(game, me))} / ${fmtDec(army_cap(game, me))} k`; } catch (e) { /* opcional */ }
    // cola de producción de esta provincia
    let q = []; try { q = (prod_queue(game, me) || []).filter((x) => x.pid === selPid); } catch (e) { q = []; }
    const qBox = q.length ? h('div', { class: 'pp-prodq' }, h('div', { class: 'small muted' }, 'En producción aquí'),
      ...q.map((x) => h('div', { class: 'pp-prodq-row small' }, ART.artUnit(x.kind, { size: 28, title: (ROSTER[x.kind] || {}).name }),
        h('span', { class: 'grow' }, (ROSTER[x.kind] || { name: x.kind }).name), h('b', null, `${x.left} turno${x.left === 1 ? '' : 's'}`)))) : null;
    let detail = null;
    if (selUnit && ROSTER[selUnit]) {
      detail = unitDetail(selUnit, whyOf(selUnit), async (go) => {
        const pid = selPid, kind = selUnit;
        const ok = await extAction({ action: 'prov_recruit', pid, kind });
        if (ok) markRecent('r' + pid + kind); else go.disabled = false;
        refresh();
      });
    }
    const groups = Object.entries(CLASS_NAME).map(([cls, label]) => {
      const kinds = Object.keys(ROSTER).filter((k) => ROSTER[k].cls === cls);
      if (!kinds.length) return null;
      return h('div', { class: 'pp-cls' }, h('div', { class: 'pp-cls-t' }, label),
        h('div', { class: 'pp-builds' }, ...kinds.map((kind) => {
          const U = ROSTER[kind]; const why = whyOf(kind);
          const btn = h('button', { class: 'pp-b pp-r' + (selUnit === kind ? ' sel' : '') + (why ? ' blocked' : ''), 'data-kind': kind, title: why || U.desc },
            ART.artUnit(kind, { size: 48, title: U.name }),
            h('span', { class: 'pp-bn' }, U.name, h('small', { class: 'pp-ustats' }, `❤${U.hp} ⚔${U.atk} 🛡${U.def} ➜${U.spd}`)),
            h('span', { class: 'pp-bc' }, why ? why : fmtMoney(U.cost)));
          btn.addEventListener('click', () => { selUnit = selUnit === kind ? null : kind; refresh(); });
          return btn;
        })));
    });
    return h('div', { class: 'pp-tabbody' }, capTxt ? h('div', { class: 'pp-cap small muted' }, capTxt) : '', qBox || '', detail || '', ...groups);
  };

  let tabContent;
  if (currentTab === 'recruit') tabContent = recruitTab();
  else tabContent = buildTab(P.BUILD_KEYS.filter((k) => P.BUILD[k].group === currentTab));

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

  // Botín estimado e incursiones (bajo el botón de atacar)
  let atkBox = atk;
  let strikes = null;
  if (!mine) { try { strikes = strikeButtons(selPid); } catch (e) { strikes = null; } }
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
    atkBox = h('div', { class: 'pp-atkwrap' }, atk, strikes || '', lootBox);
  } else if (strikes) {
    atkBox = h('div', { class: 'pp-atkwrap' }, strikes);
  }

  // Historial de botín (últimas 3 entradas del jugador)
  const mineLoot = ((game.ext && game.ext.loot) || []).filter((e) => e.by === me).slice(-3).reverse();
  const hist = mineLoot.length
    ? h('details', { class: 'pp-hist' }, h('summary', null, 'Botín reciente'),
        ...mineLoot.map((e) => h('div', { class: 'pp-hist-row small' }, h('b', null, `T${e.turn}`), ' ', e.text)))
    : null;

  panelEl.replaceChildren(head, res, queue || '', infraSec || '', atkBox || '', tabs, tabContent, hist || '');
  // Con la hoja a media altura la ilustración quedaba fuera de pantalla: al elegir edificio/unidad se lleva la tarjeta a la vista.
  const key = selPid + '|' + currentTab + '|' + (currentTab === 'recruit' ? selUnit : selKind);
  const sel = currentTab === 'recruit' ? selUnit : selKind;
  if (sel && key !== lastScrollKey) {
    const dc = panelEl.querySelector('.pp-detail');
    if (dc) requestAnimationFrame(() => { try { dc.scrollIntoView({ block: 'start', behavior: 'auto' }); } catch (e) { /* */ } });
  }
  lastScrollKey = sel ? key : '';
}
