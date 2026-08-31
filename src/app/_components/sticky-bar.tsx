import type { ReactNode } from "react";

/**
 * Thanh dính đáy. Truyền vào `AppShell bottomBar` thì tabbar tự ẩn — một
 * màn không bao giờ có cả hai, chúng chồng lên nhau.
 */
export function StickyBar({ children }: { children: ReactNode }) {
  return <div className="sticky-bar">{children}</div>;
}
