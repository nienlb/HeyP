import type { UserRole } from "@/lib/roles";
import type { IconName } from "./icons";

export type NavItem = { href: string; label: string; icon: IconName };

/** Mục chính — sidebar (desktop) và ba ô đầu của tabbar (mobile). */
const MAIN: NavItem[] = [
  { href: "/", label: "Tổng quan", icon: "dashboard" },
  { href: "/orders", label: "Đơn", icon: "orders" },
  { href: "/inventory", label: "Kho", icon: "inventory" },
];

/** Mục phụ — sidebar hiện thêm; mobile gom vào sheet "Thêm". */
const MORE: NavItem[] = [
  { href: "/customers", label: "Khách hàng", icon: "customers" },
  { href: "/tracking", label: "Tracking", icon: "tracking" },
  { href: "/finance", label: "Tài chính", icon: "finance" },
  { href: "/reports", label: "Báo cáo", icon: "reports" },
  { href: "/settings", label: "Cài đặt", icon: "settings" },
  { href: "/backup", label: "Sao lưu", icon: "backup" },
];

/** Chỉ admin thấy — nhân viên gõ thẳng URL vẫn bị requireAdmin chặn. */
const ADMIN_ONLY: NavItem[] = [
  { href: "/admin/users", label: "Thành viên", icon: "users" },
  { href: "/admin/deletions", label: "Nhật ký xoá", icon: "trash" },
];

/**
 * Thêm màn mới thì sửa ĐÚNG file này, không sửa từng component điều hướng.
 */
export function navItemsFor(role: UserRole): {
  main: NavItem[];
  more: NavItem[];
} {
  return {
    main: MAIN,
    more: role === "admin" ? [...MORE, ...ADMIN_ONLY] : MORE,
  };
}
