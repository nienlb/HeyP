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

export const ZALO_EXTRACT_PROMPT = `Bạn đọc một ảnh liên quan tới việc chốt đơn hàng của shop HeyP (order giày/dép/sandal). Ảnh có thể là ảnh chụp màn hình tin nhắn chốt đơn (Zalo, Messenger, SMS, hoặc ứng dụng nhắn tin khác), hoặc ảnh chụp tay một tờ ghi chép/hoá đơn giấy. Trích xuất dữ liệu đơn hàng ra JSON theo schema. CHỈ trả JSON, không giải thích.

Mẫu chốt đơn phổ biến nhất của shop có dạng như các quy tắc dưới đây mô tả — ảnh khớp mẫu này thì áp dụng đúng quy tắc. Ảnh không khớp mẫu (ghi chép tay, định dạng khác, ứng dụng nhắn tin khác) thì đọc đúng những gì nhìn thấy được theo ý nghĩa tương ứng của từng trường, đừng cố ép vào đúng khuôn cú pháp bên dưới.

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

/* ---------- Đọc NHIỀU ảnh trong một lần (v3-A) ---------- */

export const IMAGE_KINDS = ["chot_don", "thong_tin_khach", "san_pham"] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];

export const IMAGE_KIND_LABELS: Record<ImageKind, string> = {
  chot_don: "Ảnh chốt đơn",
  thong_tin_khach: "Ảnh thông tin khách",
  san_pham: "Ảnh sản phẩm",
};

export type ClassifiedImage = { index: number; kind: ImageKind };
export type ZaloBatchExtract = {
  images: ClassifiedImage[];
  order: ZaloExtract;
};

export const ZALO_BATCH_PROMPT = `${ZALO_EXTRACT_PROMPT}

Lần này bạn nhận NHIỀU ảnh cùng lúc, đánh số từ 0 theo thứ tự gửi. Với MỖI ảnh, xác định loại:
- "chot_don": ảnh chứa thông tin chốt đơn — tin nhắn (Zalo/Messenger/SMS/ứng dụng khác) hoặc ghi chép/hoá đơn giấy có tên sản phẩm, tổng tiền, hoặc tiền cọc. Áp dụng các quy tắc ở trên để trích dữ liệu đơn; ảnh không khớp đúng mẫu HeyP thì đọc đúng những gì thấy được.
- "thong_tin_khach": ảnh chứa tên / số điện thoại / địa chỉ giao hàng của khách. Có thể là ảnh chụp màn hình tin nhắn HOẶC ảnh chụp giấy/sổ bằng điện thoại (chữ viết tay cũng tính). Lấy customerName, customerPhone, customerAddress từ đây.
- "san_pham": ảnh chụp sản phẩm (giày, dép, túi...). KHÔNG trích gì từ ảnh loại này.

Trả về mảng "images" có ĐÚNG một phần tử cho mỗi ảnh nhận được, kèm index. Gộp toàn bộ dữ liệu đơn đọc được từ mọi ảnh vào một đối tượng "order" duy nhất.
Nếu không chắc ảnh thuộc loại nào → chọn "san_pham" (chỉ lưu, không đọc). Thà bỏ sót còn hơn đọc bừa.`;

export const ZALO_BATCH_SCHEMA = {
  type: "OBJECT",
  properties: {
    images: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          index: { type: "INTEGER" },
          kind: { type: "STRING", enum: [...IMAGE_KINDS] },
        },
        required: ["index", "kind"],
      },
    },
    order: ZALO_RESPONSE_SCHEMA,
  },
  required: ["images", "order"],
} as const;

const EMPTY_EXTRACT: ZaloExtract = {
  items: [],
  totalVnd: null,
  depositVnd: null,
  shipVnd: null,
  shipFree: false,
  shipUnknown: false,
  customerName: null,
  customerPhone: null,
  customerAddress: null,
  notes: null,
};

function toNumOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function toStrOrNull(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s === "" || s.toLowerCase() === "null" ? null : s;
}

/**
 * Chuẩn hoá phản hồi batch của Gemini về cấu trúc chắc chắn dùng được.
 * Nguyên tắc: ảnh nào không rõ loại thì coi là "san_pham" — chỉ lưu, không đọc.
 * Thà bỏ sót còn hơn bịa dữ liệu vào đơn có tiền thật.
 */
export function normalizeBatch(
  raw: unknown,
  imageCount: number,
): ZaloBatchExtract {
  const obj = (raw ?? {}) as Record<string, unknown>;

  const kinds = new Array<ImageKind>(imageCount).fill("san_pham");
  const rawImages = Array.isArray(obj.images) ? obj.images : [];
  for (const entry of rawImages) {
    const e = (entry ?? {}) as Record<string, unknown>;
    const idx = Number(e.index);
    const kind = String(e.kind ?? "");
    if (!Number.isInteger(idx) || idx < 0 || idx >= imageCount) continue;
    if ((IMAGE_KINDS as readonly string[]).includes(kind)) {
      kinds[idx] = kind as ImageKind;
    }
  }

  const o = (obj.order ?? {}) as Record<string, unknown>;
  const rawItems = Array.isArray(o.items) ? o.items : [];
  const order: ZaloExtract = {
    ...EMPTY_EXTRACT,
    items: rawItems.map((it) => {
      const i = (it ?? {}) as Record<string, unknown>;
      const qty = Number(i.quantity);
      return {
        name: String(i.name ?? "").trim(),
        color: toStrOrNull(i.color),
        size: toStrOrNull(i.size),
        quantity: qty > 0 ? qty : 1,
      };
    }),
    totalVnd: toNumOrNull(o.totalVnd),
    depositVnd: toNumOrNull(o.depositVnd),
    shipVnd: toNumOrNull(o.shipVnd),
    shipFree: Boolean(o.shipFree),
    shipUnknown: Boolean(o.shipUnknown),
    customerName: toStrOrNull(o.customerName),
    customerPhone: toStrOrNull(o.customerPhone),
    customerAddress: toStrOrNull(o.customerAddress),
    notes: toStrOrNull(o.notes),
  };

  return {
    images: kinds.map((kind, index) => ({ index, kind })),
    order,
  };
}
