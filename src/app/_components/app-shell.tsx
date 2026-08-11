import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { getLogoUrl } from "@/lib/logo";

export function AppShell({
  username,
  children,
}: {
  username: string;
  children: ReactNode;
}) {
  const logoUrl = getLogoUrl();
  return (
    <div className="app-shell">
      <Sidebar username={username} logoUrl={logoUrl} />
      <MobileNav username={username} logoUrl={logoUrl} />
      <main className="app-main container">{children}</main>
    </div>
  );
}
