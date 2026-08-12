import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { AppShell } from "./_components/app-shell";
import { Icon } from "./_components/icons";
import {
  countOrdersByStatus,
  getPnlData,
  getWallet,
  listCustomersWithTotals,
  listOrdersWithGaps,
} from "@/db/queries";
import { formatVnd } from "@/lib/format";
import { STATUS_LABELS } from "@/lib/order-status";
import { GAP_CODES, GAP_LABELS } from "@/lib/order-gaps";
import { computePnl } from "@/lib/pnl";

export default async function HomePage() {
  const session = await requireAuth();

  const [orders, statusCounts] = await Promise.all([
    listOrdersWithGaps(),
    countOrdersByStatus(),
  ]);
  const customers = listCustomersWithTotals();

  const attention = orders
    .filter((o) => o.needsAttention)
    .sort((a, b) => {
      if (a.status === "su_co" && b.status !== "su_co") return -1;
      if (b.status === "su_co" && a.status !== "su_co") return 1;
      return b.ageDays - a.ageDays;
    })
    .slice(0, 5);

  const totalOutstanding = customers.reduce((s, c) => s + c.outstanding, 0);
  const topDebtors = customers.filter((c) => c.outstanding > 0).slice(0, 5);

  const needInfo = orders.filter((o) => o.gaps.length > 0);
  const gapCounts = GAP_CODES.map((code) => ({
    code,
    count: needInfo.filter((o) => o.gaps.includes(code)).length,
  })).filter((g) => g.count > 0);

  const wallet = getWallet();
  const now = new Date();
  const pnl = computePnl(getPnlData(now.getFullYear(), now.getMonth() + 1));

  return (
    <AppShell username={session.username}>
      <div className="page-head">
        <h1>Tổng quan</h1>
      </div>

      <div className="dash-grid">
        {/* Cần chú ý — chiếm cả hàng */}
        <section className="card dash-attention">
          <h2 className="card-title">
            ⚠️ Cần chú ý <span className="count">{attention.length}</span>
          </h2>
          {attention.length === 0 ? (
            <p className="muted">Không có đơn nào cần chú ý. Mọi thứ ổn 👍</p>
          ) : (
            <div className="order-list">
              {attention.map((o) => (
                <Link
                  key={o.id}
                  href={`/orders/${o.id}`}
                  className="order-row"
                >
                  <span className="order-id">#{o.id}</span>
                  <span className="order-customer">{o.customerName}</span>
                  <span className="order-due">{formatVnd(o.amountDue)}</span>
                  <span className="order-age">
                    {o.status === "su_co" ? "⚠️ Sự cố" : `⏳ ${o.ageDays} ngày`}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Cần bổ sung */}
        <section className="card">
          <h2 className="card-title">
            Cần bổ sung <span className="count">{needInfo.length}</span>
          </h2>
          {needInfo.length === 0 ? (
            <p className="muted">Không đơn nào thiếu thông tin 👍</p>
          ) : (
            <ul className="dash-debtors">
              {gapCounts.map((g) => (
                <li key={g.code}>
                  <Link href={`/orders?gap=${g.code}`}>
                    {GAP_LABELS[g.code]}
                  </Link>
                  <span>{g.count} đơn</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Đơn theo trạng thái */}
        <section className="card">
          <h2 className="card-title">Đơn theo trạng thái</h2>
          {statusCounts.length === 0 ? (
            <p className="muted">Chưa có đơn nào.</p>
          ) : (
            <div className="dash-chips">
              {statusCounts.map((s) => (
                <Link
                  key={s.status}
                  href="/orders"
                  className={`dash-chip status-${s.status}`}
                >
                  <span className="dash-chip-count">{s.count}</span>
                  <span className="dash-chip-label">
                    {STATUS_LABELS[s.status]}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Công nợ */}
        <section className="card">
          <h2 className="card-title">Công nợ</h2>
          <div className="dash-big-number">{formatVnd(totalOutstanding)}</div>
          <p className="muted" style={{ margin: "0 0 12px" }}>
            tổng còn phải thu
          </p>
          {topDebtors.length > 0 && (
            <ul className="dash-debtors">
              {topDebtors.map((c) => (
                <li key={c.id}>
                  <Link href="/customers">{c.name}</Link>
                  <span>{formatVnd(c.outstanding)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Ví ¥ */}
        <section className="card">
          <h2 className="card-title">Ví ¥</h2>
          <div
            className={`dash-big-number ${wallet.balance < 0 ? "profit-negative" : ""}`}
          >
            {wallet.balance.toLocaleString("vi-VN")}¥
          </div>
          <p className="muted" style={{ margin: "0 0 12px" }}>
            ≈ {formatVnd(wallet.valueVnd)} · giá vốn bq{" "}
            {Math.round(wallet.avgCost).toLocaleString("vi-VN")}₫/¥
          </p>
          <Link href="/finance" className="btn btn-outline">
            Xem ví
          </Link>
        </section>

        {/* Lãi tháng này */}
        <section className="card">
          <h2 className="card-title">Lãi tháng này</h2>
          <div
            className={`dash-big-number ${pnl.netProfitVnd < 0 ? "profit-negative" : ""}`}
          >
            {formatVnd(pnl.netProfitVnd)}
          </div>
          {pnl.estimated.orderCount > 0 && (
            <p className="muted" style={{ margin: "0 0 12px" }}>
              gồm {pnl.estimated.orderCount} đơn còn ước tính
            </p>
          )}
          <Link href="/reports" className="btn btn-outline">
            Xem báo cáo
          </Link>
        </section>

        {/* Tác vụ nhanh */}
        <section className="card">
          <h2 className="card-title">Tác vụ nhanh</h2>
          <div className="dash-actions">
            <Link href="/orders/new" className="btn">
              <Icon name="plus" size={18} /> Tạo đơn
            </Link>
            <Link href="/orders/new" className="btn btn-outline">
              🤖 Đọc ảnh Zalo
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
