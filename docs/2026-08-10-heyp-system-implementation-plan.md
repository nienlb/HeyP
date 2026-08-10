---
title: Implementation plan — hệ thống order hộ Trung Quốc (MVP)
type: implementation-plan
project: heyp-system
owner: Niên
created: 2026-08-10
status: san-sang-thuc-thi
spec: "[[2026-08-10-heyp-system-design]]"
tags: [plan, order-ho, trung-quoc, mvp]
---

# Implementation plan — MVP hệ thống order hộ TQ

> Thực thi theo spec đã duyệt: [[2026-08-10-heyp-system-design]]. Build bằng Claude Code trong **repo code riêng ngoài vault** (đề xuất: `~/Projects/heyp-system`). Mỗi phase kết thúc bằng tiêu chí nghiệm thu kiểm chứng được; xong phase nào chạy được phase đó — không chờ xong hết mới dùng.

## Nguyên tắc thực thi

1. Mỗi phase là một nhánh việc trọn vẹn: code + test + chạy thử tay → mới sang phase sau.
2. Từ Phase 3 trở đi hệ thống đã dùng thật được (chạy song song với Excel hiện tại).
3. Điều chỉnh phát sinh trong lúc build (Niên đã báo trước sẽ có) → sửa spec trước, code theo spec sau, để hai tài liệu không lệch nhau.
4. Cấu hình (API key, đường dẫn data, ngưỡng cảnh báo ngày) đều qua biến môi trường / file config — sẵn sàng lên VPS mà không sửa code.

## Phase 0 — Dựng khung repo (nửa buổi)

- Tạo repo `heyp-system`, git init, copy spec + plan này vào `docs/`.
- Next.js + TypeScript + SQLite (qua Drizzle hoặc Prisma), cấu trúc thư mục, biến môi trường mẫu (`.env.example`).
- Đăng nhập đơn giản: 2 tài khoản cố định trong config.
- **Nghiệm thu:** `npm run dev` mở được app trống có trang đăng nhập trên localhost.

## Phase 1 — Lõi dữ liệu & luật nghiệp vụ (1 buổi)

- Tạo 6 bảng theo spec mục 5 (Khách hàng, Đơn hàng, Sản phẩm trong đơn, Kiện, Tồn kho, Ảnh) + migration.
- Module tính tiền: `tiền hàng (tệ) × tỷ giá + phí dịch vụ + phí ship − đã cọc = còn phải thu`.
- Module luật chuyển trạng thái (spec mục 4): chuỗi chính, 3 nhánh (Hủy / Sự cố / Khách bom), ngoại lệ đơn `Bán từ kho` nhảy thẳng "Đã giao khách".
- **Nghiệm thu:** unit test xanh cho toàn bộ công thức tiền và ma trận chuyển trạng thái (hợp lệ + không hợp lệ).

## Phase 2 — Vòng đời đơn trên màn hình (1–2 buổi)

- Màn **Tạo đơn nhanh** (nhập tay): chọn/tạo khách, thêm dòng sản phẩm, tự tính báo giá, nút copy text báo giá gửi Zalo.
- Màn **Chi tiết đơn**: khối tiền, sản phẩm, timeline trạng thái (ai đổi, lúc nào), nút chuyển trạng thái một chạm.
- Màn **Danh sách đơn**: nhóm theo trạng thái, tìm kiếm (tên khách / mã đơn), đơn Sự cố + đơn đứng quá ngưỡng ngày nổi lên đầu (ngưỡng đọc từ config).
- **Nghiệm thu:** tạo 3 đơn giả, đi trọn vòng đời từ "Chờ báo giá" đến "Hoàn tất"; để 1 đơn đứng quá ngưỡng → thấy nó nổi lên đầu danh sách.

## Phase 3 — Khách hàng, tồn kho & 3 luồng ngoại lệ (1–2 buổi)

- Màn **Khách hàng**: danh sách + tổng còn phải thu + cờ cảnh báo; cảnh báo hiện khi tạo đơn cho khách có cờ.
- Màn **Tồn kho**: 4 nguồn nhập, giá vốn bình quân, nút "Bán từ kho" (tạo đơn `Bán từ kho`, trừ tồn, tính lãi/lỗ).
- Đơn loại `Nhập kho`: về tới kho VN thì cộng tồn.
- 3 luồng ngoại lệ (spec mục 7): tách hàng lỗi NCC về kho, nút "Đổi/trả", trạng thái "Khách bom" (nhập kho hàng bom + gắn cờ khách).
- **Nghiệm thu:** unit test tiền + tồn kho khớp cho cả 3 luồng; chạy tay mỗi luồng một kịch bản. **Từ đây bắt đầu dùng thật song song Excel.**

## Phase 4 — Ảnh (1 buổi)

- Thư mục `uploads/`, bảng Ảnh, kéo-thả ảnh ở Chi tiết đơn + Tạo đơn, chọn nhãn loại ảnh.
- Gallery ảnh ở Tồn kho + nút tải về/copy để tự đăng bài.
- **Nghiệm thu:** đính 4 loại ảnh vào một đơn, xem lại được; tải ảnh từ gallery tồn kho về máy.

## Phase 5 — Tạo đơn từ ảnh Zalo bằng AI (1 buổi)

- Module gọi Claude API (model Haiku, key qua biến môi trường): ảnh vào → JSON sản phẩm/số lượng/giá ra → điền sẵn form tạo đơn, người duyệt sửa rồi lưu; ảnh tự đính nhãn `Ảnh chốt đơn Zalo`.
- API lỗi/mất mạng → báo rõ, form trống nhập tay.
- **Nghiệm thu:** chạy 5–10 ảnh chốt đơn Zalo thật (đủ kiểu: có link, không link, nhiều sản phẩm, ảnh mờ), đo tỷ lệ điền đúng, chỉnh prompt đến khi đa số ảnh chỉ cần sửa nhẹ.

## Phase 6 — Tracking bán tự động (1–2 buổi)

- ⚠️ **Điều kiện tiên quyết: Niên cho biết tên đơn vị vận chuyển TQ→VN đang dùng** → khảo sát xem có API/trang tra cứu công khai không.
- Màn **Tracking** + bảng Kiện (gắn nhiều-nhiều với đơn) + job nền mỗi 4 tiếng + 1 adapter cho đơn vị đang dùng; kiện tra thất bại → cờ "tra tay".
- Nếu khảo sát ra không tra tự động được: làm màn Tracking thuần nhập tay, adapter để trống — hệ thống vẫn đầy đủ.
- **Nghiệm thu:** với 2–3 mã vận đơn thật đang trên đường, job tự cập nhật trạng thái đúng (hoặc gắn cờ tra tay đúng lúc).

## Phase 7 — An toàn dữ liệu & nghiệm thu tổng (nửa buổi)

- Backup tự động hàng ngày: file SQLite + `uploads/` → thư mục backup, giữ 30 bản; test khôi phục từ backup 1 lần.
- Checklist test tay toàn hệ thống; chạy song song Excel 1 tuần → nếu không sót đơn nào thì bỏ Excel.
- **Nghiệm thu MVP đạt khi:** đủ 3 tiêu chí thành công trong spec mục 1 (không rơi đơn, nhìn 1 màn biết hết, tiền tính tự động).

## Sau MVP (vòng 2 — chỉ làm khi MVP đã chạy ổn)

Quyết định VPS (~5$/tháng) để 2 người dùng chung + job 24/7 → báo cáo lãi/lỗ → xuất Excel → thông báo Zalo → đăng bài tự động → portal khách.

## Việc Niên cần chuẩn bị

1. Tên đơn vị vận chuyển TQ→VN đang dùng (cần trước Phase 6).
2. 5–10 ảnh chụp màn hình Zalo chốt đơn thật (cần trước Phase 5).
3. API key Claude (mình hướng dẫn tạo khi tới Phase 5).
4. File Excel đang quản đơn hiện tại — để đối chiếu cấu trúc dữ liệu ở Phase 1 và nhập liệu ban đầu.
