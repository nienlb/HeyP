import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { sortRows, type SortDir } from "@/lib/table-sort";

/**
 * Bảng cho màn danh sách. MỘT bộ DOM phục vụ cả hai kích thước.
 *
 * VÌ SAO KHÔNG DÙNG <table>: dòng hiện tại là <Link className="list-row"> —
 * cả dòng là một link, và HTML không cho <a> bọc <tr>. Dùng <table> thật thì
 * phải bỏ hành vi bấm-cả-dòng, mà đó chính là thứ màn điện thoại sống nhờ.
 * Nên "bảng" ở đây dựng bằng CSS Grid.
 *
 * VÌ SAO KHÔNG CÓ "use client": component này không dùng hook nào. Bỏ trống
 * chỉ thị thì nó chạy được ở CẢ server component lẫn client component —
 * `orders-list.tsx` và `customers-list.tsx` đều là client, còn màn khác có
 * thể gọi thẳng từ server. Thêm "use client" vào đây sẽ cấm đường thứ hai
 * (props `cell`/`sortBy` là hàm, không tuần tự hoá qua ranh giới được).
 *
 * Điện thoại ↔ desktop:
 *  - Điện thoại: grid 2 cột cứng; cột nào không có `mobile: true` bị ẩn.
 *    Thông tin phụ nằm trong ô tên dưới dạng <span className="dt-sub">.
 *  - Desktop: grid theo `--dt-cols`; `.dt-sub` bị ẩn vì lúc này nó đã có
 *    cột riêng.
 */
export type Column<T> = {
  key: string;
  header: string;
  /** Một phần của grid-template-columns: "1fr" | "90px" | "minmax(0,2fr)" */
  width: string;
  align?: "right";
  /** true = hiện cả trên điện thoại. Mặc định false: chỉ từ 900px. */
  mobile?: boolean;
  /** Vắng mặt = cột không sắp xếp được (không có link ở tiêu đề). */
  sortBy?: (row: T) => number | string | null;
  cell: (row: T) => ReactNode;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  rowOnClick,
  sort,
  dir = "desc",
  sortHref,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  /** Trả về undefined cho hàng không bấm được. */
  rowHref?: (row: T) => string | undefined;
  rowOnClick?: (row: T) => void;
  /** `key` của cột đang sắp xếp. */
  sort?: string;
  dir?: SortDir;
  /** Sinh URL cho tiêu đề cột. Vắng mặt = tắt sắp xếp cả bảng. */
  sortHref?: (key: string, dir: SortDir) => string;
}) {
  const active = columns.find((c) => c.key === sort && c.sortBy);
  const ordered = active ? sortRows(rows, active.sortBy, dir) : rows;

  const style = {
    "--dt-cols": columns.map((c) => c.width).join(" "),
  } as CSSProperties;

  const cellClass = (c: Column<T>) =>
    `dt-c${c.mobile ? " dt-m" : ""}${c.align === "right" ? " dt-r" : ""}`;

  return (
    <div className="dt" style={style}>
      <div className="dt-head">
        {columns.map((c) => {
          const label =
            c.sortBy && sortHref ? (
              <Link
                href={sortHref(
                  c.key,
                  // Bấm lại đúng cột đang sắp xếp thì đảo chiều.
                  sort === c.key && dir === "desc" ? "asc" : "desc",
                )}
              >
                {c.header}
                {sort === c.key ? (dir === "desc" ? " ↓" : " ↑") : ""}
              </Link>
            ) : (
              c.header
            );
          return (
            <span key={c.key} className={cellClass(c)}>
              {label}
            </span>
          );
        })}
      </div>

      {ordered.map((row) => {
        const inner = columns.map((c) => (
          <span key={c.key} className={cellClass(c)}>
            {c.cell(row)}
          </span>
        ));
        const href = rowHref?.(row);
        if (href) {
          return (
            <Link key={rowKey(row)} href={href} className="dt-row">
              {inner}
            </Link>
          );
        }
        if (rowOnClick) {
          return (
            <button
              key={rowKey(row)}
              type="button"
              className="dt-row"
              onClick={() => rowOnClick(row)}
            >
              {inner}
            </button>
          );
        }
        return (
          <div key={rowKey(row)} className="dt-row dt-row-static">
            {inner}
          </div>
        );
      })}
    </div>
  );
}
