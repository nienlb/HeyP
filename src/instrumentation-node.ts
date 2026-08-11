/**
 * Phần Node của instrumentation — chỉ được nạp trong runtime nodejs.
 * Bật interval quét tracking mỗi TRACKING_SWEEP_MINUTES phút (spec: 240 = 4 tiếng).
 * Đặt 0 để tắt (khi lên VPS dùng cron ngoài gọi POST /api/cron/track).
 */
import { runTrackingSweep } from "@/db/queries";
import { backupIfNeeded } from "@/lib/backup";

const g = globalThis as unknown as { __heypSweepStarted?: boolean };

function unref(t: unknown) {
  (t as { unref?: () => void }).unref?.();
}

if (!g.__heypSweepStarted) {
  g.__heypSweepStarted = true; // tránh đăng ký lại khi HMR

  // Tracking: quét mỗi N phút.
  const minutes = Number(process.env.TRACKING_SWEEP_MINUTES ?? "240");
  if (minutes > 0) {
    unref(
      setInterval(() => {
        runTrackingSweep().catch(() => {});
      }, minutes * 60 * 1000),
    );
    console.log(`[tracking] job nền bật — quét mỗi ${minutes} phút`);
  }

  // Sao lưu: chạy khi khởi động (nếu bản gần nhất đã cũ) + mỗi ngày một lần.
  const r = backupIfNeeded();
  if ("skipped" in r) console.log("[backup] còn mới, bỏ qua khi khởi động");
  else if (r.ok) console.log(`[backup] đã sao lưu khi khởi động: ${r.name}`);
  else console.log(`[backup] lỗi khi khởi động: ${r.error}`);
  unref(
    setInterval(
      () => {
        backupIfNeeded();
      },
      24 * 60 * 60 * 1000,
    ),
  );
}
