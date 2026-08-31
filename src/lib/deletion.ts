/**
 * Luật xoá đơn và khách (v6).
 *
 * Chính sách: xoá CỨNG, nhưng chỉ với đơn CHƯA để lại dấu vết nào. Không
 * dùng xoá mềm — xoá mềm buộc thêm điều kiện lọc vào rất nhiều câu SQL đang
 * có (danh sách, ba báo cáo tài chính, ví ¥, tồn kho); sót một chỗ là báo
 * cáo sai âm thầm.
 *
 * Module thuần, không phụ thuộc DB.
 */
import { STATUS_LABELS, type OrderStatus } from "./order-status.ts";

export type DeleteCheck = { ok: true } | { ok: false; reason: string };

export type OrderDeleteFacts = {
  status: OrderStatus;
  /** Tổng ¥ đã trừ khỏi ví cho đơn này (Σ các dòng 'chi'/'dieu_chinh'). */
  cnySpent: number;
  paymentCount: number;
  expenseCount: number;
};

/**
 * Ba trạng thái này nghĩa là tồn kho đã được cộng theo đơn — xoá đơn thì số
 * tồn còn đó mà nguồn gốc biến mất.
 */
const STOCK_TOUCHED: readonly OrderStatus[] = [
  "ve_kho_vn",
  "hoan_tat",
  "khach_bom",
];

export function canDeleteOrder(facts: OrderDeleteFacts): DeleteCheck {
  if (facts.cnySpent > 0)
    return {
      ok: false,
      reason: `Đơn đã trừ ${facts.cnySpent}¥ khỏi ví — dùng Hủy hoặc Sự cố thay vì xoá.`,
    };

  if (facts.paymentCount > 0)
    return {
      ok: false,
      reason: `Đơn đã có ${facts.paymentCount} phiếu thu tiền — xoá phiếu thu trước, hoặc dùng Hủy.`,
    };

  if (facts.expenseCount > 0)
    return {
      ok: false,
      reason: `Đơn đã có ${facts.expenseCount} khoản chi ghi vào sổ — xoá khoản chi trước, hoặc dùng Hủy.`,
    };

  if (STOCK_TOUCHED.includes(facts.status))
    return {
      ok: false,
      reason: `Đơn ở "${STATUS_LABELS[facts.status]}" đã cộng tồn kho — không xoá được.`,
    };

  return { ok: true };
}

export function canDeleteCustomer(facts: { orderCount: number }): DeleteCheck {
  if (facts.orderCount > 0)
    return {
      ok: false,
      reason: `Khách còn ${facts.orderCount} đơn — xoá đơn trước.`,
    };
  return { ok: true };
}
