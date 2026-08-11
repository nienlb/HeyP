/** Sao lưu thủ công. Chạy: npm run db:backup */
import { runBackup } from "../src/lib/backup.ts";

const r = runBackup();
if (r.ok) console.log(`✓ Đã sao lưu: ${r.name}`);
else console.error(`✗ Lỗi sao lưu: ${r.error}`);
process.exit(r.ok ? 0 : 1);
