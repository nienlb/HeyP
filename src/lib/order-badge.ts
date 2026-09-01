/**
 * Badge tuổi đơn cho màn danh sách. Module thuần.
 *
 * v8-A bỏ cột "Tuổi" khỏi bảng (6 cột đọc thoáng hơn 8), nhưng tuổi đơn chính
 * là thứ sinh ra cờ `isStale` — bỏ cột thì tín hiệu phải chuyển sang badge,
 * không được bỏ luôn.
 *
 * Badge CỐ Ý không lặp lại chữ "Sự cố": cột Trạng thái ngay cạnh đã in chữ
 * đó rồi. Với đơn sự cố ta hiện số ngày, vì đó mới là thông tin cột kia
 * không có.
 *
 * Kiểu `status` để `string` chứ không phải `OrderStatus`: giữ module này
 * thuần, không kéo theo `order-status.ts`.
 */
export function ageBadge(row: {
  status: string;
  isStale: boolean;
  ageDays: number;
}): string | null {
  if (row.status === "su_co" || row.isStale) return `⏳ ${row.ageDays}n`;
  return null;
}
