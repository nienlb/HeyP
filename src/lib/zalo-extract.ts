/**
 * Trích xuất dữ liệu đơn từ ảnh chốt đơn Zalo HeyP (Phase 5, spec mục 8b).
 * Prompt + schema + kiểu dữ liệu. Module thuần (không gọi mạng).
 * Chuẩn bám mẫu chốt đơn thật: docs/reference-heyp-chot-don-template.md.
 */

export type ZaloExtractItem = {
  name: string;
  color: string | null;
  size: string | null;
  quantity: number;
};

export type ZaloExtract = {
  items: ZaloExtractItem[];
  totalVnd: number | null;
  depositVnd: number | null;
  shipVnd: number | null;
  shipFree: boolean;
  shipUnknown: boolean;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  notes: string | null;
};

export const ZALO_EXTRACT_PROMPT = `Bạn đọc ảnh chụp màn hình tin nhắn "chốt đơn" của shop HeyP (order giày/dép/sandal). Trích xuất dữ liệu đơn hàng ra JSON theo schema. CHỈ trả JSON, không giải thích.

Quy tắc:
- Dòng sau "Tên sp:" có dạng: "<tên> (như hình) - màu <màu> - size <số>". Với mỗi sản phẩm: name = tên (BỎ chữ "(như hình)"), color = màu, size = size. Có thể có nhiều sản phẩm.
- quantity: nếu không ghi số lượng thì để 1.
- "=> Total: X" → totalVnd. Số tiền tiếng Việt dùng dấu chấm ngăn nghìn: "460.000" = 460000 (số nguyên đồng).
- "Đã cọc: X" → depositVnd. Không có dòng này → null.
- Ship:
  • "Total: X + Y ship" hoặc "Còn lại: Z + N.000 ship" mà có SỐ → shipVnd = số đó (vd "+ 22.000 ship" → 22000).
  • "freeship" hoặc "free ship" → shipFree = true, shipVnd = 0.
  • "+ ship" KHÔNG kèm số → shipUnknown = true, shipVnd = null.
  • Không nhắc gì tới ship → shipUnknown = false, shipFree = false, shipVnd = null.
- Nếu trong ảnh có SỐ ĐIỆN THOẠI khách → customerPhone (giữ nguyên chữ số). Có ĐỊA CHỈ giao → customerAddress.
- customerName: chỉ điền nếu thấy TÊN THẬT của khách; KHÔNG lấy username/handle Instagram (vd "lan_phuon...", "t.wii___ii") → để null.
- BỎ QUA hoàn toàn phần "Lưu ý:" (chính sách không huỷ/đổi trả, tư vấn size, đăng pass) — đó là footer cố định, không phải dữ liệu đơn.
- Nếu ảnh mờ/không đọc được phần nào → để null field đó, đừng bịa.`;

/** Schema ép Gemini trả JSON đúng cấu trúc (responseSchema). */
export const ZALO_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          color: { type: "STRING", nullable: true },
          size: { type: "STRING", nullable: true },
          quantity: { type: "INTEGER" },
        },
        required: ["name", "quantity"],
      },
    },
    totalVnd: { type: "INTEGER", nullable: true },
    depositVnd: { type: "INTEGER", nullable: true },
    shipVnd: { type: "INTEGER", nullable: true },
    shipFree: { type: "BOOLEAN" },
    shipUnknown: { type: "BOOLEAN" },
    customerName: { type: "STRING", nullable: true },
    customerPhone: { type: "STRING", nullable: true },
    customerAddress: { type: "STRING", nullable: true },
    notes: { type: "STRING", nullable: true },
  },
  required: ["items", "shipFree", "shipUnknown"],
} as const;

/** Ghép "màu X - size Y" thành chuỗi thuộc tính cho dòng sản phẩm. */
export function itemAttributes(it: ZaloExtractItem): string {
  const parts: string[] = [];
  if (it.color) parts.push(`màu ${it.color}`);
  if (it.size) parts.push(`size ${it.size}`);
  return parts.join(" - ");
}
