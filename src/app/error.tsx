"use client";

import { useEffect, useState } from "react";
import { probeHealth, RecoveryPanel, type Diagnosis } from "./_components/recovery";

/**
 * Bắt lỗi khi server component ném ra.
 *
 * Trước v6 chưa có file này nên mọi lỗi render đều rơi vào trang lỗi mặc định
 * của Next — tiếng Anh, không nói được gì, và không có đường quay lại.
 *
 * Đường này bận rộn hơn tưởng tượng kể từ khi role `postgres` có
 * statement_timeout 15s: query kẹt giờ NÉM LỖI thay vì treo vô hạn, tức là
 * phần lớn sự cố DB sẽ hạ cánh ở đây chứ không ở màn chờ.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);

  useEffect(() => {
    // Không chờ ngưỡng 8s như màn chờ: lỗi đã xảy ra rồi, chẩn đoán ngay.
    let alive = true;
    void probeHealth().then((d) => {
      if (alive) setDiagnosis(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="error-screen">
      <div className="error-screen-inner">
        <p className="error-screen-heading">Không tải được màn hình</p>
        <RecoveryPanel diagnosis={diagnosis} />
        <button className="btn btn-ghost" type="button" onClick={reset}>
          Thử render lại
        </button>
        {error.digest ? (
          <p className="error-digest">Mã lỗi: {error.digest}</p>
        ) : null}
      </div>
    </div>
  );
}
