import { requireAuth } from "@/lib/auth";
import { getWallet, listExpenses, listLedger } from "@/db/queries";
import { formatVnd } from "@/lib/format";
import {
  EXPENSE_CATEGORY_LABELS,
  LEDGER_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/expenses";
import { deleteExpenseAction, deleteLedgerAction } from "./actions";
import { AddExpenseSheet } from "./add-expense-sheet";
import { AddTopupSheet } from "./add-topup-sheet";
import { atLeast } from "@/lib/roles";

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString("vi-VN");
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const [session, { err }, wallet, ledger, expenseRows] = await Promise.all([
    requireAuth(),
    searchParams,
    getWallet(),
    listLedger(),
    listExpenses(),
  ]);

  // Sáu thao tác tiền là Owner-only (v8-C). Đây CHỈ là phần ẩn nút cho gọn
  // mắt — chặn thật nằm trong từng server action.
  const laOwner = atLeast(session.role, "owner");

  return (
    <>
      {err && <div className="error">{err}</div>}

      {/* Chi phí — dùng hàng ngày, ưu tiên lên trước */}
      <section className="card">
        <h2 className="card-title">Chi phí</h2>

        <div style={{ marginBottom: 16 }}>
          <AddExpenseSheet />
        </div>

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
                      {laOwner && (
                        <form action={deleteExpenseAction}>
                          <input type="hidden" name="id" value={e.id} />
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
      </section>

      {/* Ví ¥ — số lớn theo đúng kiểu Tổng quan, chi tiết gấp trong <details> */}
      <section className="card">
        <h2 className="card-title">Ví ¥</h2>
        <div className={`dash-big ${wallet.balance < 0 ? "profit-negative" : ""}`}>
          {wallet.balance.toLocaleString("vi-VN")}¥
        </div>
        <p className="muted" style={{ margin: "0 0 12px" }}>
          ≈ {formatVnd(wallet.valueVnd)} · giá vốn bq{" "}
          {Math.round(wallet.avgCost).toLocaleString("vi-VN")}₫/¥
        </p>

        {wallet.balance < 0 && (
          <p className="warn-banner">
            ⚠️ Ví ¥ đang âm ({wallet.balance}¥) — có đợt nạp nào chưa ghi?
          </p>
        )}

        {laOwner && (
          <div style={{ marginBottom: 12 }}>
            <AddTopupSheet />
          </div>
        )}

        <details>
          <summary className="btn btn-outline btn-sm" style={{ display: "inline-block" }}>
            Xem sổ chuyển động
          </summary>

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
                        {laOwner && l.kind === "nap" && (
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
    </>
  );
}
