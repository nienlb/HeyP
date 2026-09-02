"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import {
  countActiveOwners,
  createUser,
  deleteUser,
  getUserById,
  setUserActive,
  setUserPassword,
  setUserRole,
} from "@/db/users";
import { guardLastOwner, guardSelfAction, parseRole } from "@/lib/roles";
import { logActivity } from "@/db/activity";

const PAGE = "/admin/users";

function back(error?: string): never {
  redirect(error ? `${PAGE}?err=${encodeURIComponent(error)}` : `${PAGE}?ok=1`);
}

export async function createUserAction(formData: FormData): Promise<void> {
  const me = await requireOwner();

  const role = parseRole(String(formData.get("role") ?? ""));
  if (!role) back("Vai trò không hợp lệ.");

  const result = await createUser({
    username: String(formData.get("username") ?? ""),
    password: String(formData.get("password") ?? ""),
    role,
  });
  if (!result.ok) back(result.reason);

  await logActivity({
    actor: me.username,
    action: "user.create",
    detail: { username: String(formData.get("username") ?? ""), role },
  });
  revalidatePath(PAGE);
  back();
}

/**
 * Một cửa cho bốn thao tác lên tài khoản khác: đổi vai trò, khoá/mở, đặt lại
 * mật khẩu, xoá. Gộp lại vì cả bốn dùng chung đúng một bộ luật chặn.
 */
export async function userAdminAction(formData: FormData): Promise<void> {
  const me = await requireOwner();

  const op = String(formData.get("op") ?? "");
  const targetId = Number(formData.get("id"));
  if (!Number.isInteger(targetId) || targetId <= 0)
    back("Yêu cầu không hợp lệ.");

  const target = await getUserById(targetId);
  if (!target) back("Không tìm thấy tài khoản.");

  // Đặt lại mật khẩu cho người khác là thao tác duy nhất KHÔNG cần hai luật
  // chặn — nó không làm mất owner nào.
  if (op === "password") {
    const result = await setUserPassword(
      targetId,
      String(formData.get("password") ?? ""),
    );
    if (!result.ok) back(result.reason);
    // Nhánh này thoát sớm — phải ghi riêng, nếu không nó lọt lưới.
    // Chỉ ghi op, TUYỆT ĐỐI không ghi mật khẩu.
    await logActivity({
      actor: me.username,
      action: "user.update",
      entityId: targetId,
      detail: { op: "password" },
    });
    revalidatePath(PAGE);
    back();
  }

  const selfErr = guardSelfAction(targetId, me.id);
  if (selfErr) back(selfErr);

  const activeOwners = await countActiveOwners();
  const lastOwnerErr = guardLastOwner(target, activeOwners);

  if (op === "delete") {
    if (lastOwnerErr) back(lastOwnerErr);
    const result = await deleteUser(targetId);
    if (!result.ok) back(result.reason);
  } else if (op === "active") {
    const next = String(formData.get("active")) === "true";
    // Chỉ khoá mới nguy hiểm; mở khoá thì không.
    if (!next && lastOwnerErr) back(lastOwnerErr);
    const result = await setUserActive(targetId, next);
    if (!result.ok) back(result.reason);
  } else if (op === "role") {
    const role = parseRole(String(formData.get("role") ?? ""));
    if (!role) back("Vai trò không hợp lệ.");
    // Chỉ HẠ khỏi owner mới nguy hiểm; nâng lên owner thì không.
    if (role !== "owner" && lastOwnerErr) back(lastOwnerErr);
    const result = await setUserRole(targetId, role);
    if (!result.ok) back(result.reason);
  } else {
    back("Thao tác không hợp lệ.");
  }

  await logActivity({
    actor: me.username,
    action: "user.update",
    entityId: targetId,
    detail: { op },
  });
  revalidatePath(PAGE);
  back();
}
