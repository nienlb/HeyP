import type { ReactNode } from "react";

/**
 * Thanh dính đáy. Tabbar tự ẩn khi có nó, qua luật CSS
 * `.app-shell:has(.sticky-bar) .tabbar { display: none }` — một màn không bao
 * giờ có cả hai, chúng chồng lên nhau.
 */
export function StickyBar({ children }: { children: ReactNode }) {
  return <div className="sticky-bar">{children}</div>;
}
