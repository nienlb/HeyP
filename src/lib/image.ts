import "server-only";
import sharp from "sharp";
import { extFromContentType } from "./photos";

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 82;

export type DownsizedImage = {
  buffer: Buffer;
  mimeType: string;
  ext: string;
};

/**
 * Giảm kích thước ảnh trước khi lưu đĩa và gửi Gemini.
 *
 * Ảnh chụp màn hình/điện thoại gốc thường 2–5MB — sau bước này còn vài trăm
 * KB, vừa giảm dung lượng lưu trữ vừa giảm thời gian gọi AI (payload nhỏ
 * hơn, và mô hình vision xử lý ảnh phân giải thấp nhanh hơn). Luôn xuất
 * JPEG để đơn giản hoá đường đi phía sau (một định dạng lưu, một content
 * type) — ảnh chốt đơn/thông tin khách là ảnh chụp màn hình văn bản, không
 * cần giữ độ nét gốc hay kênh alpha của PNG.
 */
export async function downsizeImage(
  buf: Buffer,
  mimeType: string,
): Promise<DownsizedImage> {
  // GIF có thể là ảnh động — sharp sẽ chỉ lấy khung đầu, làm hỏng nội dung.
  // Không downsize, giữ nguyên bản gốc.
  if (mimeType === "image/gif") {
    return { buffer: buf, mimeType, ext: extFromContentType(mimeType) ?? "gif" };
  }

  try {
    const out = await sharp(buf)
      .rotate() // đọc EXIF orientation rồi xoay đúng chiều trước khi resize
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
    return { buffer: out, mimeType: "image/jpeg", ext: "jpg" };
  } catch {
    // sharp không đọc được (định dạng lạ, HEIC thiếu codec, file hỏng) →
    // dùng nguyên bản gốc. Đây là bước tối ưu, không phải điều kiện bắt buộc
    // để tải ảnh lên được.
    return { buffer: buf, mimeType, ext: extFromContentType(mimeType) ?? "jpg" };
  }
}
