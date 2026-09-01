/**
 * Module tính tiền cho đơn hàng (spec mục 5).
 *
 * Công thức gốc:
 *   tiền hàng (tệ) × tỷ giá + phí dịch vụ + phí ship − đã cọc = còn phải thu
 *
 * Quy ước:
 *   - Tiền tệ (CNY) và tỷ giá là số thực.
 *   - Mọi giá trị VND (phí, cọc, kết quả) làm tròn về số nguyên đồng.
 *
 * Module thuần, không phụ thuộc DB — để unit test dễ và chắc.
 */

export type OrderMoneyInput = {
  /** Tổng tiền hàng, đơn vị Nhân dân tệ (CNY). */
  goodsTotalCny: number;
  /** Tỷ giá VND trên 1 tệ. */
  exchangeRate: number;
  /** Phí dịch vụ (VND). */
  serviceFee: number;
  /** Phí ship (VND). */
  shippingFee: number;
  /** Đã cọc (VND). */
  deposit: number;
};

export type OrderMoneyResult = {
  /** Tiền hàng quy đổi ra VND (đã làm tròn). */
  goodsTotalVnd: number;
  /** Tiền hàng + phí dịch vụ + phí ship (chưa trừ cọc). */
  subtotalVnd: number;
  /** Còn phải thu = subtotal − cọc. */
  amountDue: number;
};

export function computeOrderMoney(input: OrderMoneyInput): OrderMoneyResult {
  const goodsTotalVnd = Math.round(input.goodsTotalCny * input.exchangeRate);
  const subtotalVnd =
    goodsTotalVnd + Math.round(input.serviceFee) + Math.round(input.shippingFee);
  const amountDue = subtotalVnd - Math.round(input.deposit);
  return { goodsTotalVnd, subtotalVnd, amountDue };
}

export type LineItemLike = { quantity: number; unitPriceCny: number };

/** Tổng tiền hàng (tệ) từ các dòng sản phẩm. */
export function sumLineItemsCny(items: LineItemLike[]): number {
  return items.reduce((sum, it) => sum + it.quantity * it.unitPriceCny, 0);
}

export type ValidationError = { field: string; message: string };

/** Kiểm tra hợp lệ khối tiền của đơn (spec mục 9: tỷ giá/số lượng/giá > 0). */
export function validateOrderMoney(input: OrderMoneyInput): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!(input.exchangeRate > 0))
    errors.push({ field: "exchangeRate", message: "Tỷ giá phải lớn hơn 0" });
  if (input.goodsTotalCny < 0)
    errors.push({ field: "goodsTotalCny", message: "Tiền hàng không được âm" });
  if (input.serviceFee < 0)
    errors.push({ field: "serviceFee", message: "Phí dịch vụ không được âm" });
  if (input.shippingFee < 0)
    errors.push({ field: "shippingFee", message: "Phí ship không được âm" });
  if (input.deposit < 0)
    errors.push({ field: "deposit", message: "Tiền cọc không được âm" });
  return errors;
}

/**
 * Giá ¥ KHÔNG bắt buộc (spec v3-A): đơn tạo từ ảnh chốt hoặc nhập theo giá
 * phải thu (v6) có thể chưa biết giá vốn — cờ `thieu_gia_von` của order-gaps
 * lo phần nhắc bổ sung. Chỉ chặn số ÂM, vì âm là dữ liệu hỏng chứ không phải
 * "chưa biết".
 */
export function validateLineItem(item: LineItemLike): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!(item.quantity > 0))
    errors.push({ field: "quantity", message: "Số lượng phải lớn hơn 0" });
  if (item.unitPriceCny < 0)
    errors.push({ field: "unitPriceCny", message: "Đơn giá không được âm" });
  return errors;
}
