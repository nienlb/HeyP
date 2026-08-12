"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  addExpense,
  addTopup,
  deleteExpense,
  deleteLedgerEntry,
} from "@/db/queries";
import {
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  type ExpenseCategory,
  type PaymentMethod,
} from "@/lib/expenses";

function num(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseDate(v: FormDataEntryValue | null): Date {
  const s = String(v ?? "").trim();
  if (s === "") return new Date();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export async function addTopupAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const result = addTopup({
    cny: num(formData.get("cny")),
    vndPaid: num(formData.get("vndPaid")),
    note: String(formData.get("note") ?? "").trim() || null,
  });

  if (!result.ok)
    redirect(`/finance?err=${encodeURIComponent(result.reason)}`);
  revalidatePath("/finance");
  redirect("/finance");
}

export async function deleteLedgerAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const result = deleteLedgerEntry(Number(formData.get("id")));
  if (!result.ok)
    redirect(`/finance?err=${encodeURIComponent(result.reason)}`);
  revalidatePath("/finance");
  redirect("/finance");
}

export async function addExpenseAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const categoryRaw = String(formData.get("category") ?? "khac");
  const category = (EXPENSE_CATEGORIES as readonly string[]).includes(
    categoryRaw,
  )
    ? (categoryRaw as ExpenseCategory)
    : "khac";
  const methodRaw = String(formData.get("method") ?? "chuyen_khoan");
  const method = (PAYMENT_METHODS as readonly string[]).includes(methodRaw)
    ? (methodRaw as PaymentMethod)
    : "chuyen_khoan";
  const orderIdRaw = num(formData.get("orderId"));

  const result = addExpense({
    spentAt: parseDate(formData.get("spentAt")),
    category,
    amountVnd: num(formData.get("amountVnd")),
    orderId: orderIdRaw > 0 ? orderIdRaw : null,
    method,
    note: String(formData.get("note") ?? "").trim() || null,
  });

  if (!result.ok)
    redirect(`/finance?err=${encodeURIComponent(result.reason)}`);
  revalidatePath("/finance");
  redirect("/finance");
}

export async function deleteExpenseAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  deleteExpense(Number(formData.get("id")));
  revalidatePath("/finance");
  redirect("/finance");
}
