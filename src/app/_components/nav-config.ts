import type { UserRole } from "@/lib/roles";
import type { IconName } from "./icons";

export type NavItem = { href: string; label: string; icon: IconName };

/** Mục chính — sidebar (desktop) và ba ô đầu của tabbar (mobile). */
const MAIN: NavItem[] = [
  { href: "/", label: "Tổng quan", icon: "dashboard" },
  { href: "/orders", label: "Đơn", icon: "orders" },
  { href: "/inventory", label: "Kho", icon: "inventory" },
];

/**
 * Mục phụ — sidebar hiện thêm; mobile gom vào sheet "Thêm".
 *
 * Sao lưu, Thành viên, Nhật ký xoá KHÔNG nằm ở đây — gom cả ba vào trong
 * màn Cài đặt (đỡ dài menu chính), xem src/app/settings/page.tsx.
 *
 * Tracking đã bỏ khỏi đây (v8-A) vì CARRIER_ADAPTERS còn rỗng — chưa có đơn
 * vị vận chuyển nào. Route /tracking, bảng packages/order_packages và cron
 * sweep GIỮ NGUYÊN: lúc có adapter thật chỉ cần thêm lại đúng một dòng
 * { href: "/tracking", label: "Tracking", icon: "tracking" } vào mảng dưới.
 */
const MORE: NavItem[] = [
  { href: "/customers", label: "Khách hàng", icon: "customers" },
  { href: "/finance", label: "Tài chính", icon: "finance" },
  { href: "/reports", label: "Báo cáo", icon: "reports" },
  { href: "/settings", label: "Cài đặt", icon: "settings" },
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
    more: MORE,
  };
}
