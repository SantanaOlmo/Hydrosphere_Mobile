/**
 * Cliente HTTP SoftAP SPHERE (diagnostics + session + acciones Fase 2 previstas).
 * Base: http://192.168.4.1 — requiere estar en el SoftAP de la esfera.
 */
(function (global) {
  const DEFAULTS = {
    baseUrl: "http://192.168.4.1",
    centralKey: "HYDRO_CENTRAL_DEV_KEY_CHANGE_ME",
    timeoutMs: 4500,
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

      // APK: HTTP nativo (no depende de CORS del WebView)
      try {
        const native =
          window.Capacitor &&
          typeof window.Capacitor.isNativePlatform === "function" &&
          window.Capacitor.isNativePlatform();
        const Http = window.Capacitor && (window.Capacitor.Plugins || {}).CapacitorHttp;
        if (native && Http && typeof Http.request === "function") {
          const res = await Http.request({
            url,
            method: "GET",
            connectTimeout: this.config.timeoutMs,
            readTimeout: this.config.timeoutMs,
            headers: { Accept: "application/json" },
          });
          const status = res.status || 0;
          return {
            ok: status > 0 && status < 500,
            status,
            native: true,
          };
        }
      } catch (err) {
        return { ok: false, error: String(err && err.message ? err.message : err), native: true };
      }

      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), this.config.timeoutMs);
      try {
        const res = await fetch(url, {
          method: "GET",
          signal: ctrl.signal,
          cache: "no-store",
          mode: "cors",
        });
        clearTimeout(t);
        return { ok: res.ok || res.status === 401 || res.status === 403, status: res.status };
      } catch (err) {
        clearTimeout(t);
        try {
          const ctrl2 = new AbortController();
          const t2 = setTimeout(() => ctrl2.abort(), 2500);
          await fetch(url, { method: "GET", mode: "no-cors", signal: ctrl2.signal, cache: "no-store" });
          clearTimeout(t2);
          return { ok: true, opaque: true };
        } catch {
          return { ok: false, error: String(err && err.message ? err.message : err) };
        }
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

    /**
     * Acciones Fase 2 (previstas). Si el firmware aún responde 404/405,
     * se reporta claramente. En demo se simulan.
     */
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
        // Compat: algunos stacks pueden usar rutas distintas
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

    async _request(method, path, opts = {}) {
      const { headers = {}, body, auth = true } = opts;
      const url = `${this.config.baseUrl.replace(/\/$/, "")}${path}`;
      const h = {
        Accept: "application/json",
        ...headers,
      };
      if (body !== undefined) h["Content-Type"] = "application/json";
      if (auth && this.token) h["X-Hydro-Token"] = this.token;

      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), this.config.timeoutMs);
      let res;
      try {
        res = await fetch(url, {
          method,
          headers: h,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: ctrl.signal,
          cache: "no-store",
          mode: "cors",
        });
      } catch (err) {
        clearTimeout(t);
        throw new Error(`Sin respuesta de la esfera (${err.message || "red"})`);
      }
      clearTimeout(t);

      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { raw: text };
      }

      if (!res.ok) {
        const code = data && data.error && data.error.code;
        const msg =
          (data && data.error && data.error.message) ||
          data?.message ||
          `${res.status} ${res.statusText}`;
        const e = new Error(msg);
        e.status = res.status;
        e.code = code;
        e.payload = data;
        if (res.status === 401 || res.status === 403) {
          this.token = null;
          sessionStorage.removeItem("hs_mobile_token");
        }
        throw e;
      }
      return data;
    }
  }

  global.HydrosphereSphereApi = SphereApi;
  global.HydrosphereSphereConfig = { loadConfig, saveConfig, DEFAULTS };
})(window);
