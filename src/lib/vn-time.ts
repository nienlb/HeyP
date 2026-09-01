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
