import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/auth";
import { addPhoto } from "@/db/queries";
import { PHOTO_LABELS, type PhotoLabel } from "@/lib/photos";
import { downsizeImage } from "@/lib/image";
import { uploadPhotoFile } from "@/lib/storage";

// sharp là native module → bắt buộc Node runtime, không chạy được trên edge.
export const runtime = "nodejs";
// Resize nhiều ảnh + đẩy lên Storage có thể vượt 10s mặc định của Hobby.
export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024; // 15MB

export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Chưa đăng nhập", { status: 401 });

  const form = await req.formData();
  const labelRaw = String(form.get("label") ?? "product");
  const label: PhotoLabel = (PHOTO_LABELS as readonly string[]).includes(
    labelRaw,
  )
    ? (labelRaw as PhotoLabel)
    : "product";
  const orderId = Number(form.get("orderId")) || null;
  const inventoryId = Number(form.get("inventoryId")) || null;
  const files = form
    .getAll("files")
    .filter((f): f is File => f instanceof File);

  if (files.length === 0)
    return Response.json({ ok: false, error: "Không có ảnh" }, { status: 400 });

  const ids: number[] = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    if (file.size > MAX_BYTES)
      return Response.json(
        { ok: false, error: "Ảnh quá lớn (giới hạn 15MB)" },
        { status: 400 },
      );
    const buf = Buffer.from(await file.arrayBuffer());
    const downsized = await downsizeImage(buf, file.type);
    const fname = `${Date.now()}-${randomBytes(6).toString("hex")}.${downsized.ext}`;
    await uploadPhotoFile(fname, downsized.buffer, downsized.mimeType);
    ids.push(await addPhoto({ filePath: fname, label, orderId, inventoryId }));
  }

  if (ids.length === 0)
    return Response.json(
      { ok: false, error: "Không có ảnh hợp lệ" },
      { status: 400 },
    );
  return Response.json({ ok: true, ids });
}
