"use client";

import { useOptimistic, useState, useTransition } from "react";
import {
  allowedNextStatuses,
  journeyTrack,
  STATUS_LABELS,
  type OrderStatus,
  type OrderType,
} from "@/lib/order-status";
import { StatusIcon } from "@/app/_components/status-icon";
import { changeStatusAction } from "@/app/orders/actions";

const DANGER_STATUSES = new Set<OrderStatus>(["su_co", "khach_bom", "huy"]);

const ALERT_COPY: Partial<Record<OrderStatus, string>> = {
  su_co:
    "Đơn đang tạm dừng ở khâu lưu thông. Chọn khâu để tiếp tục xử lý, hoặc huỷ / đánh dấu khách bom.",
  khach_bom: "Khách không nhận hàng — hàng đã được nhập lại kho.",
  huy: "Đơn đã huỷ, không còn thao tác nào tiếp theo.",
};

/**
 * Hành trình đơn hàng: thay cho hàng nút phẳng cũ bằng một stepper thấy được
 * đơn đang ở đâu trong quy trình, cộng một hành động "tiến tiếp" nổi bật hơn
 * hẳn các lựa chọn phụ (huỷ / sự cố / khách bom).
 *
 * Client component: bấm đổi trạng thái là UI nhảy bước NGAY (useOptimistic),
 * server action chạy ngầm. Trước đây mỗi lần bấm là submit <form> rồi
 * redirect — tải lại cả trang chi tiết, mất vài giây.
 */
export function OrderJourney({
  orderId,
  orderType,
  status,
  positionStatus,
  nextStatuses,
}: {
  orderId: number;
  orderType: OrderType;
  status: OrderStatus;
  /**
   * Mốc trên trục chính dùng để định vị bước hiện tại. Khi đơn đang ở nhánh
   * (sự cố/khách bom/huỷ), đây là mốc main-chain gần nhất trước khi rẽ
   * nhánh — do trang gọi component này tính từ lịch sử trạng thái.
   */
  positionStatus: OrderStatus;
  nextStatuses: OrderStatus[];
}) {
  const [optimisticStatus, applyOptimistic] = useOptimistic(status);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function go(to: OrderStatus) {
    setError(null);
    // applyOptimistic PHẢI nằm trong callback của startTransition (luật React
    // 19), nếu không sẽ ném "can only update optimistic state within a
    // transition".
    startTransition(async () => {
      applyOptimistic(to);
      const res = await changeStatusAction(orderId, to);
      // Thất bại: React tự bỏ giá trị optimistic khi transition kết thúc,
      // nên chỉ cần hiện lý do.
      if (!res.ok) setError(res.reason);
    });
  }

  const effectiveStatus = optimisticStatus;
  // Cùng một hàm thuần server đã dùng để tính prop, nên khi chưa có thay đổi
  // optimistic thì hai đường cho kết quả giống hệt — dùng thẳng prop cho rẻ.
  const effectiveNext =
    effectiveStatus === status
      ? nextStatuses
      : allowedNextStatuses(orderType, effectiveStatus);
  const isBranch = DANGER_STATUSES.has(effectiveStatus);

  const track = journeyTrack(orderType);
  // positionStatus do server tính từ lịch sử; nhưng nếu trạng thái (optimistic)
  // đang nằm ngay trên trục thì chính nó là mốc đúng.
  const effectivePosition = track.includes(effectiveStatus)
    ? effectiveStatus
    : positionStatus;
  const trackIndex = track.indexOf(effectivePosition);

  // Sự cố là lựa chọn "tiếp tục từ khâu nào" — không có một "bước kế tiếp"
  // duy nhất đúng, nên không gán primary; mọi lựa chọn nặng ngang nhau.
  //
  // Dùng trục của CHÍNH loại đơn này (trackIndex, đã tính ở trên), không
  // phải MAIN_CHAIN chung — đơn nhap_kho và ban_tu_kho có trục riêng, tra
  // vào MAIN_CHAIN sẽ ra -1.
  const forwardTarget =
    trackIndex >= 0 && trackIndex < track.length - 1
      ? track[trackIndex + 1]
      : null;
  const primary: OrderStatus | null =
    effectiveStatus === "su_co"
      ? null
      : forwardTarget && effectiveNext.includes(forwardTarget)
        ? forwardTarget
        : null;
  const secondary = effectiveNext.filter((s) => s !== primary);

  return (
    <section className="card journey-card">
      <h2 className="card-title">Hành trình đơn hàng</h2>

      {isBranch && (
        <div className={`journey-alert journey-alert--${effectiveStatus}`}>
          <StatusIcon status={effectiveStatus} size={20} />
          <div>
            <strong>{STATUS_LABELS[effectiveStatus]}</strong>
            {ALERT_COPY[effectiveStatus] && <p>{ALERT_COPY[effectiveStatus]}</p>}
          </div>
        </div>
      )}

      <ol className="journey-track" aria-label="Các bước xử lý đơn">
        {track.map((s, i) => {
          const state =
            trackIndex < 0
              ? "upcoming"
              : i < trackIndex
                ? "done"
                : i === trackIndex
                  ? "current"
                  : "upcoming";
          return (
            <li key={s} className={`journey-step journey-step--${state}`}>
              <span className="journey-dot">
                <StatusIcon status={s} size={14} />
              </span>
              <span className="journey-label">{STATUS_LABELS[s]}</span>
            </li>
          );
        })}
      </ol>

      {effectiveNext.length === 0 ? (
        <p className="muted journey-final">
          {effectiveStatus === "huy"
            ? "Đơn đã huỷ — không còn thao tác nào tiếp theo."
            : "Đơn đã ở trạng thái cuối, không thể chuyển tiếp."}
        </p>
      ) : (
        <div className="journey-actions">
          {primary && (
            <button
              type="button"
              className="btn journey-primary"
              disabled={isPending}
              onClick={() => go(primary)}
            >
              Xác nhận: {STATUS_LABELS[primary]}
              <span aria-hidden="true"> →</span>
            </button>
          )}
          {secondary.length > 0 && (
            <div className="journey-secondary">
              {effectiveStatus === "su_co" && (
                <span className="journey-secondary-label">
                  Tiếp tục từ khâu:
                </span>
              )}
              {secondary.map((to) => (
                <button
                  key={to}
                  type="button"
                  className={`btn btn-sm ${
                    DANGER_STATUSES.has(to) ? "btn-warn" : "btn-outline"
                  }`}
                  disabled={isPending}
                  onClick={() => go(to)}
                >
                  {STATUS_LABELS[to]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="journey-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
