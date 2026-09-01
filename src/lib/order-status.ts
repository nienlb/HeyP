/**
 * Luật vòng đời & chuyển trạng thái đơn hàng (v4 — mỗi loại đơn một trục).
 *
 * order_ho:   khach_chot → da_mua_tq → da_giao_khach → hoan_tat
 * nhap_kho:   da_mua_tq → ve_kho_vn
 * ban_tu_kho: da_giao_khach → hoan_tat
 *
 * Nhánh: Hủy, Sự cố, Khách bom.
 *
 * Chính sách (khoá bởi unit test — tài liệu hoá rõ để không mơ hồ):
 *   - Trên trục của một loại đơn chỉ được TIẾN đúng 1 bước (không nhảy cóc,
 *     không lùi).
 *   - Hủy: chỉ khi chưa mua hàng (khach_chot) — vì vậy chỉ đơn order_ho mới
 *     huỷ được (nhap_kho/ban_tu_kho không đi qua khach_chot).
 *   - Sự cố: ở các khâu đang lưu thông (da_mua_tq, da_giao_khach).
 *   - Khách bom: chỉ ở khâu đã giao (da_giao_khach).
 *   - Sự cố CHƯA phải trạng thái cuối: giải quyết xong quay lại khâu có trên
 *     trục của loại đơn đó, hoặc chuyển sang Hủy / Khách bom.
 *   - Trạng thái cuối toàn cục (không có bước ra): Hoàn tất, Hủy, Khách bom.
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

/**
 * Trục chính của đơn order hộ (v4 — rút từ 9 bước xuống 4).
 *
 * Tái dùng đúng các mã cũ có side-effect tiền/kho neo vào, để không phải
 * viết lại side-effect nào trong src/db/queries.ts:
 *   - da_mua_tq  → trừ ví ¥ + chốt cứng tỷ giá
 *   - ve_kho_vn  → cộng tồn kho (đơn nhap_kho)
 *   - khach_bom  → nhập kho hàng bom + gắn cờ khách
 */
export const MAIN_CHAIN = [
  "khach_chot",
  "da_mua_tq",
  "da_giao_khach",
  "hoan_tat",
] as const;

export const BRANCH_STATUSES = ["huy", "su_co", "khach_bom"] as const;

/**
 * Mã đã về hưu ở v4. KHÔNG còn xuất hiện trong luồng chạy, nhưng vẫn phải là
 * OrderStatus hợp lệ vì order_status_history cũ có thể còn giữ — UI hành
 * trình đọc bảng đó, gặp mã lạ sẽ vỡ.
 */
export const RETIRED_STATUSES = [
  "cho_bao_gia",
  "da_bao_gia",
  "ve_kho_tq",
  "dang_van_chuyen_vn",
] as const;

export const ORDER_STATUSES = [
  ...MAIN_CHAIN,
  "ve_kho_vn",
  ...BRANCH_STATUSES,
  ...RETIRED_STATUSES,
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  khach_chot: "Khách chốt",
  da_mua_tq: "Đã mua, đang về",
  ve_kho_vn: "Về kho",
  da_giao_khach: "Đã giao khách",
  hoan_tat: "Hoàn tất",
  huy: "Hủy",
  su_co: "Sự cố",
  khach_bom: "Khách bom",
  // Mã về hưu — nhãn giữ lại để hiển thị lịch sử cũ cho đúng.
  cho_bao_gia: "Chờ báo giá",
  da_bao_gia: "Đã báo giá",
  ve_kho_tq: "Về kho TQ",
  dang_van_chuyen_vn: "Đang vận chuyển VN",
};

/**
 * Mỗi loại đơn đi một trục riêng, thay vì cả ba cùng bò qua một trục chung.
 * Đơn nhập kho không có khách nên không có khâu giao; đơn bán từ kho là hàng
 * có sẵn nên không có khâu mua/vận chuyển.
 */
const TRACKS: Record<OrderType, readonly OrderStatus[]> = {
  order_ho: MAIN_CHAIN,
  nhap_kho: ["da_mua_tq", "ve_kho_vn"],
  ban_tu_kho: ["da_giao_khach", "hoan_tat"],
};

const GLOBAL_TERMINAL: readonly OrderStatus[] = ["hoan_tat", "huy", "khach_bom"];
const CANCELLABLE_FROM: readonly OrderStatus[] = ["khach_chot"];
const INCIDENT_FROM: readonly OrderStatus[] = ["da_mua_tq", "da_giao_khach"];
const BOMB_FROM: readonly OrderStatus[] = ["da_giao_khach"];

/** Ba mã kết thúc toàn cục, đúng với mọi loại đơn. */
export function isTerminal(status: OrderStatus): boolean {
  return GLOBAL_TERMINAL.includes(status);
}

/**
 * Kết thúc theo loại đơn. Khác `isTerminal` ở chỗ: `ve_kho_vn` là điểm kết
 * của đơn nhap_kho nhưng không phải mã kết thúc toàn cục.
 */
export function isTerminalFor(
  orderType: OrderType,
  status: OrderStatus,
): boolean {
  if (isTerminal(status)) return true;
  const track = TRACKS[orderType];
  return track[track.length - 1] === status;
}

/**
 * Đơn đã chốt sổ thì danh sách món khoá lại — sửa món của đơn đã hoàn tất
 * sẽ làm lệch báo cáo lãi của tháng đã chốt.
 */
const ITEMS_LOCKED: readonly OrderStatus[] = ["hoan_tat", "huy", "khach_bom"];

export function canEditOrderItems(status: OrderStatus): boolean {
  return !ITEMS_LOCKED.includes(status);
}

/**
 * Tỷ giá chỉ sửa được khi đơn CHƯA mua hàng.
 *
 * Từ `da_mua_tq` trở đi, tỷ giá đã dùng để chốt giá vốn thật và trừ ví ¥
 * (xem shouldDeductCny). Đổi nó sau đó làm sai lãi đã ghi nhận, và không có
 * cách nào sửa lại sổ ví cho khớp — sổ ví là append-only.
 */
export function canEditExchangeRate(status: OrderStatus): boolean {
  return status === "khach_chot";
}

/** Trạng thái một đơn mới được tạo ra — bước đầu của trục theo loại đơn. */
export function initialStatus(orderType: OrderType): OrderStatus {
  return TRACKS[orderType][0];
}

/** Các mốc hiển thị trên "hành trình đơn hàng" (UI). */
export function journeyTrack(orderType: OrderType): readonly OrderStatus[] {
  return TRACKS[orderType];
}

/** Sau khi giải quyết sự cố, quay lại được khâu nào — chỉ khâu có trên trục. */
function incidentResumeFor(orderType: OrderType): OrderStatus[] {
  return INCIDENT_FROM.filter((s) => TRACKS[orderType].includes(s));
}

export function allowedNextStatuses(
  orderType: OrderType,
  from: OrderStatus,
): OrderStatus[] {
  if (isTerminalFor(orderType, from)) return [];

  const result = new Set<OrderStatus>();

  if (from === "su_co") {
    for (const s of incidentResumeFor(orderType)) result.add(s);
    // Huỷ / Khách bom chỉ mở khi trục của loại đơn này thật sự đi qua khâu mà
    // hai nhánh đó neo vào. Đơn nhap_kho không có "khach_chot" (đã trả tiền
    // NCC → không huỷ được) và không có "da_giao_khach" (không có khách để
    // bom, mà nhánh khach_bom lại kéo theo side-effect nhập kho hàng bom).
    if (CANCELLABLE_FROM.some((s) => TRACKS[orderType].includes(s)))
      result.add("huy");
    if (BOMB_FROM.some((s) => TRACKS[orderType].includes(s)))
      result.add("khach_bom");
    return [...result];
  }

  const track = TRACKS[orderType];
  const i = track.indexOf(from);

  // Mã về hưu (hoặc mã không thuộc trục của loại đơn này) → indexOf = -1,
  // không có bước tiếp nào. Đúng: đơn không bao giờ được tạo ở mã về hưu.
  if (i < 0) return [];

  if (i < track.length - 1) result.add(track[i + 1]);

  if (CANCELLABLE_FROM.includes(from)) result.add("huy");
  if (INCIDENT_FROM.includes(from)) result.add("su_co");
  if (BOMB_FROM.includes(from)) result.add("khach_bom");

  return [...result];
}

/**
 * Mốc SỚM NHẤT trên trục mà một trạng thái nhánh có thể xuất phát. Dùng làm
 * điểm neo dự phòng cho UI khi lịch sử không ghi đủ các bước trung gian.
 */
export function earliestOriginFor(status: OrderStatus): OrderStatus {
  if (status === "huy") return CANCELLABLE_FROM[0];
  if (status === "su_co") return INCIDENT_FROM[0];
  if (status === "khach_bom") return BOMB_FROM[0];
  return MAIN_CHAIN[0];
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
