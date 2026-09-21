import type { ImageKind } from "@/lib/zalo-extract";

// ItemPhotos giờ dùng chung cho cả màn tạo đơn lẫn màn thêm món vào đơn đã
// tạo, nên kiểu ở cạnh component. Nhập lại và xuất tiếp để chỗ cũ khỏi sửa.
import type { ItemPhoto } from "@/app/_components/item-photos";
export type { ItemPhoto };

export type ItemRow = {
  name: string;
  productUrl: string;
  /** v9-A: giữ lại để đọc đơn cũ. Món tạo mới dùng size/color bên dưới. */
  attributes: string;
  size: string;
  color: string;
  /** Mẫu trong danh mục mà món này lấy ra, nếu có. */
  productId: number | null;
  /** Dãy size/màu của mẫu — chỉ để hiện chip gợi ý, KHÔNG gửi lên server. */
  sizeOptions: string[];
  colorOptions: string[];
  quantity: string;
  /** Giá phải thu của khách cho 1 CÁI (₫) — ô nhập chính từ v6. */
  sellPriceVnd: string;
  /** Giá vốn ¥ mỗi cái. Từ v6 thường là số suy ngược từ sellPriceVnd. */
  unitPriceCny: string;
  /** false = giá ¥ do máy gợi ý, chưa ai xác nhận. */
  costConfirmed: boolean;
  photos: ItemPhoto[];
  /** v9-C: món lấy từ dòng tồn (đơn Bán từ kho). null = món order hộ. */
  inventoryId: number | null;
  /** Số tồn lúc chọn — chặn gõ quá ở client; server kiểm lại trong transaction. */
  stockLeft: number;
};

export const emptyItem: ItemRow = {
  name: "",
  productUrl: "",
  attributes: "",
  size: "",
  color: "",
  productId: null,
  sizeOptions: [],
  colorOptions: [],
  quantity: "1",
  sellPriceVnd: "",
  unitPriceCny: "",
  costConfirmed: true,
  photos: [],
  inventoryId: null,
  stockLeft: 0,
};

export type CustomerOption = {
  id: number;
  name: string;
  /** v9-C: hiện dưới tên và dùng để tìm — tên không phải định danh duy nhất. */
  phone: string | null;
  warningFlag: boolean;
  warningReason: string | null;
};

/** Ảnh ĐÃ ĐỌC XONG (đã lưu server, có id thật), kèm loại AI phân ra (sửa được). */
export type DroppedPhoto = { id: number; kind: ImageKind; name: string };

/** Ảnh mới thả/chọn, CHƯA gửi lên server — chỉ nằm trong hàng chờ của trình duyệt. */
export type PendingPhoto = { file: File; url: string };

/** Dòng tồn còn hàng — cùng hình với SellableStockRow của src/db/queries.ts. */
export type StockOption = {
  id: number;
  name: string;
  size: string;
  color: string;
  quantity: number;
  avgCost: number;
  source: string;
  productId: number | null;
  defaultSellVnd: number | null;
  photoId: number | null;
};
