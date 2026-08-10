import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { getSession } from "@/lib/auth";
import { config } from "@/lib/config";
import { addPhoto } from "@/db/queries";
import { extFromContentType } from "@/lib/photos";
import { readZaloImage } from "@/lib/gemini";

const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Đọc ảnh chốt đơn Zalo: lưu ảnh (nhãn zalo_confirm, chưa gắn đơn) + gọi Gemini.
 * Trả về dữ liệu điền sẵn form + photoId (để gắn vào đơn khi lưu).
 * Gemini lỗi vẫn trả photoId để ảnh đính kèm được, form nhập tay bình thường.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Chưa đăng nhập", { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.type.startsWith("image/"))
    return Response.json({ ok: false, error: "Chưa có ảnh" }, { status: 400 });
  if (file.size > MAX_BYTES)
    return Response.json(
      { ok: false, error: "Ảnh quá lớn (giới hạn 15MB)" },
      { status: 400 },
    );

  const buf = Buffer.from(await file.arrayBuffer());

  // Lưu ảnh trước (đính nhãn "Ảnh chốt đơn Zalo", chưa gắn đơn).
  const dir = resolve(process.cwd(), config.uploadsPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const ext =
    extFromContentType(file.type) ??
    file.name.split(".").pop()?.toLowerCase() ??
    "jpg";
  const fname = `${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
  await writeFile(join(dir, fname), buf);
  const photoId = addPhoto({ filePath: fname, label: "zalo_confirm" });

  // Gọi Gemini đọc ảnh.
  const result = await readZaloImage(buf.toString("base64"), file.type);
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error, photoId });
  }
  return Response.json({ ok: true, data: result.data, photoId });
}
