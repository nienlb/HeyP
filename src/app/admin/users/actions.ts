"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import {
  countActiveAdmins,
  createUser,
  deleteUser,
  getUserById,
  setUserActive,
  setUserPassword,
  setUserRole,
} from "@/db/users";
import { guardLastAdmin, guardSelfAction, parseRole } from "@/lib/roles";

const PAGE = "/admin/users";

function back(error?: string): never {
  redirect(error ? `${PAGE}?err=${encodeURIComponent(error)}` : `${PAGE}?ok=1`);
}

export async function createUserAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const role = parseRole(String(formData.get("role") ?? ""));
  if (!role) back("Vai trò không hợp lệ.");

  const result = await createUser({
    username: String(formData.get("username") ?? ""),
    password: String(formData.get("password") ?? ""),
    role,
  });
  if (!result.ok) back(result.reason);

  revalidatePath(PAGE);
  back();
}

/**
 * Một cửa cho bốn thao tác lên tài khoản khác: đổi vai trò, khoá/mở, đặt lại
 * mật khẩu, xoá. Gộp lại vì cả bốn dùng chung đúng một bộ luật chặn.
 */
export async function userAdminAction(formData: FormData): Promise<void> {
  const me = await requireAdmin();

  const op = String(formData.get("op") ?? "");
  const targetId = Number(formData.get("id"));
  if (!Number.isInteger(targetId) || targetId <= 0)
    back("Yêu cầu không hợp lệ.");

  const target = await getUserById(targetId);
  if (!target) back("Không tìm thấy tài khoản.");

  // Đặt lại mật khẩu cho người khác là thao tác duy nhất KHÔNG cần hai luật
  // chặn — nó không làm mất admin nào.
  if (op === "password") {
    const result = await setUserPassword(
      targetId,
      String(formData.get("password") ?? ""),
    );
    if (!result.ok) back(result.reason);
    revalidatePath(PAGE);
    back();
  }

  const selfErr = guardSelfAction(targetId, me.id);
  if (selfErr) back(selfErr);

  const activeAdmins = await countActiveAdmins();
  const lastAdminErr = guardLastAdmin(target, activeAdmins);

  if (op === "delete") {
    if (lastAdminErr) back(lastAdminErr);
    const result = await deleteUser(targetId);
    if (!result.ok) back(result.reason);
  } else if (op === "active") {
    const next = String(formData.get("active")) === "true";
    // Chỉ khoá mới nguy hiểm; mở khoá thì không.
    if (!next && lastAdminErr) back(lastAdminErr);
    const result = await setUserActive(targetId, next);
    if (!result.ok) back(result.reason);
  } else if (op === "role") {
    const role = parseRole(String(formData.get("role") ?? ""));
    if (!role) back("Vai trò không hợp lệ.");
    // Chỉ HẠ vai trò mới nguy hiểm; nâng lên admin thì không.
    if (role !== "admin" && lastAdminErr) back(lastAdminErr);
    const result = await setUserRole(targetId, role);
    if (!result.ok) back(result.reason);
  } else {
    back("Thao tác không hợp lệ.");
  }

  revalidatePath(PAGE);
  back();
}
