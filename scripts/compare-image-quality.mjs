// Đo dung lượng WebP ở nhiều mức nén và xuất ảnh để so bằng mắt (v9-C).
// Dùng: node scripts/compare-image-quality.mjs <thư mục ảnh gốc> <thư mục ra>
import sharp from "sharp";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, parse } from "node:path";

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error("Dùng: node scripts/compare-image-quality.mjs <src> <out>");
  process.exit(1);
}
mkdirSync(out, { recursive: true });

// [loại, cạnh dài, chất lượng]. Dòng đầu là mức hiện tại (mốc so sánh).
const LEVELS = [
  ["main", 1280, 80],
  ["main", 960, 65],
  ["main", 800, 60],
  ["main", 720, 55],
  ["main", 640, 50],
  ["thumb", 400, 72],
  ["thumb", 320, 60],
  ["thumb", 240, 55],
];
const files = readdirSync(src).filter((f) => /\.(jpe?g|png|webp|heic)$/i.test(f));
const total = {};
for (const f of files) {
  const buf = readFileSync(join(src, f));
  const parts = [f];
  for (const [kind, dim, q] of LEVELS) {
    const img = await sharp(buf)
      .rotate()
      .resize({ width: dim, height: dim, fit: "inside", withoutEnlargement: true })
      .webp({ quality: q })
      .toBuffer();
    const key = `${kind}-${dim}q${q}`;
    total[key] = (total[key] ?? 0) + img.length;
    writeFileSync(join(out, `${parse(f).name}__${key}.webp`), img);
    parts.push(`${key}:${Math.round(img.length / 1024)}KB`);
  }
  console.log(parts.join("  "));
}
console.log("Trung bình (KB):");
for (const [k, v] of Object.entries(total))
  console.log(`  ${k}: ${Math.round(v / files.length / 1024)}`);
