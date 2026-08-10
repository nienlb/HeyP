import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { AppHeader } from "../_components/app-header";
import { listOrders, type OrderListRow } from "@/db/queries";
import { formatVnd } from "@/lib/format";
import {
  BRANCH_STATUSES,
  MAIN_CHAIN,
  ORDER_TYPE_LABELS,
  STATUS_LABELS,
  type OrderStatus,
} from "@/lib/order-status";

const DISPLAY_ORDER: OrderStatus[] = [...MAIN_CHAIN, ...BRANCH_STATUSES];

function OrderRow({ o }: { o: OrderListRow }) {
  return (
    <Link href={`/orders/${o.id}`} className="order-row">
      <span className="order-id">#{o.id}</span>
      <span className="order-customer">{o.customerName}</span>
      <span className={`badge badge-type type-${o.orderType}`}>
        {ORDER_TYPE_LABELS[o.orderType]}
      </span>
      <span className="order-due">{formatVnd(o.amountDue)}</span>
      <span className="order-age">
        {o.status === "su_co"
          ? "⚠️ Sự cố"
          : o.isStale
            ? `⏳ ${o.ageDays} ngày`
            : `${o.ageDays}n`}
      </span>
    </Link>
  );
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireAuth();
  const { q } = await searchParams;
  const rows = await listOrders(q);

  const attention = rows
    .filter((r) => r.needsAttention)
    .sort((a, b) => {
      // Sự cố lên trước, rồi tới đơn đứng lâu nhất.
      if (a.status === "su_co" && b.status !== "su_co") return -1;
      if (b.status === "su_co" && a.status !== "su_co") return 1;
      return b.ageDays - a.ageDays;
    });
  const attentionIds = new Set(attention.map((r) => r.id));
  const rest = rows.filter((r) => !attentionIds.has(r.id));

  const groups = DISPLAY_ORDER.map((status) => ({
    status,
    items: rest.filter((r) => r.status === status),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <AppHeader username={session.username} />
      <main className="container">
        <div className="page-head">
          <h1>Đơn hàng</h1>
          <form className="search" action="/orders" method="get">
            <input
              type="search"
              name="q"
              placeholder="Tìm tên khách / mã đơn…"
              defaultValue={q ?? ""}
            />
          </form>
        </div>

        {rows.length === 0 ? (
          <div className="card empty">
            {q ? (
              <p>Không tìm thấy đơn khớp «{q}».</p>
            ) : (
              <p>
                Chưa có đơn nào.{" "}
                <Link href="/orders/new">Tạo đơn đầu tiên →</Link>
              </p>
            )}
          </div>
        ) : (
          <>
            {attention.length > 0 && (
              <section className="attention">
                <h2>⚠️ Cần chú ý ({attention.length})</h2>
                <div className="order-list">
                  {attention.map((o) => (
                    <div key={o.id} className="attention-item">
                      <OrderRow o={o} />
                      <span className="attention-status">
                        {STATUS_LABELS[o.status]}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {groups.map((g) => (
              <section key={g.status} className="status-group">
                <h2>
                  {STATUS_LABELS[g.status]}{" "}
                  <span className="count">{g.items.length}</span>
                </h2>
                <div className="order-list">
                  {g.items.map((o) => (
                    <OrderRow key={o.id} o={o} />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </main>
    </>
  );
}
