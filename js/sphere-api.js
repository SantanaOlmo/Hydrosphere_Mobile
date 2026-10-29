/**
 * Cliente HTTP SoftAP SPHERE (diagnostics + session + acciones).
 * Base: http://192.168.4.1 — requiere STA en SoftAP; en Android preferir datos móviles OFF.
 * En Capacitor usa CapacitorHttp (nativo) para todo el tráfico SoftAP.
 */
(function (global) {
  const DEFAULTS = {
    baseUrl: "http://192.168.4.1",
    centralKey: "HYDRO_CENTRAL_DEV_KEY_CHANGE_ME",
    timeoutMs: 8000,
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
        allowed_actions: [
          "SD_RECOVER",
          "WIFI_RECOVER",
          "IMU_RETRY",
          "PING_ONCE",
          "PING_START",
          "PING_STOP",
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

    async probe() {
      if (this.demo) return { ok: true, demo: true };
      const url = `${this.config.baseUrl.replace(/\/$/, "")}/api/v1/status`;
      try {
        const { status, data } = await this._http("GET", url, {
          headers: { Accept: "application/json" },
          auth: false,
          expectJson: true,
        });
        const body = parseBody(data);
        const sphere = looksLikeSphereStatus(body);
        const ok = status === 200 && sphere;
        return {
          ok,
          status,
          sphere,
          native: isNative(),
          body,
          hint: !ok
            ? status === 0 || !status
              ? "unreachable"
              : sphere
                ? "bad_status"
                : "not_sphere"
            : null,
        };
      } catch (err) {
        return {
          ok: false,
          error: String(err && err.message ? err.message : err),
          native: isNative(),
          hint: "unreachable",
        };
      }
    }

    async openSession() {
      if (this.demo) {
        this.token = "demo-token";
        sessionStorage.setItem("hs_mobile_token", this.token);
        return { token: this.token };
      }
      const body = await this._request("POST", "/api/v1/session/open", {
        headers: { "X-Hydro-Central-Key": this.config.centralKey },
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
      return this._request("GET", "/api/v1/diagnostics");
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
      return this._request("GET", "/api/v1/diagnostics/wifi");
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
      const map = {
        PING_ONCE: { method: "POST", path: "/api/v1/diagnostics/ping/once" },
        PING_START: { method: "POST", path: "/api/v1/diagnostics/ping/start" },
        PING_STOP: { method: "POST", path: "/api/v1/diagnostics/ping/stop" },
        SD_RECOVER: { method: "POST", path: "/api/v1/diagnostics/sd/recover" },
        WIFI_RECOVER: { method: "POST", path: "/api/v1/diagnostics/wifi/recover" },
        IMU_RETRY: { method: "POST", path: "/api/v1/diagnostics/imu/retry" },
        MISSION_CLEAR_ERROR: { method: "POST", path: "/api/v1/diagnostics/mission/clear_error" },
      };
      const spec = map[action];
      if (!spec) throw new Error(`Acción desconocida: ${action}`);

      if (this.demo) {
        return this._demoAction(action);
      }

      await this.ensureSession();
      try {
        return await this._request(spec.method, spec.path, { body: {} });
      } catch (err) {
        if (/404|405|Method Not Allowed|Not Found/i.test(String(err.message))) {
          const err2 = new Error(
            `${action}: el firmware aún no expone esta acción HTTP (Fase 2). Disponible por UART hoy.`
          );
          err2.code = "PHASE2_PENDING";
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
        return { ok: true, action, demo: true, message: "SD recuperada (demo)" };
      }
      if (action === "WIFI_RECOVER") {
        return {
          ok: true,
          action,
          demo: true,
          message: "Wi‑Fi recover aceptado (demo). En hardware real la app debe reconectar.",
        };
      }
      if (action === "IMU_RETRY") {
        s.imu_ready = true;
        return { ok: true, action, demo: true, message: "IMU reintentado (demo)" };
      }
      return { ok: true, action, demo: true };
    }

    async _http(method, url, opts = {}) {
      const { headers = {}, body, auth = true } = opts;
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
          connectTimeout: this.config.timeoutMs,
          readTimeout: this.config.timeoutMs,
        });
        return { status: res.status || 0, data: res.data };
      }

      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), this.config.timeoutMs);
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
        const msg =
          (data && data.error && data.error.message) ||
          data?.message ||
          (typeof data?.raw === "string" ? data.raw.slice(0, 120) : null) ||
          `${status || 0} error`;
        const e = new Error(msg);
        e.status = status;
        e.code = code;
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
