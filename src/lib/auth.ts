import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUserById } from "@/db/users";
import { atLeast, type UserRole } from "@/lib/roles";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  signSessionToken,
  verifySessionToken,
} from "@/lib/session-token";
import { config } from "./config";

export type Session = { id: number; username: string; role: UserRole };

/**
 * Ký/kiểm token nằm ở @/lib/session-token — CỐ Ý không để ở đây nữa.
 *
 * Từ khi có src/middleware.ts, cùng một cookie phải kiểm được ở hai runtime:
 * Node (các trang) và Edge (middleware). node:crypto không có trên Edge, nên
 * định dạng token chuyển sang Web Crypto và dọn về một module dùng chung —
 * hai bản cài đặt song song là kiểu lỗi mở toang cửa mà không ai thấy.
 * Định dạng không đổi, cookie đang phát hành vẫn dùng được.
 */

export async function createSession(userId: number): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, await signSessionToken(userId, config.sessionSecret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

/**
 * Phiên hiện tại, hoặc null. Không redirect.
 *
 * Bọc `cache()`: nhiều nơi trong một lần render gọi requireAuth() nhưng chỉ
 * tốn đúng MỘT truy vấn khoá chính.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const store = await cookies();
  const parsed = await verifySessionToken(
    store.get(SESSION_COOKIE_NAME)?.value,
    config.sessionSecret,
  );
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
  return (
    (await verifySessionToken(
      store.get(SESSION_COOKIE_NAME)?.value,
      config.sessionSecret,
    )) !== null
  );
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
/**
 * Chặn theo THANG BẬC, không so bằng: `requireRole("admin")` cho Owner qua.
 * Xem chú thích RANK trong src/lib/roles.ts.
 */
export async function requireRole(min: UserRole): Promise<Session> {
  const session = await requireAuth();
  if (!atLeast(session.role, min)) redirect("/");
  return session;
}

export async function requireAdmin(): Promise<Session> {
  return requireRole("admin");
}

export async function requireOwner(): Promise<Session> {
  return requireRole("owner");
}
