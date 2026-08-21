import { test } from "node:test";
import assert from "node:assert/strict";
import { canTransition } from "../src/lib/order-status.ts";

/**
 * autoCompleteIfPaid đụng DB nên không test trực tiếp ở tầng unit (dự án
 * không có thư viện mock DB). Ở đây khoá phần LUẬT mà nó dựa vào: bước
 * da_giao_khach → hoan_tat phải hợp lệ với mọi loại đơn có khâu giao, nếu
 * không thì tự động hoàn tất sẽ âm thầm không chạy.
 */
test("da_giao_khach → hoan_tat hợp lệ, nếu không tự động hoàn tất sẽ chết câm", () => {
  assert.ok(canTransition("order_ho", "da_giao_khach", "hoan_tat"));
  assert.ok(canTransition("ban_tu_kho", "da_giao_khach", "hoan_tat"));
});

test("đơn nhap_kho không có khâu giao nên không dính luật tự động hoàn tất", () => {
  assert.equal(canTransition("nhap_kho", "da_mua_tq", "hoan_tat"), false);
});
