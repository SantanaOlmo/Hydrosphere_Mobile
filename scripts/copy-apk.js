/**
 * Copia el APK generado a releases/ con nombre versionado.
 */
const fs = require("fs");
const path = require("path");

const kind = process.argv[2] === "release" ? "release" : "debug";
const root = path.resolve(__dirname, "..");
const version = JSON.parse(fs.readFileSync(path.join(root, "version.json"), "utf8")).version;

const candidates =
  kind === "release"
    ? [
        path.join(root, "android", "app", "build", "outputs", "apk", "release", "app-release-unsigned.apk"),
        path.join(root, "android", "app", "build", "outputs", "apk", "release", "app-release.apk"),
      ]
    : [path.join(root, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk")];

const src = candidates.find((p) => fs.existsSync(p));
if (!src) {
  console.error("No se encontró APK. Ejecuta antes npm run build:apk:" + kind);
  process.exit(1);
}

const outDir = path.join(root, "releases");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `hydrosphere-mobile-${version}-${kind}.apk`);
fs.copyFileSync(src, out);
console.log("APK →", out);
