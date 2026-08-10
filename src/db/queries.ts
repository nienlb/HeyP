import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, sqlite } from "./index";
import {
  customers,
  orderItems,
  orderStatusHistory,
  orders,
} from "./schema";
import { computeOrderMoney, sumLineItemsCny } from "@/lib/money";
import {
  isTerminal,
  transition,
  type OrderStatus,
  type OrderType,
} from "@/lib/order-status";
import { config } from "@/lib/config";
import { ageInDays } from "@/lib/format";

// ---------- Khách hàng ----------

export async function listCustomers() {
  return db.select().from(customers).orderBy(customers.name);
}

export async function getCustomer(id: number) {
  return db.select().from(customers).where(eq(customers.id, id)).get();
}

// ---------- Tạo đơn (có transaction) ----------

export type NewOrderItemInput = {
  name: string;
  productUrl?: string | null;
  attributes?: string | null;
  quantity: number;
  unitPriceCny: number;
};

export type NewOrderInput = {
  customerId?: number | null;
  newCustomer?: { name: string; phone?: string; address?: string } | null;
  orderType: OrderType;
  exchangeRate: number;
  serviceFee: number;
  shippingFee: number;
  deposit: number;
  note?: string | null;
  items: NewOrderItemInput[];
  changedBy?: string | null;
};

export function createOrder(input: NewOrderInput): number {
  const goodsTotalCny = sumLineItemsCny(input.items);
  const money = computeOrderMoney({
    goodsTotalCny,
    exchangeRate: input.exchangeRate,
    serviceFee: input.serviceFee,
    shippingFee: input.shippingFee,
    deposit: input.deposit,
  });

  sqlite.exec("BEGIN");
  try {
    let customerId = input.customerId ?? null;
    if (!customerId && input.newCustomer) {
      const info = sqlite
        .prepare(
          "INSERT INTO customers(name, phone, address) VALUES(?, ?, ?)",
        )
        .run(
          input.newCustomer.name,
          input.newCustomer.phone ?? null,
          input.newCustomer.address ?? null,
        );
      customerId = Number(info.lastInsertRowid);
    }
    if (!customerId) throw new Error("Thiếu khách hàng cho đơn");

    const info = sqlite
      .prepare(
        `INSERT INTO orders
           (customer_id, order_type, status, exchange_rate, goods_total_cny,
            service_fee, shipping_fee, deposit, amount_due, note)
         VALUES (?, ?, 'cho_bao_gia', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        customerId,
        input.orderType,
        input.exchangeRate,
        goodsTotalCny,
        input.serviceFee,
        input.shippingFee,
        input.deposit,
        money.amountDue,
        input.note ?? null,
      );
    const orderId = Number(info.lastInsertRowid);

    const itemStmt = sqlite.prepare(
      `INSERT INTO order_items
         (order_id, product_url, name, attributes, quantity, unit_price_cny)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const it of input.items) {
      itemStmt.run(
        orderId,
        it.productUrl ?? null,
        it.name,
        it.attributes ?? null,
        it.quantity,
        it.unitPriceCny,
      );
    }

    sqlite
      .prepare(
        `INSERT INTO order_status_history
           (order_id, from_status, to_status, changed_by, note)
         VALUES (?, NULL, 'cho_bao_gia', ?, 'Tạo đơn')`,
      )
      .run(orderId, input.changedBy ?? null);

    sqlite.exec("COMMIT");
    return orderId;
  } catch (err) {
    sqlite.exec("ROLLBACK");
    throw err;
  }
}

// ---------- Chi tiết đơn ----------

export async function getOrderDetail(id: number) {
  const order = await db.select().from(orders).where(eq(orders.id, id)).get();
  if (!order) return null;
  const customer = await db
    .select()
    .from(customers)
    .where(eq(customers.id, order.customerId))
    .get();
  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, id))
    .orderBy(orderItems.id);
  const history = await db
    .select()
    .from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, id))
    .orderBy(desc(orderStatusHistory.changedAt), desc(orderStatusHistory.id));
  return { order, customer, items, history };
}

// ---------- Đổi trạng thái ----------

export type ChangeStatusResult =
  | { ok: true }
  | { ok: false; reason: string };

export function changeOrderStatus(
  id: number,
  to: OrderStatus,
  changedBy?: string | null,
  note?: string | null,
): ChangeStatusResult {
  const order = sqlite
    .prepare("SELECT order_type, status FROM orders WHERE id = ?")
    .get(id) as { order_type: OrderType; status: OrderStatus } | undefined;
  if (!order) return { ok: false, reason: "Không tìm thấy đơn" };

  const result = transition(order.order_type, order.status, to);
  if (!result.ok) return { ok: false, reason: result.reason };

  sqlite.exec("BEGIN");
  try {
    sqlite
      .prepare(
        "UPDATE orders SET status = ?, status_changed_at = unixepoch() WHERE id = ?",
      )
      .run(to, id);
    sqlite
      .prepare(
        `INSERT INTO order_status_history
           (order_id, from_status, to_status, changed_by, note)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, order.status, to, changedBy ?? null, note ?? null);
    sqlite.exec("COMMIT");
    return { ok: true };
  } catch (err) {
    sqlite.exec("ROLLBACK");
    throw err;
  }
}

// ---------- Danh sách đơn ----------

export type OrderListRow = {
  id: number;
  orderType: OrderType;
  status: OrderStatus;
  customerName: string;
  amountDue: number;
  deposit: number;
  createdAt: Date;
  statusChangedAt: Date;
  ageDays: number;
  isStale: boolean;
  needsAttention: boolean;
};

export async function listOrders(query?: string): Promise<OrderListRow[]> {
  const rows = await db
    .select({
      id: orders.id,
      orderType: orders.orderType,
      status: orders.status,
      amountDue: orders.amountDue,
      deposit: orders.deposit,
      createdAt: orders.createdAt,
      statusChangedAt: orders.statusChangedAt,
      customerName: customers.name,
    })
    .from(orders)
    .innerJoin(customers, eq(orders.customerId, customers.id))
    .orderBy(desc(orders.createdAt));

  const threshold = config.staleOrderDays;
  const q = query?.trim().toLowerCase();

  return rows
    .filter((r) => {
      if (!q) return true;
      return (
        r.customerName.toLowerCase().includes(q) ||
        String(r.id).includes(q) ||
        `#${r.id}`.includes(q)
      );
    })
    .map((r) => {
      const ageDays = ageInDays(r.statusChangedAt);
      const terminal = isTerminal(r.status);
      const isIncident = r.status === "su_co";
      const isStale = !terminal && !isIncident && ageDays >= threshold;
      return {
        ...r,
        ageDays,
        isStale,
        needsAttention: isIncident || isStale,
      };
    });
}
