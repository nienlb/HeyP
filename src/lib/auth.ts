import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUserById } from "@/db/users";
import type { UserRole } from "@/lib/roles";
import { config } from "./config";

const COOKIE_NAME = "heyp_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 ngày

export type Session = { id: number; username: string; role: UserRole };

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

/**
 * Token = base64(userId).timestamp.chữ_ký
 *
 * v6 mang userId thay username: vai trò và cờ `active` phải đọc từ DB mỗi
 * request, nếu không thì khoá tài khoản chẳng có tác dụng gì (cookie sống 30
 * ngày). Cookie định dạng cũ (mang username) không parse ra số → coi như
 * không hợp lệ, người dùng đăng nhập lại một lần.
 */
function makeToken(userId: number): string {
  const payload = `${Buffer.from(String(userId)).toString("base64url")}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token: string | undefined): { userId: number } | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [idB64, ts, sig] = parts;
  const payload = `${idB64}.${ts}`;
  if (!safeEqual(sig, sign(payload))) return null;
  try {
    const userId = Number(Buffer.from(idB64, "base64url").toString("utf8"));
    if (!Number.isInteger(userId) || userId <= 0) return null;
    return { userId };
  } catch {
    return null;
  }
}

export async function createSession(userId: number): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, makeToken(userId), {
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

/**
 * Phiên hiện tại, hoặc null. Không redirect.
 *
 * Bọc `cache()`: nhiều nơi trong một lần render gọi requireAuth() nhưng chỉ
 * tốn đúng MỘT truy vấn khoá chính.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const store = await cookies();
  const parsed = verifyToken(store.get(COOKIE_NAME)?.value);
  if (!parsed) return null;
  const user = await getUserById(parsed.userId);
  // Tài khoản bị xoá hoặc bị khoá → phiên chết ngay, không đợi cookie hết hạn.
  if (!user || !user.active) return null;
  return { id: user.id, username: user.username, role: user.role };
});

/**
 * Cookie phiên có chữ ký hợp lệ hay không — KHÔNG đụng DB.
 *
 * Cố ý tách khỏi getSession(): /api/health cần phân biệt "phiên đã hết hạn"
 * với "DB đang chết". getSession() gộp hai thứ đó (nó đọc bảng users, nên DB
 * lỗi cũng trả null y như hết phiên) — dùng nó để chẩn đoán thì lúc DB sập sẽ
 * báo nhầm cho người dùng là hết phiên, và họ đăng nhập lại trong vô vọng.
 *
 * Chỉ nói lên "cookie này do mình ký và chưa bị sửa". KHÔNG khẳng định tài
 * khoản còn sống hay còn quyền — mọi trang vẫn phải đi qua requireAuth().
 */
export async function hasValidSessionCookie(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get(COOKIE_NAME)?.value) !== null;
}

/** Dùng ở đầu server component cần bảo vệ: chưa đăng nhập → về /login. */
export async function requireAuth(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * Dùng ở đầu MỌI trang và MỌI server action của khu quản trị. Không dựa vào
 * việc giấu nút ở UI — nhân viên gõ thẳng URL vẫn phải bị chặn.
 */
export async function requireAdmin(): Promise<Session> {
  const session = await requireAuth();
  if (session.role !== "admin") redirect("/");
  return session;
}
