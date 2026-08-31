"use server";

import { redirect } from "next/navigation";
import { createSession } from "@/lib/auth";
import { authenticate, ensureUsersSeeded } from "@/db/users";

export async function loginAction(formData: FormData): Promise<void> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  // Bảng rỗng (lần chạy đầu sau khi lên v6) → nạp từ APP_ACCOUNTS trước khi
  // xác thực, để lần đăng nhập đầu tiên không bị trượt.
  await ensureUsersSeeded();

  const user = await authenticate(username, password);
  if (!user) {
    redirect("/login?error=1");
  }

  await createSession(user.id);
  redirect("/");
}
