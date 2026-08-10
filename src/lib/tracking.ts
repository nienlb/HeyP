/**
 * Khung tra cứu vận đơn TQ→VN (spec mục 8).
 *
 * Mỗi đơn vị vận chuyển = 1 adapter với giao diện duy nhất `lookup(mã) → trạng thái`.
 * MVP để registry RỖNG vì chưa xác nhận đơn vị Niên đang dùng & khả năng tra cứu.
 * Khi có đơn vị + API/trang tra cứu công khai: thêm một object vào CARRIER_ADAPTERS,
 * đặt `carrier` khớp giá trị lưu ở packages.carrier — không phải sửa chỗ nào khác.
 *
 * Module thuần (không import DB) để dễ test & tách bạch.
 */

export type TrackingLookup =
  | { ok: true; status: string; raw?: string }
  | { ok: false; error: string };

export interface CarrierAdapter {
  /** Khớp với packages.carrier. */
  carrier: string;
  /** Tên hiển thị. */
  label: string;
  /** Tra cứu 1 mã vận đơn → trạng thái mới. */
  lookup(trackingCode: string): Promise<TrackingLookup>;
}

// Chưa có đơn vị nào được xác nhận → rỗng. Kiện mode "auto" sẽ bị gắn cờ "tra tay".
export const CARRIER_ADAPTERS: CarrierAdapter[] = [];

export function getAdapter(
  carrier: string | null | undefined,
): CarrierAdapter | undefined {
  if (!carrier) return undefined;
  return CARRIER_ADAPTERS.find((a) => a.carrier === carrier);
}

/** Danh sách đơn vị đã có adapter (để hiện lựa chọn ở form). */
export function knownCarriers(): { carrier: string; label: string }[] {
  return CARRIER_ADAPTERS.map((a) => ({ carrier: a.carrier, label: a.label }));
}
