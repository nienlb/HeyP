/**
 * Định dạng cookie phiên — MỘT nguồn chân lý, dùng được ở CẢ hai runtime.
 *
 * Vì sao không dùng node:crypto như trước: từ nay việc chặn người chưa đăng
 * nhập nằm ở `src/middleware.ts`, mà middleware chạy trên Edge runtime — ở đó
 * không có node:crypto. Nếu để hai bản cài đặt cùng một định dạng token thì
 * ngày nào đó chúng lệch nhau: hoặc cửa mở toang (middleware nhận token mà
 * trang từ chối), hoặc không ai vào được (ngược lại). Web Crypto
 * (`crypto.subtle`) có sẵn ở CẢ Node 18+ lẫn Edge, nên viết đúng một lần.
 *
 * Định dạng GIỮ NGUYÊN như bản node:crypto cũ — cookie đang phát hành vẫn
 * dùng được, không ai bị đá ra khi deploy:
 *
 *     base64url(userId) "." timestamp "." hex(HMAC-SHA256 của hai phần đầu)
 *
 * Module thuần: KHÔNG import "server-only", KHÔNG đụng DB. Middleware nạp nó.
 */

export const SESSION_COOKIE_NAME = "heyp_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 ngày

const TEXT = new TextEncoder();

async function keyFor(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    TEXT.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length === 0 || hex.length % 2 !== 0) return null;
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function b64urlEncode(text: string): string {
  let bin = "";
  for (const b of TEXT.encode(text)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(text: string): string | null {
  try {
    const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export async function signSessionToken(
  userId: number,
  secret: string,
): Promise<string> {
  const payload = `${b64urlEncode(String(userId))}.${Date.now()}`;
  const sig = await crypto.subtle.sign(
    "HMAC",
    await keyFor(secret),
    TEXT.encode(payload),
  );
  return `${payload}.${toHex(sig)}`;
}

/**
 * Cookie này có phải do mình ký và chưa bị sửa không.
 *
 * `crypto.subtle.verify` so sánh chữ ký ở tầng dưới nên không rò rỉ thời gian
 * — thay đúng vai trò của timingSafeEqual ở bản cũ.
 *
 * CHỈ nói lên "chữ ký hợp lệ". KHÔNG khẳng định tài khoản còn sống hay còn
 * quyền — chỗ đó vẫn phải đọc DB, xem getSession() trong src/lib/auth.ts.
 */
export async function verifySessionToken(
  token: string | undefined,
  secret: string,
): Promise<{ userId: number } | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [idB64, ts, sigHex] = parts;

  const sig = fromHex(sigHex);
  if (!sig) return null;

  const ok = await crypto.subtle.verify(
    "HMAC",
    await keyFor(secret),
    sig,
    TEXT.encode(`${idB64}.${ts}`),
  );
  if (!ok) return null;

  // Cookie định dạng cũ (mang username thay userId) không ra số → coi như
  // không hợp lệ, người dùng đăng nhập lại một lần.
  const raw = b64urlDecode(idB64);
  if (raw === null) return null;
  const userId = Number(raw);
  if (!Number.isInteger(userId) || userId <= 0) return null;
  return { userId };
}
