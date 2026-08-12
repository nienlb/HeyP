import type { ShipStatus } from "./order-gaps";
import type { ZaloExtract } from "./zalo-extract";

/**
 * Gộp dữ liệu AI đọc được vào form đang có.
 *
 * MỖI LẦN GỌI ỨNG VỚI ĐÚNG MỘT ẢNH — trước đây thả nhiều ảnh cùng lúc gộp
 * chung vào MỘT lần gọi Gemini, nhờ Gemini tự "gộp toàn bộ dữ liệu đơn đọc
 * được từ mọi ảnh vào một object duy nhất". Khi ảnh 1 là chốt đơn (có Total/
 * sản phẩm) và ảnh 2 là thông tin khách (không có), Gemini không phải lúc
 * nào cũng gộp đúng — có lúc trả về thiếu Total/sản phẩm dù ảnh 1 rõ ràng có
 * đủ. Lỗi này KHÔNG sửa được ở tầng gộp state, vì code chỉ nhận được đúng
 * MỘT object đã lỡ thiếu, không có gì để cứu. Cách sửa tận gốc: gọi Gemini
 * riêng cho từng ảnh, tự gộp kết quả bằng code xác định — không tin AI tự
 * gộp nhiều ảnh.
 *
 * Nguyên tắc gộp: chỉ điền trường nào lần đọc NÀY thực sự có giá trị; không
 * bao giờ xoá trắng dữ liệu đã điền từ trước.
 *
 * Module thuần — không phụ thuộc React/DOM, để test được đầy đủ mọi tổ hợp.
 */

export type MoneyFields = {
  customerMode: "existing" | "new";
  newCustomerName: string;
  newCustomerPhone: string;
  newCustomerAddress: string;
  /** Total đã chốt, dạng chuỗi để khớp input — "" nghĩa là chưa có. */
  quotedTotal: string;
  deposit: string;
  shipStatus: ShipStatus;
  shippingFee: string;
};

export type MoneyPatch = Partial<MoneyFields>;

export type MergeMoneyResult = {
  patch: MoneyPatch;
  /** Mô tả ngắn những gì lần đọc này thực sự góp thêm, để báo cho người dùng. */
  found: string[];
};

export function mergeMoneyFields(extract: ZaloExtract): MergeMoneyResult {
  const patch: MoneyPatch = {};
  const found: string[] = [];

  if (extract.customerName || extract.customerPhone || extract.customerAddress) {
    patch.customerMode = "new";
    if (extract.customerName) patch.newCustomerName = extract.customerName;
    if (extract.customerPhone) patch.newCustomerPhone = extract.customerPhone;
    if (extract.customerAddress) patch.newCustomerAddress = extract.customerAddress;
    found.push("thông tin khách");
  }

  // ">0", KHÔNG PHẢI "!= null": Gemini có thể trả totalVnd/depositVnd = 0
  // (số 0 THẬT, không phải null) khi ảnh không có nội dung đơn hàng nào —
  // bắt được khi kiểm bằng ảnh thật không liên quan. Total/cọc = 0₫ không
  // có ý nghĩa kinh doanh nào (không đơn nào bán 0 đồng), nên coi 0 như
  // "ảnh này không có" — tuyệt đối không ghi đè Total/cọc thật đã có.
  if (extract.totalVnd != null && extract.totalVnd > 0) {
    patch.quotedTotal = String(extract.totalVnd);
    found.push(`Total ${extract.totalVnd.toLocaleString("vi-VN")}₫`);
  }
  if (extract.depositVnd != null && extract.depositVnd > 0) {
    patch.deposit = String(extract.depositVnd);
    found.push(`Cọc ${extract.depositVnd.toLocaleString("vi-VN")}₫`);
  }

  // Kiểm shipUnknown TRƯỚC, VÀ đòi shipVnd > 0: kiểm bằng ảnh thật không
  // liên quan gì tới đơn hàng cho thấy Gemini có thể trả shipUnknown:false
  // + shipVnd:0 dù ảnh chẳng nhắc gì tới ship — không đáng tin để dựa hoàn
  // toàn vào cờ shipUnknown. Ship = 0₫ chỉ có ý nghĩa qua đường shipFree
  // (freeship rõ ràng); "set 0đ" trần trụi coi như không có dữ liệu, thà bỏ
  // sót còn hơn âm thầm ghi sai số tiền.
  if (extract.shipFree) {
    patch.shipStatus = "free";
    patch.shippingFee = "0";
    found.push("freeship");
  } else if (!extract.shipUnknown && extract.shipVnd != null && extract.shipVnd > 0) {
    patch.shipStatus = "set";
    patch.shippingFee = String(extract.shipVnd);
    found.push(`ship ${extract.shipVnd.toLocaleString("vi-VN")}₫`);
  }

  return { patch, found };
}

export type MergeableItem = {
  name: string;
  productUrl: string;
  attributes: string;
  quantity: string;
  unitPriceCny: string;
  costConfirmed: boolean;
};

/**
 * Gộp danh sách sản phẩm mới đọc được vào danh sách hiện có. Danh sách hiện
 * tại còn là MỘT dòng trống ban đầu (chưa ai gõ gì) → thay thế; đã có dữ
 * liệu thật (từ lần đọc trước) → nối thêm, không xoá — cho phép đọc nhiều
 * ảnh sản phẩm/chốt đơn riêng biệt mà không mất dòng đã có.
 */
export function mergeItems(
  current: MergeableItem[],
  newRows: MergeableItem[],
): MergeableItem[] {
  if (newRows.length === 0) return current;
  const untouched = current.length === 1 && current[0].name.trim() === "";
  return untouched ? newRows : [...current, ...newRows];
}
