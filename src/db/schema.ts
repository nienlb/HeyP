/**
 * Schema CSDL (Drizzle + Postgres/Supabase) — 6 bảng chính theo spec mục 5,
 * cộng bảng nối Kiện↔Đơn (nhiều-nhiều) và bảng lịch sử trạng thái (timeline).
 *
 * Nguồn chân lý cho enum trạng thái & loại đơn: src/lib/order-status.ts
 * (dùng chung với module luật nghiệp vụ để không lệch nhau).
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  doublePrecision,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
} from "drizzle-orm/pg-core";
import { ORDER_STATUSES, ORDER_TYPES } from "@/lib/order-status";
import { PHOTO_LABELS } from "@/lib/photos";
import {
  EXPENSE_CATEGORIES,
  LEDGER_KINDS,
  PAYMENT_KINDS,
  PAYMENT_METHODS,
} from "@/lib/expenses";

export const LINE_STATUSES = ["normal", "supplier_defect", "returned"] as const;
export const SHIP_STATUSES = ["unknown", "free", "set"] as const;
export const PACKAGE_MODES = ["auto", "manual"] as const;
export const INVENTORY_SOURCES = [
  "active", // Nhập chủ động
  "supplier_defect", // Lỗi NCC
  "exchange_return", // Đổi trả
  "bom", // Hàng bom
] as const;

/**
 * Thời gian lưu bằng epoch-seconds (bigint), KHÔNG dùng timestamptz: tầng báo
 * cáo tiền đang so sánh epoch số nguyên trong SQL thô, đổi kiểu sẽ phải viết
 * lại toàn bộ chỗ đó. Lớp này giữ giao diện Date cho app code.
 */
const epochSeconds = customType<{ data: Date; driverData: string | number }>({
  dataType() {
    return "bigint";
  },
  fromDriver(value) {
    return new Date(Number(value) * 1000);
  },
  toDriver(value) {
    return Math.floor(value.getTime() / 1000);
  },
});

const NOW_EPOCH = sql`(EXTRACT(EPOCH FROM now())::bigint)`;

const createdAt = () => epochSeconds("created_at").notNull().default(NOW_EPOCH);

// 1) Khách hàng
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  address: text("address"),
  note: text("note"),
  warningFlag: boolean("warning_flag").notNull().default(false),
  warningReason: text("warning_reason"),
  createdAt: createdAt(),
});

// 2) Đơn hàng
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").references(() => customers.id),
  orderType: text("order_type", { enum: ORDER_TYPES }).notNull(),
  // Default ở tầng DB chỉ là lưới an toàn: mọi đường insert đều tự truyền
  // status theo `initialStatus(orderType)`. Để "khach_chot" (bước đầu của
  // order_ho — loại đơn phổ biến nhất) thay vì mã đã về hưu "cho_bao_gia",
  // để đường insert mới nào quên truyền cũng không sinh ra đơn ở mã chết.
  status: text("status", { enum: ORDER_STATUSES })
    .notNull()
    .default("khach_chot"),
  // Khối tiền — CNY & tỷ giá là số thực; các khoản VND là số nguyên đồng.
  exchangeRate: doublePrecision("exchange_rate").notNull().default(0),
  goodsTotalCny: doublePrecision("goods_total_cny").notNull().default(0),
  marginVnd: integer("margin_vnd").notNull().default(0),
  shippingFee: integer("shipping_fee").notNull().default(0),
  deposit: integer("deposit").notNull().default(0),
  amountDue: integer("amount_due").notNull().default(0),
  // Snapshot giá vốn khi bán từ kho (chỉ đơn ban_tu_kho) → tính lãi/lỗ.
  saleCost: integer("sale_cost"),
  note: text("note"),
  createdAt: createdAt(),
  statusChangedAt: epochSeconds("status_changed_at")
    .notNull()
    .default(NOW_EPOCH),
  quotedTotalVnd: integer("quoted_total_vnd").notNull().default(0),
  shipStatus: text("ship_status", { enum: SHIP_STATUSES })
    .notNull()
    .default("unknown"),
});

// 3) Sản phẩm trong đơn
export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productUrl: text("product_url"),
  name: text("name").notNull(),
  attributes: text("attributes"),
  quantity: integer("quantity").notNull().default(1),
  unitPriceCny: doublePrecision("unit_price_cny").notNull().default(0),
  cnOrderCode: text("cn_order_code"),
  lineStatus: text("line_status", { enum: LINE_STATUSES })
    .notNull()
    .default("normal"),
  marginVnd: integer("margin_vnd").notNull().default(0),
  costConfirmed: boolean("cost_confirmed").notNull().default(false),
  createdAt: createdAt(),
});

// 4) Kiện vận chuyển
export const packages = pgTable("packages", {
  id: serial("id").primaryKey(),
  trackingCode: text("tracking_code").notNull(),
  carrier: text("carrier"),
  weightKg: doublePrecision("weight_kg"),
  trackingStatus: text("tracking_status"),
  lastCheckedAt: epochSeconds("last_checked_at"),
  mode: text("mode", { enum: PACKAGE_MODES }).notNull().default("manual"),
  needsManualCheck: boolean("needs_manual_check").notNull().default(false),
  createdAt: createdAt(),
});

// Bảng nối Kiện ↔ Đơn (nhiều-nhiều): 1 đơn nhiều kiện, 1 kiện gộp nhiều đơn.
export const orderPackages = pgTable(
  "order_packages",
  {
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    packageId: integer("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.orderId, t.packageId] })],
);

// 5) Tồn kho
export const inventory = pgTable("inventory", {
  id: serial("id").primaryKey(),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull().default(0),
  avgCost: integer("avg_cost").notNull().default(0), // giá vốn bình quân (VND)
  source: text("source", { enum: INVENTORY_SOURCES }).notNull(),
  lastImportedAt: epochSeconds("last_imported_at"),
  createdAt: createdAt(),
});

// 6) Ảnh — DB chỉ lưu tên file, file nằm trên Supabase Storage
export const photos = pgTable("photos", {
  id: serial("id").primaryKey(),
  filePath: text("file_path").notNull(),
  label: text("label", { enum: PHOTO_LABELS }).notNull(),
  orderId: integer("order_id").references(() => orders.id, {
    onDelete: "cascade",
  }),
  orderItemId: integer("order_item_id").references(() => orderItems.id, {
    onDelete: "cascade",
  }),
  inventoryId: integer("inventory_id").references(() => inventory.id, {
    onDelete: "cascade",
  }),
  uploadedAt: epochSeconds("uploaded_at").notNull().default(NOW_EPOCH),
});

// Lịch sử chuyển trạng thái (timeline: ai đổi, lúc nào).
export const orderStatusHistory = pgTable("order_status_history", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  fromStatus: text("from_status", { enum: ORDER_STATUSES }),
  toStatus: text("to_status", { enum: ORDER_STATUSES }).notNull(),
  changedBy: text("changed_by"),
  changedAt: epochSeconds("changed_at").notNull().default(NOW_EPOCH),
  note: text("note"),
});

// 7) Tham số nghiệp vụ đổi được lúc chạy (tỷ giá bán, lời mặc định).
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// 8) Sổ ví ¥ — số dư và giá vốn bq KHÔNG lưu, tính lại từ sổ.
export const cnyLedger = pgTable("cny_ledger", {
  id: serial("id").primaryKey(),
  kind: text("kind", { enum: LEDGER_KINDS }).notNull(),
  cnyDelta: doublePrecision("cny_delta").notNull(),
  vndPaid: integer("vnd_paid"),
  rateSnapshot: integer("rate_snapshot"),
  orderId: integer("order_id").references(() => orders.id),
  note: text("note"),
  createdAt: createdAt(),
});

// 9) Chi phí VND. order_id NULL = chi phí theo kỳ.
export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  spentAt: epochSeconds("spent_at").notNull().default(NOW_EPOCH),
  category: text("category", { enum: EXPENSE_CATEGORIES }).notNull(),
  amountVnd: integer("amount_vnd").notNull(),
  orderId: integer("order_id").references(() => orders.id),
  method: text("method", { enum: PAYMENT_METHODS })
    .notNull()
    .default("chuyen_khoan"),
  note: text("note"),
});

// 10) Sổ thu tiền — orders.deposit là Σ của bảng này.
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  amountVnd: integer("amount_vnd").notNull(),
  paidAt: epochSeconds("paid_at").notNull().default(NOW_EPOCH),
  kind: text("kind", { enum: PAYMENT_KINDS }).notNull(),
  method: text("method", { enum: PAYMENT_METHODS })
    .notNull()
    .default("chuyen_khoan"),
  note: text("note"),
});
