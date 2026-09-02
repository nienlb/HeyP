"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  createPackage,
  runTrackingSweep,
  updatePackageStatusManual,
} from "@/db/queries";

export type CreatePackageState = { error?: string; ok?: boolean };

export async function createPackageAction(
  _prev: CreatePackageState,
  formData: FormData,
): Promise<CreatePackageState> {
  const session = await getSession();
  if (!session) return { error: "Phiên đăng nhập đã hết hạn." };

  const trackingCode = String(formData.get("trackingCode") ?? "").trim();
  if (!trackingCode) return { error: "Chưa nhập mã vận đơn." };

  const carrier = String(formData.get("carrier") ?? "").trim() || null;
  const weightRaw = String(formData.get("weightKg") ?? "").replace(/,/g, ".");
  const weightKg = weightRaw ? Number(weightRaw) : null;
  const mode = String(formData.get("mode") ?? "manual") === "auto" ? "auto" : "manual";
  const orderIds = String(formData.get("orderIds") ?? "")
    .split(/[,\s]+/)
    .map((s) => Number(s.replace(/[^0-9]/g, "")))
    .filter((n) => Number.isInteger(n) && n > 0);

  const result = await createPackage({
    trackingCode,
    carrier,
    weightKg: weightKg && Number.isFinite(weightKg) ? weightKg : null,
    mode,
    orderIds,
  });
  if (!result.ok) return { error: result.reason };

  revalidatePath("/tracking");
  return { ok: true };
}

export async function updatePackageStatusAction(
  formData: FormData,
): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const id = Number(formData.get("packageId"));
  const status = String(formData.get("status") ?? "").trim();
  if (id && status) await updatePackageStatusManual(id, status);

  revalidatePath("/tracking");
  redirect("/tracking");
}

export async function runSweepAction(): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  await runTrackingSweep();
  revalidatePath("/tracking");
  redirect("/tracking");
}
