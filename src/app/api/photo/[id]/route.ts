import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { getSession } from "@/lib/auth";
import { config } from "@/lib/config";
import { getPhoto } from "@/db/queries";
import { contentTypeFromName } from "@/lib/photos";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Chưa đăng nhập", { status: 401 });

  const { id } = await ctx.params;
  const photo = getPhoto(Number(id));
  if (!photo) return new Response("Không tìm thấy ảnh", { status: 404 });

  // Chống path traversal: chỉ dùng tên file cơ sở.
  const dir = resolve(process.cwd(), config.uploadsPath);
  const filePath = join(dir, basename(photo.file_path));
  if (!existsSync(filePath))
    return new Response("File ảnh không tồn tại", { status: 404 });

  const buf = await readFile(filePath);
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
