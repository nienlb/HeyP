import type { ReactNode } from "react";
import type { OrderStatus } from "@/lib/order-status";

/**
 * Một icon riêng cho mỗi mốc trong hành trình đơn hàng — dùng chung ở thẻ
 * thống kê Tổng quan và stepper hành trình trên màn chi tiết đơn, để hai nơi
 * đọc thành cùng một "ngôn ngữ hình ảnh" thay vì hai bộ ký hiệu khác nhau.
 * Cùng kiểu nét với bộ icon điều hướng (viewBox 24, strokeWidth 2, bo tròn).
 */
const PATHS: Record<OrderStatus, ReactNode> = {
  cho_bao_gia: (
    <>
      <path d="M21 11.5a8.38 8.38 0 0 1-4.7 7.6 8.5 8.5 0 0 1-8.9-.8L3 20l1.7-4.4a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.5-8.5h.3a8.5 8.5 0 0 1 8.4 8.2z" />
      <path d="M8 10.5h.01M12 10.5h.01M16 10.5h.01" />
    </>
  ),
  da_bao_gia: (
    <>
      <path d="M12.6 2.6 21 11l-8.4 8.4a2 2 0 0 1-2.8 0L3 12.6V4a1.4 1.4 0 0 1 1.4-1.4h8.2z" />
      <circle cx="8" cy="8" r="1.6" />
    </>
  ),
  khach_chot: (
    <>
      <path d="M7 11v10" />
      <path d="M15 6.5 14 11h6.3a2 2 0 0 1 1.9 2.6l-2 6.9A2 2 0 0 1 18.3 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h2.5a2 2 0 0 0 1.8-1.1L12 3h0a2.9 2.9 0 0 1 3 3.5Z" />
    </>
  ),
  da_mua_tq: (
    <>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </>
  ),
  ve_kho_tq: (
    <>
      <rect x="3" y="7" width="18" height="14" rx="1.5" />
      <path d="M3 7 8 3h8l5 4" />
      <path d="M3 11h18" />
      <path d="M9.5 11v10" />
    </>
  ),
  dang_van_chuyen_vn: (
    <>
      <path d="M3 16V6a1 1 0 0 1 1-1h9v11" />
      <path d="M13 9h4.2a1 1 0 0 1 .9.55l1.7 3.4a1 1 0 0 1 .1.45V16a1 1 0 0 1-1 1H13" />
      <circle cx="7" cy="17.5" r="1.8" />
      <circle cx="17.5" cy="17.5" r="1.8" />
    </>
  ),
  ve_kho_vn: (
    <>
      <rect x="3" y="7" width="18" height="14" rx="1.5" />
      <path d="M3 7 8 3h8l5 4" />
      <path d="M3 11h18" />
      <path d="m8.5 15 2 2 4-4" />
    </>
  ),
  da_giao_khach: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h5v-6h2v6h5a1 1 0 0 0 1-1V9.5" />
    </>
  ),
  hoan_tat: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="m8 12.3 2.6 2.6L16.2 9" />
    </>
  ),
  su_co: (
    <>
      <path d="M12 3 2 20h20L12 3Z" />
      <path d="M12 10v4" />
      <path d="M12 17.5h.01" />
    </>
  ),
  khach_bom: (
    <>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="m9.5 11 5 5M14.5 11l-5 5" />
    </>
  ),
  huy: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="m8.5 8.5 7 7M15.5 8.5l-7 7" />
    </>
  ),
};

export function StatusIcon({
  status,
  size = 18,
  className,
}: {
  status: OrderStatus;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[status]}
    </svg>
  );
}
