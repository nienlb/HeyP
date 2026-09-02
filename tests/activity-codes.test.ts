import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTION_LABELS,
  ACTIVITY_ENTITIES,
  actionLabel,
  entityOf,
} from "../src/lib/activity-codes.ts";

test("entityOf cắt phần trước dấu chấm", () => {
  assert.equal(entityOf("order.delete"), "order");
  assert.equal(entityOf("session.login_failed"), "session");
});

test("entityOf với mã không có dấu chấm trả nguyên chuỗi", () => {
  assert.equal(entityOf("linhtinh"), "linhtinh");
});

test("mọi mã trong ACTION_LABELS đều có entity hợp lệ", () => {
  for (const code of Object.keys(ACTION_LABELS)) {
    assert.ok(
      (ACTIVITY_ENTITIES as readonly string[]).includes(entityOf(code)),
      `Mã ${code} có entity "${entityOf(code)}" không nằm trong ACTIVITY_ENTITIES`,
    );
  }
});

test("actionLabel trả nhãn tiếng Việt cho mã đã biết", () => {
  assert.equal(actionLabel("order.delete"), "Xoá đơn");
  assert.equal(actionLabel("cny.topup"), "Nạp ví ¥");
});

test("actionLabel trả chính mã khi chưa có nhãn — không ném lỗi", () => {
  // Nhật ký phải đọc được kể cả khi có mã cũ mà bảng nhãn không còn.
  assert.equal(actionLabel("gi.do.la"), "gi.do.la");
});

test("không mã nào thiếu nhãn", () => {
  for (const [code, label] of Object.entries(ACTION_LABELS)) {
    assert.ok(label.trim().length > 0, `Mã ${code} có nhãn rỗng`);
  }
});
