"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { deleteCustomerRow } from "@/db/deletion";
import { atLeast } from "@/lib/roles";
import { logActivity } from "@/db/activity";

export async function deleteCustomerAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!atLeast(session.role, "admin")) redirect("/");

  const customerId = Number(formData.get("customerId"));
  if (!Number.isInteger(customerId) || customerId <= 0) redirect("/customers");

  const result = await deleteCustomerRow(customerId, session.username);
  if (!result.ok) {
    redirect(`/customers?err=${encodeURIComponent(result.reason)}`);
  }

  await logActivity({
    actor: session.username,
    action: "customer.delete",
    entityId: customerId,
  });
  revalidatePath("/customers");
  redirect("/customers");
}
