"use server";

import { redirect } from "next/navigation";
import { findAccount } from "@/lib/config";
import { createSession } from "@/lib/auth";

export async function loginAction(formData: FormData): Promise<void> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const account = findAccount(username, password);
  if (!account) {
    redirect("/login?error=1");
  }

  await createSession(account.username);
  redirect("/");
}
