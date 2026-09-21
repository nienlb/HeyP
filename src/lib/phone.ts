/**
 * SĐT khách — chuẩn hoá để TÌM, không để lưu. Module thuần.
 *
 * Khách gõ SĐT đủ kiểu: "0912.345.678", "+84 912 345 678", "(091) 234-5678".
 * So chuỗi thô thì "0912" không khớp "+84 912…", nên cả hai phía đều qua
 * normalizePhone trước khi so.
 */
export function normalizePhone(s: string): string {
  const raw = s.trim();
  const digits = raw.replace(/\D/g, "");
  // "+84" là mã nước rõ ràng, đổi ngay kể cả khi gõ dở.
  if (raw.startsWith("+84")) return "0" + digits.slice(2);
  // "84" không có dấu + chỉ đổi khi đủ dài một số di động (84 + 9 số);
  // số ngắn bắt đầu bằng 84 có thể là đoạn giữa số người ta đang gõ.
  if (digits.startsWith("84") && digits.length >= 11) return "0" + digits.slice(2);
  return digits;
}

/** Chuỗi gõ vào có phải đang tìm SĐT không. Có thì trả về số đã chuẩn hoá. */
export function phoneNeedle(q: string): string | null {
  const t = q.trim();
  if (!/^[\d\s.+()-]+$/.test(t)) return null;
  if (t.replace(/\D/g, "").length < 3) return null;
  return normalizePhone(t);
}

export function matchesCustomer(
  c: { name: string; phone: string | null },
  q: string,
): boolean {
  const needle = q.trim().toLowerCase();
  if (needle === "") return true;
  if (c.name.toLowerCase().includes(needle)) return true;
  const p = phoneNeedle(q);
  return p !== null && c.phone !== null && normalizePhone(c.phone).includes(p);
}
