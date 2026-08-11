# HeyP — hệ thống quản lý đơn order hộ

Ứng dụng nội bộ (2 người dùng) quản lý dịch vụ **order hộ hàng Trung Quốc** cho shop HeyP (bán giày/dép/thời trang): báo giá → chốt đơn → mua hộ → gom kho → vận chuyển về VN → giao khách → thu tiền. Kèm bán hàng tồn kho và đọc ảnh chốt đơn Zalo bằng AI.

**Trạng thái:** MVP xong (Phase 0–7). Đang chuẩn bị **v2** — thiết kế lại giao diện (sidebar + mobile). Spec: `docs/2026-08-11-heyp-v2-ui-redesign-design.md`.

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**. `package.json` có `"type": "module"`.
- **SQLite qua `node:sqlite`** (built-in của Node) + **Drizzle ORM** (driver `sqlite-proxy`). CSS **thuần** (`src/app/globals.css`), không framework UI.
- **Node 26**. Test bằng `node:test` built-in (không có thư viện test).

## Lệnh hay dùng

```bash
npm run dev            # chạy dev (port 3000)
npm test               # unit test (node --test 'tests/**/*.test.ts')
npx tsc --noEmit       # typecheck
npm run db:migrate     # áp migration SQL trong drizzle/
npm run db:seed-demo   # tạo dữ liệu demo
npm run db:backup      # sao lưu thủ công
npm run db:restore -- --list   # xem/khôi phục backup
```

Chạy dev **không** dùng lệnh shell trực tiếp — dùng công cụ preview của harness (xem `.claude/launch.json`).

## LƯU Ý QUAN TRỌNG (gotchas — đọc trước khi sửa)

- **Dùng `node:sqlite`, KHÔNG dùng `better-sqlite3`** — better-sqlite3 không build được trên Node 26. Đừng thêm lại.
- **Đọc/ghi DB:** ĐỌC bằng Drizzle (`db` trong `src/db/index.ts`); GHI có transaction bằng `sqlite` (DatabaseSync) thô — vì sqlite-proxy async không hỗ trợ transaction. Xem `src/db/queries.ts`.
- **`node:sqlite` bind số JS thành REAL** → nối chuỗi trong SQL cho ra `"2.0"`. Dựng chuỗi trong JS rồi truyền tham số, đừng `|| số ||` trong SQL.
- **Migration:** viết tay SQL trong `drizzle/*.sql`, áp bằng `npm run db:migrate` (`scripts/migrate.ts`, có bảng `_migrations`). **KHÔNG** dùng `drizzle-kit migrate/push` (esbuild bị chặn install-script). `db:generate` cần esbuild nên có thể lỗi.
- **`src/db/schema.ts` dùng alias `@/`** → chỉ Next/tsc nạp được. Script chạy bằng `node` KHÔNG import được schema → phải viết SQL thô.
- **Test import module bằng đuôi `.ts` tường minh** (vd `../src/lib/money.ts`); `tsconfig` đã bật `allowImportingTsExtensions`. Module thuần dùng cho test không được import file khác có alias `@/`.
- **Job nền / instrumentation:** code dùng `node:*` phải nằm trong `src/instrumentation-node.ts` và chỉ import khi `NEXT_RUNTIME==='nodejs'` — nếu để trong `instrumentation.ts` sẽ vỡ build **edge** (webpack không xử lý `node:fs`).
- **KHÔNG `rm data/app.sqlite` để reset** — DB đang có **dữ liệu thật** của Niên. Chỉ xoá chọn lọc bằng SQL.
- **`.env` gitignored** (chứa `GEMINI_API_KEY`, `SESSION_SECRET`). Mọi cấu hình đọc từ env qua `src/lib/config.ts`. Mẫu ở `.env.example`.
- **Backups & uploads** gitignored (`/backups/`, `/uploads/`).

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
- Cấu hình sẵn sàng lên VPS chỉ bằng đổi `.env` (không hard-code đường dẫn/khoá).

## Tài liệu

- Thiết kế gốc MVP: `docs/2026-08-10-heyp-system-design.md`
- Kế hoạch MVP: `docs/2026-08-10-heyp-system-implementation-plan.md`
- Nghiệm thu MVP: `docs/2026-08-10-heyp-system-acceptance-checklist.md`
- Mẫu chốt đơn Zalo thật: `docs/reference-heyp-chot-don-template.md`
- Thiết kế v2 (đang làm): `docs/2026-08-11-heyp-v2-ui-redesign-design.md`
