// Generador pseudoaleatorio portable: espejo bit-exacto de backend/app/engine/rng.py.
// (cyrb128 para sembrar + sfc32). Ver la especificacion completa en rng.py.
// Puro: sin DOM ni Node; funciona en navegador y Node 18+.

export const M32 = 0xFFFFFFFF;
export const WARMUP = 15;
export const TWO_53 = 9007199254740992.0;

function _imul(x, y) {
  return Math.imul(x, y) >>> 0;
}

let _encoder = null;
function _utf8(text) {
  if (typeof TextEncoder !== 'undefined') {
    if (!_encoder) _encoder = new TextEncoder();
    return _encoder.encode(text);
  }
  // Respaldo manual (entornos sin TextEncoder).
  const out = [];
  for (const ch of text) {
    let cp = ch.codePointAt(0);
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xC0 | (cp >> 6), 0x80 | (cp & 0x3F));
    else if (cp < 0x10000) out.push(0xE0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
    else out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
  }
  return out;
}

/** Normaliza la semilla a texto (paso 1 de la especificacion). */
export function seed_text(seed) {
  if (typeof seed === 'boolean') seed = seed ? 1 : 0;
  if (typeof seed === 'number') {
    if (!Number.isInteger(seed)) throw new TypeError('La semilla debe ser int o str.');
    return String(seed);
  }
  if (typeof seed === 'bigint') return seed.toString();
  if (typeof seed === 'string') return seed;
  throw new TypeError('La semilla debe ser int o str.');
}

/** Hash cyrb128 sobre los bytes UTF-8 de `text`. Devuelve [h1,h2,h3,h4] (uint32). */
export function cyrb128(text) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  const bytes = _utf8(text);
  for (let i = 0; i < bytes.length; i++) {
    const k = bytes[i];
    h1 = (h2 ^ _imul(h1 ^ k, 597399067)) >>> 0;
    h2 = (h3 ^ _imul(h2 ^ k, 2869860233)) >>> 0;
    h3 = (h4 ^ _imul(h3 ^ k, 951274213)) >>> 0;
    h4 = (h1 ^ _imul(h4 ^ k, 2716044179)) >>> 0;
  }
  h1 = _imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = _imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = _imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = _imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 = (h1 ^ h2 ^ h3 ^ h4) >>> 0;
  h2 = (h2 ^ h1) >>> 0;
  h3 = (h3 ^ h1) >>> 0;
  h4 = (h4 ^ h1) >>> 0;
  return [h1, h2, h3, h4];
}

/** Subconjunto de random.Random sobre sfc32, identico a PortableRandom de Python. */
export class PortableRandom {
  constructor(seed) {
    this._a = 0; this._b = 0; this._c = 0; this._d = 0;
    this.seed(seed);
  }

  seed(seed) {
    const s = cyrb128(seed_text(seed));
    this._a = s[0]; this._b = s[1]; this._c = s[2]; this._d = s[3];
    for (let i = 0; i < WARMUP; i++) this.next_u32();
  }

  getstate() {
    return [this._a, this._b, this._c, this._d];
  }

  setstate(state) {
    this._a = Number(state[0]) >>> 0;
    this._b = Number(state[1]) >>> 0;
    this._c = Number(state[2]) >>> 0;
    this._d = Number(state[3]) >>> 0;
  }

  next_u32() {
    let a = this._a, b = this._b, c = this._c, d = this._d;
    let t = (a + b) >>> 0;
    a = (b ^ (b >>> 9)) >>> 0;
    b = (c + ((c << 3) >>> 0)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    d = (d + 1) >>> 0;
    t = (t + d) >>> 0;
    c = (c + t) >>> 0;
    this._a = a; this._b = b; this._c = c; this._d = d;
    return t;
  }

  random() {
    const x = this.next_u32() >>> 5;
    const y = this.next_u32() >>> 6;
    return (x * 67108864 + y) / TWO_53;
  }

  _randbelow(n) {
    if (n <= 0) throw new Error('Rango vacío.');
    return Math.floor(this.random() * n);
  }

  randrange(start, stop = undefined, step = 1) {
    if (stop === undefined || stop === null) return this._randbelow(Math.trunc(start));
    const width = Math.trunc(stop) - Math.trunc(start);
    if (step === 1) return Math.trunc(start) + this._randbelow(width);
    if (step === 0) throw new Error('step no puede ser 0.');
    const n = -Math.floor(-width / step); // division entera redondeando hacia arriba
    return Math.trunc(start) + step * this._randbelow(n);
  }

  randint(a, b) {
    return Math.trunc(a) + this._randbelow(Math.trunc(b) - Math.trunc(a) + 1);
  }

  uniform(a, b) {
    return a + (b - a) * this.random();
  }

  choice(seq) {
    if (!seq.length) throw new Error('No se puede elegir de una secuencia vacía.');
    return seq[this._randbelow(seq.length)];
  }

  shuffle(lst) {
    for (let i = lst.length - 1; i > 0; i--) {
      const j = this._randbelow(i + 1);
      const tmp = lst[i]; lst[i] = lst[j]; lst[j] = tmp;
    }
  }

  sample(seq, k) {
    const pool = Array.from(seq);
    if (!(k >= 0 && k <= pool.length)) throw new Error('Muestra mayor que la población.');
    for (let i = 0; i < k; i++) {
      const j = i + this._randbelow(pool.length - i);
      const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    return pool.slice(0, k);
  }
}
