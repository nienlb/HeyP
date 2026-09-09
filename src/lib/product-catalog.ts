/**
 * Danh mục sản phẩm (v9-A). Module THUẦN — không import gì có alias `@/`,
 * không đụng DB, để test chạy bằng `node --test` không cần dựng Next.
 *
 * Dãy size và dãy màu lưu thành CHUỖI PHÂN CÁCH PHẨY chứ không phải mảng
 * Postgres: lớp Exec (src/db/raw.ts) đang đổi placeholder `?` sang `$n` và
 * chưa từng chạm kiểu mảng — thêm kiểu mới ở đó là rủi ro không cần thiết.
 */

/** Cắt chuỗi thành danh sách: bỏ khoảng trắng thừa, bỏ rỗng, bỏ trùng. */
export function parseList(s: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of (s ?? "").split(",")) {
    const v = raw.trim().replace(/\s+/g, " ");
    if (v === "") continue;
    // Trùng xét KHÔNG phân biệt hoa thường ("Đen" và "đen" là một), nhưng giữ
    // đúng cách gõ lần đầu để hiển thị theo ý người nhập.
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/**
 * Nối danh sách để ghi xuống DB. Đi qua parseList để chuẩn hoá luôn — nhờ vậy
 * bất biến `parseList(formatList(parseList(s))) === parseList(s)` luôn đúng.
 *
 * Phần tử chứa dấu phẩy sẽ bị tách làm đôi: dấu phẩy là ký tự ngăn cách và
 * không có escape. Ô nhập là chip nên người dùng không gõ được dấu phẩy vào
 * một chip — chấp nhận có chủ đích, có test ghi lại.
 */
export function formatList(items: string[]): string {
  return parseList(items.join(",")).join(",");
}

/**
 * Chuỗi biến thể để hiển thị.
 *
 * Ưu tiên hai cột mới; cả hai trống thì rơi về `attributes` cũ. Nhờ vậy đơn
 * tạo trước v9-A hiện y hệt như trước, không cần backfill và không mất chữ
 * người dùng đã gõ.
 */
export function displayVariant(v: {
  size?: string | null;
  color?: string | null;
  attributes?: string | null;
}): string {
  const size = (v.size ?? "").trim();
  const color = (v.color ?? "").trim();
  if (size !== "" || color !== "")
    return [size, color].filter((s) => s !== "").join(" · ");
  return (v.attributes ?? "").trim();
}

/**
 * Đoán size/màu từ chuỗi `attributes` cũ, để form GỢI Ý khi mở sửa món cũ.
 *
 * CHỈ dùng để gợi ý — nơi gọi phải chờ người dùng bấm xác nhận rồi mới ghi.
 * Máy đoán sai thì người sửa; máy không được lặng lẽ đổi dữ liệu thật.
 */
export function splitLegacyAttributes(attributes: string): {
  size: string;
  color: string;
} {
  const raw = (attributes ?? "").trim();
  if (raw === "") return { size: "", color: "" };

  let size = "";
  let color = "";
  const parts = raw.split(/\s*[-–·|]\s*/).filter((p) => p !== "");

  for (const part of parts) {
    const labelledSize = /^size\s*[:.]?\s*(.+)$/i.exec(part);
    if (labelledSize) {
      if (size === "") size = labelledSize[1].trim();
      continue;
    }
    const labelledColor = /^m[àa]u\s*[:.]?\s*(.+)$/i.exec(part);
    if (labelledColor) {
      if (color === "") color = labelledColor[1].trim();
      continue;
    }
    // "39 đen" — số dẫn đầu là size, phần còn lại là màu.
    const both = /^(\d{2}(?:[.,]5)?)\s+(.+)$/.exec(part);
    if (both) {
      if (size === "") size = both[1].replace(",", ".");
      if (color === "") color = both[2].trim();
      continue;
    }
    if (/^\d{2}(?:[.,]5)?$/.test(part)) {
      if (size === "") size = part.replace(",", ".");
      continue;
    }
    if (color === "") color = part;
  }

  return { size, color };
}
