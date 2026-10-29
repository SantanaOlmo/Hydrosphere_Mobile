(function () {
  const api = new HydrosphereSphereApi();
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const state = {
    connected: false,
    view: "gate",
    diag: null,
    wifi: null,
    files: [],
    pollTimer: null,
    deferredPrompt: null,
  };

  const ACTIONS = [
    {
      id: "PING_START",
      title: "Ping start",
      hint: "Pitar de forma periódica",
      icon: "assets/icons/actions/play.svg",
      hot: true,
    },
    {
      id: "PING_ONCE",
      title: "Ping once",
      hint: "Un solo tono acústico",
      icon: "assets/icons/actions/play.svg",
    },
    {
      id: "PING_STOP",
      title: "Ping stop",
      hint: "Detener emisión",
      icon: "assets/icons/actions/pause.svg",
    },
    {
      id: "SD_RECOVER",
      title: "Recuperar SD",
      hint: "Remount seguro (puede cortar Wi‑Fi)",
      icon: "assets/icons/files/project.svg",
    },
    {
      id: "WIFI_RECOVER",
      title: "Recuperar Wi‑Fi",
      hint: "Reinicia SoftAP + HTTP",
      icon: "assets/icons/actions/refresh.svg",
    },
    {
      id: "IMU_RETRY",
      title: "Reintentar IMU",
      hint: "Retry del sensor",
      icon: "assets/icons/actions/loop.svg",
    },
  ];

  function isNativeApp() {
    try {
      return !!(
        window.Capacitor &&
        typeof window.Capacitor.isNativePlatform === "function" &&
        window.Capacitor.isNativePlatform()
      );
    } catch {
      return false;
    }
  }

  function isStandalone() {
    return (
      isNativeApp() ||
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true ||
      document.referrer.includes("android-app://")
    );
  }

  function isMobileViewport() {
    return window.matchMedia("(max-width: 820px), (pointer: coarse)").matches;
  }

  /**
   * Solo bloquea GitHub Pages / PWA HTTPS en navegador.
   * En Capacitor (APK) CapacitorHttp + cleartext permiten SoftAP HTTP.
   */
  function isHttpsToHttpBlocked() {
    if (isNativeApp()) return false;
    const cfg = HydrosphereSphereConfig.loadConfig();
    const base = (cfg.baseUrl || "").trim().toLowerCase();
    return location.protocol === "https:" && base.startsWith("http:");
  }

  function applyMixedContentGate() {
    const blocked = isHttpsToHttpBlocked();
    const warn = $("#panel-mixed-content");
    const soft = $("#panel-softap-gate");
    if (warn) warn.classList.toggle("hidden", !blocked);
    if (soft) soft.classList.toggle("hidden", blocked);
    if (blocked) {
      setChip("offline", "HTTPS→HTTP");
    }
    return blocked;
  }

  function updateInstallFab() {
    const fab = $("#fab-install");
    if (!fab) return;
    // En APK nativo no tiene sentido instalar PWA.
    const show = !isNativeApp() && !isStandalone() && isMobileViewport();
    fab.classList.toggle("hidden", !show);
  }

  function toast(msg, isErr) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.toggle("err", !!isErr);
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 3200);
  }

  function setChip(mode, label) {
    $$("[data-conn-chip]").forEach((chip) => {
      chip.className = `status-chip ${mode}`;
      const lab = chip.querySelector(".label");
      if (lab) lab.textContent = label;
    });
  }

  function showView(name) {
    state.view = name;
    $$(".view").forEach((v) => v.classList.toggle("active", v.dataset.view === name));
    $$(".bottom-nav button").forEach((b) =>
      b.classList.toggle("active", b.dataset.nav === name)
    );
    if (name === "console" && state.connected) startPoll();
    else stopPoll();
    if (name === "files" && state.connected) refreshFiles();
    if (name === "more") fillMore();
  }

  function stopPoll() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function startPoll() {
    stopPoll();
    refreshConsole();
    state.pollTimer = setInterval(refreshConsole, 4000);
  }

  function toneClass(status) {
    const s = String(status || "").toUpperCase();
    if (["OK", "HEALTHY", "UP", "INFO", "IDLE", "PASS"].includes(s)) return "ok";
    if (["DEGRADED", "WARN", "RECOVERING", "COOLDOWN", "EMITTING"].includes(s)) return "warn";
    if (["ERROR", "DOWN", "FAIL", "UNAVAILABLE"].includes(s)) return "err";
    return "";
  }

  function metric(label, value, status) {
    return `<div class="metric ${toneClass(status)}"><span class="label">${label}</span><span class="value">${value ?? "—"}</span></div>`;
  }

  async function refreshConsole() {
    try {
      const [diag, wifi] = await Promise.all([api.getDiagnostics(), api.getWifi()]);
      state.diag = diag;
      state.wifi = wifi;
      renderConsole();
    } catch (err) {
      appendLog(`Error diagnóstico: ${err.message}`);
      if (!api.demo) {
        state.connected = false;
        setChip("offline", "Desconectado");
        showView("gate");
        toast("Se perdió la conexión con la esfera", true);
      }
    }
  }

  function renderConsole() {
    const d = state.diag;
    const w = state.wifi;
    if (!d) return;

    $("#diag-metrics").innerHTML = [
      metric("Esfera", d.sphere_id, "OK"),
      metric("FSM", d.fsm_state ?? "—", d.fsm_state?.includes?.("ERROR") ? "ERROR" : "OK"),
      metric("Modo", d.operation_mode, d.operation_mode === "ERROR" ? "ERROR" : "OK"),
      metric("Misión", d.mission_public_state ?? "—", d.mission_public_state),
      metric("SD", `${d.sd?.status || "—"} · montada ${d.sd?.mounted ? "sí" : "no"}`, d.sd?.status),
      metric("Wi‑Fi", w?.status || (d.wifi?.http_active ? "UP" : "DOWN"), w?.status),
      metric("Canal", w?.channel_primary ?? "—", "OK"),
      metric("Clientes", w?.sta_count ?? d.wifi?.sta_count ?? "—", "OK"),
      metric("Ping", `${d.ping?.state || "—"} · seq ${d.ping?.sequence ?? 0}`, d.ping?.state),
      metric("IMU", d.imu_ready ? "lista" : "no", d.imu_ready ? "OK" : "ERROR"),
      metric("Carga", d.charging_state ?? "—", "OK"),
      metric("Reset", d.reset?.reason || "—", d.reset?.reason === "PANIC" ? "ERROR" : "INFO"),
    ].join("");

    const allowed = new Set(d.allowed_actions || []);
    const phase = d.capabilities?.phase || "READ_ONLY";
    const recovery = !!d.capabilities?.recovery_actions || phase === "RECOVERY" || api.demo;

    $("#actions-grid").innerHTML = ACTIONS.map((a) => {
      const enabled = api.demo || recovery || allowed.has(a.id);
      return `<button class="action-btn ${a.hot ? "hot" : ""}" data-action="${a.id}" ${enabled ? "" : "disabled"}>
        <img class="icon accent" src="${a.icon}" alt="" />
        <strong>${a.title}</strong>
        <span class="hint">${a.hint}</span>
      </button>`;
    }).join("");

    $("#phase-note").textContent = api.demo
      ? "Modo demo: acciones simuladas."
      : `Capacidades: ${phase}. Acciones según allowed_actions.`;
  }

  function appendLog(line) {
    const box = $("#action-log");
    const ts = new Date().toLocaleTimeString();
    box.textContent = `[${ts}] ${line}\n` + box.textContent;
  }

  async function onAction(action) {
    appendLog(`→ ${action}`);
    try {
      const res = await api.runAction(action);
      const msg = res.message || `${action} OK`;
      appendLog(`✓ ${msg}`);
      toast(msg);
      await refreshConsole();
    } catch (err) {
      appendLog(`✗ ${err.message}`);
      toast(err.message, true);
    }
  }

  async function refreshFiles() {
    try {
      const data = await api.listFiles();
      let files = data.files || data.items || data.entries || [];
      if (data.sessions && data.sessions.length && !files.length) {
        files = data.sessions.map((s) => ({
          name: s.id || s.name,
          path: s.path,
          size: s.size,
          session: true,
        }));
      }
      state.files = Array.isArray(files) ? files : [];
      renderFiles($("#file-search").value || "");
    } catch (err) {
      toast(err.message, true);
    }
  }

  function renderFiles(q) {
    const query = q.trim().toLowerCase();
    const list = state.files.filter((f) => {
      const name = f.name || f.path || f.filename || "";
      return !query || name.toLowerCase().includes(query);
    });
    const host = $("#file-list");
    if (!list.length) {
      host.innerHTML = `<p class="muted">No hay archivos${query ? " que coincidan" : ""}.</p>`;
      return;
    }
    host.innerHTML = list
      .map((f) => {
        const name = f.name || f.path || f.filename || "archivo";
        const size = f.size != null ? `${Math.round(f.size / 1024)} KB` : "";
        const mtime = f.mtime || f.modified || "";
        const icon = f.session ? "assets/icons/files/project.svg" : "assets/icons/files/log.svg";
        return `<div class="file-row">
          <img class="icon" src="${icon}" alt="" />
          <div class="meta"><div class="name">${name}</div><div class="sub">${size} ${mtime}</div></div>
          <button class="icon-btn" data-dl="${encodeURIComponent(f.path || name)}" title="Descargar" ${api.demo || f.session ? "disabled" : ""}>
            <img class="icon" src="assets/icons/actions/download.svg" alt="" />
          </button>
        </div>`;
      })
      .join("");
  }

  function fillMore() {
    $("#more-version").textContent = `Versión instalada: ${HydrosphereVersion.LOCAL_VERSION}`;
    $("#dl-ssid").textContent = "ESP32_C6";
    const cfg = HydrosphereSphereConfig.loadConfig();
    $("#cfg-base").value = cfg.baseUrl;
    $("#cfg-key").value = cfg.centralKey;
    $("#panel-lab-demo").hidden = isStandalone();
  }

  async function tryConnect({ demo = false } = {}) {
    api.setDemo(demo);
    if (demo) {
      state.connected = true;
      setChip("demo", "Demo");
      toast("Modo demo activo");
      showView("console");
      return;
    }
    if (applyMixedContentGate()) {
      showView("gate");
      toast("Abre http://192.168.4.1 — esta web HTTPS no puede llamar al SoftAP HTTP", true);
      return;
    }
    setChip("offline", "Comprobando…");
    const probe = await api.probe();
    if (!probe.ok) {
      setChip("offline", "Sin esfera");
      showView("gate");
      toast("No se alcanza http://192.168.4.1 — conéctate al SoftAP", true);
      return;
    }
    try {
      await api.openSession();
      state.connected = true;
      setChip("online", "Conectado");
      toast("Sesión abierta con la esfera");
      showView("console");
    } catch (err) {
      setChip("offline", "Sesión");
      toast(err.message || "No se pudo abrir sesión", true);
      showView("gate");
      appendLog(`Sesión: ${err.message}`);
    }
  }

  function showUpdateBanner(remote) {
    const banner = $("#update-banner");
    const btn = $("#update-download");
    $("#update-text").textContent = remote
      ? `Nueva versión ${remote}`
      : "Nueva versión disponible";
    btn.textContent = "Actualizar";
    btn.disabled = false;
    btn.onclick = async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      btn.disabled = true;
      btn.textContent = "Actualizando…";
      try {
        await HydrosphereVersion.applyUpdate();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = "Actualizar";
        toast("No se pudo actualizar", true);
      }
    };
    banner.classList.add("show");
  }

  async function checkUpdatesManual() {
    const status = $("#update-status");
    status.textContent = "Comprobando…";
    try {
      const info = await HydrosphereVersion.checkForUpdates();
      if (info.newer) {
        status.textContent = `Nueva versión ${info.remote}`;
        showUpdateBanner(info.remote);
      } else {
        status.textContent = `Versión actual: ${info.local || HydrosphereVersion.LOCAL_VERSION}`;
      }
    } catch (err) {
      status.textContent = "No se pudo comprobar";
    }
  }

  async function initVersionBanner() {
    const info = await HydrosphereVersion.checkForUpdates();
    if (info.newer) showUpdateBanner(info.remote);
    window.addEventListener("hs-sw-update", () => showUpdateBanner(null));
  }

  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.protocol !== "http:") return;
    if (
      location.hostname === "localhost" ||
      location.protocol === "https:" ||
      location.hostname.endsWith("github.io")
    ) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
  }

  async function promptInstall() {
    if (state.deferredPrompt) {
      state.deferredPrompt.prompt();
      await state.deferredPrompt.userChoice;
      state.deferredPrompt = null;
      updateInstallFab();
      return;
    }
    toast("iOS: Compartir → Añadir a pantalla de inicio. Android: menú → Instalar app.");
  }

  function bind() {
    $("#btn-retry-wifi").addEventListener("click", () => tryConnect({ demo: false }));
    $("#btn-demo-lab")?.addEventListener("click", () => tryConnect({ demo: true }));
    $("#btn-check-updates").addEventListener("click", checkUpdatesManual);
    $("#fab-install").addEventListener("click", promptInstall);

    $$(".bottom-nav button").forEach((b) =>
      b.addEventListener("click", () => {
        const target = b.dataset.nav;
        if ((target === "console" || target === "files") && !state.connected) {
          showView("gate");
          toast("Conéctate a la esfera primero");
          return;
        }
        showView(target);
      })
    );

    $("#actions-grid").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn || btn.disabled) return;
      onAction(btn.dataset.action);
    });

    $("#file-list").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-dl]");
      if (!btn || btn.disabled) return;
      const path = decodeURIComponent(btn.dataset.dl);
      downloadFile(path);
    });

    $("#file-search").addEventListener("input", (e) => renderFiles(e.target.value));
    $("#btn-refresh-files").addEventListener("click", refreshFiles);

    $("#btn-save-settings").addEventListener("click", () => {
      HydrosphereSphereConfig.saveConfig({
        baseUrl: $("#cfg-base").value.trim() || "http://192.168.4.1",
        centralKey: $("#cfg-key").value.trim(),
      });
      api.reloadConfig();
      toast("Ajustes guardados");
    });

    $("#btn-disconnect").addEventListener("click", () => {
      state.connected = false;
      api.token = null;
      sessionStorage.removeItem("hs_mobile_token");
      api.setDemo(false);
      stopPoll();
      setChip("offline", "Desconectado");
      showView("gate");
      toast("Sesión cerrada");
    });

    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      state.deferredPrompt = e;
      updateInstallFab();
    });

    window.addEventListener("appinstalled", () => {
      state.deferredPrompt = null;
      updateInstallFab();
      toast("App instalada");
    });

    window.addEventListener("resize", updateInstallFab);
  }

  async function downloadFile(path) {
    try {
      await api.ensureSession();
      const cfg = HydrosphereSphereConfig.loadConfig();
      const url = `${cfg.baseUrl.replace(/\/$/, "")}/api/v1/file?path=${encodeURIComponent(path)}`;
      const res = await fetch(url, {
        headers: { "X-Hydro-Token": api.token },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`download ${res.status}`);
      const blob = await res.blob();
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = path.split("/").pop() || "file";
      a.click();
      URL.revokeObjectURL(u);
      toast(`Descarga ${path}`);
    } catch (err) {
      toast(err.message, true);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    ACTIONS.forEach((a) => {
      if (a.id === "IMU_RETRY") a.icon = "assets/icons/actions/refresh.svg";
    });

    bind();
    setChip("offline", "Sin conexión");
    showView("gate");
    updateInstallFab();
    registerSW();
    initVersionBanner();

    if (applyMixedContentGate()) {
      return;
    }

    api.probe().then((p) => {
      if (p.ok && !api.demo) {
        setChip("online", "Esfera al alcance");
        tryConnect({ demo: false });
      }
    });
  });
})();
