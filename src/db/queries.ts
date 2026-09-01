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
import {
  allocateMargins,
  marginFromSellPrice,
  redistribute,
  totalAfterAddLine,
  totalAfterRemoveLine,
} from "@/lib/line-pricing";
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
import {
  currentRate,
  replayLedger,
  shouldDeductCny,
  walletValueVnd,
} from "@/lib/cny-wallet";
import type { PnlExpense, PnlOrder } from "@/lib/pnl";
import { getAdapter } from "@/lib/tracking";
import { computeOrderMoney, sumLineItemsCny } from "@/lib/money";
import {
  BRANCH_STATUSES,
  MAIN_CHAIN,
  STATUS_LABELS,
  canEditOrderItems,
  initialStatus,
  isTerminal,
  isTerminalFor,
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

// ---------- Mảnh SQL dùng chung ----------

/**
 * Điều kiện SQL "đơn còn treo" (chưa xong) — dùng chung để các chỗ tính công
 * nợ / tài sản không lệch nhau.
 *
 * Ba mã cuối TOÀN CỤC (hoan_tat / huy / khach_bom) không đủ từ v4: đơn
 * `nhap_kho` kết thúc ở `ve_kho_vn` — điểm cuối trục RIÊNG của nó, xem
 * `isTerminalFor` trong `@/lib/order-status`. Nếu không loại ra, một đơn nhập
 * kho đã xong vẫn cộng `amount_due` vào công nợ khách và vào khoản phải thu,
 * treo vĩnh viễn.
 *
 * @param t     alias của bảng `orders` trong câu truy vấn
 * @param extra mã coi như "đã xong" cho riêng câu đó (vd `da_giao_khach`)
 */
function openOrderSql(t: string, extra: readonly OrderStatus[] = []): string {
  const done: readonly OrderStatus[] = [
    ...extra,
    "hoan_tat",
    "huy",
    "khach_bom",
  ];
  return (
    `${t}.status NOT IN (${done.map((s) => `'${s}'`).join(",")})` +
    ` AND NOT (${t}.order_type = 'nhap_kho' AND ${t}.status = 've_kho_vn')`
  );
}

// ---------- Tham số nghiệp vụ (bảng settings) ----------

export async function getSettings(): Promise<AppSettings> {
  const rows = await raw.all<{ key: string; value: string }>(
    "SELECT key, value FROM settings",
  );
  return parseSettings(rows);
}

// Chỉ ghi hai tham số nghiệp vụ — KHÔNG nhận lastBackupAt, để màn Cài đặt
// không thể vô tình xoá mốc sao lưu (xem touchBackupAt bên dưới).
export async function saveSettings(
  next: Omit<AppSettings, "lastBackupAt">,
): Promise<void> {
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
 * Đánh dấu vừa tải một bản sao lưu. Tách khỏi saveSettings có chủ đích: màn
 * Cài đặt gọi saveSettings và không được phép đụng vào mốc này.
 */
export async function touchBackupAt(): Promise<void> {
  await raw.run(
    `INSERT INTO settings(key, value) VALUES(?, ${NOW_EPOCH_SQL}::text)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [SETTING_KEYS.lastBackupAt],
  );
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

export async function createOrder(
  input: NewOrderInput,
): Promise<{ orderId: number; itemIds: number[] }> {
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
        (await getSettings()).defaultMarginVnd,
      );
  const marginTotal = margins.reduce((s, m) => s + m, 0);

  const money = computeOrderMoney({
    goodsTotalCny,
    exchangeRate: input.exchangeRate,
    serviceFee: marginTotal,
    shippingFee: input.shippingFee,
    deposit: input.deposit,
  });

  // Tính TRƯỚC khi mở transaction: listLedger() dùng `raw` toàn cục, gọi bên
  // trong withTx thì câu đó chạy ngoài transaction, không rollback theo.
  const willDeductCny = shouldDeductCny({
    orderType: input.orderType,
    toStatus: initialStatus(input.orderType),
    goodsTotalCny,
    // Đơn mới tinh, chưa thể có dòng sổ nào.
    alreadyDeducted: false,
  });
  const cnyRateSnapshot = willDeductCny
    ? Math.round(currentRate(await listLedger()))
    : 0;

  return withTx(async (x) => {
    let customerId = input.customerId ?? null;
    if (!customerId && input.newCustomer) {
      const c = await x.get<{ id: number }>(
        "INSERT INTO customers(name, phone, address) VALUES(?, ?, ?) RETURNING id",
        [
          input.newCustomer.name,
          input.newCustomer.phone ?? null,
          input.newCustomer.address ?? null,
        ],
      );
      customerId = c!.id;
    }
    // Đơn ĐƯỢC PHÉP chưa có khách (tiền cọc đã về thật, thông tin tới sau).
    // Cờ `thieu_khach` của order-gaps lo phần nhắc bổ sung.

    // Trạng thái khởi tạo là bước ĐẦU của trục theo loại đơn (v4), không
    // còn hardcode 'cho_bao_gia' — mã đó đã về hưu cùng khâu báo giá.
    // Dùng chung một giá trị cho cả orders.status lẫn dòng lịch sử đầu tiên,
    // để trang chi tiết không hiển thị một mốc khởi đầu sai.
    const startStatus = initialStatus(input.orderType);
    const o = await x.get<{ id: number }>(
      `INSERT INTO orders
         (customer_id, order_type, status, exchange_rate, goods_total_cny,
          margin_vnd, shipping_fee, deposit, amount_due, note,
          quoted_total_vnd, ship_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        customerId,
        input.orderType,
        startStatus,
        input.exchangeRate,
        goodsTotalCny,
        marginTotal,
        input.shippingFee,
        input.deposit,
        money.amountDue,
        input.note ?? null,
        Math.round(input.quotedTotalVnd),
        input.shipStatus,
      ],
    );
    const orderId = o!.id;

    const itemIds: number[] = [];
    for (const [i, it] of input.items.entries()) {
      const row = await x.get<{ id: number }>(
        `INSERT INTO order_items
           (order_id, product_url, name, attributes, quantity, unit_price_cny,
            margin_vnd, cost_confirmed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id`,
        [
          orderId,
          it.productUrl ?? null,
          it.name,
          it.attributes ?? null,
          it.quantity,
          it.unitPriceCny,
          margins[i],
          it.costConfirmed ?? false,
        ],
      );
      itemIds.push(row!.id);
    }

    await x.run(
      `INSERT INTO order_status_history
         (order_id, from_status, to_status, changed_by, note)
       VALUES (?, NULL, ?, ?, 'Tạo đơn')`,
      [orderId, startStatus, input.changedBy ?? null],
    );

    // Đơn nhap_kho sinh ra thẳng ở 'da_mua_tq' nên không bao giờ đi qua
    // changeOrderStatus — không ghi ở đây thì ví ¥ không bao giờ bị trừ.
    if (willDeductCny) {
      await x.run(
        `INSERT INTO cny_ledger (kind, cny_delta, rate_snapshot, order_id, note)
         VALUES ('chi', ?, ?, ?, ?)`,
        [-goodsTotalCny, cnyRateSnapshot, orderId, `Mua hàng đơn #${orderId}`],
      );
    }

    // Cọc đọc từ ảnh Zalo → một dòng thu tiền, không ghi thẳng vào
    // orders.deposit nữa (deposit là số dẫn xuất — spec v3-B mục 3).
    if (input.deposit > 0) {
      await x.run(
        `INSERT INTO payments (order_id, amount_vnd, paid_at, kind, method, note)
         VALUES (?, ?, ${NOW_EPOCH_SQL}, 'coc', 'chuyen_khoan', NULL)`,
        [orderId, Math.round(input.deposit)],
      );
    }

    return { orderId, itemIds };
  });
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

/**
 * Gắn một ảnh đã tải lên vào ĐÚNG dòng sản phẩm (v6).
 *
 * Cột photos.order_item_id có trong schema từ MVP nhưng trước v6 chưa đường
 * nào ghi vào. Điều kiện `order_id IS NULL` giữ nguyên tinh thần của
 * linkPhotoToOrder: chỉ gắn ảnh chưa thuộc đơn nào, không cướp ảnh của đơn khác.
 */
export async function linkPhotoToOrderItem(
  photoId: number,
  orderItemId: number,
  orderId: number,
): Promise<void> {
  await raw.run(
    `UPDATE photos SET order_id = ?, order_item_id = ?
      WHERE id = ? AND order_id IS NULL`,
    [orderId, orderItemId, photoId],
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

export async function listPackages(): Promise<PackageRow[]> {
  const rows = await raw.all<{
    id: number;
    tracking_code: string;
    carrier: string | null;
    weight_kg: number | null;
    tracking_status: string | null;
    last_checked_at: number | null;
    mode: "auto" | "manual";
    needs_manual_check: boolean;
    order_ids: string | null;
  }>(
    `SELECT p.id, p.tracking_code, p.carrier, p.weight_kg, p.tracking_status,
            p.last_checked_at::int AS last_checked_at, p.mode, p.needs_manual_check,
            string_agg(op.order_id::text, ',') AS order_ids
       FROM packages p
       LEFT JOIN order_packages op ON op.package_id = p.id
      GROUP BY p.id
      ORDER BY p.needs_manual_check DESC, p.created_at DESC`,
  );
  return rows.map((r) => ({
    id: r.id,
    trackingCode: r.tracking_code,
    carrier: r.carrier,
    weightKg: r.weight_kg,
    trackingStatus: r.tracking_status,
    lastCheckedAt: r.last_checked_at,
    mode: r.mode,
    needsManualCheck: r.needs_manual_check === true,
    orderIds: r.order_ids ? r.order_ids.split(",").map((s) => Number(s)) : [],
  }));
}

export async function getPackagesForOrder(
  orderId: number,
): Promise<PackageRow[]> {
  const all = await listPackages();
  return all.filter((p) => p.orderIds.includes(orderId));
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

export async function createPackage(
  input: CreatePackageInput,
): Promise<PackageResult> {
  const code = input.trackingCode.trim();
  if (!code) return { ok: false, reason: "Thiếu mã vận đơn" };

  return withTx(async (x) => {
    const p = await x.get<{ id: number }>(
      `INSERT INTO packages(tracking_code, carrier, weight_kg, mode)
       VALUES (?, ?, ?, ?) RETURNING id`,
      [code, input.carrier ?? null, input.weightKg ?? null, input.mode],
    );
    const id = p!.id;
    for (const orderId of input.orderIds) {
      const exists = await x.get("SELECT 1 AS x FROM orders WHERE id = ?", [
        orderId,
      ]);
      if (exists) {
        await x.run(
          `INSERT INTO order_packages(order_id, package_id) VALUES (?, ?)
           ON CONFLICT DO NOTHING`,
          [orderId, id],
        );
      }
    }
    return { ok: true, id } as PackageResult;
  });
}

/** Cập nhật trạng thái kiện bằng tay (xoá cờ tra tay). */
export async function updatePackageStatusManual(
  id: number,
  status: string,
): Promise<void> {
  await raw.run(
    `UPDATE packages
        SET tracking_status = ?, last_checked_at = ${NOW_EPOCH_SQL},
            needs_manual_check = false
      WHERE id = ?`,
    [status.trim(), id],
  );
}

export type SweepResult = { checked: number; updated: number; flagged: number };

/**
 * Job tra tự động: quét các kiện mode "auto", gọi adapter theo carrier.
 * Không có adapter / tra lỗi → gắn cờ "tra tay". Chạy được cả từ job nền lẫn nút bấm.
 */
export async function runTrackingSweep(): Promise<SweepResult> {
  const pkgs = await raw.all<{
    id: number;
    tracking_code: string;
    carrier: string | null;
  }>("SELECT id, tracking_code, carrier FROM packages WHERE mode = 'auto'");

  const FLAG = `UPDATE packages SET needs_manual_check = true, last_checked_at = ${NOW_EPOCH_SQL} WHERE id = ?`;
  const SAVE = `UPDATE packages SET tracking_status = ?, last_checked_at = ${NOW_EPOCH_SQL}, needs_manual_check = false WHERE id = ?`;

  let checked = 0;
  let updated = 0;
  let flagged = 0;
  for (const p of pkgs) {
    checked++;
    const adapter = getAdapter(p.carrier);
    if (!adapter) {
      await raw.run(FLAG, [p.id]);
      flagged++;
      continue;
    }
    try {
      const r = await adapter.lookup(p.tracking_code);
      if (r.ok) {
        await raw.run(SAVE, [r.status, p.id]);
        updated++;
      } else {
        await raw.run(FLAG, [p.id]);
        flagged++;
      }
    } catch {
      await raw.run(FLAG, [p.id]);
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
async function _addStock(
  x: Exec,
  name: string,
  source: InventorySource,
  qty: number,
  unitCost: number,
): Promise<void> {
  const row = await x.get<{ id: number; quantity: number; avg_cost: number }>(
    "SELECT id, quantity, avg_cost FROM inventory WHERE product_name = ? AND source = ?",
    [name, source],
  );
  if (row) {
    const after = applyStockIn(
      { quantity: row.quantity, avgCost: row.avg_cost },
      qty,
      unitCost,
    );
    await x.run(
      `UPDATE inventory SET quantity = ?, avg_cost = ?,
              last_imported_at = ${NOW_EPOCH_SQL} WHERE id = ?`,
      [after.quantity, after.avgCost, row.id],
    );
  } else {
    await x.run(
      `INSERT INTO inventory(product_name, quantity, avg_cost, source, last_imported_at)
       VALUES (?, ?, ?, ?, ${NOW_EPOCH_SQL})`,
      [name, qty, unitCost, source],
    );
  }
}

/** Tính lại tiền đơn từ các dòng còn "normal" (loại bỏ dòng lỗi/đã trả). */
async function _recomputeOrderMoney(x: Exec, orderId: number): Promise<void> {
  const order = (await x.get<{
    exchange_rate: number;
    margin_vnd: number;
    shipping_fee: number;
    deposit: number;
  }>(
    "SELECT exchange_rate, margin_vnd, shipping_fee, deposit FROM orders WHERE id = ?",
    [orderId],
  ))!;
  const rows = await x.all<{ quantity: number; unit_price_cny: number }>(
    "SELECT quantity, unit_price_cny FROM order_items WHERE order_id = ? AND line_status = 'normal'",
    [orderId],
  );
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
  await x.run(
    "UPDATE orders SET goods_total_cny = ?, amount_due = ? WHERE id = ?",
    [goodsTotalCny, money.amountDue, orderId],
  );
}

// ---------- Ví ¥ (v3-B) ----------

export async function listLedger() {
  return raw.all<{
    id: number;
    kind: LedgerKind;
    cnyDelta: number;
    vndPaid: number | null;
    rateSnapshot: number | null;
    orderId: number | null;
    note: string | null;
    createdAt: number;
  }>(
    `SELECT id, kind, cny_delta AS "cnyDelta", vnd_paid AS "vndPaid",
            rate_snapshot AS "rateSnapshot", order_id AS "orderId", note,
            created_at::int AS "createdAt"
       FROM cny_ledger ORDER BY created_at, id`,
  );
}

export async function getWallet() {
  const state = replayLedger(await listLedger());
  return { ...state, valueVnd: walletValueVnd(state) };
}

export async function addTopup(input: {
  cny: number;
  vndPaid: number;
  note?: string | null;
}): Promise<LineActionResult> {
  if (!(input.cny > 0)) return { ok: false, reason: "Số tệ phải lớn hơn 0" };
  if (!(input.vndPaid > 0))
    return { ok: false, reason: "Số tiền trả phải lớn hơn 0" };

  await raw.run(
    `INSERT INTO cny_ledger (kind, cny_delta, vnd_paid, note)
     VALUES ('nap', ?, ?, ?)`,
    [input.cny, Math.round(input.vndPaid), input.note ?? null],
  );
  return { ok: true };
}

/**
 * Chỉ cho xoá dòng 'nap' — dòng 'chi' sinh tự động từ trạng thái đơn.
 * Sửa = xoá rồi nạp lại: số dư chạy lại từ sổ nên kết quả giống hệt.
 */
export async function deleteLedgerEntry(id: number): Promise<LineActionResult> {
  const row = await raw.get<{ kind: LedgerKind }>(
    "SELECT kind FROM cny_ledger WHERE id = ?",
    [id],
  );
  if (!row) return { ok: false, reason: "Không tìm thấy dòng sổ" };
  if (row.kind !== "nap")
    return {
      ok: false,
      reason:
        "Chỉ xoá được đợt nạp. Dòng mua hàng sửa bằng cách ghi điều chỉnh.",
    };
  await raw.run("DELETE FROM cny_ledger WHERE id = ?", [id]);
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

export async function addExpense(
  input: AddExpenseInput,
): Promise<LineActionResult> {
  if (!(input.amountVnd > 0))
    return { ok: false, reason: "Số tiền phải lớn hơn 0" };
  if (input.orderId != null) {
    const exists = await raw.get("SELECT 1 AS x FROM orders WHERE id = ?", [
      input.orderId,
    ]);
    if (!exists) return { ok: false, reason: "Đơn không tồn tại" };
  }
  await raw.run(
    `INSERT INTO expenses (spent_at, category, amount_vnd, order_id, method, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      Math.floor(input.spentAt.getTime() / 1000),
      input.category,
      Math.round(input.amountVnd),
      input.orderId ?? null,
      input.method,
      input.note ?? null,
    ],
  );
  return { ok: true };
}

export async function deleteExpense(id: number): Promise<LineActionResult> {
  await raw.run("DELETE FROM expenses WHERE id = ?", [id]);
  return { ok: true };
}

// ---------- Đổi trạng thái (kèm side-effect tồn kho) ----------

export type ChangeStatusResult =
  | { ok: true }
  | { ok: false; reason: string };

export async function changeOrderStatus(
  id: number,
  to: OrderStatus,
  changedBy?: string | null,
  note?: string | null,
): Promise<ChangeStatusResult> {
  const order = await raw.get<{
    order_type: OrderType;
    status: OrderStatus;
    exchange_rate: number;
    goods_total_cny: number;
    shipping_fee: number;
    deposit: number;
    customer_id: number;
  }>(
    `SELECT order_type, status, exchange_rate, goods_total_cny,
            shipping_fee, deposit, customer_id
       FROM orders WHERE id = ?`,
    [id],
  );
  if (!order) return { ok: false, reason: "Không tìm thấy đơn" };

  const transitionResult = transition(order.order_type, order.status, to);
  if (!transitionResult.ok)
    return { ok: false, reason: transitionResult.reason };

  const result = await withTx(async (x) => {
    await x.run(
      `UPDATE orders SET status = ?, status_changed_at = ${NOW_EPOCH_SQL}
        WHERE id = ?`,
      [to, id],
    );
    await x.run(
      `INSERT INTO order_status_history
         (order_id, from_status, to_status, changed_by, note)
       VALUES (?, ?, ?, ?, ?)`,
      [id, order.status, to, changedBy ?? null, note ?? null],
    );

    const normalItems = await x.all<OrderItemRow>(
      "SELECT id, name, quantity, unit_price_cny, line_status FROM order_items WHERE order_id = ? AND line_status = 'normal'",
      [id],
    );

    // Đơn Nhập kho về tới kho VN → cộng tồn (nguồn Nhập chủ động).
    if (to === "ve_kho_vn" && order.order_type === "nhap_kho") {
      for (const it of normalItems) {
        await _addStock(
          x,
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
        await _addStock(x, it.name, "bom", it.quantity, perUnit);
      }
      await x.run(
        `UPDATE customers
           SET warning_flag = true,
               warning_reason = COALESCE(warning_reason, ?)
         WHERE id = ?`,
        [`Từng bom hàng (đơn #${id})`, order.customer_id],
      );
    }

    // Đã mua hàng TQ → trừ ví ¥ và CHỐT CỨNG giá vốn tại thời điểm này.
    // Nạp ¥ đợt sau rẻ hơn không được làm đổi lãi/lỗ của đơn đã mua rồi.
    // Luật (kể cả chống trừ hai lần) nằm ở shouldDeductCny — đừng viết lại
    // điều kiện ở đây, createOrder cũng gọi đúng hàm đó.
    const deducted = await x.get<{ one: number }>(
      "SELECT 1 AS one FROM cny_ledger WHERE order_id = ? AND kind = 'chi' LIMIT 1",
      [id],
    );
    if (
      shouldDeductCny({
        orderType: order.order_type,
        toStatus: to,
        goodsTotalCny: order.goods_total_cny,
        alreadyDeducted: Boolean(deducted),
      })
    ) {
      const rate = Math.round(currentRate(await listLedger()));
      await x.run(
        `INSERT INTO cny_ledger (kind, cny_delta, rate_snapshot, order_id, note)
         VALUES ('chi', ?, ?, ?, ?)`,
        [-order.goods_total_cny, rate, id, `Mua hàng đơn #${id}`],
      );
    }

    return { ok: true } as ChangeStatusResult;
  });

  // Đơn đã thu đủ từ trước (ví dụ cọc 100%) thì vừa bấm "đã giao" là xong
  // luôn, không bắt thao tác thêm. Gọi ngoài withTx vì changeOrderStatus
  // bên trong autoCompleteIfPaid tự mở transaction riêng.
  if (result.ok && to === "da_giao_khach") {
    await autoCompleteIfPaid(id, changedBy);
  }

  return result;
}

/**
 * Đơn đã giao khách và không còn phải thu → tự chuyển "Hoàn tất".
 *
 * PHẢI đi qua changeOrderStatus (không UPDATE thẳng cột status) để
 * order_status_history có dòng 'hoan_tat' — báo cáo lãi tính theo NGÀY HOÀN
 * TẤT đọc từ bảng đó, không đọc orders.status_changed_at.
 *
 * Gọi hàm này SAU khi transaction gọi nó đã commit, không gọi bên trong
 * withTx: changeOrderStatus tự mở transaction riêng.
 */
export async function autoCompleteIfPaid(
  orderId: number,
  changedBy?: string | null,
): Promise<void> {
  const row = await raw.get<{ status: OrderStatus; amount_due: number }>(
    "SELECT status, amount_due FROM orders WHERE id = ?",
    [orderId],
  );
  if (!row) return;
  if (row.status !== "da_giao_khach") return;
  if (row.amount_due > 0) return;

  await changeOrderStatus(
    orderId,
    "hoan_tat",
    changedBy ?? "tự động",
    "Tự động hoàn tất: đã giao khách và thu đủ tiền",
  );
}

// ---------- Bóc lớp giá theo dòng (v3-A) ----------

type OrderMoneyRow = {
  exchange_rate: number;
  shipping_fee: number;
  deposit: number;
};

async function readOrderMoneyRow(
  x: Exec,
  orderId: number,
): Promise<OrderMoneyRow> {
  const row = await x.get<OrderMoneyRow>(
    "SELECT exchange_rate, shipping_fee, deposit FROM orders WHERE id = ?",
    [orderId],
  );
  if (!row) throw new Error("Không tìm thấy đơn");
  return row;
}

/**
 * Đồng bộ khối tiền cấp đơn từ các dòng. Gọi BÊN TRONG transaction đang mở.
 * goods_total_cny và margin_vnd ở cấp đơn là số DẪN XUẤT từ order_items.
 */
export async function recomputeOrderMoneyRow(
  x: Exec,
  orderId: number,
  order: OrderMoneyRow,
): Promise<void> {
  const agg = (await x.get<{ cny: number; margin: number }>(
    `SELECT COALESCE(SUM(quantity * unit_price_cny), 0) AS cny,
            COALESCE(SUM(margin_vnd), 0)::int AS margin
       FROM order_items WHERE order_id = ?`,
    [orderId],
  ))!;

  const money = computeOrderMoney({
    goodsTotalCny: agg.cny,
    exchangeRate: order.exchange_rate,
    serviceFee: agg.margin,
    shippingFee: order.shipping_fee,
    deposit: order.deposit,
  });

  await x.run(
    "UPDATE orders SET goods_total_cny = ?, margin_vnd = ?, amount_due = ? WHERE id = ?",
    [agg.cny, agg.margin, money.amountDue, orderId],
  );
}

/**
 * Nhập hoặc sửa giá ¥ của một dòng. Total giữ nguyên (khách đã đồng ý), lời
 * được rải lại cho toàn bộ dòng. Chạm vào ô này = xác nhận giá vốn.
 */
export async function updateLineCost(
  orderId: number,
  itemId: number,
  unitPriceCny: number,
): Promise<LineActionResult> {
  if (!(unitPriceCny >= 0))
    return { ok: false, reason: "Giá tệ không được âm" };

  const defaultMargin = (await getSettings()).defaultMarginVnd;
  const ledger = await listLedger();

  try {
    return await withTx(async (x) => {
      const order = await readOrderMoneyRow(x, orderId);
      const quoted = (await x.get<{ total: number }>(
        "SELECT quoted_total_vnd AS total FROM orders WHERE id = ?",
        [orderId],
      ))!;

      await x.run(
        "UPDATE order_items SET unit_price_cny = ?, cost_confirmed = true WHERE id = ? AND order_id = ?",
        [unitPriceCny, itemId, orderId],
      );

      // Giá vốn đổi → lời phải rải lại để Σ giá bán vẫn đúng bằng Total.
      const rows = await x.all<{
        id: number;
        quantity: number;
        unit_price_cny: number;
        margin_vnd: number;
      }>(
        "SELECT id, quantity, unit_price_cny, margin_vnd FROM order_items WHERE order_id = ? ORDER BY id",
        [orderId],
      );
      const margins = allocateMargins(
        quoted.total,
        rows.map((r) => ({
          quantity: r.quantity,
          unitPriceCny: r.unit_price_cny,
          marginVnd: r.margin_vnd,
        })),
        order.exchange_rate,
        defaultMargin,
      );
      for (const [i, r] of rows.entries()) {
        await x.run("UPDATE order_items SET margin_vnd = ? WHERE id = ?", [
          margins[i],
          r.id,
        ]);
      }

      // Đơn đã mua hàng rồi mà giá ¥ mới sửa → ghi dòng điều chỉnh bằng phần
      // chênh vào ví. Sổ ví là append-only: không bao giờ sửa quá khứ.
      const spent = (await x.get<{ cny: number }>(
        `SELECT COALESCE(SUM(-cny_delta), 0) AS cny
           FROM cny_ledger WHERE order_id = ? AND kind IN ('chi','dieu_chinh')`,
        [orderId],
      ))!;

      if (spent.cny > 0) {
        const agg = (await x.get<{ cny: number }>(
          "SELECT COALESCE(SUM(quantity * unit_price_cny), 0) AS cny FROM order_items WHERE order_id = ?",
          [orderId],
        ))!;
        const diff = agg.cny - spent.cny;
        if (Math.abs(diff) > 0.0001) {
          const rate = Math.round(currentRate(ledger));
          await x.run(
            `INSERT INTO cny_ledger (kind, cny_delta, rate_snapshot, order_id, note)
             VALUES ('dieu_chinh', ?, ?, ?, ?)`,
            [-diff, rate, orderId, `Sửa giá ¥ đơn #${orderId}`],
          );
        }
      }

      await recomputeOrderMoneyRow(x, orderId, order);
      return { ok: true } as LineActionResult;
    });
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

/** Kéo lời của một dòng; các dòng khác bù lại để Total giữ nguyên. */
export async function updateLineMargin(
  orderId: number,
  itemId: number,
  marginVnd: number,
): Promise<LineActionResult> {
  try {
    return await withTx(async (x) => {
      const order = await readOrderMoneyRow(x, orderId);
      const quoted = (await x.get<{ total: number }>(
        "SELECT quoted_total_vnd AS total FROM orders WHERE id = ?",
        [orderId],
      ))!;

      const rows = await x.all<{
        id: number;
        quantity: number;
        unit_price_cny: number;
      }>(
        "SELECT id, quantity, unit_price_cny FROM order_items WHERE order_id = ? ORDER BY id",
        [orderId],
      );
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

      for (const [i, r] of rows.entries()) {
        await x.run("UPDATE order_items SET margin_vnd = ? WHERE id = ?", [
          margins[i],
          r.id,
        ]);
      }

      await recomputeOrderMoneyRow(x, orderId, order);
      return { ok: true } as LineActionResult;
    });
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

/**
 * Thêm một món vào đơn ĐÃ TẠO (v6). Total tăng thêm giá bán của món mới;
 * lời các dòng cũ KHÔNG bị rải lại — mỗi dòng giữ nguyên lời của nó.
 */
export async function addOrderItem(
  orderId: number,
  input: {
    name: string;
    attributes: string | null;
    productUrl: string | null;
    quantity: number;
    /** Giá phải thu cho 1 cái (₫). */
    sellVnd: number;
    unitPriceCny: number;
    costConfirmed: boolean;
  },
): Promise<LineActionResult & { itemId?: number }> {
  if (input.name.trim() === "")
    return { ok: false, reason: "Chưa nhập tên hàng." };
  if (!(input.quantity > 0))
    return { ok: false, reason: "Số lượng phải lớn hơn 0." };
  if (!(input.sellVnd > 0))
    return { ok: false, reason: "Chưa nhập giá phải thu." };

  try {
    return await withTx(async (x) => {
      const status = await x.get<{ status: OrderStatus }>(
        "SELECT status FROM orders WHERE id = ?",
        [orderId],
      );
      if (!status) throw new Error("Không tìm thấy đơn");
      if (!canEditOrderItems(status.status))
        throw new Error(
          `Đơn ở "${STATUS_LABELS[status.status]}" không sửa được danh sách món.`,
        );

      const order = await readOrderMoneyRow(x, orderId);
      const quoted = (await x.get<{ total: number }>(
        "SELECT quoted_total_vnd AS total FROM orders WHERE id = ?",
        [orderId],
      ))!;

      const line = {
        quantity: input.quantity,
        unitPriceCny: input.unitPriceCny,
        marginVnd: 0,
      };
      const margin = marginFromSellPrice(input.sellVnd, line, order.exchange_rate);

      const row = await x.get<{ id: number }>(
        `INSERT INTO order_items
           (order_id, product_url, name, attributes, quantity, unit_price_cny,
            margin_vnd, cost_confirmed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id`,
        [
          orderId,
          input.productUrl,
          input.name.trim(),
          input.attributes,
          input.quantity,
          input.unitPriceCny,
          margin,
          input.costConfirmed,
        ],
      );

      await x.run("UPDATE orders SET quoted_total_vnd = ? WHERE id = ?", [
        totalAfterAddLine(quoted.total, input.sellVnd, input.quantity),
        orderId,
      ]);

      await recomputeOrderMoneyRow(x, orderId, order);
      return { ok: true, itemId: row!.id } as LineActionResult & {
        itemId?: number;
      };
    });
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

/**
 * Xoá một món khỏi đơn ĐÃ TẠO (v6). Total giảm đúng giá bán của dòng đó.
 * Không xoá được món cuối cùng — đơn phải còn ≥ 1 món; muốn bỏ hẳn thì Xoá
 * đơn hoặc Hủy.
 */
export async function removeOrderItem(
  orderId: number,
  itemId: number,
): Promise<LineActionResult> {
  try {
    return await withTx(async (x) => {
      const status = await x.get<{ status: OrderStatus }>(
        "SELECT status FROM orders WHERE id = ?",
        [orderId],
      );
      if (!status) throw new Error("Không tìm thấy đơn");
      if (!canEditOrderItems(status.status))
        throw new Error(
          `Đơn ở "${STATUS_LABELS[status.status]}" không sửa được danh sách món.`,
        );

      const count = (await x.get<{ n: number }>(
        "SELECT COUNT(*)::int AS n FROM order_items WHERE order_id = ?",
        [orderId],
      ))!;
      if (count.n <= 1)
        throw new Error(
          "Đơn phải còn ít nhất 1 món — dùng Xoá đơn hoặc Hủy thay vì xoá món cuối.",
        );

      const item = await x.get<{
        quantity: number;
        unit_price_cny: number;
        margin_vnd: number;
      }>(
        `SELECT quantity, unit_price_cny, margin_vnd
           FROM order_items WHERE id = ? AND order_id = ?`,
        [itemId, orderId],
      );
      if (!item) throw new Error("Không tìm thấy dòng sản phẩm");

      const order = await readOrderMoneyRow(x, orderId);
      const quoted = (await x.get<{ total: number }>(
        "SELECT quoted_total_vnd AS total FROM orders WHERE id = ?",
        [orderId],
      ))!;

      await x.run("DELETE FROM order_items WHERE id = ? AND order_id = ?", [
        itemId,
        orderId,
      ]);

      await x.run("UPDATE orders SET quoted_total_vnd = ? WHERE id = ?", [
        totalAfterRemoveLine(
          quoted.total,
          {
            quantity: item.quantity,
            unitPriceCny: item.unit_price_cny,
            marginVnd: item.margin_vnd,
          },
          order.exchange_rate,
        ),
        orderId,
      ]);

      await recomputeOrderMoneyRow(x, orderId, order);
      return { ok: true } as LineActionResult;
    });
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

/** Nhập phí ship khi hàng về VN (hoặc đánh dấu freeship). */
export async function setShipFee(
  orderId: number,
  shipStatus: ShipStatus,
  shippingFee: number,
): Promise<LineActionResult> {
  if (!(shippingFee >= 0))
    return { ok: false, reason: "Phí ship không được âm" };
  const fee = shipStatus === "set" ? Math.round(shippingFee) : 0;

  try {
    return await withTx(async (x) => {
      const order = await readOrderMoneyRow(x, orderId);
      await x.run(
        "UPDATE orders SET ship_status = ?, shipping_fee = ? WHERE id = ?",
        [shipStatus, fee, orderId],
      );

      await recomputeOrderMoneyRow(x, orderId, { ...order, shipping_fee: fee });
      return { ok: true } as LineActionResult;
    });
  } catch (err) {
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
export async function suggestFinalPayment(orderId: number): Promise<number> {
  const row = await raw.get<{ total: number; ship: number; paid: number }>(
    `SELECT o.quoted_total_vnd AS total, o.shipping_fee AS ship,
            COALESCE((SELECT SUM(p.amount_vnd) FROM payments p
                       WHERE p.order_id = o.id), 0)::int AS paid
       FROM orders o WHERE o.id = ?`,
    [orderId],
  );
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

export async function addPayment(
  input: AddPaymentInput,
): Promise<LineActionResult> {
  // Hoàn trả lưu số ÂM; các khoản thu phải dương.
  const amount =
    input.kind === "hoan_tra"
      ? -Math.abs(Math.round(input.amountVnd))
      : Math.round(input.amountVnd);
  if (amount === 0) return { ok: false, reason: "Số tiền phải khác 0" };

  let result: LineActionResult;
  try {
    result = await withTx(async (x) => {
      await x.run(
        `INSERT INTO payments (order_id, amount_vnd, paid_at, kind, method, note)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          input.orderId,
          amount,
          Math.floor(input.paidAt.getTime() / 1000),
          input.kind,
          input.method,
          input.note ?? null,
        ],
      );
      await syncOrderDeposit(x, input.orderId);
      return { ok: true } as LineActionResult;
    });
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }

  // Khách trả nốt tiền lúc đơn đã ở "đã giao khách" → hoàn tất luôn.
  await autoCompleteIfPaid(input.orderId);

  return result;
}

export async function deletePayment(
  id: number,
  orderId: number,
): Promise<LineActionResult> {
  let result: LineActionResult;
  try {
    result = await withTx(async (x) => {
      await x.run("DELETE FROM payments WHERE id = ? AND order_id = ?", [
        id,
        orderId,
      ]);
      await syncOrderDeposit(x, orderId);
      return { ok: true } as LineActionResult;
    });
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }

  // Xoá nhầm rồi thêm lại là chuyện bình thường — gọi ở cả hai chiều thì
  // trạng thái luôn khớp với số tiền thực thu.
  await autoCompleteIfPaid(orderId);

  return result;
}

/**
 * Đồng bộ orders.deposit từ sổ thu tiền rồi tính lại khối tiền của đơn.
 * Gọi BÊN TRONG transaction đang mở.
 */
async function syncOrderDeposit(x: Exec, orderId: number): Promise<void> {
  const row = (await x.get<{ paid: number }>(
    `SELECT COALESCE(SUM(amount_vnd), 0)::int AS paid FROM payments WHERE order_id = ?`,
    [orderId],
  ))!;

  await x.run("UPDATE orders SET deposit = ? WHERE id = ?", [
    row.paid,
    orderId,
  ]);

  const order = await readOrderMoneyRow(x, orderId);
  await recomputeOrderMoneyRow(x, orderId, order);
}

// ---------- Ba luồng ngoại lệ theo dòng sản phẩm ----------

export type LineActionResult = { ok: true } | { ok: false; reason: string };

/** Đánh dấu 1 dòng "lỗi NCC": tách khỏi đơn, nhập kho nhãn Lỗi NCC. */
export async function markLineDefect(
  orderId: number,
  itemId: number,
): Promise<LineActionResult> {
  return _returnLineToStock(orderId, itemId, "supplier_defect");
}

/** Khách đổi/trả 1 dòng: tách khỏi đơn (hoàn/trừ tiền), nhập kho nhãn Đổi trả. */
export async function returnLine(
  orderId: number,
  itemId: number,
): Promise<LineActionResult> {
  return _returnLineToStock(orderId, itemId, "exchange_return");
}

async function _returnLineToStock(
  orderId: number,
  itemId: number,
  source: Extract<InventorySource, "supplier_defect" | "exchange_return">,
): Promise<LineActionResult> {
  const item = await raw.get<OrderItemRow>(
    "SELECT id, name, quantity, unit_price_cny, line_status FROM order_items WHERE id = ? AND order_id = ?",
    [itemId, orderId],
  );
  if (!item) return { ok: false, reason: "Không tìm thấy dòng sản phẩm" };
  if (item.line_status !== "normal")
    return { ok: false, reason: "Dòng này đã được tách trước đó" };

  const order = await raw.get<{ exchange_rate: number }>(
    "SELECT exchange_rate FROM orders WHERE id = ?",
    [orderId],
  );
  if (!order) return { ok: false, reason: "Không tìm thấy đơn" };

  return withTx(async (x) => {
    const newStatus =
      source === "supplier_defect" ? "supplier_defect" : "returned";
    await x.run("UPDATE order_items SET line_status = ? WHERE id = ?", [
      newStatus,
      itemId,
    ]);
    await _addStock(
      x,
      item.name,
      source,
      item.quantity,
      unitGoodsCostVnd(item.unit_price_cny, order.exchange_rate),
    );
    await _recomputeOrderMoney(x, orderId);
    return { ok: true } as LineActionResult;
  });
}

// ---------- Danh sách đơn ----------

export type OrderListRow = {
  id: number;
  orderType: OrderType;
  status: OrderStatus;
  customerName: string;
  amountDue: number;
  deposit: number;
  /** Cần cho cảnh báo "sẽ trừ …¥" của thao tác hàng loạt (v6). */
  goodsTotalCny: number;
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
      goodsTotalCny: orders.goodsTotalCny,
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
      const terminal = isTerminalFor(r.orderType, r.status);
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
/**
 * Đếm đơn theo trạng thái từ danh sách ĐÃ có sẵn — không tự query.
 *
 * Trước đây hàm này tự gọi `listOrders()` riêng, nghĩa là Tổng quan (gọi
 * cả `listOrdersWithGaps()` lẫn hàm này trong cùng Promise.all) quét bảng
 * `orders` HAI LẦN mỗi lần tải trang — thừa một câu query không cần thiết
 * mỗi lần tải trang. Nhận `rows` từ nơi gọi đã fetch sẵn.
 */
export function countOrdersByStatus(
  rows: { status: OrderStatus }[],
): { status: OrderStatus; count: number }[] {
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

export async function listCustomersWithTotals(): Promise<CustomerListRow[]> {
  const rows = await raw.all<{
    id: number;
    name: string;
    phone: string | null;
    warning_flag: boolean;
    warning_reason: string | null;
    outstanding: number;
    order_count: number;
  }>(
    `SELECT c.id, c.name, c.phone, c.warning_flag, c.warning_reason,
            COALESCE(SUM(CASE WHEN ${openOrderSql("o")}
                              THEN o.amount_due ELSE 0 END), 0)::int AS outstanding,
            COUNT(o.id)::int AS order_count
       FROM customers c
       LEFT JOIN orders o ON o.customer_id = c.id
      GROUP BY c.id
      ORDER BY outstanding DESC, c.name`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    warningFlag: r.warning_flag === true,
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

export async function getInventoryItem(id: number) {
  return raw.get<{
    id: number;
    product_name: string;
    quantity: number;
    avg_cost: number;
    source: string;
  }>(
    "SELECT id, product_name, quantity, avg_cost, source FROM inventory WHERE id = ?",
    [id],
  );
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
export async function sellFromStock(
  input: SellFromStockInput,
): Promise<SellResult> {
  const inv = await getInventoryItem(input.inventoryId);
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

  return withTx(async (x) => {
    // Khách: có sẵn / mới / khách lẻ.
    let customerId = input.customerId ?? null;
    if (!customerId && input.newCustomer?.name) {
      const c = await x.get<{ id: number }>(
        "INSERT INTO customers(name, phone) VALUES(?, ?) RETURNING id",
        [input.newCustomer.name, input.newCustomer.phone ?? null],
      );
      customerId = c!.id;
    }
    if (!customerId) {
      const walkin = await x.get<{ id: number }>(
        "SELECT id FROM customers WHERE name = 'Khách lẻ'",
      );
      if (walkin) {
        customerId = walkin.id;
      } else {
        const created = await x.get<{ id: number }>(
          "INSERT INTO customers(name) VALUES('Khách lẻ') RETURNING id",
        );
        customerId = created!.id;
      }
    }

    const after = applyStockOut(
      { quantity: inv.quantity, avgCost: inv.avg_cost },
      input.quantity,
    );
    await x.run("UPDATE inventory SET quantity = ? WHERE id = ?", [
      after.quantity,
      inv.id,
    ]);

    const o = await x.get<{ id: number }>(
      `INSERT INTO orders
         (customer_id, order_type, status, exchange_rate, goods_total_cny,
          margin_vnd, shipping_fee, deposit, amount_due, sale_cost, status_changed_at)
       VALUES (?, 'ban_tu_kho', 'da_giao_khach', 1, ?, 0, 0, ?, ?, ?, ${NOW_EPOCH_SQL})
       RETURNING id`,
      [customerId, input.salePriceVnd, input.deposit, amountDue, saleCost],
    );
    const orderId = o!.id;

    await x.run(
      `INSERT INTO order_items(order_id, name, quantity, unit_price_cny)
       VALUES (?, ?, ?, ?)`,
      [orderId, inv.product_name, input.quantity, unitPrice],
    );
    await x.run(
      `INSERT INTO order_status_history(order_id, to_status, changed_by, note)
       VALUES (?, 'da_giao_khach', ?, 'Bán từ kho')`,
      [orderId, input.changedBy ?? null],
    );

    return { ok: true, orderId } as SellResult;
  });
}

/** Danh sách đơn kèm cờ "cần bổ sung" (v3-A). */
export async function listOrdersWithGaps(): Promise<
  (OrderListRow & { gaps: GapCode[] })[]
> {
  const rows = await listOrders();
  const meta = await raw.all<{
    id: number;
    orderType: OrderType;
    status: OrderStatus;
    customerId: number | null;
    shipStatus: ShipStatus;
    phone: string | null;
    address: string | null;
    unconfirmed: number;
    productPhotos: number;
  }>(
    `SELECT o.id                                         AS id,
            o.order_type                                 AS "orderType",
            o.status                                     AS status,
            o.customer_id                                AS "customerId",
            o.ship_status                                AS "shipStatus",
            c.phone                                      AS phone,
            c.address                                    AS address,
            (SELECT COUNT(*)::int FROM order_items i
              WHERE i.order_id = o.id AND i.cost_confirmed = false) AS unconfirmed,
            (SELECT COUNT(*)::int FROM photos p
              WHERE p.order_id = o.id AND p.label = 'product')      AS "productPhotos"
       FROM orders o LEFT JOIN customers c ON c.id = o.customer_id`,
  );

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
export async function getPnlData(
  year: number,
  month: number,
): Promise<{
  orders: PnlOrder[];
  expenses: PnlExpense[];
  bomDepositsVnd: number;
}> {
  const [from, to] = monthRange(year, month);

  const rows = await raw.all<
    Omit<PnlOrder, "costConfirmed"> & { costConfirmedRaw: boolean }
  >(
    `SELECT o.id                     AS id,
            o.order_type             AS "orderType",
            o.quoted_total_vnd       AS "quotedTotalVnd",
            o.shipping_fee           AS "shippingFee",
            o.goods_total_cny        AS "goodsTotalCny",
            o.exchange_rate          AS "sellRate",
            o.sale_cost              AS "saleCost",
            (SELECT l.rate_snapshot FROM cny_ledger l
              WHERE l.order_id = o.id AND l.kind = 'chi'
              ORDER BY l.id LIMIT 1)                        AS "costRate",
            (SELECT COALESCE(SUM(i.margin_vnd), 0)::int FROM order_items i
              WHERE i.order_id = o.id)                      AS "marginVnd",
            (SELECT COUNT(*) = 0 FROM order_items i
              WHERE i.order_id = o.id AND i.cost_confirmed = false) AS "costConfirmedRaw"
       FROM orders o
      WHERE EXISTS (SELECT 1 FROM order_status_history h
                     WHERE h.order_id = o.id AND h.to_status = 'hoan_tat'
                       AND h.changed_at >= ? AND h.changed_at < ?)`,
    [from, to],
  );

  const orders: PnlOrder[] = rows.map((r) => ({
    ...r,
    costConfirmed: r.costConfirmedRaw === true,
  }));

  const expenseRows = await raw.all<PnlExpense>(
    `SELECT amount_vnd AS "amountVnd", category, order_id AS "orderId"
       FROM expenses WHERE spent_at >= ? AND spent_at < ?`,
    [from, to],
  );

  // Cọc giữ được từ đơn chuyển sang khách bom trong tháng.
  const bom = (await raw.get<{ total: number }>(
    `SELECT COALESCE(SUM(p.amount_vnd), 0)::int AS total
       FROM payments p
      WHERE p.order_id IN (
            SELECT h.order_id FROM order_status_history h
             WHERE h.to_status = 'khach_bom'
               AND h.changed_at >= ? AND h.changed_at < ?)`,
    [from, to],
  ))!;

  return { orders, expenses: expenseRows, bomDepositsVnd: bom.total };
}

export async function getCashFlow(year: number, month: number) {
  const [from, to] = monthRange(year, month);

  const inflow = await raw.all<{ method: PaymentMethod; total: number }>(
    `SELECT method, COALESCE(SUM(amount_vnd), 0)::int AS total
       FROM payments WHERE paid_at >= ? AND paid_at < ? GROUP BY method`,
    [from, to],
  );

  const topups = (await raw.get<{ total: number }>(
    `SELECT COALESCE(SUM(vnd_paid), 0)::int AS total FROM cny_ledger
      WHERE kind = 'nap' AND created_at >= ? AND created_at < ?`,
    [from, to],
  ))!;

  const spend = await raw.all<{ method: PaymentMethod; total: number }>(
    `SELECT method, COALESCE(SUM(amount_vnd), 0)::int AS total
       FROM expenses WHERE spent_at >= ? AND spent_at < ? GROUP BY method`,
    [from, to],
  );

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

export async function getAssetSnapshot() {
  const wallet = await getWallet();
  const stock = (await raw.get<{ total: number }>(
    "SELECT COALESCE(SUM(quantity * avg_cost), 0)::int AS total FROM inventory",
  ))!;
  const receivable = (await raw.get<{ total: number }>(
    `SELECT COALESCE(SUM(o.amount_due), 0)::int AS total FROM orders o
      WHERE ${openOrderSql("o")}`,
  ))!;
  // Cọc của đơn CHƯA giao — tiền này nằm trong tài khoản nhưng chưa phải của mình.
  const heldDeposits = (await raw.get<{ total: number }>(
    `SELECT COALESCE(SUM(p.amount_vnd), 0)::int AS total FROM payments p
       JOIN orders o ON o.id = p.order_id
      WHERE ${openOrderSql("o", ["da_giao_khach"])}`,
  ))!;

  return {
    walletCny: wallet.balance,
    walletVnd: wallet.valueVnd,
    stockVnd: stock.total,
    receivableVnd: receivable.total,
    heldDepositsVnd: heldDeposits.total,
  };
}
