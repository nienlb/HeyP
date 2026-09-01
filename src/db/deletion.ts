import "server-only";
import { basename } from "node:path";
import { NOW_EPOCH_SQL, raw, withTx, type Exec } from "./raw";
import { deletePhotoFile } from "@/lib/storage";
import {
  canDeleteCustomer,
  canDeleteOrder,
  type OrderDeleteFacts,
} from "@/lib/deletion";
import type { OrderStatus } from "@/lib/order-status";

export type DeleteResult = { ok: true } | { ok: false; reason: string };

/** Ghi nhật ký. Gọi BÊN TRONG transaction đang mở — dùng `x`, không dùng `raw`. */
async function logDeletion(
  x: Exec,
  entity: "order" | "customer",
  entityId: number,
  deletedBy: string,
  snapshot: unknown,
): Promise<void> {
  await x.run(
    `INSERT INTO deletion_log (entity, entity_id, deleted_by, deleted_at, snapshot)
     VALUES (?, ?, ?, ${NOW_EPOCH_SQL}, ?)`,
    [entity, entityId, deletedBy, JSON.stringify(snapshot)],
  );
}

/**
 * Xoá cứng một đơn. Cascade của FK tự dọn order_items, photos,
 * order_status_history, order_packages, payments.
 *
 * File ảnh trên Supabase Storage KHÔNG nằm trong cascade — phải đọc file_path
 * TRƯỚC khi xoá, rồi xoá file SAU khi transaction commit.
 */
export async function deleteOrderCascade(
  orderId: number,
  deletedBy: string,
): Promise<DeleteResult> {
  const facts = await raw.get<{
    status: OrderStatus;
    cnySpent: number;
    paymentCount: number;
    expenseCount: number;
  }>(
    `SELECT o.status AS status,
            COALESCE((SELECT SUM(-l.cny_delta) FROM cny_ledger l
                       WHERE l.order_id = o.id
                         AND l.kind IN ('chi','dieu_chinh')), 0)  AS "cnySpent",
            (SELECT COUNT(*)::int FROM payments p
              WHERE p.order_id = o.id)                            AS "paymentCount",
            (SELECT COUNT(*)::int FROM expenses e
              WHERE e.order_id = o.id)                            AS "expenseCount"
       FROM orders o WHERE o.id = ?`,
    [orderId],
  );
  if (!facts) return { ok: false, reason: "Không tìm thấy đơn." };

  const check = canDeleteOrder(facts as OrderDeleteFacts);
  if (!check.ok) return check;

  // Đọc tên file ảnh trước — sau khi xoá hàng thì không còn đường lấy.
  const photoRows = await raw.all<{ filePath: string }>(
    `SELECT file_path AS "filePath" FROM photos WHERE order_id = ?`,
    [orderId],
  );

  try {
    await withTx(async (x) => {
      const order = await x.get<Record<string, unknown>>(
        "SELECT * FROM orders WHERE id = ?",
        [orderId],
      );
      const items = await x.all<Record<string, unknown>>(
        "SELECT * FROM order_items WHERE order_id = ? ORDER BY id",
        [orderId],
      );
      const history = await x.all<Record<string, unknown>>(
        "SELECT * FROM order_status_history WHERE order_id = ? ORDER BY id",
        [orderId],
      );

      await logDeletion(x, "order", orderId, deletedBy, {
        order,
        items,
        history,
        photoPaths: photoRows.map((p) => p.filePath),
      });

      await x.run("DELETE FROM orders WHERE id = ?", [orderId]);
    });
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }

  // Dữ liệu đã sạch; file lỗi thì chỉ còn ảnh mồ côi trong bucket, không chặn.
  for (const p of photoRows) {
    try {
      await deletePhotoFile(basename(p.filePath));
    } catch {
      // bỏ qua có chủ đích
    }
  }

  return { ok: true };
}

export async function deleteCustomerRow(
  customerId: number,
  deletedBy: string,
): Promise<DeleteResult> {
  const facts = await raw.get<{ orderCount: number }>(
    `SELECT (SELECT COUNT(*)::int FROM orders o WHERE o.customer_id = ?)
              AS "orderCount"`,
    [customerId],
  );
  const check = canDeleteCustomer({ orderCount: facts?.orderCount ?? 0 });
  if (!check.ok) return check;

  try {
    await withTx(async (x) => {
      const customer = await x.get<Record<string, unknown>>(
        "SELECT * FROM customers WHERE id = ?",
        [customerId],
      );
      if (!customer) throw new Error("Không tìm thấy khách.");
      await logDeletion(x, "customer", customerId, deletedBy, { customer });
      await x.run("DELETE FROM customers WHERE id = ?", [customerId]);
    });
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
  return { ok: true };
}

export type DeletionLogRow = {
  id: number;
  entity: "order" | "customer";
  entityId: number;
  deletedBy: string;
  deletedAt: Date;
  snapshot: string;
};

export async function listDeletionLog(limit = 200): Promise<DeletionLogRow[]> {
  const rows = await raw.all<{
    id: number;
    entity: "order" | "customer";
    entityId: number;
    deletedBy: string;
    deletedAt: string | number;
    snapshot: string;
  }>(
    `SELECT id, entity, entity_id AS "entityId", deleted_by AS "deletedBy",
            deleted_at AS "deletedAt", snapshot
       FROM deletion_log ORDER BY id DESC LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({
    ...r,
    deletedAt: new Date(Number(r.deletedAt) * 1000),
  }));
}
