---
title: HeyP v3-B — Ví ¥, chi phí, dòng tiền & báo cáo
type: design
project: heyp-system
created: 2026-08-11
status: đã duyệt
tags: [v3, vi-tệ, chi-phi, dong-tien, bao-cao, lai-lo]
---

# HeyP v3-B — Ví ¥, chi phí, dòng tiền & báo cáo

## 1. Bối cảnh

Spec thứ hai của v3. Spec thứ nhất — `docs/2026-08-11-heyp-v3a-gia-va-nhap-don-design.md` — đã ghi lại **số lượng ¥** tiêu cho mỗi đơn và **lời** của từng món. Tài liệu này bổ sung nốt phần còn thiếu để ra được con số lãi/lỗ thật:

- **giá vốn của 1¥** (v3-A không biết, chỉ dùng tỷ giá bán 4000 làm quy ước),
- **chi phí vận hành** (bao bì, tem, quảng cáo, lương…),
- **dòng tiền VND** theo thời gian,
- **báo cáo** ráp ba thứ trên lại.

**Phụ thuộc:** v3-B cần các cột do v3-A tạo ra (`order_items.margin_vnd`, `order_items.cost_confirmed`, `orders.quoted_total_vnd`). Làm v3-A trước.

## 2. Quyết định nền tảng

### 2.1 Không chép số dư ngân hàng

Số dư VND thật nằm ở ngân hàng. Chép về app là tạo ra **con số thứ hai cho cùng một sự thật** — hai con số đó chắc chắn sẽ lệch (một lần quên ghi, một khoản phí chuyển khoản), và khi lệch thì không biết tin cái nào. Một sổ quỹ *gần đúng* tệ hơn không có sổ quỹ.

App không trả lời *"còn bao nhiêu"* (ngân hàng lo việc đó) mà trả lời hai câu ngân hàng không trả lời được:

1. **Tiền đã chạy đi đâu trong tháng** — báo cáo dòng tiền.
2. **Trong số dư đó bao nhiêu thật sự là của mình** — báo cáo cơ cấu tài sản. App ngân hàng báo 10 triệu nhưng không nói rằng 4 triệu trong đó là cọc của khách cho hàng chưa mua.

Số dư **¥** thì ngược lại: không ai theo dõi, và nó quyết định giá vốn. Đó là thứ app phải giữ chính xác.

### 2.2 Sổ chuyển động, không lưu số dư

Không lưu cột `số_dư` và `giá_vốn_bq` rồi cập nhật mỗi giao dịch — một lần ghi hỏng giữa chừng là lệch vĩnh viễn, không truy ra được.

Lưu **mọi chuyển động**; số dư và giá vốn **tính lại bằng cách chạy lại sổ** mỗi lần đọc. Vài trăm dòng thì tức thì, và về nguyên tắc **không thể lệch**.

### 2.3 Chốt cứng giá vốn tại thời điểm mua

Khi đơn tiêu ¥, giá vốn bình quân lúc đó được **chốt cứng vào dòng sổ**. Nạp ¥ đợt sau rẻ hơn không được phép làm thay đổi lãi/lỗ của đơn đã mua rồi. Cùng lý do `orders.sale_cost` được chốt cứng ở MVP.

### 2.4 Kỳ ghi nhận lãi: tháng HOÀN TẤT

Đơn chỉ vào báo cáo lãi/lỗ khi đã chuyển **Hoàn tất**. Đơn đang chạy không tính — nhờ vậy con số lãi không bao giờ bị khách bom hay huỷ đơn làm sai ngược.

Ngày hoàn tất đọc từ `order_status_history` (dòng `to_status = 'hoan_tat'`), không đọc `orders.status_changed_at` — cột đó chỉ giữ lần đổi gần nhất.

## 3. Thay đổi cơ sở dữ liệu

```sql
-- Mọi biến động của ví ¥.
cny_ledger:
  id             INTEGER PRIMARY KEY AUTOINCREMENT
  kind           TEXT NOT NULL           -- 'nap' | 'chi' | 'dieu_chinh'
  cny_delta      REAL NOT NULL           -- +120 khi nạp, −60 khi mua hàng
  vnd_paid       INTEGER                 -- chỉ với 'nap': thực trả bao nhiêu VND
  rate_snapshot  INTEGER                 -- chỉ với 'chi'/'dieu_chinh': giá vốn bq đã chốt
  order_id       INTEGER REFERENCES orders(id)
  note           TEXT
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())

-- Chi phí VND.
expenses:
  id           INTEGER PRIMARY KEY AUTOINCREMENT
  spent_at     INTEGER NOT NULL
  category     TEXT NOT NULL             -- xem EXPENSE_CATEGORIES
  amount_vnd   INTEGER NOT NULL
  order_id     INTEGER REFERENCES orders(id)   -- NULL = chi phí theo kỳ
  method       TEXT NOT NULL DEFAULT 'chuyen_khoan'  -- 'chuyen_khoan' | 'tien_mat'
  note         TEXT

-- Sổ thu tiền của khách.
payments:
  id           INTEGER PRIMARY KEY AUTOINCREMENT
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE
  amount_vnd   INTEGER NOT NULL
  paid_at      INTEGER NOT NULL
  kind         TEXT NOT NULL             -- 'coc' | 'thu_not' | 'hoan_tra'
  method       TEXT NOT NULL DEFAULT 'chuyen_khoan'
  note         TEXT
```

Nhóm chi phí (`EXPENSE_CATEGORIES`): `bao_bi`, `tem_nhan`, `quang_cao`, `luong`, `ship_tra_shipper`, `den_khach`, `khac`.

Rút tiền trả lương nhân viên ghi vào đây như một khoản `luong` bình thường — không cần cơ chế riêng.

### `orders.deposit` đổi vai thành số dẫn xuất

Hiện `deposit` là số trần nhập tay, không ngày tháng. Thêm bảng `payments` mà vẫn để `deposit` nhập tay là rơi đúng bẫy hai nguồn chân lý ở mục 2.1. Nên:

> **`orders.deposit` = Σ `payments.amount_vnd` của đơn** (khoản `hoan_tra` mang dấu âm).

Công thức tiền **không đổi một chữ**: `còn phải thu = tiền hàng + ship − đã thu`. Chỉ là "đã thu" giờ có ngày tháng và biết tiền vào bằng đường nào. `money.ts` không phải sửa.

Khoản `hoan_tra` lưu `amount_vnd` **âm**, nên phép cộng vẫn đúng mà không cần nhánh riêng.

Hệ quả kỹ thuật: mọi thao tác thêm/sửa/xoá `payments` phải chạy lại `orders.deposit` và `orders.amount_due` trong cùng transaction — dùng lại `recomputeOrderMoneyRow` mà v3-A đã dựng. Ô nhập cọc ở màn tạo đơn không ghi thẳng vào `orders.deposit` nữa mà **sinh một dòng `payments`**.

**Backfill:** mỗi đơn đang có `deposit > 0` sinh một dòng `payments` với `kind = 'coc'`, `paid_at = orders.created_at`, `method = 'chuyen_khoan'`.

## 4. Module mới

Cả hai đều thuần, không đụng DB, cùng khuôn `money.ts` / `line-pricing.ts`.

### 4.1 `src/lib/cny-wallet.ts`

```
replayLedger(entries) → { balance: number; avgCost: number }
```

Chạy lại sổ theo thứ tự thời gian:

- **`nap`:** nếu số dư trước đó `> 0` → `avgCost = (dư × avgCost + vnd_trả) / (dư + ¥_vào)`.
  Nếu số dư `≤ 0` → **đặt lại** `avgCost = vnd_trả / ¥_vào`. Bình quân với số dư âm cho ra giá vốn vô nghĩa.
- **`chi`:** chỉ trừ số dư; `avgCost` không đổi.
- **`dieu_chinh`:** như `chi`, dùng khi giá ¥ của đơn được sửa sau lúc mua.

Hàm phụ `currentRate(entries)` trả `avgCost` hiện tại — dùng để chốt `rate_snapshot` khi ghi dòng `chi`.

### 4.2 `src/lib/pnl.ts`

Nhận dữ liệu thô của một tháng, trả về cấu trúc báo cáo lãi/lỗ. Thuần để test được mọi tổ hợp mà không cần dựng DB.

### 4.3 `src/lib/payments.ts`

```
sumPaid(payments) → number        // tổng đã thu, khoản hoan_tra âm nên tự trừ
amountDue(quotedTotal, shippingFee, payments) → number
```

Nhỏ nhưng tách riêng để `orders.deposit` chỉ có **một** chỗ tính, và test được không cần DB.

## 5. Trừ ví ¥ khi mua hàng

Dùng đúng cơ chế side-effect mà `changeOrderStatus` đã có sẵn cho tồn kho.

Khi đơn chuyển sang **`da_mua_tq`** (Đã mua hàng TQ):

1. Đọc `orders.goods_total_cny` (tổng ¥ của đơn, do v3-A duy trì).
2. Nếu bằng 0 → **không ghi dòng nào** (dòng chi 0¥ vô nghĩa), hiện cảnh báo *"đơn chưa có giá vốn — ví ¥ chưa bị trừ"*.
3. Ngược lại ghi một dòng `cny_ledger`: `kind = 'chi'`, `cny_delta = −goods_total_cny`, `rate_snapshot = currentRate(...)`, `order_id`.

Nếu sau đó giá ¥ của đơn được sửa (v3-A `updateLineCost`), app ghi thêm một dòng `dieu_chinh` bằng phần chênh, kèm `rate_snapshot` tại thời điểm điều chỉnh. **Sổ không bao giờ phải sửa quá khứ.**

**Đơn huỷ hoặc khách bom sau khi đã mua: không hoàn ¥.** Tiền đã tiêu thật, hàng đã về và đi vào tồn kho qua luồng sẵn có. Hoàn lại là ghi khống.

## 6. Ba báo cáo

Kỳ báo cáo = **tháng dương lịch**.

### 6.1 Dòng tiền tháng

```
Tiền vào    Σ payments.amount_vnd trong tháng
Tiền ra     Σ cny_ledger.vnd_paid (kind='nap')  +  Σ expenses.amount_vnd
─────────
Ròng        chênh lệch
```

Tách theo `method` (chuyển khoản / tiền mặt) để đối chiếu được với biến động số dư ngân hàng. Ngân hàng cho *số dư*, app cho *thành phần của biến động* — không ai chép của ai nên không có gì để lệch.

### 6.2 Lãi/lỗ tháng

Trên tập đơn **hoàn tất trong tháng**:

```
Doanh thu            Σ quoted_total_vnd
− Giá vốn hàng       Σ (¥đơn × rate_snapshot đã chốt)
= Lời gộp
     ├── Lời định giá       Σ order_items.margin_vnd
     └── Lời chênh tỷ giá   Σ ¥đơn × (exchange_rate − rate_snapshot)
+ Ship thu           Σ orders.shipping_fee
− Chi phí gắn đơn    Σ expenses có order_id thuộc tập đơn trên
                     (gồm ship_tra_shipper, den_khach — hiển thị tách theo nhóm)
− Chi phí theo kỳ    Σ expenses order_id IS NULL, spent_at trong tháng
+ Cọc giữ từ đơn khách bom   (xem dưới)
─────────
= Lãi ròng
```

**Hai khối tách bạch, không trộn** (theo v3-A mục 3.4):

- **Chắc chắn** — mọi dòng của đơn đã `cost_confirmed`.
- **Đang ước tính** — đơn còn dòng dùng giá ¥ gợi ý.

Một con số lãi dựng trên phỏng đoán mà trông như sự thật thì nguy hơn là không có con số nào.

**Đơn `ban_tu_kho`:** giá vốn lấy từ `orders.sale_cost`, không từ ví ¥ (hàng tồn kho không mua bằng ¥ ở thời điểm bán).

**Cọc đơn khách bom:** đơn bom không vào "Hoàn tất" nên không xuất hiện ở phần trên, trong khi cọc đã thu là tiền thật giữ được và hàng đã nằm trong kho (giá vốn đã vào `inventory.avgCost`). Nên báo cáo có một dòng riêng: Σ `payments` của các đơn chuyển sang `khach_bom` **trong tháng**.

### 6.3 Tiền của mình đang nằm ở đâu

Bảng **dẫn xuất hoàn toàn**, không cần ghi thêm dòng nào. Trình bày dưới dạng các khoản **cộng/trừ vào số dư ngân hàng bạn đang nhìn thấy** — app không lưu số dư đó, chỉ nói cho bạn biết phải điều chỉnh nó thế nào:

| Mục | Nguồn |
|---|---|
| *(Số dư ngân hàng — bạn tự nhìn ở app ngân hàng)* | không lưu |
| + ¥ đang giữ (quy VND theo `avgCost`) | `replayLedger` |
| + Hàng tồn kho (giá vốn) | Σ `inventory.quantity × avg_cost` |
| + Khách còn nợ | Σ `orders.amount_due` của đơn chưa kết thúc |
| **− Cọc đang giữ của đơn chưa giao** | Σ `payments` của đơn chưa tới `da_giao_khach` |
| = Tài sản ròng ước tính | |

Dòng trừ là chỗ dễ hiểu nhầm nhất nên nói rõ: cọc khách đã nằm **trong** số dư ngân hàng, nhưng nó chưa phải tiền của bạn — hàng chưa giao thì vẫn có thể phải trả lại. Trừ ra mới thấy con số thật.

## 7. Xử lý lỗi

| Tình huống | Xử |
|---|---|
| Ví ¥ âm | Cảnh báo *"Ví ¥ đang âm — có đợt nạp nào chưa ghi?"*, **không chặn**. Ghi được sự thật quan trọng hơn giữ sổ đẹp. |
| Nạp ¥ khi số dư ≤ 0 | Đặt lại giá vốn `= vnd_paid / cny_delta`, không bình quân với số dư âm |
| Nạp với ¥ hoặc VND bằng 0 / âm | Chặn — sẽ làm hỏng phép bình quân |
| Sửa/xoá một đợt nạp cũ | **Cho phép.** Số dư chạy lại từ sổ nên không sinh lệch; các đơn đã mua giữ nguyên lãi/lỗ nhờ `rate_snapshot` đã chốt cứng. |
| Sửa dòng `chi` | **Không cho** — sinh tự động từ việc đổi trạng thái đơn. Sai thì ghi `dieu_chinh`. |
| Mua hàng TQ khi đơn chưa có ¥ | Không ghi dòng chi. Cảnh báo; nhập ¥ sau thì ghi `dieu_chinh`. |
| Khách trả dư | Cho lưu, cảnh báo *"đã thu vượt X₫"* |
| Chi phí âm, hoặc `order_id` không tồn tại | Chặn |
| Tháng không có đơn hoàn tất nào | Báo cáo hiện 0, chi phí theo kỳ **không chia cho 0** — hiện nguyên tổng, ghi chú *"không có đơn nào để phân bổ"* |

## 8. Màn hình

| Nơi | Nội dung |
|---|---|
| `/finance` | **Ví ¥**: số dư, giá vốn bq, nút *Nạp ¥*, sổ chuyển động. **Chi phí**: danh sách + nút *Thêm chi phí* |
| `/reports` | Ba báo cáo, chọn tháng |
| Tổng quan | Thẻ **Ví ¥** (`còn 3.240¥ ≈ 12,3 triệu₫`) và thẻ **Lãi tháng này** |
| Chi tiết đơn | Khối **Thu tiền**: danh sách các lần trả + nút thêm |

Thu tiền không phải gõ thủ công — app tự đề xuất, người dùng bấm xác nhận:

- Tạo đơn từ ảnh có dòng *"Đã cọc: 100.000"* → đề xuất khoản `coc` 100.000₫ hôm nay.
- Chuyển sang **Hoàn tất** → đề xuất khoản `thu_not` đúng bằng phần còn phải thu.

Ngày sửa được, cho trường hợp khách trả hôm trước mà nay mới ghi.

Điều hướng: thêm `/finance` và `/reports` vào `src/app/_components/nav-config.ts` — một chỗ duy nhất.

## 9. Test

Khuôn hiện có: `node:test`, module thuần, không mạng không DB, import đuôi `.ts` tường minh.

**Mới:**
- `tests/cny-wallet.test.ts` — bình quân gia quyền qua nhiều đợt nạp; nạp khi số dư 0; **nạp khi số dư âm thì đặt lại giá vốn**; `chi` không làm đổi giá vốn; dòng `dieu_chinh`; sổ rỗng; số dư âm.
- `tests/pnl.test.ts` — tách lời định giá và lời chênh tỷ giá; chia chi phí kỳ theo số đơn; **tháng không có đơn nào thì không chia cho 0**; tách khối chắc chắn / ước tính; đơn `ban_tu_kho` dùng `sale_cost`; dòng cọc đơn khách bom.
- `tests/payments.test.ts` — `đã thu` và `còn phải thu` dẫn xuất đúng khi có nhiều lần trả, kể cả có khoản `hoan_tra`.

**Hồi quy — phải xanh, không được sửa test để cho qua:** `money`, `order-status`, `inventory`, và `line-pricing` + `order-gaps` của v3-A.

**Bằng tay:** nạp một đợt ¥ thật, cho một đơn đi qua *Đã mua hàng TQ*, kiểm số dư giảm đúng và `rate_snapshot` được chốt.

## 10. Ngoài phạm vi

- Sổ quỹ VND đầy đủ và đối chiếu số dư ngân hàng tự động. Có `payments` + `expenses` + `cny_ledger` rồi thì thêm sau lúc nào cũng được, rẻ.
- Nhiều tài khoản ngân hàng / nhiều ví VND.
- Xuất báo cáo ra Excel/PDF.
- Dự báo dòng tiền.
