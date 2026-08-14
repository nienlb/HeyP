import { basename } from "node:path";
import { getSession } from "@/lib/auth";
import { getPhoto } from "@/db/queries";
import { contentTypeFromName } from "@/lib/photos";
import { downloadPhotoFile } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Chưa đăng nhập", { status: 401 });

  const { id } = await ctx.params;
  const photo = await getPhoto(Number(id));
  if (!photo) return new Response("Không tìm thấy ảnh", { status: 404 });

  // Chống path traversal: chỉ dùng tên file cơ sở.
  const buf = await downloadPhotoFile(basename(photo.file_path));
  if (!buf) return new Response("File ảnh không tồn tại", { status: 404 });

  const headers = new Headers({
    "Content-Type": contentTypeFromName(photo.file_path),
    "Cache-Control": "private, max-age=3600",
  });
  if (new URL(req.url).searchParams.has("download")) {
    headers.set(
      "Content-Disposition",
      `attachment; filename="${photo.file_path}"`,
    );
  }
  return new Response(new Uint8Array(buf), { headers });
}
