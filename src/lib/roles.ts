/**
 * Vai trò người dùng (v6). Đúng HAI vai trò, không có bảng quyền chi tiết —
 * mọi chỗ kiểm quyền rút về `role === "admin"`.
 *
 * Module thuần, không đụng DB. `src/db/schema.ts` import enum từ đây, cùng
 * cách ORDER_STATUSES đang làm.
 */

export const USER_ROLES = ["admin", "nhan_vien"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Quản trị",
  nhan_vien: "Nhân viên",
};

export function parseRole(raw: string): UserRole | null {
  return (USER_ROLES as readonly string[]).includes(raw)
    ? (raw as UserRole)
    : null;
}

/**
 * Chặn tự khoá / tự hạ vai trò / tự xoá chính mình — nếu không, một cú bấm
 * nhầm là mất đường vào khu quản trị.
 */
export function guardSelfAction(
  targetId: number,
  currentUserId: number,
): string | null {
  return targetId === currentUserId
    ? "Không thể tự khoá, tự hạ vai trò hay tự xoá chính mình."
    : null;
}

/**
 * Chặn thao tác khiến hệ thống còn 0 admin đang hoạt động. Áp cho cả ba
 * đường: xoá, khoá, và hạ vai trò.
 *
 * `activeAdminCount` là số admin đang hoạt động TRƯỚC thao tác, kể cả target.
 */
export function guardLastAdmin(
  target: { role: UserRole; active: boolean },
  activeAdminCount: number,
): string | null {
  if (target.role !== "admin" || !target.active) return null;
  return activeAdminCount <= 1
    ? "Phải còn ít nhất một quản trị viên đang hoạt động."
    : null;
}
