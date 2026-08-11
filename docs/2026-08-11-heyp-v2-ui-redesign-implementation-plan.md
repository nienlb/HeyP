---
title: Implementation plan — HeyP v2 (reskin + sidebar + mobile)
type: implementation-plan
project: heyp-system
owner: Niên
created: 2026-08-11
status: san-sang-thuc-thi
spec: "[[2026-08-11-heyp-v2-ui-redesign-design]]"
tags: [plan, ui, redesign, v2, mobile]
---

# Implementation plan — HeyP v2 (thiết kế lại giao diện)

> Thực thi theo spec đã duyệt: [[2026-08-11-heyp-v2-ui-redesign-design]]. **Reskin + đổi điều hướng + thêm màn Tổng quan.** Không đụng logic tiền/nghiệp vụ/DB. Dùng skill **frontend-design** khi code UI.

## Nguyên tắc thực thi

1. Mỗi phase trọn vẹn: code → verify (preview desktop + mobile ~375px) → `npm test` + `npx tsc --noEmit` xanh → **commit + push**.
2. **Không sửa logic** ở `src/lib/*` nghiệp vụ, `src/db/*` (chỉ được THÊM hàm đọc/đếm cho Tổng quan), server actions.
3. Sau mỗi phase, **38/38 unit test vẫn phải xanh** và typecheck sạch.
4. Cấu hình qua `.env`; không hard-code màu ngoài token.

## Phase V2-0 — Design token & component nền (nửa buổi)

- Tổ chức lại `src/app/globals.css` thành **hệ token** ở `:root` (palette navy, trung tính, ngữ nghĩa, radius, shadow, spacing) theo spec mục 2.
- Đổi các biến cũ (`--brand` đỏ → navy) và làm lại lớp component nền: `.btn`/`.btn-outline`/`.btn-ghost`/`.btn-sm`, `.badge` (+ biến thể ngữ nghĩa), `.card`, input/`.field`, `.table`/`.tbl`.
- Thêm `src/app/_components/icons.tsx` — bộ **SVG nội tuyến** (dashboard, orders, customers, inventory, truck, backup, plus, more, logout, copy, download…).
- **Nghiệm thu:** app hiện tại vẫn chạy, đổi sang tông navy (đỏ chỉ còn ở sự cố/hủy/lỗi); typecheck + test xanh; không lỗi console.

## Phase V2-1 — Khung điều hướng (AppShell: sidebar + mobile) (1 buổi)

- Khai báo danh sách điều hướng 1 chỗ: `[{href, label, icon}]` (Tổng quan, Đơn hàng, Khách hàng, Tồn kho, Tracking, Sao lưu).
- `Sidebar` (desktop, nền navy, logo + menu + "+ Tạo đơn" + user/Đăng xuất), active theo `usePathname` (client nhỏ cho active, hoặc truyền pathname).
- `MobileNav`: top bar mỏng (logo + tiêu đề), **bottom tab 5 mục**, **FAB "+"** (Tạo đơn), **bottom sheet "Thêm"** (Tracking/Sao lưu/Đăng xuất — client component).
- `AppShell` bọc `Sidebar` + `MobileNav` + `{children}`; thay `AppHeader` ở tất cả trang có đăng nhập. Trang đăng nhập giữ trần.
- Bỏ `app-header.tsx`.
- **Nghiệm thu:** desktop hiện sidebar navy cố định, active đúng, nội dung không bị che; mobile (<768px) hiện bottom tab + FAB + sheet, chuyển màn 1 chạm; verify chụp cả 375px và desktop.

## Phase V2-2 — Màn Tổng quan (nửa buổi)

- Đổi `src/app/page.tsx` từ redirect `/orders` → **trang Tổng quan** (server component).
- Thêm hàm đọc/đếm (chỉ đọc) nếu cần trong `queries.ts` (đếm đơn theo trạng thái; tận dụng `listOrders`, `listCustomersWithTotals`).
- 4 thẻ: **Cần chú ý** (sự cố + quá hạn, list ngắn), **Đơn theo trạng thái** (chip/mini-bar), **Công nợ** (tổng + top khách nợ), **Tác vụ nhanh** (Tạo đơn / Đọc ảnh Zalo). Lưới 2 cột desktop / 1 cột mobile.
- **Nghiệm thu:** mở app vào thẳng Tổng quan; 4 thẻ đúng số liệu thật (đối chiếu vài đơn/khách); mobile 1 cột gọn.

## Phase V2-3 — Reskin các màn + bảng→thẻ trên mobile (1–2 buổi)

- Áp component & token mới cho: Danh sách đơn, Chi tiết đơn, Tạo đơn (giữ nguyên khu Đọc ảnh Zalo + báo giá, chỉ đổi diện mạo), Khách hàng, Tồn kho, Tracking, Sao lưu.
- **Bảng → thẻ xếp dọc trên mobile** cho bảng sản phẩm (chi tiết đơn) và bảng khách hàng (CSS: `<768px` ẩn `thead`, `td[data-label]` xếp dọc).
- Rà vùng chạm ≥44px, bỏ cuộn ngang toàn trang.
- **Nghiệm thu:** mọi màn đồng bộ tông navy; trên mobile không cuộn ngang, bảng thành thẻ đọc được; **mọi luồng nghiệp vụ chạy y như trước** (tạo đơn, chuyển trạng thái, 3 luồng ngoại lệ, AI đọc ảnh, tracking, backup) — test xanh.

## Phase V2-4 — Đăng nhập + logo + rà soát cuối (nửa buổi)

- Reskin trang đăng nhập theo tông navy (giữ logic).
- Thêm `public/` + logo (Niên cung cấp `logo.png`/`.svg`; tạm dùng wordmark "HeyP" trắng trên navy nếu chưa có). Dùng ở sidebar/top bar/login. (Favicon để sau.)
- QA cuối trên 375px và desktop; đối chiếu **checklist nghiệm thu trong spec mục 8**.
- **Nghiệm thu:** đủ tiêu chí spec mục 8; 38/38 test xanh; typecheck sạch.

## Việc Niên cần chuẩn bị

1. **File logo** (`logo.png` hoặc `.svg`) để bỏ vào `public/` — nếu chưa có, mình tạm dùng wordmark chữ, thay sau.
2. Xác nhận sidebar **navy đậm** (đã chốt) và Tổng quan gồm 4 thẻ đã chọn.

## Ngoài phạm vi v2 (để sau)

Dark mode, thẻ Tồn kho / Kiện đang về trên Tổng quan, favicon/PWA, và vòng 2 (VPS, báo cáo lãi/lỗ, xuất Excel, thông báo Zalo, đăng bài tự động, portal khách, adapter tracking tự động).
