import { requireAuth } from "@/lib/auth";
import { AppShell } from "../_components/app-shell";
import { getWallet, listExpenses, listLedger } from "@/db/queries";
import { formatVnd } from "@/lib/format";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  LEDGER_KIND_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/expenses";
import {
  addExpenseAction,
  addTopupAction,
  deleteExpenseAction,
  deleteLedgerAction,
} from "./actions";

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString("vi-VN");
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const session = await requireAuth();
  const { err } = await searchParams;

  const wallet = getWallet();
  const ledger = listLedger();
  const expenseRows = await listExpenses();

  return (
    <AppShell username={session.username}>
      <div className="page-head">
        <h1>Tài chính</h1>
      </div>

      {err && <div className="error">{err}</div>}

      {/* Chi phí — dùng hàng ngày, ưu tiên lên trước */}
      <section className="card">
        <h2 className="card-title">Chi phí</h2>

        <details style={{ marginBottom: 16 }}>
          <summary className="btn btn-outline btn-sm" style={{ display: "inline-block" }}>
            + Thêm chi phí
          </summary>
          <form action={addExpenseAction} className="stack-form" style={{ marginTop: 12 }}>
            <label>
              <span>Ngày</span>
              <input
                type="date"
                name="spentAt"
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </label>
            <label>
              <span>Nhóm</span>
              <select name="category" defaultValue="khac">
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {EXPENSE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Số tiền (₫)</span>
              <input type="number" name="amountVnd" step="1000" min="0" required />
            </label>
            <label>
              <span>Đơn liên quan (mã đơn, tuỳ chọn)</span>
              <input type="number" name="orderId" placeholder="để trống = chi phí chung" />
            </label>
            <label>
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
            <button type="submit" className="btn">
              Lưu
            </button>
          </form>
        </details>

        <div className="table-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Nhóm</th>
                <th className="num">Số tiền</th>
                <th>Đơn</th>
                <th>Hình thức</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {expenseRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    Chưa có chi phí nào.
                  </td>
                </tr>
              ) : (
                expenseRows.map((e) => (
                  <tr key={e.id}>
                    <td>{formatDate(e.spentAt)}</td>
                    <td>{EXPENSE_CATEGORY_LABELS[e.category]}</td>
                    <td className="num">{formatVnd(e.amountVnd)}</td>
                    <td>{e.orderId ? `#${e.orderId}` : "chung"}</td>
                    <td>{PAYMENT_METHOD_LABELS[e.method]}</td>
                    <td>
                      <form action={deleteExpenseAction}>
                        <input type="hidden" name="id" value={e.id} />
                        <button type="submit" className="btn btn-sm btn-outline">
                          Xoá
                        </button>
                      </form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Ví ¥ — gọn, số liệu sát phải, chi tiết gấp trong <details> */}
      <section className="card wallet-card">
        <div className="wallet-head">
          <h2 className="card-title" style={{ marginBottom: 0 }}>
            Ví ¥
          </h2>
          <div className="wallet-figures">
            <div className="wallet-balance">
              {wallet.balance.toLocaleString("vi-VN")}¥
            </div>
            <div className="wallet-sub">
              ≈ {formatVnd(wallet.valueVnd)} · giá vốn bq{" "}
              {Math.round(wallet.avgCost).toLocaleString("vi-VN")}₫/¥
            </div>
          </div>
        </div>

        {wallet.balance < 0 && (
          <p className="warn-banner">
            ⚠️ Ví ¥ đang âm ({wallet.balance}¥) — có đợt nạp nào chưa ghi?
          </p>
        )}

        <details>
          <summary className="btn btn-outline btn-sm" style={{ display: "inline-block" }}>
            + Nạp ¥ / xem sổ chuyển động
          </summary>

          <form action={addTopupAction} className="stack-form" style={{ marginTop: 12 }}>
            <label>
              <span>Số tệ nhận (¥)</span>
              <input type="number" name="cny" step="0.01" min="0" required />
            </label>
            <label>
              <span>Số tiền trả (₫)</span>
              <input type="number" name="vndPaid" step="1000" min="0" required />
            </label>
            <label>
              <span>Ghi chú</span>
              <input type="text" name="note" placeholder="tuỳ chọn" />
            </label>
            <button type="submit" className="btn">
              Lưu
            </button>
          </form>

          <div className="table-scroll" style={{ marginTop: 16 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Loại</th>
                  <th className="num">¥</th>
                  <th className="num">VND trả</th>
                  <th className="num">Giá vốn chốt</th>
                  <th>Đơn</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {ledger.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted">
                      Chưa có chuyển động nào.
                    </td>
                  </tr>
                ) : (
                  ledger.map((l) => (
                    <tr key={l.id}>
                      <td>{formatDate(new Date(l.createdAt * 1000))}</td>
                      <td>{LEDGER_KIND_LABELS[l.kind]}</td>
                      <td className="num">
                        {l.cnyDelta > 0 ? "+" : ""}
                        {l.cnyDelta.toLocaleString("vi-VN")}
                      </td>
                      <td className="num">
                        {l.vndPaid != null ? formatVnd(l.vndPaid) : "—"}
                      </td>
                      <td className="num">
                        {l.rateSnapshot != null
                          ? `${l.rateSnapshot.toLocaleString("vi-VN")}₫/¥`
                          : "—"}
                      </td>
                      <td>{l.orderId ? `#${l.orderId}` : "—"}</td>
                      <td>
                        {l.kind === "nap" && (
                          <form action={deleteLedgerAction}>
                            <input type="hidden" name="id" value={l.id} />
                            <button type="submit" className="btn btn-sm btn-outline">
                              Xoá
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </AppShell>
  );
}
