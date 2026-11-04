# Frente Continental · Beta 0.2

Gran estrategia por turnos en América Latina (enero 1962, 1 turno = 1 mes), basada en la idea original
"Frente Continental · Alfa 0.1" (copia en `reference/original_alfa_0_1.html`). Diseño completo en `DESIGN.md`.

## Estructura
```
backend/   Python (FastAPI): motor del juego, API REST, partidas guardadas en JSON
frontend/  HTML + CSS + JavaScript (módulos ES, sin compilación), interfaz vertical para móvil
mobile/    Capacitor: empaqueta frontend/ como APK Android
tools/     scripts auxiliares (extracción del mapa, simulación)
```

## 1. Jugar sin conexión (modo por defecto en el APK)
El motor del juego está portado a JavaScript (`frontend/js/engine/`, paridad turno a turno con el motor Python)
y corre dentro de la propia app: **el APK no necesita servidor ni Internet**. Las partidas se guardan en el
dispositivo (localStorage). También funciona en un navegador de escritorio:
```
cd frontend
python -m http.server 5500
```
y abrir http://localhost:5500/?local=1 (en la app nativa o con `?mock=1` el modo local es el predeterminado).
No abras `index.html` directamente (`file://`): los navegadores bloquean los módulos ES en ese caso y la
página queda en blanco; hace falta un servidor HTTP (como el de arriba) o el APK.

Modo en **Más → Ajustes**: "Sin conexión (motor local)" o "Servidor" (+ URL). Se guarda en `localStorage` (`fc_mode`).
Si la app no logra conectar con un servidor, la pantalla de error ofrece "Jugar sin conexión".

## 2. Servidor (opcional, Python 3.10+)
```
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```
Abrir http://localhost:8000 en el navegador: el backend sirve también el frontend (modo servidor por defecto en http/https).

Pruebas: `cd backend && python -m pytest -q`. Simulación: `python tools/simulate.py 40 2`.

## 3. Generar el APK (Android)
Requisitos:
- Node 18+.
- Android Studio con **Android SDK** (Platform 34, Build-Tools, Platform-Tools).
- **JDK 21**: usar el que trae Android Studio (`C:\Program Files\Android\Android Studio\jbr`). Definir
  `JAVA_HOME` apuntando a esa carpeta (o `org.gradle.java.home` en `mobile/android/gradle.properties`).
- Gradle wrapper **8.7** (ya configurado en `mobile/android/gradle/wrapper/gradle-wrapper.properties`; se descarga solo).
- `mobile/android/local.properties` con la ruta del SDK, por ejemplo:
  ```
  sdk.dir=C:/Users/TU_USUARIO/AppData/Local/Android/Sdk
  ```
```
cd mobile
npm install
npx cap add android      # solo la primera vez
npx cap sync android     # copia frontend/ (incluye js/engine y data/countries.json) al proyecto Android
npx cap open android     # compilar desde Android Studio
# o por consola:
cd android
gradlew assembleDebug    # Windows: .\gradlew.bat assembleDebug
```
El APK queda en `mobile/android/app/build/outputs/apk/debug/app-debug.apk`.
**Importante:** ejecuta `npx cap sync android` (o `npm run sync` / `npm run build:debug`) antes de CADA
compilación con gradle; si no, el APK lleva una copia vieja de `frontend/` sin el motor local y no juega sin conexión.

El APK juega **sin conexión por defecto**. Si se quiere usar el servidor Python, en la app **Más → Ajustes → Servidor** y URL:
- Emulador Android: `http://10.0.2.2:8000` (por defecto)
- Teléfono real: `http://IP-DE-TU-PC:8000` (misma red Wi-Fi; arrancar uvicorn con `--host 0.0.0.0`)

## Sistemas ampliados

Capa de sistemas adicionales (`frontend/js/engine/features.js`), que no altera el motor base:

- **Tecnología**: árbol de 18 técnicas (infantería, blindados, artillería, aviación, economía), laboratorios y velocidad de investigación.
- **Política interna**: impuestos, leyes y focos nacionales con cuenta atrás.
- **Diplomacia**: bloques (ingreso, salida, caja común, expulsión), pactos temporales y votaciones de la OEA.
- **Espionaje**: revelar, robar, sabotear y golpe de estado, con registro de operaciones.
- **Mercado**: precios de materias primas con evolución mensual y noticias.
- **Logros e índice de poder** con historial.

Tanda 1 (dinámica y profundidad; módulos `engine/provinces.js`, `engine/units.js`, `engine/supply.js`, UI en `ui/`):

- **Arranque rebalanceado (1962)**: cada país trae valores explícitos (`start` en `data/countries.json`): dinero, industria,
  producción, ejército, estabilidad, desarrollo e infraestructura variados y realistas; ningún país empieza al máximo en todo.
- **Modos de mapa**: Relaciones (azul yo, verde aliados/bloque, rojo guerra, gris neutro), Recursos (insignias de recursos y
  edificios solo aquí), Guerra (ocupación y unidades visibles) y Político (degradado verde→rojo según la relación).
- **Infraestructura provincial**: laboratorios (investigación), carreteras y ferrocarril (organización y logística de ataque,
  ingresos), fortalezas y líneas defensivas (defensa provincial y del país). Panel de acciones por provincia: construir,
  infraestructura, reclutar unidades allí y atacar.
- **Unidades especializadas** (infantería, motorizada, blindados, artillería, montaña, marina, aviación, fuerzas especiales)
  con icono propio, desbloqueo por tecnología, coste en dinero y recursos, ventajas/desventajas por terreno y emparejamiento,
  **formaciones** (órdenes en grupo, bono de armas combinadas), **botín de guerra** y **descontento** en provincias
  ocupadas (revueltas si se descuida la guarnición).
- **Suministro**: la población, la industria y el ejército consumen alimentos, combustible, bienes y metal producidos por las
  provincias; la escasez penaliza (estabilidad, organización, industria) y la producción militar exige existencias. Mercado
  con precios según escasez e intercambio con otros países: el dinero por sí solo ya no basta.
- **Carrusel de noticias** tipo noticiero en la cabecera: decisiones pendientes y últimas noticias, con acceso directo a la
  pantalla correspondiente.

Tanda 2 (mapa, conquista, diplomacia agresiva e interfaz; módulos `engine/dipext.js`, `ui/art.js`, `ui/unitsheet.js`, `ui/drawer.js`, `ui/tabs.js`):

- **Mapa seleccionable al iniciar partida**: «Latinoamérica» (24 países) o «América del Sur» (12 países, viewBox centrado en
  Sudamérica, victoria con 6 países). En ambos hay **más provincias por país** (≈640 en Latinoamérica frente a 404; ≈433 en
  América del Sur frente a 221): los departamentos grandes se subdividen de forma determinista («Santa Cruz Norte/Sur»,
  «Cochabamba Oriental/Occidental»). Las partidas guardadas anteriores conservan su geometría original.
- **Ataque sorpresa**: ataque inmediato a un vecino sin declaración previa, con bono ×1,3, −9 de estabilidad y una fuerte
  penalización de reputación (−25 de relación con todos los demás países, −40 con los aliados y socios de bloque del atacado,
  −60 con la víctima); expulsión inmediata del bloque compartido.
- **Presión diplomática**: empeorar relaciones a propósito (incidente fronterizo −12, expulsar embajador −25, campaña hostil −18)
  para justificar guerras o aislar a un rival.
- **Capacidad del ejército** explícita y ampliable (80 + 10 por millón de habitantes + bases militares y fortalezas, × ley de
  reclutamiento y tecnología de reservas), visible en Ejército; frenos de suministro relajados (mercado 20→40 unidades por turno,
  reclutar exige 1 bien en lugar de 2).
- **Recompensas de conquista**: cada provincia conquistada da dinero (parte fija por edificios y capital + 6 % del tesoro del
  dueño) y, si tiene recurso, una requisa (25 % de sus reservas + 3 turnos de producción); la provincia pasa a producir para
  el conquistador. Vista previa del botín en el panel de provincia, registro de botín, textos flotantes en el mapa y avisos en el
  carrusel cuando una provincia vecina aliviaría una escasez.
- **Mapa**: iconos de recursos rediseñados (insignias hexagonales), carreteras, ferrocarriles, fortalezas y líneas defensivas
  dibujados sobre el mapa, animación de marcha de las unidades entre territorios y texto de botín al conquistar.
- **Ilustraciones dibujadas (SVG)** para edificios (4 niveles cada uno: el dibujo crece con el nivel), unidades, acciones y
  recursos; panel de provincia con tarjeta de detalle «nivel actual → siguiente»; **ficha de unidad** con imagen, estadísticas,
  tabla de terreno y bonos activos; **estimador de batalla** con tipo de unidad, terreno, logística y fortificaciones.
- **Interfaz**: hoja inferior del mapa compacta (estados compacta/media/completa, arrastrable, el mapa sigue siendo
  interactivo), selector de modo de mapa plegado, cajón lateral de ajustes rápidos, barra inferior fija y tiras de pestañas
  que no se mueven al cambiar de pestaña.

Estos sistemas funcionan solo en modo local (sin conexión). Con el servidor Python se muestra un aviso de que no están disponibles.

Tanda 3 (unidades, edificios y mapa limpio; módulos `engine/roster.js`, `engine/units.js`, `engine/aero.js`, `engine/provinces.js`, `ui/provpanel.js`, `ui/strike.js`):

- **Catálogo de 24 unidades** (infantería, blindados, artillería, aviación, drones, marina, helicópteros) en `engine/roster.js`, cada una con
  vida, ataque, defensa, velocidad, coste, mantenimiento, ventajas/desventajas contra otros tipos, mejoras investigables, icono y requisitos de
  edificios. Las partidas anteriores migran los tipos antiguos (motorizada→mecanizada, blindado→tanque ligero, etc.).
- **Suelo por terreno** (bosque, montaña, llano) con modificadores por clase: infantería gana en bosque; mecanizados y blindados pierden;
  la artillería a distancia gana en montaña; los blindados ganan en llano y todas las unidades en movimiento ganan +1 de velocidad; la
  infantería recibe más daño en llano y la artillería solo defendiendo. Se muestran en el panel de provincia y en la ficha de unidad.
- **Edificios nuevos**: taller (nv 1-3) y fábrica (nv 4-6, exige la técnica «Fábricas»), aeropuerto (capacidad de aeronaves por nivel),
  puerto, avenida (solo bonifica al dueño), capital única (mover una destruye la anterior y baja la moral), laboratorio central
  (bloquea técnicas avanzadas en el árbol de investigación), fortaleza (5 niveles), ferrocarril («en carga»: no ataca ni defiende),
  hospital y radar (a una provincia de otro país como mínimo). Cola de producción por provincia con tiempo reducido por taller.
- **Aviación, drones, misiles y marina**: radio limitado desde la base, estado de «recarga» tras cada incursión, aeronaves perdidas si se
  pierde su base, drones de un solo uso (explorador, kamikaze, señuelo), radar que detecta y reduce el daño, curación en hospital, puerto y aeropuerto.
- **IA y balance**: la IA investiga con objetivos (hacia tanques medios/pesados, aviación, misiles y marina), construye laboratorio central, taller,
  aeropuerto y puerto, recluta por cuotas de composición y usa drones exploradores y señuelos en guerra; con tesoro por encima de una reserva
  gasta en obras extra. El botín de provincia saca un 3 % del tesoro del perdedor (techo de 60 → 600 M) y limita la requisa de recursos.
  La investigación base sube a 0,24 puntos por turno. Seleccion de ojivas (convencional/química/nuclear con confirmación) en los ataques.
- **Mapa limpio**: relleno plano por país sin relieve, ruido ni líneas discontinuas; tropas ocultas en Recursos y visibles en Político y Guerra;
  modo Político: verde = paz o tratados, azul = coalición o aliados, gris = neutros, rojo = enemigos, dorado = el jugador.
- **Aspecto**: paleta oliva/caqui/latón con camuflaje vectorial, ilustraciones nuevas de edificios y unidades.
- **Cabecera**: contadores con icono en formato compacto (999, 10k, 1,5M, 1B) con la cifra exacta al tocar; las noticias van arriba y
  «Por mi cuenta» pasa a la barra inferior (siete botones) con insignia de pendientes.
