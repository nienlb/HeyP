/**
 * Vai trò người dùng. v8-C đổi từ hai bậc (`admin`/`nhan_vien`) sang BA bậc.
 *
 * Nhãn dùng đúng ba chữ tiếng Anh, CỐ Ý không dịch — đây là tên vai trò, không
 * phải câu chữ giao diện.
 *
 * Module thuần, không đụng DB. `src/db/schema.ts` import enum từ đây, cùng
 * cách ORDER_STATUSES đang làm.
 */

export const USER_ROLES = ["owner", "admin", "member"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

/**
 * Thang bậc. Mọi chỗ kiểm quyền đi qua đây thay vì so `role === "admin"`.
 *
 * VÌ SAO: với ba bậc, so bằng buộc phải liệt kê hai vai trò ở mỗi chỗ kiểm
 * (`role === "owner" || role === "admin"`) — và chỉ cần quên một chỗ là Owner
 * bị chặn khỏi thứ mà Admin làm được, một lỗi vô lý mà không test nào bắt.
 */
const RANK: Record<UserRole, number> = { member: 0, admin: 1, owner: 2 };

export function atLeast(role: UserRole, min: UserRole): boolean {
  return RANK[role] >= RANK[min];
}

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
 * Chặn thao tác khiến hệ thống còn 0 owner đang hoạt động. Áp cho cả ba
 * đường: xoá, khoá, và hạ vai trò.
 *
 * VÌ SAO LÀ OWNER CHỨ KHÔNG PHẢI ADMIN (đổi ở v8-C): quản lý thành viên là
 * Owner-only. Mất owner cuối cùng thì KHÔNG AI thêm lại được nữa, kể cả
 * admin — phải sửa `role` thẳng trong Supabase mới cứu được.
 *
 * `activeOwnerCount` là số owner đang hoạt động TRƯỚC thao tác, kể cả target.
 */
export function guardLastOwner(
  target: { role: UserRole; active: boolean },
  activeOwnerCount: number,
): string | null {
  if (target.role !== "owner" || !target.active) return null;
  return activeOwnerCount <= 1
    ? "Phải còn ít nhất một Owner đang hoạt động."
    : null;
}
