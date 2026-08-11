/**
 * Khôi phục dữ liệu từ một bản sao lưu (GHI ĐÈ dữ liệu hiện tại!).
 *   npm run db:restore -- --list        # xem các bản sao lưu
 *   npm run db:restore                   # khôi phục bản mới nhất
 *   npm run db:restore -- backup-2026-... # khôi phục bản cụ thể
 */
import { listBackups, restoreBackup } from "../src/lib/backup.ts";

const arg = process.argv[2];

if (arg === "--list") {
  const list = listBackups();
  if (list.length === 0) console.log("(chưa có bản sao lưu nào)");
  for (const b of list) console.log(b.name, "·", b.at.toLocaleString("vi-VN"));
  process.exit(0);
}

const r = restoreBackup(arg);
if (r.ok) console.log(`✓ Đã khôi phục từ: ${r.name}`);
else console.error(`✗ Lỗi khôi phục: ${r.error}`);
process.exit(r.ok ? 0 : 1);
