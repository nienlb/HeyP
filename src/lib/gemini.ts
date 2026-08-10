import "server-only";
import { config } from "./config";
import {
  ZALO_EXTRACT_PROMPT,
  ZALO_RESPONSE_SCHEMA,
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
