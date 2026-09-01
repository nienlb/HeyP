import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allocateMargins,
  cnyFromSellPrice,
  lineCostVnd,
  lineSellVnd,
  marginFromSellPrice,
  orderProfit,
  quotedTotalFromLines,
  redistribute,
  sellPerUnitVnd,
  suggestCnyFromTotal,
  totalAfterAddLine,
  totalAfterEditLine,
  totalAfterRemoveLine,
  type PricingLine,
} from "../src/lib/line-pricing.ts";

const line = (unitPriceCny: number, quantity = 1, marginVnd = 0): PricingLine => ({
  quantity,
  unitPriceCny,
  marginVnd,
});

test("giá vốn và giá bán của một dòng", () => {
  const l = line(60, 1, 170000);
  assert.equal(lineCostVnd(l, 4000), 240000);
  assert.equal(lineSellVnd(l, 4000), 410000);
});

test("đơn 1 món: lời là phần dư, bị Total ghim cứng", () => {
  // Total 410.000, 60¥ × 4000 = 240.000 → lời 170.000
  const m = allocateMargins(410000, [line(60)], 4000, 170000);
  assert.deepEqual(m, [170000]);
});

test("đơn 1 món: defaultMargin bị bỏ qua, Total luôn thắng", () => {
  const m = allocateMargins(410000, [line(60)], 4000, 999999);
  assert.deepEqual(m, [170000]);
});

test("đơn 2 món khớp đúng mức mặc định", () => {
  // Total 820.000; 62¥+58¥ = 480.000 giá vốn → còn 340.000 = 170k × 2
  const m = allocateMargins(820000, [line(62), line(58)], 4000, 170000);
  assert.deepEqual(m, [170000, 170000]);
});

test("đơn 2 món lệch: phần thiếu chia theo tỷ trọng giá vốn", () => {
  // 70¥ + 58¥ = 512.000 giá vốn → lời còn 308.000, thiếu 32.000 so với 340.000
  const lines = [line(70), line(58)];
  const m = allocateMargins(820000, lines, 4000, 170000);
  assert.equal(m[0] + m[1], 308000);
  // giá vốn 280.000 vs 232.000 → dòng đắt hơn gánh phần hụt nhiều hơn
  assert.ok(m[0] < m[1], "dòng giá vốn cao hơn phải bị trừ lời nhiều hơn");
});

test("BẤT BIẾN: Σ giá bán món luôn đúng bằng Total, không lệch 1₫", () => {
  const cases: [number, PricingLine[]][] = [
    [410000, [line(60)]],
    [820000, [line(70), line(58)]],
    [999999, [line(33.33), line(11.11), line(7.77)]],
    [1234567, [line(1.01, 3), line(99.99, 2), line(0.5, 7)]],
    [500000, [line(0), line(0)]], // chưa nhập ¥
  ];
  for (const [total, lines] of cases) {
    const margins = allocateMargins(total, lines, 4000, 170000);
    const withMargins = lines.map((l, i) => ({ ...l, marginVnd: margins[i] }));
    assert.equal(
      quotedTotalFromLines(withMargins, 4000),
      total,
      `lệch ở Total ${total}`,
    );
  }
});

test("chưa nhập ¥ → toàn bộ Total nằm ở lời, chia đều", () => {
  const m = allocateMargins(500000, [line(0), line(0)], 4000, 170000);
  assert.deepEqual(m, [250000, 250000]);
});

test("¥ cao hơn Total → lời âm, không chặn", () => {
  // 200¥ × 4000 = 800.000 > Total 410.000
  const m = allocateMargins(410000, [line(200)], 4000, 170000);
  assert.deepEqual(m, [-390000]);
  assert.equal(orderProfit([line(200, 1, m[0])]), -390000);
});

test("kéo lời một dòng thì các dòng khác bù lại, Total giữ nguyên", () => {
  const lines = [line(62, 1, 170000), line(58, 1, 170000)];
  const m = redistribute(lines, 0, 120000, 820000, 4000);
  assert.equal(m[0], 120000);
  assert.equal(m[0] + m[1], 340000, "tổng lời không đổi");
  const withMargins = lines.map((l, i) => ({ ...l, marginVnd: m[i] }));
  assert.equal(quotedTotalFromLines(withMargins, 4000), 820000);
});

test("đơn 1 dòng: không kéo được, lời luôn là phần dư", () => {
  const m = redistribute([line(60, 1, 170000)], 0, 50000, 410000, 4000);
  assert.deepEqual(m, [170000], "Total ghim cứng, giá trị kéo bị bỏ qua");
});

test("suy ngược ¥ gợi ý từ Total", () => {
  assert.equal(suggestCnyFromTotal(410000, 1, 4000, 170000), 60);
  assert.equal(suggestCnyFromTotal(820000, 2, 4000, 170000), 60);
});

test("suy ngược ra số âm → kẹp về 0, không gợi ý bậy", () => {
  assert.equal(suggestCnyFromTotal(100000, 1, 4000, 170000), 0);
});

test("suy ngược làm tròn 2 chữ số thập phân", () => {
  // (500.000 − 170.000) / 4000 = 82,5
  assert.equal(suggestCnyFromTotal(500000, 1, 4000, 170000), 82.5);
});

test("đơn bán từ kho: tỷ giá 1, giá vốn tính thẳng bằng VND", () => {
  const l = line(300000, 1, 0);
  assert.equal(lineCostVnd(l, 1), 300000);
  assert.equal(lineSellVnd(l, 1), 300000);
});

test("số lượng > 1 nhân đúng", () => {
  assert.equal(lineCostVnd(line(60, 3), 4000), 720000);
});

test("danh sách rỗng không làm vỡ", () => {
  assert.deepEqual(allocateMargins(410000, [], 4000, 170000), []);
  assert.equal(orderProfit([]), 0);
});

test("suy ngược ¥ từ giá phải thu", () => {
  // 1.000.000 − 170.000 lời = 830.000 tiền hàng; / 3600 = 230,555… → 230,56
  assert.equal(cnyFromSellPrice(1_000_000, 3600, 170_000), 230.56);
});

test("giá thu thấp hơn hoặc bằng lời mặc định → ¥ = 0", () => {
  assert.equal(cnyFromSellPrice(170_000, 3600, 170_000), 0);
  assert.equal(cnyFromSellPrice(50_000, 3600, 170_000), 0);
});

test("tỷ giá không hợp lệ → ¥ = 0, không chia cho 0", () => {
  assert.equal(cnyFromSellPrice(1_000_000, 0, 170_000), 0);
  assert.equal(cnyFromSellPrice(1_000_000, -1, 170_000), 0);
});

test("lời của dòng là phần dư: Σ giá bán khớp đúng giá thu × SL", () => {
  const sell = 1_000_000;
  const rate = 3600;
  const cny = cnyFromSellPrice(sell, rate, 170_000);
  const l: PricingLine = { quantity: 2, unitPriceCny: cny, marginVnd: 0 };
  const margin = marginFromSellPrice(sell, l, rate);
  assert.equal(lineSellVnd({ ...l, marginVnd: margin }, rate), sell * 2);
});

test("phần lẻ do làm tròn ¥ rơi vào lời, Total không lệch 1₫", () => {
  const rate = 3600;
  const lines = [
    { sell: 1_000_000, qty: 2 },
    { sell: 450_000, qty: 1 },
    { sell: 333_333, qty: 3 },
  ];
  const built = lines.map(({ sell, qty }) => {
    const unitPriceCny = cnyFromSellPrice(sell, rate, 170_000);
    const base: PricingLine = { quantity: qty, unitPriceCny, marginVnd: 0 };
    return { ...base, marginVnd: marginFromSellPrice(sell, base, rate) };
  });
  const expected = lines.reduce((s, l) => s + l.sell * l.qty, 0);
  assert.equal(quotedTotalFromLines(built, rate), expected);
});

test("thêm món: Total tăng đúng giá bán của món mới", () => {
  assert.equal(totalAfterAddLine(2_000_000, 450_000, 2), 2_900_000);
});

test("xoá món: Total giảm đúng giá bán của dòng bị xoá", () => {
  // 60¥ × 4000 = 240.000 giá vốn + 170.000 lời = 410.000 giá bán
  const removed: PricingLine = {
    quantity: 1,
    unitPriceCny: 60,
    marginVnd: 170_000,
  };
  assert.equal(totalAfterRemoveLine(2_000_000, removed, 4000), 1_590_000);
});

test("thêm rồi xoá đúng món đó thì Total quay về số cũ", () => {
  const rate = 4000;
  const sell = 450_000;
  const qty = 2;
  const cny = cnyFromSellPrice(sell, rate, 170_000);
  const base: PricingLine = { quantity: qty, unitPriceCny: cny, marginVnd: 0 };
  const line: PricingLine = {
    ...base,
    marginVnd: marginFromSellPrice(sell, base, rate),
  };
  const after = totalAfterAddLine(2_000_000, sell, qty);
  assert.equal(totalAfterRemoveLine(after, line, rate), 2_000_000);
});

test("suy ngược giá phải thu/1 cái từ dòng đã lưu", () => {
  // Dòng tạo từ giá thu 1.000.000, SL 2, tỷ giá 3600, lời mặc định 170.000
  const rate = 3600;
  const sell = 1_000_000;
  const cny = cnyFromSellPrice(sell, rate, 170_000);
  const base: PricingLine = { quantity: 2, unitPriceCny: cny, marginVnd: 0 };
  const line: PricingLine = {
    ...base,
    marginVnd: marginFromSellPrice(sell, base, rate),
  };
  assert.equal(sellPerUnitVnd(line, rate), sell);
});

test("suy ngược đúng cả khi lời đã bị rải lại", () => {
  // 60¥ × 4000 = 240.000 giá vốn + 170.000 lời = 410.000 giá bán, SL 1
  const line: PricingLine = { quantity: 1, unitPriceCny: 60, marginVnd: 170_000 };
  assert.equal(sellPerUnitVnd(line, 4000), 410_000);
});

test("Total sau khi đổi SỐ LƯỢNG của một dòng", () => {
  // Đơn 2.000.000, dòng cũ giá bán 410.000 (SL 1), đổi thành SL 3 giá thu 410.000
  const old: PricingLine = { quantity: 1, unitPriceCny: 60, marginVnd: 170_000 };
  assert.equal(
    totalAfterEditLine(2_000_000, old, 410_000, 3, 4000),
    2_000_000 - 410_000 + 410_000 * 3,
  );
});

test("Total sau khi đổi GIÁ THU của một dòng", () => {
  const old: PricingLine = { quantity: 1, unitPriceCny: 60, marginVnd: 170_000 };
  assert.equal(totalAfterEditLine(2_000_000, old, 500_000, 1, 4000), 2_090_000);
});

test("đổi cả số lượng lẫn giá thu", () => {
  const old: PricingLine = { quantity: 2, unitPriceCny: 60, marginVnd: 340_000 };
  // giá bán dòng cũ = 2×60×4000 + 340.000 = 820.000
  assert.equal(
    totalAfterEditLine(2_000_000, old, 300_000, 4, 4000),
    2_000_000 - 820_000 + 300_000 * 4,
  );
});

test("BẤT BIẾN: sửa dòng mà không đổi gì thì Total giữ nguyên", () => {
  const rate = 4000;
  const old: PricingLine = { quantity: 2, unitPriceCny: 60, marginVnd: 340_000 };
  const sell = sellPerUnitVnd(old, rate);
  assert.equal(totalAfterEditLine(2_000_000, old, sell, old.quantity, rate), 2_000_000);
});
