import { test } from "node:test";
import assert from "node:assert/strict";
import { groupVnd, parseDecimal, parseVnd } from "../src/lib/parse-number.ts";

test("VND: dấu chấm là ngăn nghìn, KHÔNG phải thập phân", () => {
  // Bug thật đã xảy ra: Number("500.000") = 500, cọc bị lưu sai 1000 lần.
  assert.equal(parseVnd("500.000"), 500_000);
  assert.equal(parseVnd("1.000.000"), 1_000_000);
  assert.equal(parseVnd("4.520.000"), 4_520_000);
});

test("VND: nhận cả dấu phẩy và khoảng trắng", () => {
  assert.equal(parseVnd("1,000,000"), 1_000_000);
  assert.equal(parseVnd("1 000 000"), 1_000_000);
  assert.equal(parseVnd(" 500000 "), 500_000);
});

test("VND: số trần và rỗng", () => {
  assert.equal(parseVnd("500000"), 500_000);
  assert.equal(parseVnd(500_000), 500_000);
  assert.equal(parseVnd(""), 0);
  assert.equal(parseVnd(null), 0);
  assert.equal(parseVnd(undefined), 0);
  assert.equal(parseVnd("abc"), 0);
});

test("VND: số âm giữ nguyên dấu (validate ở nơi khác)", () => {
  assert.equal(parseVnd("-5.000"), -5_000);
});

test("thập phân: dấu chấm PHẢI giữ — dùng cho ¥ và tỷ giá", () => {
  // Bug thật đã xảy ra: dùng parser VND cho ¥ biến 207.5 thành 2075.
  assert.equal(parseDecimal("207.5"), 207.5);
  assert.equal(parseDecimal("4000"), 4000);
  assert.equal(parseDecimal("0.5"), 0.5);
});

test("thập phân: bỏ phẩy và khoảng trắng, rỗng ra 0", () => {
  assert.equal(parseDecimal("1,234.5"), 1234.5);
  assert.equal(parseDecimal(" 60 "), 60);
  assert.equal(parseDecimal(""), 0);
  assert.equal(parseDecimal(null), 0);
  assert.equal(parseDecimal("abc"), 0);
});

test("groupVnd định dạng kiểu Việt, rỗng giữ nguyên rỗng", () => {
  assert.equal(groupVnd("500000"), "500.000");
  assert.equal(groupVnd("1000000"), "1.000.000");
  assert.equal(groupVnd(""), "");
  assert.equal(groupVnd("   "), "   ");
});

test("BẤT BIẾN: định dạng rồi đọc lại phải ra đúng số ban đầu", () => {
  for (const n of [0, 1, 500, 500_000, 1_000_000, 4_520_000, 123_456_789]) {
    assert.equal(parseVnd(groupVnd(String(n))), n, `lỗi ở ${n}`);
  }
});

test("tỷ giá đọc bằng parseVnd: '4.000' phải ra 4000, không phải 4", () => {
  // Màn Cài đặt hiển thị tỷ giá đã định dạng ("4.000"). Dùng parseDecimal ở
  // đây từng làm tỷ giá sai 1000 lần — client và server phải cùng một luật.
  assert.equal(parseVnd("4.000"), 4000);
  assert.equal(parseVnd("4000"), 4000);
  // Đối chiếu: parseDecimal sẽ hiểu sai chuỗi đó.
  assert.equal(parseDecimal("4.000"), 4);
});
