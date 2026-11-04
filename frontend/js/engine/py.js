// Ayudantes con semantica de Python para el port del motor (frontend/js/engine/).
// Puro: sin DOM ni Node. Todas las funciones son exportaciones con nombre.
//
// API (los agentes del port codifican contra estos nombres):
//   pyRound(x, nd)        round() de Python (mitad al par sobre el valor binario exacto).
//                         nd undefined -> entero. nd >= 0 -> float redondeado a nd decimales.
//   pyInt(x)              int(x): trunca hacia 0.
//   floordiv(a, b)        a // b (hacia -inf).
//   pymod(a, b)           a % b (signo del divisor).
//   pyStr(x, isFloat)     str() de numeros: floats como "3.0", "1e-05", "inf"; ints como "3".
//   fmtFixed(x, nd)       f"{x:.{nd}f}"  (mitad al par sobre el valor exacto, como Python).
//   fmtSigned(x, nd)      f"{x:+.{nd}f}"; nd=0 -> estilo f"{x:+d}".
//   fmtInt(x)             f"{int(x)}" / f"{x:d}": entero truncado como texto.
//   fmtComma(x)           f"{x:,}" para enteros (separador de miles).
//   sum(arr)              sum() de Python (empieza en 0, izquierda a derecha).
//   maxBy / minBy         max(arr, key=fn) / min(arr, key=fn): gana el PRIMER extremo.
//   sortedBy(arr, keyFn, reverse)  sorted(arr, key=fn, reverse=...) estable; la clave puede
//                         ser un array (comparado lexicograficamente como una tupla).
//   cmp(a, b)             orden de Python para numeros, strings, booleanos y arrays.
//   truthy(v)             veracidad de Python (0, "", [], {}, null/undefined -> false).
//   clamp(v, lo, hi)      max(lo, min(hi, v)) (espejo de events._clamp).
//   range(a, b, step)     range() de Python como array.
//   setdefault(obj, k, v) dict.setdefault.
//   deepcopy(v)           copy.deepcopy para datos JSON.

// ------------------------------------------------------------------ redondeo
/** True si x es exactamente un empate (..5 exacto) al redondear a nd decimales. */
function _isTie(x, nd) {
  // Un empate exacto en binario exige que x tenga <= nd+1 bits fraccionarios,
  // y entonces toFixed(nd+1) es exacto y termina en '5'.
  const scaled = x * Math.pow(2, nd + 1);
  if (!Number.isFinite(scaled) || !Number.isInteger(scaled)) return false;
  if (Math.abs(x) >= 1e21) return false;
  const s = Math.abs(x).toFixed(nd + 1);
  return s.charCodeAt(s.length - 1) === 53; // '5'
}

/** Cadena decimal de x con nd decimales, empates al par (como '%.{nd}f' de Python). */
function _fixedHalfEven(x, nd) {
  if (!Number.isFinite(x)) return x !== x ? 'nan' : (x > 0 ? 'inf' : '-inf');
  if (!_isTie(x, nd)) return x.toFixed(nd);
  const p = Math.pow(10, nd);
  const v = Math.abs(x) * p;          // semientero exacto
  const lo = Math.floor(v);
  const r = (lo % 2 === 0) ? lo : lo + 1;
  const neg = x < 0 || Object.is(x, -0);
  const body = (nd > 0) ? _intToFixedString(r, nd) : String(r);
  return (neg ? '-' : '') + body;
}

/** Inserta el punto decimal en el entero r para nd decimales (sin pasar por float). */
function _intToFixedString(r, nd) {
  let s = String(r);
  if (s.includes('e')) s = BigInt(r).toString();
  while (s.length <= nd) s = '0' + s;
  return s.slice(0, s.length - nd) + '.' + s.slice(s.length - nd);
}

/**
 * round() de Python. Sin nd: entero (mitad al par). Con nd >= 0: float con nd
 * decimales, redondeo correcto del valor binario exacto con empates al par.
 */
export function pyRound(x, nd = undefined) {
  if (nd === undefined || nd === null) {
    if (!Number.isFinite(x)) throw new Error('cannot convert float to integer');
    const f = Math.floor(x);
    const diff = x - f;
    if (diff < 0.5) return f;
    if (diff > 0.5) return f + 1;
    return (f % 2 === 0) ? f : f + 1;
  }
  if (!Number.isFinite(x)) return x;
  if (nd < 0) {
    const p = Math.pow(10, -nd);
    const y = x / p;
    return pyRound(y) * p;
  }
  if (Number.isInteger(x)) return x;
  return Number(_fixedHalfEven(x, nd));
}

/** int(x): trunca hacia 0. */
export function pyInt(x) {
  if (typeof x === 'string') {
    const n = Number(x.trim());
    if (!Number.isInteger(n)) throw new Error(`invalid literal for int() with base 10: '${x}'`);
    return n;
  }
  if (typeof x === 'boolean') return x ? 1 : 0;
  if (!Number.isFinite(x)) throw new Error('cannot convert float to integer');
  return Math.trunc(x);
}

/** a // b de Python. */
export function floordiv(a, b) {
  if (b === 0) throw new Error('integer division or modulo by zero');
  return Math.floor(a / b);
}

/** a % b de Python (resultado con el signo del divisor). */
export function pymod(a, b) {
  if (b === 0) throw new Error('integer division or modulo by zero');
  const r = a % b;
  return (r !== 0 && (r < 0) !== (b < 0)) ? r + b : r;
}

// ------------------------------------------------------------------ texto
/** repr() de un float de Python a partir de un numero JS. */
export function floatRepr(x) {
  if (x !== x) return 'nan';
  if (x === Infinity) return 'inf';
  if (x === -Infinity) return '-inf';
  if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0';
  const neg = x < 0;
  const e = Math.abs(x).toExponential(); // "d.ddde+n" con digitos minimos
  const m = /^(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(e);
  const digits = m[1] + (m[2] || '');
  const exp10 = parseInt(m[3], 10);
  const decpt = exp10 + 1; // valor = 0.digits * 10^decpt
  let out;
  if (decpt <= -4 || decpt > 16) {
    const mant = digits.length > 1 ? digits[0] + '.' + digits.slice(1) : digits;
    const ae = Math.abs(exp10);
    out = mant + 'e' + (exp10 < 0 ? '-' : '+') + (ae < 10 ? '0' + ae : String(ae));
  } else if (decpt <= 0) {
    out = '0.' + '0'.repeat(-decpt) + digits;
  } else if (decpt >= digits.length) {
    out = digits + '0'.repeat(decpt - digits.length) + '.0';
  } else {
    out = digits.slice(0, decpt) + '.' + digits.slice(decpt);
  }
  return (neg ? '-' : '') + out;
}

/**
 * str() de Python para numeros. isFloat=true fuerza formato de float ("3.0");
 * si se omite, los enteros se imprimen como int y el resto como float.
 */
export function pyStr(x, isFloat = undefined) {
  if (typeof x === 'boolean') return x ? 'True' : 'False';
  if (x === null || x === undefined) return 'None';
  if (typeof x === 'string') return x;
  if (typeof x === 'bigint') return x.toString();
  if (typeof x !== 'number') return String(x);
  if (isFloat || !Number.isInteger(x)) return floatRepr(x);
  return String(x);
}

/** f"{x:.{nd}f}" */
export function fmtFixed(x, nd) {
  return _fixedHalfEven(Number(x), nd);
}

/** f"{x:+.{nd}f}"; con nd=0 equivale a f"{x:+d}" (x entero). */
export function fmtSigned(x, nd = 0) {
  x = Number(x);
  const s = (nd === 0 && Number.isInteger(x)) ? String(x) : _fixedHalfEven(x, nd);
  if (s.startsWith('-')) return s;
  return '+' + s;
}

/** f"{int(x)}" / f"{x:d}". */
export function fmtInt(x) {
  return String(pyInt(x));
}

/** f"{x:,}" para enteros (y f"{x:,.{nd}f}" si se pasa nd). */
export function fmtComma(x, nd = undefined) {
  const s = (nd === undefined) ? String(pyInt(x)) : _fixedHalfEven(Number(x), nd);
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const dot = body.indexOf('.');
  const intPart = dot < 0 ? body : body.slice(0, dot);
  const rest = dot < 0 ? '' : body.slice(dot);
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + grouped + rest;
}

// ------------------------------------------------------------------ colecciones
/** sum() de Python. */
export function sum(arr, start = 0) {
  let t = start;
  for (const v of arr) t += v;
  return t;
}

/** Orden de Python para numeros, strings, booleanos, null y arrays (tuplas). */
export function cmp(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const c = cmp(a[i], b[i]);
      if (c !== 0) return c;
    }
    return a.length < b.length ? -1 : (a.length > b.length ? 1 : 0);
  }
  if (typeof a === 'boolean') a = a ? 1 : 0;
  if (typeof b === 'boolean') b = b ? 1 : 0;
  if (typeof a === 'string' && typeof b === 'string') {
    // Comparacion por puntos de codigo (como Python); igual a UTF-16 salvo astrales.
    if (a === b) return 0;
    const la = a.length, lb = b.length, n = Math.min(la, lb);
    for (let i = 0; i < n; i++) {
      const ca = a.codePointAt(i), cb = b.codePointAt(i);
      if (ca !== cb) return ca < cb ? -1 : 1;
      if (ca > 0xFFFF) i++;
    }
    return la < lb ? -1 : (la > lb ? 1 : 0);
  }
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** max(arr, key=fn): devuelve el PRIMER elemento con clave maxima. */
export function maxBy(arr, keyFn = (v) => v) {
  let best, bestK, has = false;
  for (const v of arr) {
    const k = keyFn(v);
    if (!has || cmp(k, bestK) > 0) { best = v; bestK = k; has = true; }
  }
  if (!has) throw new Error('max() arg is an empty sequence');
  return best;
}

/** min(arr, key=fn): devuelve el PRIMER elemento con clave minima. */
export function minBy(arr, keyFn = (v) => v) {
  let best, bestK, has = false;
  for (const v of arr) {
    const k = keyFn(v);
    if (!has || cmp(k, bestK) < 0) { best = v; bestK = k; has = true; }
  }
  if (!has) throw new Error('min() arg is an empty sequence');
  return best;
}

/**
 * sorted(arr, key=fn, reverse=...): devuelve un array nuevo, orden estable.
 * reverse=true conserva el orden original entre iguales (como Python).
 */
export function sortedBy(arr, keyFn = (v) => v, reverse = false) {
  const items = Array.from(arr, (v, i) => ({ v, k: keyFn(v), i }));
  items.sort((p, q) => {
    const c = cmp(p.k, q.k);
    if (c !== 0) return reverse ? -c : c;
    return p.i - q.i;
  });
  return items.map((p) => p.v);
}

/** sorted(arr) sin clave. */
export function sorted(arr, reverse = false) {
  return sortedBy(arr, (v) => v, reverse);
}

/** Veracidad de Python. */
export function truthy(v) {
  if (v === null || v === undefined || v === false || v === 0 || v === '') return false;
  if (typeof v === 'number') return v === v; // NaN es verdadero en Python
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof Map || v instanceof Set) return v.size > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}

/** Espejo de events._clamp: max(lo, min(hi, v)). */
export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** range() de Python como array. */
export function range(a, b = undefined, step = 1) {
  let start = 0, stop = a;
  if (b !== undefined) { start = a; stop = b; }
  if (step === 0) throw new Error('range() arg 3 must not be zero');
  const out = [];
  if (step > 0) for (let i = start; i < stop; i += step) out.push(i);
  else for (let i = start; i > stop; i += step) out.push(i);
  return out;
}

/** dict.setdefault */
export function setdefault(obj, key, value) {
  if (!(key in obj)) obj[key] = value;
  return obj[key];
}

/** copy.deepcopy para datos tipo JSON. */
export function deepcopy(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(deepcopy);
  const out = {};
  for (const k of Object.keys(v)) out[k] = deepcopy(v[k]);
  return out;
}

/** Equivalente de `x in dict` / `x in list` / `x in str`. */
export function contains(container, x) {
  if (Array.isArray(container) || typeof container === 'string') return container.includes(x);
  if (container instanceof Set || container instanceof Map) return container.has(x);
  return Object.prototype.hasOwnProperty.call(container, x);
}
