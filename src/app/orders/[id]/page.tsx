import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { AppShell } from "../../_components/app-shell";
import { CopyButton } from "../../_components/copy-button";
import { ListRow } from "../../_components/list-row";
import { PhotoUpload } from "../../_components/photo-upload";
import { PhotoGallery } from "../../_components/photo-gallery";
import { lineExceptionAction, removeItemAction } from "../actions";
import {
  getOrderDetail,
  getPackagesForOrder,
  getSettings,
  listCustomers,
  suggestFinalPayment,
} from "@/db/queries";
import { PaymentsBlock } from "./payments-block";
import { computeOrderMoney } from "@/lib/money";
import {
  ageInDays,
  buildQuoteText,
  formatCny,
  formatDateTime,
  formatVnd,
} from "@/lib/format";
import {
  allowedNextStatuses,
  canEditExchangeRate,
  canEditOrderItems,
  earliestOriginFor,
  journeyTrack,
  ORDER_TYPE_LABELS,
  STATUS_LABELS,
  type OrderStatus,
  type OrderType,
} from "@/lib/order-status";
import { GAP_LABELS, orderGaps } from "@/lib/order-gaps";
import { LinePricingTable } from "./line-pricing-table";
import { OrderJourney } from "./order-journey";
import { OrderTabs, type TabCode } from "./order-tabs";
import { DangerZone } from "./danger-zone";
import { AddItemButton } from "./item-editor";
import { CustomerBlock } from "./customer-block";
import { OrderMetaBlock } from "./order-meta-block";

const TAB_CODES = ["tom_tat", "mon", "tien", "anh"] as const;

/**
 * Mốc trên trục của LOẠI ĐƠN này để định vị bước hiện tại trên stepper. Đơn
 * đang ở chính trục đó thì dùng luôn; đang ở nhánh (sự cố/khách bom/huỷ) thì
 * tìm mốc gần nhất trên trục trước khi rẽ nhánh, từ lịch sử trạng thái.
 * Lịch sử không ghi đủ bước trung gian (dữ liệu demo/cũ) → neo về mốc SỚM
 * NHẤT hợp lệ theo luật (earliestOriginFor), không phải "cho_bao_gia" —
 * neo sai kiểu đó khiến một đơn "khách bom" (chỉ xảy ra từ về kho VN trở
 * đi) trông như còn ở bước đầu tiên, chưa làm gì.
 */
function journeyPosition(
  status: OrderStatus,
  history: { toStatus: OrderStatus }[],
  orderType: OrderType,
): OrderStatus {
  const chain = journeyTrack(orderType) as readonly string[];
  if (chain.includes(status)) return status;
  const lastMain = history.find((h) => chain.includes(h.toStatus));
  return lastMain ? lastMain.toStatus : earliestOriginFor(status);
}

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string; tab?: string }>;
}) {
  const [session, { id }, { err, tab: rawTab }] = await Promise.all([
    requireAuth(),
    params,
    searchParams,
  ]);
  const orderId = Number(id);
  if (!Number.isInteger(orderId)) notFound();

  // Năm truy vấn này độc lập nhau — chạy song song để chỉ tốn 1 vòng
  // round-trip thay vì 5. suggestFinalPayment trước đây nằm trong JSX
  // (await giữa lúc render) nên luôn chạy sau cùng; kéo lên đây.
  const [detail, orderPackages, settings, suggestedFinal, allCustomers] =
    await Promise.all([
      getOrderDetail(orderId),
      getPackagesForOrder(orderId),
      getSettings(),
      suggestFinalPayment(orderId),
      listCustomers(),
    ]);
  if (!detail || !detail.order) notFound();

  const { order, customer, items, history, photos, payments } = detail;
  const money = computeOrderMoney({
    goodsTotalCny: order.goodsTotalCny,
    exchangeRate: order.exchangeRate,
    serviceFee: order.marginVnd,
    shippingFee: order.shippingFee,
    deposit: order.deposit,
  });
  const nextStatuses = allowedNextStatuses(order.orderType, order.status);
  const positionStatus = journeyPosition(
    order.status,
    history,
    order.orderType,
  );
  const isStockSale = order.orderType === "ban_tu_kho";
  const gaps = orderGaps(
    {
      orderType: order.orderType,
      status: order.status,
      customerId: order.customerId,
      customerPhone: customer?.phone ?? null,
      customerAddress: customer?.address ?? null,
      shipStatus: order.shipStatus,
    },
    items.map((it) => ({ costConfirmed: it.costConfirmed })),
    photos.map((p) => ({ label: p.label })),
  );
  const sellRate = order.exchangeRate || settings.sellRate;
  const saleProfit = money.goodsTotalVnd - (order.saleCost ?? 0);
  // Khi nào cho tách dòng: lỗi NCC ở khâu lưu thông, đổi/trả sau khi giao.
  const canDefect = (["da_mua_tq", "ve_kho_vn"] as const).includes(
    order.status as never,
  );
  const canReturn = (["da_giao_khach", "hoan_tat"] as const).includes(
    order.status as never,
  );
  const showLineActions = !isStockSale && (canDefect || canReturn);
  const quote = buildQuoteText({
    customerName: customer?.name ?? "",
    items: items.map((it) => ({
      name: it.name,
      attributes: it.attributes,
      quantity: it.quantity,
      unitPriceCny: it.unitPriceCny,
    })),
    exchangeRate: order.exchangeRate,
    serviceFee: order.marginVnd,
    shippingFee: order.shippingFee,
    deposit: order.deposit,
  });

  const tab: TabCode = (TAB_CODES as readonly string[]).includes(rawTab ?? "")
    ? (rawTab as TabCode)
    : "tom_tat";

  return (
    <AppShell
      username={session.username}
      title={`#${order.id}`}
      backHref="/orders"
    >
      <section className="order-head">
        <span className="oh-label">Còn phải thu</span>
        <strong className="oh-amount num">{formatVnd(money.amountDue)}</strong>
        <span className="oh-meta">
          {ORDER_TYPE_LABELS[order.orderType]} ·{" "}
          {ageInDays(order.statusChangedAt)} ngày
        </span>
      </section>

      {err && <div className="error">{err}</div>}

      {/* Hành trình đơn hàng: stepper + hành động chuyển trạng thái — hiện
          ở mọi tab, luôn thấy được, không phải cuộn tới mới tìm ra. */}
      <OrderJourney
        orderId={order.id}
        orderType={order.orderType}
        status={order.status}
        positionStatus={positionStatus}
        nextStatuses={nextStatuses}
      />

      <OrderTabs orderId={order.id} active={tab} />

      {tab === "tom_tat" && (
        <>
          {gaps.length > 0 && (
            <div className="gap-banner">
              <div className="gap-chips">
                {gaps.map((g) => (
                  <span key={g} className="gap-chip">
                    {GAP_LABELS[g]}
                  </span>
                ))}
              </div>
              <p className="muted small" style={{ margin: "6px 0 0" }}>
                Đơn vẫn chạy bình thường — các mục này chỉ để nhắc bổ sung.
              </p>
            </div>
          )}

          {customer?.warningFlag && (
            <div className="warn-flag">
              ⚠️ Khách có cờ cảnh báo
              {customer.warningReason ? `: ${customer.warningReason}` : ""}.
            </div>
          )}

          <CustomerBlock
            orderId={order.id}
            customer={
              customer
                ? {
                    id: customer.id,
                    name: customer.name,
                    phone: customer.phone,
                    address: customer.address,
                  }
                : null
            }
            customers={allCustomers.map((c) => ({
              id: c.id,
              name: c.name,
              warningFlag: c.warningFlag,
              warningReason: c.warningReason,
            }))}
          />

          <OrderMetaBlock
            orderId={order.id}
            note={order.note}
            exchangeRate={order.exchangeRate}
            canEditRate={canEditExchangeRate(order.status)}
          />

          <section className="card">
            <h2 className="card-title">
              Kiện vận chuyển ({orderPackages.length})
            </h2>
            {orderPackages.length === 0 ? (
              <p className="muted">
                Chưa gắn kiện nào.{" "}
                <Link href="/tracking">Thêm ở màn Tracking →</Link>
              </p>
            ) : (
              <ul className="pkg-list-mini">
                {orderPackages.map((p) => (
                  <li key={p.id}>
                    <strong>{p.trackingCode}</strong>
                    {p.carrier ? ` · ${p.carrier}` : ""} —{" "}
                    {p.trackingStatus ?? "chưa có trạng thái"}
                    {p.needsManualCheck && " ⚠️"}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h2 className="card-title">Lịch sử trạng thái</h2>
            <ol className="timeline">
              {history.map((h) => (
                <li key={h.id}>
                  <div className="tl-main">
                    {h.fromStatus
                      ? `${STATUS_LABELS[h.fromStatus]} → ${STATUS_LABELS[h.toStatus]}`
                      : STATUS_LABELS[h.toStatus]}
                  </div>
                  <div className="tl-meta">
                    {formatDateTime(h.changedAt)}
                    {h.changedBy ? ` · ${h.changedBy}` : ""}
                    {h.note ? ` · ${h.note}` : ""}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}

      {tab === "mon" && (
        <>
          <section className="card">
            <h2 className="card-title">Sản phẩm ({items.length})</h2>
            {items.map((it) => {
              const money2 = (n: number) =>
                isStockSale ? formatVnd(n) : formatCny(n);
              const lineActions = showLineActions ? (
                it.lineStatus === "supplier_defect" ? (
                  <span className="badge status-su_co">Lỗi NCC</span>
                ) : it.lineStatus === "returned" ? (
                  <span className="badge status-huy">Đã trả</span>
                ) : canDefect ? (
                  <form action={lineExceptionAction}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="itemId" value={it.id} />
                    <input type="hidden" name="kind" value="defect" />
                    <button className="btn btn-warn btn-sm" type="submit">
                      Lỗi NCC
                    </button>
                  </form>
                ) : canReturn ? (
                  <form action={lineExceptionAction}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="itemId" value={it.id} />
                    <input type="hidden" name="kind" value="return" />
                    <button className="btn btn-warn btn-sm" type="submit">
                      Đổi/trả
                    </button>
                  </form>
                ) : null
              ) : null;

              return (
                <ListRow
                  key={it.id}
                  title={
                    it.productUrl ? (
                      <a href={it.productUrl} target="_blank" rel="noreferrer">
                        {it.name}
                      </a>
                    ) : (
                      it.name
                    )
                  }
                  meta={`${it.attributes ?? "—"} · ×${it.quantity}`}
                  amount={money2(it.quantity * it.unitPriceCny)}
                  trailing={
                    <span className="lr-actions">
                      {lineActions}
                      {canEditOrderItems(order.status) && items.length > 1 && (
                        <form action={removeItemAction}>
                          <input type="hidden" name="orderId" value={order.id} />
                          <input type="hidden" name="itemId" value={it.id} />
                          <button
                            type="submit"
                            className="btn btn-sm btn-ghost"
                            aria-label={`Xoá món ${it.name}`}
                          >
                            Xoá
                          </button>
                        </form>
                      )}
                    </span>
                  }
                />
              );
            })}
            {order.note && (
              <p className="order-note">Ghi chú: {order.note}</p>
            )}
            {canEditOrderItems(order.status) && (
              <AddItemButton
                orderId={order.id}
                sellRate={sellRate}
                defaultMarginVnd={settings.defaultMarginVnd}
              />
            )}
          </section>

          {/* Bóc lớp giá theo món — chỉ đơn tính giá vốn bằng ¥. Giữ nguyên
              dạng bảng (không rebuild thành sheet): các form sửa giá/lời
              theo dòng ở đây đụng trực tiếp luật đã test trong
              line-pricing.test.ts, rủi ro rebuild không đáng. */}
          {!isStockSale && items.length > 0 && (
            <LinePricingTable
              orderId={order.id}
              rows={items.map((it) => ({
                id: it.id,
                name: it.name,
                attributes: it.attributes,
                quantity: it.quantity,
                unitPriceCny: it.unitPriceCny,
                marginVnd: it.marginVnd,
                costConfirmed: it.costConfirmed,
              }))}
              sellRate={sellRate}
              quotedTotalVnd={order.quotedTotalVnd}
              shippingFee={order.shippingFee}
              shipStatus={order.shipStatus}
            />
          )}
        </>
      )}

      {tab === "tien" && (
        <>
          <section className="card">
            <h2 className="card-title">Khối tiền</h2>
            {isStockSale ? (
              <>
                <div className="kv">
                  <span>Giá bán</span>
                  <span>{formatVnd(money.goodsTotalVnd)}</span>
                </div>
                <div className="kv">
                  <span>Giá vốn</span>
                  <span>{formatVnd(order.saleCost ?? 0)}</span>
                </div>
                <div className="kv">
                  <span>{saleProfit >= 0 ? "Lãi" : "Lỗ"}</span>
                  <strong className={saleProfit >= 0 ? "pos" : "neg"}>
                    {formatVnd(Math.abs(saleProfit))}
                  </strong>
                </div>
                <div className="kv">
                  <span>Đã cọc</span>
                  <span>−{formatVnd(order.deposit)}</span>
                </div>
                <div className="kv kv-total">
                  <span>Còn phải thu</span>
                  <strong>{formatVnd(money.amountDue)}</strong>
                </div>
              </>
            ) : (
              <>
                <div className="kv">
                  <span>Tiền hàng</span>
                  <span>
                    {order.exchangeRate === 1
                      ? formatVnd(money.goodsTotalVnd)
                      : `${formatCny(order.goodsTotalCny)} × ${order.exchangeRate.toLocaleString("vi-VN")} = ${formatVnd(money.goodsTotalVnd)}`}
                  </span>
                </div>
                <div className="kv">
                  <span>Lời</span>
                  <span>{formatVnd(order.marginVnd)}</span>
                </div>
                <div className="kv">
                  <span>Phí ship</span>
                  <span>{formatVnd(order.shippingFee)}</span>
                </div>
                <div className="kv">
                  <span>Tạm tính</span>
                  <span>{formatVnd(money.subtotalVnd)}</span>
                </div>
                <div className="kv">
                  <span>Đã cọc</span>
                  <span>−{formatVnd(order.deposit)}</span>
                </div>
                <div className="kv kv-total">
                  <span>Còn phải thu</span>
                  <strong>{formatVnd(money.amountDue)}</strong>
                </div>
                <div style={{ marginTop: 14 }}>
                  <CopyButton text={quote} />
                </div>
              </>
            )}
          </section>

          <PaymentsBlock
            orderId={order.id}
            rows={payments}
            quotedTotalVnd={order.quotedTotalVnd}
            shippingFee={order.shippingFee}
            suggestedFinal={suggestedFinal}
          />
        </>
      )}

      {tab === "anh" && (
        <>
          <section className="card">
            <h2 className="card-title">Ảnh ({photos.length})</h2>
            <PhotoUpload orderId={order.id} defaultLabel="zalo_confirm" />
            <div style={{ marginTop: 14 }}>
              <PhotoGallery
                photos={photos.map((p) => ({ id: p.id, label: p.label }))}
              />
            </div>
          </section>

          {session.role === "admin" && (
            <DangerZone
              orderId={order.id}
              summary={`${customer?.name ?? "Chưa có khách"} · ${items.length} món · ${formatVnd(order.quotedTotalVnd)}`}
            />
          )}
        </>
      )}
    </AppShell>
  );
}
