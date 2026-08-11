import "server-only";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Trả về "/logo.png" nếu Niên đã bỏ file vào public/logo.png, ngược lại null.
 * Khi null, các trang tự vẽ wordmark serif "HeyP" — không bao giờ 404 ảnh.
 */
export function getLogoUrl(): string | null {
  const path = join(process.cwd(), "public", "logo.png");
  return existsSync(path) ? "/logo.png" : null;
}
