(function () {
  const api = new HydrosphereSphereApi();
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const state = {
    connected: false,
    view: "landing",
    diag: null,
    wifi: null,
    files: [],
    pollTimer: null,
  };

  const ACTIONS = [
    {
      id: "PING_START",
      title: "Ping start",
      hint: "Pitar de forma periódica",
      icon: "assets/icons/FePlay.svg",
      hot: true,
    },
    {
      id: "PING_ONCE",
      title: "Ping once",
      hint: "Un solo tono acústico",
      icon: "assets/icons/FePlay.svg",
    },
    {
      id: "PING_STOP",
      title: "Ping stop",
      hint: "Detener emisión",
      icon: "assets/icons/MdiDelete.svg",
    },
    {
      id: "SD_RECOVER",
      title: "Recuperar SD",
      hint: "Remount seguro (puede cortar Wi‑Fi)",
      icon: "assets/icons/SolarFileStackLineDuotone.svg",
    },
    {
      id: "WIFI_RECOVER",
      title: "Recuperar Wi‑Fi",
      hint: "Reinicia SoftAP + HTTP",
      icon: "assets/icons/MaterialSymbolsDriveFileMove.svg",
    },
    {
      id: "IMU_RETRY",
      title: "Reintentar IMU",
      hint: "Retry del sensor",
      icon: "assets/icons/MaterialSymbolsSettingsRounded.svg",
    },
  ];

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
      chip.querySelector(".label").textContent = label;
    });
  }

  function showView(name) {
    state.view = name;
    $$(".view").forEach((v) => v.classList.toggle("active", v.dataset.view === name));
    const landing = name === "landing";
    $(".app-shell").classList.toggle("landing-mode", landing);
    $(".bottom-nav").classList.toggle("hidden", landing);
    $$(".bottom-nav button").forEach((b) =>
      b.classList.toggle("active", b.dataset.nav === name)
    );
    if (name === "console" && state.connected) startPoll();
    else stopPoll();
    if (name === "files" && state.connected) refreshFiles();
    if (name === "downloads") renderDownloads();
    if (name === "settings") fillSettings();
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
      metric("FSM", d.fsm_state, d.fsm_state?.includes("ERROR") ? "ERROR" : "OK"),
      metric("Modo", d.operation_mode, d.operation_mode === "ERROR" ? "ERROR" : "OK"),
      metric("Misión", d.mission_public_state, d.mission_public_state),
      metric("SD", `${d.sd?.status || "—"} · montada ${d.sd?.mounted ? "sí" : "no"}`, d.sd?.status),
      metric("Wi‑Fi", w?.status || (d.wifi?.http_active ? "UP" : "DOWN"), w?.status),
      metric("Canal", w?.channel_primary ?? "—", "OK"),
      metric("Clientes", w?.sta_count ?? d.wifi?.sta_count ?? "—", "OK"),
      metric("Ping", `${d.ping?.state || "—"} · seq ${d.ping?.sequence ?? 0}`, d.ping?.state),
      metric("IMU", d.imu_ready ? "lista" : "no", d.imu_ready ? "OK" : "ERROR"),
      metric("Carga", d.charging_state, "OK"),
      metric("Reset", d.reset?.reason || "—", d.reset?.reason === "PANIC" ? "ERROR" : "INFO"),
    ].join("");

    const allowed = new Set(d.allowed_actions || []);
    const phase = d.capabilities?.phase || "READ_ONLY";
    const recovery = !!d.capabilities?.recovery_actions || phase === "RECOVERY" || api.demo;

    // Botones siempre pulsables en consola: si el firmware aún es Fase 1, el API
    // devolverá PHASE2_PENDING con mensaje claro (mejor que botones muertos).
    $("#actions-grid").innerHTML = ACTIONS.map((a) => {
      const preview = allowed.has(a.id);
      return `<button class="action-btn ${a.hot ? "hot" : ""}" data-action="${a.id}">
        <img class="icon accent" src="${a.icon}" alt="" />
        <strong>${a.title}</strong>
        <span class="hint">${preview || api.demo || recovery ? a.hint : a.hint + " · Fase 2"}</span>
      </button>`;
    }).join("");

    $("#phase-note").textContent = api.demo
      ? "Modo demo: las acciones se simulan en el navegador."
      : recovery
        ? `Capacidades: ${phase}. Acciones según allowed_actions del firmware.`
        : "Fase 1 (lectura). Al pulsar una acción Fase 2 verás si el firmware ya la expone.";
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
      const files = data.files || data.items || data.entries || [];
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
        return `<div class="file-row">
          <img class="icon" src="assets/icons/SolarFileStackLineDuotone.svg" alt="" />
          <div class="meta"><div class="name">${name}</div><div class="sub">${size} ${mtime}</div></div>
          <button class="icon-btn" data-dl="${encodeURIComponent(name)}" title="Descargar" ${api.demo ? "disabled" : ""}>
            <img class="icon" src="assets/icons/MaterialSymbolsDownload.svg" alt="" />
          </button>
        </div>`;
      })
      .join("");
  }

  function renderDownloads() {
    $("#dl-version").textContent = `Versión instalada: ${HydrosphereVersion.LOCAL_VERSION}`;
    $("#dl-ssid").textContent = "ESP32_C6";
  }

  function fillSettings() {
    const cfg = HydrosphereSphereConfig.loadConfig();
    $("#cfg-base").value = cfg.baseUrl;
    $("#cfg-key").value = cfg.centralKey;
  }

  async function tryConnect({ demo = false } = {}) {
    api.setDemo(demo);
    if (demo) {
      state.connected = true;
      setChip("demo", "Demo");
      toast("Entraste en modo demo");
      showView("console");
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
      // Probe ok pero sesión falló (CORS/token). Ofrecer demo o reintentar.
      setChip("offline", "Auth / CORS");
      toast(err.message || "No se pudo abrir sesión", true);
      showView("gate");
      appendLog(`Sesión: ${err.message}`);
    }
  }

  async function initVersionBanner() {
    const info = await HydrosphereVersion.checkForUpdates();
    const banner = $("#update-banner");
    if (info.newer) {
      banner.classList.add("show");
      $("#update-text").textContent = `Nueva versión ${info.remote}: ${info.notes || "Hay una actualización disponible."}`;
      const btn = $("#update-download");
      if (info.downloadUrl) {
        btn.onclick = () => window.open(info.downloadUrl, "_blank");
      } else {
        btn.onclick = () => showView("downloads");
      }
    }
    window.addEventListener("hs-sw-update", () => {
      banner.classList.add("show");
      $("#update-text").textContent = "Hay una versión nueva de la app en caché. Recarga para aplicarla.";
      $("#update-download").textContent = "Recargar";
      $("#update-download").onclick = () => location.reload();
    });
  }

  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.protocol !== "http:") return;
    if (location.hostname === "localhost" || location.protocol === "https:" || location.hostname.endsWith("github.io")) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
  }

  function bind() {
    $("#btn-enter").addEventListener("click", () => tryConnect({ demo: false }));
    $("#btn-demo").addEventListener("click", () => tryConnect({ demo: true }));
    $("#btn-install").addEventListener("click", () => showView("downloads"));
    $("#btn-retry-wifi").addEventListener("click", () => tryConnect({ demo: false }));
    $("#btn-demo-gate").addEventListener("click", () => tryConnect({ demo: true }));
    $("#btn-back-landing").addEventListener("click", () => showView("landing"));

    $$(".bottom-nav button").forEach((b) =>
      b.addEventListener("click", () => {
        const target = b.dataset.nav;
        if ((target === "console" || target === "files") && !state.connected) {
          showView("gate");
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
      showView("landing");
      toast("Sesión cerrada");
    });

    let deferredPrompt = null;
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      $("#btn-pwa-install").hidden = false;
    });
    $("#btn-pwa-install").addEventListener("click", async () => {
      if (!deferredPrompt) {
        toast("En iOS: Compartir → Añadir a pantalla de inicio. En Android: menú del navegador → Instalar app.");
        return;
      }
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    bind();
    setChip("offline", "Sin conexión");
    showView("landing");
    registerSW();
    initVersionBanner();
    // Si ya estamos en SoftAP al abrir la PWA, auto-probe suave
    api.probe().then((p) => {
      if (p.ok && !api.demo) {
        setChip("online", "Esfera al alcance");
      }
    });
  });
})();
