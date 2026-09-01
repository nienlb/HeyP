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
