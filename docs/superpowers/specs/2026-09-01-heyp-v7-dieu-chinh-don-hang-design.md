# HeyP v7 — Điều chỉnh đơn hàng

**Ngày:** 01/09/2026
**Trạng thái:** đã chốt thiết kế, chờ viết kế hoạch triển khai

## 1. Bối cảnh

Đơn tạo xong gần như không sửa được. Kiểm kê hiện trạng:

| Sửa được hôm nay | Chưa có cách nào sửa |
| --- | --- |
| Trạng thái đơn | **Khách của đơn** (gắn/đổi khách) |
| Giá ¥ và lời từng món | **SĐT / địa chỉ khách** |
| Thêm / xoá món (v6) | **Tên, size/màu, số lượng** của món |
| Phí ship | **Ghi chú đơn** |
| Thu tiền (thêm/xoá phiếu) | **Tổng chốt** với khách |
| Ảnh | **Tỷ giá** của đơn |

Hệ quả nặng nhất: app **nhắc** cờ `thieu_khach` ("Thiếu thông tin khách") ở
màn Tổng quan và danh sách đơn, nhưng **không có đường nào để bổ sung**. Đơn
tạo từ ảnh chốt thường chưa có khách, nên cờ đó nhắc mãi không tắt được. Ba cờ
còn lại (`thieu_gia_von`, `thieu_anh_sp`, `thieu_ship`) đều đã có đường sửa.

Ngoài ra: gõ nhầm tên món hay chọn nhầm size thì phải xoá món rồi thêm lại;
khách thương lượng lại giá sau khi chốt thì không sửa Total được.

## 2. Phạm vi

Sửa được bốn nhóm: **khách hàng**, **chi tiết món**, **Tổng chốt**, **ghi chú
và tỷ giá**. Không thêm màn hình mới nào — chỉ thêm nút Sửa vào đúng chỗ dữ
liệu đang hiển thị.

**Ngoài phạm vi (YAGNI):** màn chi tiết khách riêng (`/customers/[id]`), sửa
loại đơn (`order_type` — đổi loại đơn là đổi cả trục trạng thái, side-effect
tiền/kho khác hẳn), sửa `cn_order_code`, lịch sử phiên bản của đơn, hoàn tác
thay đổi.

## 3. Luật tiền

Mọi thứ quy về **một nguyên tắc bất biến**: *Total luôn bằng Σ giá bán các
dòng.* Sửa cái gì chỉ khác nhau ở chỗ **cái nào là biến tự do**.

| Sửa gì | Tổng chốt | Lời |
| --- | --- | --- |
| Giá vốn ¥ của dòng | **giữ nguyên** | rải lại *(luật v3-A, test đang khoá)* |
| Tỷ giá đơn | **giữ nguyên** | rải lại |
| Kéo lời một dòng | **giữ nguyên** | dòng khác bù |
| **Số lượng** | **tính lại** | dòng đó tính lại |
| **Giá phải thu của dòng** | **tính lại** | dòng đó tính lại |
| Thêm / xoá món (v6) | tính lại | các dòng cũ giữ nguyên |
| **Sửa thẳng ô Tổng** | = số vừa nhập | rải lại toàn bộ |

Nói gọn: **đụng phía GIÁ VỐN thì Total ghim; đụng phía BÁN thì Total đổi.**
Luật cũ không bị phá, chỉ mở rộng cho các thao tác mới.

### 3.1 Ví ¥

Đơn đã trừ ví (từ `da_mua_tq` trở đi) mà sửa số lượng hoặc giá ¥ thì ghi thêm
một dòng `dieu_chinh` bằng phần chênh — đúng cơ chế `updateLineCost` đang
dùng. Sổ ví là append-only: **không bao giờ sửa dòng cũ**.

Đoạn ghi `dieu_chinh` hiện nằm lẫn trong thân `updateLineCost`. Tách thành hàm
dùng chung để `updateOrderItemFields` không phải chép lại logic tiền — đây là
dọn dẹp có mục đích, phục vụ đúng việc đang làm.

### 3.2 Ba tầng khoá

1. **Không đụng tiền** — khách, SĐT, địa chỉ, ghi chú, tên món, size/màu,
   link sản phẩm: sửa được **mọi lúc**, kể cả đơn đã hoàn tất. Sửa sai chính
   tả không phải là sửa sổ sách.
2. **Đụng tiền** — số lượng, giá phải thu, Tổng chốt: chỉ khi đơn chưa chốt
   sổ. Dùng đúng `canEditOrderItems(status)` đã có (chặn `hoan_tat`, `huy`,
   `khach_bom`).
3. **Tỷ giá** — chỉ khi đơn còn ở `khach_chot`. Từ `da_mua_tq` trở đi, tỷ giá
   đã dùng để chốt giá vốn thật và trừ ví; đổi nó làm sai lãi đã ghi nhận.

Chỗ bị khoá thì **không hiện nút Sửa**, kèm một dòng giải thích ngắn — đừng để
người dùng bấm rồi mới biết bị chặn.

## 4. Cái bẫy phải chặn ngay từ thiết kế

`sellVnd` (giá phải thu) **KHÔNG có trong DB**. Bảng `order_items` chỉ lưu
`unit_price_cny` và `margin_vnd`; giá bán là số dẫn xuất:

```
giá bán dòng   = round(SL × ¥ × tỷ_giá) + lời
giá thu / 1 cái = round(giá bán dòng / SL)
```

Vì phải làm tròn hai lần, số suy ngược có thể lệch vài đồng so với số người
dùng gõ ban đầu. Nếu code cứ tính lại khối tiền mỗi lần lưu, thì người dùng chỉ
sửa **tên món** cũng làm Total trôi vài đồng — lặp lại nhiều lần thì lệch thật.

**Luật chặn:** số lượng và giá thu **không đổi** thì tuyệt đối **không đụng
tới khối tiền**, chỉ ghi các cột chữ (`name`, `attributes`, `product_url`).
So sánh với giá trị đang hiển thị, không so với số suy ngược lần hai.

## 5. Giao diện

Không thêm màn hình mới. Bốn chỗ, đều nằm trong màn chi tiết đơn:

- **Tab Tóm tắt → khối "Khách hàng"** — thêm nút Sửa, mở Sheet làm hai việc:
  *chọn/đổi khách* (dùng lại `CustomerSheet` của màn tạo đơn) và *sửa tên /
  SĐT / địa chỉ*. Sheet phải ghi rõ: **sửa ở đây đổi cho MỌI đơn của khách
  này** — thông tin khách là dữ liệu dùng chung, không phải của riêng đơn.
- **Tab Tóm tắt → khối "Ghi chú"** — hiện cả khi rỗng (hiện đang ẩn khi
  `order.note` trống, nên không có chỗ nào để thêm ghi chú). Nút Sửa mở Sheet
  ghi chú + tỷ giá.
- **Tab Món** — chạm vào một món để sửa. Dùng lại đúng Sheet của "Thêm món"
  (tên, size/màu, số lượng, giá phải thu, ảnh), chỉ đổi tiêu đề và nút.
- **Tab Tiền** — ô "Tổng chốt" thêm nút Sửa.

## 6. Kỹ thuật

### 6.1 Module thuần (mở rộng chỗ đã có, không tạo file mới)

`src/lib/line-pricing.ts`:

```
sellPerUnitVnd(line: PricingLine, sellRate: number): number
  → round(lineSellVnd(line, sellRate) / line.quantity)

totalAfterEditLine(
  quotedTotal: number, oldLine: PricingLine,
  newSellVnd: number, newQty: number, sellRate: number,
): number
  → quotedTotal − lineSellVnd(oldLine, sellRate) + round(newSellVnd) × newQty
```

`src/lib/order-status.ts`:

```
canEditExchangeRate(status: OrderStatus): boolean
  → status === "khach_chot"
```

Đặt cạnh `canEditOrderItems` để hai luật khoá nằm cùng một chỗ.

### 6.2 Tầng DB — `src/db/queries.ts`

Năm hàm mới, **tất cả chạy trong transaction** (dùng `x`, không dùng `raw`):

| Hàm | Việc | Ghi chú |
| --- | --- | --- |
| `setOrderCustomer` | gắn/đổi khách cho đơn | nhận `customerId` có sẵn HOẶC `newCustomer` để tạo mới, giống `createOrder` |
| `updateCustomerInfo` | tên / SĐT / địa chỉ | đụng bảng `customers`, ảnh hưởng mọi đơn của khách |
| `updateOrderMeta` | ghi chú + tỷ giá | đổi tỷ giá → rải lại lời để Total ghim; chặn nếu `!canEditExchangeRate` |
| `updateOrderItemFields` | sửa món | theo luật ở mục 4; đụng tiền thì chặn nếu `!canEditOrderItems` |
| `setQuotedTotal` | sửa Tổng | `allocateMargins` rải lại; chặn nếu `!canEditOrderItems` |

Cộng một hàm nội bộ tách ra từ `updateLineCost`: ghi dòng `dieu_chinh` vào ví
¥ khi đơn đã tiêu ¥ và giá vốn vừa đổi.

Mọi hàm trả `LineActionResult` (`{ok:true} | {ok:false, reason}`) như các hàm
sửa dòng hiện có, để tầng action xử lý lỗi đồng nhất.

### 6.3 Server actions — `src/app/orders/actions.ts`

`setOrderCustomerAction`, `updateCustomerAction`, `updateOrderMetaAction`,
`updateItemAction`, `setQuotedTotalAction`.

Tất cả đọc số qua `parseVnd` / `parseDecimal` (`src/lib/parse-number.ts`) —
không viết hàm đọc số riêng, đây là gốc của hai bug tiền đã sửa ngày 01/09.

### 6.4 Giao diện — 2 component mới, 1 mở rộng

- `src/app/orders/[id]/customer-block.tsx` (client)
- `src/app/orders/[id]/order-meta-block.tsx` (client)
- `item-editor.tsx` mở rộng từ "chỉ thêm" thành "thêm + sửa" — các ô y hệt
  nhau (kể cả phần suy ngược ¥ từ giá thu), tách đôi là nhân bản logic tiền.

Ô nhập giữ `font-size: var(--fs-3)` (16px) — luật cứng chống Safari iOS tự
phóng to. Kiểm bằng đoạn `getComputedStyle` trong `CLAUDE.md` sau khi thêm form.

## 7. Test bắt buộc xanh

| Test | Vì sao |
| --- | --- |
| `sellPerUnitVnd` suy ngược đúng số đã nhập (round-trip) | nền của mọi thao tác sửa món |
| `totalAfterEditLine` — đổi SL / đổi giá thu / đổi cả hai | công thức tiền |
| Σ giá bán = Total sau **mỗi** loại sửa | luật bất biến v3-A |
| Sửa tỷ giá → Total ghim, lời rải lại | mục 3 |
| Sửa mỗi tên món → khối tiền không suy suyển một đồng | cái bẫy ở mục 4 |
| `canEditExchangeRate` chỉ mở ở `khach_chot` | mục 3.2 |
| Các test cũ về "Total bất biến khi sửa ¥" vẫn xanh | không được phá luật cũ |

Theo `CLAUDE.md`: công thức tiền và luật trạng thái/tồn kho sai là mất tiền thật.

## 8. Rủi ro đã biết

- **Sửa thông tin khách ảnh hưởng mọi đơn của khách đó.** Là ngữ nghĩa đúng
  (một khách một bản ghi), nhưng phải nói rõ trên giao diện, nếu không người
  dùng tưởng chỉ sửa cho đơn đang mở.
- **Đổi khách của đơn không dời lại cờ cảnh báo `warning_flag`** của khách cũ.
  Cờ đó gắn với khách, không gắn với đơn — đúng thiết kế, không xử lý gì thêm.
- **Sửa Tổng của đơn đã giao nhưng chưa hoàn tất** làm đổi công nợ khách. Đây
  là điều người dùng muốn (khách thương lượng lại giá), nhưng số tiền còn phải
  thu sẽ đổi ngay — không có bước xác nhận riêng.
