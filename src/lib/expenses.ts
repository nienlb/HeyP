/**
 * Hằng phân loại cho sổ chi phí, sổ thu tiền và sổ ví ¥ (spec v3-B mục 3).
 * Module thuần — dùng chung cho schema, query, UI và test.
 */

export const EXPENSE_CATEGORIES = [
  "bao_bi",
  "tem_nhan",
  "quang_cao",
  "luong",
  "ship_tra_shipper",
  "den_khach",
  "khac",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  bao_bi: "Bao bì",
  tem_nhan: "Tem nhãn",
  quang_cao: "Quảng cáo",
  luong: "Lương",
  ship_tra_shipper: "Ship trả shipper",
  den_khach: "Đền khách",
  khac: "Khác",
};

export const PAYMENT_KINDS = ["coc", "thu_not", "hoan_tra"] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  coc: "Cọc",
  thu_not: "Thu nốt",
  hoan_tra: "Hoàn trả khách",
};

export const PAYMENT_METHODS = ["chuyen_khoan", "tien_mat"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  chuyen_khoan: "Chuyển khoản",
  tien_mat: "Tiền mặt",
};

export const LEDGER_KINDS = ["nap", "chi", "dieu_chinh"] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export const LEDGER_KIND_LABELS: Record<LedgerKind, string> = {
  nap: "Nạp ¥",
  chi: "Mua hàng",
  dieu_chinh: "Điều chỉnh",
};
