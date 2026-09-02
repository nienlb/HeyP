"use client";

import { useState } from "react";
import { formatVnd } from "@/lib/format";
import { amountDue } from "@/lib/payments";
import { PAYMENT_KIND_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/expenses";
import { addPaymentAction, deletePaymentAction } from "@/app/(app)/orders/actions";
import { ListRow } from "@/app/_components/list-row";
import { Sheet } from "@/app/_components/sheet";

export type PaymentRow = {
  id: number;
  amountVnd: number;
  paidAt: Date;
  kind: "coc" | "thu_not" | "hoan_tra";
  method: "chuyen_khoan" | "tien_mat";
  note: string | null;
};

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString("vi-VN");
}

/** Khối thu tiền ở chi tiết đơn (spec v3-B mục 8). */
export function PaymentsBlock({
  orderId,
  rows,
  quotedTotalVnd,
  shippingFee,
  suggestedFinal,
}: {
  orderId: number;
  rows: PaymentRow[];
  quotedTotalVnd: number;
  shippingFee: number;
  suggestedFinal: number;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const due = amountDue(
    quotedTotalVnd,
    shippingFee,
    rows.map((r) => ({ amountVnd: r.amountVnd })),
  );
  const totalPaid = rows.reduce((s, r) => s + r.amountVnd, 0);

  return (
    <section className="card">
      <h2 className="card-title">Thu tiền</h2>

      <div className="kv">
        <span>Đã thu</span>
        <span>{formatVnd(totalPaid)}</span>
      </div>
      <div className="kv kv-total">
        <span>Còn phải thu</span>
        <strong className={due < 0 ? "profit-negative" : ""}>
          {formatVnd(due)}
        </strong>
      </div>
      {due < 0 && (
        <p className="profit-negative">
          ⚠️ Đã thu vượt {formatVnd(-due)} — cần hoàn lại khách.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="muted">Chưa có lần trả nào.</p>
      ) : (
        rows.map((r) => (
          <ListRow
            key={r.id}
            title={PAYMENT_KIND_LABELS[r.kind]}
            meta={`${formatDate(r.paidAt)} · ${PAYMENT_METHOD_LABELS[r.method]}`}
            amount={formatVnd(r.amountVnd)}
            trailing={
              <form action={deletePaymentAction}>
                <input type="hidden" name="orderId" value={orderId} />
                <input type="hidden" name="paymentId" value={r.id} />
                <button type="submit" className="btn btn-sm btn-outline">
                  Xoá
                </button>
              </form>
            }
          />
        ))
      )}

      <button
        type="button"
        className="picker"
        onClick={() => setAddOpen(true)}
      >
        + Ghi khoản thu
      </button>

      <Sheet
        open={addOpen}
        title="Ghi khoản thu"
        onClose={() => setAddOpen(false)}
        footer={
          <button type="submit" form="add-payment-form" className="btn">
            Lưu
          </button>
        }
      >
        <form action={addPaymentAction} id="add-payment-form">
          <input type="hidden" name="orderId" value={orderId} />
          <label className="field">
            <span>Số tiền (₫)</span>
            <input
              type="number"
              name="amountVnd"
              inputMode="numeric"
              step="1000"
              defaultValue={suggestedFinal > 0 ? suggestedFinal : undefined}
              required
            />
          </label>
          <label className="field">
            <span>Ngày</span>
            <input
              type="date"
              name="paidAt"
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </label>
          <label className="field">
            <span>Loại</span>
            <select name="kind" defaultValue="thu_not">
              <option value="coc">Cọc</option>
              <option value="thu_not">Thu nốt</option>
              <option value="hoan_tra">Hoàn trả khách</option>
            </select>
          </label>
          <label className="field">
            <span>Hình thức</span>
            <select name="method" defaultValue="chuyen_khoan">
              <option value="chuyen_khoan">Chuyển khoản</option>
              <option value="tien_mat">Tiền mặt</option>
            </select>
          </label>
        </form>
      </Sheet>
    </section>
  );
}
