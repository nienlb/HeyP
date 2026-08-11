# Thư mục `.claude/`

Cấu hình dành cho Claude Code trong dự án này.

- **`launch.json`** — khai báo dev server để công cụ preview của Claude Code chạy/mở app (`npm run dev`, port 3000). Dùng preview này thay vì chạy server bằng lệnh shell.

## Lưu ý / "memory" của dự án

Các quy ước và điểm cần lưu ý khi làm việc trong repo nằm ở **`CLAUDE.md` tại gốc repo** — Claude Code tự nạp file này mỗi phiên. Đọc nó trước khi sửa code (đặc biệt: dùng `node:sqlite` không dùng better-sqlite3, cách viết/áp migration, transaction, gotcha instrumentation/edge, và **không reset DB đang có dữ liệu thật**).

> Ghi chú: bộ nhớ cá nhân của Claude (persist qua nhiều phiên) nằm ở `~/.claude/projects/…/memory/` trên máy — đó là vùng global của máy, **không** thuộc repo và không lên git. `CLAUDE.md` ở đây mới là "trí nhớ dự án" được version-control và chia sẻ.
