/**
 * Puente al plugin nativo SoftApNetwork (Android).
 * Enlaza el proceso a la Wi‑Fi SoftAP 192.168.4.x para que HTTP llegue a la esfera.
 */
(function (global) {
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

  function plugin() {
    try {
      return (global.Capacitor && (global.Capacitor.Plugins || {}).SoftApNetwork) || null;
    } catch {
      return null;
    }
  }

  async function bindToSoftAp(opts = {}) {
    if (!isNative()) {
      return { skipped: true, ok: true, reason: "web" };
    }
    const p = plugin();
    if (!p || typeof p.bindToSoftAp !== "function") {
      return {
        skipped: true,
        ok: false,
        reason: "no_plugin",
        hint: "APK sin plugin SoftApNetwork. Reinstala la última versión.",
      };
    }
    const res = await p.bindToSoftAp({
      gateway: opts.gateway || "192.168.4.1",
      prefix: opts.prefix || "192.168.4.",
    });
    return { skipped: false, ...res };
  }

  async function getInfo(opts = {}) {
    if (!isNative()) return { skipped: true };
    const p = plugin();
    if (!p || typeof p.getInfo !== "function") return { skipped: true, reason: "no_plugin" };
    return p.getInfo({
      gateway: opts.gateway || "192.168.4.1",
      prefix: opts.prefix || "192.168.4.",
    });
  }

  async function unbind() {
    if (!isNative()) return;
    const p = plugin();
    if (p && typeof p.unbind === "function") await p.unbind();
  }

  global.HydrosphereSoftApNetwork = { bindToSoftAp, getInfo, unbind, isNative };
})(window);
