/**
 * Phần Node của instrumentation — chỉ được nạp trong runtime nodejs.
 * Bật interval quét tracking mỗi TRACKING_SWEEP_MINUTES phút (spec: 240 = 4 tiếng).
 * Đặt 0 để tắt (khi lên VPS dùng cron ngoài gọi POST /api/cron/track).
 */
import { runTrackingSweep } from "@/db/queries";

const g = globalThis as unknown as { __heypSweepStarted?: boolean };

if (!g.__heypSweepStarted) {
  g.__heypSweepStarted = true; // tránh đăng ký lại khi HMR

  const minutes = Number(process.env.TRACKING_SWEEP_MINUTES ?? "240");
  if (minutes > 0) {
    const timer = setInterval(
      () => {
        runTrackingSweep().catch(() => {});
      },
      minutes * 60 * 1000,
    );
    // Không giữ tiến trình sống chỉ vì timer này.
    (timer as { unref?: () => void }).unref?.();
    console.log(`[tracking] job nền bật — quét mỗi ${minutes} phút`);
  }
}
