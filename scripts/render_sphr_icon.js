const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const root = path.join(__dirname, "..");
const desktop = path.join(
  root,
  "..",
  "Hydrosphere",
  "assets",
  "icons",
  "app",
  "sphr.svg"
);
const local = path.join(root, "assets", "icons", "app", "sphr.svg");
const src = fs.existsSync(desktop) ? desktop : local;
const out = path.join(root, "assets", "icons", "app", "sphr-1024.png");

const svg = fs.readFileSync(src);
fs.copyFileSync(src, local);

const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1024 } });
fs.writeFileSync(out, resvg.render().asPng());
console.log("wrote", out);
