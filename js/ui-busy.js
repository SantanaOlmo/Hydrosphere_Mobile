/**
 * Loader de botón (mismo patrón que stud.io / MemoriaLiteral: btn-dots).
 * Uso: HydrosphereBusy.set(btn, true) / set(btn, false)
 */
(function (global) {
  const DOTS =
    '<span class="btn-dots" aria-hidden="true"><span></span><span></span><span></span></span>';

  function dotsHtml() {
    return DOTS;
  }

  /**
   * @param {HTMLElement|null} btn
   * @param {boolean} busy
   * @param {{ idleHtml?: string, busyLabel?: string }} [opts]
   */
  function set(btn, busy, opts = {}) {
    if (!btn) return;
    if (busy) {
      if (btn.dataset.hsIdleHtml == null) {
        btn.dataset.hsIdleHtml = btn.innerHTML;
      }
      btn.classList.add("btn--busy");
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
      if (opts.busyLabel) btn.setAttribute("aria-label", opts.busyLabel);
      btn.innerHTML = DOTS;
      return;
    }
    btn.classList.remove("btn--busy");
    btn.disabled = false;
    btn.removeAttribute("aria-busy");
    if (opts.busyLabel) btn.removeAttribute("aria-label");
    const idle = opts.idleHtml != null ? opts.idleHtml : btn.dataset.hsIdleHtml;
    if (idle != null) {
      btn.innerHTML = idle;
      delete btn.dataset.hsIdleHtml;
    }
  }

  global.HydrosphereBusy = { set, dotsHtml };
})(window);
