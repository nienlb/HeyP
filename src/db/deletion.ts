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

/**
 * Lý do bị chặn, ném ra để cuộn ngược transaction rồi trả về cho người dùng.
 *
 * Phải ném chứ không return: việc kiểm tra nằm TRONG transaction (xem
 * deleteOrderCascade), và cách duy nhất để thoát khỏi `withTx` mà không
 * commit là ném ra ngoài.
 */
class BlockedError extends Error {}

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
 * KIỂM TRA NẰM TRONG TRANSACTION, SAU KHI ĐÃ KHOÁ DÒNG ĐƠN (`FOR UPDATE`).
 * Kiểm ngoài transaction thì có kẽ hở: giữa lúc kiểm và lúc xoá, người kia
 * có thể vừa thu tiền cho đúng đơn đó — `payments` gắn khoá ngoại ON DELETE
 * CASCADE nên phiếu thu vừa tạo sẽ bị xoá theo mà không ai hay. Khoá dòng
 * `orders` chặn được đúng tình huống này vì `addPayment` cũng ghi vào dòng
 * đó (syncOrderDeposit → UPDATE orders SET deposit).
 *
 * File ảnh trên Supabase Storage KHÔNG nằm trong cascade — phải đọc file_path
 * TRƯỚC khi xoá, rồi xoá file SAU khi transaction commit.
 */
export async function deleteOrderCascade(
  orderId: number,
  deletedBy: string,
): Promise<DeleteResult> {
  let photoPaths: string[] = [];

  try {
    photoPaths = await withTx(async (x) => {
      // Khoá dòng đơn TRƯỚC mọi thứ khác: từ đây tới lúc commit, không ai
      // thu tiền hay đổi trạng thái đơn này được nữa.
      const locked = await x.get<{ id: number }>(
        "SELECT id FROM orders WHERE id = ? FOR UPDATE",
        [orderId],
      );
      if (!locked) throw new BlockedError("Không tìm thấy đơn.");

      const facts = await x.get<{
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
      if (!facts) throw new BlockedError("Không tìm thấy đơn.");

      const check = canDeleteOrder(facts as OrderDeleteFacts);
      if (!check.ok) throw new BlockedError(check.reason);

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
      // Đọc tên file ảnh trước khi xoá — xoá xong thì không còn đường lấy.
      const photos = await x.all<{ filePath: string }>(
        `SELECT file_path AS "filePath" FROM photos WHERE order_id = ?`,
        [orderId],
      );
      const paths = photos.map((p) => p.filePath);

      await logDeletion(x, "order", orderId, deletedBy, {
        order,
        items,
        history,
        photoPaths: paths,
      });

      await x.run("DELETE FROM orders WHERE id = ?", [orderId]);
      return paths;
    });
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }

  // Dữ liệu đã sạch; file lỗi thì chỉ còn ảnh mồ côi trong bucket, không chặn.
  for (const filePath of photoPaths) {
    try {
      await deletePhotoFile(basename(filePath));
    } catch {
      // bỏ qua có chủ đích
    }
  }

  return { ok: true };
}

/**
 * Xoá một khách. Cũng khoá dòng khách rồi mới đếm đơn, cùng lý do như
 * deleteOrderCascade — tránh xoá đúng lúc người kia vừa lên đơn cho khách đó.
 */
export async function deleteCustomerRow(
  customerId: number,
  deletedBy: string,
): Promise<DeleteResult> {
  try {
    await withTx(async (x) => {
      const customer = await x.get<Record<string, unknown>>(
        "SELECT * FROM customers WHERE id = ? FOR UPDATE",
        [customerId],
      );
      if (!customer) throw new BlockedError("Không tìm thấy khách.");

      const counted = await x.get<{ orderCount: number }>(
        `SELECT COUNT(*)::int AS "orderCount" FROM orders WHERE customer_id = ?`,
        [customerId],
      );
      const check = canDeleteCustomer({ orderCount: counted?.orderCount ?? 0 });
      if (!check.ok) throw new BlockedError(check.reason);

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
