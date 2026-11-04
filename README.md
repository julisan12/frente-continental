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

Estos sistemas funcionan solo en modo local (sin conexión). Con el servidor Python se muestra un aviso de que no están disponibles.
