---
title: Thiết kế lại giao diện — HeyP v2 (reskin + sidebar + mobile)
type: design-spec
project: heyp-system
owner: Niên
created: 2026-08-11
status: cho-duyet
spec: "[[2026-08-10-heyp-system-design]]"
tags: [design, ui, redesign, v2, mobile]
---

# Thiết kế lại giao diện HeyP v2

> Sau khi MVP (Phase 0–7) chạy ổn, làm lại **diện mạo** cho đẹp và đúng thương hiệu (logo navy), đổi điều hướng sang **sidebar trái** (console), và **tối ưu mobile**. **Không đụng** logic tiền/nghiệp vụ/dữ liệu — đây là reskin + đổi khung điều hướng + thêm 1 màn Tổng quan.

## 1. Mục tiêu & phạm vi

**Mục tiêu:** giao diện đẹp, đồng bộ theo logo navy; điều hướng dạng console (menu trái) trên desktop; trải nghiệm mượt trên điện thoại (dùng mobile nhiều).

**Trong phạm vi:**
- Hệ màu & token mới theo logo navy (chỉ nền sáng).
- Đổi khung điều hướng: **sidebar trái** (desktop) ↔ **bottom tab + nút tạo nổi** (mobile).
- Thêm màn **Tổng quan** làm trang chủ.
- Làm lại toàn bộ component (nút, badge, thẻ, dòng danh sách, form, bảng) theo token mới.
- Tối ưu mobile: vùng chạm ≥44px, bảng → thẻ xếp dọc, bottom sheet.

**Ngoài phạm vi (GIỮ NGUYÊN):**
- Mọi logic tiền, luật trạng thái, tồn kho, 3 luồng ngoại lệ, AI đọc ảnh, tracking, backup.
- Cấu trúc route, server actions, DB, các module `src/lib/*` nghiệp vụ.
- Dark mode (chỉ làm nền sáng), font ngoài (giữ font hệ thống).

**Nền tảng kỹ thuật:** CSS thuần nâng cấp thành **design-token system** (không thêm dependency, không đổi build). Icon dùng **SVG nội tuyến** (bộ nhỏ tự nhúng). Skill dùng khi code: **frontend-design**.

## 2. Hệ màu & token

Định nghĩa trong `:root` ở `globals.css`. Đỏ chỉ còn vai trò ngữ nghĩa (sự cố/hủy/lỗi), KHÔNG còn là màu thương hiệu.

**Thương hiệu (navy từ logo):**
- `--brand: #0E5A87` — sidebar, nút chính, link, active
- `--brand-strong: #0A4468` — hover/nhấn
- `--brand-tint: #E8F1F7` — nền nhạt: nav active (bản sáng), dòng chọn, banner info
- `--on-brand: #FFFFFF` — chữ/icon trên nền navy

**Trung tính (xám mát):**
- `--bg: #F6F8FA` · `--surface: #FFFFFF` · `--surface-2: #F1F4F7`
- `--border: #E2E8EF`
- `--text: #16202B` · `--text-muted: #5A6B7B` · `--text-subtle: #8A98A6`

**Ngữ nghĩa:**
- `--danger: #DC2A25` (sự cố/hủy/lỗi) · nền `--danger-tint: #FEF2F2`
- `--warning: #B7791F` · nền `--warning-tint: #FFF7E6` (quá hạn/tra tay/cảnh báo)
- `--success: #1F9D57` · nền `--success-tint: #EAF7EF` (hoàn tất/lãi)

**Hình khối & độ nổi:**
- `--radius: 12px` (thẻ) · `--radius-sm: 8px` (nút/input) · `--radius-pill: 999px` (badge)
- `--shadow-sm: 0 1px 2px rgba(16,32,43,.06)`
- `--shadow-md: 0 6px 20px rgba(16,32,43,.10)` (sidebar, sheet, sticky)
- Spacing scale: 4 / 8 / 12 / 16 / 20 / 24 / 32

**Chữ:** giữ font hệ thống. Cỡ: h1 22–24, h2 16–18, body 14–15, phụ 12–13. Số tiền dùng `font-variant-numeric: tabular-nums`.

## 3. Bố cục & điều hướng

**Breakpoint:** một mốc duy nhất `768px`. `≥768px` = desktop (sidebar); `<768px` = mobile (bottom tab).

### 3.1 Desktop — Sidebar trái cố định (navy đậm)
- Rộng **240px**, cao full màn, `position: fixed`, nền `--brand`, chữ `--on-brand`.
- **Đầu:** logo tròn HeyP (ảnh) + chữ "HeyP".
- **Menu** (icon + nhãn): Tổng quan · Đơn hàng · Khách hàng · Tồn kho · Tracking · Sao lưu. Mục active: nền trắng-mờ (`rgba(255,255,255,.14)`) + gạch trái sáng.
- **Nút "+ Tạo đơn"** nổi bật ngay đầu menu (nền trắng, chữ navy — tương phản với sidebar).
- **Chân:** tên `nien` + Đăng xuất.
- Nội dung chính: `margin-left: 240px`, `max-width` ~1040px, padding thoáng.

### 3.2 Mobile — Bottom tab + nút tạo nổi
- **Top bar mỏng** (sticky): logo nhỏ + tiêu đề màn hiện tại.
- **Bottom tab** (fixed, 5 mục, icon + nhãn nhỏ): Tổng quan · Đơn hàng · Khách hàng · Tồn kho · **Thêm**. Mục active màu navy.
- **FAB "+"** navy tròn, góc phải-dưới (trên bottom bar ~72px) → Tạo đơn.
- **"Thêm"** mở **bottom sheet** trượt lên: Tracking · Sao lưu · Đăng xuất.
- Nội dung có `padding-bottom` đủ để không bị bottom bar che.

### 3.3 Thay đổi cấu trúc code
- Bỏ `src/app/_components/app-header.tsx` (top nav) → thay bằng:
  - `Sidebar` (server component, desktop) + `MobileNav` (bottom tab + top bar + sheet; phần sheet là client component nhỏ).
  - Một `AppShell` bọc `Sidebar` + `MobileNav` + `{children}`, **dùng ở từng trang có đăng nhập** (đúng pattern `AppHeader` hiện tại). **Trang đăng nhập giữ trần** (không có shell). Không đưa vào `layout.tsx` gốc vì login không có điều hướng.
- Danh sách mục điều hướng khai báo 1 chỗ (mảng `{href, label, icon}`) để sidebar & bottom tab dùng chung, đánh dấu active theo `usePathname`.
- Icon: file `src/app/_components/icons.tsx` chứa bộ SVG nội tuyến (dashboard, orders, customers, inventory, truck, backup, plus, more, logout…).

## 4. Màn Tổng quan (mới)

Route `/` (thay redirect `/`→`/orders` hiện tại bằng trang Tổng quan thực thụ). Server component, đọc dữ liệu qua các query đã có (thêm vài hàm đếm nếu cần, chỉ đọc — không đổi logic).

**Các thẻ (đã chốt):**
1. **⚠️ Cần chú ý** — số đơn Sự cố + quá hạn (con số lớn) + list ngắn 3–5 đơn, bấm ra chi tiết. Dùng `listOrders()` sẵn có (đã có cờ `needsAttention`).
2. **Đơn theo trạng thái** — đếm số đơn ở từng khâu (chip hoặc mini-bar ngang). Group theo `status` từ `listOrders()`.
3. **Công nợ** — tổng còn phải thu (Σ `outstanding`) + 3–5 khách nợ nhiều nhất. Dùng `listCustomersWithTotals()` sẵn có.
4. **Tác vụ nhanh** — nút "Tạo đơn" + "Đọc ảnh Zalo" (link tới `/orders/new`).

Bố cục: lưới thẻ 2 cột (desktop) / 1 cột (mobile). "Cần chú ý" chiếm nổi bật trên cùng.

*Không* làm thẻ Tồn kho và Kiện đang về (Niên bỏ chọn) — có thể thêm sau.

## 5. Component (làm lại theo token)

- **Nút:** `.btn` (navy đặc) · `.btn-outline` (viền navy) · `.btn-ghost` (nhạt) · `.btn-sm`. Vùng chạm ≥44px mobile; trạng thái hover/active/disabled rõ.
- **Badge:** viên bo tròn, nền tint + chữ màu theo ngữ nghĩa. Trạng thái thường = navy tint; sự cố/hủy = đỏ; hoàn tất = xanh lá; quá hạn/tra tay/cảnh báo = hổ phách.
- **Thẻ:** `.card` trắng, bo 12px, `--shadow-sm`, tiêu đề `.card-title`.
- **Dòng danh sách đơn/khách:** phân cấp gọn (mã đơn mờ · tên khách đậm · badge loại/trạng thái · tiền canh phải tabular · số ngày). Cả dòng bấm được, chạm rộng.
- **Form:** input to hơn trên mobile, nhãn rõ; khu Đọc ảnh Zalo + money-preview + Copy báo giá giữ chức năng, chỉ đổi diện mạo (viền navy nhạt, dropzone rõ ràng).
- **Bảng → thẻ trên mobile:** desktop giữ `<table>`; `<768px` mỗi hàng render thành thẻ **nhãn : giá trị** xếp dọc (dùng CSS: bảng `display:block`, ẩn `thead`, `td` có `data-label`, hoặc render 2 layout). Áp cho bảng sản phẩm (chi tiết đơn) và bảng khách hàng.
- **Bottom sheet** (mobile "Thêm"): overlay mờ + panel trượt từ dưới, bo góc trên, có nút đóng.
- **Empty state / thông tin:** đồng bộ tông mới; banner cảnh báo dùng `--warning-tint`.

## 6. Logo

- Thêm thư mục `public/` và đặt logo (`public/logo.png` hoặc `.svg`). Niên cung cấp file logo; nếu chưa có, tạm dùng wordmark "HeyP" chữ trắng trên nền navy cho tới khi có file.
- Dùng ở: đầu sidebar (desktop), top bar (mobile), và trang đăng nhập.
- Favicon/manifest: có thể cập nhật sau (không bắt buộc ở v2).

## 7. Trang đăng nhập

Reskin theo tông navy: nền nhạt, thẻ trắng giữa màn, logo trên, nút Đăng nhập navy. Giữ nguyên logic đăng nhập.

## 8. Tiêu chí nghiệm thu

- [ ] Toàn app dùng palette navy; đỏ chỉ xuất hiện ở ngữ nghĩa (sự cố/hủy/lỗi).
- [ ] Desktop: sidebar trái navy cố định, mục active rõ, "+ Tạo đơn" nổi bật; nội dung không bị che.
- [ ] Mobile (<768px): bottom tab 5 mục + FAB "+" + sheet "Thêm" hoạt động; không cuộn ngang toàn trang; bảng thành thẻ xếp dọc.
- [ ] Màn Tổng quan là trang chủ, hiển thị 4 thẻ đúng số liệu thật (đối chiếu vài đơn).
- [ ] Mọi luồng nghiệp vụ (tạo đơn, chuyển trạng thái, 3 luồng ngoại lệ, AI đọc ảnh, tracking, backup) **vẫn chạy y như trước** — 38/38 unit test vẫn xanh, typecheck sạch.
- [ ] Kiểm tra tay trên khổ điện thoại (~375px) và desktop.

## 9. Ghi chú triển khai

- Chia phase nhỏ (lập ở implementation plan): (1) token + component nền, (2) khung điều hướng sidebar/mobile + AppShell, (3) màn Tổng quan, (4) reskin từng màn + bảng→thẻ mobile, (5) đăng nhập + logo + rà mobile.
- Không sửa `src/lib/*` nghiệp vụ, `src/db/*`, server actions về mặt logic (chỉ thêm hàm đọc/đếm cho Tổng quan nếu cần).
- Verify bằng preview + chụp màn hình desktop & mobile; chạy `npm test` + `tsc` sau mỗi phase.
