/**
 * Comprueba version.json / Releases.
 * LOCAL_VERSION debe coincidir con version.json (sync-www lo refuerza).
 * En Capacitor/APK «Actualizar» abre la URL del APK (no basta con recargar).
 */
(function (global) {
  const LOCAL_VERSION = "0.3.7";
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

  function isNativeApp() {
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

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function resolveApkUrl() {
    try {
      const v = await fetchJson("./version.json");
      const apk = v && v.downloads && v.downloads.android_apk;
      if (apk && /^https?:\/\//i.test(apk)) return apk;
    } catch {
      /* fall through */
    }
    try {
      const rel = await fetchJson(GH_RELEASES);
      const assets = (rel && rel.assets) || [];
      const asset = assets.find((a) => /\.apk$/i.test(a.name || ""));
      if (asset && asset.browser_download_url) return asset.browser_download_url;
    } catch {
      /* fall through */
    }
    return null;
  }

  async function applyUpdate() {
    if (isNativeApp()) {
      const apk = await resolveApkUrl();
      if (!apk) {
        throw new Error(
          "No hay URL de APK. Con internet: descarga desde GitHub Releases e instala encima."
        );
      }
      // Capacitor Browser si existe; si no, navegador / descarga del sistema.
      try {
        const Browser =
          (global.Capacitor &&
            global.Capacitor.Plugins &&
            global.Capacitor.Plugins.Browser) ||
          null;
        if (Browser && typeof Browser.open === "function") {
          await Browser.open({ url: apk });
          return { mode: "native-apk", url: apk };
        }
      } catch {
        /* fallback */
      }
      const opened = global.open(apk, "_blank");
      if (!opened) {
        location.href = apk;
      }
      return { mode: "native-apk", url: apk };
    }

    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          await reg.update().catch(() => {});
          if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }
      }
      if (global.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      /* recarga igual */
    }
    location.replace("./index.html?v=" + Date.now());
    return { mode: "pwa-reload" };
  }

  async function checkForUpdates() {
    const result = {
      local: LOCAL_VERSION,
      remote: null,
      newer: false,
      source: null,
      apkUrl: null,
    };

    try {
      const v = await fetchJson("./version.json");
      result.remote = v.version;
      result.source = "version.json";
      if (v.downloads && v.downloads.android_apk) {
        result.apkUrl = v.downloads.android_apk;
      }
      if (cmpSemver(v.version, LOCAL_VERSION) > 0) result.newer = true;
    } catch {
      /* offline / embebido */
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
        const asset = ((rel && rel.assets) || []).find((a) =>
          /\.apk$/i.test(a.name || "")
        );
        if (asset && asset.browser_download_url) {
          result.apkUrl = asset.browser_download_url;
        }
      }
    } catch {
      /* sin red (p.ej. solo SoftAP) */
    }

    // Nunca pedir “actualizar” si lo remoto no es estrictamente mayor.
    if (!result.remote || cmpSemver(result.remote, LOCAL_VERSION) <= 0) {
      result.newer = false;
    }

    if ("serviceWorker" in navigator && !isNativeApp()) {
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
    isNativeApp,
  };
})(window);
