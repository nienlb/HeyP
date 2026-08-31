import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { AppShell } from "../../_components/app-shell";
import { CopyButton } from "../../_components/copy-button";
import { PhotoUpload } from "../../_components/photo-upload";
import { PhotoGallery } from "../../_components/photo-gallery";
import { lineExceptionAction } from "../actions";
import {
  getOrderDetail,
  getPackagesForOrder,
  getSettings,
  suggestFinalPayment,
} from "@/db/queries";
import { PaymentsBlock } from "./payments-block";
import { computeOrderMoney } from "@/lib/money";
import { buildQuoteText, formatCny, formatDateTime, formatVnd } from "@/lib/format";
import {
  allowedNextStatuses,
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
  searchParams: Promise<{ err?: string }>;
}) {
  const [session, { id }, { err }] = await Promise.all([
    requireAuth(),
    params,
    searchParams,
  ]);
  const orderId = Number(id);
  if (!Number.isInteger(orderId)) notFound();

  // Bốn truy vấn này độc lập nhau — chạy song song để chỉ tốn 1 vòng
  // round-trip thay vì 4. suggestFinalPayment trước đây nằm trong JSX
  // (await giữa lúc render) nên luôn chạy sau cùng; kéo lên đây.
  const [detail, orderPackages, settings, suggestedFinal] = await Promise.all([
    getOrderDetail(orderId),
    getPackagesForOrder(orderId),
    getSettings(),
    suggestFinalPayment(orderId),
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

  return (
    <AppShell
      username={session.username}
      title={`#${order.id}`}
      backHref="/orders"
    >
        <div className="page-head">
          <span className={`badge badge-type type-${order.orderType}`}>
            {ORDER_TYPE_LABELS[order.orderType]}
          </span>
          <span className={`badge badge-status status-${order.status}`}>
            {STATUS_LABELS[order.status]}
          </span>
        </div>

        {err && <div className="error">{err}</div>}

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

        {/* Hành trình đơn hàng: stepper + hành động chuyển trạng thái */}
        <OrderJourney
          orderId={order.id}
          orderType={order.orderType}
          status={order.status}
          positionStatus={positionStatus}
          nextStatuses={nextStatuses}
        />

        <div className="two-col">
          {/* Khách + tiền */}
          <section className="card">
            <h2 className="card-title">Khách hàng</h2>
            <div className="kv">
              <span>Tên</span>
              {customer ? (
                <strong>{customer.name}</strong>
              ) : (
                <em className="muted">— chưa có khách —</em>
              )}
            </div>
            {customer?.phone && (
              <div className="kv">
                <span>SĐT/Zalo</span>
                <span>{customer.phone}</span>
              </div>
            )}
            {customer?.address && (
              <div className="kv">
                <span>Địa chỉ</span>
                <span>{customer.address}</span>
              </div>
            )}

            <h2 className="card-title" style={{ marginTop: 20 }}>
              Khối tiền
            </h2>
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

          {/* Timeline */}
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
        </div>

        {/* Bóc lớp giá theo món — chỉ đơn tính giá vốn bằng ¥ */}
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

        <PaymentsBlock
          orderId={order.id}
          rows={payments}
          quotedTotalVnd={order.quotedTotalVnd}
          shippingFee={order.shippingFee}
          suggestedFinal={suggestedFinal}
        />

        {/* Sản phẩm */}
        <section className="card">
          <h2 className="card-title">Sản phẩm ({items.length})</h2>
          <div className="table-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Tên hàng</th>
                  <th>Thuộc tính</th>
                  <th className="num">SL</th>
                  <th className="num">Đơn giá</th>
                  <th className="num">Thành tiền</th>
                  {showLineActions && <th></th>}
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const money2 = (n: number) =>
                    isStockSale ? formatVnd(n) : formatCny(n);
                  return (
                    <tr
                      key={it.id}
                      className={
                        it.lineStatus !== "normal" ? "line-removed" : undefined
                      }
                    >
                      <td data-label="Tên hàng">
                        {it.productUrl ? (
                          <a
                            href={it.productUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {it.name}
                          </a>
                        ) : (
                          it.name
                        )}
                      </td>
                      <td data-label="Thuộc tính">{it.attributes ?? "—"}</td>
                      <td className="num" data-label="SL">
                        {it.quantity}
                      </td>
                      <td className="num" data-label="Đơn giá">
                        {money2(it.unitPriceCny)}
                      </td>
                      <td className="num" data-label="Thành tiền">
                        {money2(it.quantity * it.unitPriceCny)}
                      </td>
                      {showLineActions && (
                        <td data-label="">
                          {it.lineStatus === "supplier_defect" ? (
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
                          ) : null}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {order.note && <p className="order-note">Ghi chú: {order.note}</p>}
        </section>

        {/* Kiện vận chuyển */}
        <section className="card">
          <h2 className="card-title">Kiện vận chuyển ({orderPackages.length})</h2>
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

        {/* Ảnh đính kèm */}
        <section className="card">
          <h2 className="card-title">Ảnh ({photos.length})</h2>
          <PhotoUpload orderId={order.id} defaultLabel="zalo_confirm" />
          <div style={{ marginTop: 14 }}>
            <PhotoGallery
              photos={photos.map((p) => ({ id: p.id, label: p.label }))}
            />
          </div>
        </section>
    </AppShell>
  );
}
