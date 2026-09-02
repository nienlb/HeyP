"use client";

import { useState } from "react";
import Link from "next/link";
import { DataTable, type Column } from "@/app/_components/data-table";
import { Sheet } from "@/app/_components/sheet";
import type { SortDir } from "@/lib/table-sort";
import { deleteCustomerAction } from "./actions";

export type CustomerItem = {
  id: number;
  name: string;
  phone: string | null;
  phoneText: string;
  orderCount: number;
  itemCount: number;
  paidVnd: number;
  paidText: string;
  outstandingVnd: number;
  outstandingText: string;
  warningFlag: boolean;
  warningReason: string | null;
};

const COLUMNS: Column<CustomerItem>[] = [
  {
    key: "ten",
    header: "Khách hàng",
    width: "minmax(0, 2fr)",
    mobile: true,
    sortBy: (c) => c.name,
    cell: (c) => (
      <>
        <span className="dt-name">
          {c.warningFlag && (
            <span
              className="warn-dot"
              title={c.warningReason ?? "Khách có cờ cảnh báo"}
            />
          )}
          {c.name}
        </span>
        {/* Chỉ hiện trên điện thoại — desktop có cột riêng cho từng số. */}
        <span className="dt-sub">
          {c.phoneText} · {c.orderCount} đơn · {c.itemCount} món
        </span>
      </>
    ),
  },
  {
    key: "sdt",
    header: "SĐT",
    width: "130px",
    sortBy: (c) => c.phone,
    cell: (c) => c.phoneText,
  },
  {
    key: "don",
    header: "Đơn",
    width: "64px",
    align: "right",
    sortBy: (c) => c.orderCount,
    cell: (c) => c.orderCount,
  },
  {
    key: "mon",
    header: "Món",
    width: "64px",
    align: "right",
    sortBy: (c) => c.itemCount,
    cell: (c) => c.itemCount,
  },
  {
    key: "da_tra",
    header: "Đã trả",
    width: "130px",
    align: "right",
    sortBy: (c) => c.paidVnd,
    cell: (c) => c.paidText,
  },
  {
    key: "con_no",
    header: "Còn nợ",
    width: "130px",
    align: "right",
    mobile: true,
    sortBy: (c) => c.outstandingVnd,
    cell: (c) => c.outstandingText,
  },
];

export function CustomersList({
  customers,
  canDelete,
  sort,
  dir,
  sortBase,
}: {
  customers: CustomerItem[];
  canDelete: boolean;
  sort?: string;
  dir: SortDir;
  /** Chuỗi query đã có sẵn (year), KHÔNG gồm sort và dir. */
  sortBase: string;
}) {
  const [picked, setPicked] = useState<CustomerItem | null>(null);

  const sortHref = (key: string, nextDir: SortDir) => {
    const p = new URLSearchParams(sortBase);
    p.set("sort", key);
    p.set("dir", nextDir);
    return `/customers?${p.toString()}`;
  };

  return (
    <>
      <DataTable
        columns={COLUMNS}
        rows={customers}
        rowKey={(c) => c.id}
        // Nhân viên: chạm để xem đơn như cũ. Admin: chạm mở sheet có nút xoá.
        rowHref={
          canDelete
            ? undefined
            : (c) => `/orders?q=${encodeURIComponent(c.name)}`
        }
        rowOnClick={canDelete ? (c) => setPicked(c) : undefined}
        sort={sort}
        dir={dir}
        sortHref={sortHref}
      />

      <Sheet
        open={picked !== null}
        title={picked ? picked.name : ""}
        onClose={() => setPicked(null)}
      >
        {picked && (
          <div className="sheet-menu">
            <Link
              href={`/orders?q=${encodeURIComponent(picked.name)}`}
              className="sheet-item"
            >
              Xem {picked.orderCount} đơn của khách
            </Link>
            <form action={deleteCustomerAction}>
              <input type="hidden" name="customerId" value={picked.id} />
              <button type="submit" className="btn btn-danger">
                Xoá khách
              </button>
            </form>
            <p className="muted small">
              Khách còn đơn thì không xoá được — xoá đơn trước.
            </p>
          </div>
        )}
      </Sheet>
    </>
  );
}
