import "server-only";
import { NOW_EPOCH_SQL, raw } from "./raw";
import { entityOf } from "@/lib/activity-codes";

export type ActivityRow = {
  id: number;
  actor: string;
  action: string;
  entity: string;
  entityId: number | null;
  detail: string | null;
  createdAt: number;
};

/**
 * Ghi một dòng nhật ký.
 *
 * BA QUY TẮC, đừng đổi mà không đọc spec v8-C mục 8:
 *
 * 1. Gọi SAU khi thao tác nghiệp vụ đã thành công.
 * 2. Gọi NGOÀI transaction — không bao giờ đặt trong `withTx`.
 * 3. NUỐT LỖI. Ghi nhật ký hỏng thì mất một dòng; ghi nhật ký ném lỗi trong
 *    transaction thì rollback cả việc thu tiền. Một nhật ký kiểm toán chặn
 *    được nghiệp vụ tiền thì tệ hơn một nhật ký thủng lỗ chỗ.
 *
 * `deletion_log` thì NGƯỢC LẠI — nó ở trong transaction, vì nó là bản chụp
 * để khôi phục chứ không phải dòng thời gian. Hai bảng khác mục đích.
 */
export async function logActivity(input: {
  actor: string;
  action: string;
  entityId?: number | null;
  detail?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await raw.run(
      `INSERT INTO activity_log (actor, action, entity, entity_id, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ${NOW_EPOCH_SQL})`,
      [
        input.actor,
        input.action,
        entityOf(input.action),
        input.entityId ?? null,
        input.detail ? JSON.stringify(input.detail) : null,
      ],
    );
  } catch (e) {
    // Nuốt có chủ đích — xem quy tắc 3 ở trên.
    console.error("logActivity hỏng:", input.action, e);
  }
}

export async function listActivity(opts: {
  limit: number;
  actor?: string;
  entity?: string;
}): Promise<ActivityRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.actor) {
    where.push("actor = ?");
    params.push(opts.actor);
  }
  if (opts.entity) {
    where.push("entity = ?");
    params.push(opts.entity);
  }
  params.push(opts.limit);

  return raw.all<ActivityRow>(
    `SELECT id, actor, action, entity,
            entity_id  AS "entityId",
            detail,
            created_at AS "createdAt"
       FROM activity_log
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY created_at DESC, id DESC
      LIMIT ?`,
    params,
  );
}

/** Danh sách người từng có hoạt động — dùng dựng chip lọc. */
export async function listActivityActors(): Promise<string[]> {
  const rows = await raw.all<{ actor: string }>(
    "SELECT DISTINCT actor FROM activity_log ORDER BY actor",
  );
  return rows.map((r) => r.actor);
}

/** Xoá dòng cũ hơn `days` ngày. Trả về số dòng đã xoá. */
export async function purgeOldActivity(days: number): Promise<number> {
  const rows = await raw.all<{ id: number }>(
    `DELETE FROM activity_log
      WHERE created_at < ${NOW_EPOCH_SQL} - ?
      RETURNING id`,
    [days * 86400],
  );
  return rows.length;
}
