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
