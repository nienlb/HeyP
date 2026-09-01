"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { SLOW_AFTER_MS } from "@/lib/ui-timeouts";
import {
  probeHealth,
  RecoveryPanel,
  Spinner,
  type Diagnosis,
} from "../_components/recovery";

/**
 * Nút đăng nhập biết mình đang chờ.
 *
 * Phải là component RIÊNG chứ không gộp vào page.tsx: useFormStatus() chỉ đọc
 * được trạng thái của <form> khi nó nằm BÊN TRONG form đó — gọi ở chính
 * component dựng ra form thì luôn trả pending = false.
 *
 * Đăng nhập là đường đụng DB nặng nhất của cả app (đọc bảng users + hash
 * scrypt), nên đây cũng là chỗ dễ đứng nhất khi DB bận — mà lại là chỗ người
 * dùng ít kiên nhẫn nhất, vì chưa vào được thì chưa thấy gì cả.
 */
export function LoginSubmitButton() {
  const { pending } = useFormStatus();
  const [slow, setSlow] = useState(false);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);

  useEffect(() => {
    if (!pending) {
      // Lần submit trước đã xong (thường là redirect kèm ?error=1) — xoá cảnh
      // báo cũ, nếu không nó còn treo lại trên lần thử tiếp theo.
      setSlow(false);
      setDiagnosis(null);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      if (!alive) return;
      setSlow(true);
      void probeHealth().then((d) => {
        if (alive) setDiagnosis(d);
      });
    }, SLOW_AFTER_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [pending]);

  return (
    <>
      <button
        className="btn"
        type="submit"
        style={{ width: "100%" }}
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? (
          <>
            <Spinner inline /> Đang đăng nhập…
          </>
        ) : (
          "Đăng nhập"
        )}
      </button>
      {slow ? (
        // Ở màn đăng nhập, "phiên hết hạn" là kết luận vô nghĩa (đang đăng
        // nhập thì làm gì đã có phiên) — quy về máy chủ chậm cho khỏi rối.
        <RecoveryPanel
          className="recovery-compact"
          diagnosis={diagnosis === "expired" ? "server-slow" : diagnosis}
        />
      ) : null}
    </>
  );
}
