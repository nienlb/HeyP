---
title: HeyP v3-A — Bóc lớp giá & luồng nhập đơn từ Zalo
type: design
project: heyp-system
created: 2026-08-11
status: đã duyệt
tags: [v3, gia-von, loi, nhap-don, ai-doc-anh]
---

# HeyP v3-A — Bóc lớp giá & luồng nhập đơn từ Zalo

## 1. Bối cảnh

MVP (Phase 0–7) và v2 (giao diện) đã xong. v3 xử lý phần **logic tiền và chi phí** còn tồn đọng.

v3 chia làm hai spec độc lập:

| | Nội dung | Trạng thái |
|---|---|---|
| **v3-A** (tài liệu này) | Bóc lớp giá bán thành giá vốn/lời; luồng nhập đơn 3 mảnh; cờ "cần bổ sung" | Đã duyệt |
| **v3-B** | Chi phí phát sinh, dòng tiền (ví ¥ + tiền mặt), báo cáo tổng quan | Chưa viết |

Làm A trước vì A quyết định **giá vốn thật của một đơn**, mà đó chính là con số B cần để báo cáo lãi/lỗ. Ranh giới giữa hai spec:

- **A ghi *số lượng ¥* tiêu cho mỗi đơn** (¥ của từng món).
- **B ghi *giá vốn của 1¥*** (bình quân gia quyền các đợt nạp ¥) và chi phí vận hành.
- Lãi/lỗ thật = `Total − (¥ đơn × giá vốn ¥ bình quân) − chi phí phân bổ`.

## 2. Vấn đề đang gặp

**Công thức của chủ shop:** `giá tệ × 4000 + 170.000 tiền lời = giá bán`. Mức lời 170k thay đổi tùy món.

Bốn chỗ hỏng:

1. **Giá ¥ không được ghi lại.** Nhân sự tra 1688 ra giá ¥, tính nhẩm rồi nhắn khách trên Zalo. App chỉ nhận được ảnh chụp có mỗi `Total`. Giá vốn biến mất → không tính được lãi/lỗ.
2. **Lời không chỉnh được theo món.** Khối tiền hiện đặt ở cấp đơn (`orders.service_fee`), nên đơn nhiều món không tách được món nào lời bao nhiêu.
3. **4000 không phải tỷ giá thật.** Chủ shop mua ¥ rẻ hơn (khoảng 3.6–3.8, đổi theo đợt). Phần chênh là **lời ẩn lâu nay không nhìn thấy**.
4. **Đơn thiếu thông tin không tạo được.** Khách đã cọc 100k — đơn có thật, tiền có thật — nhưng thông tin khách tới sau, trong khi `orders.customer_id` đang `NOT NULL`.

## 3. Quyết định nền tảng

### 3.1 Total là dữ kiện, không phải kết quả

`Total` là con số khách đã đồng ý trên Zalo. Nó **bất biến**.

> Khi nhập hoặc sửa ¥, app giữ nguyên Total và tính lại lời.
> **Σ giá bán các món = Total đã chốt, luôn luôn.**

Kéo lời món này lên thì món kia tụt xuống, vì khách chỉ trả đúng ngần ấy.

**Total KHÔNG gồm ship.** Theo mẫu chốt đơn thật (`docs/reference-heyp-chot-don-template.md`), `Total` là tiền hàng trọn gói, còn ship tính và thu sau khi hàng về tiệm. Nên `quoted_total_vnd` không chứa ship, và bất biến ở trên chỉ áp cho khối tiền hàng. `shipping_fee` cộng vào sau, ở cấp đơn, không tham gia bóc lớp theo món.

### 3.2 Lời là phần dư, không phải khai báo

Không đi giải phương trình ngược (2 ẩn số, 1 phương trình — vô nghiệm khi đơn nhiều món). Thay vào đó: ¥ là sự thật bạn nhập, Total là dữ kiện, lời rơi ra:

```
lời của đơn = Total − Σ(¥ᵢ × tỷ giá bán)
```

170.000 chỉ còn là **giá trị mặc định khi điền trước**, không phải ràng buộc.

### 3.3 Bóc lớp ở cấp dòng sản phẩm

```
Giá bán món  =  ¥ × số lượng × tỷ_giá_bán  +  lời_món
                └─── giá vốn hàng ───┘         └─ chỉnh tự do ─┘
```

Khi báo cáo (v3-B rót số vào), mỗi món tách tiếp thành 4 lớp:

```
Giá bán món (khách trả)
├── Giá vốn hàng      = ¥ × tỷ giá VỐN thật       ← ví ¥ (v3-B)
├── Lời chênh tỷ giá  = ¥ × (4000 − tỷ giá vốn)   ← khoản lời ẩn
├── Chi phí phân bổ   = bao bì + tem + QC + ship lỗ ← v3-B
└── Lời ròng          = phần còn lại
```

### 3.4 Phân biệt số máy đoán và số người xác nhận

Nếu số gợi ý lặng lẽ thành sự thật, báo cáo lãi/lỗ sẽ dựng trên phỏng đoán mà chủ shop không hay biết. Nên mỗi dòng mang cờ `cost_confirmed`:

- **Chưa xác nhận:** số hiện chữ nhạt kèm nhãn *"gợi ý"*; đơn mang cờ *"thiếu giá vốn"*.
- **Xác nhận:** chạm vào ô — kể cả không sửa gì, chỉ bấm **Xác nhận** — số chuyển đen, cờ tắt.
- **Báo cáo tách hai khối:** *"lãi/lỗ chắc chắn"* (đã xác nhận) và *"đang ước tính"* (còn gợi ý). Không trộn.

### 3.5 Vì sao không mổ lại `money.ts`

Phương án tách hẳn cột `sell_total_vnd` / `cost_cny` / `sell_rate` cho ngữ nghĩa sạch hơn, nhưng buộc viết lại `money.ts`, toàn bộ test tiền và mọi màn đang đọc ba cột cũ — trên DB đang chứa **dữ liệu thật**. Rủi ro không xứng với lợi ích.

Thay vào đó giữ nguyên công thức `¥ × tỷ_giá + phí`, chỉ **hạ chi tiết xuống cấp dòng** và đổi vai các cột cấp đơn thành tổng dẫn xuất.

## 4. Thay đổi cơ sở dữ liệu

```sql
orders:
  + quoted_total_vnd  INTEGER NOT NULL DEFAULT 0   -- mỏ neo Total đã chốt với khách
  + ship_status       TEXT NOT NULL DEFAULT 'unknown'  -- 'unknown' | 'free' | 'set'
  ~ service_fee    → đổi tên margin_vnd            -- giờ là TỔNG lời của đơn
  ~ customer_id       NOT NULL → cho phép NULL

order_items:
  + margin_vnd        INTEGER NOT NULL DEFAULT 0   -- lời của món
  + cost_confirmed    INTEGER NOT NULL DEFAULT 0   -- boolean: ¥ do người xác nhận?

settings:                                          -- bảng mới, khoá-giá trị
    key    TEXT PRIMARY KEY
    value  TEXT NOT NULL
```

Bảng `settings` giữ hai mặc định chủ shop cần đổi được **lúc chạy** mà không phải sửa `.env` rồi khởi động lại: `sell_rate` (mặc định `4000`) và `default_margin_vnd` (mặc định `170000`). Đọc qua một hàm bọc có giá trị dự phòng, nên thiếu bản ghi cũng không vỡ. Các cấu hình hạ tầng (đường dẫn, khoá API) vẫn nằm ở `src/lib/config.ts` như cũ — bảng này chỉ dành cho tham số **nghiệp vụ**.

Ý nghĩa các cột sau thay đổi:

| Cột | Vai |
|---|---|
| `orders.exchange_rate` | **tỷ giá bán** (4000). Lưu theo từng đơn nên đổi mặc định không ảnh hưởng đơn cũ. |
| `orders.goods_total_cny` | tổng ¥ thật phải trả = Σ `unit_price_cny × quantity` các dòng (dẫn xuất). Riêng `ban_tu_kho` cột này vẫn giữ **giá bán VND** với `exchange_rate = 1`, y như hiện tại. |
| `orders.margin_vnd` | tổng lời = Σ `order_items.margin_vnd` (dẫn xuất) |
| `orders.quoted_total_vnd` | Total đã chốt — mỏ neo, không tự đổi |
| `order_items.unit_price_cny` | giá ¥ của món (đã có sẵn) |
| `order_items.margin_vnd` | lời của món |

**Không xoá cột nào, không đổi kiểu cột nào đang giữ dữ liệu thật.** Bốn cột thêm đều có mặc định; một ràng buộc được nới lỏng.

### Ghi chú migration

- `customer_id` nới `NOT NULL` cần dựng lại bảng (SQLite không `ALTER COLUMN`). Mọi đơn cũ đều đã có khách nên không mất dữ liệu.
- Backfill đơn cũ:
  - `quoted_total_vnd = goods_total_cny × exchange_rate + service_fee` (không gồm ship).
  - `ship_status = 'set'` nếu `shipping_fee > 0`, ngược lại `'unknown'`.
  - `margin_vnd`: dòng đầu tiên của mỗi đơn nhận trọn `service_fee` cũ, các dòng còn lại `0`. Bất biến Σ vẫn đúng ngay sau migration; chủ shop rải lại theo món sau nếu muốn.
  - `cost_confirmed = 1` cho mọi dòng cũ — giá ¥ đã nhập tay từ trước, không phải máy đoán.
- Nhớ tính bằng chuỗi trong JS rồi truyền tham số, **không** nối `|| số ||` trong SQL (`node:sqlite` bind số JS thành REAL → ra `"2.0"`).
- Chạy `npm run db:backup` trước khi migrate.
- Viết tay SQL trong `drizzle/0003_*.sql`, áp bằng `npm run db:migrate` — **không** dùng `drizzle-kit`.

## 5. Module mới

Bám khuôn hiện có: module thuần, không đụng DB, dễ unit test.

### 5.1 `src/lib/line-pricing.ts`

Lo việc rải và khớp lời giữa các dòng sản phẩm.

```
allocateMargins(quotedTotal, lines, sellRate, defaultMargin) → lời từng dòng
```

Bảo đảm cứng: **Σ (¥ᵢ × qtyᵢ × sellRate + lờiᵢ) = quotedTotal, không lệch dù 1₫.** Phần lẻ do làm tròn dồn vào dòng cuối.

Hàm phụ:
- `suggestCnyFromTotal(quotedTotal, lineCount, sellRate, defaultMargin)` — suy ngược ¥ gợi ý, chia đều cho các dòng.
- `redistribute(lines, changedIndex, newMargin, quotedTotal)` — kéo lời một dòng thì các dòng khác bù lại. **Luật bù:** phần lệch chia cho các dòng *còn lại* theo tỷ trọng giá vốn của chúng; phần lẻ làm tròn dồn vào dòng cuối trong nhóm còn lại. Đơn một dòng thì không kéo được (lời bị Total ghim cứng) — ô hiện dạng chỉ đọc kèm giải thích.
- `orderProfit(lines)` — tổng lời, có thể âm.

### 5.2 `src/lib/order-gaps.ts`

Cờ thiếu **không lưu trong DB** — tính lại mỗi lần đọc nên không bao giờ lệch thực tế.

```
orderGaps(order, items, photos) → danh sách mã thiếu
```

| Cờ | Điều kiện | Bắt đầu nhắc từ |
|---|---|---|
| `thieu_khach` | chưa gắn khách, hoặc khách thiếu SĐT/địa chỉ | ngay |
| `thieu_gia_von` | còn dòng `cost_confirmed = 0` (bỏ qua đơn `ban_tu_kho`) | ngay |
| `thieu_anh_sp` | đơn chưa có ảnh nào nhãn `product` | ngay |
| `thieu_ship` | `ship_status = 'unknown'` | khi trạng thái đạt `ve_kho_vn` |

Cờ chỉ **nhắc**, không chặn — đơn vẫn chạy trạng thái bình thường.

### 5.3 Mở rộng `src/lib/zalo-extract.ts`

Thêm bước **phân loại ảnh** vào schema hiện có. Một lần gọi Gemini cho cả nhóm ảnh, mỗi ảnh trả về `kind` + dữ liệu:

| `kind` | App làm gì |
|---|---|
| `chot_don` | Đọc như hiện tại → tên SP, Total, cọc, ship |
| `thong_tin_khach` | Đọc tên / SĐT / địa chỉ — chụp màn hình Zalo *hoặc* chụp giấy bằng điện thoại |
| `san_pham` | Chỉ lưu, không đọc |

Prompt giữ nguyên luật hiện có: không đọc được thì để `null`, **không bịa**.

## 6. Luồng nhập 3 mảnh

Màn **"Đơn mới từ Zalo"**, tối ưu cho điện thoại (chốt đơn chủ yếu trên điện thoại):

1. Một vùng thả ảnh lớn — chọn nhiều ảnh từ thư viện hoặc chụp thẳng. Có gì thả nấy, không ô nào bắt buộc.
2. Vài ô điền nhanh thông tin khách bên dưới, cho trường hợp không tiện chụp.
3. AI phân loại + đọc.
4. **Màn xác nhận:** mỗi ảnh hiện kèm **nhãn loại bấm đổi được** (phân loại sai là chuyện sẽ xảy ra — một chạm là sửa xong, không phải làm lại). Số tiền AI đọc được đặt **cạnh ảnh thu nhỏ** để đối chiếu bằng mắt.
5. Bấm **Tạo đơn** → đơn vào hệ thống ngay kèm cờ thiếu.

**Bổ sung sau** dùng đúng cơ chế đó: mở đơn đã có → thả thêm ảnh → AI đọc và điền vào chỗ trống. Không có luồng riêng để bảo trì.

Ảnh sản phẩm mặc định gắn vào **đơn**; kéo về đúng dòng sản phẩm nếu muốn (`photos` đã hỗ trợ cả `order_id` lẫn `order_item_id`).

## 7. Điền trước và gợi ý

Không bao giờ để người dùng đối diện ô trống.

| Ô | Nguồn gợi ý |
|---|---|
| Tỷ giá bán | 4000 — mặc định ở Cài đặt, sửa được cho từng đơn |
| Lời/món | 170.000 — mặc định ở Cài đặt |
| **¥ của món** | **1.** Đã từng order món cùng tên → ¥ lần gần nhất<br>**2.** Chưa từng → suy ngược `(Total − lời_mặc_định × số món) ÷ tỷ_giá_bán` |

Luật khớp lịch sử ở dòng **1**: so tên sản phẩm sau khi chuẩn hoá (bỏ dấu cách thừa, không phân biệt hoa thường), lấy `unit_price_cny` của dòng khớp gần đây nhất **đã `cost_confirmed`**. Không khớp chính xác thì bỏ qua, rơi xuống cách **2** — không đoán mò theo tên gần giống, vì gợi ý sai âm thầm còn tệ hơn không gợi ý.
| Khách | AI đọc từ ảnh; khớp SĐT/tên với khách cũ → gợi ý gắn vào khách đó |

> **Ví dụ.** Ảnh cho `Total 410.000`, món *Aire tabi*.
> Đã bán món này tháng trước giá 60¥ → app điền sẵn **60¥**, lời **170.000**, khớp đúng 410.000.
> Chưa từng bán → suy ngược `(410.000 − 170.000) ÷ 4000` = **60¥**. Vẫn ra số dùng được ngay.

> **Đơn nhiều món.** `Total 820.000`, 2 đôi. Gõ 62¥ và 58¥ → giá vốn 480.000, lời còn 340.000 → rải 170k/món, khớp ✓.
> Gõ 70¥ và 58¥ → giá vốn 512.000, lời chỉ còn 308.000 → app hiện *"lệch 32.000 so với mức 170k/món"* kèm nút **Chia theo tỷ trọng** (154k/154k). Kéo lại thành 120k/188k tùy ý.

Đơn nhiều món chưa có lịch sử thì chia đều ¥ suy ngược — số này chắc chắn sai lệch, nhưng cho một điểm xuất phát để kéo, hơn là ô trống.

## 8. Hai chiều dùng chung một mô hình

- **Đi xuôi (báo giá mới):** gõ ¥ + lời từng món → app cộng ra Total → **Copy** text chốt đơn sang Zalo (dùng `buildQuoteText` sẵn có).
- **Đi ngược (luồng chính):** Total từ ảnh là cố định → gõ ¥ → app rải lời.

Chưa gõ ¥ thì `¥ = 0`, toàn bộ Total nằm ở lời, cờ *thiếu giá vốn* bật.

### Đơn `ban_tu_kho` — giá vốn nằm chỗ khác

Hàng bán từ kho không có giá vốn tính bằng ¥; giá vốn của nó là **giá vốn tồn kho bình quân**, đã lưu ở `orders.sale_cost` từ MVP. Nên với loại đơn này:

- `margin_vnd` của các dòng để `0`, `cost_confirmed = 1` — bóc lớp theo ¥ không áp dụng.
- Lời tính riêng: `lời = quoted_total_vnd − sale_cost`, hiển thị ở khối tiền của đơn.
- Cờ `thieu_gia_von` không bật cho `ban_tu_kho`.

Nói cách khác `margin_vnd` **chỉ có nghĩa với đơn có giá vốn bằng ¥** (`order_ho`, `nhap_kho`). Tách bạch như vậy để không phải bịa một con số ¥ giả cho hàng tồn kho.

## 9. Xử lý lỗi

**Nguyên tắc gốc: AI không bao giờ đè lên số người dùng đã xác nhận.** Nó chỉ điền vào ô trống hoặc ô còn là gợi ý. Nhờ vậy thả nhầm ảnh, thả lại ảnh cũ, hay bổ sung ảnh vào đơn đã xong đều vô hại.

| Tình huống | Xử lý |
|---|---|
| AI hỏng / hết quota / chưa có key | Ảnh vẫn lưu, đơn vẫn tạo và điền tay được. AI là tiện ích, không phải chốt chặn. |
| AI đọc sai số tiền | Màn xác nhận đặt số đọc được cạnh ảnh thu nhỏ để đối chiếu. Ô không chắc để trống. |
| Σ giá bán món ≠ Total | Không thể xảy ra — `allocateMargins` bảo đảm bằng cấu trúc. |
| ¥ nhập cao hơn Total | Lời âm → cảnh báo *"đơn này đang lỗ 45.000₫"*, **không chặn**. Lỗ là chuyện có thật; giấu đi mới nguy. |
| Cọc > Total | Cảnh báo tương tự, vẫn cho lưu. |
| Thả 2 ảnh chốt cùng lúc | Mặc định một lần thả = một đơn. Thấy nhiều ảnh chốt → hỏi *"đây là 2 đơn riêng?"* rồi tách. |
| Migration trên DB thật | `npm run db:backup` trước. Cột thêm có mặc định; ràng buộc chỉ nới lỏng. |

## 10. Hiển thị

- **Màn Tổng quan:** thêm thẻ **"Cần bổ sung (N)"** → bấm ra danh sách đơn còn thiếu, nhóm theo loại thiếu.
- **Danh sách đơn:** mỗi đơn thiếu mang một chấm nhỏ báo hiệu.
- **Chi tiết đơn:** khối tiền hiện bảng bóc lớp từng món (¥ / giá vốn / lời), tổng lời của đơn, và cảnh báo nếu âm.
- Điều hướng thêm màn mới thì sửa `src/app/_components/nav-config.ts` — một chỗ duy nhất.

## 11. Test

Bám khuôn hiện có: `node:test`, module thuần, không mạng không DB, import bằng đuôi `.ts` tường minh.

**Mới:**
- `tests/line-pricing.test.ts` — rải lời mặc định; khớp Total tuyệt đối; phần lẻ làm tròn; lời âm; 1 món vs nhiều món; kéo lời một món thì món khác bù lại; đơn `ban_tu_kho` (tỷ giá 1).
- `tests/order-gaps.test.ts` — từng cờ bật/tắt đúng điều kiện; cờ ship chỉ hiện từ `ve_kho_vn` trở đi.
- `tests/zalo-extract.test.ts` — mở rộng: hàm thuần phân loại ảnh & parse, chạy trên JSON mẫu.

**Hồi quy — phải vẫn xanh, không được sửa test để cho qua:**
- Toàn bộ `tests/money.test.ts`.
- Toàn bộ `tests/order-status.test.ts` và `tests/inventory.test.ts` — v3-A không đụng vào luật trạng thái/tồn kho.

**Bằng tay:** chạy migration trên **bản sao** DB thật, đối chiếu tổng tiền vài đơn cũ trước/sau — số phải y hệt.

## 12. Ngoài phạm vi (để v3-B)

- Ví ¥: đợt nạp, tỷ giá vốn thật, bình quân gia quyền.
- Chi phí phát sinh: bao bì, tem, quảng cáo, lương.
- Dòng tiền: tiền mặt, rút trả lương.
- Báo cáo tổng quan lãi/lỗ theo kỳ.

v3-A chỉ chuẩn bị **chỗ chứa dữ liệu** cho những thứ trên: ¥ từng món và lời từng món.
