/**
 * Huỷ phiếu nhập kho — đường gỡ cho lần nhập sai (Admin trở lên).
 *
 * Nhập kho là một đơn `nhap_kho` dừng ở `ve_kho_vn`: nó đã cộng tồn (bình
 * quân gia quyền) VÀ đã trừ ví ¥. Xoá đơn thì hai dấu vết đó còn nguyên mà
 * nguồn gốc biến mất, nên `canDeleteOrder` chặn. Huỷ thì làm ngược đúng hai
 * việc đó rồi chuyển đơn sang `huy`, giữ nguyên lịch sử.
 *
 * Sửa phiếu nhập tại chỗ CỐ Ý không có: nhập sai thì huỷ rồi nhập lại.
 *
 * Module thuần, không phụ thuộc DB.
 */
import type { OrderStatus, OrderType } from "./order-status.ts";
import type { StockChange } from "./inventory.ts";

export type StockInCancelFacts = {
  orderType: OrderType;
  status: OrderStatus;
  /** Số dòng món KHÔNG ở trạng thái 'normal' (đã tách lỗi NCC / đổi trả). */
  exceptionLines: number;
  /** Số dòng 'dieu_chinh' của đơn trong sổ ¥ — có nghĩa là ¥ đã sửa sau khi nhập. */
  cnyAdjustments: number;
};

export type CancelCheck = { ok: true } | { ok: false; reason: string };

export function canCancelStockIn(f: StockInCancelFacts): CancelCheck {
  if (f.orderType !== "nhap_kho")
    return { ok: false, reason: "Chỉ huỷ được đơn Nhập kho." };
  if (f.status !== "ve_kho_vn")
    return { ok: false, reason: "Chỉ huỷ được phiếu nhập đã về kho." };
  // Món đã tách ra (lỗi NCC) đi vào dòng tồn khác — gỡ phần còn lại thì tồn
  // của dòng kia vẫn treo đó. Không đoán, chặn.
  if (f.exceptionLines > 0)
    return {
      ok: false,
      reason: "Phiếu nhập đã có món tách lỗi NCC/đổi trả — không huỷ tự động được.",
    };
  // Giá ¥ sửa SAU lúc nhập thì giá vốn đã cộng vào kho là giá CŨ, không còn
  // nằm ở đâu để trừ ngược cho đúng.
  if (f.cnyAdjustments > 0)
    return {
      ok: false,
      reason: "Giá ¥ của phiếu đã bị sửa sau khi nhập — không huỷ tự động được.",
    };
  return { ok: true };
}

/**
 * Rút đúng một lần nhập ra khỏi dòng tồn — nghịch đảo của `applyStockIn`:
 *   vốnMới = (tồn·vốn − rút·vốnNhập) / (tồn − rút)
 *
 * Chặn khi tồn còn ít hơn số đã nhập: một phần hàng đã bán, rút nữa là âm.
 * Giá vốn kẹp ở 0 vì làm tròn (hoặc đã bán bớt ở giá bình quân) có thể đẩy
 * tử số xuống dưới 0 chút ít.
 */
export function reverseStockIn(
  current: { quantity: number; avgCost: number },
  qty: number,
  unitCost: number,
): StockChange | { error: string } {
  if (qty > current.quantity)
    return {
      error: `Kho chỉ còn ${current.quantity}, phiếu đã nhập ${qty} — một phần đã bán.`,
    };
  const left = current.quantity - qty;
  if (left === 0) return { quantity: 0, avgCost: 0 };
  const avg = Math.round(
    (current.quantity * current.avgCost - qty * unitCost) / left,
  );
  return { quantity: left, avgCost: Math.max(0, avg) };
}
