import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldDeductCny } from "../src/lib/cny-wallet.ts";

test("đơn order hộ vừa tới 'đã mua' → trừ ví", () => {
  assert.equal(
    shouldDeductCny({
      orderType: "order_ho",
      toStatus: "da_mua_tq",
      goodsTotalCny: 320,
      alreadyDeducted: false,
    }),
    true,
  );
});

test("đơn nhập kho cũng trừ ví — đây là lỗ cũ đang vá", () => {
  assert.equal(
    shouldDeductCny({
      orderType: "nhap_kho",
      toStatus: "da_mua_tq",
      goodsTotalCny: 500,
      alreadyDeducted: false,
    }),
    true,
  );
});

test("đã trừ rồi thì không trừ lần hai (sự cố rồi quay lại)", () => {
  assert.equal(
    shouldDeductCny({
      orderType: "order_ho",
      toStatus: "da_mua_tq",
      goodsTotalCny: 320,
      alreadyDeducted: true,
    }),
    false,
  );
});

test("chưa nhập giá ¥ thì không ghi dòng chi vô nghĩa", () => {
  assert.equal(
    shouldDeductCny({
      orderType: "order_ho",
      toStatus: "da_mua_tq",
      goodsTotalCny: 0,
      alreadyDeducted: false,
    }),
    false,
  );
});

test("trạng thái khác 'đã mua' thì không đụng ví", () => {
  assert.equal(
    shouldDeductCny({
      orderType: "order_ho",
      toStatus: "da_giao_khach",
      goodsTotalCny: 320,
      alreadyDeducted: false,
    }),
    false,
  );
});

test("đơn bán từ kho không bao giờ trừ ví ¥ — cột goods_total_cny của nó là VND", () => {
  assert.equal(
    shouldDeductCny({
      orderType: "ban_tu_kho",
      toStatus: "da_mua_tq",
      goodsTotalCny: 1_200_000,
      alreadyDeducted: false,
    }),
    false,
  );
});
