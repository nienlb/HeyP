import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { Icon } from "@/app/_components/icons";
import { ListRow } from "@/app/_components/list-row";
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
import { StatusIcon } from "@/app/_components/status-icon";

const BACKUP_WARN_DAYS = 14;

/** Đơn "Cần chú ý" hiện trên desktop; điện thoại chỉ hiện 5 dòng đầu. */
const ATTENTION_DESKTOP = 8;
const ATTENTION_MOBILE = 5;

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

  // Doanh thu và số đơn gộp cả khối đã xác nhận lẫn khối còn ước tính —
  // PnlBlock.revenueVnd đã tính sẵn, màn này trước v8-A chỉ chưa hiển thị.
  const revenueVnd = pnl.confirmed.revenueVnd + pnl.estimated.revenueVnd;
  const pnlOrderCount = pnl.confirmed.orderCount + pnl.estimated.orderCount;

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
    .slice(0, ATTENTION_DESKTOP);

  const totalOutstanding = customers.reduce((s, c) => s + c.outstanding, 0);
  const debtors = customers.filter((c) => c.outstanding > 0);
  const topDebtors = debtors.slice(0, 5);

  const needInfo = orders.filter((o) => o.gaps.length > 0);
  const gapCounts = GAP_CODES.map((code) => ({
    code,
    count: needInfo.filter((o) => o.gaps.includes(code)).length,
  })).filter((g) => g.count > 0);

  return (
    <>
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

      {/* Số để liếc. Desktop 4 cột, điện thoại 2×2 — cùng thứ tự. */}
      <div className="kpi-row">
        <Link href="/reports" className="kpi">
          <span className="kpi-label">Doanh thu tháng này</span>
          <strong className="kpi-value">{formatVnd(revenueVnd)}</strong>
          <span className="kpi-sub">{pnlOrderCount} đơn hoàn tất</span>
        </Link>
        <Link href="/reports" className="kpi">
          <span className="kpi-label">Lãi tháng này</span>
          <strong
            className={`kpi-value${
              pnl.netProfitVnd < 0 ? " profit-negative" : ""
            }`}
          >
            {formatVnd(pnl.netProfitVnd)}
          </strong>
          <span className="kpi-sub">
            {pnl.estimated.orderCount > 0
              ? `${pnl.estimated.orderCount} đơn còn ước tính`
              : "đã xác nhận đủ giá vốn"}
          </span>
        </Link>
        <Link href="/customers" className="kpi">
          <span className="kpi-label">Công nợ</span>
          <strong className="kpi-value">{formatVnd(totalOutstanding)}</strong>
          <span className="kpi-sub">{debtors.length} khách còn nợ</span>
        </Link>
        <Link href="/finance" className="kpi">
          <span className="kpi-label">Ví ¥</span>
          <strong
            className={`kpi-value${
              wallet.balance < 0 ? " profit-negative" : ""
            }`}
          >
            {wallet.balance.toLocaleString("vi-VN")}¥
          </strong>
          <span className="kpi-sub">≈ {formatVnd(wallet.valueVnd)}</span>
        </Link>
      </div>

      {/* Đơn theo trạng thái — dải ngang, chiếm cả bề rộng */}
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

      {/* Việc phải làm — hai lưới, mỗi lưới 2 thẻ trên desktop */}
      <div className="card-grid">
        <section className="card">
          <h2 className="card-title">
            ⚠️ Cần chú ý <span className="count">{attention.length}</span>
          </h2>
          {attention.length === 0 ? (
            <p className="muted">Không có đơn nào cần chú ý. Mọi thứ ổn 👍</p>
          ) : (
            attention.map((o, i) => (
              <div
                key={o.id}
                className={i >= ATTENTION_MOBILE ? "row-desk-only" : undefined}
              >
                <ListRow
                  href={`/orders/${o.id}`}
                  title={o.customerName}
                  meta={
                    o.status === "su_co" ? "⚠️ Sự cố" : `⏳ ${o.ageDays} ngày`
                  }
                  amount={formatVnd(o.amountDue)}
                />
              </div>
            ))
          )}
        </section>

        <section className="card">
          <h2 className="card-title">Khách nợ nhiều nhất</h2>
          {topDebtors.length === 0 ? (
            <p className="muted">Không khách nào còn nợ 👍</p>
          ) : (
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
      </div>

      <div className="card-grid">
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
                  <Link href={`/orders?gap=${g.code}`}>{GAP_LABELS[g.code]}</Link>
                  <span>{g.count} đơn</span>
                </li>
              ))}
            </ul>
          )}
        </section>

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
      </div>
    </>
  );
}
