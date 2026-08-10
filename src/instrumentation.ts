/**
 * Job nền tra tracking (spec mục 8). Chỉ nạp phần Node (dùng node:sqlite/node:fs)
 * trong runtime nodejs — tránh webpack bundle node: builtins cho edge.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
