# HeyP — hệ thống quản lý đơn order hộ

Ứng dụng nội bộ (2 người dùng) quản lý dịch vụ **order hộ hàng Trung Quốc** cho shop HeyP (bán giày/dép/thời trang): chốt đơn → mua hộ → gom kho → vận chuyển về VN → giao khách → thu tiền. Kèm bán hàng tồn kho và đọc ảnh chốt đơn Zalo bằng AI.

**Trạng thái:** MVP xong (Phase 0–7). **v2 xong** — giao diện "Boutique atelier" (navy + giấy ấm + camel + serif), sidebar (desktop) / bottom tab+FAB+sheet (mobile), màn Tổng quan. Spec: `docs/2026-08-11-heyp-v2-ui-redesign-design.md`. **v3 xong** (A + B) — bóc lớp giá theo món (¥/giá vốn/lời tách riêng từng dòng sản phẩm), luồng nhập đơn 3 mảnh (ảnh chốt đơn + thông tin khách + ảnh sản phẩm), ví ¥, sổ chi phí, sổ thu tiền, 3 báo cáo tài chính. Spec: `docs/2026-08-11-heyp-v3a-gia-va-nhap-don-design.md`, `docs/2026-08-11-heyp-v3b-tai-chinh-design.md`. **Đã chuyển hosting sang Vercel + Supabase** (14/08) — xem mục Hosting bên dưới. **v4 xong** — trục trạng thái rút còn 4 bước theo từng loại đơn, tự động hoàn tất khi đã giao và thu đủ tiền, form tạo đơn rút còn 3 ô bắt buộc. DB Supabase đã ở Singapore (`ap-southeast-1`), khớp region `sin1` đã ghim cho Vercel — xác nhận lại qua dashboard Supabase ngày 31/08 (mục Hosting bên dưới trước đây ghi nhầm là còn ở Sydney). Spec: `docs/superpowers/specs/2026-08-20-heyp-toc-do-va-luong-don-design.md`. **v5 xong** — giao diện viết lại mobile-first cho iPhone: PWA cài ra màn hình chính, tabbar 5 ô, màn tạo đơn kiểu POS (Sheet cho từng thao tác phụ), chi tiết đơn chia 4 tab, sao lưu thủ công thay backup tự động, nhập kho chủ động. Bỏ chất "Boutique atelier" (giữ navy, bỏ nền giấy ấm/serif). Spec: `docs/superpowers/specs/2026-08-31-heyp-ui-mobile-first-design.md`, kế hoạch: `docs/superpowers/plans/2026-08-31-heyp-ui-mobile-first.md`. Logo: chưa có `public/logo.png` → đang dùng wordmark fallback + icon PWA chữ trên nền navy (`src/lib/logo.ts`, `scripts/make-pwa-icons.ts` tự chuyển sang ảnh khi có file, không cần sửa code). **v6 xong** — tài khoản trong DB (bảng `users`, hash scrypt, hai vai trò `admin`/`nhan_vien`), xoá đơn/khách có kiểm soát kèm nhật ký xoá, nhập đơn theo giá phải thu (¥ suy ngược) + ảnh gắn theo từng món, chọn nhiều đơn chuyển bước hàng loạt, thêm/xoá món trong đơn đã tạo. Spec: `docs/superpowers/specs/2026-08-31-heyp-v6-tai-khoan-quyen-va-nhap-don-design.md`, kế hoạch: `docs/superpowers/plans/2026-08-31-heyp-v6-tai-khoan-quyen-va-nhap-don.md`.

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**. `package.json` có `"type": "module"`.
- **Postgres (Supabase)** qua **Drizzle ORM** (driver `postgres-js`). CSS **thuần**, viết **mobile-first** — token/base/layout/components/screens tách trong `src/styles/`, `globals.css` chỉ còn `@import`; `legacy.css` là phần CSS gốc (v2) cho các phần tử chi tiết chưa thuộc phạm vi viết lại (badge, timeline, hành trình đơn, bảng, gallery), không phải code chờ xoá. Không framework UI.
- **Node 26** (local dev/script). Runtime production là Node trên Vercel (không dùng Edge cho các route đụng DB/Storage). Test bằng `node:test` built-in (không có thư viện test).

## Hosting (Vercel + Supabase)

- **DB:** Postgres trên Supabase, kết nối qua Supavisor. `DATABASE_URL` = **Transaction pooler** (port 6543, dùng cho runtime app). `DIRECT_URL` = **Session pooler** (port 5432, dùng cho migration/`pg_dump`). **KHÔNG** dùng "Direct connection" thật (host `db.xxx.supabase.co`) — free tier chỉ chạy IPv6, còn Vercel/GitHub Actions chỉ có IPv4.
- **Region:** DB Supabase đã ở Singapore (`ap-southeast-1`, xác nhận qua dashboard Supabase ngày 31/08 — Project Settings → General và Infrastructure đều ghi "Southeast Asia (Singapore), ap-southeast-1"). `vercel.json` ghim `regions: ["sin1"]` (Singapore) cho deployment Vercel — cùng vùng AWS với DB, không còn lệch region.
- **Ảnh:** Supabase Storage, bucket `photos` (private). App luôn đi qua route đã xác thực (`/api/photo/[id]`, `src/lib/storage.ts`), không dùng signed URL public.
- **Job nền:** không còn tiến trình `setInterval` trong app (Vercel serverless không giữ tiến trình sống). Thay bằng GitHub Actions (`.github/workflows/tracking-sweep.yml`, mỗi 4h) gọi `POST /api/cron/track` — route này vẫn nhận cả session đăng nhập lẫn `?secret=`/header `x-cron-secret` khớp `CRON_SECRET`. Cùng lịch này giữ cho Supabase free tier khỏi tự pause sau 7 ngày im lặng.
- **Backup:** Supabase free không có backup tự động/PITR (workflow `pg_dump` hằng ngày đã **bỏ** ở v5). Sao lưu **thủ công** qua `GET /api/backup` (có xác thực, xuất toàn bộ 14 bảng ra JSON, tải được thẳng từ iPhone), nút "Tải bản sao lưu" ở màn `/backup`. Mốc lần tải gần nhất lưu ở `settings.last_backup_at`, Tổng quan cảnh báo nếu quá 14 ngày. Khôi phục: `node --experimental-strip-types scripts/restore-from-json.ts file.json --toi-chac-chan` (ghi đè toàn bộ dữ liệu). Ảnh **không** nằm trong bản sao lưu — tải riêng từ Supabase Storage dashboard.
- **Vercel Hobby là gói non-commercial theo ToS** — HeyP vận hành business thật, đây là rủi ro đã biết (cân nhắc Pro nếu cần chắc chân).

## Lệnh hay dùng

```bash
npm run dev            # chạy dev (port 3000)
npm test               # unit test (node --test 'tests/**/*.test.ts')
npx tsc --noEmit       # typecheck
npm run db:migrate     # drizzle-kit migrate — áp migration trong drizzle/, cần DIRECT_URL
npm run db:generate    # drizzle-kit generate — sinh migration mới từ src/db/schema.ts
```

Chạy dev **không** dùng lệnh shell trực tiếp — dùng công cụ preview của harness (xem `.claude/launch.json`).

## LƯU Ý QUAN TRỌNG (gotchas — đọc trước khi sửa)

- **Đăng nhập đi qua bảng `users`, KHÔNG qua `.env`** (v6) — `APP_ACCOUNTS`
  chỉ là hạt giống cho `ensureUsersSeeded()` lúc bảng còn rỗng. `getSession()`
  đọc DB mỗi request (bọc `cache()` nên 1 truy vấn mỗi lần render) để cờ
  `active` có hiệu lực ngay; trước v6 cookie không đọc DB lần nào nên khoá tài
  khoản chẳng có tác dụng gì suốt 30 ngày. Quên mật khẩu admin duy nhất thì
  phải sửa `password_hash` thẳng trong Supabase.
- **Xoá đơn chỉ dành cho đơn CHƯA có dấu vết** (`src/lib/deletion.ts`) — đã
  trừ ví ¥, đã có phiếu thu, đã có chi phí, hoặc đã cộng tồn kho
  (`ve_kho_vn`/`hoan_tat`/`khach_bom`) thì chặn. KHÔNG dùng xoá mềm: thêm
  điều kiện lọc vào hàng chục câu SQL đang có, sót một chỗ là báo cáo sai âm
  thầm. Mọi lần xoá ghi vào `deletion_log` trong cùng transaction.
- **Kiểm điều kiện xoá phải nằm TRONG transaction, sau `SELECT … FOR UPDATE`**
  (`src/db/deletion.ts`) — kiểm ngoài transaction có kẽ hở: giữa lúc kiểm và
  lúc xoá, người kia có thể vừa thu tiền cho đúng đơn đó, và `payments` gắn
  khoá ngoại ON DELETE CASCADE nên phiếu thu vừa tạo bị xoá theo mà không ai
  hay. Khoá dòng `orders` chặn được vì `addPayment` cũng ghi vào dòng đó
  (`syncOrderDeposit` → `UPDATE orders SET deposit`). Đã kiểm chứng bằng hai
  transaction chạy song song.
- **`quoted_total_vnd` bất biến với thao tác GIÁ, không bất biến với PHẠM VI**
  (v6) — sửa ¥ hay kéo lời thì Total giữ nguyên (luật v3-A, test khoá); thêm
  hoặc xoá món thì Total đổi theo (`totalAfterAddLine`/`totalAfterRemoveLine`)
  và lời các dòng cũ KHÔNG bị rải lại.
- **Nhập đơn theo GIÁ PHẢI THU** (v6) — form gửi lời từng dòng đã tính sẵn,
  `createOrder` đi nhánh `hasMargins` và không tự rải. Chỉ khi ghi đè Total
  thì client mới gọi `allocateMargins` rồi gửi lời đã rải. `¥` là số máy suy
  ngược (`cnyFromSellPrice`) nên luôn mang `cost_confirmed = false`.
- **Ảnh lưu HAI file mỗi ảnh** (v6) — bản chính + bản nhỏ `_t` (`thumbFileName`),
  cả hai WebP. Đo trên ảnh thật: lưu trữ giảm 48%, băng thông màn danh sách
  giảm 93%. Mọi chỗ hiển thị ≤140px PHẢI dùng `photoUrl(id, "thumb")`; dùng
  bản chính là tải nặng gấp ~10 lần. Ảnh chốt đơn (`zalo_confirm`) giữ cạnh
  1600 vì là ảnh chụp CHỮ làm bằng chứng — xem `src/lib/image.ts`.
- **`prepareForAi` và `prepareForStorage` là hai đường KHÁC NHAU, đừng gộp** —
  gửi Gemini cần độ nét để đọc chữ (JPEG 1600), bản lưu cần nhẹ (WebP 1280).
  Nén ảnh gửi AI không tiết kiệm gì (không lưu lại) mà làm giảm độ chính xác OCR.
- **`ItemPhotos` (`src/app/_components/item-photos.tsx`) dùng chung cho cả màn
  tạo đơn lẫn màn thêm món vào đơn đã tạo.** Đóng sheet mà không lưu thì phải
  xoá ảnh đã tải lên, nếu không chúng thành mồ côi. Ảnh đã gắn đơn thì an toàn:
  `deletePhoto` chỉ xoá dòng có `order_id IS NULL`.
- **Gắn ảnh vào đơn phải nằm TRONG transaction của `createOrder`**
  (`NewOrderInput.orderPhotoIds`, `NewOrderItemInput.photoIds`) — gắn sau khi
  tạo đơn thì lỗi tạm của DB làm mất liên kết mà không ai biết. Đã xảy ra thật
  với đơn #1 ngày 01/09: ảnh upload lúc 12:13:17, đơn tạo 12:14:01, `order_id`
  vẫn NULL vì pool đang kẹt và lỗi bị `catch {}` nuốt.
- **Màn nhập nhanh gửi TẤT CẢ ảnh đã thả** (`zaloPhotoIds`), không chỉ ảnh chốt
  đơn — trước v6 chỉ gắn một ảnh, số còn lại thành mồ côi. Từ khi có job dọn
  ảnh mồ côi thì bỏ sót = MẤT DỮ LIỆU chứ không chỉ là rác.
- **Job dọn ảnh mồ côi** chạy nhờ cron 4h (`/api/cron/track`): xoá ảnh
  `order_id`/`order_item_id`/`inventory_id` đều NULL và cũ hơn 24h. Ân hạn 24h
  là để không cướp ảnh của form đang mở. Xoá file trên Storage TRƯỚC, xoá dòng
  DB SAU — ngược lại là mất dấu file, nó nằm trên Storage vĩnh viễn.
- **Đọc số người dùng gõ PHẢI qua `src/lib/parse-number.ts`** — `parseVnd` cho
  tiền VND (dấu chấm = NGĂN NGHÌN, bỏ đi), `parseDecimal` cho ¥ và tỷ giá (dấu
  chấm = THẬP PHÂN, giữ lại). Đừng viết `num()` riêng cho từng màn: trước đây
  có 8 hàm như vậy, mâu thuẫn nhau, và đẻ ra hai bug tiền THẬT —
  (a) ô Cọc/Phí ship định dạng "500.000" gửi lên server chỉ bỏ dấu phẩy,
  `Number("500.000")` = **500**, không lỗi gì, cọc vào DB sai 1000 lần;
  (b) dùng parser kiểu VND cho ¥ biến "207.5" thành 2075, sai giá vốn ~10 lần.
  Bất biến `parseVnd(groupVnd(x)) === x` được test khoá.
- **SQL thô đi qua lớp `Exec`** (`src/db/raw.ts`: `raw.all/get/run`, `withTx`) — SQL viết placeholder kiểu SQLite (`?`), lớp này tự đổi sang `$1,$2` của Postgres. Trong transaction (`withTx`) **PHẢI** dùng `x` được truyền vào, KHÔNG dùng `raw` toàn cục — dùng nhầm thì câu đó chạy ngoài transaction, không rollback theo.
- **Alias camelCase trong SQL thô phải bọc nháy kép** (`AS "orderType"`, không phải `AS orderType`) — Postgres hạ chữ thường alias không nháy kép, code JS đọc `undefined`. Bug loại này không lỗi cú pháp, chỉ âm thầm trả sai dữ liệu.
- **`SUM()`/`COUNT()` trên cột `integer` phải ép `::int`** — nếu không, kiểu trả về của Postgres qua postgres-js là `bigint`→string, JS `+` sẽ nối chuỗi thay vì cộng số. Cột `double precision` (giá ¥, tỷ giá) không cần ép.
- **Runtime bắt buộc đi qua Supavisor pooler với `prepare: false`** (`src/db/index.ts`) — pooler transaction mode không hỗ trợ prepared statement.
- **`max` của pool KHÔNG để 1** — từng để `max: 1` (đúng lý thuyết "1 request/instance" của serverless) nhưng gây treo request 150s+ ngay ở `next dev` vì nhiều request nội bộ của Next.js xếp hàng chờ đúng 1 connection. App có 2 người dùng thật, request đồng thời là bình thường. Đang để `max: 5`.
- **Guardrail chống connection mồ côi nằm ở mức ROLE, KHÔNG ở connection option** (`drizzle/0004_db_guardrails.sql` + `drizzle/0005_transaction_timeout.sql`) — đây là gốc rễ của hiện tượng "lúc được lúc không" (sự cố 31/08, tái phát 01/09 ngay sau khi lên v6, rồi tái phát LẦN NỮA 01/09 vì 0004 còn để lọt một trạng thái).
  - **Option `connection: { statement_timeout }` trong `src/db/index.ts` KHÔNG có tác dụng trên production.** Đo thực tế 01/09: kết nối qua Supavisor transaction pooler (6543 — đúng cổng production) với option đó, `SHOW statement_timeout` vẫn trả **2min**. Pooler chế độ transaction không truyền tham số khởi tạo của client xuống server connection. Ghi chú cũ ở đây từng khẳng định option này đã khắc phục sự cố 31/08 — **sai**, nó chưa bao giờ chạy trên production.
  - **Cơ chế thật:** mặc định Supabase để `idle_in_transaction_session_timeout = 0` (TẮT). Vercel đóng băng/giết function giữa một `withTx` → server connection nằm lại ở `idle in transaction` **vĩnh viễn**, giữ luôn slot pool. Tích luỹ đủ nhiều thì pool cạn, request sau xếp hàng rồi treo. Đã tái hiện và kiểm chứng bằng thí nghiệm. `statement_timeout` một mình KHÔNG đủ vì nó chỉ tính thời gian thực thi, không tính lúc chờ client.
  - **Cách chữa:** `ALTER ROLE postgres SET statement_timeout = '15s'` + `idle_in_transaction_session_timeout = '30s'`. Đặt ở mức role thì server áp lúc chính nó mở phiên nên pooler không bỏ qua được. Đã kiểm chứng: qua 6543 giờ trả đúng `15s`/`30s`, transaction bỏ rơi tự bị dọn sau 30s.
  - **CẦN CẢ BA TIMEOUT — hai cái của 0004 bắt trượt trạng thái `active` + `ClientRead`.** Đo trên production 01/09 sau khi 0004 đã chạy đúng: 6 phiên giữ transaction mở tới **525 giây** mà không guardrail nào đụng tới, vì chúng ở `state='active'`, `wait_event='ClientRead'`, `xact_start` cách đó 400–525s. `statement_timeout` không đếm (backend không thực thi, nó đang chờ client gửi message); `idle_in_transaction_session_timeout` không đếm (chỉ áp cho state `idle in transaction`, còn Postgres báo các phiên này là `active`). Nguyên nhân: trong extended query protocol, Vercel đóng băng function ở quãng giữa Execute và Sync → backend nằm chờ Sync vĩnh viễn với transaction đang mở, Supavisor vẫn giữ socket nên server không biết client đã chết. Query kẹt nhiều nhất là `SELECT ... FROM users WHERE id = $1` — chính là `getSession()`, chạy ở MỌI request, nên pool cạn là cả app đơ. Thuốc đúng là **`transaction_timeout`** (có từ Postgres 17; DB đang chạy 17.6) vì nó chặn theo TỔNG thời gian transaction bất kể state — đặt `'60s'` ở `0005`, dài hơn hai timeout kia nên không cướp việc của chúng. Đã kiểm chứng: phiên mới qua 6543 trả `transaction_timeout=1min`.
  - **Cách nhận ra sự cố này** (khác hẳn triệu chứng lock): `SELECT state, wait_event, now()-xact_start FROM pg_stat_activity WHERE datname=current_database()`. Kẹt kiểu này thì `pg_locks` KHÔNG có dòng nào `not granted` và `pg_blocking_pids()` rỗng — không ai block ai, chỉ là slot bị giữ không trả.
  - **Lưu ý khi vận hành:** thiết lập mức role chỉ áp cho phiên MỚI. Sau khi đổi, connection cũ mà Supavisor đang giữ vẫn mang giá trị cũ — phải `pg_terminate_backend` chúng thì mới ăn ngay. Và vì role `postgres` giờ có `statement_timeout` 15s + `transaction_timeout` 60s, migration nào chạy lâu hơn ngưỡng đó phải tự mở đầu bằng `SET statement_timeout = 0;` và `SET transaction_timeout = 0;`. (Đã kiểm: `scripts/restore-from-json.ts` INSERT từng dòng ngoài transaction và `GET /api/backup` không mở transaction, nên 60s không cắt nhầm cái nào.)
- **Thời gian lưu epoch-seconds `bigint`** (không phải `timestamptz`) — quyết định có chủ đích để tầng báo cáo tiền (so sánh epoch số nguyên) không phải viết lại. `src/db/schema.ts` có `customType` `epochSeconds` chuyển đổi qua lại với `Date` cho app code; SQL thô dùng `EXTRACT(EPOCH FROM now())::bigint` (hằng số `NOW_EPOCH_SQL` trong `raw.ts`) thay `unixepoch()` của SQLite cũ.
- **Boolean là `boolean` thật** (SQLite cũ giả lập bằng 0/1) — so sánh trong SQL thô dùng `= true`/`= false`, JS so `=== true`.
- **`src/db/schema.ts` dùng alias `@/`** → chỉ Next/tsc nạp được. Script chạy bằng `node` KHÔNG import được schema → viết SQL thô hoặc import trực tiếp `drizzle-orm/pg-core` (xem `scripts/migrate-to-postgres.ts`).
- **Test import module bằng đuôi `.ts` tường minh** (vd `../src/lib/money.ts`); `tsconfig` đã bật `allowImportingTsExtensions`. Module thuần dùng cho test không được import file khác có alias `@/`.
- **Điều hướng (v5):** mọi trang có đăng nhập bọc bằng `<AppShell username title backHref? action? bottomBar?>` (`src/app/_components/app-shell.tsx`). `title` bắt buộc — tsc tự bắt trang nào quên. `backHref` là URL tường minh, không dựa vào `history.back()` (chế độ standalone/PWA có thể mở thẳng URL sâu, không có gì để lùi). Có `bottomBar` thì tabbar tự ẩn — một màn không bao giờ có cả hai. Ô `[+]` giữa tabbar **luôn luôn** là "tạo đơn" (`/orders/new`), không đổi nghĩa theo màn đang mở; nút hành động khác (nhập kho, nhập nhanh từ ảnh) là nút riêng ở header, class `.header-action-float`. Sidebar/bottom-tab đọc mục điều hướng từ `nav-config.ts` — thêm màn mới thì sửa 1 chỗ đó, không sửa từng component. Từ 900px trở lên: sidebar quay lại, tabbar ẩn (luật trong `@media (min-width: 900px)` ở `src/styles/layout.css`).
- **Phản hồi khi tải đi qua BA lớp, mỗi lớp bắt một cảnh khác nhau** (v6) —
  `app/loading.tsx` (Suspense ở gốc) cho lúc chuyển màn, `app/error.tsx` cho
  lúc server ném lỗi, `useFormStatus` cho nút Đăng nhập. Trước đó app không có
  file nào trong số này: bấm mà server render lâu thì màn hình cũ đứng nguyên,
  không dấu hiệu gì — đó chính là cái người dùng gọi là "đơ".
  - **Watchdog KHÔNG chạy ở lần mở app đầu tiên** — React không hydrate nội
    dung fallback của Suspense (nó đợi boundary giải quyết xong), nên
    `useEffect` trong `LoadingScreen` câm khi tải thẳng URL hoặc chạm icon PWA.
    Đã kiểm chứng: trang chậm 60s, tới giây thứ 11 vẫn chỉ có spinner. Vì vậy
    mới có khối `.recovery-static` hiện bằng `animation-delay` của CSS — CSS
    chạy trong lúc trang đang stream, không cần JS. Đừng xoá nó vì "React lo
    rồi": React chỉ lo được đường chuyển màn trong app.
  - **Độ trễ 8s nằm ở HAI chỗ phải sửa cùng nhau**: `SLOW_AFTER_MS` trong
    `src/lib/ui-timeouts.ts` và `animation-delay` của `.recovery-static` trong
    `components.css`. CSS không đọc được hằng số TS.
  - **`/api/health` cố ý KHÔNG yêu cầu đăng nhập** — nếu bắt buộc có phiên thì
    đúng lúc phiên hết hạn (lúc cần nó nhất) nó lại không nói được gì. Nó chỉ
    tiết lộ "cookie còn hợp lệ không" + "DB có sống không", không có dữ liệu
    nghiệp vụ.
  - **Chẩn đoán dùng `hasValidSessionCookie()` chứ KHÔNG dùng `getSession()`**
    — `getSession()` đọc bảng `users`, nên DB chết cũng trả `null` y hệt hết
    phiên. Dùng nó để chẩn đoán thì lúc DB sập sẽ báo nhầm "hết phiên" và
    người dùng đăng nhập lại trong vô vọng.
- **Mọi ô nhập PHẢI `font-size: var(--fs-3)` (16px)** — dưới ngưỡng này Safari iOS tự phóng to trang khi chạm vào ô. Luật cứng, áp cho MỌI `input`/`select`/`textarea` kể cả trong `legacy.css`. Đã có lần luật mới (`components.css`) và luật cũ (`legacy.css`, `.field input` v.v.) cùng độ đặc hiệu CSS, luật cũ (import sau) thắng — kiểm bằng `[...document.querySelectorAll("input,select,textarea")].map(el=>getComputedStyle(el).fontSize)` mỗi khi thêm form mới, đừng tin bằng mắt.
- **Mọi thanh dính đáy/dính đỉnh phải cộng `env(safe-area-inset-*)`** (biến `--sat`/`--sab` trong `tokens.css`) — thiếu dòng này thì tabbar/StickyBar nằm dưới thanh home indicator của iPhone. `viewport-fit=cover` (`src/app/layout.tsx`, `export const viewport`) là điều kiện để các biến này có giá trị thật; thiếu nó thì mọi safe-area luôn ra 0px kể cả trên máy thật.
- **`Sheet` (`src/app/_components/sheet.tsx`) chỉ render `<button>` khi có `onClick`** — không `href` và không `onClick` thì `ListRow` (không phải Sheet, class tương tự) trả về `<div>` tĩnh. Đụng tới khi `trailing` chứa một `<form><button>` riêng (vd nút Xoá) — HTML không cho `<button>` lồng `<button>`, lồng vào là vỡ hydration ngay (đã xảy ra thật ở `PaymentsBlock`).
- **`.env` gitignored** (chứa `GEMINI_API_KEY`, `SESSION_SECRET`, `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`...). Mọi cấu hình đọc từ env qua `src/lib/config.ts`. Mẫu ở `.env.example`.
- **`data/app.sqlite` là bản lùi lịch sử** (KHÔNG phải nguồn dữ liệu chính) —
  giữ lại phòng khi cần đối chiếu, đừng xoá. Dữ liệu chạy thử trên Supabase đã
  được xoá sạch ngày 20/08 (bản sao lưu ở `backups/pre-clear-2026-08-20T16-56-09/`),
  chỉ giữ lại 2 dòng `settings`.
- **Tái dùng mã trạng thái là có chủ đích** — `da_mua_tq` giờ mang nghĩa "Đã
  mua, đang về" (gộp 4 khâu vận chuyển cũ) và `ve_kho_vn` là điểm kết của đơn
  `nhap_kho`. Giữ đúng hai mã này vì ba side-effect tiền/kho neo vào chúng
  (`queries.ts`: trừ ví ¥ ở `da_mua_tq`, cộng tồn ở `ve_kho_vn`, nhập hàng bom
  ở `khach_bom`). Đổi tên mã = phải viết lại side-effect.
- **Tự động hoàn tất PHẢI đi qua `changeOrderStatus`** (`autoCompleteIfPaid`
  trong `src/db/queries.ts`), không `UPDATE orders SET status` thẳng — báo cáo
  lãi đọc ngày hoàn tất từ `order_status_history`. Và phải gọi **ngoài**
  `withTx` vì `changeOrderStatus` tự mở transaction riêng.
- **Tiền v3-A:** `orders.service_fee` đã đổi tên thành `margin_vnd` và mang nghĩa **tổng lời** (= Σ `order_items.margin_vnd`). `quoted_total_vnd` là Total đã chốt với khách, **bất biến** và **không gồm ship**. Sửa ¥ thì lời được rải lại, Total giữ nguyên — luật này khoá bởi `tests/line-pricing.test.ts`.
- **Tham số nghiệp vụ v3-A** (tỷ giá bán, lời mặc định) nằm ở bảng `settings`, không phải `.env` — đổi được lúc chạy, không cần khởi động lại app.
- **Ví ¥ (v3-B):** số dư và giá vốn bq **không lưu trong DB** — chạy lại `cny_ledger` bằng `src/lib/cny-wallet.ts`. Đừng thêm cột `balance`. Dòng `chi` giữ `rate_snapshot` đã chốt cứng lúc mua; sửa giá ¥ sau khi mua thì **ghi dòng `dieu_chinh`**, không sửa dòng cũ.
- **Trừ ví ¥ đi qua `shouldDeductCny`** (`src/lib/cny-wallet.ts`, v5) — một nguồn chân lý cho cả hai đường: đơn `order_ho` chuyển bước tới `da_mua_tq` (trong `changeOrderStatus`) VÀ đơn `nhap_kho` tạo thẳng ở `da_mua_tq` (trong `createOrder`, không đi qua `changeOrderStatus`). Trước v5 chỉ đường đầu trừ ví, nên nhập kho tiêu ¥ thật mà ví không bị trừ — và đường đầu không kiểm trùng, nên "sự cố rồi quay lại" trừ hai lần. Đừng viết điều kiện trừ ví tay ở chỗ thứ ba, gọi hàm này.
- **Nhập kho chủ động** (`/inventory`, nút `+`, v5) tạo một đơn `nhap_kho` không khách rồi tự đẩy qua `changeOrderStatus` tới `ve_kho_vn` — không có hàm cộng tồn riêng. Side-effect (cộng tồn nguồn `active`, bình quân gia quyền, trừ ví ¥) chạy bằng đúng code đường đơn nhập kho thường.
- **`orders.deposit` là số dẫn xuất** (v3-B) = Σ `payments`. Mọi thay đổi thu tiền phải đi qua `syncOrderDeposit` trong `src/db/queries.ts`, đừng UPDATE thẳng cột này.
- **Báo cáo lãi tính theo ngày HOÀN TẤT** (v3-B), đọc từ `order_status_history` chứ không từ `orders.status_changed_at` (cột đó chỉ giữ lần đổi gần nhất).

## Nghiệp vụ cốt lõi (đừng phá)

- **Tiền** (`src/lib/money.ts`): `tiền hàng(tệ)×tỷ giá + phí dịch vụ + phí ship − cọc = còn phải thu`. Đơn `ban_tu_kho` lưu giá bán vào `goods_total_cny` với `exchange_rate=1` (VND thẳng) + cột `sale_cost` để tính lãi/lỗ. Đơn tạo từ ảnh Zalo cũng dùng `exchange_rate=1`.
- **Trạng thái** (`src/lib/order-status.ts`): **mỗi loại đơn một trục riêng** (v4).
  `order_ho`: Khách chốt → Đã mua, đang về → Đã giao khách → Hoàn tất.
  `nhap_kho`: Đã mua, đang về → Về kho. `ban_tu_kho`: Đã giao khách → Hoàn tất.
  Tiến đúng 1 bước trên trục; nhánh `huy` (chỉ từ Khách chốt) / `su_co` / `khach_bom`.
  **Bốn mã đã về hưu** (`cho_bao_gia`, `da_bao_gia`, `ve_kho_tq`,
  `dang_van_chuyen_vn`) vẫn nằm trong `ORDER_STATUSES` để đọc được
  `order_status_history` cũ — đừng xoá, UI hành trình sẽ vỡ.
  `changeOrderStatus` có side-effect tồn kho và ví ¥ (xem mục gotchas).
- **Tồn kho** (`src/lib/inventory.ts`): giá vốn bình quân gia quyền; 3 luồng ngoại lệ (lỗi NCC, đổi/trả, khách bom).
- **AI đọc ảnh Zalo** (Phase 5): **Google Gemini** (không phải Anthropic). REST `generativelanguage.googleapis.com`, model `gemini-flash-latest`, header `x-goog-api-key`, dùng `responseSchema` ép JSON. Prompt/schema ở `src/lib/zalo-extract.ts`, gọi ở `src/lib/gemini.ts`. Chuẩn đầu ra bám mẫu chốt đơn HeyP: `docs/reference-heyp-chot-don-template.md`.
- **Tracking** (Phase 6): khung adapter ở `src/lib/tracking.ts` (`CARRIER_ADAPTERS` rỗng — chưa có đơn vị vận chuyển). Job nền 4h gắn cờ "tra tay" khi không có adapter.

Test bắt buộc phải xanh cho **công thức tiền** và **luật trạng thái/tồn kho** — sai là mất tiền thật.

## Quy ước

- **UI tiếng Việt.** Đơn vị tiền VND (₫), tệ (¥).
- **Commit:** tin nhắn tiếng Việt, kết thúc bằng `Co-Authored-By: Claude ...`. **Push sau mỗi phase.**
- **Verify** thay đổi qua preview trình duyệt (chụp màn hình) + `npm test` + `tsc` trước khi commit.
- Cấu hình đổi giữa các môi trường chỉ bằng đổi `.env` (không hard-code đường dẫn/khoá).

## Tài liệu

- Thiết kế gốc MVP: `docs/2026-08-10-heyp-system-design.md`
- Kế hoạch MVP: `docs/2026-08-10-heyp-system-implementation-plan.md`
- Nghiệm thu MVP: `docs/2026-08-10-heyp-system-acceptance-checklist.md`
- Mẫu chốt đơn Zalo thật: `docs/reference-heyp-chot-don-template.md`
- Thiết kế v2: `docs/2026-08-11-heyp-v2-ui-redesign-design.md`
- Thiết kế v3-A (giá & nhập đơn): `docs/2026-08-11-heyp-v3a-gia-va-nhap-don-design.md`, kế hoạch: `docs/2026-08-11-heyp-v3a-implementation-plan.md`
- Thiết kế v3-B (tài chính): `docs/2026-08-11-heyp-v3b-tai-chinh-design.md`, kế hoạch: `docs/2026-08-11-heyp-v3b-implementation-plan.md`
- Kế hoạch chuyển hosting Vercel + Supabase: `docs/superpowers/plans/2026-08-14-migrate-vercel-supabase.md`
- Hướng dẫn vận hành Vercel + Supabase (backup, unpause, ngưỡng free tier): `docs/2026-08-14-huong-dan-van-hanh-vercel-supabase.md`
- Thiết kế v4 (tốc độ & luồng đơn): `docs/superpowers/specs/2026-08-20-heyp-toc-do-va-luong-don-design.md`
- Kế hoạch v4: `docs/superpowers/plans/2026-08-21-heyp-toc-do-va-luong-don.md`
- Thiết kế v5 (giao diện mobile-first): `docs/superpowers/specs/2026-08-31-heyp-ui-mobile-first-design.md`, kế hoạch: `docs/superpowers/plans/2026-08-31-heyp-ui-mobile-first.md`
- Thiết kế v6 (tài khoản, quyền, xoá, nhập đơn): `docs/superpowers/specs/2026-08-31-heyp-v6-tai-khoan-quyen-va-nhap-don-design.md`, kế hoạch: `docs/superpowers/plans/2026-08-31-heyp-v6-tai-khoan-quyen-va-nhap-don.md`
- Thiết kế v7 (điều chỉnh đơn hàng): `docs/superpowers/specs/2026-09-01-heyp-v7-dieu-chinh-don-hang-design.md`
