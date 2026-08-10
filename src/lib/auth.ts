import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { config } from "./config";

const COOKIE_NAME = "heyp_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 ngày

/** Ký một payload bằng HMAC-SHA256 để cookie phiên không giả mạo được. */
function sign(payload: string): string {
  return createHmac("sha256", config.sessionSecret).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Token = base64(username).timestamp.chữ_ký */
function makeToken(username: string): string {
  const payload = `${Buffer.from(username).toString("base64url")}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token: string | undefined): { username: string } | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userB64, ts, sig] = parts;
  const payload = `${userB64}.${ts}`;
  if (!safeEqual(sig, sign(payload))) return null;
  try {
    const username = Buffer.from(userB64, "base64url").toString("utf8");
    return { username };
  } catch {
    return null;
  }
}

export async function createSession(username: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, makeToken(username), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Trả về phiên hiện tại nếu hợp lệ, ngược lại null. Không redirect. */
export async function getSession(): Promise<{ username: string } | null> {
  const store = await cookies();
  return verifyToken(store.get(COOKIE_NAME)?.value);
}

/** Dùng ở đầu server component cần bảo vệ: chưa đăng nhập → về /login. */
export async function requireAuth(): Promise<{ username: string }> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
