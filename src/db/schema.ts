/**
 * Schema CSDL (Drizzle + SQLite) — 6 bảng chính theo spec mục 5,
 * cộng bảng nối Kiện↔Đơn (nhiều-nhiều) và bảng lịch sử trạng thái (timeline).
 *
 * Nguồn chân lý cho enum trạng thái & loại đơn: src/lib/order-status.ts
 * (dùng chung với module luật nghiệp vụ để không lệch nhau).
 */
import { sql } from "drizzle-orm";
import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { ORDER_STATUSES, ORDER_TYPES } from "@/lib/order-status";
import { PHOTO_LABELS } from "@/lib/photos";

export const LINE_STATUSES = ["normal", "supplier_defect", "returned"] as const;
export const PACKAGE_MODES = ["auto", "manual"] as const;
export const INVENTORY_SOURCES = [
  "active", // Nhập chủ động
  "supplier_defect", // Lỗi NCC
  "exchange_return", // Đổi trả
  "bom", // Hàng bom
] as const;

const createdAt = () =>
  integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`);

// 1) Khách hàng
export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  phone: text("phone"),
  address: text("address"),
  note: text("note"),
  warningFlag: integer("warning_flag", { mode: "boolean" })
    .notNull()
    .default(false),
  warningReason: text("warning_reason"),
  createdAt: createdAt(),
});

// 2) Đơn hàng
export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id),
  orderType: text("order_type", { enum: ORDER_TYPES }).notNull(),
  status: text("status", { enum: ORDER_STATUSES })
    .notNull()
    .default("cho_bao_gia"),
  // Khối tiền — CNY & tỷ giá là số thực; các khoản VND là số nguyên đồng.
  exchangeRate: real("exchange_rate").notNull().default(0),
  goodsTotalCny: real("goods_total_cny").notNull().default(0),
  serviceFee: integer("service_fee").notNull().default(0),
  shippingFee: integer("shipping_fee").notNull().default(0),
  deposit: integer("deposit").notNull().default(0),
  amountDue: integer("amount_due").notNull().default(0),
  // Snapshot giá vốn khi bán từ kho (chỉ đơn ban_tu_kho) → tính lãi/lỗ.
  saleCost: integer("sale_cost"),
  note: text("note"),
  createdAt: createdAt(),
  statusChangedAt: integer("status_changed_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// 3) Sản phẩm trong đơn
export const orderItems = sqliteTable("order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productUrl: text("product_url"),
  name: text("name").notNull(),
  attributes: text("attributes"),
  quantity: integer("quantity").notNull().default(1),
  unitPriceCny: real("unit_price_cny").notNull().default(0),
  cnOrderCode: text("cn_order_code"),
  lineStatus: text("line_status", { enum: LINE_STATUSES })
    .notNull()
    .default("normal"),
  createdAt: createdAt(),
});

// 4) Kiện vận chuyển
export const packages = sqliteTable("packages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  trackingCode: text("tracking_code").notNull(),
  weightKg: real("weight_kg"),
  trackingStatus: text("tracking_status"),
  lastCheckedAt: integer("last_checked_at", { mode: "timestamp" }),
  mode: text("mode", { enum: PACKAGE_MODES }).notNull().default("manual"),
  createdAt: createdAt(),
});

// Bảng nối Kiện ↔ Đơn (nhiều-nhiều): 1 đơn nhiều kiện, 1 kiện gộp nhiều đơn.
export const orderPackages = sqliteTable(
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
export const inventory = sqliteTable("inventory", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull().default(0),
  avgCost: integer("avg_cost").notNull().default(0), // giá vốn bình quân (VND)
  source: text("source", { enum: INVENTORY_SOURCES }).notNull(),
  lastImportedAt: integer("last_imported_at", { mode: "timestamp" }),
  createdAt: createdAt(),
});

// 6) Ảnh — DB chỉ lưu đường dẫn, file nằm trong uploads/
export const photos = sqliteTable("photos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
  uploadedAt: integer("uploaded_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// Lịch sử chuyển trạng thái (timeline: ai đổi, lúc nào).
export const orderStatusHistory = sqliteTable("order_status_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  fromStatus: text("from_status", { enum: ORDER_STATUSES }),
  toStatus: text("to_status", { enum: ORDER_STATUSES }).notNull(),
  changedBy: text("changed_by"),
  changedAt: integer("changed_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  note: text("note"),
});
