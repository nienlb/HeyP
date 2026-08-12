/**
 * Sổ thu tiền (spec v3-B mục 3, 4.3).
 *
 * orders.deposit là số DẪN XUẤT = Σ payments. Một chỗ tính duy nhất, để
 * không rơi vào bẫy hai nguồn chân lý.
 *
 * Module thuần, không phụ thuộc DB.
 */

export type PaymentLike = {
  /** Khoản 'hoan_tra' mang dấu ÂM nên phép cộng vẫn đúng. */
  amountVnd: number;
};

/** Tổng đã thu của một đơn. */
export function sumPaid(payments: PaymentLike[]): number {
  return payments.reduce((sum, p) => sum + Math.round(p.amountVnd), 0);
}

/** Còn phải thu = tiền hàng + ship − đã thu. Âm nghĩa là phải hoàn lại khách. */
export function amountDue(
  quotedTotalVnd: number,
  shippingFee: number,
  payments: PaymentLike[],
): number {
  return (
    Math.round(quotedTotalVnd) + Math.round(shippingFee) - sumPaid(payments)
  );
}
