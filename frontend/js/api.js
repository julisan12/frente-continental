// Cliente de la API. Dos modos: 'local' (motor JavaScript en el dispositivo, sin servidor) y 'server' (REST).
// Modo por defecto: local en la app nativa (Capacitor), file:// o ?local=1 / ?mock=1; servidor en el resto.
// URL base del servidor: localStorage fc_server > misma origin (http/https, no Capacitor) > emulador Android.
import { toast } from './util.js';

const QS = new URLSearchParams(location.search);
export const isMock = QS.get('mock') === '1';
const LS = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* sin almacenamiento */ } },
};

export const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

function defaultMode() {
  if (isMock || QS.get('local') === '1') return 'local';
  if (QS.get('local') === '0' || QS.get('server') === '1') return 'server';
  if (isNative() || location.protocol === 'file:' || location.protocol === 'capacitor:') return 'local';
  return 'server';
}

/** Modo actual: 'local' o 'server'. Los parámetros de la URL mandan; si no, lo guardado en fc_mode; si no, el valor por defecto. */
export function getMode() {
  if (isMock || QS.get('local') === '1') return 'local';
  if (QS.get('local') === '0' || QS.get('server') === '1') return 'server';
  const m = LS.get('fc_mode');
  return m === 'local' || m === 'server' ? m : defaultMode();
}
export function setMode(mode) { mode === 'local' || mode === 'server' ? LS.set('fc_mode', mode) : LS.del('fc_mode'); }
export const isLocal = () => getMode() === 'local';

export function baseUrl() {
  const s = LS.get('fc_server');
  if (s) return s.trim().replace(/\/+$/, '');
  if ((location.protocol === 'http:' || location.protocol === 'https:') && !isNative()) return '';
  return 'http://10.0.2.2:8000';
}
export const getServer = () => LS.get('fc_server') || '';
export function setServer(url) { url ? LS.set('fc_server', url.trim()) : LS.del('fc_server'); }
// La partida guardada se recuerda por modo (fc_game_id_local / fc_game_id_server): cambiar de modo no pierde la del otro.
const gameKey = () => 'fc_game_id_' + getMode();
export function savedGameId() {
  const id = LS.get(gameKey());
  if (id) return id;
  const legacy = LS.get('fc_game_id'); // clave antigua compartida: se migra al modo actual
  if (legacy) { LS.set(gameKey(), legacy); LS.del('fc_game_id'); }
  return legacy;
}
export const saveGameId = (id) => LS.set(gameKey(), id);
export const clearGameId = () => LS.del(gameKey());

function errMsg(e) {
  if (e && e.detail) {
    if (typeof e.detail === 'string') return e.detail;
    return 'Solicitud no válida.';
  }
  if (e && e.status === 404) return 'No se encontró el recurso en el servidor.';
  if (e && e.status) return 'Error del servidor (' + e.status + ').';
  if (isLocal()) return 'Error del motor local: ' + ((e && e.message) || String(e));
  return 'No se pudo conectar con el servidor. Revisa la URL en Más > Ajustes.';
}

async function req(method, path, body, opts = {}) {
  try {
    if (isLocal()) {
      const m = await import('./localapi.js');
      return await m.handle(method, path, body);
    }
    const res = await fetch(baseUrl() + '/api' + path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* sin cuerpo */ }
    if (!res.ok) throw { status: res.status, detail: data && data.detail };
    return data;
  } catch (e) {
    if (!opts.quiet) toast(errMsg(e));
    return null;
  }
}

const gp = (id) => '/games/' + encodeURIComponent(id);
export const health = (opts) => req('GET', '/health', undefined, opts);
export const getMap = () => req('GET', '/map');
export const newGame = (player) => req('POST', '/games', { player });
export const getGame = (id, opts) => req('GET', gp(id), undefined, opts);
export const addOrder = (id, order) => req('POST', gp(id) + '/orders', order);
export const delOrder = (id, oid) => req('DELETE', gp(id) + '/orders/' + encodeURIComponent(oid));
export const putBudget = (id, b) => req('PUT', gp(id) + '/budget', b);
export const eventChoice = (id, option) => req('POST', gp(id) + '/events/choice', { option });
export const extAction = (id, body) => req('POST', gp(id) + '/ext', body);
export const endTurn = (id) => req('POST', gp(id) + '/end-turn');
export const getCountry = (id, cid) => req('GET', gp(id) + '/country/' + encodeURIComponent(cid), undefined, { quiet: true });
