/**
 * Báo cáo lãi/lỗ theo tháng (spec v3-B mục 6.2).
 *
 * Đơn chỉ vào đây khi đã HOÀN TẤT — nhờ vậy con số lãi không bao giờ bị khách
 * bom hay huỷ đơn làm sai ngược.
 *
 * Hai khối tách bạch, KHÔNG trộn: "chắc chắn" (mọi dòng đã xác nhận giá ¥) và
 * "đang ước tính" (còn dòng dùng giá gợi ý). Một con số lãi dựng trên phỏng
 * đoán mà trông như sự thật thì nguy hơn là không có con số nào.
 *
 * Module thuần, không phụ thuộc DB.
 */
import type { ExpenseCategory } from "./expenses";
import type { OrderType } from "./order-status";

export type PnlOrder = {
  id: number;
  orderType: OrderType;
  /** Total đã chốt với khách (không gồm ship). */
  quotedTotalVnd: number;
  shippingFee: number;
  /** Tổng ¥ của đơn. Đơn ban_tu_kho: đây là VND với sellRate = 1. */
  goodsTotalCny: number;
  /** Tỷ giá BÁN của đơn (4000). */
  sellRate: number;
  /** Giá vốn ¥ đã chốt cứng lúc mua. null = chưa mua / không áp dụng. */
  costRate: number | null;
  /** Giá vốn tồn kho, chỉ đơn ban_tu_kho. */
  saleCost: number | null;
  /** Mọi dòng của đơn đã xác nhận giá ¥? */
  costConfirmed: boolean;
  /** Σ order_items.margin_vnd. */
  marginVnd: number;
};

export type PnlExpense = {
  amountVnd: number;
  category: ExpenseCategory;
  /** null = chi phí theo kỳ. */
  orderId: number | null;
};

export type PnlInput = {
  /** Đơn hoàn tất trong tháng. */
  orders: PnlOrder[];
  /** Chi phí phát sinh trong tháng (cả gắn đơn lẫn theo kỳ). */
  expenses: PnlExpense[];
  /** Cọc giữ được từ các đơn chuyển sang khach_bom trong tháng. */
  bomDepositsVnd: number;
};

export type PnlBlock = {
  orderCount: number;
  revenueVnd: number;
  goodsCostVnd: number;
  grossProfitVnd: number;
  pricingMarginVnd: number;
  fxMarginVnd: number;
  shipCollectedVnd: number;
  orderExpensesVnd: number;
};

export type PnlReport = {
  confirmed: PnlBlock;
  estimated: PnlBlock;
  periodExpensesVnd: number;
  periodExpenseByCategory: { category: ExpenseCategory; amountVnd: number }[];
  bomDepositsVnd: number;
  /** Chi phí kỳ chia cho số đơn. null khi tháng không có đơn nào. */
  allocatedPerOrderVnd: number | null;
  netProfitVnd: number;
};

const EMPTY_BLOCK: PnlBlock = {
  orderCount: 0,
  revenueVnd: 0,
  goodsCostVnd: 0,
  grossProfitVnd: 0,
  pricingMarginVnd: 0,
  fxMarginVnd: 0,
  shipCollectedVnd: 0,
  orderExpensesVnd: 0,
};

/** Giá vốn hàng của một đơn. */
function goodsCostOf(o: PnlOrder): number {
  // Hàng tồn kho: giá vốn đã chốt ở sale_cost, không mua bằng ¥ lúc bán.
  if (o.orderType === "ban_tu_kho") return Math.round(o.saleCost ?? 0);
  // Chưa mua hàng → chưa có giá vốn thật; dùng tỷ giá bán để chênh tỷ giá = 0.
  const rate = o.costRate ?? o.sellRate;
  return Math.round(o.goodsTotalCny * rate);
}

/** Lời chênh tỷ giá — khoản lời ẩn từ việc mua ¥ rẻ hơn tỷ giá bán. */
function fxMarginOf(o: PnlOrder): number {
  if (o.orderType === "ban_tu_kho" || o.costRate === null) return 0;
  return Math.round(o.goodsTotalCny * (o.sellRate - o.costRate));
}

function buildBlock(orders: PnlOrder[], expenses: PnlExpense[]): PnlBlock {
  const ids = new Set(orders.map((o) => o.id));
  const block = { ...EMPTY_BLOCK, orderCount: orders.length };

  for (const o of orders) {
    const cost = goodsCostOf(o);
    block.revenueVnd += Math.round(o.quotedTotalVnd);
    block.goodsCostVnd += cost;
    block.grossProfitVnd += Math.round(o.quotedTotalVnd) - cost;
    block.pricingMarginVnd += Math.round(o.marginVnd);
    block.fxMarginVnd += fxMarginOf(o);
    block.shipCollectedVnd += Math.round(o.shippingFee);
  }

  for (const e of expenses) {
    if (e.orderId !== null && ids.has(e.orderId)) {
      block.orderExpensesVnd += Math.round(e.amountVnd);
    }
  }

  return block;
}

export function computePnl(input: PnlInput): PnlReport {
  const confirmed = buildBlock(
    input.orders.filter((o) => o.costConfirmed),
    input.expenses,
  );
  const estimated = buildBlock(
    input.orders.filter((o) => !o.costConfirmed),
    input.expenses,
  );

  const periodExpenses = input.expenses.filter((e) => e.orderId === null);
  const periodExpensesVnd = periodExpenses.reduce(
    (s, e) => s + Math.round(e.amountVnd),
    0,
  );

  const byCategory = new Map<ExpenseCategory, number>();
  for (const e of periodExpenses) {
    byCategory.set(
      e.category,
      (byCategory.get(e.category) ?? 0) + Math.round(e.amountVnd),
    );
  }

  const orderCount = input.orders.length;

  const netProfitVnd =
    confirmed.grossProfitVnd +
    estimated.grossProfitVnd +
    confirmed.shipCollectedVnd +
    estimated.shipCollectedVnd -
    confirmed.orderExpensesVnd -
    estimated.orderExpensesVnd -
    periodExpensesVnd +
    Math.round(input.bomDepositsVnd);

  return {
    confirmed,
    estimated,
    periodExpensesVnd,
    periodExpenseByCategory: [...byCategory.entries()].map(
      ([category, amountVnd]) => ({ category, amountVnd }),
    ),
    bomDepositsVnd: Math.round(input.bomDepositsVnd),
    // Tháng không có đơn nào thì không chia — hiện nguyên tổng chi phí.
    allocatedPerOrderVnd:
      orderCount > 0 ? Math.round(periodExpensesVnd / orderCount) : null,
    netProfitVnd,
  };
}
