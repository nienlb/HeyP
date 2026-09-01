/**
 * Bóc lớp giá ở cấp dòng sản phẩm (spec v3-A mục 3.3).
 *
 *   giá bán món = ¥ × số lượng × tỷ_giá_bán  +  lời_món
 *
 * Hai luật bất biến, được khoá bởi unit test:
 *   1. Total là DỮ KIỆN (khách đã đồng ý trên Zalo), không bao giờ tự đổi.
 *   2. Σ giá bán các món = Total, không lệch dù 1₫.
 *
 * Hệ quả của (1)+(2): lời là PHẦN DƯ, không phải số khai báo. Mức lời mặc định
 * (170.000) chỉ dùng để gợi ý cách chia phần dư đó giữa các món.
 *
 * Module thuần, không phụ thuộc DB.
 */

export type PricingLine = {
  quantity: number;
  /** Giá ¥ mỗi đơn vị. Đơn `ban_tu_kho` dùng tỷ giá 1 nên đây là VND. */
  unitPriceCny: number;
  /** Lời của món (VND). */
  marginVnd: number;
};

/** Giá vốn hàng của một dòng, quy ra VND (làm tròn về đồng). */
export function lineCostVnd(line: PricingLine, sellRate: number): number {
  return Math.round(line.quantity * line.unitPriceCny * sellRate);
}

/** Giá bán của một dòng = giá vốn + lời. */
export function lineSellVnd(line: PricingLine, sellRate: number): number {
  return lineCostVnd(line, sellRate) + Math.round(line.marginVnd);
}

/** Tổng giá bán các dòng — phải luôn bằng Total đã chốt. */
export function quotedTotalFromLines(
  lines: PricingLine[],
  sellRate: number,
): number {
  return lines.reduce((sum, l) => sum + lineSellVnd(l, sellRate), 0);
}

/** Tổng lời của đơn. Có thể âm — đơn lỗ là chuyện có thật. */
export function orderProfit(lines: PricingLine[]): number {
  return lines.reduce((sum, l) => sum + Math.round(l.marginVnd), 0);
}

/**
 * Chia `pool` cho các dòng theo tỷ trọng `weights`.
 * Phần lẻ do làm tròn dồn vào phần tử cuối → tổng trả về đúng bằng `pool`.
 */
function splitByWeight(pool: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  if (n === 1) return [pool];

  const weightSum = weights.reduce((s, w) => s + w, 0);
  // Giá vốn toàn 0 (chưa nhập ¥) → không có tỷ trọng, chia đều.
  const safe = weightSum > 0 ? weights : weights.map(() => 1);
  const safeSum = safe.reduce((s, w) => s + w, 0);

  const out: number[] = [];
  let assigned = 0;
  for (let i = 0; i < n - 1; i++) {
    const share = Math.round((pool * safe[i]) / safeSum);
    out.push(share);
    assigned += share;
  }
  out.push(pool - assigned);
  return out;
}

/**
 * Rải lời cho các dòng sao cho Σ giá bán = quotedTotal.
 * Mỗi dòng nhận `defaultMargin` trước, phần chênh còn lại chia theo tỷ trọng
 * giá vốn — dòng đắt tiền hơn gánh phần chênh nhiều hơn.
 */
export function allocateMargins(
  quotedTotal: number,
  lines: PricingLine[],
  sellRate: number,
  defaultMargin: number,
): number[] {
  const n = lines.length;
  if (n === 0) return [];

  const costs = lines.map((l) => lineCostVnd(l, sellRate));
  const pool = Math.round(quotedTotal) - costs.reduce((s, c) => s + c, 0);

  // Một dòng: Total ghim cứng, defaultMargin không có chỗ để can thiệp.
  if (n === 1) return [pool];

  const residual = pool - Math.round(defaultMargin) * n;
  return splitByWeight(residual, costs).map(
    (s) => Math.round(defaultMargin) + s,
  );
}

/**
 * Người dùng kéo lời của dòng `changedIndex` thành `newMargin`.
 * Các dòng còn lại bù qua bù lại theo tỷ trọng giá vốn để Total giữ nguyên.
 */
export function redistribute(
  lines: PricingLine[],
  changedIndex: number,
  newMargin: number,
  quotedTotal: number,
  sellRate: number,
): number[] {
  const n = lines.length;
  if (n === 0) return [];

  const costs = lines.map((l) => lineCostVnd(l, sellRate));
  const pool = Math.round(quotedTotal) - costs.reduce((s, c) => s + c, 0);

  // Một dòng: không có ai để bù, lời luôn là phần dư.
  if (n === 1) return [pool];

  const pinned = Math.round(newMargin);
  const otherIdx = lines.map((_, i) => i).filter((i) => i !== changedIndex);
  const shares = splitByWeight(
    pool - pinned,
    otherIdx.map((i) => costs[i]),
  );

  const out = new Array<number>(n);
  out[changedIndex] = pinned;
  otherIdx.forEach((idx, k) => {
    out[idx] = shares[k];
  });
  return out;
}

/**
 * Gợi ý giá ¥ mỗi món khi chưa có lịch sử: suy ngược từ Total, giả định mỗi
 * món lời `defaultMargin`, rồi chia đều cho các món.
 *
 * Số này CHẮC CHẮN sai lệch khi đơn nhiều món giá khác nhau — nó chỉ là điểm
 * xuất phát để người dùng kéo, hơn là bắt họ đối diện ô trống. Vì vậy dòng
 * dùng số này phải giữ cost_confirmed = false.
 */
export function suggestCnyFromTotal(
  quotedTotal: number,
  lineCount: number,
  sellRate: number,
  defaultMargin: number,
): number {
  if (lineCount <= 0 || !(sellRate > 0)) return 0;
  const cost = Math.round(quotedTotal) - Math.round(defaultMargin) * lineCount;
  const perLineCny = cost / sellRate / lineCount;
  if (!(perLineCny > 0)) return 0;
  return Math.round(perLineCny * 100) / 100;
}

/**
 * Suy ngược giá ¥ mỗi đơn vị từ GIÁ PHẢI THU của khách (v6 — đảo chiều nhập).
 *
 *   ¥ = (giá_thu − lời_mặc_định) / tỷ_giá_bán
 *
 * Người chốt đơn biết giá thu của khách, không biết giá ¥ ở shop TQ. Số trả
 * về là số MÁY ĐOÁN — dòng dùng nó phải giữ cost_confirmed = false, đúng quy
 * ước sẵn có: giá vốn chưa xác nhận không vào phần "chắc chắn" của báo cáo.
 *
 * Giá thu ≤ lời mặc định → 0 (toàn bộ giá thu là lời). Tỷ giá ≤ 0 → 0.
 */
export function cnyFromSellPrice(
  sellVnd: number,
  sellRate: number,
  defaultMargin: number,
): number {
  if (!(sellRate > 0)) return 0;
  const goods = Math.round(sellVnd) - Math.round(defaultMargin);
  if (!(goods > 0)) return 0;
  return Math.round((goods / sellRate) * 100) / 100;
}

/**
 * Lời của một dòng khi nhập theo giá phải thu = phần dư.
 *
 *   lời = giá_thu × SL − giá_vốn_dòng
 *
 * Vì ¥ đã bị làm tròn hai số lẻ, phần lẻ tự rơi vào đây — nhờ vậy Σ giá bán
 * khớp ĐÚNG Total, không lệch 1₫. Luật này bị test khoá.
 */
export function marginFromSellPrice(
  sellVnd: number,
  line: PricingLine,
  sellRate: number,
): number {
  return Math.round(sellVnd) * line.quantity - lineCostVnd(line, sellRate);
}
