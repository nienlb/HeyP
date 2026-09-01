import { test } from "node:test";
import assert from "node:assert/strict";
import { ageBadge } from "../src/lib/order-badge.ts";

test("đơn bình thường: không badge", () => {
  assert.equal(
    ageBadge({ status: "da_mua_tq", isStale: false, ageDays: 3 }),
    null,
  );
});

test("đơn quá hạn: hiện số ngày", () => {
  assert.equal(
    ageBadge({ status: "da_mua_tq", isStale: true, ageDays: 12 }),
    "⏳ 12n",
  );
});

test("đơn sự cố: hiện số ngày kể cả khi chưa quá hạn", () => {
  assert.equal(ageBadge({ status: "su_co", isStale: false, ageDays: 2 }), "⏳ 2n");
});

test("đơn đã hoàn tất không bao giờ có badge", () => {
  assert.equal(
    ageBadge({ status: "hoan_tat", isStale: false, ageDays: 400 }),
    null,
  );
});
