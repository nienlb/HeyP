/**
 * Kế hoạch chuyển bước hàng loạt (v6).
 *
 * Mỗi loại đơn đi một trục riêng nên "bước tiếp theo" khác nhau tuỳ đơn.
 * Module này gom các đơn được chọn thành từng nhóm cùng phép chuyển, để Sheet
 * xác nhận nói rõ chuyện gì sắp xảy ra thay vì bắt người dùng bấm mù.
 *
 * Module thuần, không phụ thuộc DB.
 */
import {
  allowedNextStatuses,
  isTerminalFor,
  STATUS_LABELS,
  type OrderStatus,
  type OrderType,
} from "./order-status.ts";

/** Trần mỗi lượt: thao tác chạy TUẦN TỰ, không được chạm maxDuration Vercel. */
export const BULK_LIMIT = 50;

export type BulkOrder = {
  id: number;
  orderType: OrderType;
  status: OrderStatus;
  goodsTotalCny: number;
};

export type BulkGroup = {
  from: OrderStatus;
  to: OrderStatus;
  ids: number[];
  /** ¥ sẽ bị trừ khỏi ví nếu xác nhận nhóm này. 0 nếu nhóm không tiêu ¥. */
  cnyTotal: number;
};

export type BulkPlan = {
  groups: BulkGroup[];
  skipped: { id: number; reason: string }[];
  /** Số đơn thật sự sẽ chuyển. */
  total: number;
};

/**
 * Bước tiếp theo TRÊN TRỤC của loại đơn — không phải nhánh.
 *
 * `allowedNextStatuses` trả cả nhánh (huỷ, sự cố, khách bom); thao tác hàng
 * loạt chỉ đi thẳng, nên lọc bỏ nhánh. Đơn đang ở `su_co` có nhiều đường ra
 * hợp lệ — máy không tự chọn hộ, bỏ qua để người dùng xử tay từng đơn.
 */
function forwardStep(order: BulkOrder): OrderStatus | null {
  if (order.status === "su_co") return null;
  const branches: readonly OrderStatus[] = ["huy", "su_co", "khach_bom"];
  const next = allowedNextStatuses(order.orderType, order.status).filter(
    (s) => !branches.includes(s),
  );
  return next.length === 1 ? next[0] : null;
}

export function planBulkAdvance(orders: BulkOrder[]): BulkPlan {
  const byKey = new Map<string, BulkGroup>();
  const skipped: { id: number; reason: string }[] = [];

  for (const order of orders) {
    if (isTerminalFor(order.orderType, order.status)) {
      skipped.push({
        id: order.id,
        reason: `"${STATUS_LABELS[order.status]}" là bước cuối của đơn này`,
      });
      continue;
    }

    const to = forwardStep(order);
    if (!to) {
      skipped.push({
        id: order.id,
        reason:
          order.status === "su_co"
            ? "Đơn đang ở Sự cố — chọn hướng xử lý ở từng đơn"
            : `Không có bước tiếp theo từ "${STATUS_LABELS[order.status]}"`,
      });
      continue;
    }

    const key = `${order.status}→${to}`;
    const group = byKey.get(key) ?? {
      from: order.status,
      to,
      ids: [],
      cnyTotal: 0,
    };
    group.ids.push(order.id);
    // Chỉ bước sang "đã mua" mới trừ ví — xem shouldDeductCny.
    if (to === "da_mua_tq") group.cnyTotal += order.goodsTotalCny;
    byKey.set(key, group);
  }

  const groups = [...byKey.values()];
  return {
    groups,
    skipped,
    total: groups.reduce((s, g) => s + g.ids.length, 0),
  };
}
