/**
 * Sinh icon PWA từ một SVG chữ. Chạy lại khi có logo thật:
 *   node --experimental-strip-types scripts/make-pwa-icons.ts
 */
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const svg = (size: number) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="#0e5a87"/>
  <text x="50%" y="50%" dy="0.35em" text-anchor="middle"
        font-family="system-ui, -apple-system, Helvetica, Arial, sans-serif"
        font-size="${Math.round(size * 0.3)}" font-weight="700" fill="#ffffff"
  >HeyP</text>
</svg>`;

for (const [size, name] of [
  [192, "icon-192.png"],
  [512, "icon-512.png"],
  [180, "apple-touch-icon.png"],
] as const) {
  const png = await sharp(Buffer.from(svg(size))).png().toBuffer();
  await writeFile(new URL(`../public/${name}`, import.meta.url), png);
  console.log(`đã sinh public/${name}`);
}
