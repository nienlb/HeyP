/** Nhãn loại ảnh (spec mục 5.6). Module thuần — dùng cả client + schema. */

export const PHOTO_LABELS = [
  "product", // Ảnh sản phẩm (từ shop TQ)
  "zalo_confirm", // Ảnh chốt đơn Zalo (bằng chứng khách chốt)
  "actual", // Ảnh thực tế (chụp khi nhận hàng)
  "listing", // Ảnh đăng bán
] as const;

export type PhotoLabel = (typeof PHOTO_LABELS)[number];

export const PHOTO_LABEL_LABELS: Record<PhotoLabel, string> = {
  product: "Ảnh sản phẩm",
  // Nguồn ảnh không nhất thiết là Zalo. Giá trị enum trong DB vẫn là
  // 'zalo_confirm' — đổi nó cần migration và làm hỏng các dòng ảnh cũ.
  zalo_confirm: "Ảnh chốt đơn",
  actual: "Ảnh thực tế",
  listing: "Ảnh đăng bán",
};

/** Đuôi file ảnh cho phép & content-type tương ứng. */
export const IMAGE_CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
};

export function extFromContentType(ct: string): string | null {
  const found = Object.entries(IMAGE_CONTENT_TYPES).find(([, v]) => v === ct);
  return found ? found[0] : null;
}

export function contentTypeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_CONTENT_TYPES[ext] ?? "application/octet-stream";
}

/**
 * Hậu tố của bản ảnh nhỏ. Mỗi ảnh lưu HAI file trên Storage: bản chính để
 * xem/tải, và bản nhỏ cho danh sách + lưới ảnh.
 *
 * Lý do: bản chính ~70KB còn bản nhỏ ~8KB. Màn danh sách/lưới hiển thị ảnh ở
 * 40–140px mà tải bản chính là phí băng thông gấp ~10 lần — Supabase free
 * tier tính cả dung lượng lưu lẫn băng thông tải xuống.
 */
const THUMB_SUFFIX = "_t";

/**
 * `abc.webp` → `abc_t.webp`. Không có đuôi thì nối thẳng vào cuối.
 *
 * Thuần chuỗi, không đụng Storage — để test được và để route ảnh suy ra tên
 * bản nhỏ mà không cần thêm cột trong DB.
 */
export function thumbFileName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) return `${fileName}${THUMB_SUFFIX}`;
  return `${fileName.slice(0, dot)}${THUMB_SUFFIX}${fileName.slice(dot)}`;
}

/** Bản ảnh cần lấy. `thumb` chỉ dùng cho chỗ hiển thị nhỏ (≤140px). */
export type PhotoVariant = "full" | "thumb" | "download";

/**
 * Một nguồn chân lý cho đường dẫn ảnh — tránh mỗi chỗ tự ghép chuỗi rồi quên
 * mất `?size=thumb`, làm danh sách tải bản chính nặng gấp ~10 lần.
 */
export function photoUrl(id: number, variant: PhotoVariant = "full"): string {
  const base = `/api/photo/${id}`;
  if (variant === "thumb") return `${base}?size=thumb`;
  if (variant === "download") return `${base}?download`;
  return base;
}
