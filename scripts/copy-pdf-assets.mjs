import { cpSync, mkdirSync } from "node:fs";
mkdirSync("public", { recursive: true });
cpSync("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "public/pdf.worker.min.mjs");
for (const [source, target] of [["cmaps", "pdf-cmaps"], ["standard_fonts", "pdf-fonts"], ["wasm", "pdf-wasm"]]) cpSync(`node_modules/pdfjs-dist/${source}`, `public/${target}`, { recursive: true });
