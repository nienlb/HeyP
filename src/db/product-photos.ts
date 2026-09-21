import "server-only";
import { randomBytes } from "node:crypto";
import { raw } from "./raw";
import { copyPhotoFile } from "@/lib/storage";

/**
 * Tách khỏi src/db/products.ts CÓ CHỦ ĐÍCH.
 *
 * `@/lib/storage` khởi tạo Supabase client ngay ở cấp module. Mà `queries.ts`
 * import `products.ts` (cho suggestFromCatalog), nên để hàm này ở đó thì MỌI
 * trang chạm queries.ts đều kéo theo Supabase client vào đồ thị module —
 * trước v9-A chỉ route upload và route ảnh mới nạp nó. Chỉ nơi thật sự chép
 * ảnh mới cần import file này.
 */

/** Chép một file ảnh sang tên mới. null = chép hỏng (bỏ qua ảnh đó). */
async function copyOneFile(filePath: string): Promise<string | null> {
  const dot = filePath.lastIndexOf(".");
  const ext = dot > 0 ? filePath.slice(dot) : "";
  const target = `${Date.now()}-${randomBytes(6).toString("hex")}${ext}`;
  try {
    await copyPhotoFile(filePath, target);
    return target;
  } catch {
    return null;
  }
}

/**
 * Chép toàn bộ ảnh của một mẫu thành các dòng `photos` MỚI, chưa gắn vào đâu.
 *
 * Trả về id các dòng mới để `createOrder` gắn chúng TRONG transaction tạo đơn
 * (NewOrderItemInput.photoIds). Đó là lý do chúng được để mồ côi ở đây: job
 * dọn ảnh mồ côi có ân hạn 24h nên không cướp ảnh của form đang mở.
 *
 * File hỏng ở giữa thì bỏ qua ảnh đó và chép tiếp — mất một ảnh trong đơn mới
 * thì khó chịu, nhưng chặn cả việc tạo đơn vì một ảnh thì tệ hơn.
 */
export async function copyProductPhotos(productId: number): Promise<number[]> {
  const rows = await raw.all<{ id: number; filePath: string }>(
    `SELECT id, file_path AS "filePath" FROM photos
      WHERE product_id = ? ORDER BY id`,
    [productId],
  );

  const newIds: number[] = [];
  for (const r of rows) {
    const target = await copyOneFile(r.filePath);
    if (!target) continue;
    const inserted = await raw.get<{ id: number }>(
      `INSERT INTO photos(file_path, label, order_id, inventory_id, product_id)
       VALUES(?, 'product', NULL, NULL, NULL) RETURNING id`,
      [target],
    );
    if (inserted) newIds.push(inserted.id);
  }
  return newIds;
}

/**
 * v9-C: "★ Lưu vào danh mục" từ Sheet món — CHÉP ảnh của món sang mẫu mới.
 *
 * Chép chứ không dùng chung dòng photos: ảnh của món sẽ gắn vào đơn, mà
 * photos có ON DELETE CASCADE tới order_items — dùng chung thì xoá đơn là
 * cướp mất ảnh của danh mục. Chép thẳng file đã nén, không nén lại.
 *
 * Dòng mới mang product_id ngay lúc INSERT nên job dọn ảnh mồ côi (điều kiện
 * product_id IS NULL) không đụng tới. Chỉ nhận ảnh nhãn 'product'.
 */
export async function copyPhotosToProduct(
  productId: number,
  photoIds: number[],
): Promise<{ copied: number; total: number }> {
  const ids = [...new Set(photoIds)].filter(
    (n) => Number.isInteger(n) && n > 0,
  );
  if (ids.length === 0) return { copied: 0, total: 0 };
  const holes = ids.map(() => "?").join(", ");
  const rows = await raw.all<{ filePath: string }>(
    `SELECT file_path AS "filePath" FROM photos
      WHERE id IN (${holes}) AND label = 'product' ORDER BY id`,
    ids,
  );

  let copied = 0;
  for (const r of rows) {
    const target = await copyOneFile(r.filePath);
    if (!target) continue;
    await raw.run(
      `INSERT INTO photos(file_path, label, order_id, inventory_id, product_id)
       VALUES(?, 'product', NULL, NULL, ?)`,
      [target, productId],
    );
    copied++;
  }
  return { copied, total: ids.length };
}
