"use client";

import { PROBE_TIMEOUT_MS } from "@/lib/ui-timeouts";
import type { HealthReport } from "@/app/api/health/route";

/** Kết luận đủ để quyết định NÓI GÌ với người dùng. */
export type Diagnosis = "expired" | "db-down" | "server-slow" | "offline";

/**
 * Hỏi /api/health xem vì sao màn hình đứng.
 *
 * Tự bỏ cuộc sau PROBE_TIMEOUT_MS: nếu chính lời gọi chẩn đoán cũng treo thì
 * kết luận "không với tới được máy chủ" đã là câu trả lời đúng rồi — chờ tiếp
 * chỉ làm người dùng nhìn spinner lâu thêm mà không biết gì hơn.
 *
 * Dùng AbortController thủ công thay cho AbortSignal.timeout() để chạy được
 * trên Safari iOS đời cũ hơn — app này sống chủ yếu trong PWA trên iPhone.
 */
export async function probeHealth(): Promise<Diagnosis> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch("/api/health", {
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) return "server-slow";
    const report = (await res.json()) as HealthReport;
    if (report.session === "expired") return "expired";
    if (report.db === "error") return "db-down";
    return "server-slow";
  } catch {
    // Hết hạn, mất mạng, hoặc máy chủ không trả lời — với người dùng thì ba
    // thứ này cùng một cách xử lý, nên gộp làm một.
    return "offline";
  } finally {
    clearTimeout(timer);
  }
}

const COPY: Record<Diagnosis, { title: string; detail: string }> = {
  expired: {
    title: "Phiên đăng nhập đã hết hạn",
    detail:
      "Bạn cần đăng nhập lại. Dữ liệu đang nhập dở trên màn hình trước sẽ không được lưu.",
  },
  "db-down": {
    title: "Máy chủ dữ liệu đang bận",
    detail:
      "Phiên đăng nhập của bạn vẫn còn — chỉ là kho dữ liệu chưa trả lời. Thử tải lại sau vài giây.",
  },
  "server-slow": {
    title: "Máy chủ trả lời chậm",
    detail:
      "Phiên đăng nhập và dữ liệu đều bình thường, chỉ là lần tải này lâu hơn thường lệ.",
  },
  offline: {
    title: "Không kết nối được máy chủ",
    detail:
      "Kiểm tra sóng hoặc Wi-Fi trên máy, rồi thử lại. Nếu mạng vẫn tốt thì máy chủ đang gặp sự cố.",
  },
};

/**
 * Bảng "chuyện gì đang xảy ra + làm gì bây giờ".
 *
 * Nút đây cố ý là thẻ <a> và window.location, KHÔNG phải <Link> của Next:
 * bảng này chỉ xuất hiện khi điều hướng phía client đã hỏng, nên cách chữa
 * phải là nạp lại cả trang từ đầu chứ không phải nhờ đúng cái router đang kẹt.
 */
export function RecoveryPanel({
  diagnosis,
  className,
}: {
  /** null = đang chẩn đoán, chưa có kết luận. */
  diagnosis: Diagnosis | null;
  className?: string;
}) {
  if (!diagnosis) {
    return (
      <p className={`recovery-probing${className ? " " + className : ""}`}>
        Đang kiểm tra kết nối…
      </p>
    );
  }

  const { title, detail } = COPY[diagnosis];
  return (
    <div className={`recovery${className ? " " + className : ""}`} role="alert">
      <p className="recovery-title">{title}</p>
      <p className="recovery-detail">{detail}</p>
      <div className="recovery-actions">
        {diagnosis === "expired" ? (
          <a className="btn" href="/login">
            Đăng nhập lại
          </a>
        ) : (
          <button
            className="btn"
            type="button"
            onClick={() => window.location.reload()}
          >
            Tải lại trang
          </button>
        )}
        {diagnosis === "expired" ? null : (
          <a className="btn btn-outline" href="/">
            Về Tổng quan
          </a>
        )}
      </div>
    </div>
  );
}

/** Vòng quay dùng chung. `inline` cho nút, mặc định cho giữa màn hình. */
export function Spinner({ inline = false }: { inline?: boolean }) {
  return (
    <span
      className={`spinner${inline ? " spinner-inline" : ""}`}
      aria-hidden="true"
    />
  );
}
