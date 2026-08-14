# HeyP — hệ thống quản lý đơn order hộ

Ứng dụng nội bộ (2 người dùng) quản lý dịch vụ **order hộ hàng Trung Quốc** cho shop HeyP (bán giày/dép/thời trang): báo giá → chốt đơn → mua hộ → gom kho → vận chuyển về VN → giao khách → thu tiền. Kèm bán hàng tồn kho và đọc ảnh chốt đơn Zalo bằng AI.

**Trạng thái:** MVP xong (Phase 0–7). **v2 xong** — giao diện "Boutique atelier" (navy + giấy ấm + camel + serif), sidebar (desktop) / bottom tab+FAB+sheet (mobile), màn Tổng quan. Spec: `docs/2026-08-11-heyp-v2-ui-redesign-design.md`. **v3 xong** (A + B) — bóc lớp giá theo món (¥/giá vốn/lời tách riêng từng dòng sản phẩm), luồng nhập đơn 3 mảnh (ảnh chốt đơn + thông tin khách + ảnh sản phẩm), ví ¥, sổ chi phí, sổ thu tiền, 3 báo cáo tài chính. Spec: `docs/2026-08-11-heyp-v3a-gia-va-nhap-don-design.md`, `docs/2026-08-11-heyp-v3b-tai-chinh-design.md`. **Đã chuyển hosting sang Vercel + Supabase** (14/08) — xem mục Hosting bên dưới. Logo: chưa có `public/logo.png` → đang dùng wordmark serif fallback (`src/lib/logo.ts` tự chuyển sang ảnh khi có file, không cần sửa code).

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**. `package.json` có `"type": "module"`.
- **Postgres (Supabase)** qua **Drizzle ORM** (driver `postgres-js`). CSS **thuần** (`src/app/globals.css`), không framework UI.
- **Node 26** (local dev/script). Runtime production là Node trên Vercel (không dùng Edge cho các route đụng DB/Storage). Test bằng `node:test` built-in (không có thư viện test).

## Hosting (Vercel + Supabase)

- **DB:** Postgres trên Supabase, kết nối qua Supavisor. `DATABASE_URL` = **Transaction pooler** (port 6543, dùng cho runtime app). `DIRECT_URL` = **Session pooler** (port 5432, dùng cho migration/`pg_dump`). **KHÔNG** dùng "Direct connection" thật (host `db.xxx.supabase.co`) — free tier chỉ chạy IPv6, còn Vercel/GitHub Actions chỉ có IPv4.
- **Ảnh:** Supabase Storage, bucket `photos` (private). App luôn đi qua route đã xác thực (`/api/photo/[id]`, `src/lib/storage.ts`), không dùng signed URL public.
- **Job nền:** không còn tiến trình `setInterval` trong app (Vercel serverless không giữ tiến trình sống). Thay bằng GitHub Actions (`.github/workflows/tracking-sweep.yml`, mỗi 4h) gọi `POST /api/cron/track` — route này vẫn nhận cả session đăng nhập lẫn `?secret=`/header `x-cron-secret` khớp `CRON_SECRET`. Cùng lịch này giữ cho Supabase free tier khỏi tự pause sau 7 ngày im lặng.
- **Backup:** Supabase free không có backup tự động/PITR. `.github/workflows/db-backup.yml` chạy `pg_dump` hằng ngày, lưu 30 ngày trong GitHub Actions Artifacts. Khôi phục: `psql "$DIRECT_URL" -f file.sql`.
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

- **SQL thô đi qua lớp `Exec`** (`src/db/raw.ts`: `raw.all/get/run`, `withTx`) — SQL viết placeholder kiểu SQLite (`?`), lớp này tự đổi sang `$1,$2` của Postgres. Trong transaction (`withTx`) **PHẢI** dùng `x` được truyền vào, KHÔNG dùng `raw` toàn cục — dùng nhầm thì câu đó chạy ngoài transaction, không rollback theo.
- **Alias camelCase trong SQL thô phải bọc nháy kép** (`AS "orderType"`, không phải `AS orderType`) — Postgres hạ chữ thường alias không nháy kép, code JS đọc `undefined`. Bug loại này không lỗi cú pháp, chỉ âm thầm trả sai dữ liệu.
- **`SUM()`/`COUNT()` trên cột `integer` phải ép `::int`** — nếu không, kiểu trả về của Postgres qua postgres-js là `bigint`→string, JS `+` sẽ nối chuỗi thay vì cộng số. Cột `double precision` (giá ¥, tỷ giá) không cần ép.
- **Runtime bắt buộc đi qua Supavisor pooler với `prepare: false`** (`src/db/index.ts`) — pooler transaction mode không hỗ trợ prepared statement.
- **`max` của pool KHÔNG để 1** — từng để `max: 1` (đúng lý thuyết "1 request/instance" của serverless) nhưng gây treo request 150s+ ngay ở `next dev` vì nhiều request nội bộ của Next.js xếp hàng chờ đúng 1 connection. App có 2 người dùng thật, request đồng thời là bình thường. Đang để `max: 5`.
- **Thời gian lưu epoch-seconds `bigint`** (không phải `timestamptz`) — quyết định có chủ đích để tầng báo cáo tiền (so sánh epoch số nguyên) không phải viết lại. `src/db/schema.ts` có `customType` `epochSeconds` chuyển đổi qua lại với `Date` cho app code; SQL thô dùng `EXTRACT(EPOCH FROM now())::bigint` (hằng số `NOW_EPOCH_SQL` trong `raw.ts`) thay `unixepoch()` của SQLite cũ.
- **Boolean là `boolean` thật** (SQLite cũ giả lập bằng 0/1) — so sánh trong SQL thô dùng `= true`/`= false`, JS so `=== true`.
- **`src/db/schema.ts` dùng alias `@/`** → chỉ Next/tsc nạp được. Script chạy bằng `node` KHÔNG import được schema → viết SQL thô hoặc import trực tiếp `drizzle-orm/pg-core` (xem `scripts/migrate-to-postgres.ts`).
- **Test import module bằng đuôi `.ts` tường minh** (vd `../src/lib/money.ts`); `tsconfig` đã bật `allowImportingTsExtensions`. Module thuần dùng cho test không được import file khác có alias `@/`.
- **Điều hướng (v2):** mọi trang có đăng nhập bọc bằng `<AppShell username={...}>` (`src/app/_components/app-shell.tsx`), KHÔNG dùng `AppHeader` nữa (đã xoá). Sidebar/bottom-tab đọc mục điều hướng từ `nav-config.ts` — thêm màn mới thì sửa 1 chỗ đó, không sửa từng component.
- **`.env` gitignored** (chứa `GEMINI_API_KEY`, `SESSION_SECRET`, `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`...). Mọi cấu hình đọc từ env qua `src/lib/config.ts`. Mẫu ở `.env.example`.
- **`data/app.sqlite` là bản lùi lịch sử** (KHÔNG còn là nguồn dữ liệu chính — dữ liệu thật đã chuyển sang Supabase 14/08) — vẫn giữ lại phòng khi cần đối chiếu, đừng xoá.
- **Tiền v3-A:** `orders.service_fee` đã đổi tên thành `margin_vnd` và mang nghĩa **tổng lời** (= Σ `order_items.margin_vnd`). `quoted_total_vnd` là Total đã chốt với khách, **bất biến** và **không gồm ship**. Sửa ¥ thì lời được rải lại, Total giữ nguyên — luật này khoá bởi `tests/line-pricing.test.ts`.
- **Tham số nghiệp vụ v3-A** (tỷ giá bán, lời mặc định) nằm ở bảng `settings`, không phải `.env` — đổi được lúc chạy, không cần khởi động lại app.
- **Ví ¥ (v3-B):** số dư và giá vốn bq **không lưu trong DB** — chạy lại `cny_ledger` bằng `src/lib/cny-wallet.ts`. Đừng thêm cột `balance`. Dòng `chi` giữ `rate_snapshot` đã chốt cứng lúc mua; sửa giá ¥ sau khi mua thì **ghi dòng `dieu_chinh`**, không sửa dòng cũ.
- **`orders.deposit` là số dẫn xuất** (v3-B) = Σ `payments`. Mọi thay đổi thu tiền phải đi qua `syncOrderDeposit` trong `src/db/queries.ts`, đừng UPDATE thẳng cột này.
- **Báo cáo lãi tính theo ngày HOÀN TẤT** (v3-B), đọc từ `order_status_history` chứ không từ `orders.status_changed_at` (cột đó chỉ giữ lần đổi gần nhất).

## Nghiệp vụ cốt lõi (đừng phá)

- **Tiền** (`src/lib/money.ts`): `tiền hàng(tệ)×tỷ giá + phí dịch vụ + phí ship − cọc = còn phải thu`. Đơn `ban_tu_kho` lưu giá bán vào `goods_total_cny` với `exchange_rate=1` (VND thẳng) + cột `sale_cost` để tính lãi/lỗ. Đơn tạo từ ảnh Zalo cũng dùng `exchange_rate=1`.
- **Trạng thái** (`src/lib/order-status.ts`): trục chính 9 bước tiến đúng 1 bước; nhánh `huy/su_co/khach_bom`. `changeOrderStatus` có side-effect tồn kho (nhập kho→cộng tồn, khách bom→nhập kho + gắn cờ khách).
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
