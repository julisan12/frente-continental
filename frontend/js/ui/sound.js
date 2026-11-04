// Sintetizador WebAudio minimo. Desactivado por defecto (LS fc.sound). Nunca lanza.
export const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
export const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
export const lsDel = (k) => { try { localStorage.removeItem(k); } catch { /* sin almacenamiento */ } };

export const soundOn = () => lsGet('fc.sound') === '1';
export function setSound(on) { on ? lsSet('fc.sound', '1') : lsDel('fc.sound'); }

let ctx = null;
const SEQ = {
  click: [[660, 0.05, 'square', 0.04]],
  turn: [[392, 0.12, 'triangle', 0.08], [523, 0.12, 'triangle', 0.08], [659, 0.2, 'triangle', 0.08]],
  alert: [[440, 0.15, 'sawtooth', 0.06], [330, 0.25, 'sawtooth', 0.06]],
  win: [[523, 0.14, 'triangle', 0.09], [659, 0.14, 'triangle', 0.09], [784, 0.14, 'triangle', 0.09], [1047, 0.35, 'triangle', 0.09]],
};

export function play(kind = 'click', force = false) {
  try {
    if (!force && !soundOn()) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
    let t = ctx.currentTime;
    (SEQ[kind] || SEQ.click).forEach(([f, d, type, vol]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + d + 0.02);
      t += d * 0.9;
    });
  } catch { /* sin audio */ }
}
