import "server-only";
import sharp from "sharp";
import { extFromContentType, type PhotoLabel } from "./photos.ts";

/**
 * Hai đường xử lý ảnh, KHÁC MỤC TIÊU nên khác tham số — đừng gộp lại:
 *
 *  - `prepareForAi`   : tối ưu cho Gemini ĐỌC CHỮ. Giữ độ phân giải cao và
 *                       dùng JPEG. Nén thêm ở đây là ăn vào độ chính xác OCR,
 *                       không tiết kiệm được gì (ảnh không lưu lại).
 *  - `prepareForStorage`: tối ưu cho DUNG LƯỢNG LƯU + BĂNG THÔNG. WebP, cạnh
 *                       ngắn hơn, kèm một bản nhỏ cho danh sách.
 */

// --- Đường AI: giữ nguyên hành vi cũ, đừng đụng vào nếu không đo lại OCR ---
const AI_MAX_DIMENSION = 1600;
const AI_JPEG_QUALITY = 82;

// --- Đường lưu trữ ---
/**
 * v9-C: người dùng chọn "đủ nhìn thấy, không cần nét đẹp" nên hạ mạnh.
 * Lịch sử: 1600 JPEG q82 → 126KB; v6 hạ xuống 1280 WebP q80 → 69KB.
 * Đo 21/09/2026 trên 5 ảnh sản phẩm thật của shop lấy từ DB (đã nén 1 lần
 * nên số tuyệt đối thấp hơn ảnh mới chụp, tỉ lệ thì tương đương):
 *   1280 q80 → 78KB (mức cũ) | 960 q65 → 41KB | 800 q60 → 29KB |
 *   720 q55 → 24KB (−69%, mức chọn) | 640 q50 → 19KB.
 * Chọn bằng mắt trên ảnh ghép cạnh nhau ở cỡ điện thoại, không phải bằng
 * con số. Chỉ áp cho ảnh tải lên từ v9-C; ảnh cũ không nén lại.
 */
const PHOTO_MAX_DIMENSION = 720;
const PHOTO_QUALITY = 55;

/**
 * Ảnh chốt đơn là ẢNH CHỤP MÀN HÌNH CHỮ, và là bằng chứng khách đã chốt —
 * phải đọc lại được sau nhiều tháng. Giữ cạnh 1600 để chữ không nhoè; đổi
 * sang WebP vẫn giảm ~25% so với JPEG cũ mà không mất nét.
 */
const DOC_MAX_DIMENSION = 1600;
const DOC_QUALITY = 82;

/**
 * v9-C: 320 q60 (trước là 400 q72). Chỗ hiển thị lớn nhất dùng bản nhỏ là
 * lưới ảnh ~170px, tức ~1.9x — hơi mềm nhưng đủ nhận ra mẫu và màu. Các chỗ
 * khác (thẻ món 40px, ô ảnh trong sheet 64px) dư sức. Đo cùng 5 ảnh thật:
 * 400 q72 → 12KB, 320 q60 → 7KB (−42%).
 */
const THUMB_MAX_DIMENSION = 320;
const THUMB_QUALITY = 60;

export type EncodedImage = {
  buffer: Buffer;
  mimeType: string;
  ext: string;
};

export type StoredImage = {
  main: EncodedImage;
  /** null khi không tạo được bản nhỏ (GIF động, hoặc sharp không đọc được). */
  thumb: EncodedImage | null;
};

/** Ảnh động: sharp chỉ lấy khung đầu → hỏng nội dung. Giữ nguyên bản gốc. */
function isAnimated(mimeType: string): boolean {
  return mimeType === "image/gif";
}

function passthrough(buf: Buffer, mimeType: string): EncodedImage {
  return {
    buffer: buf,
    mimeType,
    ext: extFromContentType(mimeType) ?? "jpg",
  };
}

/**
 * Chuẩn bị ảnh để GỬI GEMINI đọc chữ. Không lưu lại, nên chỉ quan tâm độ
 * chính xác OCR và thời gian truyền.
 */
export async function prepareForAi(
  buf: Buffer,
  mimeType: string,
): Promise<EncodedImage> {
  if (isAnimated(mimeType)) return passthrough(buf, mimeType);
  try {
    const out = await sharp(buf)
      .rotate() // đọc EXIF orientation rồi xoay đúng chiều trước khi resize
      .resize({
        width: AI_MAX_DIMENSION,
        height: AI_MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: AI_JPEG_QUALITY })
      .toBuffer();
    return { buffer: out, mimeType: "image/jpeg", ext: "jpg" };
  } catch {
    // Định dạng lạ / HEIC thiếu codec / file hỏng → gửi nguyên bản. Đây là
    // bước tối ưu, không phải điều kiện bắt buộc để đọc được ảnh.
    return passthrough(buf, mimeType);
  }
}

/**
 * Chuẩn bị ảnh để LƯU: bản chính + bản nhỏ, cả hai đều WebP.
 *
 * `label` quyết định độ phân giải bản chính — ảnh chốt đơn (chữ) giữ nét cao
 * hơn ảnh sản phẩm, xem hằng số ở đầu file.
 */
export async function prepareForStorage(
  buf: Buffer,
  mimeType: string,
  label: PhotoLabel,
): Promise<StoredImage> {
  if (isAnimated(mimeType)) {
    return { main: passthrough(buf, mimeType), thumb: null };
  }

  const isDoc = label === "zalo_confirm";
  const maxDim = isDoc ? DOC_MAX_DIMENSION : PHOTO_MAX_DIMENSION;
  const quality = isDoc ? DOC_QUALITY : PHOTO_QUALITY;

  try {
    // rotate() phải đứng trước resize để EXIF orientation được áp đúng.
    const base = sharp(buf).rotate();

    const main = await base
      .clone()
      .resize({
        width: maxDim,
        height: maxDim,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality })
      .toBuffer();

    const thumb = await base
      .clone()
      .resize({
        width: THUMB_MAX_DIMENSION,
        height: THUMB_MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer();

    return {
      main: { buffer: main, mimeType: "image/webp", ext: "webp" },
      thumb: { buffer: thumb, mimeType: "image/webp", ext: "webp" },
    };
  } catch {
    return { main: passthrough(buf, mimeType), thumb: null };
  }
}
