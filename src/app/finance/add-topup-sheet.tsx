"use client";

import { useState } from "react";
import { Sheet } from "../_components/sheet";
import { addTopupAction } from "./actions";

export function AddTopupSheet() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        onClick={() => setOpen(true)}
      >
        + Nạp ¥
      </button>

      <Sheet
        open={open}
        title="Nạp ¥"
        onClose={() => setOpen(false)}
        footer={
          <button type="submit" form="add-topup-form" className="btn">
            Lưu
          </button>
        }
      >
        <form action={addTopupAction} id="add-topup-form">
          <label className="field">
            <span>Số tệ nhận (¥)</span>
            <input
              type="number"
              name="cny"
              inputMode="decimal"
              step="0.01"
              min="0"
              required
            />
          </label>
          <label className="field">
            <span>Số tiền trả (₫)</span>
            <input
              type="number"
              name="vndPaid"
              inputMode="numeric"
              step="1000"
              min="0"
              required
            />
          </label>
          <label className="field">
            <span>Ghi chú</span>
            <input type="text" name="note" placeholder="tuỳ chọn" />
          </label>
        </form>
      </Sheet>
    </>
  );
}
