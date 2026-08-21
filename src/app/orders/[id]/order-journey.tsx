import {
  journeyTrack,
  STATUS_LABELS,
  type OrderStatus,
  type OrderType,
} from "@/lib/order-status";
import { StatusIcon } from "../../_components/status-icon";
import { changeStatusAction } from "../actions";

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
  const track = journeyTrack(orderType);
  const trackIndex = track.indexOf(positionStatus);
  const isBranch = DANGER_STATUSES.has(status);

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
    status === "su_co"
      ? null
      : orderType === "ban_tu_kho" && nextStatuses.includes("da_giao_khach")
        ? "da_giao_khach"
        : forwardTarget && nextStatuses.includes(forwardTarget)
          ? forwardTarget
          : null;
  const secondary = nextStatuses.filter((s) => s !== primary);

  return (
    <section className="card journey-card">
      <h2 className="card-title">Hành trình đơn hàng</h2>

      {isBranch && (
        <div className={`journey-alert journey-alert--${status}`}>
          <StatusIcon status={status} size={20} />
          <div>
            <strong>{STATUS_LABELS[status]}</strong>
            {ALERT_COPY[status] && <p>{ALERT_COPY[status]}</p>}
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

      {nextStatuses.length === 0 ? (
        <p className="muted journey-final">
          {status === "huy"
            ? "Đơn đã huỷ — không còn thao tác nào tiếp theo."
            : "Đơn đã ở trạng thái cuối, không thể chuyển tiếp."}
        </p>
      ) : (
        <div className="journey-actions">
          {primary && (
            <form action={changeStatusAction}>
              <input type="hidden" name="orderId" value={orderId} />
              <input type="hidden" name="to" value={primary} />
              <button type="submit" className="btn journey-primary">
                Xác nhận: {STATUS_LABELS[primary]}
                <span aria-hidden="true"> →</span>
              </button>
            </form>
          )}
          {secondary.length > 0 && (
            <div className="journey-secondary">
              {status === "su_co" && (
                <span className="journey-secondary-label">
                  Tiếp tục từ khâu:
                </span>
              )}
              {secondary.map((to) => (
                <form key={to} action={changeStatusAction}>
                  <input type="hidden" name="orderId" value={orderId} />
                  <input type="hidden" name="to" value={to} />
                  <button
                    type="submit"
                    className={`btn btn-sm ${
                      DANGER_STATUSES.has(to) ? "btn-warn" : "btn-outline"
                    }`}
                  >
                    {STATUS_LABELS[to]}
                  </button>
                </form>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
