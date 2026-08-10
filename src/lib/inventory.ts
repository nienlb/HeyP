/**
 * Luật tồn kho & lãi/lỗ (spec mục 5 + 7). Module thuần, không phụ thuộc DB.
 *
 * Quy ước:
 *   - Giá vốn (avgCost) là VND cho MỘT đơn vị hàng, đã làm tròn số nguyên đồng.
 *   - Mọi tiền VND làm tròn về số nguyên.
 */

export const INVENTORY_SOURCES = [
  "active",
  "supplier_defect",
  "exchange_return",
  "bom",
] as const;
export type InventorySource = (typeof INVENTORY_SOURCES)[number];

export const INVENTORY_SOURCE_LABELS: Record<InventorySource, string> = {
  active: "Nhập chủ động",
  supplier_defect: "Lỗi NCC",
  exchange_return: "Đổi trả",
  bom: "Hàng bom",
};

/**
 * Giá vốn bình quân gia quyền khi nhập thêm hàng cùng loại + cùng nguồn.
 *   avgMới = (tồnCũ·vốnCũ + nhập·vốnNhập) / (tồnCũ + nhập)
 */
export function weightedAvgCost(
  oldQty: number,
  oldAvgCost: number,
  addQty: number,
  addUnitCost: number,
): number {
  const totalQty = oldQty + addQty;
  if (totalQty <= 0) return 0;
  return Math.round((oldQty * oldAvgCost + addQty * addUnitCost) / totalQty);
}

/** Giá vốn 1 đơn vị hàng khi đưa vào kho từ đơn = đơn giá tệ × tỷ giá. */
export function unitGoodsCostVnd(
  unitPriceCny: number,
  exchangeRate: number,
): number {
  return Math.round(unitPriceCny * exchangeRate);
}

export type SaleResult = {
  /** Giá vốn của số lượng bán ra. */
  cost: number;
  /** Doanh thu (khách trả). */
  revenue: number;
  /** Lãi (>0) / lỗ (<0). */
  profit: number;
};

/** Lãi/lỗ khi bán từ kho: doanh thu − giá vốn của số lượng bán. */
export function saleProfit(
  qty: number,
  unitAvgCost: number,
  salePriceVnd: number,
): SaleResult {
  const cost = qty * unitAvgCost;
  return { cost, revenue: salePriceVnd, profit: salePriceVnd - cost };
}

/**
 * Giá vốn cả lô khi khách bom hàng (spec 7.3):
 *   = tổng tiền shop đã bỏ ra (tiền hàng + ship) − cọc đã thu (cọc không hoàn).
 * Phí dịch vụ là lãi dự kiến, KHÔNG tính vào "tiền đã bỏ ra".
 */
export function bomCostBasis(
  goodsTotalVnd: number,
  shippingFee: number,
  deposit: number,
): number {
  return Math.round(goodsTotalVnd) + Math.round(shippingFee) - Math.round(deposit);
}

export type StockChange = {
  /** Số lượng còn sau thao tác. */
  quantity: number;
  /** Giá vốn bình quân sau thao tác. */
  avgCost: number;
};

/** Nhập thêm hàng vào một dòng tồn kho (hoặc dòng mới nếu tồn = 0). */
export function applyStockIn(
  current: { quantity: number; avgCost: number },
  addQty: number,
  addUnitCost: number,
): StockChange {
  return {
    quantity: current.quantity + addQty,
    avgCost: weightedAvgCost(
      current.quantity,
      current.avgCost,
      addQty,
      addUnitCost,
    ),
  };
}

/**
 * Xuất kho (bán). Giá vốn bình quân KHÔNG đổi khi xuất; chỉ giảm số lượng.
 * Ném lỗi nếu bán quá tồn.
 */
export function applyStockOut(
  current: { quantity: number; avgCost: number },
  outQty: number,
): StockChange {
  if (outQty > current.quantity) {
    throw new Error(
      `Không đủ tồn: còn ${current.quantity}, muốn xuất ${outQty}`,
    );
  }
  return {
    quantity: current.quantity - outQty,
    avgCost: current.avgCost,
  };
}
