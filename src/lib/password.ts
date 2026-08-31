/**
 * Hash mật khẩu bằng scrypt của node:crypto — KHÔNG thêm dependency.
 *
 * Chuỗi lưu tự mô tả tham số: đổi N/r/p về sau vẫn verify được mật khẩu cũ.
 *   scrypt$<N>$<r>$<p>$<salt_base64>$<hash_base64>
 *
 * Module thuần, không đụng DB.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 32;
// scrypt cần ~128 × N × r byte = 16MB với tham số trên. Mặc định của Node là
// 32MB; đặt tường minh để không phụ thuộc mặc định của phiên bản.
const MAX_MEM = 64 * 1024 * 1024;

export const MIN_PASSWORD_LENGTH = 6;

/** Trả thông báo lỗi (tiếng Việt) nếu mật khẩu không hợp lệ, null nếu ổn. */
export function validatePassword(plain: string): string | null {
  if (plain.length < MIN_PASSWORD_LENGTH)
    return `Mật khẩu phải từ ${MIN_PASSWORD_LENGTH} ký tự trở lên.`;
  return null;
}

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, KEY_LEN, {
    N,
    r: R,
    p: P,
    maxmem: MAX_MEM,
  });
  return [
    "scrypt",
    N,
    R,
    P,
    salt.toString("base64"),
    hash.toString("base64"),
  ].join("$");
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p))
    return false;
  if (n <= 1 || r <= 0 || p <= 0) return false;

  try {
    const expected = Buffer.from(parts[5], "base64");
    if (expected.length === 0) return false;
    const actual = scryptSync(
      plain,
      Buffer.from(parts[4], "base64"),
      expected.length,
      { N: n, r, p, maxmem: MAX_MEM },
    );
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  } catch {
    // Tham số vô lý (vd N không phải luỹ thừa 2) làm scryptSync throw.
    return false;
  }
}
