import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "./index";
import { NOW_EPOCH_SQL, raw, withTx, type Exec } from "./raw";
import {
  customers,
  expenses,
  inventory,
  orderItems,
  orderPackages,
  orderStatusHistory,
  orders,
  packages,
  payments,
  photos,
  settings,
} from "./schema";
import type { PhotoLabel } from "@/lib/photos";
import {
  SETTING_KEYS,
  parseSettings,
  type AppSettings,
} from "@/lib/settings";
import { allocateMargins, redistribute } from "@/lib/line-pricing";
import {
  orderGaps,
  type GapCode,
  type ShipStatus,
} from "@/lib/order-gaps";
import type {
  ExpenseCategory,
  LedgerKind,
  PaymentKind,
  PaymentMethod,
} from "@/lib/expenses";
import { currentRate, replayLedger, walletValueVnd } from "@/lib/cny-wallet";
import type { PnlExpense, PnlOrder } from "@/lib/pnl";
import { getAdapter } from "@/lib/tracking";
import { computeOrderMoney, sumLineItemsCny } from "@/lib/money";
import {
  BRANCH_STATUSES,
  MAIN_CHAIN,
  isTerminal,
  transition,
  type OrderStatus,
  type OrderType,
} from "@/lib/order-status";
import {
  applyStockIn,
  applyStockOut,
  bomCostBasis,
  unitGoodsCostVnd,
  type InventorySource,
} from "@/lib/inventory";
import { config } from "@/lib/config";
import { ageInDays } from "@/lib/format";

// ---------- Tham số nghiệp vụ (bảng settings) ----------

export async function getSettings(): Promise<AppSettings> {
  const rows = await raw.all<{ key: string; value: string }>(
    "SELECT key, value FROM settings",
  );
  return parseSettings(rows);
}

export async function saveSettings(next: AppSettings): Promise<void> {
  const Q = `INSERT INTO settings(key, value) VALUES(?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`;
  // Vẫn dựng chuỗi trong JS để giá trị lưu đúng dạng "4000" chứ không "4000.0".
  await raw.run(Q, [SETTING_KEYS.sellRate, String(next.sellRate)]);
  await raw.run(Q, [
    SETTING_KEYS.defaultMarginVnd,
    String(next.defaultMarginVnd),
  ]);
}

/**
 * Gợi ý giá ¥ cho món đã từng order: lấy lần gần nhất ĐÃ xác nhận giá vốn.
 * Khớp tên chính xác sau khi chuẩn hoá (bỏ khoảng trắng thừa, không phân biệt
 * hoa thường). KHÔNG đoán theo tên gần giống — gợi ý sai âm thầm còn tệ hơn
 * không gợi ý.
 */
export async function suggestCnyFromHistory(
  productName: string,
): Promise<number | null> {
  const key = productName.trim().replace(/\s+/g, " ").toLowerCase();
  if (key === "") return null;
  const row = await raw.get<{ cny: number }>(
    `SELECT unit_price_cny AS cny
       FROM order_items
      WHERE cost_confirmed = true
        AND unit_price_cny > 0
        AND LOWER(TRIM(name)) = ?
      ORDER BY id DESC
      LIMIT 1`,
    [key],
  );
  return row ? row.cny : null;
}

// ---------- Khách hàng ----------

export async function listCustomers() {
  return db.select().from(customers).orderBy(customers.name);
}

export async function getCustomer(id: number) {
  const rows = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);
  return rows[0];
}

// ---------- Tạo đơn (có transaction) ----------

export type NewOrderItemInput = {
  name: string;
  productUrl?: string | null;
  attributes?: string | null;
  quantity: number;
  unitPriceCny: number;
  /** Lời của món. Bỏ trống → app tự rải theo mức mặc định để khớp Total. */
  marginVnd?: number;
  /** Giá ¥ do người dùng xác nhận, hay chỉ là số máy gợi ý? */
  costConfirmed?: boolean;
};

export type NewOrderInput = {
  /** Cho phép null: đơn tạo từ ảnh có thể chưa có thông tin khách. */
  customerId?: number | null;
  newCustomer?: { name: string; phone?: string; address?: string } | null;
  orderType: OrderType;
  exchangeRate: number;
  /** Total đã chốt với khách (KHÔNG gồm ship) — dữ kiện, không phải kết quả. */
  quotedTotalVnd: number;
  shippingFee: number;
  shipStatus: ShipStatus;
  deposit: number;
  note?: string | null;
  items: NewOrderItemInput[];
  changedBy?: string | null;
};

export function createOrder(input: NewOrderInput): number {
  const goodsTotalCny = sumLineItemsCny(input.items);
  const pricingLines = input.items.map((it) => ({
    quantity: it.quantity,
    unitPriceCny: it.unitPriceCny,
    marginVnd: it.marginVnd ?? 0,
  }));
  // Lời chưa được rải (tạo đơn từ ảnh) → rải theo mức mặc định, khớp Total.
  const hasMargins = input.items.some((it) => it.marginVnd !== undefined);
  const margins = hasMargins
    ? pricingLines.map((l) => Math.round(l.marginVnd))
    : allocateMargins(
        input.quotedTotalVnd,
        pricingLines,
        input.exchangeRate,
        getSettings().defaultMarginVnd,
      );
  const marginTotal = margins.reduce((s, m) => s + m, 0);

  const money = computeOrderMoney({
    goodsTotalCny,
    exchangeRate: input.exchangeRate,
    serviceFee: marginTotal,
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
    // Đơn ĐƯỢC PHÉP chưa có khách (tiền cọc đã về thật, thông tin tới sau).
    // Cờ `thieu_khach` của order-gaps lo phần nhắc bổ sung.

    const info = sqlite
      .prepare(
        `INSERT INTO orders
           (customer_id, order_type, status, exchange_rate, goods_total_cny,
            margin_vnd, shipping_fee, deposit, amount_due, note,
            quoted_total_vnd, ship_status)
         VALUES (?, ?, 'cho_bao_gia', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        customerId,
        input.orderType,
        input.exchangeRate,
        goodsTotalCny,
        marginTotal,
        input.shippingFee,
        input.deposit,
        money.amountDue,
        input.note ?? null,
        Math.round(input.quotedTotalVnd),
        input.shipStatus,
      );
    const orderId = Number(info.lastInsertRowid);

    const itemStmt = sqlite.prepare(
      `INSERT INTO order_items
         (order_id, product_url, name, attributes, quantity, unit_price_cny,
          margin_vnd, cost_confirmed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    input.items.forEach((it, i) => {
      itemStmt.run(
        orderId,
        it.productUrl ?? null,
        it.name,
        it.attributes ?? null,
        it.quantity,
        it.unitPriceCny,
        margins[i],
        it.costConfirmed ? 1 : 0,
      );
    });

    sqlite
      .prepare(
        `INSERT INTO order_status_history
           (order_id, from_status, to_status, changed_by, note)
         VALUES (?, NULL, 'cho_bao_gia', ?, 'Tạo đơn')`,
      )
      .run(orderId, input.changedBy ?? null);

    // Cọc đọc từ ảnh Zalo → một dòng thu tiền, không ghi thẳng vào
    // orders.deposit nữa (deposit là số dẫn xuất — spec v3-B mục 3).
    if (input.deposit > 0) {
      sqlite
        .prepare(
          `INSERT INTO payments (order_id, amount_vnd, paid_at, kind, method, note)
           VALUES (?, ?, unixepoch(), 'coc', 'chuyen_khoan', NULL)`,
        )
        .run(orderId, Math.round(input.deposit));
    }

    sqlite.exec("COMMIT");
    return orderId;
  } catch (err) {
    sqlite.exec("ROLLBACK");
    throw err;
  }
}

// ---------- Chi tiết đơn ----------

export async function getOrderDetail(id: number) {
  const orderRows = await db
    .select()
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);
  const order = orderRows[0];
  if (!order) return null;
  const customerRows = order.customerId
    ? await db
        .select()
        .from(customers)
        .where(eq(customers.id, order.customerId))
        .limit(1)
    : [];
  const customer = customerRows[0] ?? null;
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
  const orderPhotos = await listPhotosForOrder(id);
  const orderPayments = await listPaymentsForOrder(id);
  return {
    order,
    customer,
    items,
    history,
    photos: orderPhotos,
    payments: orderPayments,
  };
}

// ---------- Ảnh ----------

export type PhotoRow = {
  id: number;
  filePath: string;
  label: PhotoLabel;
  orderId: number | null;
  inventoryId: number | null;
  uploadedAt: Date;
};

export async function addPhoto(input: {
  filePath: string;
  label: PhotoLabel;
  orderId?: number | null;
  inventoryId?: number | null;
}): Promise<number> {
  const row = await raw.get<{ id: number }>(
    `INSERT INTO photos(file_path, label, order_id, inventory_id)
     VALUES(?, ?, ?, ?) RETURNING id`,
    [
      input.filePath,
      input.label,
      input.orderId ?? null,
      input.inventoryId ?? null,
    ],
  );
  return row!.id;
}

/** Gắn ảnh (đang chưa thuộc đơn nào) vào một đơn — dùng cho ảnh chốt đơn Zalo. */
export async function linkPhotoToOrder(
  photoId: number,
  orderId: number,
): Promise<void> {
  await raw.run(
    "UPDATE photos SET order_id = ? WHERE id = ? AND order_id IS NULL",
    [orderId, photoId],
  );
}

export async function getPhoto(
  id: number,
): Promise<{ id: number; file_path: string } | undefined> {
  return raw.get<{ id: number; file_path: string }>(
    "SELECT id, file_path FROM photos WHERE id = ?",
    [id],
  );
}

/**
 * Xoá một ảnh CHƯA GẮN ĐƠN (order_id IS NULL) — dùng khi thả nhầm ảnh ở màn
 * tạo đơn từ Zalo, trước khi bấm Lưu đơn. Chặn xoá ảnh đã thuộc đơn thật để
 * không lỡ tay mất bằng chứng chốt đơn của đơn khác.
 *
 * Chỉ xoá bản ghi DB, theo đúng khuôn của addPhoto (không đụng file vật lý)
 * — nơi gọi có quyền I/O (route/action) tự xoá file bằng filePath trả về.
 */
export async function deletePhoto(
  id: number,
): Promise<{ filePath: string } | null> {
  const photo = await raw.get<{ file_path: string }>(
    "SELECT file_path FROM photos WHERE id = ? AND order_id IS NULL",
    [id],
  );
  if (!photo) return null;
  await raw.run("DELETE FROM photos WHERE id = ?", [id]);
  return { filePath: photo.file_path };
}

export async function listPhotosForOrder(orderId: number) {
  return db
    .select()
    .from(photos)
    .where(eq(photos.orderId, orderId))
    .orderBy(photos.id);
}

export async function listPhotosForInventory(inventoryId: number) {
  return db
    .select()
    .from(photos)
    .where(eq(photos.inventoryId, inventoryId))
    .orderBy(photos.id);
}

// ---------- Tracking / Kiện vận chuyển ----------

export type PackageRow = {
  id: number;
  trackingCode: string;
  carrier: string | null;
  weightKg: number | null;
  trackingStatus: string | null;
  lastCheckedAt: number | null;
  mode: "auto" | "manual";
  needsManualCheck: boolean;
  orderIds: number[];
};

export function listPackages(): PackageRow[] {
  const rows = sqlite
    .prepare(
      `SELECT p.id, p.tracking_code, p.carrier, p.weight_kg, p.tracking_status,
              p.last_checked_at, p.mode, p.needs_manual_check,
              GROUP_CONCAT(op.order_id) AS order_ids
         FROM packages p
         LEFT JOIN order_packages op ON op.package_id = p.id
        GROUP BY p.id
        ORDER BY p.needs_manual_check DESC, p.created_at DESC`,
    )
    .all() as {
    id: number;
    tracking_code: string;
    carrier: string | null;
    weight_kg: number | null;
    tracking_status: string | null;
    last_checked_at: number | null;
    mode: "auto" | "manual";
    needs_manual_check: number;
    order_ids: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    trackingCode: r.tracking_code,
    carrier: r.carrier,
    weightKg: r.weight_kg,
    trackingStatus: r.tracking_status,
    lastCheckedAt: r.last_checked_at,
    mode: r.mode,
    needsManualCheck: r.needs_manual_check === 1,
    orderIds: r.order_ids
      ? r.order_ids.split(",").map((s) => Number(s))
      : [],
  }));
}

export function getPackagesForOrder(orderId: number): PackageRow[] {
  return listPackages().filter((p) => p.orderIds.includes(orderId));
}

export type CreatePackageInput = {
  trackingCode: string;
  carrier?: string | null;
  weightKg?: number | null;
  mode: "auto" | "manual";
  orderIds: number[];
};

export type PackageResult =
  | { ok: true; id: number }
  | { ok: false; reason: string };

export function createPackage(input: CreatePackageInput): PackageResult {
  const code = input.trackingCode.trim();
  if (!code) return { ok: false, reason: "Thiếu mã vận đơn" };

  sqlite.exec("BEGIN");
  try {
    const id = Number(
      sqlite
        .prepare(
          `INSERT INTO packages(tracking_code, carrier, weight_kg, mode)
           VALUES (?, ?, ?, ?)`,
        )
        .run(code, input.carrier ?? null, input.weightKg ?? null, input.mode)
        .lastInsertRowid,
    );
    const linkStmt = sqlite.prepare(
      "INSERT OR IGNORE INTO order_packages(order_id, package_id) VALUES (?, ?)",
    );
    for (const orderId of input.orderIds) {
      const exists = sqlite
        .prepare("SELECT 1 FROM orders WHERE id = ?")
        .get(orderId);
      if (exists) linkStmt.run(orderId, id);
    }
    sqlite.exec("COMMIT");
    return { ok: true, id };
  } catch (err) {
    sqlite.exec("ROLLBACK");
    throw err;
  }
}

/** Cập nhật trạng thái kiện bằng tay (xoá cờ tra tay). */
export function updatePackageStatusManual(id: number, status: string): void {
  sqlite
    .prepare(
      `UPDATE packages
          SET tracking_status = ?, last_checked_at = unixepoch(),
              needs_manual_check = 0
        WHERE id = ?`,
    )
    .run(status.trim(), id);
}

export type SweepResult = { checked: number; updated: number; flagged: number };

/**
 * Job tra tự động: quét các kiện mode "auto", gọi adapter theo carrier.
 * Không có adapter / tra lỗi → gắn cờ "tra tay". Chạy được cả từ job nền lẫn nút bấm.
 */
export async function runTrackingSweep(): Promise<SweepResult> {
  const pkgs = sqlite
    .prepare(
      "SELECT id, tracking_code, carrier FROM packages WHERE mode = 'auto'",
    )
    .all() as { id: number; tracking_code: string; carrier: string | null }[];

  const flag = sqlite.prepare(
    "UPDATE packages SET needs_manual_check = 1, last_checked_at = unixepoch() WHERE id = ?",
  );
  const save = sqlite.prepare(
    "UPDATE packages SET tracking_status = ?, last_checked_at = unixepoch(), needs_manual_check = 0 WHERE id = ?",
  );

  let checked = 0;
  let updated = 0;
  let flagged = 0;
  for (const p of pkgs) {
    checked++;
    const adapter = getAdapter(p.carrier);
    if (!adapter) {
      flag.run(p.id);
      flagged++;
      continue;
    }
    try {
      const r = await adapter.lookup(p.tracking_code);
      if (r.ok) {
        save.run(r.status, p.id);
        updated++;
      } else {
        flag.run(p.id);
        flagged++;
      }
    } catch {
      flag.run(p.id);
      flagged++;
    }
  }
  return { checked, updated, flagged };
}

// ---------- Helper tồn kho (raw, KHÔNG tự mở transaction) ----------

type OrderItemRow = {
  id: number;
  name: string;
  quantity: number;
  unit_price_cny: number;
  line_status: string;
};

/** Cộng hàng vào kho, gộp theo (tên, nguồn) với giá vốn bình quân. */
function _addStock(
  name: string,
  source: InventorySource,
  qty: number,
  unitCost: number,
): void {
  const row = sqlite
    .prepare(
      "SELECT id, quantity, avg_cost FROM inventory WHERE product_name = ? AND source = ?",
    )
    .get(name, source) as
    | { id: number; quantity: number; avg_cost: number }
    | undefined;
  if (row) {
    const after = applyStockIn(
      { quantity: row.quantity, avgCost: row.avg_cost },
      qty,
      unitCost,
    );
    sqlite
      .prepare(
        "UPDATE inventory SET quantity = ?, avg_cost = ?, last_imported_at = unixepoch() WHERE id = ?",
      )
      .run(after.quantity, after.avgCost, row.id);
  } else {
    sqlite
      .prepare(
        `INSERT INTO inventory(product_name, quantity, avg_cost, source, last_imported_at)
         VALUES (?, ?, ?, ?, unixepoch())`,
      )
      .run(name, qty, unitCost, source);
  }
}

/** Tính lại tiền đơn từ các dòng còn "normal" (loại bỏ dòng lỗi/đã trả). */
function _recomputeOrderMoney(orderId: number): void {
  const order = sqlite
    .prepare(
      "SELECT exchange_rate, margin_vnd, shipping_fee, deposit FROM orders WHERE id = ?",
    )
    .get(orderId) as {
    exchange_rate: number;
    margin_vnd: number;
    shipping_fee: number;
    deposit: number;
  };
  const rows = sqlite
    .prepare(
      "SELECT quantity, unit_price_cny FROM order_items WHERE order_id = ? AND line_status = 'normal'",
    )
    .all(orderId) as { quantity: number; unit_price_cny: number }[];
  const goodsTotalCny = rows.reduce(
    (s, r) => s + r.quantity * r.unit_price_cny,
    0,
  );
  const money = computeOrderMoney({
    goodsTotalCny,
    exchangeRate: order.exchange_rate,
    serviceFee: order.margin_vnd,
    shippingFee: order.shipping_fee,
    deposit: order.deposit,
  });
  sqlite
    .prepare("UPDATE orders SET goods_total_cny = ?, amount_due = ? WHERE id = ?")
    .run(goodsTotalCny, money.amountDue, orderId);
}

// ---------- Ví ¥ (v3-B) ----------

export function listLedger() {
  return sqlite
    .prepare(
      `SELECT id, kind, cny_delta AS cnyDelta, vnd_paid AS vndPaid,
              rate_snapshot AS rateSnapshot, order_id AS orderId, note,
              created_at AS createdAt
         FROM cny_ledger ORDER BY created_at, id`,
    )
    .all() as {
    id: number;
    kind: LedgerKind;
    cnyDelta: number;
    vndPaid: number | null;
    rateSnapshot: number | null;
    orderId: number | null;
    note: string | null;
    createdAt: number;
  }[];
}

export function getWallet() {
  const state = replayLedger(listLedger());
  return { ...state, valueVnd: walletValueVnd(state) };
}

export function addTopup(input: {
  cny: number;
  vndPaid: number;
  note?: string | null;
}): LineActionResult {
  if (!(input.cny > 0)) return { ok: false, reason: "Số tệ phải lớn hơn 0" };
  if (!(input.vndPaid > 0))
    return { ok: false, reason: "Số tiền trả phải lớn hơn 0" };

  sqlite
    .prepare(
      `INSERT INTO cny_ledger (kind, cny_delta, vnd_paid, note)
       VALUES ('nap', ?, ?, ?)`,
    )
    .run(input.cny, Math.round(input.vndPaid), input.note ?? null);
  return { ok: true };
}

/**
 * Chỉ cho xoá dòng 'nap' — dòng 'chi' sinh tự động từ trạng thái đơn.
 * Sửa = xoá rồi nạp lại: số dư chạy lại từ sổ nên kết quả giống hệt.
 */
export function deleteLedgerEntry(id: number): LineActionResult {
  const row = sqlite
    .prepare("SELECT kind FROM cny_ledger WHERE id = ?")
    .get(id) as { kind: LedgerKind } | undefined;
  if (!row) return { ok: false, reason: "Không tìm thấy dòng sổ" };
  if (row.kind !== "nap")
    return {
      ok: false,
      reason:
        "Chỉ xoá được đợt nạp. Dòng mua hàng sửa bằng cách ghi điều chỉnh.",
    };
  sqlite.prepare("DELETE FROM cny_ledger WHERE id = ?").run(id);
  return { ok: true };
}

// ---------- Sổ chi phí (v3-B) ----------

export async function listExpenses(limit = 100) {
  return db
    .select()
    .from(expenses)
    .orderBy(desc(expenses.spentAt))
    .limit(limit);
}

export type AddExpenseInput = {
  spentAt: Date;
  category: ExpenseCategory;
  amountVnd: number;
  orderId?: number | null;
  method: PaymentMethod;
  note?: string | null;
};

export function addExpense(input: AddExpenseInput): LineActionResult {
  if (!(input.amountVnd > 0))
    return { ok: false, reason: "Số tiền phải lớn hơn 0" };
  if (input.orderId != null) {
    const exists = sqlite
      .prepare("SELECT 1 AS x FROM orders WHERE id = ?")
      .get(input.orderId);
    if (!exists) return { ok: false, reason: "Đơn không tồn tại" };
  }
  sqlite
    .prepare(
      `INSERT INTO expenses (spent_at, category, amount_vnd, order_id, method, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      Math.floor(input.spentAt.getTime() / 1000),
      input.category,
      Math.round(input.amountVnd),
      input.orderId ?? null,
      input.method,
      input.note ?? null,
    );
  return { ok: true };
}

export function deleteExpense(id: number): LineActionResult {
  sqlite.prepare("DELETE FROM expenses WHERE id = ?").run(id);
  return { ok: true };
}

// ---------- Đổi trạng thái (kèm side-effect tồn kho) ----------

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
    .prepare(
      `SELECT order_type, status, exchange_rate, goods_total_cny,
              shipping_fee, deposit, customer_id
         FROM orders WHERE id = ?`,
    )
    .get(id) as
    | {
        order_type: OrderType;
        status: OrderStatus;
        exchange_rate: number;
        goods_total_cny: number;
        shipping_fee: number;
        deposit: number;
        customer_id: number;
      }
    | undefined;
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

    const normalItems = sqlite
      .prepare(
        "SELECT id, name, quantity, unit_price_cny, line_status FROM order_items WHERE order_id = ? AND line_status = 'normal'",
      )
      .all(id) as OrderItemRow[];

    // Đơn Nhập kho về tới kho VN → cộng tồn (nguồn Nhập chủ động).
    if (to === "ve_kho_vn" && order.order_type === "nhap_kho") {
      for (const it of normalItems) {
        _addStock(
          it.name,
          "active",
          it.quantity,
          unitGoodsCostVnd(it.unit_price_cny, order.exchange_rate),
        );
      }
    }

    // Khách bom → toàn bộ hàng vào kho (nguồn Hàng bom) + gắn cờ khách.
    if (to === "khach_bom") {
      const goodsVnd = Math.round(order.goods_total_cny * order.exchange_rate);
      const basis = bomCostBasis(goodsVnd, order.shipping_fee, order.deposit);
      const totalQty = normalItems.reduce((s, it) => s + it.quantity, 0);
      const perUnit = totalQty > 0 ? Math.round(basis / totalQty) : basis;
      for (const it of normalItems) {
        _addStock(it.name, "bom", it.quantity, perUnit);
      }
      sqlite
        .prepare(
          `UPDATE customers
             SET warning_flag = 1,
                 warning_reason = COALESCE(warning_reason, ?)
           WHERE id = ?`,
        )
        .run(`Từng bom hàng (đơn #${id})`, order.customer_id);
    }

    // Đã mua hàng TQ → trừ ví ¥ và CHỐT CỨNG giá vốn tại thời điểm này.
    // Nạp ¥ đợt sau rẻ hơn không được làm đổi lãi/lỗ của đơn đã mua rồi.
    // goods_total_cny = 0 (chưa nhập giá ¥) → không ghi dòng chi vô nghĩa.
    if (to === "da_mua_tq" && order.goods_total_cny > 0) {
      const rate = Math.round(currentRate(listLedger()));
      sqlite
        .prepare(
          `INSERT INTO cny_ledger (kind, cny_delta, rate_snapshot, order_id, note)
           VALUES ('chi', ?, ?, ?, ?)`,
        )
        .run(-order.goods_total_cny, rate, id, `Mua hàng đơn #${id}`);
    }

    sqlite.exec("COMMIT");
    return { ok: true };
  } catch (err) {
    sqlite.exec("ROLLBACK");
    throw err;
  }
}

// ---------- Bóc lớp giá theo dòng (v3-A) ----------

type OrderMoneyRow = {
  exchange_rate: number;
  shipping_fee: number;
  deposit: number;
};

function readOrderMoneyRow(orderId: number): OrderMoneyRow {
  const row = sqlite
    .prepare(
      "SELECT exchange_rate, shipping_fee, deposit FROM orders WHERE id = ?",
    )
    .get(orderId) as OrderMoneyRow | undefined;
  if (!row) throw new Error("Không tìm thấy đơn");
  return row;
}

/**
 * Đồng bộ khối tiền cấp đơn từ các dòng. Gọi BÊN TRONG transaction đang mở.
 * goods_total_cny và margin_vnd ở cấp đơn là số DẪN XUẤT từ order_items.
 */
export function recomputeOrderMoneyRow(
  orderId: number,
  order: OrderMoneyRow,
): void {
  const agg = sqlite
    .prepare(
      `SELECT COALESCE(SUM(quantity * unit_price_cny), 0) AS cny,
              COALESCE(SUM(margin_vnd), 0) AS margin
         FROM order_items WHERE order_id = ?`,
    )
    .get(orderId) as { cny: number; margin: number };

  const money = computeOrderMoney({
    goodsTotalCny: agg.cny,
    exchangeRate: order.exchange_rate,
    serviceFee: agg.margin,
    shippingFee: order.shipping_fee,
    deposit: order.deposit,
  });

  sqlite
    .prepare(
      "UPDATE orders SET goods_total_cny = ?, margin_vnd = ?, amount_due = ? WHERE id = ?",
    )
    .run(agg.cny, agg.margin, money.amountDue, orderId);
}

/**
 * Nhập hoặc sửa giá ¥ của một dòng. Total giữ nguyên (khách đã đồng ý), lời
 * được rải lại cho toàn bộ dòng. Chạm vào ô này = xác nhận giá vốn.
 */
export function updateLineCost(
  orderId: number,
  itemId: number,
  unitPriceCny: number,
): LineActionResult {
  if (!(unitPriceCny >= 0))
    return { ok: false, reason: "Giá tệ không được âm" };

  sqlite.exec("BEGIN");
  try {
    const order = readOrderMoneyRow(orderId);
    const quoted = sqlite
      .prepare("SELECT quoted_total_vnd AS total FROM orders WHERE id = ?")
      .get(orderId) as { total: number };

    sqlite
      .prepare(
        "UPDATE order_items SET unit_price_cny = ?, cost_confirmed = 1 WHERE id = ? AND order_id = ?",
      )
      .run(unitPriceCny, itemId, orderId);

    // Giá vốn đổi → lời phải rải lại để Σ giá bán vẫn đúng bằng Total.
    const rows = sqlite
      .prepare(
        "SELECT id, quantity, unit_price_cny, margin_vnd FROM order_items WHERE order_id = ? ORDER BY id",
      )
      .all(orderId) as {
      id: number;
      quantity: number;
      unit_price_cny: number;
      margin_vnd: number;
    }[];
    const margins = allocateMargins(
      quoted.total,
      rows.map((r) => ({
        quantity: r.quantity,
        unitPriceCny: r.unit_price_cny,
        marginVnd: r.margin_vnd,
      })),
      order.exchange_rate,
      getSettings().defaultMarginVnd,
    );
    const stmt = sqlite.prepare(
      "UPDATE order_items SET margin_vnd = ? WHERE id = ?",
    );
    rows.forEach((r, i) => stmt.run(margins[i], r.id));

    // Đơn đã mua hàng rồi mà giá ¥ mới sửa → ghi dòng điều chỉnh bằng phần
    // chênh vào ví. Sổ ví là append-only: không bao giờ sửa quá khứ.
    const spent = sqlite
      .prepare(
        `SELECT COALESCE(SUM(-cny_delta), 0) AS cny
           FROM cny_ledger WHERE order_id = ? AND kind IN ('chi','dieu_chinh')`,
      )
      .get(orderId) as { cny: number };

    if (spent.cny > 0) {
      const agg = sqlite
        .prepare(
          "SELECT COALESCE(SUM(quantity * unit_price_cny), 0) AS cny FROM order_items WHERE order_id = ?",
        )
        .get(orderId) as { cny: number };
      const diff = agg.cny - spent.cny;
      if (Math.abs(diff) > 0.0001) {
        const rate = Math.round(currentRate(listLedger()));
        sqlite
          .prepare(
            `INSERT INTO cny_ledger (kind, cny_delta, rate_snapshot, order_id, note)
             VALUES ('dieu_chinh', ?, ?, ?, ?)`,
          )
          .run(-diff, rate, orderId, `Sửa giá ¥ đơn #${orderId}`);
      }
    }

    recomputeOrderMoneyRow(orderId, order);
    sqlite.exec("COMMIT");
    return { ok: true };
  } catch (err) {
    sqlite.exec("ROLLBACK");
    return { ok: false, reason: (err as Error).message };
  }
}

/** Kéo lời của một dòng; các dòng khác bù lại để Total giữ nguyên. */
export function updateLineMargin(
  orderId: number,
  itemId: number,
  marginVnd: number,
): LineActionResult {
  sqlite.exec("BEGIN");
  try {
    const order = readOrderMoneyRow(orderId);
    const quoted = sqlite
      .prepare("SELECT quoted_total_vnd AS total FROM orders WHERE id = ?")
      .get(orderId) as { total: number };

    const rows = sqlite
      .prepare(
        "SELECT id, quantity, unit_price_cny FROM order_items WHERE order_id = ? ORDER BY id",
      )
      .all(orderId) as {
      id: number;
      quantity: number;
      unit_price_cny: number;
    }[];
    const idx = rows.findIndex((r) => r.id === itemId);
    if (idx === -1) throw new Error("Không tìm thấy dòng sản phẩm");

    const margins = redistribute(
      rows.map((r) => ({
        quantity: r.quantity,
        unitPriceCny: r.unit_price_cny,
        marginVnd: 0,
      })),
      idx,
      marginVnd,
      quoted.total,
      order.exchange_rate,
    );

    const stmt = sqlite.prepare(
      "UPDATE order_items SET margin_vnd = ? WHERE id = ?",
    );
    rows.forEach((r, i) => stmt.run(margins[i], r.id));

    recomputeOrderMoneyRow(orderId, order);
    sqlite.exec("COMMIT");
    return { ok: true };
  } catch (err) {
    sqlite.exec("ROLLBACK");
    return { ok: false, reason: (err as Error).message };
  }
}

/** Nhập phí ship khi hàng về VN (hoặc đánh dấu freeship). */
export function setShipFee(
  orderId: number,
  shipStatus: ShipStatus,
  shippingFee: number,
): LineActionResult {
  if (!(shippingFee >= 0))
    return { ok: false, reason: "Phí ship không được âm" };
  const fee = shipStatus === "set" ? Math.round(shippingFee) : 0;

  sqlite.exec("BEGIN");
  try {
    const order = readOrderMoneyRow(orderId);
    sqlite
      .prepare(
        "UPDATE orders SET ship_status = ?, shipping_fee = ? WHERE id = ?",
      )
      .run(shipStatus, fee, orderId);

    recomputeOrderMoneyRow(orderId, { ...order, shipping_fee: fee });
    sqlite.exec("COMMIT");
    return { ok: true };
  } catch (err) {
    sqlite.exec("ROLLBACK");
    return { ok: false, reason: (err as Error).message };
  }
}

/** Đổi nhãn ảnh (người dùng sửa lại khi AI phân loại sai). */
export async function updatePhotoLabel(
  photoId: number,
  label: PhotoLabel,
): Promise<void> {
  await raw.run("UPDATE photos SET label = ? WHERE id = ?", [label, photoId]);
}

// ---------- Sổ thu tiền (v3-B) ----------

export async function listPaymentsForOrder(orderId: number) {
  return db
    .select()
    .from(payments)
    .where(eq(payments.orderId, orderId))
    .orderBy(payments.paidAt, payments.id);
}

/** Số tiền đề xuất cho khoản "thu nốt": đúng bằng phần còn phải thu. */
export function suggestFinalPayment(orderId: number): number {
  const row = sqlite
    .prepare(
      `SELECT o.quoted_total_vnd AS total, o.shipping_fee AS ship,
              COALESCE((SELECT SUM(p.amount_vnd) FROM payments p
                         WHERE p.order_id = o.id), 0) AS paid
         FROM orders o WHERE o.id = ?`,
    )
    .get(orderId) as
    | { total: number; ship: number; paid: number }
    | undefined;
  if (!row) return 0;
  return row.total + row.ship - row.paid;
}

export type AddPaymentInput = {
  orderId: number;
  amountVnd: number;
  paidAt: Date;
  kind: PaymentKind;
  method: PaymentMethod;
  note?: string | null;
};

export function addPayment(input: AddPaymentInput): LineActionResult {
  // Hoàn trả lưu số ÂM; các khoản thu phải dương.
  const amount =
    input.kind === "hoan_tra"
      ? -Math.abs(Math.round(input.amountVnd))
      : Math.round(input.amountVnd);
  if (amount === 0) return { ok: false, reason: "Số tiền phải khác 0" };

  sqlite.exec("BEGIN");
  try {
    sqlite
      .prepare(
        `INSERT INTO payments (order_id, amount_vnd, paid_at, kind, method, note)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.orderId,
        amount,
        Math.floor(input.paidAt.getTime() / 1000),
        input.kind,
        input.method,
        input.note ?? null,
      );
    syncOrderDeposit(input.orderId);
    sqlite.exec("COMMIT");
    return { ok: true };
  } catch (err) {
    sqlite.exec("ROLLBACK");
    return { ok: false, reason: (err as Error).message };
  }
}

export function deletePayment(id: number, orderId: number): LineActionResult {
  sqlite.exec("BEGIN");
  try {
    sqlite
      .prepare("DELETE FROM payments WHERE id = ? AND order_id = ?")
      .run(id, orderId);
    syncOrderDeposit(orderId);
    sqlite.exec("COMMIT");
    return { ok: true };
  } catch (err) {
    sqlite.exec("ROLLBACK");
    return { ok: false, reason: (err as Error).message };
  }
}

/**
 * Đồng bộ orders.deposit từ sổ thu tiền rồi tính lại khối tiền của đơn.
 * Gọi BÊN TRONG transaction đang mở.
 */
function syncOrderDeposit(orderId: number): void {
  const row = sqlite
    .prepare(
      `SELECT COALESCE(SUM(amount_vnd), 0) AS paid FROM payments WHERE order_id = ?`,
    )
    .get(orderId) as { paid: number };

  sqlite
    .prepare("UPDATE orders SET deposit = ? WHERE id = ?")
    .run(row.paid, orderId);

  const order = readOrderMoneyRow(orderId);
  recomputeOrderMoneyRow(orderId, order);
}

// ---------- Ba luồng ngoại lệ theo dòng sản phẩm ----------

export type LineActionResult = { ok: true } | { ok: false; reason: string };

/** Đánh dấu 1 dòng "lỗi NCC": tách khỏi đơn, nhập kho nhãn Lỗi NCC. */
export function markLineDefect(
  orderId: number,
  itemId: number,
): LineActionResult {
  return _returnLineToStock(orderId, itemId, "supplier_defect");
}

/** Khách đổi/trả 1 dòng: tách khỏi đơn (hoàn/trừ tiền), nhập kho nhãn Đổi trả. */
export function returnLine(
  orderId: number,
  itemId: number,
): LineActionResult {
  return _returnLineToStock(orderId, itemId, "exchange_return");
}

function _returnLineToStock(
  orderId: number,
  itemId: number,
  source: Extract<InventorySource, "supplier_defect" | "exchange_return">,
): LineActionResult {
  const item = sqlite
    .prepare(
      "SELECT id, name, quantity, unit_price_cny, line_status FROM order_items WHERE id = ? AND order_id = ?",
    )
    .get(itemId, orderId) as OrderItemRow | undefined;
  if (!item) return { ok: false, reason: "Không tìm thấy dòng sản phẩm" };
  if (item.line_status !== "normal")
    return { ok: false, reason: "Dòng này đã được tách trước đó" };

  const order = sqlite
    .prepare("SELECT exchange_rate FROM orders WHERE id = ?")
    .get(orderId) as { exchange_rate: number } | undefined;
  if (!order) return { ok: false, reason: "Không tìm thấy đơn" };

  sqlite.exec("BEGIN");
  try {
    const newStatus = source === "supplier_defect" ? "supplier_defect" : "returned";
    sqlite
      .prepare("UPDATE order_items SET line_status = ? WHERE id = ?")
      .run(newStatus, itemId);
    _addStock(
      item.name,
      source,
      item.quantity,
      unitGoodsCostVnd(item.unit_price_cny, order.exchange_rate),
    );
    _recomputeOrderMoney(orderId);
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
    // leftJoin, KHÔNG phải innerJoin: đơn chưa gắn khách vẫn phải hiện ra —
    // nếu không thì đơn thiếu thông tin lại là đơn bị giấu đi, đúng chỗ cần thấy nhất.
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .orderBy(desc(orders.createdAt));

  const threshold = config.staleOrderDays;
  const q = query?.trim().toLowerCase();

  return rows
    .map((r) => ({
      ...r,
      customerName: r.customerName ?? "— chưa có khách —",
    }))
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

/** Đếm số đơn ở mỗi trạng thái (chỉ trạng thái có đơn), theo thứ tự vòng đời. */
export async function countOrdersByStatus(): Promise<
  { status: OrderStatus; count: number }[]
> {
  const rows = await listOrders();
  const order = [...MAIN_CHAIN, ...BRANCH_STATUSES];
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  return order
    .map((status) => ({ status, count: counts.get(status) ?? 0 }))
    .filter((x) => x.count > 0);
}

// ---------- Khách hàng (danh sách + công nợ) ----------

export type CustomerListRow = {
  id: number;
  name: string;
  phone: string | null;
  warningFlag: boolean;
  warningReason: string | null;
  outstanding: number;
  orderCount: number;
};

export function listCustomersWithTotals(): CustomerListRow[] {
  const rows = sqlite
    .prepare(
      `SELECT c.id, c.name, c.phone, c.warning_flag, c.warning_reason,
              COALESCE(SUM(CASE WHEN o.status NOT IN ('hoan_tat','huy','khach_bom')
                                THEN o.amount_due ELSE 0 END), 0) AS outstanding,
              COUNT(o.id) AS order_count
         FROM customers c
         LEFT JOIN orders o ON o.customer_id = c.id
        GROUP BY c.id
        ORDER BY outstanding DESC, c.name`,
    )
    .all() as {
    id: number;
    name: string;
    phone: string | null;
    warning_flag: number;
    warning_reason: string | null;
    outstanding: number;
    order_count: number;
  }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    warningFlag: r.warning_flag === 1,
    warningReason: r.warning_reason,
    outstanding: r.outstanding,
    orderCount: r.order_count,
  }));
}

// ---------- Tồn kho ----------

export async function listInventory() {
  return db
    .select()
    .from(inventory)
    .orderBy(inventory.source, inventory.productName);
}

export function getInventoryItem(id: number) {
  return sqlite
    .prepare(
      "SELECT id, product_name, quantity, avg_cost, source FROM inventory WHERE id = ?",
    )
    .get(id) as
    | {
        id: number;
        product_name: string;
        quantity: number;
        avg_cost: number;
        source: string;
      }
    | undefined;
}

export type SellFromStockInput = {
  inventoryId: number;
  quantity: number;
  salePriceVnd: number; // tổng giá bán (VND) khách trả
  deposit: number;
  customerId?: number | null;
  newCustomer?: { name: string; phone?: string } | null;
  changedBy?: string | null;
};

export type SellResult =
  | { ok: true; orderId: number }
  | { ok: false; reason: string };

/** Bán từ kho: trừ tồn, tạo đơn ban_tu_kho (đã giao khách), snapshot giá vốn. */
export function sellFromStock(input: SellFromStockInput): SellResult {
  const inv = getInventoryItem(input.inventoryId);
  if (!inv) return { ok: false, reason: "Không tìm thấy hàng trong kho" };
  if (input.quantity <= 0) return { ok: false, reason: "Số lượng phải > 0" };
  if (input.quantity > inv.quantity)
    return {
      ok: false,
      reason: `Không đủ tồn: còn ${inv.quantity}, muốn bán ${input.quantity}`,
    };

  const saleCost = input.quantity * inv.avg_cost;
  const amountDue = Math.round(input.salePriceVnd) - Math.round(input.deposit);
  const unitPrice = Math.round(input.salePriceVnd / input.quantity);

  sqlite.exec("BEGIN");
  try {
    // Khách: có sẵn / mới / khách lẻ.
    let customerId = input.customerId ?? null;
    if (!customerId && input.newCustomer?.name) {
      customerId = Number(
        sqlite
          .prepare("INSERT INTO customers(name, phone) VALUES(?, ?)")
          .run(input.newCustomer.name, input.newCustomer.phone ?? null)
          .lastInsertRowid,
      );
    }
    if (!customerId) {
      const walkin = sqlite
        .prepare("SELECT id FROM customers WHERE name = 'Khách lẻ'")
        .get() as { id: number } | undefined;
      customerId =
        walkin?.id ??
        Number(
          sqlite
            .prepare("INSERT INTO customers(name) VALUES('Khách lẻ')")
            .run().lastInsertRowid,
        );
    }

    const after = applyStockOut(
      { quantity: inv.quantity, avgCost: inv.avg_cost },
      input.quantity,
    );
    sqlite
      .prepare("UPDATE inventory SET quantity = ? WHERE id = ?")
      .run(after.quantity, inv.id);

    const orderId = Number(
      sqlite
        .prepare(
          `INSERT INTO orders
             (customer_id, order_type, status, exchange_rate, goods_total_cny,
              margin_vnd, shipping_fee, deposit, amount_due, sale_cost, status_changed_at)
           VALUES (?, 'ban_tu_kho', 'da_giao_khach', 1, ?, 0, 0, ?, ?, ?, unixepoch())`,
        )
        .run(
          customerId,
          input.salePriceVnd,
          input.deposit,
          amountDue,
          saleCost,
        ).lastInsertRowid,
    );
    sqlite
      .prepare(
        `INSERT INTO order_items(order_id, name, quantity, unit_price_cny)
         VALUES (?, ?, ?, ?)`,
      )
      .run(orderId, inv.product_name, input.quantity, unitPrice);
    sqlite
      .prepare(
        `INSERT INTO order_status_history(order_id, to_status, changed_by, note)
         VALUES (?, 'da_giao_khach', ?, 'Bán từ kho')`,
      )
      .run(orderId, input.changedBy ?? null);

    sqlite.exec("COMMIT");
    return { ok: true, orderId };
  } catch (err) {
    sqlite.exec("ROLLBACK");
    throw err;
  }
}

/** Danh sách đơn kèm cờ "cần bổ sung" (v3-A). */
export async function listOrdersWithGaps(): Promise<
  (OrderListRow & { gaps: GapCode[] })[]
> {
  const rows = await listOrders();
  const meta = sqlite
    .prepare(
      `SELECT o.id                                         AS id,
              o.order_type                                 AS orderType,
              o.status                                     AS status,
              o.customer_id                                AS customerId,
              o.ship_status                                AS shipStatus,
              c.phone                                      AS phone,
              c.address                                    AS address,
              (SELECT COUNT(*) FROM order_items i
                WHERE i.order_id = o.id AND i.cost_confirmed = 0) AS unconfirmed,
              (SELECT COUNT(*) FROM photos p
                WHERE p.order_id = o.id AND p.label = 'product')  AS productPhotos
         FROM orders o LEFT JOIN customers c ON c.id = o.customer_id`,
    )
    .all() as {
    id: number;
    orderType: OrderType;
    status: OrderStatus;
    customerId: number | null;
    shipStatus: ShipStatus;
    phone: string | null;
    address: string | null;
    unconfirmed: number;
    productPhotos: number;
  }[];

  const byId = new Map(meta.map((m) => [m.id, m]));
  return rows.map((r) => {
    const m = byId.get(r.id);
    if (!m) return { ...r, gaps: [] as GapCode[] };
    return {
      ...r,
      gaps: orderGaps(
        {
          orderType: m.orderType,
          status: m.status,
          customerId: m.customerId,
          customerPhone: m.phone,
          customerAddress: m.address,
          shipStatus: m.shipStatus,
        },
        Array.from({ length: m.unconfirmed }, () => ({ costConfirmed: false })),
        Array.from({ length: m.productPhotos }, () => ({
          label: "product" as const,
        })),
      ),
    };
  });
}

// ---------- Dữ liệu cho 3 báo cáo (v3-B) ----------

function monthRange(year: number, month: number): [number, number] {
  const from = Math.floor(Date.UTC(year, month - 1, 1) / 1000);
  const to = Math.floor(Date.UTC(year, month, 1) / 1000);
  return [from, to];
}

/**
 * Đơn HOÀN TẤT trong tháng — ngày lấy từ order_status_history, không từ
 * orders.status_changed_at (cột đó chỉ giữ lần đổi gần nhất).
 */
export function getPnlData(
  year: number,
  month: number,
): { orders: PnlOrder[]; expenses: PnlExpense[]; bomDepositsVnd: number } {
  const [from, to] = monthRange(year, month);

  const rows = sqlite
    .prepare(
      `SELECT o.id                     AS id,
              o.order_type             AS orderType,
              o.quoted_total_vnd       AS quotedTotalVnd,
              o.shipping_fee           AS shippingFee,
              o.goods_total_cny        AS goodsTotalCny,
              o.exchange_rate          AS sellRate,
              o.sale_cost              AS saleCost,
              (SELECT l.rate_snapshot FROM cny_ledger l
                WHERE l.order_id = o.id AND l.kind = 'chi'
                ORDER BY l.id LIMIT 1)                        AS costRate,
              (SELECT COALESCE(SUM(i.margin_vnd), 0) FROM order_items i
                WHERE i.order_id = o.id)                      AS marginVnd,
              (SELECT COUNT(*) = 0 FROM order_items i
                WHERE i.order_id = o.id AND i.cost_confirmed = 0) AS costConfirmedRaw
         FROM orders o
        WHERE EXISTS (SELECT 1 FROM order_status_history h
                       WHERE h.order_id = o.id AND h.to_status = 'hoan_tat'
                         AND h.changed_at >= ? AND h.changed_at < ?)`,
    )
    .all(from, to) as (Omit<PnlOrder, "costConfirmed"> & {
    costConfirmedRaw: number;
  })[];

  const orders: PnlOrder[] = rows.map((r) => ({
    ...r,
    costConfirmed: r.costConfirmedRaw === 1,
  }));

  const expenseRows = sqlite
    .prepare(
      `SELECT amount_vnd AS amountVnd, category, order_id AS orderId
         FROM expenses WHERE spent_at >= ? AND spent_at < ?`,
    )
    .all(from, to) as PnlExpense[];

  // Cọc giữ được từ đơn chuyển sang khách bom trong tháng.
  const bom = sqlite
    .prepare(
      `SELECT COALESCE(SUM(p.amount_vnd), 0) AS total
         FROM payments p
        WHERE p.order_id IN (
              SELECT h.order_id FROM order_status_history h
               WHERE h.to_status = 'khach_bom'
                 AND h.changed_at >= ? AND h.changed_at < ?)`,
    )
    .get(from, to) as { total: number };

  return { orders, expenses: expenseRows, bomDepositsVnd: bom.total };
}

export function getCashFlow(year: number, month: number) {
  const [from, to] = monthRange(year, month);

  const inflow = sqlite
    .prepare(
      `SELECT method, COALESCE(SUM(amount_vnd), 0) AS total
         FROM payments WHERE paid_at >= ? AND paid_at < ? GROUP BY method`,
    )
    .all(from, to) as { method: PaymentMethod; total: number }[];

  const topups = sqlite
    .prepare(
      `SELECT COALESCE(SUM(vnd_paid), 0) AS total FROM cny_ledger
        WHERE kind = 'nap' AND created_at >= ? AND created_at < ?`,
    )
    .get(from, to) as { total: number };

  const spend = sqlite
    .prepare(
      `SELECT method, COALESCE(SUM(amount_vnd), 0) AS total
         FROM expenses WHERE spent_at >= ? AND spent_at < ? GROUP BY method`,
    )
    .all(from, to) as { method: PaymentMethod; total: number }[];

  const sum = (rows: { total: number }[]) =>
    rows.reduce((s, r) => s + r.total, 0);

  return {
    inflow,
    inflowTotal: sum(inflow),
    topupsVnd: topups.total,
    spend,
    spendTotal: sum(spend),
    netVnd: sum(inflow) - topups.total - sum(spend),
  };
}

export function getAssetSnapshot() {
  const wallet = getWallet();
  const stock = sqlite
    .prepare(
      "SELECT COALESCE(SUM(quantity * avg_cost), 0) AS total FROM inventory",
    )
    .get() as { total: number };
  const receivable = sqlite
    .prepare(
      `SELECT COALESCE(SUM(amount_due), 0) AS total FROM orders
        WHERE status NOT IN ('hoan_tat','huy','khach_bom')`,
    )
    .get() as { total: number };
  // Cọc của đơn CHƯA giao — tiền này nằm trong tài khoản nhưng chưa phải của mình.
  const heldDeposits = sqlite
    .prepare(
      `SELECT COALESCE(SUM(p.amount_vnd), 0) AS total FROM payments p
         JOIN orders o ON o.id = p.order_id
        WHERE o.status NOT IN ('da_giao_khach','hoan_tat','huy','khach_bom')`,
    )
    .get() as { total: number };

  return {
    walletCny: wallet.balance,
    walletVnd: wallet.valueVnd,
    stockVnd: stock.total,
    receivableVnd: receivable.total,
    heldDepositsVnd: heldDeposits.total,
  };
}
