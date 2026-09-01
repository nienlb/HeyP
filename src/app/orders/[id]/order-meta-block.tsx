"use client";

import { useState } from "react";
import { Sheet } from "../../_components/sheet";
import { groupVnd } from "@/lib/parse-number";
import { updateOrderMetaAction } from "../actions";

export function OrderMetaBlock({
  orderId,
  note,
  exchangeRate,
  canEditRate,
}: {
  orderId: number;
  note: string | null;
  exchangeRate: number;
  /** false khi đơn đã mua hàng — tỷ giá lúc đó đã chốt giá vốn và trừ ví ¥. */
  canEditRate: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <section className="card">
        <h2 className="card-title">
          Ghi chú
          <button
            type="button"
            className="btn btn-sm btn-ghost card-title-action"
            onClick={() => setOpen(true)}
          >
            Sửa
          </button>
        </h2>
        {note ? (
          <p style={{ margin: 0 }}>{note}</p>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            — chưa có ghi chú —
          </p>
        )}
      </section>

      <Sheet open={open} title="Ghi chú & tỷ giá" onClose={() => setOpen(false)}>
        <form action={updateOrderMetaAction}>
          <input type="hidden" name="orderId" value={orderId} />

          <label className="field">
            <span>Ghi chú nội bộ</span>
            <textarea name="note" rows={3} defaultValue={note ?? ""} />
          </label>

          {canEditRate ? (
            <label className="field">
              <span>Tỷ giá (₫/¥)</span>
              <input
                name="exchangeRate"
                inputMode="numeric"
                defaultValue={groupVnd(String(exchangeRate))}
              />
            </label>
          ) : (
            <p className="muted small">
              Tỷ giá <strong>{groupVnd(String(exchangeRate))}</strong> đã khoá —
              đơn đã mua hàng nên tỷ giá này đã dùng để chốt giá vốn và trừ ví ¥.
            </p>
          )}

          <button type="submit" className="btn" style={{ width: "100%" }}>
            Lưu
          </button>
        </form>
      </Sheet>
    </>
  );
}
