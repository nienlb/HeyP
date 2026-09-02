import { formatVnd } from "@/lib/format";
import {
  lineCostVnd,
  lineSellVnd,
  orderProfit,
  type PricingLine,
} from "@/lib/line-pricing";
import type { ShipStatus } from "@/lib/order-gaps";
import { setShipFeeAction, updateLineCostAction, updateLineMarginAction } from "@/app/(app)/orders/actions";

export type PricingRow = PricingLine & {
  id: number;
  name: string;
  attributes: string | null;
  costConfirmed: boolean;
};

/**
 * Bóc lớp giá từng món (spec v3-A mục 3.3).
 *
 * Total là dữ kiện — khách đã đồng ý trên Zalo. Sửa ¥ thì lời được rải lại,
 * Total không đổi. Đơn một món thì lời bị Total ghim cứng nên ô lời chỉ đọc.
 */
export function LinePricingTable({
  orderId,
  rows,
  sellRate,
  quotedTotalVnd,
  shippingFee,
  shipStatus,
}: {
  orderId: number;
  rows: PricingRow[];
  sellRate: number;
  quotedTotalVnd: number;
  shippingFee: number;
  shipStatus: ShipStatus;
}) {
  const profit = orderProfit(rows);
  const singleLine = rows.length === 1;
  const unconfirmed = rows.filter((r) => !r.costConfirmed).length;

  return (
    <section className="card">
      <h2 className="card-title">Bóc lớp giá theo món</h2>

      {unconfirmed > 0 && (
        <p className="muted" style={{ marginTop: 0 }}>
          {unconfirmed} món đang dùng giá ¥ <em>gợi ý</em>. Sửa hoặc bấm{" "}
          <strong>Xác nhận</strong> để chốt giá vốn — báo cáo lãi/lỗ chỉ tính
          những món đã xác nhận vào phần &ldquo;chắc chắn&rdquo;.
        </p>
      )}

      <div className="table-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>Sản phẩm</th>
              <th className="num">Giá ¥</th>
              <th className="num">Giá vốn</th>
              <th className="num">Lời</th>
              <th className="num">Giá bán</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.name}
                  {r.attributes && (
                    <div className="muted small">{r.attributes}</div>
                  )}
                  {r.quantity > 1 && (
                    <div className="muted small">SL: {r.quantity}</div>
                  )}
                </td>
                <td className="num">
                  <form action={updateLineCostAction} className="cell-form">
                    <input type="hidden" name="orderId" value={orderId} />
                    <input type="hidden" name="itemId" value={r.id} />
                    <input
                      type="number"
                      name="unitPriceCny"
                      step="0.01"
                      min="0"
                      defaultValue={r.unitPriceCny}
                      className={r.costConfirmed ? "" : "cny-suggested"}
                    />
                    <button type="submit" className="btn btn-sm">
                      {r.costConfirmed ? "Lưu" : "Xác nhận"}
                    </button>
                  </form>
                </td>
                <td className="num">{formatVnd(lineCostVnd(r, sellRate))}</td>
                <td className="num">
                  {singleLine ? (
                    <span
                      title="Đơn một món: Total đã chốt ghim cứng lời, không kéo được"
                      className="muted"
                    >
                      {formatVnd(r.marginVnd)}
                    </span>
                  ) : (
                    <form action={updateLineMarginAction} className="cell-form">
                      <input type="hidden" name="orderId" value={orderId} />
                      <input type="hidden" name="itemId" value={r.id} />
                      <input
                        type="number"
                        name="marginVnd"
                        step="1000"
                        defaultValue={r.marginVnd}
                      />
                      <button type="submit" className="btn btn-sm">
                        Đặt
                      </button>
                    </form>
                  )}
                </td>
                <td className="num">{formatVnd(lineSellVnd(r, sellRate))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={4}>Total đã chốt với khách</th>
              <th className="num">{formatVnd(quotedTotalVnd)}</th>
            </tr>
            <tr>
              <th colSpan={4}>Tổng lời</th>
              <th className={`num ${profit < 0 ? "profit-negative" : "pos"}`}>
                {formatVnd(profit)}
              </th>
            </tr>
          </tfoot>
        </table>
      </div>

      {profit < 0 && (
        <p className="profit-negative" style={{ marginBottom: 0 }}>
          ⚠️ Đơn này đang lỗ {formatVnd(-profit)} — giá ¥ cao hơn mức đã báo khách.
        </p>
      )}

      <h3 className="card-title" style={{ marginTop: 20 }}>
        Phí ship
      </h3>
      {shipStatus === "unknown" ? (
        <div className="ship-row">
          <form action={setShipFeeAction} className="cell-form">
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="shipStatus" value="set" />
            <input
              type="number"
              name="shippingFee"
              min="0"
              step="1000"
              placeholder="Phí ship (₫)"
            />
            <button type="submit" className="btn btn-sm">
              Lưu
            </button>
          </form>
          <form action={setShipFeeAction}>
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="shipStatus" value="free" />
            <input type="hidden" name="shippingFee" value="0" />
            <button type="submit" className="btn btn-sm btn-outline">
              Freeship
            </button>
          </form>
        </div>
      ) : (
        <div className="ship-row">
          <strong>
            {shipStatus === "free" ? "Freeship" : formatVnd(shippingFee)}
          </strong>
          <form action={setShipFeeAction}>
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="shipStatus" value="unknown" />
            <input type="hidden" name="shippingFee" value="0" />
            <button type="submit" className="btn btn-sm btn-outline">
              Sửa
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
