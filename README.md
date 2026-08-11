# HeyP — Hệ thống quản lý đơn order hộ

Ứng dụng web nội bộ giúp shop **HeyP** quản lý dịch vụ order hộ hàng Trung Quốc (giày/dép/thời trang): từ báo giá, chốt đơn, mua hộ, gom kho, vận chuyển về Việt Nam, tới giao khách và thu tiền — kèm quản lý tồn kho, đọc ảnh chốt đơn Zalo bằng AI, và tracking kiện.

Mục tiêu: **không rơi đơn**, **nhìn một màn biết hết**, **tiền tính tự động**.

## Tính năng

- 📋 **Đơn hàng** — tạo đơn nhanh, báo giá tự tính (copy gửi Zalo đúng mẫu HeyP), timeline trạng thái, chuyển trạng thái một chạm.
- 👥 **Khách hàng** — công nợ từng người, cờ cảnh báo (khách từng bom hàng).
- 📦 **Tồn kho** — giá vốn bình quân theo 4 nguồn nhập, bán từ kho (tính lãi/lỗ).
- 🔁 **3 luồng ngoại lệ** — hàng lỗi NCC, đổi/trả, khách bom (tự đổ về kho + điều chỉnh tiền).
- 🖼️ **Ảnh** — đính kèm theo đơn/tồn kho, gallery, tải về/copy để đăng bán.
- 🤖 **Đọc ảnh chốt đơn Zalo (AI)** — kéo-thả ảnh → Google Gemini đọc → điền sẵn form.
- 🚚 **Tracking** — quản kiện vận chuyển (nhập tay + khung tra tự động cắm-vào-được).
- 💾 **Sao lưu tự động** — snapshot dữ liệu + ảnh hằng ngày, giữ 30 bản, khôi phục được.

## Công nghệ

Next.js 15 (App Router) · React 19 · TypeScript · SQLite (`node:sqlite`) + Drizzle ORM · CSS thuần · Test bằng `node:test`. Chạy trên Node 26.

## Cài đặt & chạy

```bash
# 1. Cài phụ thuộc
npm install

# 2. Tạo file cấu hình từ mẫu rồi sửa (tài khoản, khoá phiên, GEMINI_API_KEY…)
cp .env.example .env

# 3. Tạo bảng dữ liệu
npm run db:migrate

# 4. (tuỳ chọn) Dữ liệu demo để xem thử
npm run db:seed-demo

# 5. Chạy
npm run dev            # http://localhost:3000
```

Tài khoản mặc định lấy từ `.env` (`APP_ACCOUNTS=user:pass,...`).

## Scripts

| Lệnh | Việc |
|---|---|
| `npm run dev` | Chạy dev server (port 3000) |
| `npm test` | Unit test (công thức tiền, luật trạng thái/tồn kho, báo giá…) |
| `npm run build` / `start` | Build & chạy production |
| `npm run db:migrate` | Áp migration SQL trong `drizzle/` |
| `npm run db:seed-demo` | Tạo dữ liệu demo |
| `npm run db:backup` | Sao lưu thủ công |
| `npm run db:restore -- --list` | Xem danh sách / khôi phục backup |

## Cấu trúc

```
src/
  app/            # trang & route (App Router): orders, customers, inventory, tracking, backup, api/…
    _components/  # component dùng chung (header/sidebar, upload ảnh, gallery…)
  db/             # schema (Drizzle) + queries (đọc Drizzle, ghi transaction node:sqlite)
  lib/            # nghiệp vụ thuần: money, order-status, inventory, format, zalo-extract, gemini, backup, tracking, config, auth
drizzle/          # migration SQL viết tay
scripts/          # migrate / seed / backup / restore (chạy bằng node)
tests/            # unit test (node:test)
docs/             # spec thiết kế, kế hoạch, nghiệm thu, tài liệu tham chiếu
```

Dữ liệu (`data/`), ảnh (`uploads/`), bản sao lưu (`backups/`) và `.env` **không** đưa lên git.

## Lưu ý phát triển

Xem `CLAUDE.md` để biết các quy ước và điểm cần lưu ý khi sửa (dùng `node:sqlite`, cách viết migration, transaction, gotcha về instrumentation/edge build, không reset DB có dữ liệu thật…).
