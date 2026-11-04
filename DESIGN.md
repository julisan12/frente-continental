# Frente Continental — Documento de diseño (Beta 0.2)

Base: "Frente Continental · Alfa 0.1" (`reference/original_alfa_0_1.html`), idea original del autor:
gran estrategia por turnos en América Latina, 24 países completos, eventos aleatorios, pantalla vertical,
victoria al controlar ≥50% de los países, pensado para 8 jugadores con turnos de 24 h (multijugador en fase posterior).
Inspiración (géneros existentes, sin copiar ningún juego): gran estrategia tipo Hearts of Iron / Supremacy 1914
(órdenes simultáneas, presupuesto, divisiones), Diplomacy (alianzas y fronteras), Twilight Struggle (Guerra Fría 1962, alineamientos).
Ambientación: enero 1962, cada turno = 1 mes.

## Arquitectura
```
backend/            Python 3.10+, FastAPI. Estado autoritativo y resolución de turnos.
  app/main.py       API REST + sirve frontend/ como estáticos en "/"
  app/data/countries.json   24 países (id, name, power, neighbors, sea, alignment, resources, color, path SVG)
  app/engine/       lógica pura (sin FastAPI): state.py, economy.py, diplomacy.py, military.py, events.py, ai.py, turn.py
  app/storage.py    partidas en JSON en backend/saves/<game_id>.json
  tests/            pytest
frontend/           HTML + CSS + JS vanilla (módulos ES), mobile-first vertical
  index.html, css/, js/api.js, js/ui/*.js ...
mobile/             Capacitor (APK Android) que empaqueta frontend/; URL del servidor configurable
```
APK: Python no corre dentro del APK → el APK es el cliente y se conecta al servidor (URL configurable en Ajustes,
por defecto `http://10.0.2.2:8000` en emulador). Cuando el frontend se sirve desde el backend usa la misma origin.

## Modelo de estado (JSON)
```
Game { id, version:"0.2", player:"Mexico", turn:1, date:"Ene 1962", countries:{id:Country},
       relations:{ "A|B": int -100..100 }  (clave con ids ordenados alfabéticamente),
       treaties:[{type:"alliance"|"nap"|"trade", a, b, since_turn}],
       wars:[{a,b,since_turn}], divisions:[Division], orders:[Order], projects:[Project],
       logs:[{turn, text, kind:"info"|"war"|"econ"|"diplo"|"event"}], active_event:Event|null,
       ended:false, winner:null, seed:int }
Country { id, name, owner, money, industry, production(base), army(tropas totales en miles),
          tanks, planes, stability(0-100), development, population(millones), infrastructure(0-100),
          budget:{army,social,infrastructure,industry} (porcentajes, suman 100),
          alignment, resources[] }
Division { id, name:"1ª División Blindada", owner, location:countryId, troops, tanks, planes,
           stance:"defend"|"idle"|"front", org(0-100) }
Order { id, type, target, division_id?, cost, params{} }
Project { id, owner, kind:"factory"|"road"|"port"|"school"|"barracks", name, turns_left, total_turns, cost }
```
Inicial: cada país tiene un objeto `start` con valores balanceados para 1962 (abstracción de juego, no estadísticas oficiales):
money (40-360 unidades internas, x10 en pantalla → "$400-$3600 M"), industry (12-120), production (19-120),
army (5-90 miles de tropas), tanks (0-28), planes (0-16), stability (35-82), development (1.2-5), infrastructure (12-60),
population (valores aproximados de 1962 en millones). Cada país tiene fortalezas y debilidades distintas, ninguno cercano
al máximo en todo. Si el campo `start` no existe (compatibilidad), se usa la fórmula derivada del original (p = power):
money=p*65, industry=p*12, army=p*7, production=p*15, stability=70, tanks=p*4, planes=p*2, development=1+p*0.25,
population ≈ p*6 (o POP_OVERRIDE), infrastructure=30+p*4. Las 2 divisiones iniciales reparten army/tanks/planes totales
del país en proporciones 60/40 (tropas) y 30/70 (vehículos).

## Mecánicas
- **Economía**: ingreso = production × (0.6 + stability/250) × (1 + development*0.05) + bonus comercio.
  Gasto = mantenimiento ejército (army×0.8 como original + tanks×0.5 + planes×0.8) .
  El presupuesto reparte el *superávit invertible*: % ejército → reclutamiento pasivo, % social → +estabilidad,
  % infraestructura → +infrastructure, % industria → +industry. Dinero < 0 → −8 estabilidad y se recorta a 0 (original).
- **Órdenes de economía**: build (100: +10 industria +8 producción, original), project (proyectos multi-turno),
  stability (70: +8%), recruit (80: +12 tropas), tanks (120: +6), planes (150: +4).
- **Diplomacia**: relaciones −100..100. Acciones: propose_alliance (IA acepta si relación ≥ 30 y no en guerra
  con un aliado suyo; ya no acepta siempre), nap (pacto de no agresión, relación ≥ 0), send_resources (dinero → +relación),
  trade (tratado comercial +5% ingreso ambos), break (−4 estabilidad, −30 relación), declare_war (−3 estabilidad; romper NAP −10 extra).
  Amenaza (0-100) que el país supone para el jugador = min(100, poder(objetivo)/poder(jugador) × hostilidad × 50);
  hostilidad = 1 en guerra, si no clamp((20 − relación)/70, 0, 1), ×0.5 con pacto de no agresión; 0 para aliados.
- **Militar**: divisiones con orden por turno: move (a territorio propio/aliado adyacente), attack (territorio enemigo
  adyacente por tierra o mar; mar = −25% ataque), defend (+25% defensa, como 1.25 original), reorganize (+org),
  front (establecer frente: si el país tiene alguna división en postura front, sus divisiones ganan +10% defensa en todos
  sus territorios fronterizos con enemigos en guerra; front recupera org como defend). Atacar declara guerra automáticamente.
  Combate (valores actuales de constants.py, referencia única para el port JS): ataque = poder × 0.8 × (0.82 + r×0.34);
  defensa = (milicia + Σ poder × (1 + 0.25 si defend + 0.10 si frente)) × (1.25 si es el territorio de origen del dueño: "defensa de la patria")
  × 1.0 × (0.83 + r×0.33) × (1 + infra×0.002);
  poder = tropas + tanques×3 + aviones×4, × org/100, defensor con bonus infraestructura. Al ganar: pérdidas = def×0.35,
  se captura 35% industria y 25% producción, el territorio cambia de dueño. Al perder: atacante pierde def×0.27, defensor ataque×0.2.
- **IA**: cada país IA: presupuesto, construye, recluta si amenaza alta, propone/acepta tratados según relación,
  **sí lanza ofensivas** desde el turno 10 si su poder > 1.4× defensor vecino hostil (relación < −40) y estabilidad > 40,
  y solo agrupa el ataque si reúne ≥ 1.1× la defensa del territorio; en guerra ya declarada sigue atacando con ≥ 0.9×.
  Las IA agresivas (35%) acumulan rencor (−4 relación/turno) contra vecinos con < 0.6× su poder y sin NAP solo desde el turno 8.
- **Eventos**: 65% por turno (original) + nuevos de 1962 (crisis energética, huelga minera, golpe de estado,
  ayuda extranjera, boom exportador, terremoto, crisis de los misiles: tensión regional). Algunos con elección (2 opciones).
- **Victoria**: controlar ≥ 50% de los países (12/24). Derrota: perder todos los territorios o estabilidad 0 por 3 turnos
  (por debajo de estabilidad 10 no hay "retorno a la normalidad", así que el colapso es alcanzable), o que una IA llegue a 12/24.
  Límite de 48 turnos (Dic 1965) sin dominador: puntuación = territorios×10 + industria. Si el jugador lidera (empate a su favor)
  → victoria por supremacía; si no → tablas (`result:"draw"`, `winner` = líder): la nación sobrevive a la Guerra Fría.
  (No hay derrota por puntuación al límite: la industria de la IA crece sin tope y haría la derrota automática.)
- Resolución de turno determinista con `seed` (PortableRandom, sfc32 + cyrb128: idéntico en Python y JS).

## API REST (prefijo /api)
- `GET  /api/health` → {ok:true, version}
- `GET  /api/map` → {viewBox:"0 0 500 535", countries:[{id,name,color,path,neighbors,sea,power,alignment,resources}]}
- `POST /api/games` body {player:countryId} → Game (vista)
- `GET  /api/games/{id}` → Game
- `POST /api/games/{id}/orders` body {type, target?, division_id?, params?} → {game} (valida y descuenta coste; error → 400 {detail})
- `DELETE /api/games/{id}/orders/{order_id}` → {game} (reembolsa)
- `PUT  /api/games/{id}/budget` body {army,social,infrastructure,industry} → {game}
- `POST /api/games/{id}/events/choice` body {option:0|1} → {game}
- `POST /api/games/{id}/end-turn` → {game, report:{turn, lines:[...], battles:[...]}}
- `GET  /api/games/{id}/country/{cid}` → detalle con derivados: income, expenses, balance, gdp, threat, relation,
  army_estimate {troops,tanks,planes} (totales de la entidad, niebla ±20% para no aliados), allies[], enemies[],
  stability_factors[], sector_output{}.
Niebla de guerra en Game: países no aliados con army/tanks/planes perturbados ±20% (determinista por turno), money=null, fog:true;
`divisions` solo incluye las propias y aliadas.
Errores: HTTP 400 {detail:"mensaje en español"}.
Todas las respuestas Game incluyen campos derivados para el jugador: `summary:{income,expenses,balance,deltas{money,stability,industry},forces{troops,tanks,planes}}`;
`deltas` = cambio producido por el último end-turn (guardado en el estado, no cambia al encolar órdenes).

## Frontend (referencias reference/1.png, 2.png, 3.png)
Pantallas (barra inferior: Mapa · País · Economía · Ejército · Diplomacia · Más):
1. **Mapa**: cabecera con emblema "Frente Continental", barra de stats (Turno+fecha, Dinero con delta, Estabilidad, Industria,
   Ejército, Diplomacia); mapa SVG con colores apagados por país, jugador dorado con estrella, aliados verde oliva, enemigos rojo óxido,
   rosa de los vientos, escala, zoom +/−/centrar (pan con arrastre y pinch), tarjeta de evento activo, panel inferior del país
   seleccionado (población, recursos, industria, tropas/tanques/aviones, alianzas, barra estabilidad). Botón verde "Finalizar turno".
2. **Economía** (ref 3): pestañas Gestión/Industria/Infraestructura/Presupuesto/Estabilidad; PIB, ingresos, gastos, balance;
   sliders de presupuesto con −/+; proyectos en construcción con progreso; gráfico de barras sectorial; factores de estabilidad.
3. **Diplomacia** (ref 2): pestañas Diplomacia/Alianzas/Tratados/Guerras; tarjeta objetivo (relación, amenaza, ejército estimado,
   alineamiento); lista de vecinos; botones Proponer alianza, Enviar recursos, Pacto de no agresión, Declarar guerra.
4. **Ejército** (ref 2 derecha): lista de divisiones (tropas/tanques/aviones), órdenes Mover/Atacar/Defender/Reorganizar/Establecer frente,
   cola de órdenes editable/eliminable, resumen (órdenes, tropas implicadas).
5. **Más**: Eventos/noticias, partida nueva, ajustes (URL servidor), ayuda.

Estética: fondo azul marino muy oscuro, paneles con borde latón (#b8975a apagado), títulos serif crema/dorado,
botones de confirmación verde militar (#4f7a4a), alertas rojo óxido (#9a4a42). Multicolor apagado, nada saturado.
Tipografías: serif para títulos (p.ej. "Cinzel" / "Libre Baskerville" de Google Fonts con fallback Georgia), sans para datos.
Texto de la UI en español.
