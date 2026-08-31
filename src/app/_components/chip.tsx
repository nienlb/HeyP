import Link from "next/link";
import type { ReactNode } from "react";

/** Hàng chip lọc, cuộn ngang, dính dưới ô tìm. */
export function ChipBar({ children }: { children: ReactNode }) {
  return <div className="chip-bar">{children}</div>;
}

export function Chip({
  active,
  href,
  label,
  count,
}: {
  active: boolean;
  href: string;
  label: string;
  count?: number;
}) {
  return (
    <Link
      href={href}
      className={`chip${active ? " chip-on" : ""}`}
      aria-current={active ? "page" : undefined}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className="chip-count">{count}</span>
      )}
    </Link>
  );
}
