# HeyP v9-A — Danh mục sản phẩm và biến thể size/màu

**Ngày:** 09/09/2026
**Trạng thái:** đã chốt thiết kế, chờ viết kế hoạch triển khai

## 1. Bối cảnh

Yêu cầu ban đầu: *"ở bước tạo đơn hàng, cần làm sao để tái sử dụng lại các
sản phẩm trước đây đã từng nhập… nhất là với giày dép thì đặc thù nhiều size
nhiều màu"*.

Hiện trạng khi tạo đơn, mỗi món phải gõ lại từ đầu: tên, size/màu, số lượng,
giá phải thu, giá vốn ¥, link, rồi tải lại ảnh. Không có nơi nào lưu một mẫu
để dùng lại. Thứ duy nhất gần với "tái sử dụng" là `suggestCnyFromHistory`
(`src/db/queries.ts:146`) — tra **đúng khớp tên** trong `order_items` để gợi ý
mỗi giá ¥, không gợi ý gì khác.

Khảo sát cách bán thực tế: **có một nhóm mẫu chủ lực được bán đi bán lại nhiều
lần**, chỉ khác size và màu; phần còn lại là hàng lẻ. Giá **không** đổi theo
size. Một đơn thường mỗi mẫu một size — cảnh khách lấy nhiều size cùng lúc là
hiếm.

Đào tiếp thì lộ ra một vấn đề thứ hai, chưa ai báo:

> **Tồn kho hiện KHÔNG phân biệt size/màu.** `_addStock`
> (`src/db/queries.ts:722`) gộp theo `(product_name, source)`, mà
> `product_name` lấy từ `order_items.name` — cột này không chứa size (size nằm
> ở `attributes`). Một đôi size 38 và một đôi size 42 cùng mẫu bị cộng chung
> thành *"còn 2 đôi"*, không biết đôi nào. Với shop giày dép, con số đó gần
> như vô dụng.

Danh mục sản phẩm là cơ hội sửa cả hai chuyện cùng lúc, nên v9-A phủ cả tồn
kho.

## 2. Phạm vi

**Trong phạm vi:** bảng `products`; màn quản lý `/products`; Sheet chọn sản
phẩm khi tạo đơn và khi nhập kho; tách `size`/`color` thành cột riêng trên
`order_items`; chép ảnh từ danh mục sang đơn; gom tồn kho theo biến thể qua
cột `stock_key`.

**Ngoài phạm vi, cố ý không làm:** giá riêng theo size; bảng
`product_variants`; tự khớp dòng tồn cũ vào danh mục; nhập danh mục hàng loạt
từ file; mã SKU/barcode. Việc **rà lại khoảng cách layout** (ý thứ hai của yêu
cầu gốc) là một spec riêng, không nằm ở đây.

## 3. Quyết định thiết kế

### 3.1 Danh mục chủ động, không tự học

Một sản phẩm vào danh mục bằng **một lần bấm có chủ ý** ("Lưu vào danh mục"),
không phải tự động mỗi lần tạo đơn.

Tự học hoàn toàn thì sau vài tuần danh mục sẽ đầy `"Giày"`, `"Dép"`, tên gõ
sai và món test — đúng thứ đang có trong dữ liệu hiện tại. Danh mục bẩn thì
không ai tin, không ai dùng, và công sức xây nó thành vô ích. Ngược lại, bắt
nhập danh mục trước khi dùng được thì không ai chịu ngồi nhập.

Đường thứ ba: **hàng lẻ vẫn được gợi ý** qua `suggestCnyFromHistory` như hiện
nay, chỉ khác là **tra danh mục trước, lịch sử sau**. Món chủ lực được ghim
lên danh mục có ảnh và dãy size; hàng lẻ hưởng gợi ý mà không làm bẩn gì.

### 3.2 Hai ô size/màu, không phải bảng biến thể

Sản phẩm lưu **một dãy size** và **một dãy màu**; giá dùng chung cho mọi biến
thể. Lúc chọn sản phẩm thì hiện chip size và chip màu, chạm hai cái là xong.

Đã cân nhắc bảng `product_variants` (mỗi cặp size×màu một dòng, có giá riêng).
Loại vì giá **không** đổi theo size — bảng đó khi ấy chỉ chứa cặp size×màu và
không mang thêm thông tin gì, đổi lại phải sinh và bảo trì 24 dòng cho một mẫu
8 size × 3 màu.

### 3.3 `stock_key`, không phải khoá ghép có NULL

Cách hiển nhiên là gom tồn theo `(product_id, size, color, source)`. **Không
dùng** vì dòng tồn cũ có `product_id = NULL`, mà trong SQL `NULL = NULL` là
**sai**: mọi chỗ tra phải viết `IS NOT DISTINCT FROM` hoặc `COALESCE`. Chỉ cần
một chỗ viết `=` là dòng tồn cũ không bao giờ được tìm thấy, `_addStock` đẻ ra
dòng mới thay vì cộng dồn, và **tồn kho nhân đôi âm thầm — không lỗi nào nổ**.

Thay bằng **một cột chuỗi `stock_key`** sinh bởi hàm thuần:

| Trường hợp | Khoá |
| --- | --- |
| Món có trong danh mục | `p:<productId>\|<size>\|<color>` |
| Dòng cũ / hàng lẻ chưa gắn danh mục | `n:<tên đã chuẩn hoá>` |

`_addStock` giữ nguyên hình dạng, đổi đúng một dòng `WHERE`. Không NULL trong
khoá, không `COALESCE`. `stockKey()` là module thuần nên khoá được bằng test,
đúng lối `parse-number.ts` đã dùng.

### 3.4 Chia hai chặng thi công

Chặng 2 sửa `_addStock` — mã đụng giá vốn bình quân, tức tiền thật. Tách riêng
để nghiệm thu riêng; chặng 1 hỏng hay chậm thì chặng 2 không bị kéo theo, và
ngược lại.

| Chặng | Nội dung |
| --- | --- |
| **1** | Bảng `products`, màn `/products`, Sheet chọn sản phẩm, `size`/`color` trên `order_items`, chép ảnh. **Không chạm tồn kho.** |
| **2** | `stock_key`, gắn `inventory`, nhập kho và bán kho theo biến thể. |

## 4. Dữ liệu

### 4.1 Bảng mới `products`

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | `serial` PK | |
| `name` | `text NOT NULL` | tên chuẩn, VD `Aire tabi` |
| `sizes` | `text NOT NULL DEFAULT ''` | dãy size phân cách phẩy: `35,36,37,38` |
| `colors` | `text NOT NULL DEFAULT ''` | `đen,trắng,vàng` |
| `default_sell_vnd` | `integer NOT NULL DEFAULT 0` | giá phải thu cho 1 cái |
| `default_unit_price_cny` | `double precision NOT NULL DEFAULT 0` | giá vốn ¥ |
| `product_url` | `text` | link Taobao |
| `active` | `boolean NOT NULL DEFAULT true` | ẩn khỏi lưới chọn mà không xoá |
| `created_at` | `bigint` epoch-seconds | theo luật thời gian của dự án |
| `updated_at` | `bigint` epoch-seconds | |

`sizes`/`colors` là **chuỗi phân cách phẩy**, không phải mảng Postgres: lớp
`Exec` (`src/db/raw.ts`) đang đổi placeholder `?` sang `$n` và chưa từng chạm
kiểu mảng — thêm kiểu mới ở đó là rủi ro không cần thiết cho một tính năng
không đòi hỏi nó.

### 4.2 Cột thêm vào bảng có sẵn

```
order_items  + product_id integer REFERENCES products(id) ON DELETE SET NULL
             + size  text NOT NULL DEFAULT ''
             + color text NOT NULL DEFAULT ''
             ( attributes GIỮ NGUYÊN — không đụng, không backfill )

photos       + product_id integer REFERENCES products(id) ON DELETE CASCADE

inventory    + product_id integer REFERENCES products(id) ON DELETE SET NULL
             + size      text NOT NULL DEFAULT ''
             + color     text NOT NULL DEFAULT ''
             + stock_key text NOT NULL DEFAULT ''
             ( product_name GIỮ NGUYÊN )
```

**Migration nào thuộc chặng nào:** `products`, `order_items.*` và
`photos.product_id` thuộc **chặng 1**. Bốn cột của `inventory` (`product_id`,
`size`, `color`, `stock_key`) và phần backfill `stock_key` thuộc **chặng 2** —
chặng 1 không chạm bảng `inventory` một dòng nào.

`ON DELETE SET NULL` cho `order_items` và `inventory`, **không** CASCADE — xoá
một mẫu khỏi danh mục không được phép phá đơn cũ hay xoá mất số tồn.

`photos.product_id` thì CASCADE **đúng**: ảnh của danh mục chết theo danh mục,
còn ảnh đã gắn đơn là **dòng `photos` khác** (đã chép sang) nên không hề gì.

### 4.3 Dữ liệu cũ — không mất gì

`attributes` giữ nguyên, **không parse tự động**. Chỗ hiển thị đi qua một hàm
thuần:

```
displayVariant(item) = (size || color) ? [size, color].filter(Boolean).join(" · ")
                                       : (attributes ?? "")
```

Đơn cũ hiện y như trước. Khi **mở sửa** một món cũ mà `size`/`color` còn trống,
form **gợi ý** tách sẵn từ `attributes` (`"42 - trắng"` → size `42`, màu
`trắng`) và **chờ bấm xác nhận** — không tự ghi. Máy đoán sai thì người sửa,
chứ máy không lặng lẽ đổi dữ liệu thật.

Migration backfill `stock_key = 'n:' || lower(trim(product_name))` cho mọi dòng
tồn đang có, tức giữ **đúng** cách gom hiện tại. Số tồn không nhúc nhích một
đơn vị nào.

Migration viết tay **phải có mục trong `drizzle/meta/_journal.json`** — thiếu
thì `npm run db:migrate` báo "migrations applied successfully" mà bỏ qua file,
DB y nguyên. Đã dính thật khi làm v8-C.

## 5. Giao diện và luồng dùng

### 5.1 Màn Sản phẩm (`/products`)

Vào bằng menu **Thêm** (mảng `MORE` trong `src/app/_components/nav-config.ts`),
không vào tabbar chính: tabbar mobile chỉ có 5 ô, 3 ô đầu đã kín, và ô `[+]`
giữa **luôn là tạo đơn** — luật cứng từ v5, không đổi nghĩa theo màn. Nút `+`
thêm sản phẩm nằm ở header với class `.header-action-float`, đúng lối màn Kho.

Phải sửa **cả hai** file `nav-config.ts` và `src/lib/screen-meta.ts` —
`tests/screen-meta.test.ts` đỏ nếu quên một.

Nội dung: ô tìm + lưới ảnh. **Một DOM, đổi số cột bằng CSS** (2 cột mobile → 4
cột từ 900px), không dựng hai bản rồi ẩn một — luật v8-A.

Thêm/sửa sản phẩm dùng **Sheet**, không phải trang `/products/[id]`: trang con
cần thêm regex động thứ hai vào `screen-meta.ts`, mà chỗ đó đã từng sinh bug
(`[^/]+` khớp nhầm `/orders/new`). Sheet né được hoàn toàn.

Trong Sheet: tên · dãy size · dãy màu · giá thu mặc định · giá vốn ¥ · link ·
ảnh. Size và màu nhập kiểu **chip**: gõ rồi Enter thành một chip, chạm chip để
bỏ.

Khối ảnh **tái dùng `ItemPhotos`** (`src/app/_components/item-photos.tsx`) với
một chế độ gắn `product_id` thay vì `order_item_id`. Giữ nguyên luật đã có của
component đó: **đóng Sheet mà không lưu thì phải xoá ảnh vừa tải lên**, nếu
không chúng thành mồ côi.

### 5.2 Chọn sản phẩm lúc tạo đơn

Khối "Sản phẩm" thêm nút **Chọn từ danh mục** cạnh nút Thêm món. Sheet hai
bước, không rời màn:

1. Ô tìm (autofocus) + lưới ảnh: ảnh thumb, tên, giá thu.
2. Chạm một mẫu → chip size, chip màu, số lượng, giá thu (điền sẵn, sửa được).
   Bấm Xong → sinh **một** dòng món, đóng sheet.

Ảnh dùng `photoUrl(id, "thumb")` — bắt buộc ở mọi chỗ ≤140px; dùng bản chính
là tải nặng gấp ~10 lần.

Muốn chỉnh thêm thì chạm vào dòng món vừa tạo, đi đúng luồng sửa món đang có.
Không đẻ đường thứ hai cho cùng một đích.

**Chép ảnh:** dùng `.copy()` của Supabase Storage (chép thẳng trên server lưu
trữ, không tải về app), chép **cả bản chính lẫn bản `_t`**, rồi tạo dòng
`photos` mới với `order_item_id = NULL`. `createOrder` gắn nó **trong
transaction** qua `NewOrderItemInput.photoIds` — gắn sau khi tạo đơn thì lỗi
tạm của DB làm mất liên kết mà không ai biết; chuyện đã xảy ra thật với đơn #1
ngày 01/09.

### 5.3 Sheet Thêm món

Ô `Size / màu` tự do tách thành **hai ô: Size và Màu**. Món đến từ danh mục thì
mỗi ô có hàng chip gợi ý, chạm là điền; món gõ tay thì hai ô trống và vẫn gõ
tự do như cũ — không ai bị chặn.

Thêm nút **Lưu vào danh mục** khi món chưa có `product_id` và đã có tên + giá.
Bấm → tạo sản phẩm với size/màu lấy từ chính món đó, chép ảnh của món sang danh
mục, gắn `product_id` ngược lại cho món.

`suggestCnyFromHistory` giữ nguyên nhưng **tra danh mục trước, lịch sử sau** —
luồng đọc ảnh Zalo hưởng lợi mà không phải sửa gì khác.

### 5.4 Tồn kho (chặng 2)

`_addStock` đổi đúng một dòng: `WHERE product_name = ? AND source = ?` →
`WHERE stock_key = ? AND source = ?`. Công thức bình quân gia quyền
(`applyStockIn`) **không đụng tới một chữ**.

`stockKey()` là hàm thuần trong `src/lib/inventory.ts`.

Màn Kho hiện `tên · size · màu`; dòng cũ (`product_id IS NULL`) mang nhãn
*"chưa gắn danh mục"* để dọn dần. Sheet nhập kho chủ động dùng lại đúng Sheet
chọn sản phẩm ở 5.2.

## 6. Quyền

| Thao tác | Bậc tối thiểu |
| --- | --- |
| Xem, chọn từ danh mục | đã đăng nhập |
| Thêm, sửa sản phẩm | đã đăng nhập |
| Xoá sản phẩm | `requireAdmin()` |

Kiểm quyền qua `atLeast()` / `requireAdmin()` trong `src/lib/auth.ts`, **không**
so `role === "..."`.

**Ẩn nút không phải là chặn quyền.** Nút Xoá ẩn với member, nhưng server action
vẫn phải tự kiểm. Nghiệm thu bằng cách bỏ tạm điều kiện ẩn rồi bấm thật, không
chỉ nhìn giao diện — sáu thao tác của v8-C từng thủng đúng kiểu này.

**Chặn xoá sản phẩm còn dòng tồn `quantity > 0`.** Đơn cũ đã có
`ON DELETE SET NULL` lo, nhưng dòng tồn mang `stock_key = 'p:<id>|…'` trỏ vào
một sản phẩm đã chết sẽ gom sai về sau. Kiểm điều kiện này phải nằm **trong
transaction, sau `SELECT … FOR UPDATE`** — kiểm ngoài transaction có kẽ hở:
giữa lúc kiểm và lúc xoá, người kia có thể vừa nhập kho cho đúng mẫu đó.

Ghi vào `activity_log`, **không** `deletion_log` — bảng kia là bản chụp để khôi
phục đơn/khách, khác mục đích, không gộp. `logActivity` chạy ngoài transaction
và nuốt lỗi, giữ nguyên lối đó.

## 7. Trùng tên: cảnh báo, không chặn

Hai người cùng thêm "Giày đen" sẽ ra hai dòng. **Không** đặt unique index trên
tên: tên là chữ người gõ, và hai mẫu khác nhau hoàn toàn có thể trùng tên thật.
Thay vào đó lúc lưu, nếu có mẫu trùng tên thì hiện nó ra kèm ảnh và hỏi *"có
phải mẫu này không?"*. Người dùng quyết, máy không quyết thay.

## 8. Nghiệm thu

Dự án không có DB test, nên chia hai tầng.

**Module thuần — test tự động (`node:test`):**

- `parseList` / `formatList` (`src/lib/product-catalog.ts`): bất biến
  `parseList(formatList(x))` toàn vẹn; khoảng trắng thừa; phần tử rỗng; trùng
  lặp không phân biệt hoa thường.
- `stockKey()` (`src/lib/inventory.ts`): hai nhánh `p:` và `n:`; cùng (mẫu,
  size, màu) luôn ra cùng khoá; khác size ra khoá khác; tên có khoảng trắng
  thừa hoặc khác hoa thường vẫn ra cùng khoá `n:`.
- `displayVariant()`: có size/màu thì dùng nó; trống thì rơi về `attributes`;
  cả hai trống thì chuỗi rỗng.
- `tests/activity-coverage.test.ts`: **mọi server action mới phải thêm vào
  đây** — test đó đọc thẳng mã nguồn và bắt lỗi quên ghi nhật ký.
- `tests/screen-meta.test.ts` tự bắt nếu `/products` thiếu ở một trong hai file
  điều hướng.

**Câu SQL — kiểm tay bằng dữ liệu giả `VALUES`,** đúng cách đã dùng cho
`listCustomerStats`. Hai phép kiểm bắt buộc, ghi lại đây để lần sau sửa
`_addStock` còn chạy lại được:

1. Một mẫu nhập kho hai lần **khác size** → phải ra **hai** dòng tồn.
2. Một mẫu nhập kho hai lần **cùng size cùng màu** → phải ra **một** dòng, giá
   vốn bình quân đúng theo `applyStockIn`.

**Trước khi commit:** `npm test`, `npx tsc --noEmit`, và xem thật qua preview
trình duyệt.

## 9. Rủi ro đã biết

1. **Job dọn ảnh mồ côi sẽ xoá sạch ảnh danh mục nếu quên sửa.** Cron 4h
   (`/api/cron/track`) đang xoá ảnh có `order_id`/`order_item_id`/
   `inventory_id` đều NULL và cũ hơn 24h. Ảnh danh mục chỉ có `product_id` →
   **24h sau nó biến mất, không báo lỗi gì.** Phải thêm
   `AND product_id IS NULL` vào điều kiện job, và rà lại `deletePhoto` (hàm
   này hiện chỉ xoá dòng có `order_id IS NULL`). Đây là chỗ dễ sót nhất trong
   cả spec.
2. **`_addStock` là mã đụng tiền.** Chặng 2 tách riêng chính vì thế — không gộp
   nó vào một commit với việc khác.
3. **Cột `bigint` đọc bằng SQL thô trả về chuỗi.** `created_at`/`updated_at`
   của `products` phải `Number()` trước khi dựng `Date`, nếu không mọi mốc thời
   gian hiện ra năm 1970.
4. `SUM()`/`COUNT()` trên cột `integer` phải ép `::int`; alias camelCase trong
   SQL thô phải bọc nháy kép (`AS "productId"`).
5. Trong `withTx` phải dùng `x` được truyền vào, **không** dùng `raw` toàn cục.
