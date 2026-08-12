import type { IconName } from "./icons";

export type NavItem = { href: string; label: string; icon: IconName };

/** Mục chính — hiện ở sidebar (desktop) và bottom tab (mobile). */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Tổng quan", icon: "dashboard" },
  { href: "/orders", label: "Đơn hàng", icon: "orders" },
  { href: "/customers", label: "Khách hàng", icon: "customers" },
  { href: "/inventory", label: "Tồn kho", icon: "inventory" },
];

/** Mục phụ — sidebar hiện thêm; mobile gom vào sheet "Thêm". */
export const MORE_ITEMS: NavItem[] = [
  { href: "/tracking", label: "Tracking", icon: "tracking" },
  { href: "/finance", label: "Tài chính", icon: "finance" },
  { href: "/reports", label: "Báo cáo", icon: "reports" },
  { href: "/settings", label: "Cài đặt", icon: "settings" },
  { href: "/backup", label: "Sao lưu", icon: "backup" },
];
