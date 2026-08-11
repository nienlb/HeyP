import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { AppShell } from "./_components/app-shell";
import { Icon } from "./_components/icons";
import {
  countOrdersByStatus,
  listCustomersWithTotals,
  listOrders,
} from "@/db/queries";
import { formatVnd } from "@/lib/format";
import { STATUS_LABELS } from "@/lib/order-status";

export default async function HomePage() {
  const session = await requireAuth();

  const [orders, statusCounts] = await Promise.all([
    listOrders(),
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
