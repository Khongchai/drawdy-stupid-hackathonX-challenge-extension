import { readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

const source = process.argv[2] ?? join("assets", "diny.png");
const types = { ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };
const mime = types[extname(source).toLowerCase()];
if (!mime) throw new Error(`unsupported image type: ${source}`);
const bytes = readFileSync(source);
const out = join("src", "assets", "diny.ts");
writeFileSync(
    out,
    `export const DINY_MIME = ${JSON.stringify(mime)};\nexport const DINY_BASE64 =\n    ${JSON.stringify(bytes.toString("base64"))};\n`
);
console.log(`embedded ${source} (${bytes.length} bytes) -> ${out}`);
