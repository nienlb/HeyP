# HeyP — Thiết kế: tăng tốc & rút gọn luồng đơn

**Ngày:** 2026-08-20
**Trạng thái:** đã chốt, chờ lập kế hoạch thực thi
**Xuất phát:** "app chậm quá chậm" — cân nhắc chuyển sang Google Sheets + Apps Script

---

## 1. Bối cảnh & chẩn đoán

Câu hỏi ban đầu là có nên bỏ Next.js để chuyển sang Google Sheets + Apps Script.
Đo đạc cho thấy **Sheets không giải quyết được vấn đề**, vì nguyên nhân chậm
không nằm ở framework.

### 1.1 Số đo thật (2026-08-20, từ máy dev tại VN)

| Phép đo | Kết quả |
|---|---|
| TCP tới Supabase Sydney (`ap-southeast-2`) | **135 ms** (median, 4 lần) |
| TCP tới Singapore (`ap-southeast-1`) | **50 ms** (median, 4 lần) |
| 5 câu `COUNT`/`GROUP BY` tuần tự lên DB thật | **1.388 ms** |
| Kích thước DB thật | **11 MB** |
| Dữ liệu lúc đo | 6 đơn, 6 dòng sản phẩm, 14 ảnh — *đã xoá sạch ngày 2026-08-20, xem mục 6* |

1.388 ms cho năm câu đếm dòng trên bảng 6 dòng: gần như toàn bộ thời gian là
**độ trễ mạng đi Sydney**, không phải xử lý dữ liệu và không phải Next.js.

### 1.2 Bốn nguyên nhân

1. **Supabase đặt ở Sydney** — 135 ms mỗi vòng round-trip, trong khi Singapore chỉ 50 ms.
2. **Vercel chưa ghim region.** Repo không có `vercel.json` → function chạy ở
   region mặc định (`iad1`, Washington DC). Mỗi query đi **VN → Mỹ → Sydney → Mỹ → VN**.
3. **Query chạy tuần tự.** 10/12 trang `await` nối tiếp, chỉ 2 trang dùng
   `Promise.all`. `orders/[id]` có 7 vòng round-trip; `finance` và `reports` mỗi trang 5.
4. **Đổi trạng thái là full page reload.** Server action → revalidate → dựng lại
   cả trang chi tiết.

### 1.3 Vì sao không đi Google Sheets + Apps Script

- Apps Script chạy trên hạ tầng Google (thường ở Mỹ) → **không gần hơn Singapore**.
- Mỗi thao tác đọc/ghi `SpreadsheetApp` tốn 100–500 ms; `HtmlService` cold load 1–3 s;
  giới hạn 6 phút mỗi lần chạy.
- **Không có transaction thật** → không có gì thay thế được `withTx` trong `src/db/raw.ts`.
  Với ứng dụng đụng tiền thật, đây là rủi ro mất mát dữ liệu, không phải bất tiện.
- Toàn bộ `money.ts`, `order-status.ts`, `inventory.ts`, `cny-wallet.ts`, `pnl.ts`
  cùng 14 file test phải viết lại từ đầu.

Kết luận: **giữ Next.js, sửa đúng bốn nguyên nhân trên**, đồng thời làm việc mà
người dùng thực sự muốn — thiết kế lại luồng tạo đơn và theo dõi đơn.

---

## 2. Mục tiêu

| # | Mục tiêu | Đo bằng |
|---|---|---|
| M1 | Trang chi tiết đơn tải nhanh | ~2.000 ms → **≤ 200 ms** (deploy) |
| M2 | Bấm đổi trạng thái không phải chờ | **0 ms cảm nhận**, trang không nhảy về đầu |
| M3 | Rút ngắn số thao tác mỗi đơn | 8 lần bấm → **2 lần** |
| M4 | Tạo đơn không phải điền form dài | **3 ô bắt buộc**, phần còn lại bổ sung sau |
| M5 | Không đụng công thức tiền | `money` · `line-pricing` · `inventory` · `cny-wallet` · `pnl` · `payments` test **xanh, không sửa** |

**Ngoài phạm vi:** backup (người dùng nói tạm chưa quan tâm), adapter tracking,
đổi giao diện v2, chuyển khỏi Vercel/Supabase.

---

## 3. Trục trạng thái mới

### 3.1 Nguyên tắc

Thay vì bắt cả ba loại đơn bò qua một trục 9 bước chung, **mỗi loại đơn đi một
đường riêng, ngắn**.

```
order_ho    : Khách chốt → Đã mua, đang về → Đã giao khách → Hoàn tất
                             ↑ trừ ví ¥                        ↑ TỰ ĐỘNG
nhap_kho    : Đã mua, đang về → Về kho
                ↑ trừ ví ¥        ↑ cộng tồn kho (kết thúc)
ban_tu_kho  : Đã giao khách → Hoàn tất          (giữ nguyên như hiện tại)
```

### 3.2 Tái dùng mã trạng thái — không thêm mã mới, không đụng side-effect

Ba side-effect tiền/kho đang neo vào ba trạng thái khác nhau:

| Side-effect | Neo tại | Nguồn |
|---|---|---|
| Trừ ví ¥ + chốt cứng tỷ giá | `da_mua_tq` | `src/db/queries.ts:800` |
| Cộng tồn kho (đơn `nhap_kho`) | `ve_kho_vn` | `src/db/queries.ts:768` |
| Nhập kho hàng bom + gắn cờ khách | `khach_bom` | `src/db/queries.ts:782` |

Thiết kế **tái dùng đúng những mã đó** làm trạng thái gộp:

- `da_mua_tq` → đổi nhãn thành **"Đã mua, đang về"**, gộp cả `ve_kho_tq`,
  `dang_van_chuyen_vn`, `ve_kho_vn` của đơn `order_ho`. Ví ¥ vẫn neo đúng chỗ cũ.
- `ve_kho_vn` → giữ làm **điểm kết của `nhap_kho`**. Tồn kho vẫn neo đúng chỗ cũ.

**Cho về hưu 4 mã:** `cho_bao_gia`, `da_bao_gia`, `ve_kho_tq`, `dang_van_chuyen_vn`.

Hệ quả: **không phải viết lại side-effect nào**, chỉ sửa bảng luật đi/đến trong
`src/lib/order-status.ts`.

### 3.3 Nhánh ngoại lệ

| Nhánh | Xuất phát từ |
|---|---|
| `huy` | `khach_chot` (chưa mua thì mới huỷ được) |
| `su_co` | `da_mua_tq`, `da_giao_khach` |
| `khach_bom` | `da_giao_khach` |

Lưu ý: `nhap_kho` tạo ra đã ở `da_mua_tq` nên **không đi qua `khach_chot`, tức
không huỷ được** — đúng thực tế, vì tiền đã trả cho nhà cung cấp rồi. Muốn xử lý
hàng hỏng/không về thì dùng `su_co`.

`su_co` vẫn chưa phải trạng thái cuối: giải quyết xong quay lại `da_mua_tq` /
`da_giao_khach`, hoặc chuyển sang `huy` / `khach_bom`.

### 3.4 Tự động hoàn tất

Đơn ở `da_giao_khach` và `amount_due = 0` → tự chuyển `hoan_tat`.

**Bắt buộc đi qua `changeOrderStatus`** và ghi `order_status_history` y hệt bấm
tay. Không được `UPDATE orders SET status` thẳng — báo cáo lãi đọc ngày hoàn tất
từ `order_status_history` (`src/db/queries.ts:1521`), không đọc `orders.status_changed_at`.

**Hai điểm kích hoạt** (đơn có thể đạt điều kiện theo cả hai chiều):

1. Sau `syncOrderDeposit` trong `src/db/queries.ts` — khách trả nốt tiền lúc đơn
   đã ở `da_giao_khach`.
2. Ngay sau khi chuyển sang `da_giao_khach` — đơn đã thu đủ từ trước (ví dụ cọc
   100%) thì hoàn tất luôn, không bắt bấm thêm.

Cả hai đều gọi cùng một hàm, không nhân bản luật.

### 3.5 Kết quả

Đơn `order_ho` được tạo ra đã ở `khach_chot`, nên chỉ còn **2 lần bấm đổi
trạng thái**: → Đã mua, đang về → Đã giao khách. Hoàn tất tự chạy khi thu đủ tiền.

Hiện tại: tạo ra ở `cho_bao_gia`, phải bấm **8 lần** mới tới `hoan_tat`.

---

## 4. Tốc độ

### 4.1 Chuyển Supabase sang Singapore (`ap-southeast-1`)

135 ms → 50 ms. Supabase **không cho đổi region tại chỗ** — phải tạo project mới.

Vì DB đã trống (mục 6), việc này giờ chỉ còn: tạo project Singapore → chạy
`npm run db:migrate` → tạo bucket `photos` (private) → đặt lại 2 dòng `settings`
→ cập nhật biến môi trường trên Vercel và GitHub Actions secrets.
**Không cần dump/restore, không cần copy ảnh.**

### 4.2 Ghim Vercel về `sin1`

Thêm `vercel.json` với region `sin1`. Function và DB cùng vùng AWS →
**~2–5 ms/query** thay vì ~280 ms. Đây là thay đổi tạo khác biệt lớn nhất khi deploy.

### 4.3 Song song hoá query

| Trang | Trước | Sau |
|---|---|---|
| `orders/[id]` | 7 vòng | 1 |
| `finance`, `reports` | 5 vòng | 1 |
| `page.tsx` (Tổng quan) | 3 vòng còn lại | 1 |
| `inventory`, `customers`, `settings`, `tracking`, `orders`, `orders/new` | 2–4 vòng | 1 |

Thuần cơ học, không đụng nghiệp vụ.

### 4.4 Optimistic UI cho nút đổi trạng thái

`useOptimistic` (React 19, đã có sẵn): bấm → UI đổi tức thì → server action chạy
ngầm → lỗi thì tự bật lại và báo. Trang không dựng lại từ đầu.

### 4.5 Local dev

`next dev --turbo` để giảm thời gian biên dịch lại từng route.

### 4.6 Ảnh — GIỮ NGUYÊN kiến trúc hiện tại

**Quyết định: không dùng signed URL.** `CLAUDE.md` ghi rõ ảnh luôn đi qua route
đã xác thực (`/api/photo/[id]`) là quyết định có chủ đích; thiết kế này tôn trọng
điều đó. Thay đổi duy nhất: `Cache-Control` từ `private, max-age=3600` thành
`private, max-age=31536000, immutable` — nội dung một `photo.id` không bao giờ
đổi (file mới thì tạo bản ghi mới), nên cache vĩnh viễn là đúng và trình duyệt
sẽ không hỏi lại lần nào nữa. Sau khi về Singapore thì proxy cũng nhanh hẳn.

### 4.7 Kỳ vọng

| | Hiện tại | Sau |
|---|---|---|
| Chi tiết đơn (deploy) | ~2.000 ms | **~150 ms** |
| Bấm 1 bước trạng thái | ~1.500 ms + trang nhảy | **0 ms cảm nhận** |
| Local `npm run dev` | 135 ms/query | 50 ms/query |

---

## 5. Luồng tạo đơn

### 5.1 Đường chính: dán ảnh Zalo

Vùng thả ảnh chốt đơn Zalo nằm trên cùng và to nhất, **hỗ trợ dán bằng `Ctrl+V`**
(hiện phải chọn file). AI điền sẵn khách, sản phẩm, đơn giá, Total; người dùng
soát lại rồi lưu.

### 5.2 Chỉ 3 ô bắt buộc

| Bắt buộc | Gập trong "Thêm chi tiết" (đóng sẵn) |
|---|---|
| Tên khách | SĐT, địa chỉ |
| Sản phẩm (tên · SL · đơn giá ¥) | Loại đơn *(mặc định `order_ho`)* |
| Total đã chốt | Tỷ giá *(lấy từ `settings`)*, ship, cọc, ghi chú |

**Trạng thái khởi tạo theo loại đơn** — là bước đầu của trục tương ứng ở mục 3.1:

| Loại đơn | Tạo ra ở trạng thái |
|---|---|
| `order_ho` (mặc định) | `khach_chot` |
| `nhap_kho` | `da_mua_tq` |
| `ban_tu_kho` | `da_giao_khach` |

Khớp mục 3.2 — bỏ hẳn khâu báo giá.

### 5.3 Bổ sung sau: dùng cơ chế `orderGaps` sẵn có

`src/lib/order-gaps.ts` đã làm đúng việc này — **nhắc chứ không chặn**. Thiếu
SĐT/địa chỉ/ảnh sản phẩm/giá vốn → chấm cảnh báo ở danh sách đơn, bấm vào sửa
tại chỗ. Không phải viết mới.

**Một chỗ phải chỉnh:** `src/lib/order-gaps.ts:43` đang nhắc phí ship từ mốc
`ve_kho_vn` — mốc này về hưu với đơn `order_ho`. Chuyển sang nhắc từ
**`da_mua_tq`** ("Đã mua, đang về"). Nhắc hơi sớm, nhưng gaps chỉ nhắc chứ không
chặn, và thà sớm còn hơn phát hiện lúc đã giao hàng.

### 5.4 Tách nhỏ file

`src/app/orders/new/new-order-form.tsx` đang **721 dòng**, ôm 5 khối và ~20
`useState`. Tách thành `zalo-dropzone` · `customer-block` · `items-block` ·
`money-block`, mỗi mảnh một việc.

---

## 6. Dữ liệu: đã xoá sạch — không còn phải di trú

Ngày 2026-08-20, người dùng xác nhận toàn bộ dữ liệu trong Supabase chỉ là dữ
liệu chạy thử và yêu cầu xoá. Bằng chứng khớp: `cny_ledger` và `expenses` đều
rỗng dù có đơn đã đi qua `da_mua_tq`, số tiền toàn số tròn.

**Đã thực hiện:**

1. Sao lưu toàn bộ 12 bảng ra `backups/pre-clear-2026-08-20T16-56-09/data.json`
   (thư mục `backups/` nằm trong `.gitignore`).
2. Xoá 14 file ảnh trên Supabase Storage.
3. `TRUNCATE ... RESTART IDENTITY CASCADE` 11 bảng dữ liệu.
4. **Giữ lại `settings`** — đó là tham số nghiệp vụ, không phải dữ liệu đơn:
   `sell_rate = 4000`, `default_margin_vnd = 170000`.

### Ảnh hưởng tới kế hoạch — nhẹ đi đáng kể

| Trước | Giờ |
|---|---|
| Di trú 3 đơn sang mã trạng thái mới | **Không còn gì để di trú** |
| Đổi region phải `pg_dump` + restore + copy 14 ảnh | **Chỉ cần chạy `npm run db:migrate` trên project mới** + đặt lại 2 dòng `settings` |
| UI hành trình phải đọc được mã đã về hưu (đơn cũ) | Vẫn nên giữ cho bền, nhưng **không còn là đường chặn** |

Bảng dữ liệu trống cũng có nghĩa: **mục 8.1 bớt căng.** Không cần giữ project
Sydney làm đường lui nữa — không có dữ liệu nào để mất. Xoá Sydney rồi tạo
Singapore là xong, khỏi lo trần 2 project.

## 7. Test

Quét 14 file test: chỉ **2 file** nhắc tới trạng thái bị về hưu.

| Phải sửa | Giữ nguyên, phải xanh |
|---|---|
| `tests/order-status.test.ts` (13 chỗ) | `money` · `line-pricing` · `inventory` |
| `tests/order-gaps.test.ts` (1 chỗ) | `cny-wallet` · `pnl` · `payments` |

Đây là bằng chứng cho M5: **công thức tiền và tồn kho không bị chạm tới.**

**Test thêm mới:**
- Trục 4 bước theo từng loại đơn (`order_ho`, `nhap_kho`, `ban_tu_kho`).
- Không cho nhảy cóc / lùi trên trục mới.
- Luật tự động hoàn tất: `da_giao_khach` + `amount_due = 0` → `hoan_tat`,
  và có ghi `order_status_history`.
- Nhánh `huy` / `su_co` / `khach_bom` xuất phát đúng chỗ trên trục mới.

---

## 8. Chi phí

Kiểm tra thật: DB **11 MB** (free 500 MB), 14 ảnh, 7 lần chạy Actions/ngày.

| Khoản | Phát sinh? | Chi tiết |
|---|---|---|
| Vercel đổi region `sin1` | Không | Chỉ là setting; Hobby được chọn 1 region. |
| `Promise.all`, optimistic UI, form mới | Không | Thuần code. |
| Supabase dung lượng | Không | 11 MB / 500 MB; egress free 5 GB/tháng. |
| GitHub Actions | Không | ~210 phút/tháng, free private 2.000 phút. |
| **Supabase — số project** | **CÓ THỂ** | mục 8.1 |
| **Gemini API** | **CÓ THỂ** | mục 8.2 |

### 8.1 Supabase free chỉ cho 2 project mỗi organization

> **Đã hạ cấp rủi ro sau khi xoá dữ liệu (mục 6).** DB giờ trống, không có gì
> để mất, nên không cần giữ Sydney làm đường lui.

Cách làm gọn nhất: **xoá project Sydney trước, rồi tạo Singapore** → lúc nào
cũng chỉ có 1 project, không bao giờ chạm trần free 2 project/organization,
không phát sinh Pro ~$25/tháng.

Nếu vẫn muốn giữ Sydney vài ngày cho yên tâm thì được, miễn là organization
chưa có project thứ ba — kiểm tra nhanh trên dashboard trước.

### 8.2 Gemini quota

Thiết kế đẩy "dán ảnh Zalo" thành đường chính → rất dễ sa đà test lại nhiều lần,
mỗi lần ăn vào quota chung với đơn thật.

**Ràng buộc: 0 lần gọi Gemini live trong suốt quá trình làm.** Test bằng dữ liệu
giả qua `tests/zalo-extract.test.ts` và `tests/zalo-merge.test.ts` — hai file này
vốn đã chạy offline. Nghiệm thu bằng ảnh thật do **người dùng** tự dán, **một lần**,
sau khi mọi thứ đã xong.

### 8.3 Chi phí không phải tiền

Project Sydney giữ làm đường lui sẽ **tự pause sau 7 ngày** im lặng (đúng luật
free tier). Không mất dữ liệu, bấm restore là dậy.

---

## 9. Ràng buộc chống đốt token & đụng trần free tier

Đây là **luật khi thực thi**, không phải khuyến nghị:

1. **Gemini: 0 lần gọi live.** Gặp 429 → **dừng ngay**, không tự thử lại.
2. **`npm test` chạy một lần cho mỗi nhóm việc hoàn chỉnh**, không chạy lại sau
   từng dòng sửa.
3. **Không dựng preview server rồi chụp màn hình nhiều vòng** — mỗi giai đoạn
   nghiệm thu tối đa 1 lần.
4. **Không vòng lặp thử-sai lên DB thật** — query kiểm tra gộp một lần.
5. **Gặp lỗi quota / rate limit của bất kỳ dịch vụ nào → dừng và báo**, không tự xoay.
6. **Tắt hai workflow Actions trong lúc chuyển region**, để chúng khỏi fail lặp
   lại và ăn phút vô ích.

---

## 10. Thứ tự thực hiện & rủi ro

| # | Việc | Rủi ro |
|---|---|---|
| **0** | Kiểm tra số project Supabase (mục 8.1) | Thấp — DB đã trống nên chỉ cần xoá Sydney trước khi tạo Singapore |
| **1** | Singapore + ghim `sin1` + `Promise.all` + `--turbo` | Thấp — không đụng nghiệp vụ, thấy nhanh ngay |
| **2** | Trục 4 bước + tự động hoàn tất + di trú + test | Trung bình — đụng luật trạng thái |
| **3** | Optimistic UI nút trạng thái | Thấp |
| **4** | Form tạo đơn: dán ảnh, 3 ô, tách file | Thấp |

Làm bước 1 trước là có chủ đích: gỡ phần lớn cảm giác chậm mà không động vào
nghiệp vụ, nên nếu bước 2 trục trặc thì người dùng vẫn đang dùng app nhanh.

### Chặn rủi ro

**Đổi region Supabase** — DB trống nên gần như không còn rủi ro: không có dữ liệu
để mất, không có downtime đáng kể (chưa có ai đang dùng dữ liệu thật). Chỉ cần
nhớ cập nhật đủ 4 biến: `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` — ở cả Vercel lẫn GitHub Actions secrets.

**Tự động hoàn tất** — đụng ngày dùng cho báo cáo lãi. Bắt buộc đi qua
`changeOrderStatus` và ghi `order_status_history` như bấm tay (mục 3.4).

---

## 11. Việc phải cập nhật trong `CLAUDE.md` khi xong

- Vùng Supabase: Sydney → Singapore; ghi rõ đã ghim Vercel `sin1`.
- Trục trạng thái: 9 bước → 4, kèm bảng mã về hưu và ý nghĩa mới của `da_mua_tq`.
- Luật tự động hoàn tất và lý do bắt buộc đi qua `changeOrderStatus`.
- Ghi chú giữ nguyên quyết định proxy ảnh (không dùng signed URL).
- **Sửa câu đã lỗi thời:** CLAUDE.md đang ghi *"dữ liệu thật đã chuyển sang
  Supabase 14/08"* và *"`data/app.sqlite` là bản lùi lịch sử"*. Từ 2026-08-20
  Supabase đã trống (mục 6), nên câu này gây hiểu nhầm — phải sửa lại.
