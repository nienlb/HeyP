import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { ScreenHeader } from "./screen-header";
import { getLogoUrl } from "@/lib/logo";

export function AppShell({
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
  return (
    <div className={`app-shell${bottomBar ? " has-bottom-bar" : ""}`}>
      <Sidebar username={username} logoUrl={logoUrl} />
      <ScreenHeader title={title} backHref={backHref} action={action} />
      <main className="app-main">
        <h1 className="screen-title">{title}</h1>
        {children}
      </main>
      {bottomBar ?? <MobileNav username={username} />}
    </div>
  );
}
