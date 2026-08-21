/**
 * Cờ "cần bổ sung" của đơn (spec v3-A mục 5.2).
 *
 * Cờ KHÔNG lưu trong DB — tính lại mỗi lần đọc, nên không bao giờ lệch với
 * thực tế. Cờ chỉ NHẮC, không chặn: đơn vẫn chạy trạng thái bình thường.
 *
 * Module thuần, không phụ thuộc DB.
 */
// Đuôi .ts tường minh: module này được test nạp thẳng bằng node, mà node cần
// đường dẫn đầy đủ. tsconfig đã bật allowImportingTsExtensions nên Next/tsc
// vẫn hiểu.
import {
  journeyTrack,
  type OrderStatus,
  type OrderType,
} from "./order-status.ts";
import type { PhotoLabel } from "./photos.ts";

export const GAP_CODES = [
  "thieu_khach",
  "thieu_gia_von",
  "thieu_anh_sp",
  "thieu_ship",
] as const;
export type GapCode = (typeof GAP_CODES)[number];

export const GAP_LABELS: Record<GapCode, string> = {
  thieu_khach: "Thiếu thông tin khách",
  thieu_gia_von: "Thiếu giá vốn (¥)",
  thieu_anh_sp: "Thiếu ảnh sản phẩm",
  thieu_ship: "Chưa nhập phí ship",
};

export type ShipStatus = "unknown" | "free" | "set";

export type GapOrder = {
  orderType: OrderType;
  status: OrderStatus;
  customerId: number | null;
  customerPhone: string | null;
  customerAddress: string | null;
  shipStatus: ShipStatus;
};
export type GapItem = { costConfirmed: boolean };
export type GapPhoto = { label: PhotoLabel };

/**
 * Từ khâu này trở đi mới nhắc nhập phí ship. Ở v4, "da_mua_tq" mang nghĩa
 * "đã mua, đang về" — bao trọn khoảng hàng trên đường, nên đây là mốc sớm
 * nhất còn hợp lý. Gaps chỉ nhắc chứ không chặn, thà sớm còn hơn phát hiện
 * lúc đã giao hàng.
 */
const SHIP_REMINDER_FROM: OrderStatus = "da_mua_tq";

function blank(s: string | null): boolean {
  return s === null || s.trim() === "";
}

export function orderGaps(
  order: GapOrder,
  items: GapItem[],
  photos: GapPhoto[],
): GapCode[] {
  // Đơn đã huỷ thì không còn gì để đòi bổ sung.
  if (order.status === "huy") return [];

  const gaps: GapCode[] = [];

  if (
    order.customerId === null ||
    blank(order.customerPhone) ||
    blank(order.customerAddress)
  ) {
    gaps.push("thieu_khach");
  }

  // Hàng bán từ kho có giá vốn ở orders.sale_cost, không tính bằng ¥.
  if (order.orderType !== "ban_tu_kho" && items.some((it) => !it.costConfirmed)) {
    gaps.push("thieu_gia_von");
  }

  if (!photos.some((p) => p.label === "product")) {
    gaps.push("thieu_anh_sp");
  }

  // Nhắc ship dựa trên TRỤC CỦA CHÍNH LOẠI ĐƠN (v4 — mỗi loại đơn một trục),
  // không phải một trục chung: đơn nhap_kho kết ở "ve_kho_vn" (mã không nằm
  // trên trục order_ho), tra vào trục chung sẽ ra -1 và tắt mất lời nhắc đúng
  // lúc phí ship vừa mới biết được.
  //
  // Trạng thái nhánh (su_co / khach_bom) không nằm trên trục → indexOf = -1.
  // Với đơn order_ho / nhap_kho, mốc nhắc nằm trên trục nên -1 < mốc → không
  // nhắc. Với ban_tu_kho, trục không có "da_mua_tq" nên mốc cũng là -1: đơn
  // bán từ kho bắt đầu ngay ở khâu đã giao, ship phải biết ngay từ đầu.
  const chain = journeyTrack(order.orderType) as readonly string[];
  const at = chain.indexOf(order.status);
  const remindFrom = chain.indexOf(SHIP_REMINDER_FROM);
  if (order.shipStatus === "unknown" && at >= remindFrom) {
    gaps.push("thieu_ship");
  }

  return gaps;
}
