import "server-only";
import { createClient } from "@supabase/supabase-js";
import { config } from "./config";
import { thumbFileName } from "./photos";

/**
 * Ảnh nằm trên Supabase Storage ở bucket private. Dùng service_role key nên
 * module này CHỈ được import từ code chạy trên server — key này bỏ qua mọi
 * luật RLS, lộ ra client là mất toàn quyền dữ liệu.
 */
const client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const bucket = () => client.storage.from(config.storageBucket);

export async function uploadPhotoFile(
  fileName: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const { error } = await bucket().upload(fileName, body, {
    contentType,
    upsert: false,
  });
  if (error) throw new Error(`Không lưu được ảnh: ${error.message}`);
}

export async function downloadPhotoFile(
  fileName: string,
): Promise<Buffer | null> {
  const { data, error } = await bucket().download(fileName);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Xoá ảnh: gỡ CẢ bản chính lẫn bản nhỏ.
 *
 * `remove` của Supabase không báo lỗi khi file không tồn tại, nên gọi kèm
 * tên bản nhỏ là an toàn kể cả với ảnh cũ (lưu trước khi có bản nhỏ) hoặc
 * GIF (không sinh bản nhỏ).
 */
export async function deletePhotoFile(fileName: string): Promise<void> {
  await bucket().remove([fileName, thumbFileName(fileName)]);
}

/**
 * Chép một ảnh sang tên file mới, CẢ bản chính lẫn bản nhỏ `_t`.
 *
 * Dùng `.copy()` của Supabase — chép thẳng trên server lưu trữ, không tải về
 * app rồi đẩy lên lại. Với ảnh vài trăm KB thì đó là khác biệt giữa vài chục
 * ms và vài giây, mà `maxDuration` của Hobby thì có hạn.
 *
 * Vì sao phải CHÉP chứ không dùng chung dòng photos: `photos` gắn khoá ngoại
 * ON DELETE CASCADE tới `order_items` — dùng chung thì xoá một đơn sẽ cướp
 * mất ảnh của danh mục.
 *
 * Bản nhỏ hỏng thì KHÔNG chặn: route ảnh tự lùi về bản chính khi thiếu. Mất
 * bản nhỏ chỉ tốn băng thông, mất bản chính mới là mất dữ liệu.
 */
export async function copyPhotoFile(
  fromFileName: string,
  toFileName: string,
): Promise<void> {
  const { error } = await bucket().copy(fromFileName, toFileName);
  if (error) throw new Error(`Không chép được ảnh: ${error.message}`);
  try {
    const thumb = await bucket().copy(
      thumbFileName(fromFileName),
      thumbFileName(toFileName),
    );
    void thumb;
  } catch {
    // bỏ qua có chủ đích
  }
}
