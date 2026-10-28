import "server-only";
import { NOW_EPOCH_SQL, raw, withTx } from "./raw";
import { stockKey, unitGoodsCostVnd } from "@/lib/inventory";
import { canCancelStockIn, reverseStockIn } from "@/lib/stock-in-cancel";
import type { OrderStatus, OrderType } from "@/lib/order-status";

export type CancelStockInResult = { ok: true } | { ok: false; reason: string };

/** Ném ra để cuộn ngược transaction — cùng lối với BlockedError ở deletion.ts. */
class BlockedError extends Error {}

/**
 * Huỷ một phiếu nhập kho (đơn `nhap_kho` ở `ve_kho_vn`): rút hàng khỏi kho,
 * hoàn ¥ về ví bằng dòng `dieu_chinh`, chuyển đơn sang `huy`.
 *
 * Mọi kiểm tra nằm TRONG transaction, sau `FOR UPDATE` trên dòng đơn rồi các
 * dòng tồn (theo id, cùng thứ tự với sellFromStock để không khoá chéo) —
 * kiểm ngoài transaction thì người kia có thể vừa bán đúng mấy đôi đó.
 *
 * Không đi qua changeOrderStatus: trục `nhap_kho` không có nhánh `huy`
 * (`allowedNextStatuses` trả rỗng ở `ve_kho_vn`), và side-effect ở đây là
 * NGƯỢC của side-effect bên đó. Dòng lịch sử vẫn ghi trong cùng transaction.
 */
export async function cancelStockIn(
  orderId: number,
  cancelledBy: string,
): Promise<CancelStockInResult> {
  try {
    await withTx(async (x) => {
      const order = await x.get<{
        orderType: OrderType;
        status: OrderStatus;
        exchangeRate: number;
      }>(
        `SELECT order_type AS "orderType", status, exchange_rate AS "exchangeRate"
           FROM orders WHERE id = ? FOR UPDATE`,
        [orderId],
      );
      if (!order) throw new BlockedError("Không tìm thấy đơn.");

      const counts = (await x.get<{
        exceptionLines: number;
        cnyAdjustments: number;
      }>(
        `SELECT (SELECT COUNT(*)::int FROM order_items
                  WHERE order_id = ? AND line_status <> 'normal') AS "exceptionLines",
                (SELECT COUNT(*)::int FROM cny_ledger
                  WHERE order_id = ? AND kind = 'dieu_chinh')    AS "cnyAdjustments"`,
        [orderId, orderId],
      ))!;

      const check = canCancelStockIn({ ...order, ...counts });
      if (!check.ok) throw new BlockedError(check.reason);

      const items = await x.all<{
        name: string;
        quantity: number;
        unitPriceCny: number;
        productId: number | null;
        size: string;
        color: string;
      }>(
        `SELECT name, quantity, unit_price_cny AS "unitPriceCny",
                product_id AS "productId", size, color
           FROM order_items WHERE order_id = ? AND line_status = 'normal'
          ORDER BY id`,
        [orderId],
      );

      // Gom theo dòng tồn: hai món cùng mẫu/size/màu rơi vào CÙNG một dòng
      // lúc nhập, rút riêng từng món sẽ so tồn hai lần với cùng một con số.
      const byKey = new Map<string, { qty: number; cost: number; name: string }>();
      for (const it of items) {
        const key = stockKey(it);
        const cur = byKey.get(key) ?? { qty: 0, cost: 0, name: it.name };
        cur.qty += it.quantity;
        cur.cost += it.quantity * unitGoodsCostVnd(it.unitPriceCny, order.exchangeRate);
        byKey.set(key, cur);
      }

      const keys = [...byKey.keys()];
      const rows =
        keys.length === 0
          ? []
          : await x.all<{ id: number; stockKey: string; quantity: number; avgCost: number }>(
              `SELECT id, stock_key AS "stockKey", quantity, avg_cost AS "avgCost"
                 FROM inventory
                WHERE source = 'active' AND stock_key IN (${keys.map(() => "?").join(",")})
                ORDER BY id FOR UPDATE`,
              keys,
            );
      const rowByKey = new Map(rows.map((r) => [r.stockKey, r]));

      for (const [key, want] of byKey) {
        const row = rowByKey.get(key);
        if (!row)
          throw new BlockedError(`${want.name}: không tìm thấy dòng tồn tương ứng.`);
        // Đơn giá trung bình của phần rút — chính là giá đã cộng vào lúc nhập.
        const after = reverseStockIn(
          row,
          want.qty,
          want.qty > 0 ? want.cost / want.qty : 0,
        );
        if ("error" in after) throw new BlockedError(`${want.name}: ${after.error}`);
        await x.run(
          "UPDATE inventory SET quantity = ?, avg_cost = ? WHERE id = ?",
          [after.quantity, after.avgCost, row.id],
        );
      }

      // Hoàn ¥: đúng số đã trừ, ở đúng tỷ giá đã chốt lúc trừ.
      const spent = (await x.get<{ cny: number; rate: number | null }>(
        `SELECT COALESCE(SUM(-cny_delta), 0) AS cny,
                (SELECT rate_snapshot FROM cny_ledger
                  WHERE order_id = ? AND kind = 'chi' ORDER BY id LIMIT 1) AS rate
           FROM cny_ledger WHERE order_id = ? AND kind IN ('chi','dieu_chinh')`,
        [orderId, orderId],
      ))!;
      if (spent.cny > 0) {
        await x.run(
          `INSERT INTO cny_ledger (kind, cny_delta, rate_snapshot, order_id, note)
           VALUES ('dieu_chinh', ?, ?, ?, ?)`,
          [spent.cny, spent.rate, orderId, `Huỷ phiếu nhập #${orderId}`],
        );
      }

      await x.run(
        `UPDATE orders SET status = 'huy', status_changed_at = ${NOW_EPOCH_SQL}
          WHERE id = ?`,
        [orderId],
      );
      await x.run(
        `INSERT INTO order_status_history
           (order_id, from_status, to_status, changed_by, note)
         VALUES (?, ?, 'huy', ?, ?)`,
        [orderId, order.status, cancelledBy, "Huỷ phiếu nhập kho"],
      );
    });
  } catch (err) {
    if (err instanceof BlockedError) return { ok: false, reason: err.message };
    throw err;
  }
  return { ok: true };
}

export type StockInRecord = {
  orderId: number;
  quantity: number;
  createdAt: Date;
};

/**
 * Các phiếu nhập còn hiệu lực, gom theo stock_key — để Sheet của một dòng tồn
 * liệt kê "đã nhập từ phiếu nào". Tính khoá bằng JS (stockKey) chứ không viết
 * lại biểu thức trong SQL: hai bản cài đặt là hai nguồn chân lý.
 */
export async function listStockInsByKey(): Promise<Map<string, StockInRecord[]>> {
  const rows = await raw.all<{
    orderId: number;
    name: string;
    quantity: number;
    productId: number | null;
    size: string;
    color: string;
    createdAt: string | number;
  }>(
    `SELECT o.id AS "orderId", i.name, i.quantity, i.product_id AS "productId",
            i.size, i.color, o.created_at AS "createdAt"
       FROM orders o JOIN order_items i ON i.order_id = o.id
      WHERE o.order_type = 'nhap_kho' AND o.status = 've_kho_vn'
        AND i.line_status = 'normal'
      ORDER BY o.id DESC`,
  );
  const out = new Map<string, StockInRecord[]>();
  for (const r of rows) {
    const key = stockKey(r);
    const list = out.get(key) ?? [];
    list.push({
      orderId: r.orderId,
      quantity: r.quantity,
      createdAt: new Date(Number(r.createdAt) * 1000),
    });
    out.set(key, list);
  }
  return out;
}
