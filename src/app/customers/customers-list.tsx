"use client";

import { useState } from "react";
import Link from "next/link";
import { ListRow } from "../_components/list-row";
import { Sheet } from "../_components/sheet";
import { deleteCustomerAction } from "./actions";

export type CustomerItem = {
  id: number;
  name: string;
  phone: string | null;
  orderCount: number;
  outstandingText: string | null;
  warningFlag: boolean;
  warningReason: string | null;
};

export function CustomersList({
  customers,
  canDelete,
}: {
  customers: CustomerItem[];
  canDelete: boolean;
}) {
  const [picked, setPicked] = useState<CustomerItem | null>(null);

  return (
    <>
      {customers.map((c) => (
        <ListRow
          key={c.id}
          // Nhân viên: chạm để xem đơn như cũ. Admin: chạm mở sheet có nút xoá.
          href={canDelete ? undefined : `/orders?q=${encodeURIComponent(c.name)}`}
          onClick={canDelete ? () => setPicked(c) : undefined}
          title={
            <>
              {c.warningFlag && (
                <span
                  className="warn-dot"
                  title={c.warningReason ?? "Khách có cờ cảnh báo"}
                />
              )}
              {c.name}
            </>
          }
          meta={`${c.phone ?? "—"} · ${c.orderCount} đơn`}
          amount={c.outstandingText ?? undefined}
        />
      ))}

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
