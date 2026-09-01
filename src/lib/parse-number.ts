/**
 * Đọc số người dùng gõ. MỘT nguồn chân lý cho cả client lẫn server.
 *
 * VÌ SAO PHẢI CÓ FILE NÀY: trước đây mỗi màn tự viết một hàm `num()`, và
 * chúng mâu thuẫn nhau về ý nghĩa DẤU CHẤM. Hậu quả là hai bug tiền thật:
 *
 *   1. Ô Cọc/Phí ship định dạng "500.000" rồi gửi thẳng lên server, nơi hàm
 *      `num()` chỉ bỏ dấu phẩy. `Number("500.000")` = 500 — KHÔNG lỗi, chỉ
 *      âm thầm sai 1000 lần. Cọc 500.000₫ vào DB thành 500₫.
 *   2. Ngược lại, dùng parser kiểu VND cho giá ¥ biến "207.5" thành 2075,
 *      sai giá vốn ~10 lần.
 *
 * Hai loại số, hai luật, không được dùng lẫn:
 *   - Tiền VND        → `parseVnd`     (dấu chấm = NGĂN NGHÌN, bỏ đi)
 *   - Giá ¥ / tỷ giá  → `parseDecimal` (dấu chấm = THẬP PHÂN, giữ lại)
 *
 * Module thuần, không phụ thuộc DB hay React.
 */

/**
 * Tiền VND — luôn là số nguyên đồng. Dấu chấm, dấu phẩy và khoảng trắng đều
 * là ngăn nghìn theo cách viết của người Việt ("4.520.000"), bỏ hết.
 *
 * Không đọc được → 0. Không throw: form nhập liệu không nên vỡ vì một ô gõ dở.
 */
export function parseVnd(raw: unknown): number {
  const cleaned = String(raw ?? "").replace(/[.,\s]/g, "");
  if (cleaned === "") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Số có phần thập phân — giá ¥ (207.5) và tỷ giá. Dấu chấm là DẤU THẬP PHÂN
 * nên phải giữ; chỉ bỏ dấu phẩy (ngăn nghìn kiểu Anh) và khoảng trắng.
 */
export function parseDecimal(raw: unknown): number {
  const cleaned = String(raw ?? "").replace(/[,\s]/g, "");
  if (cleaned === "") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 4520000 → "4.520.000", để hiện lại trong ô nhập.
 *
 * Chuỗi rỗng/trắng giữ nguyên: ô đang trống thì đừng biến thành "0", người
 * dùng sẽ phải xoá đi trước khi gõ.
 *
 * Bất biến (được test khoá): `parseVnd(groupVnd(x)) === x`.
 */
export function groupVnd(raw: string): string {
  if (raw.trim() === "") return raw;
  const n = parseVnd(raw);
  return Number.isFinite(n) ? n.toLocaleString("vi-VN") : raw;
}
