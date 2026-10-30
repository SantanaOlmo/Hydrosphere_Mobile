/**
 * Contrato Sphere diagnostics HTTP (handoff d8ed914 / sphere-diagnostics-http/1).
 * Helpers puros para UI y cliente; sin clave ni secretos.
 */
(function (global) {
  /** Acciones HTTP disponibles en d8ed914 (WIFI_RECOVER no existe por HTTP). */
  const SUPPORTED_ACTIONS = Object.freeze([
    "PING_ONCE",
    "PING_START",
    "PING_STOP",
    "IMU_RETRY",
    "MISSION_CLEAR_ERROR",
    "SD_RECOVER",
  ]);

  const ACTION_PATHS = Object.freeze({
    PING_ONCE: "/api/v1/diagnostics/ping/once",
    PING_START: "/api/v1/diagnostics/ping/start",
    PING_STOP: "/api/v1/diagnostics/ping/stop",
    IMU_RETRY: "/api/v1/diagnostics/imu/retry",
    MISSION_CLEAR_ERROR: "/api/v1/diagnostics/mission/clear_error",
    SD_RECOVER: "/api/v1/diagnostics/sd/recover",
  });

  const DEFAULT_TIMEOUT_MS = 8000;
  const SD_RECOVER_TIMEOUT_MS = 45000;

  function actionTimeoutMs(action) {
    return action === "SD_RECOVER" ? SD_RECOVER_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
  }

  function isSupportedAction(action) {
    return Object.prototype.hasOwnProperty.call(ACTION_PATHS, action);
  }

  /**
   * Preview UX: solo acciones en allowed_actions ∩ SUPPORTED.
   * allowed_actions es orientativo; el POST revalida en el dispositivo.
   */
  function isActionEnabled(action, allowedActions) {
    if (!isSupportedAction(action)) return false;
    const allowed = Array.isArray(allowedActions) ? allowedActions : [];
    return allowed.indexOf(action) >= 0;
  }

  function formatDiagError(err) {
    const status = err && err.status;
    const code = (err && err.code) || "";
    const base =
      (err && err.message) ||
      (status ? `HTTP ${status}` : "Error de la esfera");

    if (status === 401 || code === "AUTH_REQUIRED") {
      return "Sesión requerida. Abre de nuevo la sesión con la central key.";
    }
    if (status === 403 || code === "AUTH_INVALID") {
      return "Token inválido o caducado. Guarda la clave y vuelve a conectar.";
    }
    if (code === "DIAG_BUSY") {
      return base || "Acción rechazada: esfera ocupada (grabación/armado/actividad).";
    }
    if (code === "DIAG_REJECTED_STATE") {
      return base || "Acción no permitida en el estado actual de misión/carga.";
    }
    if (code === "DIAG_UNAVAILABLE") {
      return base || "Componente no disponible o recuperación fallida.";
    }
    if (code === "WIFI_RECOVER_HTTP_DISABLED") {
      return "WIFI_RECOVER no está disponible por HTTP en este firmware (usar UART).";
    }
    return base;
  }

  /** Simulación de envelope error firmware (tests / demo). */
  function simulateErrorEnvelope(httpStatus, code, message, retryable) {
    return {
      status: httpStatus,
      body: {
        error: {
          code: code,
          message: message,
          retryable: !!retryable,
          details: null,
        },
      },
    };
  }

  global.HydrosphereDiagContract = {
    SUPPORTED_ACTIONS,
    ACTION_PATHS,
    DEFAULT_TIMEOUT_MS,
    SD_RECOVER_TIMEOUT_MS,
    actionTimeoutMs,
    isSupportedAction,
    isActionEnabled,
    formatDiagError,
    simulateErrorEnvelope,
  };
})(typeof window !== "undefined" ? window : globalThis);
