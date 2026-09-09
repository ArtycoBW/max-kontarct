// Self-host models/worker/WASM. No third-party CDN receives passport images.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const target = path.join(root, "apps/web/public/ocr");
const web = path.join(root, "apps/web");
function packageDir(name) { return path.dirname(require.resolve(`${name}/package.json`, { paths: [web] })); }
if (require(path.join(packageDir("tesseract.js"), "package.json")).version !== "7.0.0") throw new Error("Update and verify the local OCR worker transport before upgrading Tesseract.js");
fs.mkdirSync(path.join(target, "core"), { recursive: true });
fs.mkdirSync(path.join(target, "lang"), { recursive: true });
fs.copyFileSync(path.join(packageDir("tesseract.js"), "dist/worker.min.js"), path.join(target, "worker.min.js"));
fs.copyFileSync(path.join(packageDir("tesseract.js"), "LICENSE.md"), path.join(target, "LICENSE-tesseract.txt"));
const core = packageDir("tesseract.js-core");
fs.copyFileSync(path.join(core, "LICENSE"), path.join(target, "LICENSE-core.txt"));
for (const name of fs.readdirSync(core).filter(name => /^tesseract-core.*\.wasm(\.js)?$/.test(name))) {
  fs.copyFileSync(path.join(core, name), path.join(target, "core", name));
}
for (const lang of ["rus", "eng"]) {
  fs.copyFileSync(path.join(packageDir(`@tesseract.js-data/${lang}`), "package.json"), path.join(target, "lang", `${lang}-package.json`));
  fs.copyFileSync(path.join(packageDir(`@tesseract.js-data/${lang}`), "4.0.0_best_int", `${lang}.traineddata.gz`), path.join(target, "lang", `${lang}.traineddata.gz`));
}
console.log("Local OCR assets prepared (Tesseract.js, Russian/English models).");
