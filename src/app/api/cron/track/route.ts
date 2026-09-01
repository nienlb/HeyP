import { basename } from "node:path";
import { getSession } from "@/lib/auth";
import {
  deleteOrphanPhotoRows,
  listOrphanPhotos,
  runTrackingSweep,
} from "@/db/queries";
import { deletePhotoFile } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Trần mỗi lượt để không chạm maxDuration khi có nhiều ảnh mồ côi tồn đọng. */
const ORPHAN_BATCH = 100;

/**
 * Dọn ảnh đã tải lên nhưng không gắn được vào đâu (người dùng bỏ dở màn tạo
 * đơn). Xoá file trước, xoá dòng DB sau — thứ tự này để nếu xoá file hỏng thì
 * dòng DB còn lại, lượt sau dọn tiếp; ngược lại sẽ mất dấu file và nó nằm
 * trên Storage vĩnh viễn.
 */
async function sweepOrphanPhotos(): Promise<{ orphanPhotosDeleted: number }> {
  const orphans = (await listOrphanPhotos()).slice(0, ORPHAN_BATCH);
  const done: number[] = [];

  for (const p of orphans) {
    try {
      await deletePhotoFile(basename(p.filePath));
      done.push(p.id);
    } catch {
      // Storage lỗi tạm → để lượt sau, đừng xoá dòng DB kẻo mất dấu file.
    }
  }

  await deleteOrphanPhotoRows(done);
  return { orphanPhotosDeleted: done.length };
}

/**
 * Kích hoạt tra tracking (cho cron ngoài khi lên VPS, hoặc gọi tay).
 * Cho phép nếu đã đăng nhập, HOẶC có ?secret= khớp CRON_SECRET.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  const url = new URL(req.url);
  const secret =
    url.searchParams.get("secret") ?? req.headers.get("x-cron-secret");
  const configured = process.env.CRON_SECRET;
  const authed = Boolean(session) || (Boolean(configured) && secret === configured);
  if (!authed) return new Response("Unauthorized", { status: 401 });

  const result = await runTrackingSweep();

  // Dọn ảnh mồ côi đi nhờ cùng lịch cron 4h — không đáng dựng workflow riêng.
  // Hỏng ở đây không được làm hỏng kết quả tra tracking.
  let photos = { orphanPhotosDeleted: 0 };
  try {
    photos = await sweepOrphanPhotos();
  } catch {
    // bỏ qua có chủ đích
  }

  return Response.json({ ok: true, ...result, ...photos });
}
