import type { ReactNode } from "react";
import { getSession } from "@/lib/auth";
import { navItemsFor } from "./nav-config";
import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { ScreenHeader } from "./screen-header";
import { ScreenTitle } from "./screen-title";
import { getLogoUrl } from "@/lib/logo";

export async function AppShell({
  username,
  bottomBar,
  children,
}: {
  username: string;
  /**
   * @deprecated v8-B: tiêu đề lấy từ src/lib/screen-meta.ts. Prop này bị bỏ
   * qua; xoá khỏi các trang ở task chuyển route group.
   */
  title?: string;
  /** @deprecated v8-B: xem `title`. */
  backHref?: string;
  /** @deprecated v8-B: xem `title`. Màn Tracking chuyển nút này vào thân trang. */
  action?: ReactNode;
  /** Có thanh dính đáy thì tabbar tự ẩn — hai thứ chồng lên nhau. */
  bottomBar?: ReactNode;
  children: ReactNode;
}) {
  const logoUrl = getLogoUrl();
  // getSession bọc cache() nên gọi ở đây KHÔNG tốn thêm truy vấn: trang gọi
  // requireAuth() trước đó đã nạp sẵn trong cùng lần render.
  const session = await getSession();
  const nav = navItemsFor(session?.role ?? "nhan_vien");

  return (
    <div className={`app-shell${bottomBar ? " has-bottom-bar" : ""}`}>
      <Sidebar username={username} logoUrl={logoUrl} nav={nav} />
      <ScreenHeader />
      <main className="app-main">
        <ScreenTitle />
        {children}
      </main>
      {bottomBar ?? <MobileNav username={username} nav={nav} />}
    </div>
  );
}
