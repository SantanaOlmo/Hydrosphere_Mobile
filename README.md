# Hydrosphere Mobile

Consola de mantenimiento SoftAP (`http://192.168.4.1`).

| Canal | SoftAP HTTP |
|-------|-------------|
| **APK Android (Capacitor)** | Sí |
| `http://192.168.4.1/` (firmware) | Sí |
| GitHub Pages / PWA HTTPS | No (mixed content) |

App de escritorio: [`Hydrosphere`](https://github.com/ennde3d/Hydrosphere).

## App Android (recomendado en campo)

Guía completa: [`docs/android_capacitor.md`](docs/android_capacitor.md)

### Probar ya

1. Instala Android Studio + JDK 17+ (o descarga el APK del [último workflow/release](https://github.com/SantanaOlmo/Hydrosphere_Mobile/actions)).
2. En este repo:

```powershell
cd C:\Users\alber\Desktop\A2DesarrolloWeb\Hydrosphere_Mobile
npm install
npm run build:apk:debug
npm run copy:apk:debug
adb install -r releases\hydrosphere-mobile-0.3.0-debug.apk
```

3. Móvil → Wi‑Fi `ESP32_C6` / `12345678`
4. Abre **Hydrosphere** → Comprobar conexión

### Actualizar tras cambios de UI

```powershell
# edita index.html / css / js / version.json
npm run build:apk:debug
npm run copy:apk:debug
adb install -r releases\hydrosphere-mobile-<version>-debug.apk
```

O: `npm run cap:sync` y Run ▶ en Android Studio.

## Web (GitHub Pages)

- URL: https://santanaolmo.github.io/Hydrosphere_Mobile/
- Sirve para ver la UI / descargar APK; **no** opera SoftAP desde HTTPS.
- En campo sin APK: abre `http://192.168.4.1/` en el navegador (SoftAP).

## Contrato API

`sphere-diagnostics-http/1` — Fase 1 GET + Fase 2 POST (`PING_*`, recovers…).

Defaults lab: base `http://192.168.4.1`, SSID `ESP32_C6`, key `HYDRO_CENTRAL_DEV_KEY_CHANGE_ME`.

## Desarrollo web local

```bash
npx --yes serve .
```

## Relación con repos

| Repo | Rol |
|------|-----|
| **Hydrosphere** | App escritorio |
| **Hydrosphere_Firmware** | SoftAP + HTTP en la esfera |
| **Hydrosphere_Mobile** (este) | UI móvil + APK Capacitor + Pages |
