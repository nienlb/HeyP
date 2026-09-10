/**
 * Liệt kê mọi khai báo khoảng cách CHƯA dùng token, theo từng mục của
 * legacy.css. Dùng ở mỗi đợt của v9-B để biết chính xác phải sửa những gì —
 * KHÔNG chép danh sách cứng vào kế hoạch, vì Task 1 đã xoá bớt và số dòng
 * trôi sau mỗi lần sửa.
 *
 *   node scripts/spacing-audit.mjs                 # tất cả các mục
 *   node scripts/spacing-audit.mjs "Cards & detail"  # một mục
 */
import { readFileSync } from "node:fs";

const FILES = [
  "src/styles/tokens.css",
  "src/styles/base.css",
  "src/styles/layout.css",
  "src/styles/components.css",
  "src/styles/screens.css",
  "src/styles/legacy.css",
];
const HDR = /^\/\* (?:-{10}|={5}) ?(.+?) ?(?:-{10}|={5}) \*\/$/;
const PROP =
  /^\s*(padding|margin|gap|row-gap|column-gap)(-top|-right|-bottom|-left)?\s*:\s*([^;]+);/;

const loc = process.argv[2] ?? null;
let tong = 0;

for (const file of FILES) {
  const lines = readFileSync(file, "utf8").split("\n");
  let muc = file.endsWith("legacy.css") ? "(đầu file)" : "(cả file)";
  let sel = "?";
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const h = HDR.exec(ln.trim());
    if (h) { muc = h[1]; continue; }
    const s = /^([.#*&a-z][^{]*)\{\s*$/.exec(ln.trim());
    if (s) sel = s[1].trim();
    const p = PROP.exec(ln);
    if (!p) continue;
    if (p[3].includes("var(--sp-")) continue;
    if (!/\d+px/.test(p[3])) continue;
    if (loc && muc !== loc) continue;
    console.log(`${file}:${i + 1}  [${muc}]  ${sel}  →  ${ln.trim()}`);
    tong++;
  }
}
console.log(`\nTổng khai báo cần sửa: ${tong}`);
