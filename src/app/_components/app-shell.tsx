import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";

export function AppShell({
  username,
  children,
}: {
  username: string;
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      <Sidebar username={username} />
      <MobileNav username={username} />
      <main className="app-main container">{children}</main>
    </div>
  );
}
