import { basename } from "node:path";
import { getSession } from "@/lib/auth";
import { getPhoto } from "@/db/queries";
import { contentTypeFromName, thumbFileName } from "@/lib/photos";
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

  const url = new URL(req.url);
  const wantsDownload = url.searchParams.has("download");
  // Tải về thì luôn lấy bản chính — không ai muốn tải bản nhỏ 400px.
  const wantsThumb = url.searchParams.get("size") === "thumb" && !wantsDownload;

  // Chống path traversal: chỉ dùng tên file cơ sở.
  const mainName = basename(photo.file_path);

  let name = mainName;
  let buf: Buffer | null = null;

  if (wantsThumb) {
    name = thumbFileName(mainName);
    buf = await downloadPhotoFile(name);
    // Ảnh cũ (lưu trước khi có bản nhỏ) và GIF không có bản nhỏ → lùi về bản
    // chính. Tốn băng thông hơn nhưng không bao giờ vỡ ảnh.
    if (!buf) name = mainName;
  }
  if (!buf) buf = await downloadPhotoFile(mainName);
  if (!buf) return new Response("File ảnh không tồn tại", { status: 404 });

  const headers = new Headers({
    "Content-Type": contentTypeFromName(name),
    // Nội dung của một photo.id là bất biến — file mới thì tạo bản ghi mới,
    // không bao giờ ghi đè. Nên cache vĩnh viễn ở trình duyệt và không cần
    // hỏi lại lần nào nữa. Vẫn `private`: ảnh không được cache ở CDN dùng
    // chung, đúng với quyết định giữ proxy qua route đã xác thực.
    "Cache-Control": "private, max-age=31536000, immutable",
  });
  if (wantsDownload) {
    headers.set(
      "Content-Disposition",
      `attachment; filename="${mainName}"`,
    );
  }
  return new Response(new Uint8Array(buf), { headers });
}
