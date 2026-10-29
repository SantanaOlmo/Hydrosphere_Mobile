# Consola de diagnóstico (resumen)

Documento de origen: `API SPHERE.docx` (compañero) — contrato `sphere-diagnostics-http/1`.

## Prefijo

`/api/v1/diagnostics` — auth `X-Hydro-Token` (sesión vía `POST /api/v1/session/open`).

## Fase 1 — solo GET

- `GET /api/v1/diagnostics`
- `GET /api/v1/diagnostics/sd`
- `GET /api/v1/diagnostics/wifi`
- `GET /api/v1/diagnostics/mission`
- `GET /api/v1/diagnostics/reset`
- `GET /api/v1/diagnostics/imu`
- `GET /api/v1/diagnostics/ping` (estado; **no** emite tono)

## Fase 2 — acciones (UI lista; firmware pendiente)

Previstas en esta PWA:

| Acción UI | Método previsto |
|-----------|-----------------|
| PING_ONCE | `POST …/ping/once` |
| PING_START | `POST …/ping/start` |
| PING_STOP | `POST …/ping/stop` |
| SD_RECOVER | `POST …/sd/recover` |
| WIFI_RECOVER | `POST …/wifi/recover` |
| IMU_RETRY | `POST …/imu/retry` |

Hoy en hardware, `PING_START` / `PING_STOP` / `PING_ONCE` existen por **UART**, no por HTTP.

## SoftAP

- URL: `http://192.168.4.1`
- SSID lab: `ESP32_C6`
