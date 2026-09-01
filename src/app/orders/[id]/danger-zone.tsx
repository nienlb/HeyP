"use client";

import { useState } from "react";
import { Sheet } from "../../_components/sheet";
import { deleteOrderAction } from "../actions";

export function DangerZone({
  orderId,
  summary,
}: {
  orderId: number;
  /** Ví dụ: "Nguyễn A · 2 món · 4.520.000 ₫" */
  summary: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <section className="card">
        <h2 className="card-title">Vùng nguy hiểm</h2>
        <p className="muted small">
          Xoá đơn là không khôi phục được. Đơn đã trừ ví ¥, đã thu tiền hoặc đã
          cộng tồn kho sẽ bị chặn — dùng <strong>Hủy</strong> hoặc{" "}
          <strong>Sự cố</strong> cho những đơn đó.
        </p>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => setOpen(true)}
        >
          Xoá đơn #{orderId}
        </button>
      </section>

      <Sheet
        open={open}
        title={`Xoá đơn #${orderId}`}
        onClose={() => setOpen(false)}
        footer={
          <div className="sheet-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setOpen(false)}
            >
              Huỷ
            </button>
            <form action={deleteOrderAction}>
              <input type="hidden" name="orderId" value={orderId} />
              <button type="submit" className="btn btn-danger">
                Xoá đơn
              </button>
            </form>
          </div>
        }
      >
        <p>{summary}</p>
        <p className="muted">Không khôi phục được.</p>
      </Sheet>
    </>
  );
}
