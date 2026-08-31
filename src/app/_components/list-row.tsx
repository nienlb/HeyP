import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Một dòng danh sách chạm được — thay cho mẹo bẻ <table> bằng CSS.
 * Cao tối thiểu 76px để cả dòng là vùng chạm thoải mái.
 */
export function ListRow({
  href,
  onClick,
  title,
  meta,
  amount,
  trailing,
}: {
  href?: string;
  onClick?: () => void;
  title: ReactNode;
  meta?: ReactNode;
  amount?: ReactNode;
  trailing?: ReactNode;
}) {
  const inner = (
    <>
      <span className="lr-main">
        <span className="lr-title">{title}</span>
        {meta && <span className="lr-meta">{meta}</span>}
      </span>
      {amount && <span className="lr-amount num">{amount}</span>}
      {trailing}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="list-row">
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" className="list-row" onClick={onClick}>
      {inner}
    </button>
  );
}
