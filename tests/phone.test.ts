import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchesCustomer,
  normalizePhone,
  phoneNeedle,
} from "../src/lib/phone.ts";

test("bỏ mọi ký tự không phải số", () => {
  assert.equal(normalizePhone("0912.345 678"), "0912345678");
  assert.equal(normalizePhone("(091) 234-5678"), "0912345678");
});

test("+84 và 84 đầu số đổi về 0", () => {
  assert.equal(normalizePhone("+84 912 345 678"), "0912345678");
  assert.equal(normalizePhone("84912345678"), "0912345678");
  // Gõ dở "+84 91" vẫn đổi — dấu + nói rõ đây là mã nước.
  assert.equal(normalizePhone("+84 91"), "091");
});

test("84 đứng đầu một số NGẮN không bị đổi (có thể là đoạn giữa số)", () => {
  assert.equal(normalizePhone("8491"), "8491");
});

test("phoneNeedle: cần ít nhất 3 chữ số và chỉ gồm ký tự của số điện thoại", () => {
  assert.equal(phoneNeedle("09"), null);
  assert.equal(phoneNeedle("Lan"), null);
  assert.equal(phoneNeedle("Lan 0912"), null);
  assert.equal(phoneNeedle("0912"), "0912");
  assert.equal(phoneNeedle("912 345"), "912345");
  assert.equal(phoneNeedle("+84 912"), "0912");
});

test("matchesCustomer khớp tên (không phân biệt hoa thường) hoặc SĐT một phần", () => {
  const c = { name: "Lan Anh", phone: "0912 345 678" };
  assert.equal(matchesCustomer(c, "lan"), true);
  assert.equal(matchesCustomer(c, "0912"), true);
  assert.equal(matchesCustomer(c, "345 678"), true);
  assert.equal(matchesCustomer(c, "+84 912"), true);
  assert.equal(matchesCustomer(c, "0988"), false);
  assert.equal(matchesCustomer({ name: "Hoa", phone: null }, "0912"), false);
  assert.equal(matchesCustomer(c, ""), true);
});
