"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession, requireAuth } from "@/lib/auth";
import { saveSettings } from "@/db/queries";
import { changeOwnPassword } from "@/db/users";
import { SETTING_DEFAULTS } from "@/lib/settings";

/** Bỏ dấu ngăn nghìn kiểu Việt ("170.000" → 170000). */
function num(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? "").replace(/[,.\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

export async function saveSettingsAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const sellRate = num(formData.get("sellRate"));
  const defaultMarginVnd = num(formData.get("defaultMarginVnd"));

  await saveSettings({
    sellRate: sellRate > 0 ? sellRate : SETTING_DEFAULTS.sellRate,
    defaultMarginVnd:
      defaultMarginVnd >= 0
        ? defaultMarginVnd
        : SETTING_DEFAULTS.defaultMarginVnd,
  });

  revalidatePath("/settings");
  redirect("/settings?ok=1");
}

// ---------- Đổi mật khẩu cá nhân (v6) ----------

export type PasswordState = { error?: string; ok?: boolean };

export async function changePasswordAction(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const session = await requireAuth();

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next !== confirm) return { error: "Hai ô mật khẩu mới không khớp nhau." };

  const result = await changeOwnPassword(session.id, current, next);
  if (!result.ok) return { error: result.reason };
  return { ok: true };
}
