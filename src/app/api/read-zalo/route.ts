import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/auth";
import { addPhoto } from "@/db/queries";
import type { PhotoLabel } from "@/lib/photos";
import { readZaloBatch } from "@/lib/gemini";
import { prepareForAi, prepareForStorage } from "@/lib/image";
import { thumbFileName } from "@/lib/photos";
import { uploadPhotoFile } from "@/lib/storage";
import type { ImageKind } from "@/lib/zalo-extract";

// sharp là native module → bắt buộc Node runtime, không chạy được trên edge.
export const runtime = "nodejs";
// Gemini đọc ảnh thường mất 5-20s, cộng resize + upload — vượt xa 10s mặc định.
export const maxDuration = 60;

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

  // Bản gửi AI KHÁC bản đem lưu: gửi AI cần độ nét để đọc chữ cho chính xác,
  // bản lưu cần nhẹ. Xem hai hàm trong src/lib/image.ts.
  const forAi = await Promise.all(
    buffers.map((buf, i) => prepareForAi(buf, files[i].type)),
  );

  // Gọi Gemini TRƯỚC khi lưu, để biết nhãn nào cho ảnh nào — nhãn quyết định
  // độ phân giải bản lưu (ảnh chốt đơn là chữ, giữ nét hơn ảnh sản phẩm).
  const result = await readZaloBatch(
    forAi.map((d) => ({
      base64: d.buffer.toString("base64"),
      mimeType: d.mimeType,
    })),
  );

  // AI hỏng: đoán theo thói quen thả ảnh — ảnh chốt đơn thường đứng đầu.
  // Người dùng sửa nhãn ở màn xác nhận nếu sai.
  const kinds: ImageKind[] = result.ok
    ? result.data.images.map((im) => im.kind)
    : files.map((_, i) => (i === 0 ? "chot_don" : "san_pham"));

  const photos: { id: number; kind: ImageKind; name: string }[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const kind = kinds[i] ?? "san_pham";
    const label = LABEL_OF[kind];

    // Nén lại TỪ ẢNH GỐC (không phải từ bản đã nén cho AI) — nén chồng nén
    // hai lần làm ảnh nhoè mà chẳng nhỏ thêm bao nhiêu.
    const { main, thumb } = await prepareForStorage(buffers[i], file.type, label);
    const fname = `${Date.now()}-${randomBytes(6).toString("hex")}.${main.ext}`;

    await uploadPhotoFile(fname, main.buffer, main.mimeType);
    if (thumb) {
      try {
        await uploadPhotoFile(thumbFileName(fname), thumb.buffer, thumb.mimeType);
      } catch {
        // Bản nhỏ hỏng không chặn luồng — route ảnh tự lùi về bản chính.
      }
    }

    photos.push({
      id: await addPhoto({ filePath: fname, label }),
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
