"""Generador pseudoaleatorio portable (bit-exacto entre Python y JavaScript).

Sustituye a ``random.Random`` en todo el motor para que el port JS
(frontend/js/engine/) reproduzca exactamente las mismas tiradas.
Toda la aritmetica es de enteros sin signo de 32 bits (``& 0xFFFFFFFF`` en
Python; ``>>> 0`` / ``| 0`` / ``Math.imul`` en JS).

Especificacion exacta
---------------------
1. Semilla -> texto:
   * ``str``: se usa tal cual.
   * ``int`` (cualquier tamano, tambien negativo): ``str(n)`` en base 10
     (equivale a ``String(n)`` en JS mientras |n| < 2**53).
   * ``None``: no permitido (el motor siempre pasa una semilla).
2. Texto -> bytes: UTF-8.
3. Bytes -> 4 palabras de 32 bits con cyrb128::

       h1, h2, h3, h4 = 1779033703, 3144134277, 1013904242, 2773480762
       para cada byte k:
           h1 = h2 ^ imul(h1 ^ k, 597399067)
           h2 = h3 ^ imul(h2 ^ k, 2869860233)
           h3 = h4 ^ imul(h3 ^ k, 951274213)
           h4 = h1 ^ imul(h4 ^ k, 2716044179)      # usa el h1 nuevo
       h1 = imul(h3 ^ (h1 >>> 18), 597399067)
       h2 = imul(h4 ^ (h2 >>> 22), 2869860233)
       h3 = imul(h1 ^ (h3 >>> 17), 951274213)      # usa el h1 nuevo
       h4 = imul(h2 ^ (h4 >>> 19), 2716044179)     # usa el h2 nuevo
       h1 ^= h2 ^ h3 ^ h4
       h2 ^= h1; h3 ^= h1; h4 ^= h1                 # con el h1 nuevo
       estado (a, b, c, d) = (h1, h2, h3, h4)

   ``imul(x, y)`` = ``(x * y) & 0xFFFFFFFF`` (igual que ``Math.imul(x,y) >>> 0``).
4. Generador sfc32, salida ``next_u32()``::

       t = (a + b) & M
       a = b ^ (b >>> 9)
       b = (c + (c << 3)) & M
       c = ((c << 21) | (c >>> 11)) & M
       d = (d + 1) & M
       t = (t + d) & M
       c = (c + t) & M
       devolver t

   Tras sembrar se descartan 15 salidas (calentamiento).
5. ``random()``: ``x = next_u32() >>> 5`` (27 bits), ``y = next_u32() >>> 6``
   (26 bits); resultado ``(x * 67108864 + y) / 9007199254740992`` en [0, 1).
6. ``_randbelow(n)`` (n >= 1) = ``floor(random() * n)`` (producto en double).
7. Derivados:
   * ``randrange(stop)`` = ``_randbelow(stop)``;
     ``randrange(start, stop, step=1)``: ``width = stop - start``; con step 1
     ``start + _randbelow(width)``; con otro step
     ``n = ceil-div(width, step)`` y ``start + step * _randbelow(n)``.
   * ``randint(a, b)`` = ``a + _randbelow(b - a + 1)``.
   * ``uniform(a, b)`` = ``a + (b - a) * random()``.
   * ``choice(seq)`` = ``seq[_randbelow(len(seq))]`` (IndexError si vacia).
   * ``shuffle(lst)``: Fisher-Yates in situ, ``i`` de ``len-1`` a ``1``,
     ``j = _randbelow(i + 1)``, intercambiar ``lst[i]`` y ``lst[j]``.
   * ``sample(seq, k)``: copia ``pool = list(seq)``; para ``i`` en ``0..k-1``:
     ``j = i + _randbelow(len(pool) - i)``, intercambiar ``pool[i]``/``pool[j]``;
     devolver ``pool[:k]``.
"""
from __future__ import annotations

from typing import Any, List, MutableSequence, Sequence, Tuple, Union

M32 = 0xFFFFFFFF
WARMUP = 15
TWO_53 = 9007199254740992.0


def _imul(x: int, y: int) -> int:
    return (x * y) & M32


def seed_text(seed: Union[int, str]) -> str:
    """Normaliza la semilla a texto (paso 1 de la especificacion)."""
    if isinstance(seed, bool):
        seed = int(seed)
    if isinstance(seed, int):
        return str(seed)
    if isinstance(seed, str):
        return seed
    raise TypeError("La semilla debe ser int o str.")


def cyrb128(text: str) -> Tuple[int, int, int, int]:
    """Hash cyrb128 sobre los bytes UTF-8 de `text`."""
    h1, h2, h3, h4 = 1779033703, 3144134277, 1013904242, 2773480762
    for k in text.encode("utf-8"):
        h1 = h2 ^ _imul(h1 ^ k, 597399067)
        h2 = h3 ^ _imul(h2 ^ k, 2869860233)
        h3 = h4 ^ _imul(h3 ^ k, 951274213)
        h4 = h1 ^ _imul(h4 ^ k, 2716044179)
    h1 = _imul(h3 ^ (h1 >> 18), 597399067)
    h2 = _imul(h4 ^ (h2 >> 22), 2869860233)
    h3 = _imul(h1 ^ (h3 >> 17), 951274213)
    h4 = _imul(h2 ^ (h4 >> 19), 2716044179)
    h1 ^= h2 ^ h3 ^ h4
    h2 ^= h1
    h3 ^= h1
    h4 ^= h1
    return h1 & M32, h2 & M32, h3 & M32, h4 & M32


class PortableRandom:
    """Subconjunto de random.Random sobre sfc32, reproducible en JS."""

    __slots__ = ("_a", "_b", "_c", "_d")

    def __init__(self, seed: Union[int, str]) -> None:
        self.seed(seed)

    def seed(self, seed: Union[int, str]) -> None:
        self._a, self._b, self._c, self._d = cyrb128(seed_text(seed))
        for _ in range(WARMUP):
            self.next_u32()

    def getstate(self) -> Tuple[int, int, int, int]:
        return self._a, self._b, self._c, self._d

    def setstate(self, state: Sequence[int]) -> None:
        self._a, self._b, self._c, self._d = (int(v) & M32 for v in state)

    def next_u32(self) -> int:
        a, b, c, d = self._a, self._b, self._c, self._d
        t = (a + b) & M32
        a = b ^ (b >> 9)
        b = (c + (c << 3)) & M32
        c = ((c << 21) | (c >> 11)) & M32
        d = (d + 1) & M32
        t = (t + d) & M32
        c = (c + t) & M32
        self._a, self._b, self._c, self._d = a, b, c, d
        return t

    def random(self) -> float:
        x = self.next_u32() >> 5
        y = self.next_u32() >> 6
        return (x * 67108864 + y) / TWO_53

    def _randbelow(self, n: int) -> int:
        if n <= 0:
            raise ValueError("Rango vacío.")
        return int(self.random() * n)

    def randrange(self, start: int, stop: Any = None, step: int = 1) -> int:
        if stop is None:
            return self._randbelow(int(start))
        width = int(stop) - int(start)
        if step == 1:
            return int(start) + self._randbelow(width)
        if step == 0:
            raise ValueError("step no puede ser 0.")
        n = -(-width // step)  # division entera redondeando hacia arriba
        return int(start) + step * self._randbelow(n)

    def randint(self, a: int, b: int) -> int:
        return int(a) + self._randbelow(int(b) - int(a) + 1)

    def uniform(self, a: float, b: float) -> float:
        return a + (b - a) * self.random()

    def choice(self, seq: Sequence[Any]) -> Any:
        if not len(seq):
            raise IndexError("No se puede elegir de una secuencia vacía.")
        return seq[self._randbelow(len(seq))]

    def shuffle(self, lst: MutableSequence[Any]) -> None:
        for i in range(len(lst) - 1, 0, -1):
            j = self._randbelow(i + 1)
            lst[i], lst[j] = lst[j], lst[i]

    def sample(self, seq: Sequence[Any], k: int) -> List[Any]:
        pool = list(seq)
        if not 0 <= k <= len(pool):
            raise ValueError("Muestra mayor que la población.")
        for i in range(k):
            j = i + self._randbelow(len(pool) - i)
            pool[i], pool[j] = pool[j], pool[i]
        return pool[:k]
