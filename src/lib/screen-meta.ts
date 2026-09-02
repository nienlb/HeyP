/**
 * Tiêu đề và nút quay lại của từng màn, tra theo đường dẫn. Module thuần.
 *
 * VÌ SAO TỒN TẠI: từ v8-B khung (sidebar + header + tabbar) nằm ở
 * `src/app/(app)/layout.tsx` để nó không bị tháo-dựng lại mỗi lần chuyển màn.
 * Nhưng layout KHÔNG nhận được prop từ page, nên `title`/`backHref` không thể
 * là prop của trang nữa — chúng phải suy được từ chính đường dẫn.
 *
 * ĐÁNH ĐỔI ĐÃ BIẾT: `tsc` không còn bắt được "quên khai báo tiêu đề" như hồi
 * `title` là prop bắt buộc của AppShell. Lưới thay thế là test khoá phủ sóng
 * trong tests/screen-meta.test.ts — thêm màn vào nav-config mà quên thêm vào
 * đây thì test đỏ.
 *
 * Thêm màn mới: thêm MỘT dòng vào EXACT bên dưới.
 */
export type ScreenMeta = { title: string; backHref?: string };

const EXACT: Record<string, ScreenMeta> = {
  "/": { title: "Tổng quan" },
  "/orders": { title: "Đơn hàng" },
  "/orders/new": { title: "Đơn mới", backHref: "/orders" },
  "/customers": { title: "Khách hàng" },
  "/inventory": { title: "Tồn kho" },
  "/finance": { title: "Tài chính" },
  "/reports": { title: "Báo cáo" },
  "/settings": { title: "Cài đặt" },
  // /backup CỐ Ý không có backHref — giữ đúng hành vi trước v8-B, nơi màn này
  // gọi <AppShell title="Sao lưu"> không kèm backHref.
  "/backup": { title: "Sao lưu" },
  "/tracking": { title: "Tracking" },
  "/admin/users": { title: "Thành viên", backHref: "/" },
  "/admin/deletions": { title: "Nhật ký xoá", backHref: "/" },
  "/admin/activity": { title: "Nhật ký hoạt động", backHref: "/" },
};

export const KNOWN_PATHS: readonly string[] = Object.keys(EXACT);

/**
 * Tiêu đề động DUY NHẤT của app. `\d+` chứ không phải `[^/]+`: viết lỏng thì
 * /orders/new cũng khớp và màn tạo đơn hiện tiêu đề "#new".
 */
const ORDER_DETAIL = /^\/orders\/(\d+)$/;

function normalize(pathname: string): string {
  const cut = pathname.split("?")[0].split("#")[0];
  if (cut.length > 1 && cut.endsWith("/")) return cut.slice(0, -1);
  return cut;
}

export function screenMetaFor(pathname: string): ScreenMeta {
  const clean = normalize(pathname);

  const exact = EXACT[clean];
  if (exact) return exact;

  const m = ORDER_DETAIL.exec(clean);
  if (m) return { title: `#${m[1]}`, backHref: "/orders" };

  return { title: "HeyP" };
}
