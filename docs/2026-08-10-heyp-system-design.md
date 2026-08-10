---
title: Thiết kế hệ thống quản lý đơn order hộ Trung Quốc
type: design-spec
project: heyp-system
owner: Niên
created: 2026-08-10
status: da-duyet-2026-08-10
tags: [design, order-ho, trung-quoc, mvp]
---

# Thiết kế hệ thống quản lý đơn order hộ Trung Quốc (MVP)

> Spec đã brainstorm và duyệt từng phần với Niên ngày 2026-08-10. Đây là tài liệu nguồn để lập implementation plan. Khi mở repo code, copy spec này vào repo.

## 1. Bối cảnh & mục tiêu

- Dự án riêng của Niên: dịch vụ **order hộ trọn gói** hàng nội địa Trung Quốc — khách VN gửi link Taobao/1688/Pinduoduo → báo giá → mua hộ → gom kho TQ → vận chuyển về VN → giao khách → thu tiền.
- Kèm nhánh phụ: **mua trước nhập kho để bán ngay** (order dư/mua sẵn, số lượng ít).
- Hiện trạng: đang chạy thật, quản thủ công bằng Excel/Zalo. Quy mô **< 20 đơn/ngày, 1–2 người vận hành**.
- **Điểm đau số 1 cần giải quyết: theo dõi trạng thái đơn** — sót/quên đơn trong chuỗi dài nhiều khâu.
- Người dùng: **chỉ nội bộ** (2 tài khoản). Khách vẫn giao tiếp qua Zalo, không có portal khách ở MVP.
- Nhập liệu: thủ công là chính + **bán tự động bám mã vận đơn** tuyến TQ→VN khi có thể.

### Tiêu chí thành công của MVP
1. Không còn đơn nào "rơi" — mọi đơn đứng quá lâu ở một trạng thái đều tự nổi lên màn hình chính.
2. Nhìn 1 màn hình biết ngay: đơn nào ở khâu nào, đơn nào có sự cố, khách nào còn nợ bao nhiêu.
3. Báo giá và số tiền phải thu tính tự động, không tính tay.

## 2. Phương án đã chọn

So sánh 3 hướng: (A) web app tự build, (B) no-code Lark/Airtable, (C) thuê SaaS order hộ.
**Chọn A — web app tự build**, vì chỉ A đáp ứng được yêu cầu bán tự động bám tracking; quy mô nhỏ nên app nhỏ, tự maintain nhẹ.

## 3. Kiến trúc tổng thể

Một web app duy nhất, 3 khối:

1. **Web UI nội bộ** — danh sách đơn, chi tiết đơn, form cập nhật. Đăng nhập đơn giản 2 tài khoản cố định, không phân quyền phức tạp.
2. **Database: SQLite** — một file duy nhất, backup = copy file. Đủ dùng cho quy mô này nhiều năm.
3. **Job bám tracking** — chạy nền trong app, mỗi 4 tiếng tra các mã vận đơn đang trên đường về VN.

**Tech stack:** Next.js (React) + SQLite.

**Triển khai theo giai đoạn (quyết định của Niên):**
- **Giai đoạn MVP: chạy local** trên máy Niên (localhost). Chấp nhận ràng buộc: job tracking chỉ chạy khi app đang bật.
- Sau khi MVP chứng minh giá trị → mới quyết chi phí đưa lên VPS/Railway (~5$/tháng) để 2 người dùng chung và job chạy 24/7.
- Ràng buộc thiết kế: mọi cấu hình qua biến môi trường, không hard-code đường dẫn, để "nhấc" lên VPS không phải sửa code.

## 4. Vòng đời đơn hàng

Trạng thái chính (trục xương sống):

```
Chờ báo giá → Đã báo giá → Khách chốt (đặt cọc) → Đã mua hàng TQ
→ Về kho TQ → Đang vận chuyển VN → Về kho/điểm nhận VN → Đã giao khách → Hoàn tất (đã thu đủ)
```

Trạng thái nhánh:
- **Hủy** — khách không chốt / hết hàng.
- **Sự cố** — thất lạc, thiếu hàng, hải quan giữ. Luôn nổi lên đầu danh sách.
- **Khách bom** — khách không nhận hàng (xem mục 7.3).

Luật chuyển trạng thái: chỉ cho chuyển tiến theo chuỗi hoặc sang trạng thái nhánh; không cho nhảy cóc ngược đời (ví dụ "Chờ báo giá" → "Đã giao"). Đơn bán từ kho sẵn được phép nhảy thẳng tới "Đã giao khách".

## 5. Mô hình dữ liệu

6 bảng chính:

1. **Khách hàng** — tên, SĐT/Zalo, địa chỉ giao, ghi chú, cờ cảnh báo (ví dụ "từng bom hàng").
2. **Đơn hàng** — thuộc 1 khách; **loại đơn**: `Order hộ` / `Nhập kho` / `Bán từ kho`; trạng thái vòng đời; ngày tạo; ghi chú. Khối tiền: tỷ giá chốt, tổng tiền hàng (tệ), phí dịch vụ, phí ship, đã cọc, còn phải thu. Công thức: `tiền hàng (tệ) × tỷ giá + phí dịch vụ + phí ship − đã cọc = còn phải thu`.
3. **Sản phẩm trong đơn** — mỗi dòng 1 link: link sản phẩm, tên hàng, thuộc tính (size/màu), số lượng, đơn giá tệ, mã đơn nội bộ TQ, trạng thái dòng (bình thường / lỗi NCC / đã trả).
4. **Kiện vận chuyển** — mã vận đơn TQ→VN, cân nặng, trạng thái tracking, lần tra gần nhất, chế độ (tự động / tra tay). Quan hệ nhiều-nhiều với đơn hàng: 1 đơn có thể tách nhiều kiện, 1 kiện gộp nhiều đơn (thực tế order hộ hay gộp bao).
5. **Tồn kho** — sản phẩm, số lượng còn, giá vốn bình quân (gồm ship + phí), ngày nhập gần nhất, **nguồn nhập**: `Nhập chủ động` / `Lỗi NCC` / `Đổi trả` / `Hàng bom`.

6. **Ảnh** — đường dẫn file trong thư mục `uploads/`, gắn vào đơn hàng / sản phẩm trong đơn / hàng tồn kho, ngày tải, **nhãn loại**: `Ảnh sản phẩm` (từ shop TQ) / `Ảnh chốt đơn Zalo` (bằng chứng khách chốt) / `Ảnh thực tế` (chụp khi nhận hàng — bằng chứng cho các luồng hàng lỗi, đổi trả, khiếu nại) / `Ảnh đăng bán`. Database chỉ lưu đường dẫn, file ảnh nằm trên đĩa.

Nhập kho từ đơn `Nhập kho` khi đơn về tới kho VN. Xuất kho khi tạo đơn `Bán từ kho` (tự trừ tồn, tính lãi/lỗ theo giá vốn).

## 6. Màn hình & tính năng MVP

1. **Danh sách đơn (màn hình chính)** — nhóm theo trạng thái, bộ lọc + tìm kiếm (tên khách / mã đơn / mã vận đơn). Nổi lên đầu: đơn **Sự cố** và đơn **đứng quá ngưỡng ngày ở một trạng thái** (ngưỡng cấu hình được, ví dụ "Đã mua" quá 5 ngày chưa về kho TQ).
2. **Chi tiết đơn** — timeline trạng thái (ai đổi, lúc nào), sản phẩm, kiện, khối tiền tự tính, nút chuyển trạng thái một chạm, nút "Đổi/trả", khu vực kéo-thả ảnh đính kèm (phân theo nhãn loại ảnh).
3. **Tạo đơn nhanh** — hai đường vào:
   - Nhập tay: chọn/tạo khách, dán link sản phẩm, nhập số lượng + giá tệ.
   - **Tạo đơn từ ảnh Zalo**: kéo-thả ảnh chụp màn hình khách chốt đơn → AI đọc ảnh trả về dữ liệu điền sẵn form → người vận hành kiểm tra/sửa rồi mới lưu (xem mục 8b).
   - Cả hai đường đều tự ra **báo giá dạng text để copy gửi Zalo**.
4. **Khách hàng** — danh sách khách + tổng còn phải thu từng người + cờ cảnh báo.
5. **Tồn kho** — hàng sẵn theo nguồn nhập, giá vốn, nút "Bán từ kho", **gallery ảnh từng món** + nút tải về/copy ảnh để tự đăng bài bán (Facebook/Zalo).
6. **Tracking** — kiện đang trên đường, kết quả lần tra gần nhất, cờ "tra tay" khi tra tự động thất bại.

**Ngoài phạm vi MVP** (vòng 2): báo cáo doanh thu/lãi lỗ tổng hợp, xuất Excel, thông báo tự động qua Zalo, portal khách tra cứu, **đăng bài bán hàng tự động lên Facebook/Zalo** (API phức tạp và hay thay đổi — MVP chỉ làm kho ảnh để tự đăng).

## 7. Ba luồng ngoại lệ

Cơ chế chung: **mọi hàng "dội ngược" đều đổ về Tồn kho với nhãn nguồn + giá vốn**, bán ra như hàng sẵn kho.

### 7.1. Hàng lỗi từ NCC
Phát hiện lỗi khi nhận hàng (kho TQ hoặc VN) → đánh dấu dòng sản phẩm "lỗi NCC", tách khỏi đơn khách (đơn gốc trừ tiền tương ứng, ghi chú) → nhập Tồn kho nhãn **Lỗi NCC** với giá vốn thực bỏ ra → bán giảm giá bằng đơn `Bán từ kho`, hệ thống tính lãi/lỗ so với giá vốn.

### 7.2. Khách đổi hàng
Trên đơn đã giao, nút "Đổi/trả": chọn sản phẩm trả → nhập lại Tồn kho nhãn **Đổi trả**; tiền ghi điều chỉnh trên đơn (hoàn hoặc trừ công nợ); khách lấy hàng khác → tạo đơn mới bình thường.

### 7.3. Khách bom hàng
Chuyển đơn sang trạng thái **Khách bom**: toàn bộ hàng nhập Tồn kho nhãn **Hàng bom**, giá vốn = tổng tiền đã bỏ ra − cọc đã thu (cọc không hoàn). Hồ sơ khách tự gắn cờ ⚠️ "từng bom hàng" — lần sau tạo đơn cho khách này, hệ thống hiện cảnh báo để yêu cầu cọc cao hơn hoặc từ chối.

## 8. Tracking bán tự động

- Mỗi nhà vận chuyển TQ→VN = một **adapter** tách riêng, giao diện duy nhất: `traCuu(mãVậnĐơn) → trạng thái`.
- Job nền mỗi 4 tiếng tra các kiện ở chế độ tự động đang trên đường.
- MVP làm **1 adapter** cho đơn vị vận chuyển Niên đang dùng. ⚠️ Chưa xác nhận tên đơn vị và khả năng tra cứu (API/trang công khai) — chốt ở bước implementation plan; đây là điều kiện tiên quyết của phần tự động.
- Nếu không tra tự động được: kiện chuyển chế độ "tra tay", hệ thống vẫn chạy đầy đủ bằng nhập tay — tính năng tự động là tăng tốc, không phải điều kiện sống còn.

## 8b. Tạo đơn từ ảnh Zalo (AI đọc ảnh)

- Không dùng OCR truyền thống (Tesseract...) — ảnh chat Zalo tiếng Việt đọc ra chữ rời rạc, không tự ghép thành dữ liệu đơn hàng được. Dùng **AI đa phương thức (Claude API)**: gửi ảnh → nhận về dữ liệu có cấu trúc (tên hàng, link, thuộc tính, số lượng, giá, thông tin khách nếu có).
- **Luôn có người duyệt**: kết quả AI chỉ điền sẵn form, người vận hành kiểm tra và sửa trước khi lưu. Không bao giờ tự tạo đơn thẳng từ ảnh — đọc sai một con số là mất tiền thật.
- Ảnh đã dùng để tạo đơn tự đính vào đơn với nhãn `Ảnh chốt đơn Zalo` — giữ làm bằng chứng khách đã chốt.
- API lỗi / mất mạng → form trống, nhập tay bình thường. Tính năng này là tăng tốc, không phải đường độc đạo.
- Chi phí: dùng model rẻ (Haiku), quy mô <20 đơn/ngày → không đáng kể (cỡ vài chục nghìn đồng/tháng). Cần API key cấu hình qua biến môi trường.

## 9. Xử lý lỗi & an toàn dữ liệu

- Tra cứu tracking thất bại → gắn cờ "tra tay", thử lại lần chạy sau, không làm app treo.
- Validate nhập liệu: tỷ giá / số lượng / giá > 0; chặn chuyển trạng thái sai luật (mục 4).
- **Backup tự động bắt buộc từ ngày đầu**: mỗi ngày copy file SQLite **và thư mục `uploads/`** sang thư mục backup, giữ 30 bản gần nhất.
- AI đọc ảnh lỗi (hết quota, mất mạng, ảnh mờ) → báo rõ trên form và cho nhập tay, không chặn luồng tạo đơn.

## 10. Kiểm thử

- **Unit test bắt buộc** cho 2 phần sai là mất tiền: công thức tính tiền và luật chuyển trạng thái (kể cả 3 luồng ngoại lệ: tách hàng lỗi, đổi trả, bom hàng — kiểm tra tiền và tồn kho khớp).
- Adapter tracking: test bằng mã vận đơn thật.
- AI đọc ảnh: test bằng 5–10 ảnh chốt đơn Zalo thật (đủ kiểu: có link, không link, nhiều sản phẩm, ảnh mờ) — đo xem điền sẵn đúng được bao nhiêu phần để chỉnh prompt.
- Còn lại: test tay theo checklist trước khi dùng thật.

## 11. Bước tiếp theo

1. Niên review spec này.
2. Lập implementation plan (skill writing-plans).
3. Mở repo code riêng (ngoài vault), copy spec vào, build MVP bằng Claude Code.
