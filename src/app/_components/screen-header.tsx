import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./icons";

/**
 * Header dính đỉnh. `backHref` là đường dẫn TƯỜNG MINH, không dùng
 * history.back(): ở chế độ standalone (đã cài ra màn hình chính) người dùng
 * có thể mở thẳng một URL sâu và không có gì để lùi về.
 */
export function ScreenHeader({
  title,
  backHref,
  action,
}: {
  title: string;
  backHref?: string;
  action?: ReactNode;
}) {
  return (
    <header className="screen-header">
      {backHref ? (
        <Link href={backHref} className="sh-back" aria-label="Quay lại">
          <Icon name="chevron-left" size={24} />
        </Link>
      ) : (
        <span className="sh-back-spacer" />
      )}
      <span className="sh-title">{title}</span>
      <span className="sh-action">{action}</span>
    </header>
  );
}
