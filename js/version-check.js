/**
 * Comprueba version.json / Releases. Actualiza la PWA en el dispositivo.
 */
(function (global) {
  const LOCAL_VERSION = "0.3.1";
  const GH_RELEASES =
    "https://api.github.com/repos/SantanaOlmo/Hydrosphere_Mobile/releases/latest";

  function cmpSemver(a, b) {
    const pa = String(a)
      .replace(/^v/, "")
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
    const pb = String(b)
      .replace(/^v/, "")
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return d > 0 ? 1 : -1;
    }
    return 0;
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function applyUpdate() {
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          await reg.update().catch(() => {});
          if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }
      }
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      /* recarga igual */
    }
    location.replace("./index.html?v=" + Date.now());
  }

  async function checkForUpdates() {
    const result = {
      local: LOCAL_VERSION,
      remote: null,
      newer: false,
      source: null,
    };

    try {
      const v = await fetchJson("./version.json");
      result.remote = v.version;
      result.source = "version.json";
      if (cmpSemver(v.version, LOCAL_VERSION) > 0) result.newer = true;
    } catch {
      /* offline */
    }

    try {
      const rel = await fetchJson(GH_RELEASES);
      if (rel && rel.tag_name) {
        const tag = String(rel.tag_name).replace(/^v/, "");
        if (!result.remote || cmpSemver(tag, result.remote) >= 0) {
          result.remote = tag;
          result.source = "github-releases";
        }
        if (cmpSemver(tag, LOCAL_VERSION) > 0) result.newer = true;
      }
    } catch {
      /* sin red */
    }

    if ("serviceWorker" in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          reg.addEventListener("updatefound", () => {
            const nw = reg.installing;
            if (!nw) return;
            nw.addEventListener("statechange", () => {
              if (nw.state === "installed" && navigator.serviceWorker.controller) {
                global.dispatchEvent(new CustomEvent("hs-sw-update"));
              }
            });
          });
          reg.update().catch(() => {});
        }
      } catch {
        /* ignore */
      }
    }

    return result;
  }

  global.HydrosphereVersion = {
    LOCAL_VERSION,
    checkForUpdates,
    applyUpdate,
    cmpSemver,
  };
})(window);
