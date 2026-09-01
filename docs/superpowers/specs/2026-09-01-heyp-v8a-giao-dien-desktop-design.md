# HeyP v8-A — Giao diện desktop và sắp xếp lại màn

**Ngày:** 01/09/2026
**Trạng thái:** đã chốt thiết kế, chờ viết kế hoạch triển khai

## 1. Bối cảnh

v5 viết lại toàn bộ giao diện theo hướng mobile-first cho iPhone. Quyết định
đó đúng lúc đó, nhưng nó để lại một hệ quả: **desktop chưa bao giờ được thiết
kế**, chỉ được cho mượn bố cục của điện thoại.

Đo trên code hiện tại:

| Triệu chứng | Nguyên nhân trong code |
| --- | --- |
| Laptop trống hai bên | `.app-main { max-width: 960px }` — [`layout.css`](../../../src/styles/layout.css), khối `@media (min-width: 900px)`. Không có một luật lưới nào. |
| Tổng quan phải cuộn 3 màn | `src/app/page.tsx` xếp 7 `<section className="card">` chồng dọc |
| Màn Đơn phí chỗ | Mỗi đơn là một `ListRow` cao 76px chứa đúng 3 mẩu chữ, kéo ngang 960px |
| Màn Khách sơ sài | `listCustomersWithTotals` chỉ trả `orderCount` + `outstanding` |

Người dùng hiện chia đôi thời gian giữa điện thoại và laptop (chốt đơn, chụp
ảnh trên điện thoại; xem báo cáo, sửa nhiều đơn trên laptop). Cả hai bố cục
đều phải tốt.

## 2. Phạm vi

Trong phạm vi: bố cục desktop cho **Tổng quan, Đơn, Khách hàng, Tạo đơn, Chi
tiết đơn**; ẩn màn Tracking; thêm trang 404.

**Ràng buộc cứng xuyên suốt spec: dưới 900px không đổi một pixel nào.** Mọi
luật CSS mới nằm trong `@media (min-width: 900px)`, hoặc ẩn/hiện phần tử qua
media query. Nghiệm thu bằng ảnh chụp 390px trước và sau.

Ngoài phạm vi, đã tách thành spec riêng:

- **v8-B** — chớp tắt khi chuyển màn (`loading.tsx`, prefetch). v8-A **không
  đụng** `loading.tsx`, `middleware.ts`, `redirect-rescue.tsx`.
- **v8-C** — nút reset DB cho tài khoản `nien`, nhật ký hoạt động. v8-A
  **không đụng** `src/db/schema.ts` — không migration nào.

Không đụng: nghiệp vụ tiền, luật trạng thái, tồn kho, ví ¥, quyền.

## 3. Nguyên tắc bố cục dùng chung

Giữ nguyên breakpoint **900px** đã có. Không thêm breakpoint thứ hai.

| | Hiện tại | Sau v8-A |
| --- | --- | --- |
| Bề rộng nội dung desktop | `max-width: 960px` | `max-width: 1280px` |
| Cách xếp thẻ | chồng dọc | ba lớp lưới dùng chung |

Chốt 1280px chứ không full-width: quá ngưỡng đó dòng chữ dài gây mỏi mắt, và
bảng ở mục 5 vốn đã đủ cột để lấp chỗ. Màn 1440px sẽ có lề — nhưng là lề có
chủ ý, không phải 480px bỏ hoang.

Ba lớp mới trong `src/styles/layout.css`, dùng lại khắp nơi:

- `.kpi-row` — hàng ô số liệu. Desktop 4 cột; dưới 900px thành 2×2.
- `.card-grid` — `repeat(auto-fit, minmax(320px, 1fr))`. Tự về 1 cột trên
  điện thoại, không cần media query riêng.
- `.with-rail` — `grid-template-columns: 1fr 300px`, cột phải `sticky`. Dưới
  900px thành 1 cột, cột phải rơi xuống dưới (hoặc thành thanh dính đáy, xem
  mục 7).

### 3.1 Luật một-DOM

Mọi phần trong spec này chỉ render **một** bộ DOM cho cả hai kích thước, và
để CSS quyết định nó trông thế nào.

Cách làm ngược lại — render hai lần rồi ẩn một bằng `.only-desktop` /
`.only-mobile` — bị **loại có chủ ý**: nó tạo hai nguồn chân lý cho cùng một
dòng dữ liệu, sửa một quên một là chuyện sớm muộn, và lỗi kiểu đó không có
test nào bắt được vì cả hai bản đều "chạy".

## 4. Màn Tổng quan (`src/app/page.tsx`)

Xếp lại theo thứ tự **số để liếc → việc phải làm**:

```
[ thẻ nhắc sao lưu — chỉ khi quá 14 ngày, giữ nguyên logic hiện có ]

┌ Doanh thu ─┬ Lãi tháng ──┬ Công nợ ───┬ Ví ¥ ────┐   .kpi-row
│ 28.400.000 │  4.150.000  │ 12.400.000 │  3.820 ¥ │
│ 14 đơn     │ 2 đơn ước tính│ 8 khách nợ│ ≈ 13,7tr │
└────────────┴─────────────┴────────────┴──────────┘

┌ Đơn theo trạng thái ─────────────────────────────┐   cả bề rộng
│  7 Khách chốt │ 12 Đang về │ 4 Đã giao │ 1 Sự cố │
└──────────────────────────────────────────────────┘

┌ ⚠️ Cần chú ý ──────────┬ Khách nợ nhiều nhất ────┐   .card-grid
└────────────────────────┴─────────────────────────┘
┌ Cần bổ sung ───────────┬ Tác vụ nhanh ───────────┐
└────────────────────────┴─────────────────────────┘
```

Thay đổi về nội dung, không chỉ bố cục:

- **Thêm ô Doanh thu.** `pnl.confirmed.revenueVnd + pnl.estimated.revenueVnd`
  — `PnlBlock.revenueVnd` trong [`src/lib/pnl.ts`](../../../src/lib/pnl.ts)
  đã tính sẵn, màn Tổng quan chỉ chưa hiển thị.
- **Tách "Công nợ" làm hai.** Con số tổng lên hàng KPI; danh sách top 5 khách
  nợ thành thẻ riêng. Hiện hai thứ bị nhồi chung một thẻ.
- **Ví ¥ và Lãi tháng bỏ nút** "Xem ví" / "Xem báo cáo" — cả ô KPI là một
  link.
- **"Cần chú ý"** hiện 8 đơn trên desktop, 5 trên điện thoại. Theo luật
  một-DOM (3.1): server luôn render 8 dòng, ba dòng cuối mang class
  `.row-desk-only` bị `display: none` dưới 900px. Không cắt mảng hai lần.

Thứ tự các khối **giống hệt nhau** ở hai kích thước; desktop chỉ gộp chúng
thành hàng. Nhờ vậy người dùng đổi máy không phải học lại.

**Không thêm truy vấn DB nào.** Cả bốn số KPI rút từ dữ liệu `HomePage` đã
`Promise.all` sẵn, kể cả số đơn (đếm từ `pnlData`).

## 5. `DataTable` — cơ chế bảng

### 5.1 Vì sao không dùng thẻ `<table>`

Dòng danh sách hiện tại là `<Link className="list-row">` — **cả dòng là một
link**. HTML không cho `<a>` bọc `<tr>`. Dùng `<table>` thật thì phải bỏ hành
vi bấm-cả-dòng, mà đó chính là thứ màn điện thoại đang sống nhờ. Vì vậy
"bảng" ở đây dựng bằng CSS Grid.

### 5.2 Component

`src/app/_components/data-table.tsx`:

```ts
type Column<T> = {
  key: string;
  header: string;
  /** Một phần của grid-template-columns: "1fr" | "90px" | "minmax(0,2fr)" */
  width: string;
  align?: "right";
  /** true = hiện cả trên điện thoại. Mặc định false: chỉ từ 900px. */
  mobile?: boolean;
  /** Vắng mặt = cột không sắp xếp được. */
  sortBy?: (row: T) => number | string;
  cell: (row: T) => ReactNode;
};
```

Cách một DOM phục vụ hai kích thước:

- **Desktop** — `grid-template-columns` ghép từ `columns.map(c => c.width)`,
  truyền vào qua biến CSS inline `--dt-cols`.
- **Điện thoại** — `grid-template-columns: 1fr auto` cứng; cột nào không có
  `mobile: true` thì `display: none`. Thường chỉ còn 2 cột: tên và tiền.
- **Thông tin phụ trên điện thoại** (trạng thái, tuổi đơn) nằm **bên trong ô
  tên** dưới dạng dòng thứ hai, mang class `.dt-sub`, và `.dt-sub` bị
  `display: none` từ 900px trở lên — vì lúc đó nó đã có cột riêng.

Kết quả: điện thoại ra đúng thứ đang có (tên + dòng meta xám + tiền bên phải),
desktop ra bảng.

`ListRow` cũ **giữ nguyên, không đụng**. Năm chỗ khác đang dùng nó (Tổng quan,
`payments-block`, `users-list`, `inventory-row`, `package-row`) không bị ảnh
hưởng.

### 5.3 Sắp xếp

Làm ở **server**, qua query string (`?sort=con_thu&dir=desc`). Ba màn này vốn
đã nạp toàn bộ hàng vào bộ nhớ rồi mới lọc, nên sắp xếp không tốn thêm truy
vấn nào và **không cần một dòng JS phía client**. Tiêu đề cột là `<Link>`.

## 6. Màn Đơn và màn Khách hàng

### 6.1 Màn Đơn (`src/app/orders/page.tsx`)

Cột: `#` · `Khách hàng` · `Trạng thái` · `Món` · `Đã thu` · `Còn thu`.

`Món` và `Đã thu` là thông tin **mới** ở màn danh sách. `Đã thu` lấy từ
`orders.deposit` (đã có trong `OrderListRow`). `Món` cần thêm một subquery
`COUNT(*)` trên `order_items` — gộp vào truy vấn meta **đã có sẵn** trong
`listOrdersWithGaps`, không phát sinh truy vấn thứ ba.

**Cột `Loại` và `Tuổi` bị bỏ có chủ ý** (6 cột đọc thoáng hơn 8). Nhưng tuổi
đơn chính là thứ sinh ra cờ `isStale`, nên **tín hiệu phải giữ**: badge
`⏳ 12n` gắn cạnh ô Trạng thái, **chỉ hiện khi `isStale` hoặc `su_co`**. Bình
thường không chiếm chỗ; bất thường thì đập vào mắt.

Chấm cảnh báo vàng (`gaps`) và dấu sự cố gắn vào ô Khách hàng như hiện nay.

Thanh tìm kiếm, dãy chip lọc, và thanh chọn hàng loạt (v6) giữ nguyên logic.
Chỉ xếp lại: trên desktop ô tìm kiếm và nút "Tạo đơn" nằm cùng một hàng thay
vì hai hàng chồng nhau.

### 6.2 Màn Khách hàng (`src/app/customers/page.tsx`)

Chip năm ở đầu màn: `Tất cả · 2026 · 2025 · …`, danh sách năm lấy từ chính
bảng `orders`.

Cột: `Khách hàng` · `SĐT` · `Đơn` · `Món` · `Đã trả` · `Còn nợ`.

**Mốc năm là ngày TẠO ĐƠN**, không phải ngày thu tiền. Nghĩa là: "những đơn
khách này mở trong năm 2026 — bao nhiêu đơn, bao nhiêu món, đã trả được bao
nhiêu, còn nợ bao nhiêu". Bốn cột cùng nói về một tập đơn nên cộng trừ khớp
nhau, và cột "Còn nợ" có nghĩa rõ ràng. Cách kia (theo ngày thu tiền) cho ra
bốn cột thuộc bốn tập khác nhau, trừ nhau ra số vô nghĩa.

Query mới `listCustomerStats(year: number | null)` trong `src/db/queries.ts`.
Ba điểm bắt buộc, sai là ra **số sai mà không báo lỗi**:

1. **Không JOIN `order_items` rồi `SUM(o.deposit)`.** JOIN món nhân bản dòng
   đơn — một đơn 3 món bị cộng tiền 3 lần. Phải gom đơn ở một CTE và gom món
   ở CTE khác, rồi mới ghép vào `customers`.
2. **Cắt năm theo giờ Việt Nam:**
   `EXTRACT(YEAR FROM to_timestamp(created_at) AT TIME ZONE 'Asia/Ho_Chi_Minh')`.
   Đơn tạo 5h sáng 01/01 giờ VN là 22h 31/12 giờ UTC — thiếu mệnh đề này thì
   nó rơi nhầm sang năm trước.
3. `::int` cho mọi `SUM`/`COUNT` trên cột `integer`, alias camelCase bọc nháy
   kép. Hai luật đã ghi trong `CLAUDE.md`, nhắc lại vì query này vi phạm được
   cả hai.

"Đã trả" lấy từ `orders.deposit` — vốn là Σ `payments` giữ đồng bộ qua
`syncOrderDeposit`, nên nó khớp đúng định nghĩa "theo ngày tạo đơn".

Hành vi chạm vào một khách **giữ nguyên**: admin mở sheet có nút xoá, nhân
viên nhảy sang `/orders?q=<tên>`.

## 7. Cột phải dính — Tạo đơn và Chi tiết đơn

Cùng luật một-DOM: khối tiền viết **một lần**, CSS quyết định nó đứng đâu.

### 7.1 Màn Tạo đơn (`src/app/orders/new/new-order-form.tsx`)

Hiện màn kết thúc bằng `<StickyBar>` chứa "còn phải thu + nút Tạo đơn". Gói
phần tóm tắt tiền thành một khối duy nhất đặt trong cột phải của `.with-rail`:

- Dưới 900px khối đó **vẫn mang class `.sticky-bar`**, giữ nguyên hành vi
  thanh dính đáy hiện tại — kể cả luật
  `.app-shell:has(.sticky-bar) .tabbar { display: none }`.
- Từ 900px trở lên nó thành cột phải `position: sticky`.
- Phần chi tiết (tiền hàng ¥, giá vốn quy đổi, lời, cọc) mang class
  `.rail-detail`, `display: none` dưới 900px. Điện thoại vẫn chỉ thấy dòng
  tổng như bây giờ.

Hai chỗ dễ vấp trong CSS hiện có:

- `.sticky-bar` đang có `margin-left: 240px` trong media query desktop (để
  tránh sidebar). Khi nó thành cột phải thì luật đó **phải bị gỡ**, nếu không
  cột bị đẩy lệch 240px.
- `.app-shell.has-bottom-bar .app-main { padding-bottom: 96px }` chỉ còn cần
  cho điện thoại.

### 7.2 Màn Chi tiết đơn (`src/app/orders/[id]/page.tsx`)

Thuận lợi: `order-head` và `OrderJourney` **đã là hai khối render ngoài phần
`tab ===`**, nên tách sang cột phải chỉ là bọc lại `<div>`, không xé nhỏ
component nào.

- Cột phải: `order-head` (Còn phải thu) + `OrderJourney` (stepper + nút
  chuyển bước).
- Cột trái: `OrderTabs` + nội dung tab.

**Cột phải không chứa nút "Thu tiền".** Thu tiền là thao tác ghi tiền thật;
đặt cùng một hành động ở hai nơi là kiểu bố trí khiến người ta bấm hai lần.
Thay bằng **link** "Thu tiền →" trỏ tới `?tab=tien`, nơi form thu tiền ở
nguyên chỗ cũ.

## 8. Ẩn màn Tracking

Xoá đúng một dòng khỏi mảng `MORE` trong
[`nav-config.ts`](../../../src/app/_components/nav-config.ts).

**Không** xoá route `/tracking`, **không** xoá bảng `packages` /
`order_packages`, **không** đụng cron sweep. `CARRIER_ADAPTERS` đang rỗng nên
chẳng có gì chạy; giữ code lại thì lúc có đơn vị vận chuyển thật chỉ cần thêm
lại một dòng nav.

Khối "Kiện vận chuyển" trong tab Tóm tắt của đơn **giữ nguyên** — nó là dữ
liệu của đơn, không phải màn Tracking.

## 9. Trang 404

`src/app/not-found.tsx`, **cố ý không bọc `AppShell`**. `AppShell` cần
`session` đọc từ DB; 404 là màn phải hiện được cả khi phiên hỏng hoặc DB chậm,
bắt nó đọc DB là tạo thêm một chỗ có thể treo.

Nội dung: logo, "Không tìm thấy trang", nút "Về Tổng quan" và "Xem danh sách
đơn".

Middleware chặn GET chưa đăng nhập **trước** khi tới đây, nên người chưa đăng
nhập gõ URL sai sẽ về `/login` chứ không thấy 404 — đúng ý đồ.

## 10. Kiểm thử và giới hạn của nó

**Test tự động phủ được** (viết bằng `node:test`, module thuần):

- Hàm sắp xếp của `DataTable` (thứ tự tăng/giảm, ổn định, giá trị `null`).
- Hàm suy ra danh sách năm từ mảng đơn.
- Hàm quyết định badge quá hạn (`isStale` / `su_co` → hiện; ngược lại → ẩn).

**Test tự động KHÔNG phủ được:** SQL của `listCustomerStats`. Dự án không có
DB test — mọi test hiện tại đều là module thuần. Cái bẫy nhân bản dòng ở mục
6.2 vì thế phải **kiểm bằng tay và ghi thành mục nghiệm thu bắt buộc**: chọn
một khách có ít nhất một đơn nhiều món, đối chiếu bốn số trên màn với số đọc
trực tiếp từ Supabase. Không để bước này thành "chắc là đúng".

**Bố cục kiểm bằng ảnh chụp** ở ba bề rộng: 390px (iPhone), 900px (đúng
ngưỡng), 1440px (laptop). Ràng buộc "điện thoại không đổi một pixel" kiểm
bằng cách chụp 390px trước và sau rồi so sánh.

Trước khi commit: `npx tsc --noEmit` và `npm test` phải xanh.

Thêm một bước kiểm đã có tiền lệ trong `CLAUDE.md`: sau khi thêm luật CSS
mới, chạy
`[...document.querySelectorAll("input,select,textarea")].map(el=>getComputedStyle(el).fontSize)`
để chắc mọi ô nhập vẫn là 16px — dưới ngưỡng đó Safari iOS tự phóng to trang.

## 11. Rủi ro

| Rủi ro | Cách chặn |
| --- | --- |
| Số của màn Khách sai âm thầm do JOIN nhân bản dòng | Hai CTE tách biệt (6.2); nghiệm thu đối chiếu tay bắt buộc |
| Đơn rơi nhầm năm ở ranh giới 01/01 | `AT TIME ZONE 'Asia/Ho_Chi_Minh'` (6.2) |
| Giao diện điện thoại bị đổi ngoài ý muốn | Mọi luật mới trong `@media (min-width: 900px)`; chụp 390px trước/sau |
| Ô nhập tụt xuống dưới 16px, Safari iOS phóng to | Kiểm bằng đoạn script ở mục 10 |
| `.sticky-bar` lệch 240px khi thành cột phải | Gỡ `margin-left` trong media query desktop (7.1) |
| Mất tín hiệu đơn quá hạn khi bỏ cột Tuổi | Badge `⏳` cạnh ô Trạng thái (6.1) |
