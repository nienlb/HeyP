"use client";

import { useEffect, useState } from "react";
import { SLOW_AFTER_MS } from "@/lib/ui-timeouts";
import { probeHealth, RecoveryPanel, Spinner, type Diagnosis } from "./recovery";

/**
 * Màn chờ + đồng hồ canh.
 *
 * Vì sao đồng hồ nằm NGAY TRONG màn chờ chứ không phải một watchdog toàn cục
 * rình click: React tự tháo component này khi màn hình mới render xong, nên
 * đồng hồ chết theo, không cần dọn dẹp gì thêm và không thể báo nhầm sau khi
 * điều hướng đã thành công. Watchdog toàn cục thì phải tự đoán lúc nào điều
 * hướng kết thúc — mà với App Router, URL đổi NGAY khi bấm chứ không đợi dữ
 * liệu về, nên tín hiệu đó sai.
 */
export function LoadingScreen({ label = "Đang tải…" }: { label?: string }) {
  const [slow, setSlow] = useState(false);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  /**
   * React đã cầm lái component này chưa.
   *
   * Cần biết vì có MỘT trường hợp nó không bao giờ được cầm lái: lần mở app
   * đầu tiên (gõ URL, hoặc chạm icon PWA ngoài màn hình chính). Lúc đó fallback
   * của Suspense chỉ là HTML do server đẩy xuống — React KHÔNG hydrate nội dung
   * fallback, nó đợi boundary giải quyết xong mới hydrate. Nghĩa là useEffect
   * dưới đây không chạy, và watchdog câm. Đã kiểm chứng: tải thẳng một trang
   * chậm 60 giây, tới giây thứ 11 vẫn chỉ có spinner, không có bảng chẩn đoán.
   *
   * Đường vá là khối .recovery-static: nó nằm sẵn trong HTML và tự hiện ra
   * bằng animation-delay của CSS — CSS chạy trong lúc trang đang stream, không
   * cần một dòng JS nào. Khi React thật sự vào cuộc (mọi lần chuyển màn trong
   * app) thì cờ này bật, khối tĩnh biến mất và nhường chỗ cho bảng chẩn đoán
   * biết nói rõ hết phiên hay DB chết.
   */
  const [reactAlive, setReactAlive] = useState(false);

  useEffect(() => {
    setReactAlive(true);
    let alive = true;
    const timer = setTimeout(() => {
      if (!alive) return;
      setSlow(true);
      // Chẩn đoán chạy SAU khi đã bật cảnh báo, không phải trước: người dùng
      // thấy "có gì đó không ổn" ngay ở giây thứ 8, phần "không ổn ở đâu"
      // điền vào sau vài trăm mili giây nữa.
      void probeHealth().then((d) => {
        if (alive) setDiagnosis(d);
      });
    }, SLOW_AFTER_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="loading-screen">
      <div className="loading-screen-inner">
        <Spinner />
        <p className="loading-text">{label}</p>
        {slow ? <RecoveryPanel diagnosis={diagnosis} /> : null}
        {reactAlive ? null : (
          <div className="recovery recovery-static" role="alert">
            <p className="recovery-title">Màn hình đứng lâu bất thường</p>
            <p className="recovery-detail">
              Máy chủ chưa trả lời. Thử mở lại từ đầu; nếu vẫn vậy thì đăng
              nhập lại.
            </p>
            <div className="recovery-actions">
              <a className="btn" href="/">
                Về Tổng quan
              </a>
              <a className="btn btn-outline" href="/login">
                Đăng nhập lại
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
