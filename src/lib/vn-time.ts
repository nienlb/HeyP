/**
 * Cắt năm theo giờ Việt Nam. Module thuần.
 *
 * VÌ SAO CẦN: thời gian lưu epoch-seconds, mọi phép đổi mặc định ra UTC. Đơn
 * tạo 5h sáng 01/01 giờ VN là 22h 31/12 giờ UTC — lấy năm theo UTC là nó rơi
 * nhầm sang năm trước, và bộ lọc năm ở màn Khách hàng thiếu mất đơn đó mà
 * không báo lỗi gì.
 *
 * Phía SQL dùng đúng múi này:
 *   EXTRACT(YEAR FROM to_timestamp(created_at) AT TIME ZONE 'Asia/Ho_Chi_Minh')
 * Hai nơi PHẢI khớp nhau, nếu không chip năm hiện ra một danh sách mà truy
 * vấn lại trả về tập khác.
 */
export const VN_TZ = "Asia/Ho_Chi_Minh";

export function yearInVn(d: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: VN_TZ,
      year: "numeric",
    }).format(d),
  );
}

/** Các năm có mặt trong danh sách, giảm dần, không trùng. */
export function yearsFromDates(dates: Date[]): number[] {
  return [...new Set(dates.map(yearInVn))].sort((a, b) => b - a);
}

/**
 * Việt Nam cố định UTC+7, không có giờ mùa hè — cộng thẳng offset là đủ,
 * không cần Intl cho phép tính ngày (Intl chậm và khó ghép ngược ra epoch).
 */
const VN_OFFSET_MS = 7 * 3600 * 1000;

export function vnYmd(d: Date): { y: number; m: number; d: number } {
  const s = new Date(d.getTime() + VN_OFFSET_MS);
  return { y: s.getUTCFullYear(), m: s.getUTCMonth() + 1, d: s.getUTCDate() };
}

/** 00:00 giờ VN của ngày (y, m, d) tính bằng epoch ms. m=13 hay m=0 tự tràn năm. */
export function vnMidnightMs(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d) - VN_OFFSET_MS;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Ngày ngắn cho cột bảng: "21/09"; khác năm hiện tại thì "31/12/25". */
export function shortDateVn(d: Date, now: Date): string {
  const a = vnYmd(d);
  const base = `${pad2(a.d)}/${pad2(a.m)}`;
  return a.y === vnYmd(now).y ? base : `${base}/${String(a.y).slice(2)}`;
}
