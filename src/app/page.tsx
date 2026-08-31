import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { AppShell } from "./_components/app-shell";
import { Icon } from "./_components/icons";
import { ListRow } from "./_components/list-row";
import {
  countOrdersByStatus,
  getPnlData,
  getSettings,
  getWallet,
  listCustomersWithTotals,
  listOrdersWithGaps,
} from "@/db/queries";
import { formatVnd } from "@/lib/format";
import { MAIN_CHAIN, STATUS_LABELS } from "@/lib/order-status";
import { GAP_CODES, GAP_LABELS } from "@/lib/order-gaps";
import { computePnl } from "@/lib/pnl";
import { StatusIcon } from "./_components/status-icon";

const BACKUP_WARN_DAYS = 14;

export default async function HomePage() {
  const now = new Date();
  const [session, orders, customers, wallet, pnlData, settings] =
    await Promise.all([
      requireAuth(),
      listOrdersWithGaps(),
      listCustomersWithTotals(),
      getWallet(),
      getPnlData(now.getFullYear(), now.getMonth() + 1),
      getSettings(),
    ]);
  // Đếm từ danh sách đã fetch — không quét lại bảng orders lần hai (xem
  // ghi chú tại định nghĩa countOrdersByStatus trong queries.ts).
  const statusCounts = countOrdersByStatus(orders);
  const pnl = computePnl(pnlData);

  const daysSinceBackup =
    settings.lastBackupAt === null
      ? null
      : Math.floor((Date.now() / 1000 - settings.lastBackupAt) / 86400);
  const backupOverdue =
    daysSinceBackup === null || daysSinceBackup >= BACKUP_WARN_DAYS;

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

  return (
    <AppShell username={session.username} title="Tổng quan">
      {backupOverdue && (
        <Link href="/backup" className="card warn-card">
          <strong>Đã lâu chưa sao lưu</strong>
          <span className="muted">
            {daysSinceBackup === null
              ? "Chưa từng tải bản sao lưu nào."
              : `Lần gần nhất cách đây ${daysSinceBackup} ngày.`}{" "}
            Supabase gói miễn phí không tự sao lưu — chạm để tải bản mới.
          </span>
        </Link>
      )}

      {/* Cần chú ý */}
      <section className="card">
        <h2 className="card-title">
          ⚠️ Cần chú ý <span className="count">{attention.length}</span>
        </h2>
        {attention.length === 0 ? (
          <p className="muted">Không có đơn nào cần chú ý. Mọi thứ ổn 👍</p>
        ) : (
          attention.map((o) => (
            <ListRow
              key={o.id}
              href={`/orders/${o.id}`}
              title={o.customerName}
              meta={o.status === "su_co" ? "⚠️ Sự cố" : `⏳ ${o.ageDays} ngày`}
              amount={formatVnd(o.amountDue)}
            />
          ))
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
          <div className="status-cards">
            {statusCounts.map((s) => {
              const chainIdx = (MAIN_CHAIN as readonly string[]).indexOf(
                s.status,
              );
              const progress =
                chainIdx >= 0
                  ? ((chainIdx + 1) / MAIN_CHAIN.length) * 100
                  : null;
              return (
                <Link
                  key={s.status}
                  href="/orders"
                  className={`status-card status-card--${s.status}`}
                >
                  <span className="status-card-icon">
                    <StatusIcon status={s.status} size={16} />
                  </span>
                  <span className="status-card-count">{s.count}</span>
                  <span className="status-card-label">
                    {STATUS_LABELS[s.status]}
                  </span>
                  {progress !== null && (
                    <span className="status-card-progress">
                      <span style={{ width: `${progress}%` }} />
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Công nợ */}
      <section className="card">
        <h2 className="card-title">Công nợ</h2>
        <div className="dash-big">{formatVnd(totalOutstanding)}</div>
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
        <div className={`dash-big ${wallet.balance < 0 ? "profit-negative" : ""}`}>
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
          className={`dash-big ${pnl.netProfitVnd < 0 ? "profit-negative" : ""}`}
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
            <Icon name="image" size={18} /> Nhập nhanh từ ảnh
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
