import type { ReactNode } from "react";
import { getSession } from "@/lib/auth";
import { navItemsFor } from "./nav-config";
import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { ScreenHeader } from "./screen-header";
import { getLogoUrl } from "@/lib/logo";

export async function AppShell({
  username,
  title,
  backHref,
  action,
  bottomBar,
  children,
}: {
  username: string;
  title: string;
  backHref?: string;
  action?: ReactNode;
  /** Có thanh dính đáy thì tabbar ẩn — hai thứ chồng lên nhau. */
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
      <ScreenHeader title={title} backHref={backHref} action={action} />
      <main className="app-main">
        <h1 className="screen-title">{title}</h1>
        {children}
      </main>
      {bottomBar ?? <MobileNav username={username} nav={nav} />}
    </div>
  );
}
