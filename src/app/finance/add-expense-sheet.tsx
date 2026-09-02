"use client";

import { useState } from "react";
import { Sheet } from "@/app/_components/sheet";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/expenses";
import { addExpenseAction } from "./actions";

export function AddExpenseSheet() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        onClick={() => setOpen(true)}
      >
        + Thêm chi phí
      </button>

      <Sheet
        open={open}
        title="Thêm chi phí"
        onClose={() => setOpen(false)}
        footer={
          <button type="submit" form="add-expense-form" className="btn">
            Lưu
          </button>
        }
      >
        <form action={addExpenseAction} id="add-expense-form">
          <label className="field">
            <span>Ngày</span>
            <input
              type="date"
              name="spentAt"
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </label>
          <label className="field">
            <span>Nhóm</span>
            <select name="category" defaultValue="khac">
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {EXPENSE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Số tiền (₫)</span>
            <input
              type="number"
              name="amountVnd"
              inputMode="numeric"
              step="1000"
              min="0"
              required
            />
          </label>
          <label className="field">
            <span>Đơn liên quan (mã đơn, tuỳ chọn)</span>
            <input
              type="number"
              name="orderId"
              inputMode="numeric"
              placeholder="để trống = chi phí chung"
            />
          </label>
          <label className="field">
            <span>Hình thức</span>
            <select name="method" defaultValue="chuyen_khoan">
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          <p className="muted small" style={{ margin: 0 }}>
            Để trống mã đơn = chi phí chung, báo cáo sẽ chia bình quân cho
            các đơn trong tháng.
          </p>
        </form>
      </Sheet>
    </>
  );
}
