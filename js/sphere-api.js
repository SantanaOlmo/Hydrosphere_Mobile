/**
 * Cliente HTTP SoftAP SPHERE (diagnostics + session + acciones).
 * Base: http://192.168.4.1 — requiere STA en SoftAP; en Android preferir datos móviles OFF.
 * En Capacitor usa CapacitorHttp (nativo) para todo el tráfico SoftAP.
 */
(function (global) {
  const DEFAULTS = {
    baseUrl: "http://192.168.4.1",
    // Sin clave embebida: el técnico la configura en Más → Ajustes.
    centralKey: "",
    timeoutMs: 8000,
  };

  const Diag =
    global.HydrosphereDiagContract ||
    {
      ACTION_PATHS: {},
      isSupportedAction: () => false,
      actionTimeoutMs: () => 8000,
      formatDiagError: (e) => (e && e.message) || "Error",
    };

  function loadConfig() {
    try {
      const raw = localStorage.getItem("hs_mobile_config");
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function saveConfig(partial) {
    const next = { ...loadConfig(), ...partial };
    localStorage.setItem("hs_mobile_config", JSON.stringify(next));
    return next;
  }

  function isNative() {
    try {
      return !!(
        global.Capacitor &&
        typeof global.Capacitor.isNativePlatform === "function" &&
        global.Capacitor.isNativePlatform()
      );
    } catch {
      return false;
    }
  }

  function nativeHttp() {
    try {
      return (global.Capacitor && (global.Capacitor.Plugins || {}).CapacitorHttp) || null;
    } catch {
      return null;
    }
  }

  function parseBody(data) {
    if (data == null || data === "") return null;
    if (typeof data === "object") return data;
    try {
      return JSON.parse(String(data));
    } catch {
      return { raw: String(data) };
    }
  }

  /** Respuesta real de SoftAP SPHERE en /api/v1/status */
  function looksLikeSphereStatus(data) {
    if (!data || typeof data !== "object") return false;
    return (
      Object.prototype.hasOwnProperty.call(data, "active") ||
      Object.prototype.hasOwnProperty.call(data, "download_api") ||
      data.api_prefix === "/api/v1" ||
      typeof data.state === "string"
    );
  }

  class SphereApi {
    constructor() {
      this.config = loadConfig();
      this.token = sessionStorage.getItem("hs_mobile_token") || null;
      this.demo = false;
      /** @type {'diagnostics'|'legacy'|null} */
      this.apiFlavor = null;
      this._demoState = this._freshDemo();
    }

    _freshDemo() {
      return {
        sphere_id: "AA:BB:CC:DD:EE:FF",
        boot_id: "demo-boot-0001",
        operation_mode: "SERVING_FILES",
        fsm_state: "DOCKED_IDLE",
        mission_public_state: "IDLE",
        recording: false,
        file_serving: true,
        armed: false,
        charging_state: "PRESENT",
        session_name: null,
        sd: { mounted: true, health: "HEALTHY", write_ok: true, status: "OK" },
        wifi: {
          started: true,
          http_active: true,
          sta_count: 1,
          ip: "192.168.4.1",
          channel_primary: 6,
          status: "UP",
        },
        ping: { state: "IDLE", periodic_active: false, sequence: 0 },
        reset: { reason: "POWERON", reason_code: 1 },
        imu_ready: true,
        capabilities: {
          phase: "RECOVERY",
          recovery_actions: true,
          ota: false,
        },
        allowed_actions: [
          "PING_ONCE",
          "PING_START",
          "PING_STOP",
          "IMU_RETRY",
          "MISSION_CLEAR_ERROR",
          "SD_RECOVER",
        ],
        files: [
          { name: "mission_001/imu.csv", size: 482112, mtime: "2026-10-28T18:02:11Z" },
          { name: "mission_001/meta.json", size: 2048, mtime: "2026-10-28T18:02:12Z" },
          { name: "logs/boot.log", size: 8192, mtime: "2026-10-29T09:11:00Z" },
        ],
      };
    }

    setDemo(on) {
      this.demo = !!on;
      if (on) this._demoState = this._freshDemo();
    }

    reloadConfig() {
      this.config = loadConfig();
    }

    async probe(opts = {}) {
      if (this.demo) return { ok: true, demo: true };
      const attempts = Math.max(1, opts.attempts || 3);
      const url = `${this.config.baseUrl.replace(/\/$/, "")}/api/v1/status`;
      const started = Date.now();
      let last = null;

      for (let i = 0; i < attempts; i++) {
        try {
          const { status, data } = await this._http("GET", url, {
            headers: { Accept: "application/json" },
            auth: false,
            expectJson: true,
          });
          const body = parseBody(data);
          const sphere = looksLikeSphereStatus(body);
          const ok = status === 200 && sphere;
          last = {
            ok,
            status,
            sphere,
            native: isNative(),
            body,
            attempt: i + 1,
            attempts,
            elapsedMs: Date.now() - started,
            hint: !ok
              ? status === 0 || !status
                ? "unreachable"
                : sphere
                  ? "bad_status"
                  : "not_sphere"
              : null,
          };
          if (ok) return last;
        } catch (err) {
          last = {
            ok: false,
            error: String(err && err.message ? err.message : err),
            native: isNative(),
            attempt: i + 1,
            attempts,
            elapsedMs: Date.now() - started,
            hint: "unreachable",
          };
        }
        if (i < attempts - 1) {
          await new Promise((r) => setTimeout(r, 700));
        }
      }
      return last || { ok: false, hint: "unreachable", elapsedMs: Date.now() - started };
    }

    async openSession() {
      if (this.demo) {
        this.token = "demo-token";
        sessionStorage.setItem("hs_mobile_token", this.token);
        return { token: this.token };
      }
      const key = String(this.config.centralKey || "").trim();
      if (!key) {
        throw new Error(
          "Falta la central key. Configúrala en Más → Ajustes SoftAP."
        );
      }
      const body = await this._request("POST", "/api/v1/session/open", {
        headers: { "X-Hydro-Central-Key": key },
        auth: false,
      });
      const token = body.token || body.session_token || body.download_token;
      if (!token) throw new Error("La esfera no devolvió token de sesión");
      this.token = token;
      sessionStorage.setItem("hs_mobile_token", token);
      return body;
    }

    async ensureSession() {
      if (this.token) return this.token;
      await this.openSession();
      return this.token;
    }

    clearSession() {
      this.token = null;
      sessionStorage.removeItem("hs_mobile_token");
    }

    async getDiagnostics() {
      if (this.demo) {
        this.apiFlavor = "diagnostics";
        const s = this._demoState;
        return {
          api_version: "1",
          protocol_version: "sphere-diagnostics-http/1",
          sphere_id: s.sphere_id,
          boot_id: s.boot_id,
          esp_timer_us: Date.now() % 1e9,
          captured_at_us: Date.now() % 1e9,
          capabilities: { phase: "RECOVERY", recovery_actions: true, ota: false },
          operation_mode: s.operation_mode,
          fsm_state: s.fsm_state,
          mission_public_state: s.mission_public_state,
          recording: s.recording,
          file_serving: s.file_serving,
          armed: s.armed,
          charging_state: s.charging_state,
          session_name: s.session_name,
          sd: s.sd,
          wifi: { started: s.wifi.started, http_active: s.wifi.http_active, sta_count: s.wifi.sta_count },
          ping: s.ping,
          reset: s.reset,
          imu_ready: s.imu_ready,
          allowed_actions: s.allowed_actions,
        };
      }
      await this.ensureSession();
      try {
        const snap = await this._request("GET", "/api/v1/diagnostics");
        this.apiFlavor = "diagnostics";
        return snap;
      } catch (err) {
        // Firmware lab (Dev UI / Hydrosphere_Project): no hay /diagnostics.
        if (this._isMissingRoute(err)) {
          this.apiFlavor = "legacy";
          return this._legacyDiagnosticsSnapshot();
        }
        throw err;
      }
    }

    _isMissingRoute(err) {
      const msg = String((err && err.message) || err || "");
      const status = err && err.status;
      return (
        status === 404 ||
        /Nothing matches the given URI/i.test(msg) ||
        /Not Found/i.test(msg)
      );
    }

    /**
     * Snapshot compatible con la Dev UI lab (mission/status + identity).
     */
    async _legacyDiagnosticsSnapshot() {
      let identity = {};
      let missionWrap = {};
      try {
        identity = await this._request("GET", "/api/v1/identity", { auth: false });
      } catch {
        /* optional */
      }
      try {
        missionWrap = await this._request("GET", "/api/v1/mission/status");
      } catch (err) {
        if (!this._isMissingRoute(err)) throw err;
      }
      const miss = (missionWrap && missionWrap.mission) || missionWrap || {};
      return {
        api_version: "1",
        protocol_version: "sphere-legacy-http",
        sphere_id: identity.sphere_id || missionWrap.sphere_id || "?",
        boot_id: identity.boot_id || "legacy",
        capabilities: { phase: "LEGACY", recovery_actions: false, ota: false },
        operation_mode: miss.state || missionWrap.operation_mode || "UNKNOWN",
        fsm_state: miss.state || "—",
        mission_public_state: miss.state || "—",
        recording: !!miss.recorder_active,
        file_serving: !!miss.ready_to_download || !!miss.wifi_http_active,
        armed: !!miss.armed,
        charging_state: miss.charging_state || "—",
        session_name: miss.mission_id || null,
        sd: {
          mounted: null,
          health: "UNKNOWN",
          write_ok: null,
          status: "LEGACY",
        },
        wifi: {
          started: true,
          http_active: miss.wifi_http_active !== false,
          sta_count: null,
        },
        ping: { state: "IDLE", periodic_active: false, sequence: 0 },
        reset: { reason: "—", reason_code: 0 },
        imu_ready: null,
        allowed_actions: ["PING_ONCE"],
        _legacy: true,
      };
    }

    async getWifi() {
      if (this.demo) {
        return {
          api_version: "1",
          protocol_version: "sphere-diagnostics-http/1",
          ...this._demoState.wifi,
          initialized: true,
          mode: "AP",
          channel_secondary: "NONE",
          bandwidth: "HT20",
          netif_up: true,
          netmask: "255.255.255.0",
          gateway: "192.168.4.1",
          ssid_hidden: false,
          ssid_len: 8,
          authmode: "WPA2_PSK",
          max_connection: 4,
          beacon_interval: 100,
          ps: "NONE",
          ap_start_count: 1,
          ap_stop_count: 0,
        };
      }
      await this.ensureSession();
      if (this.apiFlavor === "legacy") {
        return {
          api_version: "1",
          protocol_version: "sphere-legacy-http",
          status: "UP",
          mode: "AP",
          ip: "192.168.4.1",
          gateway: "192.168.4.1",
          netif_up: true,
          initialized: true,
          _legacy: true,
        };
      }
      try {
        return await this._request("GET", "/api/v1/diagnostics/wifi");
      } catch (err) {
        if (this._isMissingRoute(err)) {
          this.apiFlavor = "legacy";
          return {
            api_version: "1",
            status: "UP",
            mode: "AP",
            ip: "192.168.4.1",
            _legacy: true,
          };
        }
        throw err;
      }
    }

    async getPing() {
      if (this.demo) {
        return {
          available: true,
          status: "OK",
          recording_blocks_emit: false,
          ...this._demoState.ping,
        };
      }
      await this.ensureSession();
      return this._request("GET", "/api/v1/diagnostics/ping");
    }

    async listFiles() {
      if (this.demo) return { files: this._demoState.files };
      await this.ensureSession();
      return this._request("GET", "/api/v1/files");
    }

    async runAction(action) {
      if (action === "WIFI_RECOVER") {
        const err = new Error(
          "WIFI_RECOVER no está disponible por HTTP en este firmware (usar UART)."
        );
        err.code = "WIFI_RECOVER_HTTP_DISABLED";
        err.status = 404;
        throw err;
      }

      const path = Diag.ACTION_PATHS[action];
      if (!path || !Diag.isSupportedAction(action)) {
        throw new Error(`Acción desconocida o no soportada: ${action}`);
      }

      if (this.demo) {
        return this._demoAction(action);
      }

      await this.ensureSession();

      // Lab legacy: ping 1x en ruta distinta
      if (this.apiFlavor === "legacy" && action === "PING_ONCE") {
        try {
          return await this._request("POST", "/api/v1/diag/acoustic_ping_once", {
            body: {},
          });
        } catch (err) {
          if (this._isMissingRoute(err)) {
            throw new Error("Ping diag no disponible en este firmware.");
          }
          throw err;
        }
      }

      const timeoutMs = Diag.actionTimeoutMs(action);
      try {
        return await this._request("POST", path, { body: {}, timeoutMs });
      } catch (err) {
        // 409/503 del contrato d8ed914: no confundir con ruta ausente.
        if (err && (err.status === 409 || err.status === 503)) {
          err.message = Diag.formatDiagError(err);
          throw err;
        }
        if (err && (err.status === 401 || err.status === 403)) {
          err.message = Diag.formatDiagError(err);
          throw err;
        }
        if (
          this._isMissingRoute(err) ||
          /405|Method Not Allowed/i.test(String(err.message))
        ) {
          const err2 = new Error(
            `${action}: ruta no disponible en este firmware (¿falta flashear diagnostics HTTP?).`
          );
          err2.code = "PHASE2_PENDING";
          err2.status = err.status;
          throw err2;
        }
        throw err;
      }
    }

    _demoAction(action) {
      const s = this._demoState;
      if (action === "PING_ONCE") {
        s.ping.state = "EMITTING";
        s.ping.sequence += 1;
        setTimeout(() => {
          s.ping.state = "IDLE";
        }, 400);
        return { ok: true, action, demo: true, message: "Ping acústico (demo)" };
      }
      if (action === "PING_START") {
        s.ping.periodic_active = true;
        s.ping.state = "EMITTING";
        return { ok: true, action, demo: true, message: "Ping periódico iniciado (demo)" };
      }
      if (action === "PING_STOP") {
        s.ping.periodic_active = false;
        s.ping.state = "IDLE";
        return { ok: true, action, demo: true, message: "Ping detenido (demo)" };
      }
      if (action === "SD_RECOVER") {
        s.sd = { mounted: true, health: "HEALTHY", write_ok: true, status: "OK" };
        return {
          api_version: "1",
          protocol_version: "sphere-diagnostics-http/1",
          action: "SD_RECOVER",
          accepted: true,
          result: "OK",
          message: "SD recuperada (demo, síncrono, SoftAP conservado)",
          job: null,
          demo: true,
        };
      }
      if (action === "IMU_RETRY") {
        s.imu_ready = true;
        return {
          api_version: "1",
          protocol_version: "sphere-diagnostics-http/1",
          action: "IMU_RETRY",
          accepted: true,
          result: "OK",
          message: "IMU reintentado (demo)",
          job: null,
          demo: true,
        };
      }
      if (action === "MISSION_CLEAR_ERROR") {
        s.fsm_state = "DOCKED_IDLE";
        s.mission_public_state = "IDLE";
        return {
          api_version: "1",
          protocol_version: "sphere-diagnostics-http/1",
          action: "MISSION_CLEAR_ERROR",
          accepted: true,
          result: "OK",
          message: "Error de misión limpiado (demo)",
          job: null,
          demo: true,
        };
      }
      return {
        api_version: "1",
        protocol_version: "sphere-diagnostics-http/1",
        action,
        accepted: true,
        result: "OK",
        message: `${action} OK (demo)`,
        job: null,
        demo: true,
      };
    }

    async _http(method, url, opts = {}) {
      const { headers = {}, body, auth = true, timeoutMs } = opts;
      const timeout =
        typeof timeoutMs === "number" && timeoutMs > 0
          ? timeoutMs
          : this.config.timeoutMs;
      const h = {
        Accept: "application/json",
        ...headers,
      };
      if (body !== undefined) h["Content-Type"] = "application/json";
      if (auth && this.token) h["X-Hydro-Token"] = this.token;

      const Http = nativeHttp();
      if (isNative() && Http && typeof Http.request === "function") {
        const res = await Http.request({
          url,
          method,
          headers: h,
          data: body !== undefined ? body : undefined,
          connectTimeout: timeout,
          readTimeout: timeout,
        });
        return { status: res.status || 0, data: res.data };
      }

      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeout);
      try {
        const res = await fetch(url, {
          method,
          headers: h,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: ctrl.signal,
          cache: "no-store",
          mode: "cors",
        });
        clearTimeout(t);
        const text = await res.text();
        return { status: res.status, data: text ? parseBody(text) : null };
      } catch (err) {
        clearTimeout(t);
        throw err;
      }
    }

    async _request(method, path, opts = {}) {
      const url = `${this.config.baseUrl.replace(/\/$/, "")}${path}`;
      let status;
      let data;
      try {
        const res = await this._http(method, url, opts);
        status = res.status;
        data = parseBody(res.data);
      } catch (err) {
        throw new Error(`Sin respuesta de la esfera (${err.message || "red"})`);
      }

      if (!status || status < 200 || status >= 300) {
        const code = data && data.error && data.error.code;
        const retryable =
          data && data.error && typeof data.error.retryable === "boolean"
            ? data.error.retryable
            : undefined;
        const msg =
          (data && data.error && data.error.message) ||
          data?.message ||
          (typeof data?.raw === "string" ? data.raw.slice(0, 120) : null) ||
          `${status || 0} error`;
        const e = new Error(msg);
        e.status = status;
        e.code = code;
        e.retryable = retryable;
        e.payload = data;
        if (status === 401 || status === 403) {
          this.clearSession();
        }
        throw e;
      }
      return data;
    }
  }

  global.HydrosphereSphereApi = SphereApi;
  global.HydrosphereSphereConfig = { loadConfig, saveConfig, DEFAULTS };
})(window);
