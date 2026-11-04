# Frente Continental — contexto para Claude

Juego de estrategia (APK Android). Usuario hispanohablante: responder en español.

## Flujo de trabajo
- Desarrollo en la sesión de la nube (claude.ai/code) sobre este repo privado `julisan12/frente-continental`.
- La PC local solo se usa para probar (`git pull` + servidor local). El teléfono, con el APK de CI.
- Hay 3 tandas de cambios para el APK; el usuario las entrega una por una. Usar Opus y Fable con subagentes.
- Commits en `main` (o rama + PR). Cada push dispara CI y genera el APK.

## Estructura
- `backend/` — Python FastAPI, motor original en `backend/app/engine/`. Pruebas: `cd backend && python -m pytest -q`.
- `frontend/` — ES modules vanilla; port JS del motor en `frontend/js/engine/`.
  Probar en PC: `cd frontend && python -m http.server 5500` → `http://localhost:5500/?local=1`.
- `mobile/` — Capacitor 6.1.2, appId `com.frentecontinental.juego`, webDir `../frontend`, compileSdk 34, JDK 21.
- `tools/parity.mjs` (+ `parity.py`) — compara motor Python vs JS turno a turno: `node tools/parity.mjs`.

## CI (`.github/workflows/apk.yml`)
- Job `tests`: pytest + paridad (paridad con `continue-on-error`).
- Job `apk`: `npm ci` → `npx cap sync android` → `./gradlew assembleDebug`. Usa el Android SDK preinstalado del runner (no usar `android-actions/setup-android`, falla).
- Artefacto: `FrenteContinental-<run>-<sha>` (30 días). Descarga: `gh run download <id> -R julisan12/frente-continental`.

## Pendientes conocidos
- Paridad: 3 de 18 partidas divergen por punto flotante en `stability` (p. ej. 49.88 vs 49.879999999999995). Corregir el redondeo en JS para igualar Python y volver la paridad bloqueante.
- Avisos de CI: acciones en Node 20 y `setup-java@v4` deprecados; actualizar a versiones nuevas.

## Reglas
- No subir secretos, keystores, APKs ni `backend/saves/*.json` (ver `.gitignore`).
- Git: finales de línea LF (`.gitattributes`).
