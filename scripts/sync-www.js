/**
 * Copia la web estática a www/ para Capacitor (sin meter android/ ni node_modules).
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const www = path.join(root, "www");

const FILES = [
  "index.html",
  "manifest.json",
  "version.json",
  "sw.js",
  "update.html",
];

const DIRS = ["css", "js", "assets"];

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function copyFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dst, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else copyFile(s, d);
  }
}

rmrf(www);
fs.mkdirSync(www, { recursive: true });

for (const f of FILES) {
  const src = path.join(root, f);
  if (fs.existsSync(src)) copyFile(src, path.join(www, f));
}

for (const d of DIRS) {
  const src = path.join(root, d);
  if (fs.existsSync(src)) copyDir(src, path.join(www, d));
}

// Mantener LOCAL_VERSION de version-check.js alineado con version.json
try {
  const ver = JSON.parse(
    fs.readFileSync(path.join(root, "version.json"), "utf8")
  ).version;
  for (const base of [root, www]) {
    const vc = path.join(base, "js", "version-check.js");
    if (!fs.existsSync(vc)) continue;
    const src = fs.readFileSync(vc, "utf8");
    const next = src.replace(
      /const LOCAL_VERSION = "[^"]*";/,
      `const LOCAL_VERSION = "${ver}";`
    );
    if (next !== src) fs.writeFileSync(vc, next, "utf8");
  }
  console.log("www/ listo para Capacitor · LOCAL_VERSION=" + ver);
} catch (err) {
  console.log("www/ listo para Capacitor");
  console.warn("No se pudo sincronizar LOCAL_VERSION:", err.message);
}
