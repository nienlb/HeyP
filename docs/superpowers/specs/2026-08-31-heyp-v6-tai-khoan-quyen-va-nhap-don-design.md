# HeyP v6 — Tài khoản, phân quyền, xoá có kiểm soát & nhập đơn theo giá bán

**Ngày:** 31/08/2026
**Trạng thái:** đã chốt thiết kế, chờ viết kế hoạch triển khai

## 1. Bối cảnh

Sau v5, HeyP chạy được nhưng còn ba lỗ hổng vận hành:

1. **Tài khoản nằm trong `.env`** (`APP_ACCOUNTS="user:pass,..."`, mật khẩu
   plaintext). Muốn thêm người dùng phải sửa biến môi trường rồi deploy lại.
   Không có bảng `users`, không có vai trò, không có khái niệm khoá tài khoản.
2. **Không xoá được đơn hay khách.** Nhập nhầm một đơn thì nó nằm đó mãi, kéo
   theo cả bộ đếm "cần chú ý" và báo cáo.
3. **Nhập đơn vẫn bắt nghĩ theo giá vốn.** Người chốt đơn biết *giá phải thu*
   của khách, không biết giá ¥ — nhưng form lại đòi ¥ trước, còn tổng tiền thì
   phải gõ tay lần nữa.

Cộng thêm hai việc lặp tay mỗi ngày: đánh dấu từng đơn khi cả lô hàng về, và
gắn ảnh sản phẩm vào món (cột `photos.order_item_id` có trong schema từ MVP
nhưng **chưa đường nào ghi vào**).

## 2. Phạm vi

Năm phần, hai khối phụ thuộc nhau:

| Phần | Nội dung | Phụ thuộc |
| --- | --- | --- |
| 1 | Bảng `users`, hash mật khẩu, vai trò, màn quản trị | — |
| 2 | Xoá đơn/khách có kiểm soát + nhật ký xoá | phần 1 |
| 3 | Nhập đơn theo giá phải thu + ảnh theo món | — |
| 4 | Chọn nhiều đơn, chuyển bước hàng loạt | — |
| 5 | Thêm/xoá món trong đơn đã tạo | phần 3 |

**Ngoài phạm vi (YAGNI):** quên mật khẩu qua email, 2FA, nhật ký toàn bộ thao
tác (chỉ ghi nhật ký xoá), khôi phục đơn đã xoá, quyền chi tiết theo từng màn,
phân quyền theo dữ liệu (kiểu "nhân viên chỉ thấy đơn của mình").

---

## 3. Phần 1 — Tài khoản & phân quyền

### 3.1 Mô hình quyền

**Đúng hai vai trò cố định**, không có bảng quyền chi tiết:

- `admin` — làm mọi thứ, kể cả xoá và quản lý tài khoản.
- `nhan_vien` — làm mọi thứ **trừ** xoá đơn/khách và trừ khu quản trị.

Mọi chỗ kiểm quyền rút về một biểu thức: `session.role === "admin"`. Với app
2–4 người, mô hình chi tiết hơn chỉ tạo thêm chỗ để sót.

### 3.2 Bảng `users`

```
users
  id             serial   pk
  username       text     not null unique
  password_hash  text     not null
  role           text     not null   -- 'admin' | 'nhan_vien'
  active         boolean  not null default true
  created_at     bigint   not null default (epoch)
```

Enum `USER_ROLES` là nguồn chân lý ở `src/lib/roles.ts` (module thuần), schema
import từ đó — cùng cách `ORDER_STATUSES` đang làm.

### 3.3 Hash mật khẩu

Dùng **`node:crypto.scrypt`**, không thêm dependency. Dự án không có framework
UI, không có thư viện test — thêm `bcrypt`/`argon2` (native module) chỉ để hash
mật khẩu cho 4 tài khoản là không đáng, lại thêm rủi ro build trên Vercel.

Chuỗi lưu **tự mô tả tham số** để đổi tham số sau này vẫn verify được bản cũ:

```
scrypt$16384$8$1$<salt_base64>$<hash_base64>
```

Module thuần `src/lib/password.ts`: `hashPassword(plain)`, `verifyPassword(plain, stored)`.
So sánh bằng `timingSafeEqual`. Luật mật khẩu: tối thiểu 6 ký tự, không có yêu
cầu ký tự đặc biệt (app nội bộ, 2 người dùng — luật rườm rà chỉ đẻ ra mật khẩu
ghi trên giấy).

### 3.4 Nạp lần đầu từ `.env`

`ensureUsersSeeded()` gọi ở đầu `loginAction`, **trước** khi verify:

- `SELECT count(*) FROM users` = 0 → tạo tài khoản từ `config.accounts`
  (hash lại mật khẩu), người **đầu tiên** nhận `role = 'admin'`, còn lại
  `nhan_vien`.
- Dùng `INSERT ... ON CONFLICT (username) DO NOTHING` — hai request đăng nhập
  cùng lúc không nhân đôi tài khoản.
- Sau lần nạp đó, `APP_ACCOUNTS` **hết tác dụng**: `findAccount()` bị gỡ khỏi
  đường đăng nhập, `config.accounts` chỉ còn là hạt giống. Không có cửa hậu
  song song — một nguồn chân lý duy nhất là bảng `users`.

### 3.5 Session — đổi bản chất

Hiện tại token là `base64(username).timestamp.chữ_ký` và **không đọc DB lần
nào**. Hệ quả: khoá hay xoá một tài khoản không có tác dụng gì, cookie của họ
vẫn sống đủ 30 ngày. Không sửa chỗ này thì màn quản trị chỉ là trang trí.

Thiết kế mới:

- Token mang **`userId`** thay vì username: `base64(id).timestamp.chữ_ký`.
- `getSession()` verify chữ ký → `SELECT id, username, role, active FROM users
  WHERE id = $1` → trả `null` nếu không tồn tại **hoặc** `active = false`.
- Trả về `{ id, username, role }` thay cho `{ username }`.
- Bọc bằng React `cache()` — một lần render chỉ đi một truy vấn dù nhiều nơi
  gọi `requireAuth()`.
- `requireAdmin()` mới: không phải admin → `redirect("/")`.

**Chi phí:** thêm một truy vấn khoá chính trên đường tới hạn của mọi trang.
Với 2–4 người dùng, chi phí này không đáng kể so với việc "khoá tài khoản"
thực sự có hiệu lực.

**Ảnh hưởng khi lên bản:** cookie định dạng cũ (mang username) không còn hợp
lệ → mọi người phải đăng nhập lại **một lần**. Chấp nhận được.

### 3.6 Màn `/admin/users`

Chỉ admin thấy trong điều hướng và mới vào được (chặn ở cả trang lẫn từng
server action — không dựa vào việc giấu nút).

- **Danh sách:** tên tài khoản · vai trò · *Đang hoạt động* / *Đã khoá* · ngày tạo.
- **Nút `+`** ở header → Sheet *Thêm thành viên*: tài khoản, mật khẩu, vai trò.
- **Chạm một dòng** → Sheet: Đổi vai trò · Đặt lại mật khẩu · Khoá / Mở khoá · Xoá.

**Chặn cứng (kiểm ở server action, không chỉ ở UI):**

- Không tự khoá, tự hạ vai trò, tự xoá chính mình.
- Không được để hệ thống còn **0 admin đang hoạt động** — chặn cả xoá, khoá và
  hạ vai trò của admin cuối cùng.

Xoá một tài khoản **không** đụng tới dữ liệu họ đã tạo: `order_status_history.
changed_by` lưu username dạng chuỗi, giữ nguyên như một dấu vết lịch sử.

### 3.7 Đổi mật khẩu

- **Tự đổi** ở `/settings`: mật khẩu hiện tại + mật khẩu mới. Phiên của chính
  mình vẫn sống (không có `token_version` — thêm khái niệm đó không đáng).
- **Admin đặt lại** mật khẩu cho người khác trong Sheet ở `/admin/users`,
  không cần biết mật khẩu cũ.

### 3.8 Điều hướng

`nav-config.ts` đổi từ hằng số sang **`navItemsFor(role)`** trả về
`{ main, more }`. Mục `/admin/users` và `/admin/deletions` chỉ có mặt khi
`role === "admin"`. Giữ đúng luật hiện hành: thêm màn chỉ sửa một chỗ.

---

## 4. Phần 2 — Xoá có kiểm soát

### 4.1 Chính sách: xoá cứng, nhưng chặn đơn đã có dấu vết

Không dùng xoá mềm. Xoá mềm buộc phải thêm điều kiện lọc vào **rất nhiều** câu
SQL đang có (danh sách, ba báo cáo tài chính, ví ¥, tồn kho) — sót một chỗ là
báo cáo sai âm thầm, đúng loại lỗi tốn tiền thật mà `CLAUDE.md` đã cảnh báo.

Thay vào đó: chỉ cho xoá những đơn **chưa để lại dấu vết nào**.

### 4.2 Module thuần `src/lib/deletion.ts`

```
canDeleteOrder({ status, hasLedgerEntry, hasPayments, hasExpenses })
  → { ok: true } | { ok: false, reason: string }
```

Chặn khi:

| Điều kiện | Vì sao |
| --- | --- |
| có dòng `cny_ledger` gắn đơn | ví ¥ đã bị trừ, xoá đơn = ví lệch vĩnh viễn |
| có dòng `payments` | khách đã trả tiền thật |
| có dòng `expenses` gắn đơn | chi phí đã ghi vào sổ |
| status ∈ {`ve_kho_vn`, `hoan_tat`, `khach_bom`} | tồn kho đã cộng theo đơn này |

Còn lại — chủ yếu đơn ở `khach_chot`, tức đơn nhập nhầm hoặc nhập thử — xoá
thoải mái. Thông báo khi bị chặn phải **nói thẳng lý do và lối đi thay thế**:

> Đơn đã trừ 320 ¥ khỏi ví — dùng **Hủy** hoặc **Sự cố** thay vì xoá.

```
canDeleteCustomer({ orderCount })
  → chặn khi orderCount > 0: "Khách còn 3 đơn — xoá đơn trước."
```

(FK `orders.customer_id` không cascade nên xoá thẳng sẽ lỗi ở tầng DB; kiểm ở
tầng nghiệp vụ để thông báo đọc được.)

### 4.3 Cơ chế xoá

Xoá `orders` → cascade tự dọn `order_items`, `photos`, `order_status_history`,
`order_packages`, `payments`.

**File ảnh trên Supabase Storage không nằm trong cascade** — phải đọc
`file_path` của mọi ảnh thuộc đơn **trước** khi xoá, rồi gọi `deletePhotoFile`
sau khi transaction commit. Xoá file lỗi thì bỏ qua (log), không chặn: dữ liệu
đã sạch, chỉ còn file mồ côi trong bucket.

### 4.4 Nhật ký xoá

```
deletion_log
  id          serial  pk
  entity      text    not null   -- 'order' | 'customer'
  entity_id   integer not null
  deleted_by  text    not null   -- username
  deleted_at  bigint  not null default (epoch)
  snapshot    text    not null   -- JSON: đơn + món + lịch sử trạng thái
```

Ghi **trong cùng transaction** với việc xoá — dùng `x` được truyền vào `withTx`,
không dùng `raw` toàn cục. Xem ở `/admin/deletions` (chỉ admin), danh sách mới
nhất trước, chạm một dòng để xem JSON. Đây là thứ duy nhất trả lời được câu
"đơn đó đi đâu mất rồi?" khi có người thứ ba dùng app.

### 4.5 UI

- Nút **Xoá đơn** nằm trong Sheet ở tab cuối của màn chi tiết đơn.
- Nút **Xoá khách** trong Sheet của dòng khách ở `/customers`.
- Nhân viên **không thấy** hai nút này.
- Xác nhận hai bước: Sheet hiện tóm tắt rồi mới tới nút đỏ.

> **Xoá đơn #12** · Nguyễn A · 2 món · 4.520.000 ₫
> Không khôi phục được.  `[Huỷ]` `[Xoá đơn]`

---

## 5. Phần 3 — Nhập đơn theo giá phải thu

### 5.1 Đảo chiều nhập giá

Hiện nay: nhập ¥ từng món + gõ Total → lời là phần dư.
Từ v6: nhập **giá phải thu cho 1 cái** ở từng món → Total là Σ các dòng, ¥ được
suy ngược và đánh dấu là số máy đoán.

Hàm thuần mới trong `src/lib/line-pricing.ts`:

```
cnyFromSellPrice(sellVnd, sellRate, defaultMargin): number
  = max(0, làm_tròn_2_số_lẻ((sellVnd − defaultMargin) / sellRate))
```

Ví dụ: thu 1.000.000 ₫, tỷ giá 3.600, lời mặc định 170.000 → **≈ 230,56 ¥**.
Dòng dùng số này giữ `costConfirmed = false`, đúng quy ước sẵn có: số máy đoán
không được tính vào phần "chắc chắn" của báo cáo lãi.

Biên: `sellVnd ≤ defaultMargin` → ¥ = 0 (toàn bộ giá thu là lời), form hiện
ghi chú nhẹ chứ không chặn. `sellRate ≤ 0` → ¥ = 0.

**Lời của dòng** = `giá_thu × SL − round(SL × ¥ × tỷ_giá)`. Vì ¥ làm tròn hai
số lẻ nên phần lẻ tự rơi vào lời → **Σ giá bán = Total không lệch 1 ₫**, đúng
luật đang bị `tests/line-pricing.test.ts` khoá.

**Ai tính lời:** client tính sẵn `marginVnd` từng dòng và gửi kèm trong JSON
`items`; `createOrder` đi nhánh `hasMargins` sẵn có và **không** gọi
`allocateMargins`. Nhánh `allocateMargins` của `createOrder` giữ nguyên cho
đường tạo đơn từ ảnh (chưa có lời theo dòng).

### 5.2 Sheet thêm món

Thứ tự trường đổi theo cách đọc đơn thật:

1. **Tên hàng** \*
2. **Size / màu**
3. **Số lượng** \* (mặc định 1)
4. **Giá phải thu (₫) — cho 1 cái** \* ← ô mới, thay chỗ ô ¥ bắt buộc
5. **Ảnh sản phẩm** — xem 5.3
6. *(khối gập «Giá vốn & link»)*
   - **Đơn giá ¥** — điền sẵn số suy ngược, nhãn *«máy tính»*; gõ tay → thành
     giá vốn đã xác nhận (`costConfirmed = true`), đúng hành vi hiện có.
   - **Link sản phẩm**

Mọi ô nhập giữ `font-size: var(--fs-3)` (16px) — luật cứng chống Safari iOS tự
phóng to. Kiểm bằng đoạn `getComputedStyle` trong `CLAUDE.md` sau khi thêm form.

### 5.3 Ảnh gắn theo món

- Nút `+ Ảnh` mở `<input type="file" accept="image/*" multiple>` — iPhone tự
  hỏi *Chụp ảnh* / *Chọn từ thư viện*.
- **Upload ngay lúc chọn** qua `/api/upload` (`label=product`, chưa có
  `orderId`) → nhận `ids`, hiện thumbnail trong Sheet, mỗi ảnh có nút xoá
  (gọi `deletePhotoAction`, đúng cách `QuickImportSheet` đang làm).
- `ItemRow` mang thêm `photos: { id, url }[]`, gửi kèm trong JSON `items`.
- Sau khi tạo đơn, gắn ảnh vào đúng dòng.
- Thẻ món ngoài danh sách hiện thumbnail đầu tiên.

Ảnh mồ côi (chọn ảnh rồi bỏ đơn giữa chừng) — chấp nhận, giống hành vi sẵn có
của luồng nhập nhanh từ ảnh.

### 5.4 Ba chỗ hạ tầng phải sửa

1. **`createOrder` trả `{ orderId, itemIds }`** thay vì chỉ `orderId` — cần id
   từng món (đúng thứ tự) để gắn ảnh. Chỗ gọi thứ hai là nhập kho chủ động
   (`/inventory`), sửa theo.
2. **`linkPhotoToOrderItem(photoId, orderItemId, orderId)`** mới trong
   `queries.ts`. Cột `photos.order_item_id` có trong schema từ MVP nhưng chưa
   đường nào ghi vào.
3. **`validateLineItem` bỏ điều kiện `unitPriceCny > 0`**, chỉ còn
   `quantity > 0`.

   Điểm (3) sửa một lỗi âm thầm đang có: `createOrderAction` gọi
   `validateLineItem` và trả lỗi *"số lượng và đơn giá phải lớn hơn 0"*, trong
   khi `canSubmit` ở client **không** kiểm ¥ và comment ngay trên đó ghi "Giá ¥
   cũng không bắt buộc". Món không có ¥ (gợi ý trả 0) bị server chặn với thông
   báo sai lệch. Spec v3-A vốn đã cho phép đơn thiếu giá vốn — cờ `thieu_gia_von`
   của `order-gaps` lo phần nhắc bổ sung.

### 5.5 Màn tạo đơn

- Ô **"Tổng chốt khách"** rời khỏi thân form. Total = Σ các dòng, hiện ở
  `StickyBar` (đã có sẵn chỗ).
- Ô ghi đè chuyển vào khối gập, tên **"Chốt số khác với tổng món"**: bỏ trống →
  dùng Σ; nhập số khác (khách trả số tròn: 4.520.000 → 4.500.000) → **client**
  gọi `allocateMargins` rải lại lời từng dòng ngay tại form rồi gửi đi như mục
  5.1. `StickyBar` hiện chênh lệch so với Σ các món.

Kết quả: nhập một đơn một món = mở màn → chọn khách → một Sheet (tên, SL, giá
thu, ảnh) → Lưu. Không phải nghĩ tới ¥ hay tỷ giá lần nào.

---

## 6. Phần 4 — Chuyển trạng thái hàng loạt

### 6.1 Chế độ chọn ở `/orders`

Nút **"Chọn"** ở header bật chế độ chọn:

- Mỗi dòng hiện ô tick bên trái; chạm dòng là tick, **không** mở đơn.
- Thanh dưới thay tabbar (luật `AppShell` sẵn có: có `bottomBar` thì tabbar tự
  ẩn — một màn không bao giờ có cả hai).

> **Đã chọn 5** · `[Chọn tất cả]` · `[Chuyển bước tiếp →]`

- **"Chọn tất cả"** áp theo bộ lọc/tìm kiếm **đang hiện**, không phải cả kho đơn.
- Giới hạn **50 đơn mỗi lần** — chạy tuần tự, không được chạm `maxDuration`.

### 6.2 Sheet xác nhận — gom nhóm theo phép chuyển

Mỗi loại đơn đi một trục riêng, nên "bước tiếp theo" khác nhau tuỳ đơn. Sheet
phải nói rõ chuyện gì sắp xảy ra:

```
3 đơn   Đã mua, đang về  →  Đã giao khách
2 đơn   Khách chốt       →  Đã mua, đang về    ⚠ sẽ trừ 1.240 ¥ khỏi ví
1 đơn   bỏ qua — Hoàn tất là bước cuối
```

**Dòng cảnh báo ví ¥ là bắt buộc.** Chuyển hàng loạt sang `da_mua_tq` là tiêu
tiền thật; không được để chuyện đó xảy ra sau một cú bấm mù. Số ¥ tính từ
`shouldDeductCny` cho từng đơn trong nhóm.

Luật gom nhóm nằm ở module thuần **`src/lib/bulk-status.ts`**:

```
planBulkAdvance(orders: { id, orderType, status, goodsTotalCny }[])
  → { groups: { from, to, ids, cnyTotal }[], skipped: { id, reason }[] }
```

Test được, không đụng DB — dùng `nextStatus`/`isTerminalFor` sẵn có.

### 6.3 Thực thi

`bulkAdvanceAction(ids)`:

- Chạy **tuần tự**, không `Promise.all`. Side-effect ví ¥ là đọc-rồi-ghi (tính
  lại số dư từ `cny_ledger` rồi ghi dòng mới); chạy song song sẽ đua nhau. Pool
  cũng chỉ có `max: 5`.
- Mỗi đơn đi qua đúng **`changeOrderStatus`** — không `UPDATE orders SET status`
  thẳng. Giữ nguyên side-effect ví/kho, dòng `order_status_history`, và
  `autoCompleteIfPaid`.
- Trả `{ ok: number, failed: { id, reason }[] }` → hiện *"Đã chuyển 5/6 đơn —
  #12: đơn đã hoàn tất"*.

### 6.4 Kỹ thuật

`/orders/page.tsx` đang là server component render thẳng `ListRow`. Tách phần
danh sách ra client component `OrdersList` nhận rows **đã tính sẵn** — truy vấn
và phần tính `gaps` giữ nguyên ở server, không thêm gánh nặng nào.

---

## 7. Phần 5 — Thêm / xoá món trong đơn đã tạo

Hiện đơn tạo xong chỉ sửa được giá ¥ và lời của món; **không thêm được món
mới, không xoá được món nhập nhầm**. Khách đặt thêm một đôi là phải tạo đơn
khác.

Tab **Món** của chi tiết đơn có thêm: nút `+ Thêm món` (dùng lại đúng Sheet của
màn tạo đơn) và `Xoá món` trong từng dòng.

### 7.1 Luật Total — phân định rạch ròi

Chỗ này nới một luật đang được test khoá, nên phải viết rõ:

- **Sửa giá ¥ / kéo lời → Total bất biến.** Luật cũ giữ nguyên; test hiện có
  không đổi.
- **Thêm / xoá món → Total đổi theo.** Đó là đổi *phạm vi* đơn, không phải đổi
  *giá*. Thêm: `Total += giá_thu × SL`. Xoá: `Total −= giá bán của dòng đó`.
  Lời các dòng còn lại **không** bị rải lại — mỗi dòng giữ nguyên lời của nó.

Sau đó cập nhật `goods_total_cny`, `margin_vnd` (Σ lời các dòng) và `amount_due`.
`syncOrderDeposit` không bị đụng tới (thu tiền không đổi).

### 7.2 Chặn

- Không xoá **món cuối cùng** — đơn phải còn ≥ 1 món. Muốn bỏ hẳn thì Xoá đơn
  (phần 2) hoặc Hủy.
- Không thêm/xoá món khi đơn đã `hoan_tat`, `huy`, `khach_bom`.

Luật này phải được ghi vào `CLAUDE.md` cùng lúc với code — mục "Tiền v3-A" hiện
ghi `quoted_total_vnd` là **bất biến** không điều kiện.

---

## 8. Migration & thay đổi schema

Hai migration mới (sinh bằng `npm run db:generate`):

1. `users` — bảng mới.
2. `deletion_log` — bảng mới.

Không có thay đổi phá vỡ nào trên các bảng hiện có. `photos.order_item_id` đã
tồn tại, chỉ là lần đầu được ghi vào.

`CLAUDE.md` phải cập nhật cùng lúc với code: luật Total ở mục 7.1, mô hình tài
khoản thay cho `APP_ACCOUNTS`, và thêm spec này vào mục Tài liệu.

## 9. Test bắt buộc xanh

| Test | Vì sao |
| --- | --- |
| `cnyFromSellPrice` — biên: giá thu ≤ lời mặc định, tỷ giá 0 | công thức tiền |
| Σ giá bán = Total qua đường nhập mới | luật bất biến v3-A |
| Total sau khi thêm/xoá món | luật mới ở phần 5 |
| `canDeleteOrder` — từng lý do chặn | tránh xoá đơn đã tiêu tiền |
| `canDeleteCustomer` | — |
| `planBulkAdvance` — trộn loại đơn, đơn ở bước cuối | luật trạng thái |
| `hashPassword` / `verifyPassword` round-trip + sai mật khẩu | bảo mật |

Theo `CLAUDE.md`: công thức tiền và luật trạng thái/tồn kho sai là mất tiền thật.

## 10. Rủi ro đã biết

- **Mọi người phải đăng nhập lại một lần** khi lên bản này (token đổi định
  dạng). Cần báo trước.
- **Thêm một truy vấn DB mỗi request** để kiểm `active`. Đánh đổi có chủ đích;
  nếu sau này thấy chậm thì mới tính tới cache có thời hạn.
- **`APP_ACCOUNTS` mất tác dụng sau lần nạp đầu.** Nếu quên mật khẩu admin duy
  nhất thì phải sửa `password_hash` thẳng trong Supabase — ghi vào tài liệu vận
  hành.
- **File ảnh mồ côi** trong bucket khi xoá file lỗi, hoặc khi bỏ dở đơn sau khi
  đã chọn ảnh. Dọn thủ công từ dashboard Supabase, không đáng viết job.
