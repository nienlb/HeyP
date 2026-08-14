# Hướng dẫn vận hành: HeyP trên Vercel + Supabase

Ngày chuyển: 14/08/2026. Xem kế hoạch triển khai đầy đủ (19 task, có code từng bước): `docs/superpowers/plans/2026-08-14-migrate-vercel-supabase.md`.

## Dữ liệu nằm ở đâu

- **Database:** Postgres trên Supabase, project `heyP-project` (region Sydney, ap-southeast-2).
- **Ảnh:** Supabase Storage, bucket `photos` (private — chỉ truy cập được qua route đã đăng nhập `/api/photo/[id]`, không có URL public).
- **`data/app.sqlite` trong repo:** bản lùi lịch sử tại thời điểm chuyển hosting, không còn là nguồn dữ liệu chính. Giữ lại phòng khi cần đối chiếu.

## Xem và tải bản sao lưu

Supabase free tier **không có backup tự động**. Backup hằng ngày chạy bằng GitHub Actions:

1. Mở repo trên GitHub → tab **Actions** → workflow **db-backup**.
2. Chọn lần chạy gần nhất (chạy tự động 01:00 giờ VN mỗi ngày, hoặc bấm **Run workflow** để chạy tay).
3. Tải file trong mục **Artifacts** (`heyp-db-dump`) — giữ 30 ngày gần nhất.

Ảnh trong Storage không nằm trong bản dump này — tải trực tiếp từ Supabase Dashboard → Storage → bucket `photos` khi cần.

## Khôi phục dữ liệu

```bash
# Cài psql nếu chưa có (macOS):
brew install libpq && export PATH="/opt/homebrew/opt/libpq/bin:$PATH"

# Khôi phục (GHI ĐÈ dữ liệu hiện tại — cân nhắc kỹ trước khi chạy):
psql "$DIRECT_URL" -f duong-dan-file-dump.sql
```

`$DIRECT_URL` lấy từ `.env` (dòng `DIRECT_URL=...`) hoặc từ GitHub Secrets nếu chạy trên CI.

## Khi Supabase tự pause project

Free tier tự tạm dừng project sau **7 ngày không có request** tới database. Workflow `tracking-sweep` (chạy mỗi 4h) thường đủ để giữ project sống. Nếu vẫn bị pause (ví dụ workflow bị tắt):

1. Vào [supabase.com/dashboard](https://supabase.com/dashboard) → mở project `heyP-project`.
2. Dashboard sẽ hiện nút **Restore project** — bấm và chờ vài phút.
3. Dữ liệu **không mất** khi pause/unpause, chỉ tạm ngưng truy cập.

## Ngưỡng free tier cần theo dõi

Xem trực tiếp trên Supabase Dashboard → **Project Settings → Usage**, hoặc trang tổng quan project (mục "Free plan usage").

| Chỉ số | Trần free tier | Ghi chú |
|---|---|---|
| Database size | 500 MB | Tại thời điểm chuyển: ~76 KB — rất xa trần |
| File storage | 1 GB | Tại thời điểm chuyển: ~2.3 MB (10 ảnh) — rất xa trần |
| Egress (băng thông) | 5 GB/tháng | Theo dõi nếu lượng ảnh/đơn tăng nhanh |
| Monthly active users | 50.000 | Không liên quan (app chỉ 2 tài khoản cố định, không dùng Supabase Auth) |

Nếu database size hoặc storage tiến gần trần, cân nhắc: dọn ảnh cũ không cần thiết, hoặc nâng cấp Supabase Pro ($25/tháng, 8GB database).

## Lưu ý ToS Vercel Hobby

Gói Hobby chỉ dành cho mục đích **non-commercial, personal**. HeyP vận hành business thật (đơn hàng, tiền, khách) — về câu chữ ToS đây là dùng cho mục đích thương mại. Rủi ro thấp trong thực tế nhưng có thật; muốn chắc chân thì nâng cấp Vercel Pro ($20/tháng/seat).

## Biến môi trường cần có trên Vercel

Xem đầy đủ trong `.env.example`. Quan trọng nhất:

- `DATABASE_URL` — Transaction pooler (port 6543)
- `DIRECT_URL` — Session pooler (port 5432), dùng cho migration
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`
- `SESSION_SECRET` — chuỗi ngẫu nhiên thật, không dùng giá trị mặc định
- `CRON_SECRET` — phải khớp với GitHub Secret cùng tên
- `APP_ACCOUNTS`, `STALE_ORDER_DAYS`, `GEMINI_API_KEY`, `GEMINI_MODEL`

## GitHub Secrets cần có (cho 2 workflow trong `.github/workflows/`)

- `CRON_SECRET` — khớp với biến môi trường trên Vercel
- `DIRECT_URL` — connection string Session pooler
- `APP_URL` — URL production trên Vercel (không có dấu `/` ở cuối)
