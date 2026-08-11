import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { AppShell } from "../../_components/app-shell";
import { CopyButton } from "../../_components/copy-button";
import { PhotoUpload } from "../../_components/photo-upload";
import { PhotoGallery } from "../../_components/photo-gallery";
import { changeStatusAction, lineExceptionAction } from "../actions";
import { getOrderDetail, getPackagesForOrder } from "@/db/queries";
import { computeOrderMoney } from "@/lib/money";
import { buildQuoteText, formatCny, formatDateTime, formatVnd } from "@/lib/format";
import {
  allowedNextStatuses,
  ORDER_TYPE_LABELS,
  STATUS_LABELS,
} from "@/lib/order-status";

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const session = await requireAuth();
  const { id } = await params;
  const { err } = await searchParams;
  const orderId = Number(id);
  if (!Number.isInteger(orderId)) notFound();

  const detail = await getOrderDetail(orderId);
  if (!detail || !detail.order) notFound();

  const { order, customer, items, history, photos } = detail;
  const orderPackages = getPackagesForOrder(orderId);
  const money = computeOrderMoney({
    goodsTotalCny: order.goodsTotalCny,
    exchangeRate: order.exchangeRate,
    serviceFee: order.serviceFee,
    shippingFee: order.shippingFee,
    deposit: order.deposit,
  });
  const nextStatuses = allowedNextStatuses(order.orderType, order.status);
  const isStockSale = order.orderType === "ban_tu_kho";
  const saleProfit = money.goodsTotalVnd - (order.saleCost ?? 0);
  // Khi nào cho tách dòng: lỗi NCC ở khâu lưu thông, đổi/trả sau khi giao.
  const canDefect = (
    ["da_mua_tq", "ve_kho_tq", "dang_van_chuyen_vn", "ve_kho_vn"] as const
  ).includes(order.status as never);
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
    serviceFee: order.serviceFee,
    shippingFee: order.shippingFee,
    deposit: order.deposit,
  });

  return (
    <AppShell username={session.username}>
        <div className="crumbs">
          <Link href="/orders">← Danh sách đơn</Link>
        </div>

        <div className="page-head">
          <h1>
            Đơn #{order.id}{" "}
            <span className={`badge badge-type type-${order.orderType}`}>
              {ORDER_TYPE_LABELS[order.orderType]}
            </span>
          </h1>
          <span className={`badge badge-status status-${order.status}`}>
            {STATUS_LABELS[order.status]}
          </span>
        </div>

        {err && <div className="error">{err}</div>}

        {customer?.warningFlag && (
          <div className="warn-flag">
            ⚠️ Khách có cờ cảnh báo
            {customer.warningReason ? `: ${customer.warningReason}` : ""}.
          </div>
        )}

        {/* Chuyển trạng thái một chạm */}
        <section className="card">
          <h2 className="card-title">Chuyển trạng thái</h2>
          {nextStatuses.length === 0 ? (
            <p className="muted">Đơn đã ở trạng thái cuối, không thể chuyển tiếp.</p>
          ) : (
            <div className="status-actions">
              {nextStatuses.map((to) => (
                <form key={to} action={changeStatusAction}>
                  <input type="hidden" name="orderId" value={order.id} />
                  <input type="hidden" name="to" value={to} />
                  <button
                    type="submit"
                    className={`btn ${
                      to === "su_co" || to === "khach_bom" || to === "huy"
                        ? "btn-warn"
                        : ""
                    }`}
                  >
                    {STATUS_LABELS[to]}
                  </button>
                </form>
              ))}
            </div>
          )}
        </section>

        <div className="two-col">
          {/* Khách + tiền */}
          <section className="card">
            <h2 className="card-title">Khách hàng</h2>
            <div className="kv">
              <span>Tên</span>
              <strong>{customer?.name}</strong>
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
                  <span>Phí dịch vụ</span>
                  <span>{formatVnd(order.serviceFee)}</span>
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
                      <td>
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
                      <td>{it.attributes ?? "—"}</td>
                      <td className="num">{it.quantity}</td>
                      <td className="num">{money2(it.unitPriceCny)}</td>
                      <td className="num">
                        {money2(it.quantity * it.unitPriceCny)}
                      </td>
                      {showLineActions && (
                        <td>
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
