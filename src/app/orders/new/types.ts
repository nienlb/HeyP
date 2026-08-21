import type { ImageKind } from "@/lib/zalo-extract";

export type ItemRow = {
  name: string;
  productUrl: string;
  attributes: string;
  quantity: string;
  unitPriceCny: string;
  /** false = giá ¥ do máy gợi ý, chưa ai xác nhận. */
  costConfirmed: boolean;
};

export const emptyItem: ItemRow = {
  name: "",
  productUrl: "",
  attributes: "",
  quantity: "1",
  unitPriceCny: "",
  costConfirmed: true,
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
