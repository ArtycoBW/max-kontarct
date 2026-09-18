// Serve the PDF worker, fonts and decoders locally; document bytes never go to a viewer service.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const source = path.dirname(require.resolve("pdfjs-dist/package.json", { paths: [path.join(root, "apps/web")] }));
const version = require(path.join(source, "package.json")).version;
const target = path.join(root, "apps/web/public/pdfjs", version);
fs.mkdirSync(target, { recursive: true });
fs.copyFileSync(path.join(source, "build/pdf.worker.min.mjs"), path.join(target, "pdf.worker.min.mjs"));
fs.copyFileSync(path.join(source, "LICENSE"), path.join(target, "LICENSE"));
for (const directory of ["cmaps", "standard_fonts", "wasm"]) fs.cpSync(path.join(source, directory), path.join(target, directory), { recursive: true });
console.log(`Local PDF assets prepared (${version}).`);
