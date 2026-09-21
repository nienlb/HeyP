/**
 * Bộ lọc danh sách đơn kiểu Excel (v9-C). Module thuần — chạy cả server
 * (lọc thật) lẫn client (dựng URL), và test bằng node:test.
 *
 * Trạng thái lọc nằm trên URL: ?d=7d | ?d=2026-09-01_2026-09-15,
 * ?st=da_mua_tq,hoan_tat, ?type=ban_tu_kho, ?due=owing|paid. Giá trị lạ bị
 * bỏ qua chứ không ném lỗi — link cũ hay gõ tay sai vẫn mở được trang.
 *
 * Ngày cắt theo giờ VN (vn-time.ts). Cắt theo UTC thì đơn tạo 6h sáng giờ
 * VN rơi sang hôm trước — cùng loại lỗi đã khoá ở chip năm của v8-A.
 */
import {
  BRANCH_STATUSES,
  MAIN_CHAIN,
  ORDER_TYPES,
  type OrderStatus,
  type OrderType,
} from "./order-status.ts";
import { vnMidnightMs, vnYmd } from "./vn-time.ts";

/** Trạng thái đang dùng — KHÔNG gồm mã về hưu (không đơn mới nào mang chúng). */
export const FILTER_STATUSES: readonly OrderStatus[] = [
  ...MAIN_CHAIN,
  "ve_kho_vn",
  ...BRANCH_STATUSES,
];

export const DATE_PRESETS = ["today", "7d", "month", "prev_month"] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];
export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: "Hôm nay",
  "7d": "7 ngày",
  month: "Tháng này",
  prev_month: "Tháng trước",
};

export type DateFilter = { preset: DatePreset } | { from: string; to: string };
export type DueFilter = "paid" | "owing";
export const DUE_LABELS: Record<DueFilter, string> = {
  paid: "Đã thu đủ",
  owing: "Còn nợ",
};

export type OrderFilters = {
  date: DateFilter | null;
  statuses: OrderStatus[];
  types: OrderType[];
  due: DueFilter | null;
};
export type FilterGroup = "date" | "status" | "type" | "due";

export const EMPTY_FILTERS: OrderFilters = {
  date: null,
  statuses: [],
  types: [],
  due: null,
};

export const FILTER_PARAM_KEYS = ["d", "st", "type", "due"] as const;

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function pickList<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
): T[] {
  const ok = new Set<string>(allowed);
  return [...new Set((raw ?? "").split(","))].filter((v): v is T => ok.has(v));
}

export function parseOrderFilters(sp: {
  d?: string;
  st?: string;
  type?: string;
  due?: string;
}): OrderFilters {
  let date: DateFilter | null = null;
  if (sp.d) {
    if ((DATE_PRESETS as readonly string[]).includes(sp.d)) {
      date = { preset: sp.d as DatePreset };
    } else {
      const [a, b] = sp.d.split("_");
      if (a && b && YMD.test(a) && YMD.test(b))
        date = a <= b ? { from: a, to: b } : { from: b, to: a };
    }
  }
  return {
    date,
    statuses: pickList(sp.st, FILTER_STATUSES),
    types: pickList(sp.type, ORDER_TYPES),
    due: sp.due === "paid" || sp.due === "owing" ? sp.due : null,
  };
}

/** Ghi bộ lọc vào một bản sao của `base`; tham số khác (q, f, sort…) giữ nguyên. */
export function filtersToParams(
  f: OrderFilters,
  base: URLSearchParams,
): URLSearchParams {
  const p = new URLSearchParams(base);
  for (const k of FILTER_PARAM_KEYS) p.delete(k);
  if (f.date)
    p.set("d", "preset" in f.date ? f.date.preset : `${f.date.from}_${f.date.to}`);
  if (f.statuses.length > 0) p.set("st", f.statuses.join(","));
  if (f.types.length > 0) p.set("type", f.types.join(","));
  if (f.due) p.set("due", f.due);
  return p;
}

function ymdMs(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return vnMidnightMs(y, m, d);
}

/** Khoảng nửa mở [fromMs, toMs) theo giờ VN. */
export function dateBounds(
  df: DateFilter,
  now: Date,
): { fromMs: number; toMs: number } {
  if (!("preset" in df))
    return { fromMs: ymdMs(df.from), toMs: ymdMs(df.to) + DAY_MS };
  const { y, m, d } = vnYmd(now);
  const todayStart = vnMidnightMs(y, m, d);
  switch (df.preset) {
    case "today":
      return { fromMs: todayStart, toMs: todayStart + DAY_MS };
    case "7d":
      return { fromMs: todayStart - 6 * DAY_MS, toMs: todayStart + DAY_MS };
    case "month":
      return { fromMs: vnMidnightMs(y, m, 1), toMs: vnMidnightMs(y, m + 1, 1) };
    case "prev_month":
      return { fromMs: vnMidnightMs(y, m - 1, 1), toMs: vnMidnightMs(y, m, 1) };
  }
}

export function matchesOrderFilters(
  row: {
    createdAt: Date;
    status: OrderStatus;
    orderType: OrderType;
    amountDue: number;
  },
  f: OrderFilters,
  now: Date,
): boolean {
  if (f.date) {
    const { fromMs, toMs } = dateBounds(f.date, now);
    const t = row.createdAt.getTime();
    if (t < fromMs || t >= toMs) return false;
  }
  if (f.statuses.length > 0 && !f.statuses.includes(row.status)) return false;
  if (f.types.length > 0 && !f.types.includes(row.orderType)) return false;
  if (f.due === "owing") {
    // Cùng nghĩa với chip "Chưa thu đủ": đơn huỷ và đơn nhập kho (không có
    // khách) thì amountDue không phải nợ của ai.
    if (
      !(row.amountDue > 0 && row.status !== "huy" && row.orderType !== "nhap_kho")
    )
      return false;
  }
  if (f.due === "paid" && row.amountDue > 0) return false;
  return true;
}

export function isGroupActive(f: OrderFilters, g: FilterGroup): boolean {
  switch (g) {
    case "date":
      return f.date !== null;
    case "status":
      return f.statuses.length > 0;
    case "type":
      return f.types.length > 0;
    case "due":
      return f.due !== null;
  }
}

export function activeGroupCount(f: OrderFilters): number {
  return (["date", "status", "type", "due"] as const).filter((g) =>
    isGroupActive(f, g),
  ).length;
}

export function clearGroup(f: OrderFilters, g: FilterGroup): OrderFilters {
  switch (g) {
    case "date":
      return { ...f, date: null };
    case "status":
      return { ...f, statuses: [] };
    case "type":
      return { ...f, types: [] };
    case "due":
      return { ...f, due: null };
  }
}
