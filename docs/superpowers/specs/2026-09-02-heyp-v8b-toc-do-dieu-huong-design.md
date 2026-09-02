# HeyP v8-B — Tốc độ điều hướng và khung bền vững

**Ngày:** 02/09/2026
**Trạng thái:** đã chốt thiết kế, chờ viết kế hoạch triển khai

## 1. Bối cảnh

Người dùng mô tả: *"các màn click vào đừng có chớt tắt nữa, cảm giác load
lại bị delay n giây."*

Trước khi thiết kế, đã **đo production** (`https://hey-p.vercel.app`) từ Việt
Nam, edge `hkg1` → function `sin1`, mỗi phép 5 lượt:

| Phép đo | TTFB ấm | Chi phí server suy ra |
| --- | --- | --- |
| Nền mạng (TLS bắt tay) | 0,113s | — |
| `/` → 307 (chỉ middleware, không DB) | 0,225s | ~110ms |
| `/api/health` (Node + một câu `SELECT 1`) | 0,233s | ~120ms → **một câu DB ~10–30ms** |
| `/login` (render RSC đầy đủ, không DB) | 0,285–0,320s | ~175–205ms |
| `/api/health` **lần đầu, nguội** | **0,875s** | **cold start ≈ +640ms** |

Thêm một phép đo 13 lượt cách nhau 30 giây trong 6,5 phút: TTFB giữ nguyên
0,257–0,365s, không lượt nào xuống cấp. Kết luận: **function ấm thì nhanh;
cold start chỉ trả giá ở lần mở app đầu sau quãng im lặng dài, không phải mỗi
lần bấm.**

### 1.1 Bốn triệu chứng, bốn nguyên nhân khác nhau

| Triệu chứng | Nguyên nhân thật | Trong phạm vi v8-B? |
| --- | --- | --- |
| Chớp tắt mỗi lần bấm | `.loading-screen` có `animation-delay: 0.25s` để tránh nháy khi điều hướng nhanh — nhưng TTFB production là **260–300ms**, rơi ngay sau ngưỡng. Spinner bật lên rồi tắt trong vài chục ms. | **Có** |
| Cảm giác "load lại cả trang" | `src/app/layout.tsx` gốc chỉ có `<html><body>{children}</body></html>`. Sidebar/tabbar/header nằm trong `AppShell` của **từng trang**, nên chuyển màn là React tháo sạch rồi dựng lại. | **Có** |
| Delay lúc mở app | Cold start ~640ms. | **Có** — chữa bằng cảm giác, không chống cold start |
| Đơ hẳn nhiều giây (hiếm) | Pooler giữ transaction bỏ rơi. Đã có ba guardrail (`statement_timeout` 15s, `idle_in_transaction_session_timeout` 30s, `transaction_timeout` 60s). | **Không** — không đụng |

Điểm cần nhấn: **app không chậm.** Server ấm trả trong 0,26s. Thứ hỏng là
cách trình bày trạng thái chờ.

## 2. Phạm vi

Trong phạm vi: dựng route group `(app)` với layout giữ khung bền vững; bảng
tra tiêu đề theo đường dẫn; khung xương thay cho spinner toàn màn; bỏ
`loading.tsx` ở gốc.

Ngoài phạm vi, ghi rõ để khỏi trôi:

- **Không đụng guardrail pooler** (`drizzle/0004`, `0005`) — chúng đang làm
  đúng việc.
- **Không thêm ping giữ ấm.** Đã cân nhắc và bỏ: nó tốn quota GitHub Actions,
  không chắc giữ đúng instance mà người dùng rơi vào, và làm nặng thêm rủi ro
  ToS của Vercel Hobby vốn đã biết.
- **Không giảm số truy vấn mỗi màn.** Màn Tổng quan gọi ~8 lượt, nhưng đo
  được mỗi lượt chỉ ~10–30ms và chúng chạy song song trong `Promise.all`.
  Tối ưu chỗ này là công sức đổi lấy vài chục ms.
- **Không bật PPR** (còn experimental trong Next 15).
- **Không đụng v8-C** (reset DB, nhật ký hoạt động).

## 3. Kiến trúc mới

```
src/app/
  layout.tsx            giữ nguyên — vẫn chỉ <html><body>
  loading.tsx           XOÁ (xem mục 5)
  login/                ngoài group: không có khung
  not-found.tsx         ngoài group: không có khung
  (app)/
    layout.tsx          MỚI — requireAuth + Sidebar + ScreenHeader + MobileNav
    loading.tsx         MỚI — khung xương, chỉ thay vùng <main>
    page.tsx            Tổng quan (chuyển từ app/page.tsx)
    orders/ customers/ inventory/ finance/ reports/ settings/
    backup/ admin/ tracking/
```

Điểm mấu chốt: `(app)/layout.tsx` nằm **trên** ranh giới Suspense do
`(app)/loading.tsx` tạo ra. Ba hệ quả:

1. **Sidebar, tabbar, header render một lần rồi giữ nguyên** qua mọi lần
   chuyển màn trong group. React không tháo chúng. Đây là bản sửa thật cho
   "chớp tắt".
2. **Chỉ `{children}` bị thay**, và trong lúc chờ thì `(app)/loading.tsx` vẽ
   khung xương vào đúng chỗ đó.
3. **`redirect()` trong layout trả 307 thật trở lại.** Đây là thứ `CLAUDE.md`
   ghi là đã mất từ khi có `loading.tsx` ở gốc — nguyên nhân sự cố khoá cửa
   đăng nhập 01/09.

Về điểm 3: **middleware vẫn là cửa chính**, không được bỏ và không được dựa
vào thay đổi này. Middleware chạy ở Edge, không đọc DB, rẻ hơn, và đã được
kiểm chứng. Layout trả được 307 chỉ là lưới an toàn thứ hai.

`AppShell` bị tháo ra: phần khung chuyển vào `(app)/layout.tsx`, các trang
thôi bọc nó và chỉ render nội dung. Component `Sidebar`, `MobileNav`,
`ScreenHeader` giữ nguyên, chỉ đổi chỗ gọi.

## 4. Tiêu đề và nút quay lại

Layout không nhận được prop từ page, nên `title`/`backHref` chuyển sang một
bảng tra theo đường dẫn.

Module thuần mới `src/lib/screen-meta.ts`:

```ts
export type ScreenMeta = { title: string; backHref?: string };
export function screenMetaFor(pathname: string): ScreenMeta;
```

Bảng phủ 13 màn hiện có. Tiêu đề động **duy nhất** trong app là
`/orders/<id>` → `#<id>`, suy thẳng từ path. Đường dẫn lạ trả
`{ title: "HeyP" }`.

`ScreenHeader` thành client component đọc `usePathname()` — đúng khuôn
`NavLinks` (`src/app/_components/nav-links.tsx`) đang dùng, không phải phát
minh mới.

Hệ quả **tốt hơn mục tiêu ban đầu**: tiêu đề và nút quay lại đổi **ngay lúc
bấm**, trước khi server trả gì. Bấm "Khách hàng" là thấy chữ "Khách hàng"
tức thì.

**Đánh đổi phải nêu:** `title` không còn là prop bắt buộc mà `tsc` bắt được.
Thêm màn mới mà quên khai báo thì header hiện "HeyP" chứ không lỗi biên
dịch. Bù bằng một test khoá: **mọi `href` trong `nav-config.ts` phải có mục
trong `screen-meta.ts`**.

## 5. Khung xương, và cái giá của việc bỏ `loading.tsx` gốc

`(app)/loading.tsx` vẽ 3–4 khối thẻ xám mờ vào đúng vùng `<main>`, **hiện
ngay lập tức** — bỏ hẳn độ trễ 250ms. Không cần trễ nữa: nó không phải
spinner phủ màn hình, nó là nội dung tạm ở đúng chỗ nội dung thật sắp hiện
ra, nên không có gì để "nháy".

Giữ nguyên đồng hồ canh 8 giây và `RecoveryPanel`, chỉ đổi chỗ đứng: trong
vùng nội dung thay vì phủ toàn màn. Giữ luôn khối `.recovery-static` hiện
bằng `animation-delay` của CSS — React không hydrate nội dung fallback của
Suspense, nên đường CSS vẫn là đường duy nhất chạy được ở lần tải đầu.

**Cái giá:** bỏ `loading.tsx` gốc nghĩa là nếu `(app)/layout.tsx` treo thì
màn hình trắng — không có spinner nào của mình, chỉ vòng quay trên tab trình
duyệt.

Vẫn chọn bỏ, vì hai lý do:

- Layout chỉ làm **một** việc tốn thời gian: `getSession()`, đo được ~20ms.
  Mọi thứ nặng (8 truy vấn của Tổng quan…) nằm ở page, tức **dưới** boundary,
  nên chúng được khung xương che.
- Giữ `loading.tsx` gốc là giữ luôn cái bug đã khoá cửa đăng nhập 01/09.

Cửa sổ trắng vì vậy bị chặn trên bởi "cold start + một câu truy vấn" ≈ 700ms
xấu nhất — ngắn hơn nhiều so với ngưỡng 8 giây mà bảng chẩn đoán nhắm tới.

`RedirectRescue` **giữ lại** nhưng thu hẹp: chỉ còn lo redirect xảy ra **dưới**
boundary — `requireAdmin()` ở màn admin, và tài khoản bị khoá giữa chừng.

## 6. Ba ca đặc biệt

| Ca | Xử lý |
| --- | --- |
| `bottomBar={<></>}` ở `/orders/new` | Bỏ prop. Tabbar đã tự ẩn qua `.app-shell:has(.sticky-bar) .tabbar` sẵn có; phần padding đổi từ class `.has-bottom-bar` sang `:has()` cùng kiểu |
| `action` (nút chạy sweep) ở `/tracking` | Chuyển vào thân trang. Header giờ ở layout nên trang không chèn vào được; Tracking đã ẩn khỏi nav từ v8-A nên đây là màn ít dùng nhất |
| `.header-action-float` (nút Chọn ở `/orders`, Nhập nhanh từ ảnh ở `/orders/new`, `+` ở `/inventory`) | **Không đụng.** Chúng là `position: fixed` neo vào toạ độ header chứ không nằm trong header, nên chạy y nguyên |

## 7. Kiểm thử

**Test tự động (module thuần, `node:test`):**

- `screenMetaFor`: suy `#id` từ `/orders/13`; đường dẫn lạ trả `"HeyP"`;
  query string bị bỏ; dấu `/` thừa ở cuối không làm hỏng.
- **Test khoá phủ sóng**: mọi `href` trong `nav-config.ts` (cả `main` lẫn
  `more`) đều có mục trong `screen-meta.ts`. Đây là lưới thay cho việc `tsc`
  không còn bắt được `title` thiếu.

**Nghiệm thu bắt buộc — hồi quy nguy hiểm nhất:**

`curl -i https://hey-p.vercel.app/` khi **chưa đăng nhập** phải trả **`307`**
kèm `location: /login`. Không được bỏ bước này: chính nó là thứ hỏng hôm
01/09, và v8-B đụng đúng vùng đó. Kiểm cả trước lẫn sau deploy.

Kèm theo: đăng nhập bằng tài khoản `nhan_vien` rồi mở `/admin/users` — phải
bị đá về `/`, không được treo.

**Đo lại production sau deploy**, bằng đúng bộ curl đã dùng ngày 02/09
(`/`, `/api/health`, `/login`, mỗi cái 5 lượt), để so trước/sau bằng số. Kỳ
vọng TTFB **không xấu đi**; mục tiêu của v8-B là cảm giác, không phải tốc độ
thô.

**Kiểm bằng mắt** ở 390px và 1440px: chuyển qua lại giữa Tổng quan → Đơn →
Khách hàng → Kho, xác nhận sidebar/tabbar/header **không** nháy và tiêu đề
đổi ngay khi bấm.

## 8. Rủi ro

| Rủi ro | Cách chặn |
| --- | --- |
| Khoá cửa đăng nhập lần nữa | Middleware giữ nguyên làm cửa chính; nghiệm thu `curl -i /` phải trả 307, bắt buộc |
| Thêm màn mới quên khai báo tiêu đề | Test khoá "mọi href trong nav-config đều có mục trong screen-meta" |
| `requireAdmin` hết đường redirect | Giữ `RedirectRescue`; nghiệm thu bằng tài khoản `nhan_vien` mở `/admin/users` |
| Màn hình trắng khi layout treo | Layout chỉ chạy `getSession()` (~20ms); mọi việc nặng nằm dưới boundary |
| Di chuyển 13 trang vào `(app)/` làm hỏng đường dẫn | Route group `(app)` **không** xuất hiện trong URL — đây là điều kiện phải kiểm ngay ở task đầu, trước khi chuyển hết |
