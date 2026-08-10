/**
 * Seed dữ liệu demo để kiểm thử tay màn danh sách (đơn quá hạn, đơn sự cố).
 * KHÔNG dùng cho dữ liệu thật. Chạy: npm run db:seed-demo
 * Xoá sạch dữ liệu demo: xoá file data/app.sqlite rồi `npm run db:migrate`.
 */
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const dbPath = resolve(
  process.cwd(),
  process.env.DATABASE_PATH ?? "./data/app.sqlite",
);
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON;");

function addCustomer(name: string, phone: string): number {
  const info = db
    .prepare("INSERT INTO customers(name, phone) VALUES(?, ?)")
    .run(name, phone);
  return Number(info.lastInsertRowid);
}

function addOrder(opts: {
  customerId: number;
  status: string;
  goodsTotalCny: number;
  exchangeRate: number;
  serviceFee: number;
  shippingFee: number;
  deposit: number;
  staleDaysAgo?: number;
  itemName: string;
  qty: number;
  priceCny: number;
}): number {
  const amountDue =
    Math.round(opts.goodsTotalCny * opts.exchangeRate) +
    opts.serviceFee +
    opts.shippingFee -
    opts.deposit;
  const info = db
    .prepare(
      `INSERT INTO orders
         (customer_id, order_type, status, exchange_rate, goods_total_cny,
          service_fee, shipping_fee, deposit, amount_due, status_changed_at)
       VALUES (?, 'order_ho', ?, ?, ?, ?, ?, ?, ?,
               unixepoch() - ?)`,
    )
    .run(
      opts.customerId,
      opts.status,
      opts.exchangeRate,
      opts.goodsTotalCny,
      opts.serviceFee,
      opts.shippingFee,
      opts.deposit,
      amountDue,
      (opts.staleDaysAgo ?? 0) * 86_400,
    );
  const orderId = Number(info.lastInsertRowid);
  db.prepare(
    `INSERT INTO order_items(order_id, name, quantity, unit_price_cny)
     VALUES (?, ?, ?, ?)`,
  ).run(orderId, opts.itemName, opts.qty, opts.priceCny);
  db.prepare(
    `INSERT INTO order_status_history(order_id, to_status, changed_by, note)
     VALUES (?, ?, 'seed', 'Dữ liệu demo')`,
  ).run(orderId, opts.status);
  return orderId;
}

const tu = addCustomer("Anh Tú", "0912000111");
const hoa = addCustomer("Chị Hoa", "0988333222");

const stale = addOrder({
  customerId: tu,
  status: "da_mua_tq",
  goodsTotalCny: 500,
  exchangeRate: 3600,
  serviceFee: 80_000,
  shippingFee: 150_000,
  deposit: 1_000_000,
  staleDaysAgo: 10, // quá ngưỡng 7 ngày → phải nổi lên "Cần chú ý"
  itemName: "Giày sneaker",
  qty: 5,
  priceCny: 100,
});

const incident = addOrder({
  customerId: hoa,
  status: "su_co",
  goodsTotalCny: 300,
  exchangeRate: 3600,
  serviceFee: 50_000,
  shippingFee: 100_000,
  deposit: 500_000,
  itemName: "Túi xách",
  qty: 3,
  priceCny: 100,
});

console.log(`Đã seed: đơn quá hạn #${stale} (Anh Tú), đơn sự cố #${incident} (Chị Hoa).`);
