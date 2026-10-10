// Self-host the OCR engine so the app never loads scripts from a third-party CDN.
// Copies into public/ocr (gitignored); runs before dev and build.
import { cpSync, mkdirSync } from "node:fs";

const out = "public/ocr";
mkdirSync(`${out}/core`, { recursive: true });
mkdirSync(`${out}/lang`, { recursive: true });
cpSync("node_modules/tesseract.js/dist/worker.min.js", `${out}/worker.min.js`);
// LSTM-only engines (what receipt text needs); the browser picks the fastest it supports.
for (const f of ["tesseract-core-relaxedsimd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-lstm.wasm.js"]) {
  cpSync(`node_modules/tesseract.js-core/${f}`, `${out}/core/${f}`);
}
cpSync("node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", `${out}/lang/eng.traineddata.gz`);
console.log("OCR assets copied to public/ocr");
