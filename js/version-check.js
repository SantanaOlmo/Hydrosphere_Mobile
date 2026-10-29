/**
 * Comprueba version.json del propio repo / GitHub Releases y notifica actualizaciones.
 */
(function (global) {
  const LOCAL_VERSION = "0.1.0";
  const GH_RELEASES =
    "https://api.github.com/repos/ennde3d/Hydrosphere_Mobile/releases/latest";

  function cmpSemver(a, b) {
    const pa = String(a).replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
    const pb = String(b).replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
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

  async function checkForUpdates() {
    const result = {
      local: LOCAL_VERSION,
      remote: null,
      newer: false,
      notes: "",
      downloadUrl: null,
      source: null,
    };

    try {
      const v = await fetchJson("./version.json");
      result.remote = v.version;
      result.notes = v.notes || "";
      result.source = "version.json";
      if (v.downloads && v.downloads.android_apk) {
        result.downloadUrl = v.downloads.android_apk;
      }
      if (cmpSemver(v.version, LOCAL_VERSION) > 0) result.newer = true;
    } catch {
      /* offline / file:// */
    }

    try {
      const rel = await fetchJson(GH_RELEASES);
      if (rel && rel.tag_name) {
        const tag = rel.tag_name.replace(/^v/, "");
        if (!result.remote || cmpSemver(tag, result.remote) >= 0) {
          result.remote = tag;
          result.notes = rel.body || result.notes;
          result.source = "github-releases";
          const apk = (rel.assets || []).find((a) => /\.apk$/i.test(a.name));
          if (apk) result.downloadUrl = apk.browser_download_url;
          else result.downloadUrl = rel.html_url;
        }
        if (cmpSemver(tag, LOCAL_VERSION) > 0) result.newer = true;
      }
    } catch {
      /* sin red o sin releases aún */
    }

    // Service worker update
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

  global.HydrosphereVersion = { LOCAL_VERSION, checkForUpdates, cmpSemver };
})(window);
