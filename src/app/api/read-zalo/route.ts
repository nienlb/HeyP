import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { getSession } from "@/lib/auth";
import { config } from "@/lib/config";
import { addPhoto } from "@/db/queries";
import type { PhotoLabel } from "@/lib/photos";
import { readZaloBatch } from "@/lib/gemini";
import { downsizeImage } from "@/lib/image";
import type { ImageKind } from "@/lib/zalo-extract";

const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Nhãn ảnh tương ứng với loại AI phân ra.
 *
 * `thong_tin_khach` cũng dùng nhãn `zalo_confirm`: cả hai đều là ảnh chụp làm
 * bằng chứng từ Zalo, và PHOTO_LABELS không có nhãn riêng cho thông tin khách.
 * Thêm nhãn mới chỉ để phân biệt hai thứ dùng chung một mục đích là thừa.
 */
const LABEL_OF: Record<ImageKind, PhotoLabel> = {
  chot_don: "zalo_confirm",
  thong_tin_khach: "zalo_confirm",
  san_pham: "product",
};

/**
 * Đọc nhóm ảnh thả vào từ Zalo: lưu từng ảnh (chưa gắn đơn) + gọi Gemini phân
 * loại và trích dữ liệu đơn trong MỘT request.
 *
 * Gemini lỗi vẫn trả photoId để ảnh đính kèm được, form nhập tay bình thường —
 * AI là tiện ích, không phải chốt chặn.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Chưa đăng nhập", { status: 401 });

  const form = await req.formData();
  // `files` là đường mới (nhiều ảnh); `file` giữ lại cho form cũ một ảnh.
  const picked = [...form.getAll("files"), ...form.getAll("file")];
  const files = picked.filter(
    (f): f is File => f instanceof File && f.type.startsWith("image/"),
  );

  if (files.length === 0)
    return Response.json({ ok: false, error: "Chưa có ảnh" }, { status: 400 });

  const tooBig = files.find((f) => f.size > MAX_BYTES);
  if (tooBig)
    return Response.json(
      { ok: false, error: `Ảnh "${tooBig.name}" quá lớn (giới hạn 15MB)` },
      { status: 400 },
    );

  const buffers = await Promise.all(
    files.map(async (f) => Buffer.from(await f.arrayBuffer())),
  );

  // Downsize TRƯỚC khi gửi Gemini và lưu đĩa — ảnh gốc chụp điện thoại
  // thường vài MB; downsize giảm cả thời gian gọi AI lẫn dung lượng lưu trữ.
  const downsized = await Promise.all(
    buffers.map((buf, i) => downsizeImage(buf, files[i].type)),
  );

  // Gọi Gemini TRƯỚC khi lưu, để biết nhãn nào cho ảnh nào.
  const result = await readZaloBatch(
    downsized.map((d) => ({
      base64: d.buffer.toString("base64"),
      mimeType: d.mimeType,
    })),
  );

  // AI hỏng: đoán theo thói quen thả ảnh — ảnh chốt đơn thường đứng đầu.
  // Người dùng sửa nhãn ở màn xác nhận nếu sai.
  const kinds: ImageKind[] = result.ok
    ? result.data.images.map((im) => im.kind)
    : files.map((_, i) => (i === 0 ? "chot_don" : "san_pham"));

  const dir = resolve(process.cwd(), config.uploadsPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const photos: { id: number; kind: ImageKind; name: string }[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fname = `${Date.now()}-${randomBytes(6).toString("hex")}.${downsized[i].ext}`;
    await writeFile(join(dir, fname), downsized[i].buffer);
    const kind = kinds[i] ?? "san_pham";
    photos.push({
      id: addPhoto({ filePath: fname, label: LABEL_OF[kind] }),
      kind,
      name: file.name,
    });
  }

  // photoId: giữ cho form một-ảnh hiện tại còn chạy tới khi màn thả ảnh mới
  // thay thế nó. Lấy ảnh chốt đơn đầu tiên, không có thì lấy ảnh đầu.
  const photoId = (photos.find((p) => p.kind === "chot_don") ?? photos[0]).id;

  if (!result.ok) {
    return Response.json({ ok: false, error: result.error, photos, photoId });
  }
  return Response.json({ ok: true, data: result.data, photos, photoId });
}
