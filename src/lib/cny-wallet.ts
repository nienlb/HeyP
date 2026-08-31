/**
 * Ví tiền tệ (spec v3-B mục 2.2, 4.1).
 *
 * KHÔNG lưu số dư và giá vốn bình quân — chúng được tính lại bằng cách chạy
 * lại toàn bộ sổ chuyển động mỗi lần đọc. Một lần ghi hỏng giữa chừng không
 * thể để lại lệch vĩnh viễn, vì chẳng có gì để lệch.
 *
 * Giá vốn bình quân gia quyền, cùng công thức với inventory.avgCost.
 *
 * Module thuần, không phụ thuộc DB.
 */
import type { LedgerKind } from "./expenses";
import type { OrderStatus, OrderType } from "./order-status";

export type LedgerEntry = {
  kind: LedgerKind;
  /** +120 khi nạp, −60 khi mua hàng. */
  cnyDelta: number;
  /** Chỉ với 'nap': thực trả bao nhiêu VND. */
  vndPaid: number | null;
};

export type WalletState = {
  /** Số dư ¥. Có thể ÂM — nghĩa là có đợt nạp chưa ghi. */
  balance: number;
  /** Giá vốn bình quân (VND cho 1¥). */
  avgCost: number;
};

/**
 * Chạy lại sổ theo thứ tự thời gian.
 *
 * - `nap` khi số dư > 0 → bình quân gia quyền với phần đang giữ.
 * - `nap` khi số dư ≤ 0 → ĐẶT LẠI giá vốn = vndPaid / cnyDelta. Bình quân với
 *   số dư âm cho ra giá vốn vô nghĩa (có thể âm), nên phải cắt ở đây.
 * - `chi` / `dieu_chinh` → chỉ đổi số dư, giá vốn giữ nguyên. Giá vốn của đơn
 *   đã được chốt cứng vào rate_snapshot của dòng sổ, không phụ thuộc chỗ này.
 */
export function replayLedger(entries: LedgerEntry[]): WalletState {
  let balance = 0;
  let avgCost = 0;

  for (const e of entries) {
    if (e.kind === "nap") {
      const cnyIn = e.cnyDelta;
      const vndIn = e.vndPaid ?? 0;
      // Đợt nạp rỗng: bỏ qua, đừng chia cho 0.
      if (!(cnyIn > 0)) continue;

      if (balance > 0) {
        avgCost = (balance * avgCost + vndIn) / (balance + cnyIn);
      } else {
        avgCost = vndIn / cnyIn;
      }
      balance += cnyIn;
    } else {
      balance += e.cnyDelta;
    }
  }

  return { balance, avgCost };
}

/** Giá vốn bình quân hiện tại — dùng để chốt cứng rate_snapshot khi mua hàng. */
export function currentRate(entries: LedgerEntry[]): number {
  return replayLedger(entries).avgCost;
}

/** Giá trị ví quy ra VND (làm tròn về đồng). */
export function walletValueVnd(state: WalletState): number {
  return Math.round(state.balance * state.avgCost);
}

export type CnyDeductInput = {
  orderType: OrderType;
  /** Trạng thái đơn VỪA đạt tới — dù do tạo mới hay do chuyển bước. */
  toStatus: OrderStatus;
  goodsTotalCny: number;
  /** Đơn này đã có dòng 'chi' trong sổ ¥ chưa. */
  alreadyDeducted: boolean;
};

/**
 * Có ghi dòng 'chi' vào sổ ¥ cho đơn này không.
 *
 * Một nguồn chân lý duy nhất cho CẢ hai đường: đơn tạo thẳng ở 'da_mua_tq'
 * (nhap_kho) và đơn chuyển bước tới 'da_mua_tq' (order_ho). Trước đây chỉ
 * đường thứ hai trừ ví, nên nhập kho không bao giờ bị trừ; và đường thứ hai
 * không kiểm trùng, nên 'sự cố rồi quay lại' trừ hai lần.
 *
 * `ban_tu_kho` bị chặn cứng: cột goods_total_cny của nó chứa VND
 * (exchange_rate = 1), trừ ví theo số đó sẽ sai một trời một vực.
 */
export function shouldDeductCny(input: CnyDeductInput): boolean {
  if (input.orderType === "ban_tu_kho") return false;
  if (input.toStatus !== "da_mua_tq") return false;
  if (!(input.goodsTotalCny > 0)) return false;
  return !input.alreadyDeducted;
}
