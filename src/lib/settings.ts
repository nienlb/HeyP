/**
 * Tham số nghiệp vụ đổi được lúc chạy (bảng `settings`), khác với cấu hình
 * hạ tầng ở src/lib/config.ts (đọc từ .env, đổi phải khởi động lại).
 *
 * Module thuần — không đụng DB, để unit test dễ.
 */

export const SETTING_KEYS = {
  sellRate: "sell_rate",
  defaultMarginVnd: "default_margin_vnd",
} as const;

/** Công thức của chủ shop: giá tệ × 4000 + 170.000 tiền lời. */
export const SETTING_DEFAULTS = {
  sellRate: 4000,
  defaultMarginVnd: 170000,
} as const;

export type AppSettings = {
  /** Tỷ giá BÁN (VND/¥) — không phải tỷ giá vốn thật. */
  sellRate: number;
  /** Lời mặc định cho mỗi món khi điền trước (VND). */
  defaultMarginVnd: number;
};

export type SettingRow = { key: string; value: string };

function positiveOr(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function nonNegativeOr(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && raw?.trim() !== "" ? n : fallback;
}

export function parseSettings(rows: SettingRow[]): AppSettings {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    sellRate: positiveOr(
      map.get(SETTING_KEYS.sellRate),
      SETTING_DEFAULTS.sellRate,
    ),
    defaultMarginVnd: nonNegativeOr(
      map.get(SETTING_KEYS.defaultMarginVnd),
      SETTING_DEFAULTS.defaultMarginVnd,
    ),
  };
}
