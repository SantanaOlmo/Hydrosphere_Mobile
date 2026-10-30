/**
 * Simulación local del contrato d8ed914 (sin esfera).
 * Uso: node tests/diag-contract-sim.mjs
 */
import { createRequire } from "module";
import { pathToFileURL } from "url";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// Cargar IIFE diag-contract en globalThis
const require = createRequire(import.meta.url);
const fs = require("fs");
const src = fs.readFileSync(path.join(root, "js", "diag-contract.js"), "utf8");
globalThis.window = globalThis;
eval(src);
const C = globalThis.HydrosphereDiagContract;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log("OK ", name);
  } catch (e) {
    failed += 1;
    console.error("FAIL", name, e.message);
  }
}

check("supported actions = 6, sin WIFI_RECOVER", () => {
  assert(C.SUPPORTED_ACTIONS.length === 6, "len");
  assert(!C.SUPPORTED_ACTIONS.includes("WIFI_RECOVER"), "no wifi");
  assert(!C.isSupportedAction("WIFI_RECOVER"), "supported");
  assert(C.isSupportedAction("SD_RECOVER"), "sd");
});

check("enabled solo si allowed_actions", () => {
  assert(
    C.isActionEnabled("PING_ONCE", ["PING_ONCE", "SD_RECOVER"]),
    "once on"
  );
  assert(!C.isActionEnabled("PING_STOP", ["PING_ONCE"]), "stop off");
  assert(!C.isActionEnabled("WIFI_RECOVER", ["WIFI_RECOVER"]), "wifi never");
});

check("timeout SD > default", () => {
  assert(C.actionTimeoutMs("SD_RECOVER") > C.DEFAULT_TIMEOUT_MS, "sd to");
  assert(C.actionTimeoutMs("PING_ONCE") === C.DEFAULT_TIMEOUT_MS, "ping to");
});

check("format 409 DIAG_BUSY", () => {
  const msg = C.formatDiagError({
    status: 409,
    code: "DIAG_BUSY",
    message: "recording active",
  });
  assert(/recording|ocupada|BUSY/i.test(msg) || msg.includes("recording"), msg);
});

check("format 503 DIAG_UNAVAILABLE", () => {
  const msg = C.formatDiagError({
    status: 503,
    code: "DIAG_UNAVAILABLE",
    message: "IMU still not ready",
  });
  assert(msg.includes("IMU") || /no disponible/i.test(msg), msg);
});

check("format 401/403", () => {
  assert(/sesión|Sesión/i.test(C.formatDiagError({ status: 401, code: "AUTH_REQUIRED" })));
  assert(/Token|token|clave/i.test(C.formatDiagError({ status: 403, code: "AUTH_INVALID" })));
});

check("simulate envelope 409", () => {
  const e = C.simulateErrorEnvelope(409, "DIAG_REJECTED_STATE", "not DOCKED_IDLE", true);
  assert(e.status === 409);
  assert(e.body.error.code === "DIAG_REJECTED_STATE");
  assert(e.body.error.retryable === true);
});

check("paths POST d8ed914", () => {
  assert(C.ACTION_PATHS.PING_ONCE.endsWith("/ping/once"));
  assert(C.ACTION_PATHS.SD_RECOVER.endsWith("/sd/recover"));
  assert(C.ACTION_PATHS.MISSION_CLEAR_ERROR.endsWith("/mission/clear_error"));
  assert(!("WIFI_RECOVER" in C.ACTION_PATHS));
});

if (failed) {
  console.error(`\n${failed} fallo(s)`);
  process.exit(1);
}
console.log("\nSimulación contrato d8ed914: OK");
