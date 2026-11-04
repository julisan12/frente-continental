// Punto de entrada: arranque, enrutado de pantallas y renderizado.
import { h } from './util.js';
import { emblem } from './icons.js';
import * as api from './api.js';
import { getState, setState, subscribe, setHeaderRefresher, setGame, player } from './state.js';
import { renderHeader, renderNav, renderFooter } from './ui/chrome.js';
import * as mapScreen from './ui/map.js';
import * as economy from './ui/economy.js';
import * as army from './ui/army.js';
import * as diplomacy from './ui/diplomacy.js';
import * as more from './ui/more.js';
import { countryPanel, countryButtons } from './ui/country.js';
import { menuModal, newGameFlow } from './ui/modals.js';
import { variant_of } from './data/provinces.js';
import { settingsForm, offlineButton } from './ui/settings.js';
import { showTutorial } from './ui/tutorial.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['map', 'country', 'economy', 'army', 'diplomacy', 'more'];
const secs = {};
let navEl = null;
let endEl = null;
let mapMounted = false;

function renderCountry(el) {
  const S = getState();
  el.replaceChildren();
  if (!S.game) return;
  const cid = S.selected || player();
  el.append(h('div', { class: 'stack' }, countryPanel(cid), h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } }, countryButtons(cid))));
}

const RENDER = { country: renderCountry, economy: economy.render, army: army.render, diplomacy: diplomacy.render, more: more.render };

function build() {
  const main = $('main');
  main.replaceChildren();
  SCREENS.forEach((id) => {
    secs[id] = h('section', { class: 'screen' + (id === 'map' ? ' map-screen' : ''), 'data-screen': id, hidden: true });
    main.append(secs[id]);
  });
  navEl = h('nav', { class: 'nav', 'aria-label': 'Navegación principal' });
  endEl = h('div');
  $('ftr').replaceChildren(navEl, endEl);
}

function paint() {
  const S = getState();
  if (!S.game || !S.map) return;
  if (!secs.map) build();
  renderHeader($('hdr'));
  renderNav(navEl);
  renderFooter(endEl);
  SCREENS.forEach((id) => { secs[id].hidden = id !== S.screen; });
  if (!mapMounted) { mapScreen.mount(secs.map); mapMounted = true; }
  mapScreen.update();
  if (S.screen === 'map') mapScreen.show();
  else {
    const sec = secs[S.screen];
    const top = sec.scrollTop;
    RENDER[S.screen](sec);
    sec.scrollTop = top;
  }
}

function splash(msg, extra) {
  $('main').replaceChildren(h('div', { class: 'splash stack' },
    emblem(),
    h('h1', null, 'Frente Continental'),
    h('p', { class: 'muted' }, msg), extra || null));
  secs.map = null;
  mapMounted = false;
}

async function loadMap(variant) {
  const m = await api.getMap(variant);
  if (!m) return false;
  m.variant = m.variant || variant || 'latam';
  const byId = {};
  m.countries.forEach((c) => { byId[c.id] = c; });
  setState({ map: m, mapById: byId });
  return true;
}

function failScreen() {
  const local = api.isLocal();
  splash(local ? 'No se pudo iniciar el motor local (faltan los datos del mapa).' : 'No se pudo conectar con el servidor.', h('div', { class: 'stack' },
    local ? null : offlineButton(() => boot()),
    settingsForm((ok) => { if (ok) boot(); }),
    h('button', { class: 'btn block', onclick: () => boot() }, 'Reintentar')));
}

async function boot() {
  splash('Cargando mapa...');
  let ok = false;
  try { ok = await loadMap(); } catch (e) { ok = false; }
  if (!ok) { failScreen(); return; }
  build();
  const id = api.savedGameId();
  let g = null;
  let started = false;
  if (id) { try { g = await api.getGame(id, { quiet: true }); } catch (e) { g = null; } }
  if (g) {
    const v = variant_of(g);
    if (v !== 'latam') { try { await loadMap(v); } catch (e) { /* se queda el mapa base */ } }
    setGame(g);
    const choice = await menuModal(g);
    if (choice === 'new') started = await newGameFlow(false, loadMap);
  } else {
    if (id) api.clearGameId();
    started = await newGameFlow(true, loadMap);
  }
  paint();
  if (started) showTutorial().catch(() => {});
}

try { if (localStorage.getItem('fc.cb') === '1') document.documentElement.dataset.cb = '1'; } catch (e) { /* ignore */ }

setHeaderRefresher(() => renderHeader($('hdr')));
subscribe(paint);
boot();
