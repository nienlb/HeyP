import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeOrderMoney,
  sumLineItemsCny,
  validateLineItem,
  validateOrderMoney,
} from "../src/lib/money.ts";

test("công thức tính tiền cơ bản", () => {
  // 200 tệ × 3600 = 720.000; + 50.000 dịch vụ + 120.000 ship − 300.000 cọc
  const r = computeOrderMoney({
    goodsTotalCny: 200,
    exchangeRate: 3600,
    serviceFee: 50000,
    shippingFee: 120000,
    deposit: 300000,
  });
  assert.equal(r.goodsTotalVnd, 720000);
  assert.equal(r.subtotalVnd, 890000);
  assert.equal(r.amountDue, 590000);
});

test("làm tròn tiền hàng quy đổi về số nguyên đồng", () => {
  // 199.99 × 3605 = 720.963,95 → làm tròn 720.964
  const r = computeOrderMoney({
    goodsTotalCny: 199.99,
    exchangeRate: 3605,
    serviceFee: 0,
    shippingFee: 0,
    deposit: 0,
  });
  assert.equal(r.goodsTotalVnd, 720964);
  assert.equal(r.amountDue, 720964);
});

test("cọc lớn hơn tổng → còn phải thu âm (hoàn lại khách)", () => {
  const r = computeOrderMoney({
    goodsTotalCny: 100,
    exchangeRate: 3600,
    serviceFee: 0,
    shippingFee: 0,
    deposit: 500000,
  });
  assert.equal(r.goodsTotalVnd, 360000);
  assert.equal(r.amountDue, -140000);
});

test("tổng tiền hàng từ nhiều dòng sản phẩm", () => {
  const total = sumLineItemsCny([
    { quantity: 2, unitPriceCny: 35.5 },
    { quantity: 3, unitPriceCny: 10 },
    { quantity: 1, unitPriceCny: 99 },
  ]);
  assert.equal(total, 71 + 30 + 99);
});

test("validate khối tiền: tỷ giá phải > 0", () => {
  const errs = validateOrderMoney({
    goodsTotalCny: 100,
    exchangeRate: 0,
    serviceFee: 0,
    shippingFee: 0,
    deposit: 0,
  });
  assert.ok(errs.some((e) => e.field === "exchangeRate"));
});

test("validate khối tiền: chặn số âm", () => {
  const errs = validateOrderMoney({
    goodsTotalCny: -1,
    exchangeRate: 3600,
    serviceFee: -1,
    shippingFee: -1,
    deposit: -1,
  });
  const fields = errs.map((e) => e.field).sort();
  assert.deepEqual(fields, [
    "deposit",
    "goodsTotalCny",
    "serviceFee",
    "shippingFee",
  ]);
});

test("validate khối tiền hợp lệ → không lỗi", () => {
  const errs = validateOrderMoney({
    goodsTotalCny: 100,
    exchangeRate: 3600,
    serviceFee: 50000,
    shippingFee: 0,
    deposit: 0,
  });
  assert.equal(errs.length, 0);
});

test("validate dòng sản phẩm: số lượng & giá phải > 0", () => {
  assert.equal(validateLineItem({ quantity: 1, unitPriceCny: 10 }).length, 0);
  assert.ok(
    validateLineItem({ quantity: 0, unitPriceCny: 10 }).some(
      (e) => e.field === "quantity",
    ),
  );
  assert.ok(
    validateLineItem({ quantity: 1, unitPriceCny: 0 }).some(
      (e) => e.field === "unitPriceCny",
    ),
  );
});
