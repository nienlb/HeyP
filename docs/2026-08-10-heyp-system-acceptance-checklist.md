---
title: Checklist nghiệm thu tổng — HeyP system (MVP)
type: acceptance-checklist
project: heyp-system
created: 2026-08-10
tags: [checklist, nghiem-thu, mvp]
---

# Checklist nghiệm thu tổng MVP

> Chạy tay toàn hệ thống trước khi bỏ Excel. Đề xuất: dùng thật **song song Excel 1 tuần** — nếu không sót đơn nào thì bỏ Excel.

## 3 tiêu chí thành công (spec mục 1)

- [ ] **Không rơi đơn**: mọi đơn đứng quá ngưỡng ngày ở một trạng thái đều tự nổi lên khu “Cần chú ý” ở màn Đơn hàng; đơn Sự cố luôn ở trên đầu.
- [ ] **Nhìn 1 màn biết hết**: mở màn Đơn hàng thấy ngay đơn nào ở khâu nào, đơn nào sự cố; màn Khách hàng thấy ai còn nợ bao nhiêu.
- [ ] **Tiền tính tự động**: báo giá & còn phải thu tính tự động, không bấm máy tính tay.

## Vòng đời đơn (Phase 2)

- [ ] Tạo đơn nhanh: chọn/tạo khách, thêm dòng sản phẩm, tiền tự tính, copy báo giá dán Zalo đúng mẫu HeyP.
- [ ] Chi tiết đơn: khối tiền đúng, timeline ghi ai đổi lúc nào, nút chuyển trạng thái một chạm chỉ hiện bước hợp lệ.
- [ ] Danh sách đơn: nhóm theo trạng thái, tìm theo tên khách / mã đơn.
- [ ] Để 1 đơn đứng quá ngưỡng → nổi lên đầu.

## Khách hàng, tồn kho & ngoại lệ (Phase 3)

- [ ] Khách hàng: tổng còn phải thu từng người, cờ cảnh báo hiện khi tạo đơn cho khách có cờ.
- [ ] Bán từ kho: trừ tồn, tính lãi/lỗ đúng.
- [ ] Nhập kho về VN → cộng tồn (giá vốn bình quân).
- [ ] Hàng lỗi NCC: tách dòng, tính lại tiền đơn, hàng vào kho nhãn Lỗi NCC.
- [ ] Đổi/trả: tách dòng, điều chỉnh tiền, hàng vào kho nhãn Đổi trả.
- [ ] Khách bom: hàng vào kho nhãn Hàng bom + tự gắn cờ khách.

## Ảnh (Phase 4)

- [ ] Đính đủ 4 loại ảnh vào một đơn, xem lại được.
- [ ] Tải ảnh từ gallery tồn kho về máy; copy ảnh để đăng bài.

## AI đọc ảnh Zalo (Phase 5)

- [ ] Kéo-thả ảnh chốt đơn → AI điền sẵn form đúng (tên/màu/size, Total, cọc, ship).
- [ ] Ảnh chốt đơn tự đính vào đơn khi lưu.
- [ ] Gemini lỗi/mất mạng → báo rõ, cho nhập tay, không kẹt luồng.

## Tracking (Phase 6)

- [ ] Thêm kiện, gắn đơn, cập nhật trạng thái tay.
- [ ] Kiện chế độ tự động (chưa có adapter) → gắn cờ “tra tay” đúng lúc.

## An toàn dữ liệu (Phase 7)

- [ ] Backup tự động chạy khi mở app (thấy bản mới ở màn Sao lưu).
- [ ] Đã **test khôi phục** từ backup ít nhất 1 lần (`npm run db:restore -- --list` rồi khôi phục), dữ liệu khớp.
- [ ] Backup giữ tối đa 30 bản, bản cũ tự xoá.

## Ghi chú vận hành

- Cấu hình qua `.env` (không sửa code khi lên VPS): tài khoản, ngưỡng ngày, key Gemini, chu kỳ tracking/backup.
- Khôi phục là thao tác **ghi đè** — chỉ chạy khi chủ động, nên tạo 1 backup mới trước khi khôi phục.
