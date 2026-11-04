// Ajustes: modo de juego (sin conexión / servidor) y URL del servidor.
import { h, toast } from '../util.js';
import { icon } from '../icons.js';
import { lsGet, lsSet, lsDel, soundOn, setSound, play } from './sound.js';
import { getMode, setMode, getServer, setServer, health, baseUrl } from '../api.js';

const MODES = [
  ['local', 'Sin conexión (motor local)', 'El juego se calcula en este dispositivo. No necesita servidor ni Internet.'],
  ['server', 'Servidor', 'Se conecta a un servidor Python (backend). Necesita la URL del servidor.'],
];

/** Formulario de modo + servidor. onDone(ok) se llama al guardar (ok = true si el modo elegido está listo). */
export function settingsForm(onDone) {
  let mode = getMode();
  const input = h('input', { class: 'field', type: 'url', placeholder: 'http://10.0.2.2:8000', value: getServer() || '', 'aria-label': 'URL del servidor', autocomplete: 'off' });
  const out = h('div', { class: 'muted small', role: 'status' });
  const saveLbl = h('span', null, '');
  const setSaveLbl = () => { saveLbl.textContent = 'Guardar' + (mode === 'server' ? ' y probar' : ''); };
  const serverBox = h('div', { class: 'stack' },
    h('label', { class: 'small muted' }, 'URL del servidor'), input,
    h('button', { class: 'btn', onclick: () => { setServer(''); input.value = ''; out.textContent = 'Servidor restablecido: ' + baseUrl(); } }, 'Restablecer URL'));

  const status = () => {
    if (mode === 'local') out.textContent = 'Modo actual: sin conexión (motor local). Las partidas se guardan en este dispositivo.';
    else out.textContent = 'Modo actual: servidor ' + baseUrl();
  };
  const radios = MODES.map(([id, label, help]) => {
    const r = h('input', { type: 'radio', name: 'fc-mode', value: id, checked: mode === id, 'aria-label': label,
      onchange: () => { mode = id; serverBox.hidden = mode !== 'server'; status(); setSaveLbl(); } });
    return h('label', { class: 'row', style: { alignItems: 'flex-start', gap: '8px' } }, r,
      h('span', { class: 'stack', style: { gap: '2px' } }, h('span', null, label), h('span', { class: 'muted small' }, help)));
  });
  serverBox.hidden = mode !== 'server';
  status();
  setSaveLbl();

  const save = async () => {
    const prev = getMode();
    if (mode === 'local') {
      setMode(mode);
      toast('Modo sin conexión activado', 'ok');
      status();
      if (onDone) onDone(true, prev !== mode);
      return;
    }
    const prevServer = getServer();
    setServer(input.value.trim());
    out.textContent = 'Probando conexión...';
    // Se prueba el servidor ANTES de cambiar de modo: si falla, el modo anterior sigue activo.
    setMode('server');
    const r = await health({ quiet: true });
    if (!r) { setMode(prev); if (prev !== 'server') setServer(prevServer); }
    if (r) {
      out.textContent = 'Conexión correcta' + (r.version ? ' (versión ' + r.version + ')' : '') + '.';
      toast('Conexión correcta', 'ok');
      if (onDone) onDone(true, prev !== mode);
    } else {
      out.textContent = 'No se pudo conectar con ' + baseUrl() + '. Revisa la URL o elige "Sin conexión".';
      if (onDone) onDone(false, prev !== mode);
    }
  };

  const toggle = (label, help, checked, onchange) => h('label', { class: 'row', style: { alignItems: 'flex-start', gap: '8px' } },
    h('input', { type: 'checkbox', checked, 'aria-label': label, onchange: (e) => onchange(e.target.checked) }),
    h('span', { class: 'stack', style: { gap: '2px' } }, h('span', null, label), h('span', { class: 'muted small' }, help)));
  const extras = h('div', { class: 'stack' },
    toggle('Sonido', 'Efectos sonoros sintetizados.', soundOn(), (on) => { setSound(on); if (on) play('click', true); }),
    toggle('Modo daltónico', 'Paleta con mayor contraste entre colores.', lsGet('fc.cb') === '1', (on) => {
      if (on) lsSet('fc.cb', '1'); else lsDel('fc.cb');
      try { if (on) document.documentElement.dataset.cb = '1'; else delete document.documentElement.dataset.cb; } catch (e) { /* ignore */ }
    }));

  return h('div', { class: 'stack' },
    extras,
    h('label', { class: 'small muted' }, 'Modo de juego'),
    h('div', { class: 'stack' }, radios),
    serverBox,
    h('button', { class: 'btn primary block', onclick: save }, icon('globe'), saveLbl),
    out);
}

/** Botón rápido para la pantalla de error: activa el modo local y recarga. */
export function offlineButton(onDone) {
  return h('button', { class: 'btn block primary', onclick: () => { setMode('local'); toast('Modo sin conexión activado', 'ok'); if (onDone) onDone(); } },
    'Jugar sin conexión');
}
