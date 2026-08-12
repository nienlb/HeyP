import { formatVnd } from "@/lib/format";
import { amountDue } from "@/lib/payments";
import { PAYMENT_KIND_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/expenses";
import { addPaymentAction, deletePaymentAction } from "../actions";

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
  const due = amountDue(
    quotedTotalVnd,
    shippingFee,
    rows.map((r) => ({ amountVnd: r.amountVnd })),
  );

  return (
    <section className="card">
      <h2 className="card-title">Thu tiền</h2>

      <div className="table-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>Ngày</th>
              <th>Loại</th>
              <th className="num">Số tiền</th>
              <th>Hình thức</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  Chưa có lần trả nào.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.paidAt)}</td>
                  <td>{PAYMENT_KIND_LABELS[r.kind]}</td>
                  <td className="num">{formatVnd(r.amountVnd)}</td>
                  <td>{PAYMENT_METHOD_LABELS[r.method]}</td>
                  <td>
                    <form action={deletePaymentAction}>
                      <input type="hidden" name="orderId" value={orderId} />
                      <input type="hidden" name="paymentId" value={r.id} />
                      <button type="submit" className="btn btn-sm btn-outline">
                        Xoá
                      </button>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={2}>Đã thu</th>
              <th className="num" colSpan={3}>
                {formatVnd(rows.reduce((s, r) => s + r.amountVnd, 0))}
              </th>
            </tr>
            <tr>
              <th colSpan={2}>Còn phải thu</th>
              <th
                className={`num ${due < 0 ? "profit-negative" : ""}`}
                colSpan={3}
              >
                {formatVnd(due)}
              </th>
            </tr>
          </tfoot>
        </table>
      </div>

      {due < 0 && (
        <p className="profit-negative">
          ⚠️ Đã thu vượt {formatVnd(-due)} — cần hoàn lại khách.
        </p>
      )}

      <details style={{ marginTop: 12 }}>
        <summary className="btn btn-outline btn-sm" style={{ display: "inline-block" }}>
          + Ghi khoản thu
        </summary>
        <form action={addPaymentAction} className="stack-form" style={{ marginTop: 12 }}>
          <input type="hidden" name="orderId" value={orderId} />
          <label>
            <span>Số tiền (₫)</span>
            <input
              type="number"
              name="amountVnd"
              step="1000"
              defaultValue={suggestedFinal > 0 ? suggestedFinal : undefined}
              required
            />
          </label>
          <label>
            <span>Ngày</span>
            <input
              type="date"
              name="paidAt"
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </label>
          <label>
            <span>Loại</span>
            <select name="kind" defaultValue="thu_not">
              <option value="coc">Cọc</option>
              <option value="thu_not">Thu nốt</option>
              <option value="hoan_tra">Hoàn trả khách</option>
            </select>
          </label>
          <label>
            <span>Hình thức</span>
            <select name="method" defaultValue="chuyen_khoan">
              <option value="chuyen_khoan">Chuyển khoản</option>
              <option value="tien_mat">Tiền mặt</option>
            </select>
          </label>
          <button type="submit" className="btn">
            Lưu
          </button>
        </form>
      </details>
    </section>
  );
}
