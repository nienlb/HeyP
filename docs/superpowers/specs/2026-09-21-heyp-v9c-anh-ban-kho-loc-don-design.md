# HeyP v9-C — Ảnh mẫu, bán từ kho trong đơn mới, lọc đơn, SĐT khách, ảnh nhẹ

**Ngày:** 21/09/2026
**Trạng thái:** đã chốt thiết kế, chờ viết kế hoạch triển khai

## 1. Bối cảnh

Yêu cầu gốc là "update nhanh một version cho vài UI UX", gồm bốn ý:

1. Kiểm tra lại ảnh trong màn "Sản phẩm" với mẫu tạo từ đơn, vì hiện không thấy ảnh nào.
2. Khi tạo đơn mới thì chọn được sản phẩm đang có trong kho.
3. Danh sách đơn có thêm trường ngày tạo và nút lọc nhanh kiểu bấm lọc trên Excel.
4. Lúc chọn khách khi tạo đơn thì hiện cả số điện thoại, vì tên không phải là định danh duy nhất. SĐT dùng để tìm kiếm.

Sau khi duyệt thiết kế, người dùng thêm một yêu cầu xuyên suốt:

5. Giảm dung lượng ảnh nhiều nhất có thể. Chỉ cần đủ nhìn thấy, không cần nét đẹp.

## 2. Ảnh của mẫu lưu từ đơn

### Nguyên nhân (không phải lỗi hiển thị)

Nút "★ Lưu vào danh mục" trong Sheet thêm món (`orders/new/item-sheet.tsx`) gọi
`quickSaveProductAction`, và hàm này tạo mẫu với `photoIds: []` có chủ đích
("Ở đây chỉ lưu chữ và giá", `products/actions.ts`). Vì vậy mẫu tạo theo đường
này chưa bao giờ có ảnh. Màn Sản phẩm hiển thị đúng những gì đang có trong DB.

### Cách sửa

- `quickSaveProductAction` nhận thêm `photoIds` là id các ảnh đang gắn với món
  trên form. Với mỗi ảnh, server **chép file** sang tên mới bằng `copyPhotoFile`
  (sao chép phía Supabase, chép cả bản chính và bản `_t`). Sau đó tạo một dòng
  `photos` mới có `product_id` = mẫu vừa tạo.
- **KHÔNG dùng chung dòng `photos` với món.** Ảnh của món sẽ được gắn vào đơn,
  mà `photos` có ON DELETE CASCADE tới `order_items`. Nếu dùng chung dòng thì
  xoá đơn sẽ xoá luôn ảnh của danh mục. Đây cũng là lý do `copyProductPhotos`
  chép ảnh theo chiều ngược lại.
- Tách phần chép thành một hàm trong `src/db/product-photos.ts`, cạnh
  `copyProductPhotos`. Lý do cô lập Supabase client vẫn như ghi chú đầu file
  đó: `products.ts` được `queries.ts` import, không được kéo `@/lib/storage` vào.
- Mẫu được tạo trước, ảnh chép sau. Chép hỏng ảnh nào thì bỏ qua ảnh đó; mẫu
  vẫn giữ và giao diện báo "Đã lưu vào danh mục (X/Y ảnh)". Không vì một file
  hỏng mà mất cả mẫu.
- Dòng ảnh mới được gắn `product_id` ngay khi INSERT. Job dọn ảnh mồ côi đã có
  điều kiện `product_id IS NULL` (v9-A) nên không đụng tới các ảnh này.
- Các mẫu đã lưu theo đường này trước v9-C **không được bù ảnh tự động**. Người
  dùng thêm ảnh tay ở màn Sản phẩm như bình thường.

## 3. Bán từ kho ngay trong màn tạo đơn

Đã chốt với người dùng: **cả đơn là hàng có sẵn** (phương án A). Không làm đơn
hỗn hợp nửa order hộ nửa hàng kho, vì như vậy phải sửa luật tiền và trục trạng
thái theo từng dòng.

### Giao diện

- Ở màn `/orders/new`, khi loại đơn là "Bán từ kho":
  - Nút thêm món mở **Sheet chọn hàng tồn** thay cho Sheet danh mục. Sheet chỉ
    hiện dòng `inventory` còn `quantity > 0`, mỗi dòng gồm ảnh nhỏ
    (`photoUrl(id, "thumb")`), tên, size/màu qua `displayVariant`, và số còn
    lại. Có ô tìm theo tên.
  - Chọn một dòng tồn thì mở Sheet món với tên/size/màu **khoá lại** (lấy theo
    dòng tồn). Chỉ sửa được **số lượng** (tối đa bằng số tồn) và **giá bán mỗi
    cái (₫)**. Giá gợi ý là `default_sell_vnd` của mẫu nếu dòng tồn có
    `product_id`, không thì để trống.
  - Không có ô ¥, tỷ giá, link, và không có nút "Lưu vào danh mục".
  - Nếu cùng một dòng tồn đã có trong đơn, chọn lại nó thì **mở dòng đó để sửa**
    chứ không thêm dòng mới, để tổng số lượng không vượt tồn mà không ai thấy.
- Đổi loại đơn khi đã có món thì hỏi xác nhận rồi xoá danh sách món, vì món
  order hộ và món kho có dạng dữ liệu khác nhau.
- Màn `/inventory` giữ form bán một món như cũ, nhưng gọi hàm mới bên dưới.

### Server

- Viết lại `sellFromStock` (`src/db/queries.ts`) để nhận **nhiều dòng**:
  `lines: { inventoryId, quantity, sellPriceVnd }[]`, cùng khách (có sẵn / mới /
  khách lẻ), cọc, ghi chú, ảnh chốt đơn nếu có. Màn `/inventory` gọi hàm này
  với một dòng, nên luật trừ tồn chỉ có ở một chỗ.
- Mọi thứ nằm trong **một** `withTx`:
  1. `SELECT … FROM inventory WHERE id IN (…) FOR UPDATE`.
  2. Gộp số lượng theo `inventoryId` (phòng client gửi trùng) rồi kiểm tồn
     **sau khi đã khoá**. Thiếu một dòng thì huỷ cả đơn và báo dòng nào thiếu,
     còn bao nhiêu.
  3. Trừ tồn từng dòng bằng `applyStockOut`, cộng `saleCost` theo `avg_cost`.
  4. INSERT `orders` với `order_type = 'ban_tu_kho'`, `status = 'da_giao_khach'`,
     `exchange_rate = 1`, `goods_total_cny` = Σ giá bán (VND),
     `quoted_total_vnd` = Σ giá bán, và `sale_cost`.
  5. INSERT `order_items` có `product_id`, `size`, `color` lấy từ dòng tồn,
     `unit_price_cny` = giá bán mỗi cái (VND, vì tỷ giá = 1).
  6. INSERT `order_status_history` như cũ.
- **Vá lỗ hổng:** bản hiện tại kiểm tồn NGOÀI transaction. Hai người bán cùng
  một dòng tồn cùng lúc thì cả hai qua được bước kiểm và tồn bị âm. Cách chữa
  giống luật xoá đơn: kiểm trong transaction, sau `FOR UPDATE`.
- **Cọc đi qua phiếu thu:** bản hiện tại chỉ ghi `orders.deposit`, không có dòng
  `payments` nào, trái với luật v3-B (`deposit` là số dẫn xuất bằng Σ
  `payments`). Bản mới tạo phiếu thu cọc trong cùng transaction, giống
  `createOrder`. Nếu đã thu đủ thì gọi `autoCompleteIfPaid` **ngoài**
  transaction, vì `changeOrderStatus` tự mở transaction riêng.
- **Chặn xoá đơn bán kho:** đơn `ban_tu_kho` trừ tồn ngay lúc tạo, nhưng
  `canDeleteOrder` chỉ chặn đơn đã CỘNG tồn. Đơn bán kho chưa có phiếu thu
  hiện xoá được và hàng đã trừ không quay lại kho. Bản mới chặn hẳn và gợi ý
  dùng Đổi/trả từng món.
- **Lỗi cũ ở màn tạo đơn:** chọn loại "Bán từ kho" hiện đi qua `createOrder`,
  tạo đơn mà không trừ tồn. Bản mới rẽ nhánh sang `sellFromStock`.
- **Doanh thu 0 trong báo cáo lãi:** `sellFromStock` hiện không ghi
  `quoted_total_vnd` (mặc định 0) và `cost_confirmed` (mặc định false).
  Bản mới ghi đủ; migration `0010` vá các đơn bán kho cũ.
- Không đụng ví ¥ (`shouldDeductCny` đã trả false cho `ban_tu_kho`) và không đổi
  trục trạng thái.
- Ghi nhật ký `order.create` với `detail.op = "ban_tu_kho"` (ngoài transaction,
  nuốt lỗi, như `logActivity` đang làm).

## 4. Danh sách đơn: cột Ngày tạo và lọc kiểu Excel

### Cột Ngày tạo

- Thêm cột **Ngày tạo** vào `DataTable` của `orders-list.tsx`, dạng `dd/mm`
  (khác năm hiện tại thì hiện `dd/mm/yy`), sắp xếp được. `OrderListRow.createdAt`
  đã có sẵn.
- Trên điện thoại, ngày tạo hiện trong `.dt-sub` dưới tên khách:
  `#12 · Đang về · 3 món · 21/09`.

### Bộ lọc

Bốn nhóm:

| Nhóm | Kiểu | Giá trị |
| --- | --- | --- |
| Ngày tạo | chọn một | Hôm nay · 7 ngày · Tháng này · Tháng trước · Từ–đến |
| Trạng thái | tích nhiều | các trạng thái đang dùng (không hiện mã đã về hưu) |
| Loại đơn | tích nhiều | Order hộ · Nhập kho · Bán từ kho |
| Còn thu | chọn một | Đã thu đủ · Còn nợ |

- **Desktop (≥900px):** đầu cột Ngày tạo, Trạng thái, Còn thu có nút ▾. Bấm vào
  thì mở một bảng nổi nhỏ có ô tích và hai nút "Xoá lọc" / "Áp dụng", giống lọc
  cột trong Excel. Loại đơn không có cột riêng, nên nằm trong nút "Lọc" chung.
  Cột đang bị lọc thì nút ▾ được tô màu.
- **Điện thoại:** nút "Lọc" ở header (`.header-action-float`, cạnh "Chọn"), có
  số nhóm đang lọc: "Lọc (2)". Bấm vào mở Sheet chứa đủ bốn nhóm.
- **Điều kiện lọc nằm trên URL:** `?d=7d`, `?d=2026-09-01_2026-09-15`,
  `?st=da_mua_tq,da_giao_khach`, `?type=ban_tu_kho`, `?due=no`. Bấm lùi, tải lại
  hay dán link vẫn giữ được bộ lọc. Giá trị lạ trên URL thì bỏ qua, không lỗi.
- Hàng chip hiện có ("Cần chú ý", "Tất cả"…) giữ nguyên làm lối tắt và kết hợp
  với bộ lọc mới theo phép VÀ.
- Trang vẫn lọc phía server trên kết quả `listOrdersWithGaps()` như hiện nay,
  không thêm truy vấn.

### Hàm thuần

- `src/lib/order-filters.ts`: `parseOrderFilters(searchParams)`,
  `matchesOrderFilters(row, filters, now)`, `serializeOrderFilters(filters)`.
  Hàm thuần, không import `@/`, test được bằng `node:test`.
- **Cắt ngày theo giờ Việt Nam** (`src/lib/vn-time.ts`). "Hôm nay" là từ 00:00
  giờ VN. Cắt theo UTC thì đơn tạo lúc 6h sáng giờ VN rơi nhầm sang hôm trước,
  cùng loại lỗi đã khoá ở chip năm của v8-A.
- Vì `OrdersList` là client component, server gửi chuỗi query sẵn chứ không gửi
  hàm, giống `sortBase` hiện có (gotcha v8-A).

## 5. Chọn khách có số điện thoại

- `CustomerOption` thêm `phone: string | null`. Truy vấn nạp danh sách khách cho
  màn tạo đơn lấy thêm cột này.
- Mỗi dòng trong `CustomerSheet` hiện tên, bên dưới là SĐT (hoặc "chưa có SĐT"
  màu nhạt).
- Ô tìm khớp **tên hoặc SĐT**. SĐT chuẩn hoá trước khi so bằng
  `normalizePhone()` trong `src/lib/phone.ts` (hàm thuần): bỏ mọi ký tự không
  phải số, và đổi đầu `84…` thành `0…`. So khớp một phần: gõ "0912" hay
  "912 345" đều ra. Chuỗi gõ vào chỉ được coi là tìm SĐT khi có ít nhất 3 chữ số.
- Placeholder đổi thành "Gõ tên hoặc SĐT…".
- **Trùng tên vẫn cho tạo khách mới** (vì hai "Lan" có SĐT khác nhau là hai
  người), nhưng khi trùng khít tên thì nút ghi rõ
  "+ Tạo khách mới «Lan» (đã có 1 người trùng tên)".
- Gõ một dãy số không khớp ai thì nút tạo mới ghi "+ Tạo khách mới với SĐT
  0912…". Bấm vào thì SĐT được điền sẵn vào ô SĐT của khách mới, và con trỏ
  chuyển sang ô tên, vì tên vẫn bắt buộc. `CustomerPick` kiểu `new` thêm trường
  `phone?: string`.

## 6. Giảm dung lượng ảnh

Mức hiện tại (`src/lib/image.ts`):

| Loại | Cạnh dài | WebP q | Ước lượng |
| --- | ---: | ---: | ---: |
| Ảnh thường (bản chính) | 1280 | 80 | ~69KB |
| Ảnh chốt đơn `zalo_confirm` | 1600 | 82 | — |
| Bản nhỏ `_t` | 400 | 72 | — |

Hướng thay đổi:

- **Ảnh thường:** hạ về khoảng **960px, q ~65**. **Bản nhỏ:** khoảng **320px,
  q ~60**. Mục tiêu là mỗi ảnh nhẹ khoảng một nửa. Xem trên iPhone vẫn nhận ra
  mẫu, màu và chi tiết chính, không cần sắc nét.
- **Con số cuối chọn bằng đo đạc, không chốt trên giấy.** Kế hoạch có một bước
  nén thử 5–10 ảnh thật của shop (giày/dép/quần áo) ở vài mức, ghi dung lượng,
  chụp so sánh cạnh nhau, rồi chọn mức thấp nhất vẫn nhìn rõ. Bảng số đo ghi
  vào comment trong `image.ts` như các mức cũ.
- **Không đổi:** ảnh chốt đơn `zalo_confirm` giữ cạnh 1600. Đó là ảnh chụp CHỮ
  làm bằng chứng, nén mạnh là số tiền và size bị nhoè. `prepareForAi` cũng giữ
  nguyên (gotcha: hai đường khác nhau, không lưu lại nên nén không tiết kiệm gì).
- Chép ảnh món sang mẫu (mục 2) và mẫu sang đơn thì **chép thẳng file đã nén**,
  không nén lại. Nén lại vừa làm ảnh xấu thêm, vừa tốn CPU của function.
- **Ảnh cũ không nén lại.** Mức mới chỉ áp cho ảnh tải lên từ v9-C.
- Mọi chỗ hiển thị ảnh mới (Sheet chọn hàng tồn) dùng `photoUrl(id, "thumb")`.

## 7. Ngoài phạm vi

- Đơn hỗn hợp món order hộ và món kho.
- Bù ảnh cho các mẫu đã lưu từ đơn trước v9-C.
- Nén lại ảnh đã lưu.
- Lọc theo tên khách bằng danh sách tích (đã có ô tìm kiếm).

## 8. Kiểm thử

- `tests/order-filters.test.ts`: từng nhóm lọc, kết hợp nhiều nhóm, giá trị URL
  lạ, và biên ngày theo giờ VN (đơn tạo 23:30 giờ VN và 00:30 giờ VN hôm sau).
- `tests/phone.test.ts`: `+84 912.345.678` → `0912345678`, khớp một phần, chuỗi
  dưới 3 chữ số không coi là tìm SĐT.
- Luật trừ tồn nhiều dòng: tách phần kiểm/gộp thành hàm thuần
  (`planStockSale(lines, stock)`) trong `src/lib/inventory.ts` để test được: đủ
  hàng, thiếu một dòng thì từ chối cả đơn, trùng `inventoryId` thì gộp số lượng,
  và `saleCost` đúng theo bình quân.
- Thêm mọi server action mới hoặc đổi chữ ký vào `tests/activity-coverage.test.ts`.
- `npm test` và `npx tsc --noEmit` xanh.
- Kiểm trên trình duyệt ở cỡ iPhone (375) và desktop:
  - lưu mẫu từ món có ảnh, rồi thấy ảnh ở màn Sản phẩm;
  - tạo đơn bán từ kho hai món, thấy tồn giảm đúng, đơn ở "Đã giao khách" và
    báo cáo lãi có doanh thu;
  - lọc đơn trên cả hai cỡ màn, tải lại trang thì vẫn còn lọc;
  - tìm khách bằng SĐT;
  - dung lượng ảnh tải lên mới (xem trong Supabase Storage);
  - kiểm `font-size` 16px của các ô nhập mới (luật Safari iOS).
- Khoảng cách trong CSS mới dùng `var(--sp-*)` (`tests/spacing-grid.test.ts`).
