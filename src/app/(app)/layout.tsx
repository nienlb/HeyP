import type { ReactNode } from "react";
import { requireAuth } from "@/lib/auth";
import { getLogoUrl } from "@/lib/logo";
import { navItemsFor } from "@/app/_components/nav-config";
import { Sidebar } from "@/app/_components/sidebar";
import { MobileNav } from "@/app/_components/mobile-nav";
import { ScreenHeader } from "@/app/_components/screen-header";
import { ScreenTitle } from "@/app/_components/screen-title";

/**
 * Khung của mọi màn có đăng nhập.
 *
 * VÌ SAO Ở ĐÂY chứ không phải trong từng trang (như AppShell trước v8-B):
 * layout nằm TRÊN ranh giới Suspense do `(app)/loading.tsx` tạo ra, nên React
 * KHÔNG tháo sidebar/header/tabbar khi chuyển màn — chỉ `{children}` bị thay.
 * Đó là bản sửa thật cho hiện tượng "chớp tắt". Trước v8-B khung nằm trong
 * từng trang nên mỗi lần chuyển màn là tháo sạch rồi dựng lại.
 *
 * HỆ QUẢ THỨ HAI, quan trọng không kém: requireAuth() gọi ở đây tức là gọi
 * TRÊN boundary, nên redirect("/login") của nó trả 307 THẬT — thứ đã mất từ
 * khi có src/app/loading.tsx ở gốc (sự cố khoá cửa đăng nhập 01/09, xem
 * chú thích dài trong src/middleware.ts).
 *
 * NHƯNG middleware vẫn là cửa chính và KHÔNG được bỏ: nó chạy ở Edge, không
 * đọc DB, rẻ hơn, và không phụ thuộc React. Đây chỉ là lưới an toàn thứ hai.
 *
 * GIỮ LAYOUT NÀY NHẸ: mọi việc nặng phải nằm ở page (dưới boundary) để khung
 * xương che được. Ở đây chỉ có đúng một truy vấn — getSession() bên trong
 * requireAuth(), đo được ~20ms. Thêm truy vấn vào đây là kéo dài đúng cái cửa
 * sổ màn hình trắng mà v8-B đang cố thu hẹp.
 */
export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireAuth();
  const nav = navItemsFor(session.role);
  const logoUrl = getLogoUrl();

  return (
    <div className="app-shell">
      <Sidebar username={session.username} logoUrl={logoUrl} nav={nav} />
      <ScreenHeader />
      <main className="app-main">
        <ScreenTitle />
        {children}
      </main>
      <MobileNav username={session.username} nav={nav} />
    </div>
  );
}
