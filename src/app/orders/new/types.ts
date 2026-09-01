import type { ImageKind } from "@/lib/zalo-extract";

/** Ảnh đã upload xong, gắn vào một dòng món. */
export type ItemPhoto = { id: number; url: string };

export type ItemRow = {
  name: string;
  productUrl: string;
  attributes: string;
  quantity: string;
  /** Giá phải thu của khách cho 1 CÁI (₫) — ô nhập chính từ v6. */
  sellPriceVnd: string;
  /** Giá vốn ¥ mỗi cái. Từ v6 thường là số suy ngược từ sellPriceVnd. */
  unitPriceCny: string;
  /** false = giá ¥ do máy gợi ý, chưa ai xác nhận. */
  costConfirmed: boolean;
  photos: ItemPhoto[];
};

export const emptyItem: ItemRow = {
  name: "",
  productUrl: "",
  attributes: "",
  quantity: "1",
  sellPriceVnd: "",
  unitPriceCny: "",
  costConfirmed: true,
  photos: [],
};

export type CustomerOption = {
  id: number;
  name: string;
  warningFlag: boolean;
  warningReason: string | null;
};

/** Ảnh ĐÃ ĐỌC XONG (đã lưu server, có id thật), kèm loại AI phân ra (sửa được). */
export type DroppedPhoto = { id: number; kind: ImageKind; name: string };

/** Ảnh mới thả/chọn, CHƯA gửi lên server — chỉ nằm trong hàng chờ của trình duyệt. */
export type PendingPhoto = { file: File; url: string };
