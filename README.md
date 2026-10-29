# Hydrosphere Mobile

Repo **público de distribución** de la consola móvil de mantenimiento de la esfera (SoftAP / `http://192.168.4.1`).

La app de escritorio privada sigue en [`Hydrosphere`](https://github.com/ennde3d/Hydrosphere). Este repo sirve para:

1. Entrar a la **web / PWA** de diagnóstico.
2. Pedir conexión a la **Wi‑Fi SoftAP** de la esfera antes de operar.
3. **Descargar / instalar** la app en el móvil.
4. Recibir **avisos de nuevas versiones** (banner + GitHub Releases).

## Flujo en campo

1. Con internet: abre la GitHub Page e **instala la PWA** (caché / actualizaciones).
2. En campo: conecta el móvil al SoftAP `ESP32_C6` (pass de lab `12345678`).
3. **Abre la consola en la esfera:** `http://192.168.4.1/` (navegador o enlace desde la PWA).
4. Pulsa acciones (p. ej. **Ping start**) para que la esfera emita el tono acústico.

### Limitación importante (mixed content)

La web en `https://santanaolmo.github.io/...` **no puede** hacer `fetch` a `http://192.168.4.1` aunque el Wi‑Fi SoftAP esté conectado. El navegador bloquea HTTPS→HTTP. CORS en firmware **no** lo soluciona.

| Origen | ¿Habla con SoftAP? |
|--------|--------------------|
| `http://192.168.4.1/` (UI embebida) | Sí (same-origin) |
| GitHub Pages / PWA instalada desde Pages | No (mixed content) |
| Demo local `http://localhost` | Sí a SoftAP HTTP (si hay CORS o same machine quirks) |

La PWA de distribución sirve para **instalar/actualizar**; la operación SoftAP es en la UI HTTP de la esfera.

## Desarrollo local

Sirve la carpeta por HTTP (el SoftAP y el service worker no funcionan bien con `file://`):

```bash
npx --yes serve .
# o: python -m http.server 8080
```

Abre `http://localhost:8080`. La consola es la UI por defecto (nav inferior). El modo demo solo está en **Más → Laboratorio** (oculto si la PWA ya está instalada).

En **web móvil** (navegador, no instalada) aparece un **FAB circular** abajo a la derecha para instalar.

## Contrato API

Basado en el documento *API SPHERE* (`sphere-diagnostics-http/1`):

| Fase | Qué hay |
|------|---------|
| **1** | Solo `GET /api/v1/diagnostics…` (lectura) |
| **2** | POSTs seguros: `PING_*`, `SD_RECOVER`, `WIFI_RECOVER`, … |
| **4** | OTA (fuera de alcance ahora) |

La UI incluye botones de Fase 2; el firmware en `feat/sphere-diagnostics-http` ya expone los POST de ping/recover. Iconos y colores alineados a la app de escritorio Hydrosphere (`assets/icons` copiados desde allí).

Defaults SoftAP de producto (lab):

- Base URL: `http://192.168.4.1`
- SSID: `ESP32_C6`
- Key sesión: `HYDRO_CENTRAL_DEV_KEY_CHANGE_ME`

## Publicar la web (GitHub Pages)

1. Settings → Pages → Source: **GitHub Actions** (workflow incluido).
2. Tras el push a `main`, la web queda en:
   `https://santanaolmo.github.io/Hydrosphere_Mobile/`

## Nuevas versiones

1. Sube `version.json` (`version`, `notes`, opcional `downloads.android_apk`).
2. Crea un GitHub Release (`vX.Y.Z`) y adjunta el APK en Assets.
3. La PWA consulta `version.json` + la API de Releases y muestra el banner.

## Iconos

Los SVG de UI están en `assets/icons/` (copiados del set de diseño del equipo).

## Relación con Hydrosphere / Firmware

| Repo | Rol |
|------|-----|
| **Hydrosphere** | App escritorio privada (PySide) |
| **Hydrosphere_Firmware** | SoftAP + HTTP en la esfera + Dev UI embebida |
| **Hydrosphere_Mobile** (este) | Distribución pública + consola móvil |
