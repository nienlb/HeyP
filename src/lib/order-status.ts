/**
 * Luật vòng đời & chuyển trạng thái đơn hàng (spec mục 4).
 *
 * Trục xương sống (main chain):
 *   Chờ báo giá → Đã báo giá → Khách chốt → Đã mua hàng TQ → Về kho TQ
 *   → Đang vận chuyển VN → Về kho/điểm nhận VN → Đã giao khách → Hoàn tất
 *
 * Nhánh: Hủy, Sự cố, Khách bom.
 *
 * Chính sách (khoá bởi unit test — tài liệu hoá rõ để không mơ hồ):
 *   - Trên trục chính chỉ được TIẾN đúng 1 bước (không nhảy cóc, không lùi).
 *   - Ngoại lệ: đơn `ban_tu_kho` được nhảy thẳng tới "Đã giao khách".
 *   - Hủy: chỉ khi chưa mua hàng (cho_bao_gia / da_bao_gia / khach_chot).
 *   - Sự cố: ở các khâu đang lưu thông (từ "Đã mua TQ" tới "Đã giao khách").
 *   - Khách bom: chỉ ở khâu giao (ve_kho_vn / da_giao_khach).
 *   - Sự cố CHƯA phải trạng thái cuối: giải quyết xong quay lại trục chính,
 *     hoặc chuyển sang Hủy / Khách bom.
 *   - Trạng thái cuối (không có bước ra): Hoàn tất, Hủy, Khách bom.
 *
 * Module thuần, không phụ thuộc DB.
 */

export const ORDER_TYPES = ["order_ho", "nhap_kho", "ban_tu_kho"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  order_ho: "Order hộ",
  nhap_kho: "Nhập kho",
  ban_tu_kho: "Bán từ kho",
};

export const MAIN_CHAIN = [
  "cho_bao_gia",
  "da_bao_gia",
  "khach_chot",
  "da_mua_tq",
  "ve_kho_tq",
  "dang_van_chuyen_vn",
  "ve_kho_vn",
  "da_giao_khach",
  "hoan_tat",
] as const;

export const BRANCH_STATUSES = ["huy", "su_co", "khach_bom"] as const;

export const ORDER_STATUSES = [...MAIN_CHAIN, ...BRANCH_STATUSES] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  cho_bao_gia: "Chờ báo giá",
  da_bao_gia: "Đã báo giá",
  khach_chot: "Khách chốt",
  da_mua_tq: "Đã mua hàng TQ",
  ve_kho_tq: "Về kho TQ",
  dang_van_chuyen_vn: "Đang vận chuyển VN",
  ve_kho_vn: "Về kho/điểm nhận VN",
  da_giao_khach: "Đã giao khách",
  hoan_tat: "Hoàn tất",
  huy: "Hủy",
  su_co: "Sự cố",
  khach_bom: "Khách bom",
};

const TERMINAL: readonly OrderStatus[] = ["hoan_tat", "huy", "khach_bom"];
const CANCELLABLE_FROM: readonly OrderStatus[] = [
  "cho_bao_gia",
  "da_bao_gia",
  "khach_chot",
];
const INCIDENT_FROM: readonly OrderStatus[] = [
  "da_mua_tq",
  "ve_kho_tq",
  "dang_van_chuyen_vn",
  "ve_kho_vn",
  "da_giao_khach",
];
const BOMB_FROM: readonly OrderStatus[] = ["ve_kho_vn", "da_giao_khach"];
/** Sau khi giải quyết sự cố, được quay lại các khâu đang lưu thông này. */
const INCIDENT_RESUME: readonly OrderStatus[] = [
  "da_mua_tq",
  "ve_kho_tq",
  "dang_van_chuyen_vn",
  "ve_kho_vn",
  "da_giao_khach",
];

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL.includes(status);
}

/** Danh sách trạng thái được phép chuyển tới từ `from`, theo loại đơn. */
export function allowedNextStatuses(
  orderType: OrderType,
  from: OrderStatus,
): OrderStatus[] {
  if (isTerminal(from)) return [];

  const result = new Set<OrderStatus>();

  if (from === "su_co") {
    for (const s of INCIDENT_RESUME) result.add(s);
    result.add("huy");
    result.add("khach_bom");
    return [...result];
  }

  // Từ đây `from` chắc chắn là một trạng thái trên trục chính.
  const i = (MAIN_CHAIN as readonly string[]).indexOf(from);

  // Tiến đúng 1 bước.
  if (i >= 0 && i < MAIN_CHAIN.length - 1) result.add(MAIN_CHAIN[i + 1]);

  // Ngoại lệ: đơn bán từ kho nhảy thẳng tới "Đã giao khách".
  if (orderType === "ban_tu_kho") {
    const deliveredIdx = (MAIN_CHAIN as readonly string[]).indexOf("da_giao_khach");
    if (i >= 0 && i < deliveredIdx) result.add("da_giao_khach");
  }

  if (CANCELLABLE_FROM.includes(from)) result.add("huy");
  if (INCIDENT_FROM.includes(from)) result.add("su_co");
  if (BOMB_FROM.includes(from)) result.add("khach_bom");

  return [...result];
}

export function canTransition(
  orderType: OrderType,
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return allowedNextStatuses(orderType, from).includes(to);
}

export type TransitionResult =
  | { ok: true; to: OrderStatus }
  | { ok: false; reason: string };

/** Kiểm tra & trả kết quả chuyển trạng thái (dùng khi cập nhật đơn). */
export function transition(
  orderType: OrderType,
  from: OrderStatus,
  to: OrderStatus,
): TransitionResult {
  if (from === to) return { ok: false, reason: "Trạng thái không thay đổi" };
  if (!ORDER_STATUSES.includes(to))
    return { ok: false, reason: "Trạng thái đích không hợp lệ" };
  if (!canTransition(orderType, from, to)) {
    return {
      ok: false,
      reason: `Không được chuyển từ "${STATUS_LABELS[from]}" sang "${STATUS_LABELS[to]}"`,
    };
  }
  return { ok: true, to };
}
