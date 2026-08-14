import { requireAuth } from "@/lib/auth";
import { AppShell } from "../_components/app-shell";
import { getAssetSnapshot, getCashFlow, getPnlData } from "@/db/queries";
import { computePnl } from "@/lib/pnl";
import { formatVnd } from "@/lib/format";
import { EXPENSE_CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/expenses";

const MONTH_NAMES = [
  "Tháng 1",
  "Tháng 2",
  "Tháng 3",
  "Tháng 4",
  "Tháng 5",
  "Tháng 6",
  "Tháng 7",
  "Tháng 8",
  "Tháng 9",
  "Tháng 10",
  "Tháng 11",
  "Tháng 12",
];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const session = await requireAuth();
  const { y, m } = await searchParams;

  const now = new Date();
  const year = Number(y) || now.getFullYear();
  const month = Number(m) || now.getMonth() + 1;

  const cashFlow = await getCashFlow(year, month);
  const pnl = computePnl(await getPnlData(year, month));
  const assets = await getAssetSnapshot();

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  return (
    <AppShell username={session.username}>
      <div className="page-head">
        <h1>Báo cáo</h1>
      </div>

      <div className="filter-bar">
        <a
          className="btn btn-outline btn-sm"
          href={`/reports?y=${prevYear}&m=${prevMonth}`}
        >
          ← Tháng trước
        </a>
        <strong>
          {MONTH_NAMES[month - 1]} {year}
        </strong>
        <a
          className="btn btn-outline btn-sm"
          href={`/reports?y=${nextYear}&m=${nextMonth}`}
        >
          Tháng sau →
        </a>
      </div>

      {/* Dòng tiền tháng */}
      <section className="card">
        <h2 className="card-title">Dòng tiền tháng</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Ngân hàng cho bạn số dư; bảng này cho bạn thành phần của biến động.
        </p>
        <div className="kv">
          <span>Tiền vào (khách trả)</span>
          <strong className="pos">{formatVnd(cashFlow.inflowTotal)}</strong>
        </div>
        <div className="kv">
          <span>Tiền ra — nạp ¥</span>
          <span>−{formatVnd(cashFlow.topupsVnd)}</span>
        </div>
        <div className="kv">
          <span>Tiền ra — chi phí</span>
          <span>−{formatVnd(cashFlow.spendTotal)}</span>
        </div>
        <div className="kv kv-total">
          <span>Ròng</span>
          <strong className={cashFlow.netVnd < 0 ? "profit-negative" : "pos"}>
            {formatVnd(cashFlow.netVnd)}
          </strong>
        </div>
        <div className="two-col" style={{ marginTop: 12 }}>
          <div>
            <h3 className="card-title" style={{ fontSize: "0.95rem" }}>
              Tiền vào theo hình thức
            </h3>
            {cashFlow.inflow.length === 0 ? (
              <p className="muted small">Không có.</p>
            ) : (
              cashFlow.inflow.map((r) => (
                <div className="kv" key={r.method}>
                  <span>{PAYMENT_METHOD_LABELS[r.method]}</span>
                  <span>{formatVnd(r.total)}</span>
                </div>
              ))
            )}
          </div>
          <div>
            <h3 className="card-title" style={{ fontSize: "0.95rem" }}>
              Chi phí theo hình thức
            </h3>
            {cashFlow.spend.length === 0 ? (
              <p className="muted small">Không có.</p>
            ) : (
              cashFlow.spend.map((r) => (
                <div className="kv" key={r.method}>
                  <span>{PAYMENT_METHOD_LABELS[r.method]}</span>
                  <span>{formatVnd(r.total)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Lãi/lỗ tháng */}
      <section className="card">
        <h2 className="card-title">Lãi/lỗ tháng</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Chỉ tính đơn đã <strong>Hoàn tất</strong> trong tháng.
        </p>

        <div className="two-col">
          <div>
            <h3 className="card-title" style={{ fontSize: "0.95rem" }}>
              Chắc chắn ({pnl.confirmed.orderCount} đơn)
            </h3>
            <div className="kv">
              <span>Doanh thu</span>
              <span>{formatVnd(pnl.confirmed.revenueVnd)}</span>
            </div>
            <div className="kv">
              <span>− Giá vốn hàng</span>
              <span>{formatVnd(pnl.confirmed.goodsCostVnd)}</span>
            </div>
            <div className="kv">
              <span>= Lời gộp</span>
              <strong>{formatVnd(pnl.confirmed.grossProfitVnd)}</strong>
            </div>
            <div className="kv">
              <span>　├ Lời định giá</span>
              <span>{formatVnd(pnl.confirmed.pricingMarginVnd)}</span>
            </div>
            <div className="kv">
              <span>　└ Lời chênh tỷ giá</span>
              <span>{formatVnd(pnl.confirmed.fxMarginVnd)}</span>
            </div>
            <div className="kv">
              <span>+ Ship thu</span>
              <span>{formatVnd(pnl.confirmed.shipCollectedVnd)}</span>
            </div>
            <div className="kv">
              <span>− Chi phí gắn đơn</span>
              <span>{formatVnd(pnl.confirmed.orderExpensesVnd)}</span>
            </div>
          </div>

          <div>
            <h3 className="card-title" style={{ fontSize: "0.95rem" }}>
              ⚠️ Đang ước tính ({pnl.estimated.orderCount} đơn)
            </h3>
            <p className="muted small" style={{ marginTop: 0 }}>
              Dựa trên giá ¥ chưa xác nhận.
            </p>
            <div className="kv">
              <span>Doanh thu</span>
              <span>{formatVnd(pnl.estimated.revenueVnd)}</span>
            </div>
            <div className="kv">
              <span>Lời gộp</span>
              <span>{formatVnd(pnl.estimated.grossProfitVnd)}</span>
            </div>
          </div>
        </div>

        <h3 className="card-title" style={{ fontSize: "0.95rem", marginTop: 16 }}>
          Chi phí theo kỳ
        </h3>
        {pnl.periodExpenseByCategory.length === 0 ? (
          <p className="muted small">Không có.</p>
        ) : (
          pnl.periodExpenseByCategory.map((c) => (
            <div className="kv" key={c.category}>
              <span>{EXPENSE_CATEGORY_LABELS[c.category]}</span>
              <span>{formatVnd(c.amountVnd)}</span>
            </div>
          ))
        )}
        <div className="kv">
          <span>Chia bình quân / đơn</span>
          <span>
            {pnl.allocatedPerOrderVnd === null
              ? "không có đơn nào để phân bổ"
              : formatVnd(pnl.allocatedPerOrderVnd)}
          </span>
        </div>

        {pnl.bomDepositsVnd > 0 && (
          <div className="kv">
            <span>+ Cọc giữ từ đơn khách bom</span>
            <span>{formatVnd(pnl.bomDepositsVnd)}</span>
          </div>
        )}

        <div className="kv kv-total">
          <span>Lãi ròng</span>
          <strong className={pnl.netProfitVnd < 0 ? "profit-negative" : "pos"}>
            {formatVnd(pnl.netProfitVnd)}
          </strong>
        </div>
      </section>

      {/* Tiền của mình đang nằm ở đâu */}
      <section className="card">
        <h2 className="card-title">Tiền của mình đang nằm ở đâu</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          (Số dư ngân hàng — bạn tự xem ở app ngân hàng)
        </p>
        <div className="kv">
          <span>+ ¥ đang giữ</span>
          <span>
            {assets.walletCny.toLocaleString("vi-VN")}¥ ≈{" "}
            {formatVnd(assets.walletVnd)}
          </span>
        </div>
        <div className="kv">
          <span>+ Hàng tồn kho (giá vốn)</span>
          <span>{formatVnd(assets.stockVnd)}</span>
        </div>
        <div className="kv">
          <span>+ Khách còn nợ</span>
          <span>{formatVnd(assets.receivableVnd)}</span>
        </div>
        <div className="kv">
          <span>− Cọc đang giữ của đơn chưa giao</span>
          <span>−{formatVnd(assets.heldDepositsVnd)}</span>
        </div>
      </section>
    </AppShell>
  );
}
