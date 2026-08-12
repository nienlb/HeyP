import "server-only";
import { config } from "./config";
import {
  ZALO_BATCH_PROMPT,
  ZALO_BATCH_SCHEMA,
  ZALO_EXTRACT_PROMPT,
  ZALO_RESPONSE_SCHEMA,
  normalizeBatch,
  type ZaloBatchExtract,
  type ZaloExtract,
} from "./zalo-extract";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export type ReadResult =
  | { ok: true; data: ZaloExtract }
  | { ok: false; error: string };

/** Gửi ảnh chốt đơn Zalo cho Gemini, nhận dữ liệu đơn có cấu trúc. */
export async function readZaloImage(
  base64: string,
  mimeType: string,
): Promise<ReadResult> {
  if (!config.geminiApiKey) {
    return {
      ok: false,
      error: "Chưa cấu hình GEMINI_API_KEY — nhập tay bình thường.",
    };
  }

  const url = `${ENDPOINT}/${config.geminiModel}:generateContent`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": config.geminiApiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: ZALO_EXTRACT_PROMPT },
              { inlineData: { mimeType, data: base64 } },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: ZALO_RESPONSE_SCHEMA,
          temperature: 0,
        },
      }),
    });
  } catch (err) {
    return { ok: false, error: `Không gọi được Gemini: ${(err as Error).message}` };
  }

  if (!res.ok) {
    return { ok: false, error: `Gemini trả lỗi ${res.status}` };
  }

  let text: string | undefined;
  try {
    const json = await res.json();
    text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  } catch {
    return { ok: false, error: "Không đọc được phản hồi Gemini" };
  }
  if (!text) return { ok: false, error: "Gemini không trả dữ liệu" };

  try {
    const raw = JSON.parse(text) as Partial<ZaloExtract>;
    const data: ZaloExtract = {
      items: Array.isArray(raw.items)
        ? raw.items.map((it) => ({
            name: String(it?.name ?? "").trim(),
            color: it?.color ?? null,
            size: it?.size ?? null,
            quantity: Number(it?.quantity) > 0 ? Number(it.quantity) : 1,
          }))
        : [],
      totalVnd: numOrNull(raw.totalVnd),
      depositVnd: numOrNull(raw.depositVnd),
      shipVnd: numOrNull(raw.shipVnd),
      shipFree: Boolean(raw.shipFree),
      shipUnknown: Boolean(raw.shipUnknown),
      customerName: strOrNull(raw.customerName),
      customerPhone: strOrNull(raw.customerPhone),
      customerAddress: strOrNull(raw.customerAddress),
      notes: strOrNull(raw.notes),
    };
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Dữ liệu Gemini không đúng định dạng" };
  }
}

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function strOrNull(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s === "" || s.toLowerCase() === "null" ? null : s;
}

export type BatchResult =
  | { ok: true; data: ZaloBatchExtract }
  | { ok: false; error: string };

/**
 * Gửi CẢ NHÓM ảnh trong một request: Gemini vừa phân loại từng ảnh vừa gộp
 * dữ liệu đơn. Một lần gọi cho cả nhóm — rẻ và nhanh hơn gọi từng ảnh.
 */
export async function readZaloBatch(
  images: { base64: string; mimeType: string }[],
): Promise<BatchResult> {
  if (!config.geminiApiKey) {
    return {
      ok: false,
      error: "Chưa cấu hình GEMINI_API_KEY — nhập tay bình thường.",
    };
  }
  if (images.length === 0) return { ok: false, error: "Chưa có ảnh nào" };

  const url = `${ENDPOINT}/${config.geminiModel}:generateContent`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": config.geminiApiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: ZALO_BATCH_PROMPT },
              ...images.flatMap((img, i) => [
                { text: `Ảnh số ${i}:` },
                { inlineData: { mimeType: img.mimeType, data: img.base64 } },
              ]),
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: ZALO_BATCH_SCHEMA,
          temperature: 0,
        },
      }),
    });
  } catch (err) {
    return {
      ok: false,
      error: `Không gọi được Gemini: ${(err as Error).message}`,
    };
  }

  if (!res.ok) return { ok: false, error: `Gemini trả lỗi ${res.status}` };

  let text: string | undefined;
  try {
    const json = await res.json();
    text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  } catch {
    return { ok: false, error: "Không đọc được phản hồi Gemini" };
  }
  if (!text) return { ok: false, error: "Gemini không trả dữ liệu" };

  try {
    return { ok: true, data: normalizeBatch(JSON.parse(text), images.length) };
  } catch {
    return { ok: false, error: "Dữ liệu Gemini không đúng định dạng" };
  }
}
