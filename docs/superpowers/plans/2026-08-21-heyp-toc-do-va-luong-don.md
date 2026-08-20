# HeyP — Kế hoạch: tăng tốc & rút gọn luồng đơn

> **Cho agent thực thi:** SUB-SKILL BẮT BUỘC — dùng `superpowers:subagent-driven-development`
> (khuyến nghị) hoặc `superpowers:executing-plans` để làm từng task một.
> Các bước dùng checkbox `- [ ]` để theo dõi.

**Spec nguồn:** `docs/superpowers/specs/2026-08-20-heyp-toc-do-va-luong-don-design.md`

**Goal:** Đưa trang chi tiết đơn từ ~2.000 ms xuống ~150 ms, nút đổi trạng thái phản hồi tức thì, rút trục trạng thái từ 9 bước còn 4, và làm form tạo đơn chỉ còn 3 ô bắt buộc.

**Architecture:** Bốn giai đoạn tách rời. GĐ1 thuần hạ tầng + cơ học (đổi region Supabase sang Singapore, ghim Vercel `sin1`, gói query vào `Promise.all`) — không đụng nghiệp vụ. GĐ2 viết lại bảng luật trạng thái trong `src/lib/order-status.ts` theo mô hình "mỗi loại đơn một trục riêng", tái dùng mã `da_mua_tq`/`ve_kho_vn` nên không side-effect tiền/kho nào phải sửa. GĐ3 chuyển `OrderJourney` sang client component dùng `useOptimistic`. GĐ4 tách nhỏ form tạo đơn và rút còn 3 ô bắt buộc.

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Drizzle ORM + `postgres-js` · Supabase (Postgres + Storage) · Vercel · test bằng `node:test`.

## Global Constraints

Mọi task đều phải tuân thủ, không cần nhắc lại trong từng task:

- **Gemini: 0 lần gọi live.** Test luồng đọc ảnh Zalo bằng dữ liệu giả qua `tests/zalo-extract.test.ts` và `tests/zalo-merge.test.ts`. Gặp HTTP 429 → **dừng ngay, báo người dùng, không tự thử lại**.
- **`npm test` chạy một lần cho mỗi task hoàn chỉnh**, không chạy lại sau từng dòng sửa.
- **Không dựng preview server rồi chụp màn hình nhiều vòng** — tối đa 1 lần mỗi giai đoạn.
- **Không vòng lặp thử-sai lên DB thật** — query kiểm tra gộp một lần.
- Gặp lỗi quota / rate limit của **bất kỳ** dịch vụ nào → dừng và báo, không tự xoay.
- **Sáu file test này phải xanh và KHÔNG được sửa:** `tests/money.test.ts`, `tests/line-pricing.test.ts`, `tests/inventory.test.ts`, `tests/cny-wallet.test.ts`, `tests/pnl.test.ts`, `tests/payments.test.ts`. Đây là ràng buộc M5 của spec — công thức tiền và tồn kho không được chạm tới.
- **SQL thô dùng placeholder `?`** (lớp `Exec` trong `src/db/raw.ts` tự đổi sang `$1,$2`). Trong `withTx` **PHẢI** dùng `x` được truyền vào, không dùng `raw` toàn cục.
- **Alias camelCase trong SQL thô phải bọc nháy kép**: `AS "orderType"`, không phải `AS orderType`.
- **`SUM()`/`COUNT()` trên cột `integer` phải ép `::int`**.
- **Test import module bằng đuôi `.ts` tường minh** (vd `../src/lib/order-status.ts`).
- **UI tiếng Việt.** Commit message tiếng Việt, kết thúc bằng `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Nhánh làm việc: `design/toc-do-va-luong-don` (đã có sẵn 2 commit spec).

---

## Bản đồ file

| File | Trách nhiệm | Task |
|---|---|---|
| `vercel.json` | **Tạo** — ghim function region `sin1` | 1 |
| `package.json` | Sửa script `dev` thêm `--turbo` | 1 |
| `src/app/orders/[id]/page.tsx` | Gộp 5 await thành 1 `Promise.all` | 2 |
| `src/app/finance/page.tsx`, `reports/page.tsx`, `page.tsx`, `inventory/page.tsx`, `customers/page.tsx`, `settings/page.tsx`, `tracking/page.tsx`, `orders/page.tsx`, `orders/new/page.tsx` | Gộp await | 3 |
| `src/app/api/photo/[id]/route.ts` | `Cache-Control` immutable | 4 |
| *(thao tác ngoài repo)* | Tạo project Supabase Singapore | 5 |
| `src/lib/order-status.ts` | **Viết lại** bảng luật: trục riêng theo loại đơn | 6 |
| `tests/order-status.test.ts` | **Viết lại** theo trục mới | 6 |
| `src/lib/order-gaps.ts` | Đổi mốc nhắc ship sang `da_mua_tq` | 7 |
| `tests/order-gaps.test.ts` | Sửa 1 chỗ | 7 |
| `src/db/queries.ts` | `createOrder` dùng `initialStatus()`; thêm `autoCompleteIfPaid()`; sửa 1 caller `isTerminal` | 8, 9 |
| `src/app/orders/[id]/page.tsx`, `order-journey.tsx` | Đọc được mã về hưu | 10 |
| `src/app/orders/actions.ts` | `changeStatusAction` trả kết quả thay vì redirect | 11 |
| `src/app/orders/[id]/order-journey.tsx` | **Thành client component** + `useOptimistic` | 11 |
| `src/app/orders/new/zalo-dropzone.tsx`, `customer-block.tsx`, `items-block.tsx`, `money-block.tsx` | **Tạo** — tách từ `new-order-form.tsx` | 12 |
| `src/app/orders/new/zalo-dropzone.tsx` | Dán ảnh `Ctrl+V` | 13 |
| `src/app/orders/new/new-order-form.tsx` | 3 ô bắt buộc + gập "Thêm chi tiết" | 14 |
| `CLAUDE.md` | Cập nhật mọi thứ đã đổi | 15 |

---

# GIAI ĐOẠN 1 — Tốc độ (không đụng nghiệp vụ)

## Task 1: Ghim Vercel region `sin1` + bật Turbopack cho dev

**Files:**
- Create: `vercel.json`
- Modify: `package.json` (script `dev`)

**Interfaces:**
- Consumes: không có (task đầu tiên)
- Produces: không có export nào — chỉ cấu hình

**Bối cảnh:** repo hiện không có `vercel.json` nên function chạy ở region mặc định `iad1` (Washington DC). Supabase ở `ap-southeast-2` (Sydney). Mỗi query đi VN → Mỹ → Sydney → Mỹ → VN. Sau Task 5 (DB về Singapore), function ở `sin1` sẽ cùng vùng AWS với DB → ~2–5 ms/query.

- [ ] **Bước 1: Tạo `vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["sin1"]
}
```

- [ ] **Bước 2: Sửa script `dev` trong `package.json`**

Đổi dòng `"dev": "next dev",` thành:

```json
    "dev": "next dev --turbo",
```

- [ ] **Bước 3: Kiểm tra JSON hợp lệ**

Chạy: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('JSON hợp lệ')"`
Kỳ vọng: in ra `JSON hợp lệ`

- [ ] **Bước 4: Kiểm tra typecheck không vỡ**

Chạy: `npx tsc --noEmit`
Kỳ vọng: không lỗi

- [ ] **Bước 5: Commit**

```bash
git add vercel.json package.json
git commit -m "tốc độ: ghim Vercel region sin1 và bật Turbopack cho dev

Function đang chạy ở iad1 (mặc định) trong khi DB ở châu Á — mỗi query đi
vòng qua Mỹ. Ghim sin1 để cùng vùng với Supabase sau khi chuyển sang
Singapore.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

> **Lưu ý cho người vận hành:** ghim trong `vercel.json` là đủ, nhưng nên vào
> Vercel dashboard → Project Settings → Functions xác nhận region đã là
> Singapore sau lần deploy kế tiếp.

---

## Task 2: Gộp query trang chi tiết đơn thành một vòng

**Files:**
- Modify: `src/app/orders/[id]/page.tsx`

**Interfaces:**
- Consumes: `getOrderDetail(orderId)`, `getPackagesForOrder(orderId)`, `getSettings()`, `suggestFinalPayment(orderId)` — đều đã tồn tại trong `src/db/queries.ts`
- Produces: không đổi API nào

**Bối cảnh:** trang này là trang chậm nhất — 7 vòng round-trip tuần tự. Có một `await` **nằm ngay trong JSX** (dòng 301, `suggestFinalPayment`) nên chạy sau khi mọi thứ khác xong; phải kéo lên trên.

- [ ] **Bước 1: Đọc phần đầu hàm để biết đang sửa gì**

Chạy: `sed -n '50,95p' 'src/app/orders/[id]/page.tsx'`

- [ ] **Bước 2: Gộp 3 await đầu (session + params + searchParams)**

Thay:

```tsx
  const session = await requireAuth();
  const { id } = await params;
  const { err } = await searchParams;
```

bằng:

```tsx
  const [session, { id }, { err }] = await Promise.all([
    requireAuth(),
    params,
    searchParams,
  ]);
```

- [ ] **Bước 3: Gộp 4 truy vấn dữ liệu**

Thay dòng `const detail = await getOrderDetail(orderId);` và
`const orderPackages = await getPackagesForOrder(orderId);` và
`const sellRate = order.exchangeRate || (await getSettings()).sellRate;`
bằng một khối duy nhất đặt **ngay sau khi tính được `orderId`**:

```tsx
  // Bốn truy vấn này độc lập nhau — chạy song song để chỉ tốn 1 vòng
  // round-trip thay vì 4. suggestFinalPayment trước đây nằm trong JSX
  // (await giữa lúc render) nên luôn chạy sau cùng; kéo lên đây.
  const [detail, orderPackages, settings, suggestedFinal] = await Promise.all([
    getOrderDetail(orderId),
    getPackagesForOrder(orderId),
    getSettings(),
    suggestFinalPayment(orderId),
  ]);
```

Rồi đặt lại `sellRate` **sau** chỗ đã có `order`:

```tsx
  const sellRate = order.exchangeRate || settings.sellRate;
```

- [ ] **Bước 4: Bỏ await trong JSX**

Tìm dòng `suggestedFinal={await suggestFinalPayment(order.id)}` và đổi thành:

```tsx
          suggestedFinal={suggestedFinal}
```

- [ ] **Bước 5: Kiểm tra không còn await nào ngoài Promise.all**

Chạy: `grep -n "await " 'src/app/orders/[id]/page.tsx'`
Kỳ vọng: chỉ còn **đúng 2 dòng** `await Promise.all([`

- [ ] **Bước 6: Typecheck**

Chạy: `npx tsc --noEmit`
Kỳ vọng: không lỗi. Nếu báo `settings` dùng trước khi khai báo → đã đặt khối `Promise.all` sai chỗ, phải nằm sau `orderId` và trước mọi chỗ dùng.

- [ ] **Bước 7: Chạy toàn bộ test**

Chạy: `npm test`
Kỳ vọng: tất cả xanh (trang này không có test riêng; đây là kiểm tra hồi quy)

- [ ] **Bước 8: Commit**

```bash
git add "src/app/orders/[id]/page.tsx"
git commit -m "tốc độ: gộp 7 truy vấn trang chi tiết đơn thành 1 vòng

suggestFinalPayment trước đây await ngay trong JSX nên luôn chạy sau cùng.
Kéo lên Promise.all cùng getOrderDetail, getPackagesForOrder, getSettings.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Gộp query 9 trang còn lại

**Files:**
- Modify: `src/app/page.tsx`, `src/app/finance/page.tsx`, `src/app/reports/page.tsx`, `src/app/inventory/page.tsx`, `src/app/customers/page.tsx`, `src/app/settings/page.tsx`, `src/app/tracking/page.tsx`, `src/app/orders/page.tsx`, `src/app/orders/new/page.tsx`

**Interfaces:**
- Consumes: các hàm query sẵn có trong `src/db/queries.ts` — không thêm hàm mới
- Produces: không đổi API nào

**Nguyên tắc áp dụng cho từng trang:** gom mọi `await` **không phụ thuộc kết quả của nhau** vào một `Promise.all`. Nếu một await cần kết quả của await trước (ví dụ `orderId` lấy từ `params`) thì tách làm 2 đợt: đợt 1 lấy tham số, đợt 2 truy vấn dữ liệu.

- [ ] **Bước 1: Xem hiện trạng từng trang**

Chạy:
```bash
for f in src/app/page.tsx src/app/finance/page.tsx src/app/reports/page.tsx src/app/inventory/page.tsx src/app/customers/page.tsx src/app/settings/page.tsx src/app/tracking/page.tsx src/app/orders/page.tsx src/app/orders/new/page.tsx; do echo "--- $f"; grep -n "await \|Promise.all" "$f"; done
```

- [ ] **Bước 2: Sửa `src/app/page.tsx` (Tổng quan) — 4 await rời + 1 Promise.all**

Thay các dòng 19, 21–24, 25, 45, 48 bằng một khối duy nhất:

```tsx
  const now = new Date();
  const [session, orders, statusCounts, customers, wallet, pnlData] =
    await Promise.all([
      requireAuth(),
      listOrdersWithGaps(),
      countOrdersByStatus(),
      listCustomersWithTotals(),
      getWallet(),
      getPnlData(now.getFullYear(), now.getMonth() + 1),
    ]);
```

Giữ nguyên tên hàm đang import ở đầu file. Nếu `getPnlData` đang được bọc bởi
`computePnl(...)` thì để `computePnl(pnlData)` ở dòng sau — hàm đó thuần, không await.

- [ ] **Bước 3a: `src/app/finance/page.tsx` — 5 await tuần tự**

Thay dòng 28–33 bằng:

```tsx
  const [session, { err }, wallet, ledger, expenseRows] = await Promise.all([
    requireAuth(),
    searchParams,
    getWallet(),
    listLedger(),
    listExpenses(),
  ]);
```

- [ ] **Bước 3b: `src/app/reports/page.tsx` — 5 await, có phụ thuộc**

`year`/`month` lấy từ `searchParams` nên phải làm 2 đợt:

```tsx
  const [session, { y, m }] = await Promise.all([requireAuth(), searchParams]);
  // ... giữ nguyên phần tính year, month từ y, m ...
  const [cashFlow, pnlData, assets] = await Promise.all([
    getCashFlow(year, month),
    getPnlData(year, month),
    getAssetSnapshot(),
  ]);
  const pnl = computePnl(pnlData);
```

- [ ] **Bước 3c: `src/app/inventory/page.tsx` — 2 await rời**

```tsx
  const [session, rows] = await Promise.all([requireAuth(), listInventory()]);
```

Khối `Promise.all` sẵn có ở dòng 19–22 (`listPhotosForInventory` cho từng dòng
tồn kho) **giữ nguyên** — nó đã chạy song song rồi.

- [ ] **Bước 3d: `src/app/customers/page.tsx` — 2 await**

```tsx
  const [session, customers] = await Promise.all([
    requireAuth(),
    listCustomersWithTotals(),
  ]);
```

- [ ] **Bước 3e: `src/app/settings/page.tsx` — 3 await**

```tsx
  const [session, { ok }, s] = await Promise.all([
    requireAuth(),
    searchParams,
    getSettings(),
  ]);
```

- [ ] **Bước 3f: `src/app/tracking/page.tsx` — 2 await**

```tsx
  const [session, pkgs] = await Promise.all([requireAuth(), listPackages()]);
```

- [ ] **Bước 3g: `src/app/orders/page.tsx` — 3 await**

```tsx
  const [session, { q, gap }, all] = await Promise.all([
    requireAuth(),
    searchParams,
    listOrdersWithGaps(),
  ]);
```

- [ ] **Bước 3h: `src/app/orders/new/page.tsx` — 3 await**

```tsx
  const [session, customers, settings] = await Promise.all([
    requireAuth(),
    listCustomers(),
    getSettings(),
  ]);
```

- [ ] **Bước 4: Kiểm tra không còn await tuần tự thừa**

Chạy:
```bash
for f in src/app/page.tsx src/app/finance/page.tsx src/app/reports/page.tsx src/app/inventory/page.tsx src/app/customers/page.tsx src/app/settings/page.tsx src/app/tracking/page.tsx src/app/orders/page.tsx src/app/orders/new/page.tsx; do echo "$f: $(grep -c 'await ' "$f") await, $(grep -c 'Promise.all' "$f") Promise.all"; done
```
Kỳ vọng: `reports/page.tsx` có 2 `Promise.all` và 2 `await`; `inventory/page.tsx`
có 2 `Promise.all` và 2 `await` (khối ảnh tồn kho giữ nguyên); 7 trang còn lại
mỗi trang **đúng 1** `Promise.all` và **đúng 1** `await`.

- [ ] **Bước 5: Typecheck**

Chạy: `npx tsc --noEmit`
Kỳ vọng: không lỗi

- [ ] **Bước 6: Chạy test**

Chạy: `npm test`
Kỳ vọng: tất cả xanh

- [ ] **Bước 7: Commit**

```bash
git add src/app
git commit -m "tốc độ: song song hoá truy vấn 9 trang còn lại

Mỗi trang trước đây await tuần tự 2-5 lần, mỗi lần là một vòng round-trip
tới DB. Gom vào Promise.all còn 1 vòng.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Cache ảnh vĩnh viễn

**Files:**
- Modify: `src/app/api/photo/[id]/route.ts`

**Interfaces:**
- Consumes: `getPhoto(id)`, `downloadPhotoFile(fileName)` — đã có
- Produces: không đổi API

**Bối cảnh:** spec mục 4.6 chốt **giữ nguyên** proxy qua route đã xác thực (không dùng signed URL) — đây là quyết định bảo mật có chủ đích ghi trong `CLAUDE.md`. Thay đổi duy nhất là header cache: nội dung của một `photo.id` không bao giờ đổi (upload file mới thì tạo bản ghi mới), nên cache vĩnh viễn là đúng.

- [ ] **Bước 1: Sửa header**

Thay:

```ts
    "Cache-Control": "private, max-age=3600",
```

bằng:

```ts
    // Nội dung của một photo.id là bất biến — file mới thì tạo bản ghi mới,
    // không bao giờ ghi đè. Nên cache vĩnh viễn ở trình duyệt và không cần
    // hỏi lại lần nào nữa. Vẫn `private`: ảnh không được cache ở CDN dùng
    // chung, đúng với quyết định giữ proxy qua route đã xác thực.
    "Cache-Control": "private, max-age=31536000, immutable",
```

- [ ] **Bước 2: Typecheck**

Chạy: `npx tsc --noEmit`
Kỳ vọng: không lỗi

- [ ] **Bước 3: Commit**

```bash
git add "src/app/api/photo/[id]/route.ts"
git commit -m "tốc độ: cache ảnh vĩnh viễn ở trình duyệt

photo.id là bất biến nên không cần revalidate. Vẫn giữ private và giữ
proxy qua route đã xác thực — không dùng signed URL.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Chuyển Supabase sang Singapore

**Files:**
- Modify: `.env` (không commit — đã gitignore)
- *(thao tác trên Supabase dashboard, Vercel dashboard, GitHub secrets)*

**Interfaces:**
- Consumes: `drizzle/` (thư mục migration đã có), `src/lib/config.ts` (đọc env)
- Produces: DB mới ở `ap-southeast-1` với schema đầy đủ + 2 dòng `settings`

**Bối cảnh:** đo được Sydney 135 ms, Singapore 50 ms. Supabase không cho đổi region tại chỗ. **DB đã trống** (spec mục 6) nên không cần dump/restore, không cần copy ảnh.

> **Task này chủ yếu là thao tác tay trên dashboard — agent không tự làm được.**
> Nếu đang chạy tự động: dừng ở đây, in ra checklist dưới cho người dùng làm,
> rồi chờ xác nhận trước khi chạy bước kiểm chứng.

- [ ] **Bước 1: Tắt 2 workflow để chúng khỏi fail lặp lại trong lúc chuyển**

```bash
gh workflow disable tracking-sweep.yml
gh workflow disable db-backup.yml
```

Nếu `gh` chưa đăng nhập: vào GitHub → Actions → chọn từng workflow → `Disable workflow`.

- [ ] **Bước 2: Xoá project Supabase cũ (Sydney) TRƯỚC khi tạo mới**

Free tier chỉ cho 2 project mỗi organization. Xoá trước thì lúc nào cũng chỉ có
1 project, không bao giờ chạm trần, không phát sinh Pro ~$25/tháng.

An toàn vì DB đã trống và đã có bản sao lưu ở
`backups/pre-clear-2026-08-20T16-56-09/data.json`.

- [ ] **Bước 3: Tạo project mới, region `Southeast Asia (Singapore)`**

Đặt mật khẩu DB chỉ gồm chữ và số (tránh phải mã hoá URL — đúng như ghi chú đã có trong `.env`).

- [ ] **Bước 4: Lấy 2 chuỗi kết nối đúng loại**

Trong Project Settings → Database → Connection string:
- **Transaction pooler** (port **6543**) → `DATABASE_URL`
- **Session pooler** (port **5432**) → `DIRECT_URL`

**KHÔNG** dùng "Direct connection" thật (host `db.xxx.supabase.co`) — free tier chỉ chạy IPv6, mà Vercel và GitHub Actions chỉ có IPv4.

- [ ] **Bước 5: Tạo bucket Storage**

Storage → New bucket → tên `photos` → **Private** (bỏ tick Public).

- [ ] **Bước 6: Cập nhật `.env`**

Sửa 4 biến: `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
Giữ nguyên `SUPABASE_STORAGE_BUCKET=photos`.

- [ ] **Bước 7: Áp schema**

Chạy: `npm run db:migrate`
Kỳ vọng: chạy hết các migration trong `drizzle/`, không lỗi.

- [ ] **Bước 8: Đặt lại 2 dòng `settings`**

```bash
node -e '
const fs=require("fs");
const env=Object.fromEntries(fs.readFileSync(".env","utf8").split("\n")
  .filter(l=>l.includes("=")&&!l.trim().startsWith("#"))
  .map(l=>[l.slice(0,l.indexOf("=")).trim(), l.slice(l.indexOf("=")+1).trim()]));
import("postgres").then(async ({default:postgres})=>{
  const sql=postgres(env.DIRECT_URL,{prepare:false,max:1});
  await sql`INSERT INTO settings(key,value) VALUES (${"sell_rate"},${"4000"}),(${"default_margin_vnd"},${"170000"}) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`;
  console.table(await sql`SELECT * FROM settings ORDER BY key`);
  await sql.end();
});'
```
Kỳ vọng: bảng in ra `default_margin_vnd = 170000` và `sell_rate = 4000`

- [ ] **Bước 9: Đo lại độ trễ để xác nhận đã về Singapore**

```bash
python3 -c "
import socket,time,statistics,re,io
env=dict(l.split('=',1) for l in io.open('.env',encoding='utf-8') if '=' in l and not l.strip().startswith('#'))
host=re.search(r'@([^:/]+)', env['DATABASE_URL']).group(1)
ts=[]
for _ in range(4):
    t=time.time(); s=socket.create_connection((host,6543),timeout=8); s.close(); ts.append((time.time()-t)*1000)
print(f'{host}: {statistics.median(ts):.0f} ms')"
```
Kỳ vọng: host chứa `ap-southeast-1`, độ trễ **~50 ms** (trước là ~135 ms). Nếu vẫn ~135 ms → đã tạo nhầm region, quay lại Bước 3.

- [ ] **Bước 10: Cập nhật secrets ở Vercel và GitHub**

- Vercel → Project Settings → Environment Variables: sửa 4 biến ở Bước 6.
- GitHub → Settings → Secrets and variables → Actions: sửa các secret mà `.github/workflows/db-backup.yml` và `tracking-sweep.yml` đang dùng.

Kiểm tra tên secret đang dùng: `grep -n "secrets\." .github/workflows/*.yml`

- [ ] **Bước 11: Bật lại 2 workflow và chạy thử**

```bash
gh workflow enable tracking-sweep.yml
gh workflow enable db-backup.yml
gh workflow run db-backup.yml
```

Chờ rồi kiểm tra: `gh run list --workflow=db-backup.yml --limit 1`
Kỳ vọng: `completed  success`

- [ ] **Bước 12: Commit (chỉ ghi chú, `.env` không được commit)**

```bash
git status --short
```
Kỳ vọng: **không** thấy `.env` trong danh sách. Nếu thấy → dừng lại, kiểm tra `.gitignore`.

Không có gì để commit ở task này (mọi thay đổi nằm trong `.env` và dashboard).
Ghi lại kết quả đo được ở Bước 9 để đưa vào `CLAUDE.md` ở Task 15.

---

# GIAI ĐOẠN 2 — Trục trạng thái 4 bước

## Task 6: Viết lại bảng luật trạng thái

**Files:**
- Modify: `src/lib/order-status.ts` (viết lại phần hằng số + luật, giữ nguyên chữ ký hàm công khai)
- Modify: `tests/order-status.test.ts` (viết lại toàn bộ)

**Interfaces:**
- Consumes: không có
- Produces — các export mà task sau dựa vào:
  - `MAIN_CHAIN: readonly ["khach_chot","da_mua_tq","da_giao_khach","hoan_tat"]`
  - `RETIRED_STATUSES: readonly ["cho_bao_gia","da_bao_gia","ve_kho_tq","dang_van_chuyen_vn"]`
  - `ORDER_STATUSES`, `type OrderStatus`, `type OrderType`, `STATUS_LABELS`
  - `journeyTrack(orderType: OrderType): readonly OrderStatus[]`
  - `initialStatus(orderType: OrderType): OrderStatus` ← **mới**, Task 8 dùng
  - `isTerminal(status: OrderStatus): boolean` ← giữ nguyên chữ ký 1 tham số
  - `isTerminalFor(orderType: OrderType, status: OrderStatus): boolean` ← **mới**, Task 9 dùng
  - `allowedNextStatuses(orderType, from): OrderStatus[]`
  - `canTransition(orderType, from, to): boolean`
  - `transition(orderType, from, to): TransitionResult`
  - `earliestOriginFor(status: OrderStatus): OrderStatus`

**Bối cảnh — vì sao tái dùng mã cũ:** ba side-effect tiền/kho đang neo vào ba trạng thái (`da_mua_tq` → trừ ví ¥; `ve_kho_vn` + `nhap_kho` → cộng tồn; `khach_bom` → nhập kho hàng bom). Giữ đúng ba mã đó làm trạng thái của trục mới nghĩa là **không phải viết lại side-effect nào** trong `src/db/queries.ts`.

- [ ] **Bước 1: Viết lại test trước (TDD)**

Thay **toàn bộ** nội dung `tests/order-status.test.ts` bằng:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAIN_CHAIN,
  RETIRED_STATUSES,
  allowedNextStatuses,
  canTransition,
  initialStatus,
  isTerminal,
  isTerminalFor,
  journeyTrack,
  transition,
  type OrderStatus,
} from "../src/lib/order-status.ts";

test("trục order_ho đúng 4 bước", () => {
  assert.deepEqual(journeyTrack("order_ho"), [
    "khach_chot",
    "da_mua_tq",
    "da_giao_khach",
    "hoan_tat",
  ]);
});

test("mỗi loại đơn có trục riêng, bắt đầu ở bước đầu của trục đó", () => {
  assert.equal(initialStatus("order_ho"), "khach_chot");
  assert.equal(initialStatus("nhap_kho"), "da_mua_tq");
  assert.equal(initialStatus("ban_tu_kho"), "da_giao_khach");
  assert.deepEqual(journeyTrack("nhap_kho"), ["da_mua_tq", "ve_kho_vn"]);
  assert.deepEqual(journeyTrack("ban_tu_kho"), ["da_giao_khach", "hoan_tat"]);
});

test("tiến đúng 1 bước trên trục là hợp lệ", () => {
  for (let i = 0; i < MAIN_CHAIN.length - 1; i++) {
    assert.ok(
      canTransition("order_ho", MAIN_CHAIN[i], MAIN_CHAIN[i + 1]),
      `${MAIN_CHAIN[i]} → ${MAIN_CHAIN[i + 1]} phải hợp lệ`,
    );
  }
  assert.ok(canTransition("nhap_kho", "da_mua_tq", "ve_kho_vn"));
  assert.ok(canTransition("ban_tu_kho", "da_giao_khach", "hoan_tat"));
});

test("cấm nhảy cóc", () => {
  assert.equal(canTransition("order_ho", "khach_chot", "da_giao_khach"), false);
  assert.equal(canTransition("order_ho", "khach_chot", "hoan_tat"), false);
  assert.equal(canTransition("order_ho", "da_mua_tq", "hoan_tat"), false);
});

test("cấm đi lùi", () => {
  assert.equal(canTransition("order_ho", "da_mua_tq", "khach_chot"), false);
  assert.equal(canTransition("order_ho", "da_giao_khach", "da_mua_tq"), false);
});

test("trạng thái cuối không có bước ra", () => {
  assert.ok(isTerminal("hoan_tat"));
  assert.ok(isTerminal("huy"));
  assert.ok(isTerminal("khach_bom"));
  assert.deepEqual(allowedNextStatuses("order_ho", "hoan_tat"), []);
  assert.deepEqual(allowedNextStatuses("order_ho", "huy"), []);
  assert.deepEqual(allowedNextStatuses("order_ho", "khach_bom"), []);
});

test("ve_kho_vn là điểm kết của nhap_kho, không phải của order_ho", () => {
  assert.ok(isTerminalFor("nhap_kho", "ve_kho_vn"));
  assert.deepEqual(allowedNextStatuses("nhap_kho", "ve_kho_vn"), []);
  // isTerminal (không theo loại đơn) chỉ nói về 3 mã cuối toàn cục
  assert.equal(isTerminal("ve_kho_vn"), false);
});

test("Huỷ: chỉ từ khach_chot, tức chỉ khi chưa mua hàng", () => {
  assert.ok(canTransition("order_ho", "khach_chot", "huy"));
  assert.equal(canTransition("order_ho", "da_mua_tq", "huy"), false);
  assert.equal(canTransition("order_ho", "da_giao_khach", "huy"), false);
});

test("nhap_kho không huỷ được vì không đi qua khach_chot", () => {
  assert.equal(canTransition("nhap_kho", "da_mua_tq", "huy"), false);
  assert.ok(canTransition("nhap_kho", "da_mua_tq", "su_co"));
});

test("Sự cố: từ khâu đang lưu thông và khâu đã giao", () => {
  assert.ok(canTransition("order_ho", "da_mua_tq", "su_co"));
  assert.ok(canTransition("order_ho", "da_giao_khach", "su_co"));
  assert.equal(canTransition("order_ho", "khach_chot", "su_co"), false);
});

test("Sự cố chưa phải cuối: quay lại trục hoặc rẽ nhánh", () => {
  assert.ok(!isTerminal("su_co"));
  assert.ok(canTransition("order_ho", "su_co", "da_mua_tq"));
  assert.ok(canTransition("order_ho", "su_co", "da_giao_khach"));
  assert.ok(canTransition("order_ho", "su_co", "huy"));
  assert.ok(canTransition("order_ho", "su_co", "khach_bom"));
});

test("Sự cố của nhap_kho chỉ quay lại được khâu có trên trục của nó", () => {
  const next = allowedNextStatuses("nhap_kho", "su_co");
  assert.ok(next.includes("da_mua_tq"));
  assert.equal(next.includes("da_giao_khach"), false);
});

test("Khách bom: chỉ từ khâu đã giao", () => {
  assert.ok(canTransition("order_ho", "da_giao_khach", "khach_bom"));
  assert.equal(canTransition("order_ho", "da_mua_tq", "khach_bom"), false);
  assert.equal(canTransition("order_ho", "khach_chot", "khach_bom"), false);
});

test("mã về hưu vẫn là OrderStatus hợp lệ nhưng không nằm trên trục nào", () => {
  for (const s of RETIRED_STATUSES) {
    assert.deepEqual(
      allowedNextStatuses("order_ho", s as OrderStatus),
      [],
      `${s} đã về hưu, không được có bước tiếp`,
    );
  }
});

test("transition trả lý do rõ ràng khi bị chặn", () => {
  const r = transition("order_ho", "khach_chot", "hoan_tat");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /Không được chuyển/);
});

test("đi hết trục order_ho từ đầu tới cuối", () => {
  let status: OrderStatus = MAIN_CHAIN[0];
  for (let i = 1; i < MAIN_CHAIN.length; i++) {
    const r = transition("order_ho", status, MAIN_CHAIN[i]);
    assert.equal(r.ok, true, `bước tới ${MAIN_CHAIN[i]} phải hợp lệ`);
    status = MAIN_CHAIN[i];
  }
  assert.ok(isTerminal(status));
});
```

- [ ] **Bước 2: Chạy test để chắc chắn nó ĐỎ**

Chạy: `node --test tests/order-status.test.ts`
Kỳ vọng: FAIL — báo không tìm thấy export `RETIRED_STATUSES`, `initialStatus`, `isTerminalFor`

- [ ] **Bước 3: Viết lại phần hằng số của `src/lib/order-status.ts`**

Thay khối từ `export const MAIN_CHAIN` tới hết `STATUS_LABELS` bằng:

```ts
/**
 * Trục chính của đơn order hộ (v4 — rút từ 9 bước xuống 4).
 *
 * Tái dùng đúng các mã cũ có side-effect tiền/kho neo vào, để không phải
 * viết lại side-effect nào trong src/db/queries.ts:
 *   - da_mua_tq  → trừ ví ¥ + chốt cứng tỷ giá
 *   - ve_kho_vn  → cộng tồn kho (đơn nhap_kho)
 *   - khach_bom  → nhập kho hàng bom + gắn cờ khách
 */
export const MAIN_CHAIN = [
  "khach_chot",
  "da_mua_tq",
  "da_giao_khach",
  "hoan_tat",
] as const;

export const BRANCH_STATUSES = ["huy", "su_co", "khach_bom"] as const;

/**
 * Mã đã về hưu ở v4. KHÔNG còn xuất hiện trong luồng chạy, nhưng vẫn phải là
 * OrderStatus hợp lệ vì order_status_history cũ có thể còn giữ — UI hành
 * trình đọc bảng đó, gặp mã lạ sẽ vỡ.
 */
export const RETIRED_STATUSES = [
  "cho_bao_gia",
  "da_bao_gia",
  "ve_kho_tq",
  "dang_van_chuyen_vn",
] as const;

export const ORDER_STATUSES = [
  ...MAIN_CHAIN,
  "ve_kho_vn",
  ...BRANCH_STATUSES,
  ...RETIRED_STATUSES,
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  khach_chot: "Khách chốt",
  da_mua_tq: "Đã mua, đang về",
  ve_kho_vn: "Về kho",
  da_giao_khach: "Đã giao khách",
  hoan_tat: "Hoàn tất",
  huy: "Hủy",
  su_co: "Sự cố",
  khach_bom: "Khách bom",
  // Mã về hưu — nhãn giữ lại để hiển thị lịch sử cũ cho đúng.
  cho_bao_gia: "Chờ báo giá",
  da_bao_gia: "Đã báo giá",
  ve_kho_tq: "Về kho TQ",
  dang_van_chuyen_vn: "Đang vận chuyển VN",
};

/**
 * Mỗi loại đơn đi một trục riêng, thay vì cả ba cùng bò qua một trục chung.
 * Đơn nhập kho không có khách nên không có khâu giao; đơn bán từ kho là hàng
 * có sẵn nên không có khâu mua/vận chuyển.
 */
const TRACKS: Record<OrderType, readonly OrderStatus[]> = {
  order_ho: MAIN_CHAIN,
  nhap_kho: ["da_mua_tq", "ve_kho_vn"],
  ban_tu_kho: ["da_giao_khach", "hoan_tat"],
};

const GLOBAL_TERMINAL: readonly OrderStatus[] = ["hoan_tat", "huy", "khach_bom"];
const CANCELLABLE_FROM: readonly OrderStatus[] = ["khach_chot"];
const INCIDENT_FROM: readonly OrderStatus[] = ["da_mua_tq", "da_giao_khach"];
const BOMB_FROM: readonly OrderStatus[] = ["da_giao_khach"];
```

- [ ] **Bước 4: Viết lại phần hàm luật**

Thay các hàm `isTerminal`, `allowedNextStatuses`, `journeyTrack`, `earliestOriginFor` bằng:

```ts
/** Ba mã kết thúc toàn cục, đúng với mọi loại đơn. */
export function isTerminal(status: OrderStatus): boolean {
  return GLOBAL_TERMINAL.includes(status);
}

/**
 * Kết thúc theo loại đơn. Khác `isTerminal` ở chỗ: `ve_kho_vn` là điểm kết
 * của đơn nhap_kho nhưng không phải mã kết thúc toàn cục.
 */
export function isTerminalFor(
  orderType: OrderType,
  status: OrderStatus,
): boolean {
  if (isTerminal(status)) return true;
  const track = TRACKS[orderType];
  return track[track.length - 1] === status;
}

/** Trạng thái một đơn mới được tạo ra — bước đầu của trục theo loại đơn. */
export function initialStatus(orderType: OrderType): OrderStatus {
  return TRACKS[orderType][0];
}

/** Các mốc hiển thị trên "hành trình đơn hàng" (UI). */
export function journeyTrack(orderType: OrderType): readonly OrderStatus[] {
  return TRACKS[orderType];
}

/** Sau khi giải quyết sự cố, quay lại được khâu nào — chỉ khâu có trên trục. */
function incidentResumeFor(orderType: OrderType): OrderStatus[] {
  return INCIDENT_FROM.filter((s) => TRACKS[orderType].includes(s));
}

export function allowedNextStatuses(
  orderType: OrderType,
  from: OrderStatus,
): OrderStatus[] {
  if (isTerminalFor(orderType, from)) return [];

  const result = new Set<OrderStatus>();

  if (from === "su_co") {
    for (const s of incidentResumeFor(orderType)) result.add(s);
    result.add("huy");
    result.add("khach_bom");
    return [...result];
  }

  const track = TRACKS[orderType];
  const i = track.indexOf(from);

  // Mã về hưu (hoặc mã không thuộc trục của loại đơn này) → indexOf = -1,
  // không có bước tiếp nào. Đúng: đơn không bao giờ được tạo ở mã về hưu.
  if (i < 0) return [];

  if (i < track.length - 1) result.add(track[i + 1]);

  if (CANCELLABLE_FROM.includes(from)) result.add("huy");
  if (INCIDENT_FROM.includes(from)) result.add("su_co");
  if (BOMB_FROM.includes(from)) result.add("khach_bom");

  return [...result];
}

/**
 * Mốc SỚM NHẤT trên trục mà một trạng thái nhánh có thể xuất phát. Dùng làm
 * điểm neo dự phòng cho UI khi lịch sử không ghi đủ các bước trung gian.
 */
export function earliestOriginFor(status: OrderStatus): OrderStatus {
  if (status === "huy") return CANCELLABLE_FROM[0];
  if (status === "su_co") return INCIDENT_FROM[0];
  if (status === "khach_bom") return BOMB_FROM[0];
  return MAIN_CHAIN[0];
}
```

Giữ nguyên `canTransition` và `transition` — chúng gọi `allowedNextStatuses` nên tự đúng theo luật mới.

- [ ] **Bước 5: Chạy test trạng thái, phải XANH**

Chạy: `node --test tests/order-status.test.ts`
Kỳ vọng: tất cả PASS

- [ ] **Bước 6: Typecheck — sẽ lộ ra các chỗ gọi cần sửa ở task sau**

Chạy: `npx tsc --noEmit`
Kỳ vọng: **có thể còn lỗi** ở `src/db/queries.ts`, `src/lib/order-gaps.ts`,
`src/app/orders/[id]/page.tsx`, `src/app/orders/page.tsx`, `src/app/page.tsx` —
những chỗ này Task 7, 8, 9, 10 xử lý. Ghi lại danh sách lỗi để đối chiếu.

- [ ] **Bước 7: Commit**

```bash
git add src/lib/order-status.ts tests/order-status.test.ts
git commit -m "nghiệp vụ: rút trục trạng thái từ 9 bước còn 4, mỗi loại đơn một trục

order_ho: khach_chot → da_mua_tq → da_giao_khach → hoan_tat
nhap_kho: da_mua_tq → ve_kho_vn
ban_tu_kho: da_giao_khach → hoan_tat

Tái dùng đúng các mã có side-effect tiền/kho neo vào (da_mua_tq, ve_kho_vn,
khach_bom) nên không phải viết lại side-effect nào. Bốn mã cho về hưu vẫn
giữ trong ORDER_STATUSES để đọc được lịch sử cũ.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Đổi mốc nhắc phí ship

**Files:**
- Modify: `src/lib/order-gaps.ts:43`
- Modify: `tests/order-gaps.test.ts`

**Interfaces:**
- Consumes: `MAIN_CHAIN`, `type OrderStatus`, `type OrderType` từ `./order-status.ts` (Task 6)
- Produces: `orderGaps(order, items, photos): GapCode[]` — chữ ký không đổi

**Bối cảnh:** hằng số `SHIP_REMINDER_FROM` đang là `ve_kho_vn`, mốc này đã rời khỏi trục của `order_ho`. Trong mô hình mới `da_mua_tq` bao trọn khoảng hàng đang trên đường, nên nhắc từ đó. Nhắc hơi sớm nhưng gaps chỉ **nhắc chứ không chặn**, và thà sớm còn hơn phát hiện lúc đã giao hàng.

- [ ] **Bước 1: Sửa test trước**

Xem chỗ cần sửa: `grep -n "ve_kho_vn\|cho_bao_gia\|da_bao_gia\|ve_kho_tq\|dang_van_chuyen_vn" tests/order-gaps.test.ts`

Đổi mọi mã đã về hưu sang mã còn dùng, và thêm test mới vào cuối file:

```ts
test("nhắc phí ship từ khâu 'đã mua, đang về', không nhắc lúc mới chốt", () => {
  const base = {
    orderType: "order_ho" as const,
    customerId: 1,
    customerPhone: "0900000000",
    customerAddress: "Hà Nội",
    shipStatus: "unknown" as const,
  };
  const items = [{ costConfirmed: true }];
  const photos = [{ label: "product" as const }];

  assert.deepEqual(
    orderGaps({ ...base, status: "khach_chot" }, items, photos),
    [],
    "mới chốt thì chưa biết ship, không nhắc",
  );
  assert.deepEqual(
    orderGaps({ ...base, status: "da_mua_tq" }, items, photos),
    ["thieu_ship"],
    "đã mua và đang về thì phải nhắc",
  );
  assert.deepEqual(
    orderGaps({ ...base, status: "da_giao_khach" }, items, photos),
    ["thieu_ship"],
  );
});
```

- [ ] **Bước 2: Chạy test để chắc chắn ĐỎ**

Chạy: `node --test tests/order-gaps.test.ts`
Kỳ vọng: FAIL ở test mới (`da_mua_tq` chưa nhắc ship vì mốc vẫn là `ve_kho_vn`)

- [ ] **Bước 3: Sửa hằng số**

Trong `src/lib/order-gaps.ts`, thay:

```ts
/** Từ khâu này trở đi mới nhắc nhập phí ship (trước đó chưa biết là bình thường). */
const SHIP_REMINDER_FROM: OrderStatus = "ve_kho_vn";
```

bằng:

```ts
/**
 * Từ khâu này trở đi mới nhắc nhập phí ship. Ở v4, "da_mua_tq" mang nghĩa
 * "đã mua, đang về" — bao trọn khoảng hàng trên đường, nên đây là mốc sớm
 * nhất còn hợp lý. Gaps chỉ nhắc chứ không chặn, thà sớm còn hơn phát hiện
 * lúc đã giao hàng.
 */
const SHIP_REMINDER_FROM: OrderStatus = "da_mua_tq";
```

- [ ] **Bước 4: Chạy test, phải XANH**

Chạy: `node --test tests/order-gaps.test.ts`
Kỳ vọng: tất cả PASS

- [ ] **Bước 5: Commit**

```bash
git add src/lib/order-gaps.ts tests/order-gaps.test.ts
git commit -m "nghiệp vụ: nhắc phí ship từ khâu 'đã mua, đang về'

Mốc cũ ve_kho_vn đã rời khỏi trục của đơn order hộ ở v4.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Đơn tạo ra vào đúng bước đầu của trục

**Files:**
- Modify: `src/db/queries.ts` (hàm `createOrder`, khoảng dòng 190–200)

**Interfaces:**
- Consumes: `initialStatus(orderType)` từ `src/lib/order-status.ts` (Task 6)
- Produces: `createOrder` — chữ ký không đổi, chỉ đổi trạng thái khởi tạo

**Bối cảnh:** `createOrder` đang hardcode `'cho_bao_gia'` trong câu INSERT — mã này đã về hưu. Hàm `sellFromStock` (đơn `ban_tu_kho`) đã hardcode `'da_giao_khach'` sẵn, đúng với trục mới nên **không cần sửa**.

- [ ] **Bước 1: Thêm `initialStatus` vào danh sách import**

Trong khối import từ `@/lib/order-status` ở đầu `src/db/queries.ts` (khoảng dòng 41–43), thêm `initialStatus` và `isTerminalFor`:

```ts
  BRANCH_STATUSES,
  MAIN_CHAIN,
  initialStatus,
  isTerminal,
  isTerminalFor,
```

- [ ] **Bước 2: Sửa câu INSERT**

Thay:

```ts
      `INSERT INTO orders
         (customer_id, order_type, status, exchange_rate, goods_total_cny,
          margin_vnd, shipping_fee, deposit, amount_due, note,
          quoted_total_vnd, ship_status)
       VALUES (?, ?, 'cho_bao_gia', ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        customerId,
        input.orderType,
```

bằng:

```ts
      // Trạng thái khởi tạo là bước ĐẦU của trục theo loại đơn (v4), không
      // còn hardcode 'cho_bao_gia' — mã đó đã về hưu cùng khâu báo giá.
      `INSERT INTO orders
         (customer_id, order_type, status, exchange_rate, goods_total_cny,
          margin_vnd, shipping_fee, deposit, amount_due, note,
          quoted_total_vnd, ship_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        customerId,
        input.orderType,
        initialStatus(input.orderType),
```

- [ ] **Bước 3: Sửa caller `isTerminal` thành `isTerminalFor`**

Xem chỗ đó: `grep -n "isTerminal(" src/db/queries.ts`

Ở dòng ~1248, `const terminal = isTerminal(r.status);` dùng để biết đơn còn
sống hay đã xong. Đơn `nhap_kho` ở `ve_kho_vn` đã xong nhưng `isTerminal` trả
`false`. Đổi thành:

```ts
      const terminal = isTerminalFor(r.orderType, r.status);
```

Nếu biến trong scope đó không có `orderType`, phải bổ sung cột `order_type AS "orderType"` vào câu SELECT tương ứng (nhớ **bọc nháy kép** alias camelCase).

- [ ] **Bước 4: Typecheck**

Chạy: `npx tsc --noEmit`
Kỳ vọng: không còn lỗi nào ở `src/db/queries.ts`

- [ ] **Bước 5: Chạy toàn bộ test**

Chạy: `npm test`
Kỳ vọng: tất cả xanh, đặc biệt 6 file tiền/kho trong Global Constraints

- [ ] **Bước 6: Commit**

```bash
git add src/db/queries.ts
git commit -m "nghiệp vụ: đơn mới vào đúng bước đầu của trục theo loại đơn

createOrder không còn hardcode 'cho_bao_gia' (mã đã về hưu) mà dùng
initialStatus(orderType). Đổi isTerminal thành isTerminalFor ở chỗ đếm đơn
còn sống, để đơn nhap_kho ở ve_kho_vn được tính là đã xong.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Tự động hoàn tất khi đã giao và thu đủ tiền

**Files:**
- Modify: `src/db/queries.ts` (thêm `autoCompleteIfPaid`, gắn vào `changeOrderStatus`, `addPayment`, `deletePayment`)

**Interfaces:**
- Consumes: `changeOrderStatus(id, to, changedBy?, note?)`, `raw.get` — đã có
- Produces: `autoCompleteIfPaid(orderId: number, changedBy?: string | null): Promise<void>`

**Bối cảnh — luật bắt buộc:** báo cáo lãi đọc ngày hoàn tất từ `order_status_history` (`src/db/queries.ts:1521`), **không** đọc `orders.status_changed_at`. Nên tự động hoàn tất **phải đi qua `changeOrderStatus`** để có dòng lịch sử, tuyệt đối không `UPDATE orders SET status` thẳng.

**Chống lồng transaction:** `changeOrderStatus` chạy trong `withTx`. `autoCompleteIfPaid` gọi lại `changeOrderStatus`, nên **phải gọi SAU khi transaction ngoài đã commit**, không gọi bên trong. Không có nguy cơ đệ quy vô hạn vì `hoan_tat` không phải `da_giao_khach`.

- [ ] **Bước 1: Thêm hàm `autoCompleteIfPaid`**

Đặt ngay sau hàm `changeOrderStatus` trong `src/db/queries.ts`:

```ts
/**
 * Đơn đã giao khách và không còn phải thu → tự chuyển "Hoàn tất".
 *
 * PHẢI đi qua changeOrderStatus (không UPDATE thẳng cột status) để
 * order_status_history có dòng 'hoan_tat' — báo cáo lãi tính theo NGÀY HOÀN
 * TẤT đọc từ bảng đó, không đọc orders.status_changed_at.
 *
 * Gọi hàm này SAU khi transaction gọi nó đã commit, không gọi bên trong
 * withTx: changeOrderStatus tự mở transaction riêng.
 */
export async function autoCompleteIfPaid(
  orderId: number,
  changedBy?: string | null,
): Promise<void> {
  const row = await raw.get<{ status: OrderStatus; amount_due: number }>(
    "SELECT status, amount_due FROM orders WHERE id = ?",
    [orderId],
  );
  if (!row) return;
  if (row.status !== "da_giao_khach") return;
  if (row.amount_due > 0) return;

  await changeOrderStatus(
    orderId,
    "hoan_tat",
    changedBy ?? "tự động",
    "Tự động hoàn tất: đã giao khách và thu đủ tiền",
  );
}
```

- [ ] **Bước 2: Gắn vào `changeOrderStatus` — trường hợp cọc 100%**

Trong `changeOrderStatus`, câu lệnh cuối đang là `return withTx(async (x) => { ... })`.
Đổi thành lấy kết quả ra trước rồi mới trả:

```ts
  const result = await withTx(async (x) => {
    // ... giữ nguyên toàn bộ thân hàm hiện tại ...
    return { ok: true } as ChangeStatusResult;
  });

  // Đơn đã thu đủ từ trước (ví dụ cọc 100%) thì vừa bấm "đã giao" là xong
  // luôn, không bắt thao tác thêm. Gọi ngoài withTx vì changeOrderStatus
  // bên trong autoCompleteIfPaid tự mở transaction riêng.
  if (result.ok && to === "da_giao_khach") {
    await autoCompleteIfPaid(id, changedBy);
  }

  return result;
```

- [ ] **Bước 3: Gắn vào luồng thu tiền**

Xem 2 chỗ gọi `syncOrderDeposit`: `grep -n "syncOrderDeposit" src/db/queries.ts`

Cả hai nằm **bên trong** `withTx` (dòng ~1093 trong `addPayment`, ~1111 trong
`deletePayment`). Với mỗi hàm: lấy kết quả `withTx` ra biến, rồi gọi
`autoCompleteIfPaid` sau đó, trước khi `return`. Ví dụ với `addPayment`:

```ts
  const result = await withTx(async (x) => {
    // ... giữ nguyên thân hàm ...
  });

  // Khách trả nốt tiền lúc đơn đã ở "đã giao khách" → hoàn tất luôn.
  await autoCompleteIfPaid(input.orderId);

  return result;
```

Làm y hệt cho `deletePayment`, dùng biến `orderId` có sẵn trong hàm đó.

> `deletePayment` cũng gọi vì xoá nhầm rồi thêm lại là chuyện bình thường —
> gọi ở cả hai chiều thì trạng thái luôn khớp với số tiền thực thu.

- [ ] **Bước 4: Viết test cho luật này**

Tạo `tests/auto-complete.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { canTransition } from "../src/lib/order-status.ts";

/**
 * autoCompleteIfPaid đụng DB nên không test trực tiếp ở tầng unit (dự án
 * không có thư viện mock DB). Ở đây khoá phần LUẬT mà nó dựa vào: bước
 * da_giao_khach → hoan_tat phải hợp lệ với mọi loại đơn có khâu giao, nếu
 * không thì tự động hoàn tất sẽ âm thầm không chạy.
 */
test("da_giao_khach → hoan_tat hợp lệ, nếu không tự động hoàn tất sẽ chết câm", () => {
  assert.ok(canTransition("order_ho", "da_giao_khach", "hoan_tat"));
  assert.ok(canTransition("ban_tu_kho", "da_giao_khach", "hoan_tat"));
});

test("đơn nhap_kho không có khâu giao nên không dính luật tự động hoàn tất", () => {
  assert.equal(canTransition("nhap_kho", "da_mua_tq", "hoan_tat"), false);
});
```

- [ ] **Bước 5: Chạy test mới**

Chạy: `node --test tests/auto-complete.test.ts`
Kỳ vọng: PASS

- [ ] **Bước 6: Typecheck + toàn bộ test**

Chạy: `npx tsc --noEmit && npm test`
Kỳ vọng: không lỗi, tất cả test xanh

- [ ] **Bước 7: Commit**

```bash
git add src/db/queries.ts tests/auto-complete.test.ts
git commit -m "nghiệp vụ: tự động hoàn tất khi đã giao và thu đủ tiền

Hai điểm kích hoạt: sau khi thu/xoá tiền, và ngay sau khi chuyển sang đã
giao khách (đơn cọc 100%). Đi qua changeOrderStatus để order_status_history
có dòng hoan_tat — báo cáo lãi đọc ngày từ bảng đó. Gọi ngoài withTx để
không lồng transaction.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: UI đọc được mã trạng thái đã về hưu

**Files:**
- Modify: `src/app/orders/[id]/page.tsx` (hàm định vị bước, ~dòng 35–46)
- Modify: `src/app/orders/[id]/order-journey.tsx` (~dòng 43–58)
- Modify: `src/app/orders/page.tsx:15` (`DISPLAY_ORDER`)
- Modify: `src/app/page.tsx:114-119` (thanh tiến độ)

**Interfaces:**
- Consumes: `MAIN_CHAIN`, `BRANCH_STATUSES`, `journeyTrack`, `earliestOriginFor`, `RETIRED_STATUSES` từ Task 6
- Produces: không đổi API

**Bối cảnh:** DB đã trống nên hiện chưa có đơn nào ở mã về hưu, nhưng `order_status_history` của các đơn tương lai vẫn có thể chứa mã lạ nếu dữ liệu được nạp lại từ bản sao lưu. UI phải chịu được thay vì vỡ.

- [ ] **Bước 1: `order-journey.tsx` — dùng trục theo loại đơn thay vì MAIN_CHAIN**

Trong `OrderJourney`, thay khối tính `forwardTarget`:

```tsx
  const mainIndex = (MAIN_CHAIN as readonly string[]).indexOf(positionStatus);
  const forwardTarget =
    mainIndex >= 0 && mainIndex < MAIN_CHAIN.length - 1
      ? MAIN_CHAIN[mainIndex + 1]
      : null;
```

bằng:

```tsx
  // Dùng trục của CHÍNH loại đơn này, không phải MAIN_CHAIN chung — đơn
  // nhap_kho và ban_tu_kho có trục riêng, tra vào MAIN_CHAIN sẽ ra -1.
  const trackPos = track.indexOf(positionStatus);
  const forwardTarget =
    trackPos >= 0 && trackPos < track.length - 1 ? track[trackPos + 1] : null;
```

Rồi bỏ `MAIN_CHAIN` khỏi import nếu không còn chỗ nào dùng.

- [ ] **Bước 2: `orders/[id]/page.tsx` — định vị theo trục của loại đơn**

Tìm hàm tính `positionStatus` (khoảng dòng 35–46). Thay
`const chain = MAIN_CHAIN as readonly string[];` bằng trục theo loại đơn:

```tsx
  const chain = journeyTrack(orderType) as readonly string[];
```

và bổ sung tham số `orderType: OrderType` vào chữ ký hàm đó, truyền từ chỗ gọi
(`order.orderType`). Nhớ thêm `journeyTrack` và `type OrderType` vào import.

- [ ] **Bước 3: `orders/page.tsx` — bỏ mã về hưu khỏi thứ tự hiển thị**

Thay dòng 15:

```tsx
const DISPLAY_ORDER: OrderStatus[] = [...MAIN_CHAIN, ...BRANCH_STATUSES];
```

bằng:

```tsx
// Chỉ liệt kê mã còn dùng. Mã về hưu (RETIRED_STATUSES) không xuất hiện ở
// đây — đơn mới không bao giờ được tạo ở những mã đó nữa.
const DISPLAY_ORDER: OrderStatus[] = [
  ...MAIN_CHAIN,
  "ve_kho_vn",
  ...BRANCH_STATUSES,
];
```

- [ ] **Bước 4: `src/app/page.tsx` — thanh tiến độ không chia cho 0**

Ở dòng ~114–119, `chainIdx` có thể là `-1` nếu gặp mã về hưu. Bọc lại:

```tsx
                const chainIdx = (MAIN_CHAIN as readonly string[]).indexOf(
                  o.status,
                );
                const progress =
                  chainIdx >= 0
                    ? ((chainIdx + 1) / MAIN_CHAIN.length) * 100
                    : 0;
```

rồi dùng `progress` ở chỗ đang tính inline. Giữ nguyên tên biến sẵn có trong file nếu khác.

- [ ] **Bước 5: Typecheck**

Chạy: `npx tsc --noEmit`
Kỳ vọng: không lỗi

- [ ] **Bước 6: Chạy test**

Chạy: `npm test`
Kỳ vọng: tất cả xanh

- [ ] **Bước 7: Xem thật một lần bằng preview (chỉ 1 lần, theo Global Constraints)**

Dùng công cụ preview của harness với `.claude/launch.json`, mở `/orders`, tạo
thử một đơn tối thiểu, bấm tiến một bước, chụp màn hình xác nhận stepper hiển
thị 4 mốc chứ không phải 9.

- [ ] **Bước 8: Commit**

```bash
git add src/app
git commit -m "giao diện: hành trình đơn theo trục của từng loại đơn

Stepper và thanh tiến độ trước đây luôn tra vào MAIN_CHAIN nên đơn nhap_kho
và ban_tu_kho ra -1. Dùng journeyTrack(orderType), và chịu được mã trạng
thái đã về hưu còn sót trong lịch sử thay vì vỡ.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# GIAI ĐOẠN 3 — Bấm là ăn ngay

## Task 11: Optimistic UI cho nút đổi trạng thái

**Files:**
- Modify: `src/app/orders/actions.ts` (`changeStatusAction`, ~dòng 171–194)
- Modify: `src/app/orders/[id]/order-journey.tsx` (thành client component)

**Interfaces:**
- Consumes: `changeOrderStatus` từ `@/db/queries`, `allowedNextStatuses` từ `@/lib/order-status`
- Produces: `changeStatusAction(orderId: number, to: OrderStatus): Promise<{ ok: true } | { ok: false; reason: string }>` — **đổi chữ ký**, không còn nhận `FormData` và không còn `redirect`

**Bối cảnh:** đây là điểm đau số 1. Hiện `changeStatusAction` kết thúc bằng `redirect()`, buộc trình duyệt tải lại cả trang (7 query trước Task 2). Với `useOptimistic`, UI đổi ngay còn server chạy ngầm.

- [ ] **Bước 1: Viết lại `changeStatusAction`**

Thay toàn bộ hàm ở `src/app/orders/actions.ts` bằng:

```ts
export type ChangeStatusResultUi =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Không redirect nữa: trả kết quả về client để OrderJourney dùng
 * useOptimistic — bấm là UI đổi ngay, lỗi thì tự bật lại và báo.
 * revalidatePath vẫn gọi để dữ liệu server đồng bộ ở lần render sau.
 */
export async function changeStatusAction(
  orderId: number,
  to: OrderStatus,
): Promise<ChangeStatusResultUi> {
  const session = await getSession();
  if (!session) return { ok: false, reason: "Phiên đăng nhập đã hết hạn." };

  if (!orderId || !(ORDER_STATUSES as readonly string[]).includes(to)) {
    return { ok: false, reason: "Yêu cầu không hợp lệ" };
  }

  const result = await changeOrderStatus(orderId, to, session.username);
  if (!result.ok) return { ok: false, reason: result.reason };

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  return { ok: true };
}
```

- [ ] **Bước 2: Chuyển `order-journey.tsx` thành client component**

Thêm vào **dòng đầu tiên** của file:

```tsx
"use client";
```

- [ ] **Bước 3: Thêm state optimistic**

Ngay đầu thân hàm `OrderJourney`, trước `const track = journeyTrack(orderType);`:

```tsx
  const [optimisticStatus, applyOptimistic] = useOptimistic(status);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function go(to: OrderStatus) {
    setError(null);
    startTransition(async () => {
      applyOptimistic(to);
      const res = await changeStatusAction(orderId, to);
      // Thất bại: React tự bỏ giá trị optimistic khi transition kết thúc,
      // nên chỉ cần hiện lý do.
      if (!res.ok) setError(res.reason);
    });
  }
```

Và sửa import ở đầu file:

```tsx
import { useOptimistic, useState, useTransition } from "react";
import { allowedNextStatuses } from "@/lib/order-status";
```

- [ ] **Bước 4: Dùng trạng thái optimistic để tính lại mọi thứ**

Trong thân hàm, thay mọi chỗ đọc `status` bằng `optimisticStatus`, và tính lại
`nextStatuses` phía client thay vì tin vào prop:

```tsx
  const effectiveStatus = optimisticStatus;
  const effectiveNext = allowedNextStatuses(orderType, effectiveStatus);
  const isBranch = DANGER_STATUSES.has(effectiveStatus);
```

Rồi thay `nextStatuses` bằng `effectiveNext` ở phần dựng nút, và
`positionStatus` giữ nguyên (do server tính từ lịch sử) trừ khi
`effectiveStatus` nằm trên trục — khi đó dùng chính nó:

```tsx
  const effectivePosition = track.includes(effectiveStatus)
    ? effectiveStatus
    : positionStatus;
  const trackPos = track.indexOf(effectivePosition);
```

- [ ] **Bước 5: Đổi `<form action=...>` thành nút gọi `go()`**

Thay khối form + `<button type="submit">` bằng nút thường:

```tsx
              <button
                type="button"
                className="btn journey-primary"
                disabled={isPending}
                onClick={() => go(primary)}
              >
                {STATUS_LABELS[primary]}
              </button>
```

Làm tương tự cho các nút phụ (huỷ / sự cố / khách bom), truyền đúng mã đích vào `go()`.

- [ ] **Bước 6: Hiện lỗi nếu có**

Thêm ngay dưới hàng nút:

```tsx
      {error && (
        <p className="journey-error" role="alert">
          {error}
        </p>
      )}
```

- [ ] **Bước 7: Thêm style cho thông báo lỗi**

Trong `src/app/globals.css`, thêm vào cuối:

```css
.journey-error {
  margin-top: 0.5rem;
  color: #b3261e;
  font-size: 0.875rem;
}
```

- [ ] **Bước 8: Typecheck**

Chạy: `npx tsc --noEmit`
Kỳ vọng: không lỗi. Nếu báo `changeStatusAction` nhận sai tham số → còn chỗ
nào đó vẫn gọi kiểu `FormData` cũ, tìm bằng `grep -rn "changeStatusAction" src/`

- [ ] **Bước 9: Chạy test**

Chạy: `npm test`
Kỳ vọng: tất cả xanh

- [ ] **Bước 10: Xem thật một lần bằng preview**

Mở một đơn, bấm nút tiến bước — trạng thái phải đổi **ngay lập tức**, trang
không nhảy về đầu. Bấm một bước không hợp lệ (nếu dựng được) để xác nhận
thông báo lỗi hiện ra và trạng thái quay lại. Chụp màn hình.

- [ ] **Bước 11: Commit**

```bash
git add src/app/orders/actions.ts "src/app/orders/[id]/order-journey.tsx" src/app/globals.css
git commit -m "tốc độ: bấm đổi trạng thái phản hồi tức thì

changeStatusAction không redirect nữa mà trả kết quả; OrderJourney thành
client component dùng useOptimistic. Trước đây mỗi lần bấm là tải lại cả
trang chi tiết.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# GIAI ĐOẠN 4 — Form tạo đơn

## Task 12: Tách `new-order-form.tsx` thành 4 mảnh

**Files:**
- Create: `src/app/orders/new/zalo-dropzone.tsx`
- Create: `src/app/orders/new/customer-block.tsx`
- Create: `src/app/orders/new/items-block.tsx`
- Create: `src/app/orders/new/money-block.tsx`
- Modify: `src/app/orders/new/new-order-form.tsx` (còn lại phần điều phối)

**Interfaces:**
- Consumes: `createOrderAction` từ `../actions`, các type sẵn có trong file gốc
- Produces — 4 component, mỗi cái nhận state qua props (state vẫn do `new-order-form.tsx` giữ, tránh phải dựng context):
  - `<ZaloDropzone onExtract={(order: ZaloExtract, rawTotal: number | null) => void | Promise<void>} />` — `ZaloExtract` import từ `@/lib/zalo-extract` (tên chính xác, **không** phải `ZaloExtractResult`)
  - `<CustomerBlock mode customerId onModeChange onCustomerIdChange name phone address onNameChange onPhoneChange onAddressChange customers />`
  - `<ItemsBlock items={ItemRow[]} onChange={(items: ItemRow[]) => void} />`
  - `<MoneyBlock exchangeRate quotedTotal shipStatus shippingFee deposit on*Change />`

**Bối cảnh:** file đang **721 dòng** với ~20 `useState`, ôm cả 5 khối. Tách để mỗi mảnh một việc — vừa dễ đọc, vừa để Task 13 và 14 sửa mà không phải nuốt cả file.

- [ ] **Bước 1: Đọc file gốc, xác định ranh giới từng khối**

Chạy: `grep -n "card-title\|^  const \[\|^  function \|^  async function " src/app/orders/new/new-order-form.tsx`

Ghi lại: khối Zalo bắt đầu ~dòng 357, Khách hàng ~477, Tính tiền ~569, Sản phẩm ~645, Ghi chú ~705.

- [ ] **Bước 2: Trích type dùng chung ra chỗ ai cũng import được**

Tạo `src/app/orders/new/types.ts`:

```ts
export type ItemRow = {
  name: string;
  link: string;
  variant: string;
  quantity: string;
  unitPriceCny: string;
};

export const emptyItem: ItemRow = {
  name: "",
  link: "",
  variant: "",
  quantity: "1",
  unitPriceCny: "",
};

export type CustomerOption = { id: number; name: string };
```

Rồi trong `new-order-form.tsx` bỏ định nghĩa `ItemRow`/`emptyItem` cũ và import từ `./types`.

- [ ] **Bước 3: Tạo `items-block.tsx`**

```tsx
"use client";

import type { ItemRow } from "./types";
import { emptyItem } from "./types";

/**
 * Danh sách dòng sản phẩm. Không giữ state riêng — cha truyền `items` xuống
 * và nhận `onChange` lên, để một nguồn chân lý duy nhất nằm ở form.
 */
export function ItemsBlock({
  items,
  onChange,
}: {
  items: ItemRow[];
  onChange: (items: ItemRow[]) => void;
}) {
  function patch(i: number, field: keyof ItemRow, value: string) {
    onChange(items.map((it, idx) => (idx === i ? { ...it, [field]: value } : it)));
  }

  return (
    <section className="card">
      <h2 className="card-title">Sản phẩm</h2>
      {items.map((it, i) => (
        <div className="item-row" key={i}>
          <input
            placeholder="Tên hàng *"
            value={it.name}
            onChange={(e) => patch(i, "name", e.target.value)}
          />
          <input
            placeholder="Link"
            value={it.link}
            onChange={(e) => patch(i, "link", e.target.value)}
          />
          <input
            placeholder="Size/màu"
            value={it.variant}
            onChange={(e) => patch(i, "variant", e.target.value)}
          />
          <input
            placeholder="SL"
            value={it.quantity}
            onChange={(e) => patch(i, "quantity", e.target.value)}
          />
          <input
            placeholder="Đơn giá"
            value={it.unitPriceCny}
            onChange={(e) => patch(i, "unitPriceCny", e.target.value)}
          />
          <button
            type="button"
            aria-label="Xoá dòng"
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, { ...emptyItem }])}>
        + Thêm dòng
      </button>
    </section>
  );
}
```

> Giữ đúng tên class CSS đang dùng trong file gốc. Nếu file gốc dùng tên khác
> `item-row`, dùng tên đó — **không** đổi CSS ở task này.

- [ ] **Bước 4: Tạo `customer-block.tsx`, `money-block.tsx`, `zalo-dropzone.tsx`**

Ranh giới cắt là **chính xác** — mỗi khối là một `<section>` liền mạch trong
file gốc (kiểm lại bằng `grep -n "card-title" src/app/orders/new/new-order-form.tsx`):

| Component mới | Dòng trong file gốc | Nội dung |
|---|---|---|
| `zalo-dropzone.tsx` | **356–473** | `<section className="card zalo-reader">` |
| `customer-block.tsx` | **476–566** | `<section className="card">` — Khách hàng |
| `money-block.tsx` | **568–641** | `<section className="card">` — Tính tiền |
| `items-block.tsx` | **644–702** | Sản phẩm — đã viết ở Bước 3 |
| *(giữ ở form cha)* | **704–707** | Ghi chú — chỉ 1 `<textarea>`, không đáng tách |

Cách làm cho mỗi file: cắt nguyên khối JSX sang, thêm `"use client";` ở đầu,
rồi với mỗi biến state mà JSX đó đọc — chuyển thành **prop giá trị**; mỗi
`setXxx` mà nó gọi — chuyển thành **prop callback `onXxxChange`**. Không giữ
`useState` trong component con, để một nguồn chân lý duy nhất nằm ở form cha
(xem `ItemsBlock` ở Bước 3 làm mẫu về hình dạng props).

**Ngoại lệ — `zalo-dropzone.tsx` được giữ state riêng:** bốn biến `zaloBusy`,
`zaloError`, `zaloInfo`, `zaloDragOver` chỉ phục vụ chính nó, form cha không
bao giờ đọc. Chuyển hẳn `useState` của chúng vào file mới, cùng với các hàm
`readPendingFiles`, `removePhoto` và phần gọi `/api/upload` + `/api/read-zalo`.
Nó chỉ báo ra ngoài đúng một việc — đọc ảnh xong thì trả kết quả:

```tsx
export function ZaloDropzone({
  onExtract,
}: {
  onExtract: (order: ZaloExtract, rawTotal: number | null) => void | Promise<void>;
}) {
```

Form cha nối vào hàm `applyItemsFromExtract` sẵn có (dòng 123 file gốc):

```tsx
      <ZaloDropzone onExtract={applyItemsFromExtract} />
```

> **Không gọi Gemini để thử trong lúc tách file.** Đây là refactor thuần —
> kiểm chứng bằng typecheck và mở trang xem giao diện, không bấm nút đọc ảnh.

- [ ] **Bước 5: Rút gọn `new-order-form.tsx` thành phần điều phối**

Giữ lại: toàn bộ `useState` của dữ liệu đơn, `useActionState`, hàm
`applyItemsFromExtract`, và JSX chỉ còn ghép 4 component + khối Ghi chú + nút Lưu.

- [ ] **Bước 6: Kiểm tra file gốc đã ngắn hẳn**

Chạy: `wc -l src/app/orders/new/*.tsx`
Kỳ vọng: `new-order-form.tsx` **dưới 300 dòng**, mỗi file mới dưới 200 dòng

- [ ] **Bước 7: Typecheck**

Chạy: `npx tsc --noEmit`
Kỳ vọng: không lỗi

- [ ] **Bước 8: Xem thật một lần bằng preview**

Mở `/orders/new`, xác nhận form hiển thị y như trước khi tách (đây là refactor
thuần, không được đổi hành vi). Chụp màn hình.

- [ ] **Bước 9: Commit**

```bash
git add src/app/orders/new
git commit -m "gọn: tách form tạo đơn 721 dòng thành 4 khối

zalo-dropzone, customer-block, items-block, money-block. State vẫn nằm ở
form cha để giữ một nguồn chân lý duy nhất. Refactor thuần, không đổi hành vi.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 13: Dán ảnh chốt đơn bằng `Ctrl+V`

**Files:**
- Modify: `src/app/orders/new/zalo-dropzone.tsx`

**Interfaces:**
- Consumes: `ZaloDropzone` props từ Task 12; endpoint `POST /api/upload` và `POST /api/read-zalo` đã có
- Produces: không đổi props

**Bối cảnh:** spec mục 5.1 — ảnh Zalo là **đường chính** để tạo đơn. Hiện phải bấm chọn file, trong khi thao tác tự nhiên nhất sau khi chụp màn hình Zalo là dán thẳng.

- [ ] **Bước 1: Thêm handler dán vào `ZaloDropzone`**

Trong `zalo-dropzone.tsx`, thêm `useEffect` bắt sự kiện `paste` ở cấp document:

```tsx
  /**
   * Bắt Ctrl+V ở cấp document: sau khi chụp màn hình Zalo, thao tác tự nhiên
   * nhất là dán thẳng, không phải bấm chọn file. Chỉ nhận khi con trỏ KHÔNG
   * nằm trong ô nhập liệu — tránh cướp Ctrl+V lúc người dùng đang dán tên
   * khách hay link sản phẩm.
   */
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return;
      }

      const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (files.length === 0) return;

      e.preventDefault();
      void handleFiles(files);
    }

    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);
```

`handleFiles(files: File[])` là hàm đã có sẵn xử lý ảnh thả vào (tìm bằng
`grep -n "function handleFiles\|readPendingFiles\|onDrop" src/app/orders/new/zalo-dropzone.tsx`).
Nếu tên khác, gọi đúng tên đó.

- [ ] **Bước 2: Thêm `useEffect` vào import React**

```tsx
import { useEffect, useState } from "react";
```

- [ ] **Bước 3: Sửa chữ hướng dẫn trong vùng thả**

Đổi dòng chữ hiện tại thành:

```tsx
        <p className="dropzone-hint">
          Kéo thả ảnh vào đây, <strong>dán bằng Ctrl+V</strong>, hoặc bấm để chọn file
        </p>
```

- [ ] **Bước 4: Typecheck**

Chạy: `npx tsc --noEmit`
Kỳ vọng: không lỗi

- [ ] **Bước 5: Xem thật một lần bằng preview**

Mở `/orders/new`, chụp màn hình bất kỳ vào clipboard, bấm `Ctrl+V` khi con trỏ
**không** ở trong ô nhập. Xác nhận ảnh vào vùng thả.

> **KHÔNG được để nó gọi Gemini thật.** Nếu việc dán tự động kích hoạt
> `/api/read-zalo`, chỉ làm **một lần duy nhất** rồi dừng. Gặp 429 → dừng
> hẳn, báo người dùng.

Rồi bấm vào một ô nhập, dán chữ — xác nhận chữ vào ô như bình thường,
dropzone không cướp phím.

- [ ] **Bước 6: Commit**

```bash
git add src/app/orders/new/zalo-dropzone.tsx
git commit -m "nhập đơn: dán ảnh chốt đơn bằng Ctrl+V

Chỉ nhận khi con trỏ không nằm trong ô nhập, để không cướp Ctrl+V lúc đang
dán tên khách hay link sản phẩm.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 14: Rút còn 3 ô bắt buộc

**Files:**
- Modify: `src/app/orders/new/new-order-form.tsx`
- Modify: `src/app/orders/new/customer-block.tsx`, `money-block.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: 4 component từ Task 12
- Produces: không đổi props

**Bối cảnh:** spec mục 5.2. Bắt buộc chỉ còn **Tên khách · Sản phẩm · Total đã chốt**. Mọi thứ khác gập vào khối "Thêm chi tiết" đóng sẵn, và thiếu gì thì `orderGaps` nhắc sau — cơ chế đó đã chạy sẵn, **không phải viết mới**.

- [ ] **Bước 1: Bỏ `required` khỏi ô tỷ giá**

Trong `money-block.tsx`, ô Tỷ giá đang có nhãn `Tỷ giá (VND / tệ) *` và
thuộc tính `required`. Bỏ cả hai — giá trị mặc định đã lấy từ bảng `settings`
(`defaultExchangeRate` truyền từ trang).

- [ ] **Bước 2: Gói SĐT + địa chỉ vào khối gập**

Trong `customer-block.tsx`, bọc hai ô SĐT và Địa chỉ:

```tsx
      <details className="more-fields">
        <summary>Thêm chi tiết khách</summary>
        <div className="field">
          <label>SĐT / Zalo</label>
          <input
            name="newCustomerPhone"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            placeholder="09..."
          />
        </div>
        <div className="field">
          <label>Địa chỉ giao</label>
          <input
            name="newCustomerAddress"
            value={address}
            onChange={(e) => onAddressChange(e.target.value)}
          />
        </div>
      </details>
```

- [ ] **Bước 3: Gói ship + cọc + tỷ giá + loại đơn vào khối gập**

Trong `money-block.tsx`, giữ **Total đã chốt** ở ngoài, bọc phần còn lại:

```tsx
      <details className="more-fields">
        <summary>Tỷ giá, phí ship, tiền cọc</summary>
        {/* ... các ô tỷ giá, shipStatus, shippingFee, deposit giữ nguyên ... */}
      </details>
```

Khối chọn Loại đơn trong `new-order-form.tsx` cũng cho vào một `<details>`
tương tự, `summary` là `Loại đơn (mặc định: Order hộ)`.

- [ ] **Bước 4: Thêm style cho khối gập**

Trong `src/app/globals.css`:

```css
.more-fields {
  margin-top: 0.75rem;
  border-top: 1px solid var(--line, #e5e0d8);
  padding-top: 0.75rem;
}

.more-fields > summary {
  cursor: pointer;
  font-size: 0.875rem;
  opacity: 0.75;
  list-style: none;
}

.more-fields > summary::before {
  content: "＋ ";
}

.more-fields[open] > summary::before {
  content: "－ ";
}
```

- [ ] **Bước 5: Kiểm tra chỉ còn đúng 3 ô bắt buộc**

Chạy: `grep -rn "required" src/app/orders/new/`
Kỳ vọng: chỉ còn ở **tên khách** và **tên hàng**. (Total đã chốt kiểm tra ở
tầng action chứ không dùng `required` — xác nhận `createOrderAction` trong
`src/app/orders/actions.ts` đã validate qua `validateOrderMoney`.)

- [ ] **Bước 6: Typecheck**

Chạy: `npx tsc --noEmit`
Kỳ vọng: không lỗi

- [ ] **Bước 7: Chạy toàn bộ test**

Chạy: `npm test`
Kỳ vọng: tất cả xanh

- [ ] **Bước 8: Xem thật một lần bằng preview — kiểm chứng đầu-cuối**

Mở `/orders/new`, chỉ điền **Tên khách + 1 dòng sản phẩm + Total**, bấm Lưu.
Kỳ vọng: đơn tạo được, vào thẳng trạng thái **Khách chốt**, và ở danh sách đơn
có **chấm cảnh báo** nhắc thiếu SĐT/địa chỉ/ảnh sản phẩm. Chụp màn hình.

- [ ] **Bước 9: Commit**

```bash
git add src/app/orders/new src/app/globals.css
git commit -m "nhập đơn: chỉ còn 3 ô bắt buộc, phần còn lại gập lại

Tên khách, sản phẩm, Total đã chốt. SĐT, địa chỉ, tỷ giá, ship, cọc, loại
đơn cho vào details đóng sẵn — thiếu gì thì orderGaps nhắc sau, cơ chế đó
đã chạy sẵn.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 15: Cập nhật `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: kết quả của mọi task trước
- Produces: tài liệu khớp với code

**Bối cảnh:** spec mục 11. `CLAUDE.md` là thứ nạp vào đầu mỗi phiên làm việc — sai chỗ nào là mọi phiên sau đều tin theo chỗ sai đó.

- [ ] **Bước 1: Sửa mục Hosting**

Đổi mọi chỗ nói region Supabase từ Sydney sang **Singapore (`ap-southeast-1`)**,
ghi thêm độ trễ đo được ở Task 5 Bước 9. Ghi rõ đã ghim Vercel `sin1` bằng
`vercel.json` và **vì sao** (function phải cùng vùng AWS với DB).

- [ ] **Bước 2: Sửa mục "Nghiệp vụ cốt lõi" — trạng thái**

Thay đoạn mô tả trục 9 bước bằng:

```markdown
- **Trạng thái** (`src/lib/order-status.ts`): **mỗi loại đơn một trục riêng** (v4).
  `order_ho`: Khách chốt → Đã mua, đang về → Đã giao khách → Hoàn tất.
  `nhap_kho`: Đã mua, đang về → Về kho. `ban_tu_kho`: Đã giao khách → Hoàn tất.
  Tiến đúng 1 bước trên trục; nhánh `huy` (chỉ từ Khách chốt) / `su_co` / `khach_bom`.
  **Bốn mã đã về hưu** (`cho_bao_gia`, `da_bao_gia`, `ve_kho_tq`,
  `dang_van_chuyen_vn`) vẫn nằm trong `ORDER_STATUSES` để đọc được
  `order_status_history` cũ — đừng xoá, UI hành trình sẽ vỡ.
  `changeOrderStatus` có side-effect tồn kho và ví ¥ (xem mục gotchas).
```

- [ ] **Bước 3: Thêm 2 gotcha mới**

Vào mục "LƯU Ý QUAN TRỌNG":

```markdown
- **Tái dùng mã trạng thái là có chủ đích** — `da_mua_tq` giờ mang nghĩa "Đã
  mua, đang về" (gộp 4 khâu vận chuyển cũ) và `ve_kho_vn` là điểm kết của đơn
  `nhap_kho`. Giữ đúng hai mã này vì ba side-effect tiền/kho neo vào chúng
  (`queries.ts`: trừ ví ¥ ở `da_mua_tq`, cộng tồn ở `ve_kho_vn`, nhập hàng bom
  ở `khach_bom`). Đổi tên mã = phải viết lại side-effect.
- **Tự động hoàn tất PHẢI đi qua `changeOrderStatus`** (`autoCompleteIfPaid`
  trong `src/db/queries.ts`), không `UPDATE orders SET status` thẳng — báo cáo
  lãi đọc ngày hoàn tất từ `order_status_history`. Và phải gọi **ngoài**
  `withTx` vì `changeOrderStatus` tự mở transaction riêng.
```

- [ ] **Bước 4: Sửa câu đã lỗi thời về dữ liệu**

Tìm: `grep -n "app.sqlite\|dữ liệu thật đã chuyển" CLAUDE.md`

Thay câu nói *"dữ liệu thật đã chuyển sang Supabase 14/08"* bằng:

```markdown
- **`data/app.sqlite` là bản lùi lịch sử** (KHÔNG phải nguồn dữ liệu chính) —
  giữ lại phòng khi cần đối chiếu, đừng xoá. Dữ liệu chạy thử trên Supabase đã
  được xoá sạch ngày 20/08 (bản sao lưu ở `backups/pre-clear-2026-08-20T16-56-09/`),
  chỉ giữ lại 2 dòng `settings`.
```

- [ ] **Bước 5: Cập nhật mục Tài liệu**

Thêm 2 dòng:

```markdown
- Thiết kế v4 (tốc độ & luồng đơn): `docs/superpowers/specs/2026-08-20-heyp-toc-do-va-luong-don-design.md`
- Kế hoạch v4: `docs/superpowers/plans/2026-08-21-heyp-toc-do-va-luong-don.md`
```

- [ ] **Bước 6: Cập nhật dòng trạng thái đầu file**

Thêm vào cuối đoạn **Trạng thái**: `**v4 xong** — trục trạng thái 4 bước, tự
động hoàn tất, form tạo đơn 3 ô, DB Singapore + Vercel sin1.`

- [ ] **Bước 7: Kiểm tra lần cuối toàn bộ**

Chạy: `npx tsc --noEmit && npm test`
Kỳ vọng: không lỗi, tất cả test xanh

- [ ] **Bước 8: Commit và push**

```bash
git add CLAUDE.md
git commit -m "tài liệu: cập nhật CLAUDE.md theo v4

Region Singapore + ghim sin1, trục trạng thái 4 bước theo từng loại đơn,
gotcha về tái dùng mã trạng thái và luật tự động hoàn tất, sửa câu đã lỗi
thời về dữ liệu trên Supabase.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push -u origin design/toc-do-va-luong-don
```

---

## Nghiệm thu cuối

Sau Task 15, kiểm chứng lại đúng 5 mục tiêu của spec:

| Mục tiêu | Cách kiểm |
|---|---|
| M1 — chi tiết đơn ≤ 200 ms | Mở DevTools → Network → xem TTFB của `/orders/<id>` trên bản deploy |
| M2 — bấm không phải chờ | Bấm tiến bước, trạng thái đổi ngay, trang không nhảy về đầu |
| M3 — 2 lần bấm mỗi đơn | Tạo đơn → bấm "Đã mua, đang về" → bấm "Đã giao khách" → thu đủ tiền → tự Hoàn tất |
| M4 — 3 ô bắt buộc | `grep -rn "required" src/app/orders/new/` chỉ còn tên khách và tên hàng |
| M5 — không đụng công thức tiền | `git diff main --stat -- tests/` **không** có 6 file tiền/kho trong Global Constraints |
