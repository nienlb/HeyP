# HeyP v5 — Thiết kế lại giao diện theo hướng mobile-first

**Ngày:** 31/08/2026
**Trạng thái:** đã chốt, chờ lập kế hoạch triển khai
**Thay thế:** phần giao diện của `docs/2026-08-11-heyp-v2-ui-redesign-design.md`

---

## 1. Vấn đề

Điện thoại là thiết bị chính của người dùng — cả bốn nhóm việc (tạo đơn, tra
cứu đơn, đổi trạng thái/thu tiền, xem kho và tài chính) đều diễn ra trên
iPhone 15 Pro / 15 Pro Max. Nhưng giao diện hiện tại được viết desktop-first
và chỉ vá lại cho màn nhỏ. Khảo sát code cho ra sáu nguyên nhân cụ thể:

1. **Không có `viewport-fit=cover`, và toàn bộ 1711 dòng `globals.css` không
   có lấy một `env(safe-area-inset-*)`.** Tabbar đặt `inset: auto 0 0 0` cao
   60px nên chữ nằm dưới thanh home indicator (34pt trên máy 15 Pro).
2. **Ô nhập để `font-size: 15px`.** Dưới 16px là Safari iOS tự phóng to trang
   mỗi lần chạm vào ô. Đây là nguyên nhân trực tiếp của cảm giác khó dùng khi
   nhập đơn.
3. **CSS desktop-first.** Luật gốc viết cho màn rộng, mobile là bản vá ở
   `max-width: 767px / 720px / 640px`.
4. **Bảng bị bẻ bằng mẹo CSS** (`display: block` + `td::before { content:
   attr(data-label) }`) thành những hàng cao lêu nghêu nhãn-trái/giá-trị-phải.
5. **Màn tạo đơn là một trang cuộn dài** bốn khối, nút Lưu nằm tận đáy, không
   dính. Khối đọc ảnh Zalo chiếm vị trí đầu tiên dù nhập tay mới là cách làm
   chính.
6. **Màn chi tiết đơn xếp chồng chín khối liên tiếp** — một cuộn dài vô tận
   trên màn hình 393pt.

Ngoài ra: `public/` chưa tồn tại, nên không có manifest, không cài được ra màn
hình chính, luôn mất chỗ cho thanh Safari.

## 2. Phạm vi

**Trong phạm vi.** Viết lại tầng trình bày theo hướng mobile-first: hệ token,
khung điều hướng, và toàn bộ các màn. Desktop dùng lại đúng component đó, chỉ
nới bố cục — một codebase, một hệ thống. Kèm ba việc người dùng bổ sung ở mục
9 (nhập nhanh từ ảnh, sao lưu bằng tay, nhập kho chủ động) và một lỗi tiền
phát hiện khi thiết kế mục 9.3.

**Ngoài phạm vi, cắt có chủ đích.** Chế độ tối. Service worker / chạy offline
(app cần DB, offline chỉ là ảo giác an toàn). Vuốt-để-hành-động trên thẻ đơn.
Hoạt ảnh chuyển trang. Kéo thả sắp xếp. Thiết kế lại desktop như một sản phẩm
riêng.

## 3. Nền móng

### 3.1 Thang chữ

Cơ số 16px, tỷ lệ 1.2, làm tròn. Sáu bậc, không thêm bậc thứ bảy.

| Token | px | Dùng cho |
|---|---|---|
| `--fs-1` | 11 | nhãn tab, badge |
| `--fs-2` | 13 | chú thích, nhãn phụ |
| `--fs-3` | 16 | thân chữ và **toàn bộ** `input` / `select` / `textarea` |
| `--fs-4` | 19 | tiêu đề thẻ, số tiền trong dòng |
| `--fs-5` | 23 | tiêu đề màn |
| `--fs-6` | 28 | tổng tiền ở thanh đáy, số lớn màn Tổng quan |

Bậc 16px cho ô nhập là bắt buộc, không phải thẩm mỹ — nó là cách chặn Safari
iOS tự zoom. **Không** dùng `maximum-scale=1` hay `user-scalable=no`: làm vậy
là tước luôn quyền phóng to của người dùng.

### 3.2 Thang khoảng cách và hình khối

Lưới 4pt: `4 · 8 · 12 · 16 · 24 · 32 · 48`. Bo góc `10 / 14 / 999`. Mọi phần
tử bấm được tối thiểu **44×44pt** theo Apple HIG — nút xoá dòng sản phẩm hiện
nhỏ hơn nhiều.

### 3.3 Màu và chữ

Navy `#0e5a87` giữ nguyên làm màu nhận diện duy nhất. Nền giấy ấm `#f6f3ec`
đổi sang xám lạnh rất nhạt. Bỏ màu camel trang trí và bỏ Georgia nghiêng
(`--font-display`), dùng một họ sans duy nhất.

Cá tính thị giác neo vào **cách hiển thị số**, không vào màu trang trí: mọi
con số tiền dùng `font-variant-numeric: tabular-nums`, căn phải, ký hiệu `₫`
mờ hơn chữ số một bậc. Đây là app về số — cho số sự chú ý đó là quyết định
thiết kế thật, không phải lớp sơn.

Giữ nguyên bộ màu ngữ nghĩa hiện có (`--danger` / `--warning` / `--success`)
vì các trạng thái đơn đã neo vào chúng.

### 3.4 Khung màn hình

1. Thêm `export const viewport: Viewport` vào `src/app/layout.tsx` với
   `viewportFit: "cover"` và `themeColor` navy. Hiện chưa có dòng nào.
2. `env(safe-area-inset-bottom)` cho tabbar và mọi thanh dính đáy;
   `env(safe-area-inset-top)` cho header.
3. Chiều cao dùng `100dvh`, không `100vh` — `vh` trên Safari iOS tính theo
   lúc thanh địa chỉ thu gọn, gây nhảy layout khi cuộn.

### 3.5 PWA

Tạo `public/` với `manifest.webmanifest` (`display: "standalone"`,
`theme_color` navy, `background_color`), icon 192 và 512, `apple-touch-icon`
180. Chưa có `logo.png` nên sinh icon nền navy chữ "HeyP"; thay logo thật sau
chỉ là đổi file, không đụng code.

**Hệ quả bắt buộc xử lý:** chạy standalone thì không còn nút Back của Safari.
Mọi màn chi tiết (đơn, khách, món tồn kho) phải có nút quay lại riêng ở
header. Hiện đang dựa hoàn toàn vào back của trình duyệt.

## 4. Khung điều hướng

**Header màn** — cao 52pt cộng `safe-area-inset-top`, dính đỉnh, nền mờ
`backdrop-filter: blur(20px)`. Trái là nút quay lại (màn con) hoặc tên màn,
phải là **một** nút ngữ cảnh. Tiêu đề lớn (`--fs-5`) nằm trong nội dung và
cuộn đi mất theo kiểu iOS, không nhân đôi trong header.

**Tabbar** — cao 56pt cộng `padding-bottom: env(safe-area-inset-bottom)`, cùng
nền mờ. Năm ô: `Tổng quan · Đơn · [+] · Kho · Thêm`. Ô giữa là nút navy tròn
nhô lên nhẹ khỏi thanh, và nó **luôn luôn là "tạo đơn mới"** (`/orders/new`) —
không đổi nghĩa theo màn đang mở. Nút nhập kho là một nút riêng ở header màn
Kho (mục 9.3); hai nút này không được lẫn vào nhau.

Xoá `.mobile-top` (thanh chỉ đựng logo) và `.fab` (nút trôi che góc phải).
`nav-config.ts` giữ nguyên vai trò một-nguồn-chân-lý. Bố cục năm ô chỉ còn
bốn mục điều hướng, nên **Khách hàng chuyển từ `NAV_ITEMS` xuống
`MORE_ITEMS`**: `NAV_ITEMS` = Tổng quan, Đơn hàng, Tồn kho; `MORE_ITEMS` =
Khách hàng, Tracking, Tài chính, Báo cáo, Cài đặt, Sao lưu.

**`<Sheet>` — primitive quan trọng nhất của bản thiết kế này.** Trượt từ đáy,
bo góc trên 20, có thanh kéo, nền sau mờ dần. Đóng bằng chạm ra ngoài, vuốt
xuống, hoặc `Esc`. Khoá cuộn nền khi mở. Cao tự co theo nội dung tới trần
`90dvh`. Mọi thao tác phụ chuyển hết vào đây, thay cho các khối `<details>`
gập và form con đang nhét thẳng vào trang.

Primitive dùng chung khác: `Field`, `Chip`, `StickyBar`, `ListRow`.

## 5. Màn tạo đơn

Bố cục kiểu POS: một màn duy nhất, thao tác phụ mở sheet, thanh đáy luôn hiện
tổng tiền và nút Lưu.

```
┌──────────────────────────────┐
│ ←  Đơn mới            [🖼]  │  nút "Nhập nhanh từ ảnh"
├──────────────────────────────┤
│  KHÁCH                       │
│  ┌────────────────────────┐  │
│  │  + Chọn khách          │  │ → sheet tìm / chọn / tạo
│  └────────────────────────┘  │
│                              │
│  MÓN (2)                     │
│  ┌────────────────────────┐  │
│  │ Giày Nike AF1          │  │ → chạm dòng: sheet sửa
│  │ 42 · trắng    ×1  ¥320 │  │
│  ├────────────────────────┤  │
│  │ Dép Adidas             │  │
│  │ 39            ×2  ¥ —  │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │  + Thêm món            │  │ → sheet nhập món
│  └────────────────────────┘  │
│                              │
│  TIỀN                        │
│  Tổng chốt khách  [        ] │
│  Cọc              [        ] │
│  ▸ Tỷ giá · ship · loại đơn  │  gập, mặc định đóng
└──────────────────────────────┘
┌──────────────────────────────┐
│ Tổng 4.520.000               │  thanh dính đáy, thay tabbar
│ Lời    340.000    [ Lưu đơn ]│
└──────────────────────────────┘
```

**Nhập nhanh từ ảnh tụt xuống thành một nút ở header.** `ZaloDropzone` hiện
chiếm nguyên khối đầu tiên của form, sai với thực tế là nhập tay mới là cách
làm chính. Chạm nút mở sheet dán/chọn ảnh, AI đọc, điền ngược vào form. Chức
năng giữ nguyên, chỉ đổi chỗ đứng và đổi tên (mục 9.1).

**Thanh đáy thay tabbar khi ở màn này**, luôn hiện Tổng, Lời và nút Lưu.
Không bao giờ phải cuộn tới đáy trang mới lưu được.

**Sheet "Thêm món" thay hàng sáu ô chen chúc.** `.item-row` hiện nhồi 6 input
vào một hàng, trên phone rơi xuống lưới `1fr 1fr`. Trong sheet mỗi ô một dòng
đủ rộng, thứ tự theo cách đọc đơn thật: Tên → SL → Đơn giá ¥ → Size/màu →
Link. Có nút **"Lưu & thêm món nữa"** để nhập liên tiếp mà không phải đóng
rồi mở lại sheet.

**Sheet "Chọn khách" bỏ cặp nút "Khách có sẵn / Khách mới".** Ô tìm ở đỉnh
với bàn phím bật sẵn, danh sách lọc dần theo từng chữ, dòng cuối luôn là
*Tạo khách mới «tên vừa gõ»*. Người dùng gõ tên là xong; máy tự biết khách đã
có hay chưa thay vì bắt khai trước.

**Nút "Copy báo giá" rời khỏi thanh đáy.** Thanh đáy chỉ giữ một hành động
chính. Báo giá chuyển sang thẻ xác nhận hiện ngay sau khi lưu — đúng thứ tự
thật: lưu đơn trước, gửi báo giá sau.

Mọi ô số dùng `inputMode="numeric"` và `enterKeyHint` phù hợp; ô tiền tự chèn
dấu phân cách khi rời ô.

## 6. Danh sách đơn

```
┌──────────────────────────────┐
│  Đơn hàng                    │
│  ┌────────────────────────┐  │
│  │ 🔍 Tìm khách / mã đơn  │  │
│  └────────────────────────┘  │
│ (Cần chú ý 3)(Tất cả)(Đang…  │ ← chip cuộn ngang, dính đỉnh
├──────────────────────────────┤
│ ┌──────────────────────────┐ │
│ │ Chị Lan             #142 │ │
│ │ Đã mua, đang về · 3n  ⬤ │ │
│ │ Còn thu        1.250.000 │ │
│ └──────────────────────────┘ │
```

Danh sách phẳng thay cho sáu bảy nhóm theo trạng thái. Thẻ cao khoảng 76pt,
chạm được cả thẻ, tiền căn phải tabular, trạng thái tụt xuống thành dòng phụ.

Chip lọc: `Cần chú ý · Tất cả · Đang về · Đã giao · Chưa thu đủ`, cuộn ngang,
dính dưới ô tìm khi cuộn. Mặc định mở ở *Cần chú ý* nếu có đơn cần chú ý,
không thì *Tất cả*.

Chấm cảnh báo `gap-dot` hiện tại giữ nguyên ý nghĩa (đơn thiếu thông tin).

## 7. Chi tiết đơn

Chín khối xếp chồng hiện tại chia lại thành đầu màn cố định cộng bốn tab:

```
┌──────────────────────────────┐
│ ←  #142 · Chị Lan       [⋯] │
│                              │
│  Còn phải thu                │
│  1.250.000                   │  ← --fs-6, tabular
│  Order hộ · 3 ngày           │
│  ●──●──○──○  Đã mua, đang về │  ← stepper một dòng
├──────────────────────────────┤
│  Tóm tắt │ Món │ Tiền │ Ảnh  │
├──────────────────────────────┤
│  … nội dung tab …            │
└──────────────────────────────┘
┌──────────────────────────────┐
│   [  Đã giao khách  →  ]     │  ← bước kế tiếp trên trục
└──────────────────────────────┘
```

- **Tóm tắt** — khách, cờ cần bổ sung, ghi chú, kiện vận chuyển, lịch sử
  trạng thái.
- **Món** — mỗi món một thẻ, không phải bảng. Chạm món mở sheet có giá theo
  dòng và nút *Lỗi NCC* / *Đổi trả*.
- **Tiền** — khối tiền, lịch sử thu, nút *Ghi nhận thu tiền* mở sheet.
- **Ảnh** — gallery và tải/chụp ảnh.

Thanh đáy giữ đúng **một** hành động: bước kế tiếp trên trục của loại đơn đó.
Nhiều lựa chọn thì mở sheet. Nhánh *sự cố* / *huỷ* nằm trong menu `⋯` ở
header — đúng tinh thần v4: trục chính phải hiển nhiên, nhánh phải cố ý mới
chạm tới.

Hai thứ chỉ có nghĩa trên điện thoại và hiện đang thiếu: **SĐT thành link
`tel:`** để gọi hoặc nhắn thẳng, và **nút copy địa chỉ giao** để dán sang app
vận chuyển.

## 8. Các màn còn lại

Tổng quan, Khách hàng, Tồn kho, Tài chính, Báo cáo, Tracking, Cài đặt, Sao
lưu dùng chung bộ primitive: header, tiêu đề lớn, thẻ, sheet.

**Tổng quan** xếp một cột theo mức cấp bách: Cần chú ý → Tổng còn phải thu →
Cần bổ sung → Ví ¥ → Lãi tháng. Bổ sung thẻ nhắc sao lưu (mục 9.2).

**Bảng xử lý theo hai nhánh, bỏ hẳn mẹo CSS.** Luật `.tbl` bẻ bảng thành
`display: block` + `td::before` bỏ đi. Thay bằng: ba bảng thật sự đọc trên
phone (sản phẩm trong đơn, tồn kho, thu tiền) render thành `ListRow` ở mobile
và `<table>` ở desktop — hai nhánh JSX rõ ràng. Các bảng còn lại (báo cáo,
sao lưu) chỉ cần khung `overflow-x: auto` tử tế, vì hiếm khi xem trên phone.

## 9. Ba việc bổ sung

### 9.1 Nhập nhanh từ ảnh

Nguồn ảnh không nhất thiết là Zalo. Đổi:

- Nhãn nút và tiêu đề sheet thành **"Nhập nhanh từ ảnh"**.
- `PHOTO_LABEL_LABELS.zalo_confirm` hiển thị **"Ảnh chốt đơn"** thay vì "Ảnh
  chốt đơn Zalo". Giá trị enum trong DB giữ nguyên `zalo_confirm` — đổi nó
  cần migration và làm hỏng các dòng ảnh cũ, không đáng.
- Component `ZaloDropzone` đổi tên thành `QuickImportSheet` (dù sao cũng viết
  lại). Tên file `src/lib/zalo-extract.ts` và `zalo-merge.ts` **giữ nguyên** —
  đổi chỉ tạo nhiễu diff.
- Prompt trong `zalo-extract.ts` nới ra để không giả định mẫu chốt đơn HeyP
  trên Zalo; vẫn giữ mẫu đó làm ví dụ trường hợp tốt nhất. Đây là thay đổi
  hành vi AI nên tách thành việc riêng, nghiệm thu bằng ảnh không phải Zalo.
  `tests/zalo-extract.test.ts` phải vẫn xanh.

### 9.2 Sao lưu bằng tay

Bỏ backup tự động, thay bằng backup người dùng chủ động chạy từ điện thoại.

- **Xoá `.github/workflows/db-backup.yml`.** An toàn về vận hành: job chống
  Supabase tự ngủ nằm ở `tracking-sweep.yml`, không dính gì tới nó.
- **Thêm `GET /api/backup`** sau `requireAuth`, xuất toàn bộ bảng ra
  `heyp-backup-YYYYMMDD-HHmm.json` với `Content-Disposition: attachment`.
  Trên iPhone file vào Files/iCloud. Route chạy **runtime Node**, không Edge —
  nó đụng DB (xem gotcha trong `CLAUDE.md`).
- **Thêm `scripts/restore-from-json.ts`** để nạp ngược. Chọn JSON thay vì SQL
  vì nó đọc được bằng mắt và không phụ thuộc vào việc sinh đúng escape của
  chuỗi SQL.
- **Màn Sao lưu** còn một nút lớn *Tải bản sao lưu*, và ghi rõ **ảnh không
  nằm trong file này** (ảnh ở Supabase Storage, tải từ dashboard khi cần).
- **Nhắc sao lưu.** Ghi `last_backup_at` vào bảng `settings` mỗi lần tải
  thành công, và Tổng quan cảnh báo nếu quá **14 ngày** chưa sao lưu. Backup
  thủ công hỏng ở chỗ người ta quên; cái nhắc này là thứ thay thế cron.

  `settings` là bảng khoá-giá-trị (`key text primary key, value text`) nên
  đây chỉ là một dòng mới — **không cần migration**. Nhưng phải mở rộng
  `src/lib/settings.ts` (module thuần, có test): thêm khoá vào `SETTING_KEYS`
  và trường `lastBackupAt: number | null` (epoch-seconds) vào `AppSettings`.
  Trường này **không** đi qua `positiveOr`/`nonNegativeOr` — nó có thể vắng
  mặt một cách hợp lệ (chưa từng sao lưu), khác hẳn hai tham số số hiện có
  vốn luôn có giá trị mặc định.

Rủi ro đã biết và đã chấp nhận: Supabase gói miễn phí không có backup tự động
cũng không có PITR. Sau thay đổi này, bản sao duy nhất là bản gần nhất người
dùng tự tay tải.

### 9.3 Nhập kho chủ động, kèm vá lỗ ví ¥

**Đường vào.** Nút `+` ở **header màn Kho** (không phải ô `[+]` giữa tabbar,
ô đó luôn là tạo đơn) mở sheet *Nhập kho*: Tên hàng · SL · Đơn giá ¥; tỷ giá
lấy mặc định từ `settings` và gập lại để sửa.

**Cách làm.** Không viết hàm cộng tồn mới. Sheet tạo một đơn `nhap_kho` không
khách rồi đẩy qua `changeOrderStatus` tới `ve_kho_vn`. Toàn bộ side-effect
(cộng tồn nguồn `active`, bình quân gia quyền, lịch sử trạng thái) chạy bằng
code đã có và đã có test. Phần thưởng kèm theo: mỗi lần trữ hàng đều có bản
ghi *mua gì, bao nhiêu, ngày nào*, thay vì một dòng tồn kho từ trên trời rơi
xuống.

**Lỗi tiền phát hiện khi thiết kế mục này.** Dòng trừ ví ¥ không idempotent,
gây sai ở hai chỗ, cùng một gốc:

1. Đơn `nhap_kho` được tạo thẳng ở trạng thái `da_mua_tq`
   (`queries.ts:230`, qua `initialStatus`), trong khi dòng `chi` chỉ được ghi
   khi **chuyển tới** `da_mua_tq` bên trong `changeOrderStatus`
   (`queries.ts:841`). Đơn nhập kho không bao giờ đi qua bước chuyển đó, nên
   nhập kho tiêu ¥ thật mà ví ¥ không hề bị trừ.
2. Đơn `order_ho` đi `da_mua_tq → su_co → da_mua_tq` sẽ trừ ví **hai lần**
   cho cùng một lô hàng. `queries.ts:841` không kiểm dòng chi đã tồn tại, dù
   `queries.ts:999` ngay bên dưới đã có sẵn đúng kiểu kiểm đó.

**Cách vá, theo đúng nếp của repo.** Repo không có test đụng DB — mọi test
đều khoá phần *luật* mà code DB dựa vào. Nên tách luật ra một hàm thuần trong
`src/lib/cny-wallet.ts`:

```ts
shouldDeductCny({ orderType, toStatus, goodsTotalCny, alreadyDeducted })
```

Viết test cho hàm đó, rồi cho **cả** `createOrder` lẫn `changeOrderStatus`
gọi chung nó. Một nguồn chân lý, idempotent theo thiết kế chứ không theo may
mắn.

**Hệ quả về số liệu.** Sau khi vá, số dư ví ¥ hiển thị sẽ tụt xuống đúng bằng
tiền hàng của các đơn nhập kho cũ. Đó là con số đúng — tiền đã tiêu từ lâu,
chỉ là sổ chưa ghi. Dữ liệu chạy thử đã xoá sạch ngày 20/08 nên nhiều khả
năng không có đơn nhập kho cũ nào; **không** thêm dòng `dieu_chinh` bù trừ.

## 10. Desktop

Cùng component, `@media (min-width: 900px)`: sidebar quay lại, tabbar ẩn,
lưới mở hai cột, `<Sheet>` đổi chỗ đứng thành modal giữa màn hình (cùng
component, khác vị trí). Desktop được nâng theo miễn phí chứ không bị bỏ rơi.

## 11. Tổ chức file

`globals.css` 1711 dòng tách thành `src/styles/`:

| File | Nội dung |
|---|---|
| `tokens.css` | biến màu, thang chữ, thang khoảng cách, bo góc, đổ bóng |
| `base.css` | reset, `html`/`body`, typography gốc, quy tắc số tabular |
| `layout.css` | app shell, header, tabbar, sheet, thanh dính đáy |
| `components.css` | button, field, chip, card, badge, list-row |
| `screens.css` | luật riêng của từng màn |

`globals.css` chỉ còn các `@import`.

Viết **mobile-first**: luật gốc là điện thoại, `@media (min-width: 900px)`
mới mở rộng cho desktop. Ngược hẳn hiện tại (gốc là desktop, `max-width: 767px`
vá lại).

## 12. Ranh giới an toàn và nghiệm thu

**Không đụng** `src/lib/money.ts`, `order-status.ts`, `inventory.ts`,
`line-pricing.ts`, `pnl.ts`, hay bất kỳ công thức tiền nào. Ngoại lệ duy nhất
là mục 9.3 — thêm `shouldDeductCny` vào `cny-wallet.ts` và cho hai chỗ trong
`queries.ts` gọi nó, kèm test riêng.

**Test.** `npm test` phải xanh trước và sau, cộng test mới cho
`shouldDeductCny`. Nếu một test tiền hoặc trạng thái đổi màu thì đã đi quá
ranh giới. `npx tsc --noEmit` sạch.

**Nghiệm thu giao diện** bằng preview trình duyệt ở đúng khổ máy đang dùng:
393×852 (iPhone 15 Pro) và 430×932 (15 Pro Max), cộng một lượt desktop để
chắc không vỡ. Chụp màn hình từng màn. Kiểm riêng ba thứ dễ trượt:

1. Chạm vào mọi ô nhập, xác nhận trang **không** phóng to.
2. Tabbar và thanh đáy **không** bị thanh home indicator che.
3. Ở chế độ standalone (đã cài ra màn hình chính), mọi màn chi tiết đều quay
   lại được mà không cần nút Back của trình duyệt.

## 13. Rủi ro

| Rủi ro | Xử lý |
|---|---|
| Viết lại CSS làm vỡ màn ít dùng (Báo cáo, Tracking, Sao lưu) | Nghiệm thu từng màn bằng ảnh chụp, không chỉ các màn chính |
| Bỏ backup tự động rồi quên backup tay | Nhắc ở Tổng quan sau 14 ngày (mục 9.2) |
| Vá ví ¥ làm số dư tụt, tưởng mất tiền | Ghi rõ trong tài liệu vận hành; số cũ mới là số sai |
| Nới prompt AI làm giảm độ chính xác trên ảnh Zalo chuẩn | Giữ mẫu HeyP làm ví dụ trong prompt; thử lại bằng ảnh thật cả hai loại |
| Icon PWA tạm bằng chữ trông nghiệp dư | Chấp nhận; thay `logo.png` sau là xong, không đụng code |
