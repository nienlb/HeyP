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
