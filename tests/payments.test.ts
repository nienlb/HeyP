import { test } from "node:test";
import assert from "node:assert/strict";
import { amountDue, sumPaid } from "../src/lib/payments.ts";

test("chưa trả đồng nào", () => {
  assert.equal(sumPaid([]), 0);
  assert.equal(amountDue(410000, 0, []), 410000);
});

test("cọc rồi thu nốt", () => {
  const ps = [{ amountVnd: 100000 }, { amountVnd: 310000 }];
  assert.equal(sumPaid(ps), 410000);
  assert.equal(amountDue(410000, 0, ps), 0);
});

test("hoàn trả mang dấu âm nên tự trừ, không cần nhánh riêng", () => {
  const ps = [{ amountVnd: 410000 }, { amountVnd: -50000 }];
  assert.equal(sumPaid(ps), 360000);
  assert.equal(amountDue(410000, 0, ps), 50000);
});

test("ship cộng vào phần phải thu", () => {
  assert.equal(amountDue(410000, 30000, [{ amountVnd: 100000 }]), 340000);
});

test("khách trả dư → còn phải thu âm (phải hoàn lại khách)", () => {
  assert.equal(amountDue(410000, 0, [{ amountVnd: 500000 }]), -90000);
});

test("làm tròn về số nguyên đồng", () => {
  assert.equal(amountDue(410000.4, 0.4, [{ amountVnd: 0 }]), 410000);
});
