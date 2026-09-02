"use client";

import { useEffect, useState } from "react";
import { SLOW_AFTER_MS } from "@/lib/ui-timeouts";
import { probeHealth, RecoveryPanel, type Diagnosis } from "./recovery";

/**
 * Nội dung tạm cho vùng <main> trong lúc màn mới đang về.
 *
 * KHÁC LoadingScreen cũ ở hai điểm cốt lõi:
 *  - Nó KHÔNG phủ toàn màn. Sidebar/header/tabbar do (app)/layout.tsx giữ,
 *    nằm trên ranh giới Suspense nên không bị tháo.
 *  - Nó hiện NGAY LẬP TỨC, không có độ trễ 250ms. Độ trễ đó tồn tại để
 *    spinner phủ màn không nháy khi điều hướng nhanh — nhưng đo trên
 *    production ngày 02/09 thì TTFB là 260–300ms, tức rơi ngay SAU ngưỡng
 *    250ms, nên spinner bật rồi tắt gần như mỗi lần bấm. Đó chính là cái
 *    người dùng gọi là "chớp tắt". Khung xương thì không có vấn đề đó: nó
 *    nằm đúng chỗ nội dung thật sắp hiện ra, nên không có gì để nháy.
 *
 * Giữ nguyên đồng hồ canh 8 giây và bảng chẩn đoán — chúng là thứ v6 thêm
 * vào để người dùng biết "đơ" là vì phiên hết hạn hay vì DB chết.
 */
export function ContentSkeleton() {
  const [slow, setSlow] = useState(false);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);

  useEffect(() => {
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
    <div className="skel" aria-busy="true" aria-label="Đang tải">
      <div className="skel-card">
        <span className="skel-line skel-w60" />
        <span className="skel-line skel-w90" />
        <span className="skel-line skel-w75" />
      </div>
      <div className="skel-card">
        <span className="skel-line skel-w45" />
        <span className="skel-line skel-w90" />
      </div>
      <div className="skel-card">
        <span className="skel-line skel-w60" />
        <span className="skel-line skel-w75" />
        <span className="skel-line skel-w90" />
      </div>

      {slow ? <RecoveryPanel diagnosis={diagnosis} /> : null}

      {/*
        Khối tĩnh hiện bằng animation-delay của CSS, KHÔNG bằng useEffect ở
        trên. Lý do: React không hydrate nội dung fallback của Suspense, nên
        ở LẦN TẢI ĐẦU (gõ thẳng URL, chạm icon PWA) mọi hook trong đây đều
        câm. CSS thì chạy trong lúc trang đang stream. Đừng xoá vì "React lo
        rồi": React chỉ lo được đường chuyển màn trong app.
      */}
      <div className="recovery recovery-static" role="alert">
        <p className="recovery-title">Màn hình đứng lâu bất thường</p>
        <p className="recovery-detail">
          Máy chủ chưa trả lời. Đăng nhập lại là đường ra chắc ăn nhất.
        </p>
        <div className="recovery-actions">
          <a className="btn" href="/login">
            Đăng nhập lại
          </a>
          <a className="btn btn-outline" href="/">
            Về Tổng quan
          </a>
        </div>
      </div>
    </div>
  );
}
