"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { runBackup } from "@/lib/backup";

export async function backupNowAction(): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");
  runBackup();
  revalidatePath("/backup");
  redirect("/backup");
}
