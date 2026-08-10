---
title: Mẫu tin nhắn chốt đơn HeyP (tham chiếu thật)
type: reference
project: china-order-system
created: 2026-08-10
source: ảnh chụp Zalo Niên gửi 2026-08-10
tags: [reference, bao-gia, chot-don, zalo]
---

# Mẫu chốt đơn HeyP gửi khách qua Zalo

> Nguồn: ảnh chụp màn hình Zalo thật (Niên gửi). Dùng làm chuẩn cho:
> (1) text "Copy báo giá" ở màn tạo/chi tiết đơn, và
> (2) prompt AI đọc ảnh chốt đơn ở Phase 5 (đây là định dạng đầu ra kỳ vọng).

## Mẫu nguyên văn

```
Dạ vâng HeyP chốt đơn cho quý khách:

— Tên sp:
Aire tabi (như hình) - màu vàng - size 36

=> Total: 510.000
📌 Đã cọc: 100.000
📌 Còn lại: 410.000 + ship

Hàng về tiệm sẽ nhắn quý khách trước khi ship nhé.
————————————
Lưu ý:
❌ Hàng order không huỷ, không đổi trả (ngoại trừ lỗi từ nhà sản xuất hoặc từ shop như: không đúng sản phẩm, màu, size đã đặt).
✨ Tiệm tư vấn dựa trên bảng size của hãng & kinh nghiệm cá nhân. Mọi sự lựa chọn cuối cùng là của quý khách.
✨ Form bàn chân mỗi người là khác nhau. Mọi thông số của sản phẩm chỉ tương đối, không thể chuẩn 100% với tất cả mọi người. Vì vậy vấn đề rộng chật, tiệm chỉ có hỗ trợ đăng pass.
```

## Bóc tách cấu trúc

- **Câu mở cố định:** "Dạ vâng HeyP chốt đơn cho quý khách:"
- **Tên sp:** mỗi dòng dạng `<tên> (như hình) - <thuộc tính: màu, size…>`.
- **Khối tiền — toàn bộ VND, gọn cho khách (không nêu tệ/tỷ giá):**
  - `Total` = giá bán trọn gói (tiền hàng + phí dịch vụ), **CHƯA gồm ship**.
  - `Đã cọc`.
  - `Còn lại` = `Total − Đã cọc`, kèm chữ **"+ ship"** vì **ship tính/thu sau** khi hàng về tiệm.
  - Kiểm chứng số trong mẫu: 510.000 − 100.000 = 410.000 ✓.
- **Câu chốt lịch giao:** "Hàng về tiệm sẽ nhắn quý khách trước khi ship nhé."
- **Footer Lưu ý (boilerplate cố định):** chính sách + miễn trừ.

## Hệ quả cho thiết kế hệ thống

1. **Ship tính sau:** lúc chốt đơn chưa biết phí ship → tạo đơn với ship = 0, khi hàng về tiệm mới nhập ship và cập nhật "còn phải thu". Màn chi tiết cần cho **sửa khối tiền (nhất là ship) sau khi tạo**.
2. **Text báo giá** phải theo đúng mẫu này (câu mở + Total/cọc/còn lại + "+ ship" + footer Lưu ý), để dán thẳng vào Zalo. Đã hiện thực trong `buildQuoteText` + hằng `HEYP_QUOTE_TERMS` (src/lib/format.ts).
3. **Chính sách đổi/trả rất chặt:** chỉ nhận khi **lỗi NSX/shop** (sai sản phẩm, màu, size). Khớp luồng "hàng lỗi NCC" (7.1) và "đổi/trả" (7.2) ở Phase 3 — mặc định không cho đổi/trả trừ lỗi.
4. **"Hỗ trợ đăng pass":** hàng không vừa → không hoàn tiền, hỗ trợ pass lại (bán lại). Khớp cơ chế "hàng dội về tồn kho, bán ra như hàng sẵn" (spec mục 7) — món pass có thể vào tồn kho để bán lại.

## Điểm cần Niên xác nhận (không chặn Phase 3)

- Cách nhập giá: nhập **giá tệ × tỷ giá + phí dịch vụ** (hệ thống tự ra Total VND), hay nhập thẳng **Total VND** (số tròn) như khách nhìn thấy? Ảnh cho thấy Total là số tròn 510.000 → có thể Niên quen set thẳng giá VND. Sẽ tinh chỉnh form nhập ở vòng sau nếu cần.
