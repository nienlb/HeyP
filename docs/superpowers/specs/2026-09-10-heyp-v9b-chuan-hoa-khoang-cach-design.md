# HeyP v9-B — Chuẩn hoá khoảng cách theo vai trò

**Ngày:** 10/09/2026
**Trạng thái:** đã chốt thiết kế, chờ viết kế hoạch triển khai

## 1. Bối cảnh

Yêu cầu gốc: *"xem lại căn chỉnh layout, padding margin — có cái thì đều cái
thì bị sát với nhau, rà soát lại để căn chỉnh hợp lý, UI/UX được tối ưu cao
hơn"*. Đây là ý thứ hai của yêu cầu đã sinh ra v9-A; v9-A đã xong và đẩy lên
production, phần này tách riêng như đã hẹn.

Đo trên toàn bộ `src/styles/` (6 file, 2643 dòng):

| File | Dùng `var(--sp-*)` | px đúng lưới nhưng gõ cứng | px **lệch** lưới |
| --- | ---: | ---: | ---: |
| `base.css` | 5 | 0 | 0 |
| `tokens.css` | 0 | 0 | 0 |
| `components.css` | 44 | 0 | 0 |
| `layout.css` | 43 | 0 | 2 |
| `screens.css` | 30 | 0 | 1 |
| `legacy.css` | 13 | 69 | **83** |
| **Tổng** | **135** | **69** | **86** |

Phân bố giá trị lệch trong `legacy.css`: `10px` ×28, `6px` ×16, `14px` ×16,
`9px` ×4, `22px` ×3, `2px` ×6, `3px` ×2, `11px` ×2, `20px` ×2, và mỗi cái một
lần với `5px`, `7px`, `18px`, `34px`.

Hai điều rút ra:

1. **Đây không phải vài chỗ lẻ.** `legacy.css` gần như không dùng token: 152
   giá trị gõ cứng so với 13 lần dùng biến. Nó là **một hệ khoảng cách thứ
   hai** chạy song song với hệ token của v5.
2. **`legacy.css` import CUỐI** trong `globals.css`, nên ở mọi luật cùng độ
   đặc hiệu nó thắng. Dự án đã dính hai lần vì điều này (`.btn` đè
   `.rail-action` ở v8-A; luật `font-size: 16px` cho ô nhập).

## 2. Vấn đề thật sự là gì

Cám dỗ đầu tiên là làm tròn: `10px → 12px`, `14px → 16px`, `6px → 8px`.

**Cách đó không chữa được đúng cái người dùng than.** Nếu thẻ A đang
`padding: 20px` và thẻ B `padding: 14px`, làm tròn cho ra 24 và 16 — **vẫn
khác nhau**. Cảm giác "cái thì đều cái thì sát" đến từ việc *hai thứ giống
nhau lại có khoảng cách khác nhau*, chứ không phải từ việc con số lệch lưới.
Làm tròn chỉ hợp thức hoá sự lệch đó dưới dạng số đẹp hơn.

Vì vậy v9-B chuẩn hoá **theo vai trò**, không theo con số cũ.

## 3. Luật vai trò

Mỗi khoảng cách được hỏi *"nó làm việc gì"*, rồi gán token theo bảng:

| Vai trò | Token | Ví dụ |
| --- | --- | --- |
| Trong cùng một dòng: nhãn ↔ giá trị | `--sp-1` (4px) | `.dt-sub` dưới tên, chú thích dưới số tiền |
| Giữa các dòng cùng một nhóm | `--sp-2` (8px) | các dòng món trong một thẻ |
| Giữa các thẻ / khối trong một màn | `--sp-3` (12px) | thẻ này với thẻ kia |
| Padding bên trong thẻ | `--sp-4` (16px) | `.card`, `.sheet-body` |
| Giữa các mục lớn (`<section>` ↔ `<section>`) | `--sp-5` (24px) | khối Khách ↔ khối Món |

Cùng vai trò thì cùng token, bất kể trước đó là 10, 14 hay 20.

`--sp-6` (32px) và `--sp-7` (48px) giữ nguyên cho các khoảng hở lớn đang dùng;
bảng trên chỉ liệt kê năm vai trò thường gặp, không cấm hai bậc còn lại.

**Không thêm bậc mới vào thang.** Thang chữ của dự án đã có luật "sáu bậc,
KHÔNG thêm bậc thứ bảy"; thang khoảng cách theo cùng tinh thần. Các giá trị
18/20/22px sẽ rơi vào một vai trò cụ thể chứ không được đẻ ra `--sp-4b: 20px`.

## 4. Ba loại được miễn trừ

### 4.1 Chật có chủ đích

Badge `padding: 3px 9px`, `gap: 2px` của nhãn tabbar. Ép về lưới là đổi **hình
dạng** phần tử chứ không phải sửa khoảng cách — viên badge sẽ to ra và tabbar
sẽ cao thêm.

### 4.2 Số đo cấu trúc, không phải khoảng cách

Hai giá trị này **thành token có tên riêng**, không thành `--sp-*`:

| Hiện tại | Thành |
| --- | --- |
| `margin-left: 240px` (`layout.css`, bù bề rộng sidebar) | `var(--sidebar-w)` |
| `padding-bottom: calc(84px + var(--sab) + var(--sp-4))` | `var(--tabbar-clear)` |

`--tabbar-clear` khai trong `tokens.css` là
`calc(var(--tabbar-h) + var(--sp-6))` — tức **88px, không phải 84px**. Chênh
**+4px** và đây là thay đổi CÓ THẬT, không phải dọn dẹp không đổi hành vi: 84
hiện là `--tabbar-h` (56) cộng 28px nhô lên của FAB, mà 28 cũng lệch lưới. Ghi
rõ ở đây để người thi công không tưởng là phép thay tương đương, và để kiểm
bằng mắt rằng nội dung cuối trang không bị FAB che.

Đây là cải thiện thật, không phải dọn dẹp hình thức: `84px` hiện là số ma cho
"tabbar + FAB". Đổi chiều cao tabbar mà quên sửa số đó là **nội dung bị tabbar
che**, và không có gì báo.

### 4.3 Không phải khoảng cách

`font-size: 34px`, `width: 34px`, `height: 34px`. Ngoài phạm vi.

## 5. Cách thi công — năm đợt

Chia theo **mục có sẵn trong `legacy.css`** (file đã tự chia ~26 mục), không
chia theo màn. Chia theo màn nghe hợp lý hơn nhưng **không cắt được**:
`Badges`, `Table`, `Forms` dùng chung ở cả bốn màn — sửa "màn chi tiết đơn" là
đã đụng ba mục dùng chung, rồi ba màn kia đổi theo mà không ai nhìn.

| Đợt | Mục trong `legacy.css` | Màn bị ảnh hưởng |
| --- | --- | --- |
| 1 | Badges · Table · Forms | tất cả — phần dùng chung, làm trước |
| 2 | Order list · Cards & detail · Timeline · Hành trình đơn · v3-A bóc giá | Đơn, Chi tiết đơn |
| 3 | Tổng quan · Thẻ trạng thái · Lãi/lỗ | Tổng quan, Báo cáo |
| 4 | Tồn kho · Ảnh upload/gallery · Tracking | Kho |
| 5 | **Toàn bộ phần còn lại của `legacy.css`** — Đăng nhập · Zalo AI · Khách hàng/cờ · Dòng đã tách · Responsive · Nút phá huỷ · chấm báo đơn thiếu · lưới xác nhận nhãn ảnh · ảnh mới thả · select · lỗi đổi trạng thái — **cộng** 3 giá trị lệch trong `layout.css`/`screens.css` | phần còn lại |

`legacy.css` có **26** khối comment; bốn đợt đầu đặt tên 18 khối, nên đợt 5
được định nghĩa là **catch-all**: mọi thứ chưa được đợt nào nhận. Nếu liệt kê
đóng thì bảy khối nhỏ (Nút phá huỷ, chấm báo đơn thiếu, lưới nhãn ảnh, ảnh mới
thả, select, lỗi đổi trạng thái, chú thích giá ¥ máy gợi ý) sẽ rơi ra ngoài và
test khoá ở mục 6 đỏ ở commit cuối mà không ai hiểu vì sao.

Mỗi đợt một commit, để đợt nào hỏng thì `git revert` đúng đợt đó.

Đợt 1 đi trước có lý do: chuẩn hoá `Cards & detail` xong mới sờ `Forms` thì
form nằm trong card bị dịch hai lần, và lần xem preview đầu thành công cốc.

Phạm vi gồm **cả 69 giá trị đúng lưới nhưng gõ cứng** trong `legacy.css`, không
chỉ 86 giá trị lệch — để `padding: 16px` cũng thành `var(--sp-4)`. Chừa chúng
lại thì test khoá ở mục 6 sẽ đỏ, và ranh giới "px nào được phép" lại thành mơ
hồ.

## 6. Lưới an toàn — test khoá

Dự án khoá bất biến bằng test đọc mã nguồn (`activity-coverage.test.ts`,
`screen-meta.test.ts`). v9-B làm đúng vậy: `tests/spacing-grid.test.ts` đọc cả
sáu file CSS, bóc mọi khai báo `padding` / `margin` / `gap` / `row-gap` /
`column-gap`, và đỏ nếu giá trị không phải một trong:

- `var(--sp-1…7)`, hoặc `calc()` chỉ ghép từ `--sp-*` (cho giá trị âm như
  `calc(var(--sp-3) * -1)`)
- `0`, `auto`, `inherit`
- biến có tên riêng: `var(--sat)`, `var(--sab)`, `var(--sidebar-w)`,
  `var(--tabbar-h)`, `env(...)`

Test **cũng** kiểm mọi `var(--sp-N)` dùng trong CSS đều có khai báo trong
`tokens.css`. Lý do ở mục 7.1.

### Miễn trừ khai bằng comment, không bằng danh sách theo dòng

```css
/* spacing-exempt: viên badge cố ý chật, ép về lưới là đổi hình dạng */
padding: 3px 9px;
```

Test chỉ chấp nhận khi thấy `spacing-exempt` kèm **lý do không rỗng** ở dòng
ngay trên. Danh sách miễn trừ theo số dòng bị loại: số dòng trôi ngay lần sửa
đầu và danh sách thành rác. Cách này thì lý do nằm cạnh mã, không bao giờ
trôi, và người sửa sau buộc phải viết ra vì sao — không viết nổi lý do nghĩa
là chỗ đó nên sửa chứ không nên miễn.

## 7. Rủi ro đã biết

### 7.1 CSS không có `tsc` bảo vệ

Khác biệt lớn nhất so với v9-A. Gõ sai tên biến (`var(--sp-33)`) thì trình
duyệt **âm thầm bỏ qua cả dòng**, không lỗi, không cảnh báo — phần tử rơi về
`margin: 0`. Test ở mục 6 bắt được giá trị lệch lưới nhưng **không** bắt được
biến không tồn tại, nên nó phải kiểm thêm điều kiện "mọi `--sp-N` đều có khai
báo".

### 7.2 Thứ tự import vẫn không đổi

v9-B chuẩn hoá *giá trị*, không đụng *độ đặc hiệu*. Bẫy cũ còn nguyên: luật mới
ở `components.css` cùng độ đặc hiệu với luật cũ ở `legacy.css` thì luật cũ vẫn
thắng. **Cố ý không sửa** — gỡ thứ tự import là đổi hành vi của cả 1195 dòng
cùng lúc, rủi ro lớn hơn nhiều so với việc đang làm.

### 7.3 Bốn màn đổi cùng lúc

Chuẩn hoá theo vai trò nghĩa là gần như mọi khoảng cách đều dịch một chút.
Phòng bằng năm commit tách rời (mục 5).

### 7.4 Mật độ trên iPhone

Nhiều khoảng cách 10px sẽ thành 12px. Cộng dồn qua một màn dài (chi tiết đơn
có ~15 khối) là dài thêm khoảng một phần sáu màn hình. Nếu thấy thưa quá, cách
sửa là **hạ một bậc vai trò trong bảng ở mục 3** rồi áp lại — sửa một dòng
trong bảng, không chỉnh tay từng chỗ.

## 8. Nghiệm thu

Mỗi đợt: `npm test` + `npx tsc --noEmit`, rồi mở preview chụp các màn của đợt
đó ở **375px** trước và sau.

Người dùng đã chọn tự xem sau khi deploy, nên không dựng bộ ảnh trước/sau đầy
đủ để duyệt; ảnh chụp là để người thi công tự bắt lỗi, và gửi khi màn nào đổi
nhiều hơn dự kiến.

Hai phép kiểm bắt buộc, vì đây là vùng CSS đã từng cắn nhau:

1. **Ô nhập vẫn 16px** —
   `[...document.querySelectorAll("input,select,textarea")].map(el=>getComputedStyle(el).fontSize)`
   phải toàn `"16px"`. Dưới ngưỡng là Safari iOS tự phóng to trang mỗi lần
   chạm vào ô.
2. **Thanh dính đáy vẫn cộng safe-area** — tabbar và StickyBar phải còn
   `env(safe-area-inset-bottom)` qua `--sab`, nếu không chúng nằm dưới vạch
   home của iPhone.

## 9. Ngoài phạm vi, cố ý không làm

Không đụng màu, cỡ chữ, bo góc, đổ bóng. Không đổi cấu trúc DOM. Không gỡ
`legacy.css` khỏi `globals.css` và không viết lại nó thành component mới (đã
cân nhắc và loại: dự án lớn, rủi ro cao, và không giải quyết nhanh cái người
dùng đang thấy). Không thêm bậc mới vào thang khoảng cách. Không đụng
`font-size: 34px` và `width/height: 34px`.
