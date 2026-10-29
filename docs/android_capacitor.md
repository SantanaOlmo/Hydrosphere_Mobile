# Hydrosphere Mobile — Android (Capacitor)

La app nativa Android puede llamar a `http://192.168.4.1` (SoftAP) porque:

- `CapacitorHttp` intercepta `fetch` (evita CORS del WebView)
- `usesCleartextTraffic` + `network_security_config` permiten HTTP
- `androidScheme: http` evita mixed content HTTPS→HTTP

La web en GitHub Pages **sigue sin poder** hablar con SoftAP; el APK sí.

## Requisitos en el PC

1. **JDK 17+** (Android Gradle actual; Java 8 no basta)
2. **Android Studio** (incluye SDK + platform-tools)
3. Variable `ANDROID_HOME` o `ANDROID_SDK_ROOT` apuntando al SDK  
   típico: `%LOCALAPPDATA%\Android\Sdk`
4. Node.js 18+ (ya usado en este repo)

## Primera vez

```powershell
cd C:\Users\alber\Desktop\A2DesarrolloWeb\Hydrosphere_Mobile
npm install
npm run cap:sync
npm run cap:open
```

En Android Studio:

1. Espera el sync de Gradle
2. Conecta el móvil con USB debugging **o** usa un emulador
3. Run ▶ (app `com.hydrosphere.mobile`)

## Generar APK debug (instalable)

```powershell
npm run build:apk:debug
npm run copy:apk:debug
```

Salida: `releases/hydrosphere-mobile-X.Y.Z-debug.apk`

Instalar en el móvil:

```powershell
adb install -r releases\hydrosphere-mobile-0.3.0-debug.apk
```

O copia el APK al teléfono y ábrelo (permitir orígenes desconocidos).

## Probar con SoftAP

1. Instala el APK
2. Wi‑Fi del móvil → `ESP32_C6` / `12345678`
3. Abre **Hydrosphere**
4. **Comprobar conexión** → debe abrir sesión (sin aviso HTTPS→HTTP)
5. Consola / Ping start

## Actualizar la app (ciclo de desarrollo)

1. Edita HTML/CSS/JS en la raíz del repo (no en `www/`)
2. Sube `version.json` (`version`, `notes`, ruta APK si cambia)
3. Regenera e instala:

```powershell
npm run build:apk:debug
npm run copy:apk:debug
adb install -r releases\hydrosphere-mobile-<version>-debug.apk
```

O desde Android Studio: `npm run cap:sync` y Run ▶

## Release firmado (opcional)

Para Play Store / APK firmado hace falta un keystore y `assembleRelease`.  
Para lab, el APK **debug** basta.

## Relación con la web

| Canal | SoftAP HTTP |
|-------|-------------|
| APK Capacitor | Sí |
| `http://192.168.4.1/` firmware | Sí |
| GitHub Pages / PWA HTTPS | No |
