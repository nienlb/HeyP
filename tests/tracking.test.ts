import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CARRIER_ADAPTERS,
  getAdapter,
  knownCarriers,
} from "../src/lib/tracking.ts";

test("MVP: chưa có adapter đơn vị nào (registry rỗng)", () => {
  assert.equal(CARRIER_ADAPTERS.length, 0);
  assert.deepEqual(knownCarriers(), []);
});

test("getAdapter trả undefined khi không có/không khớp carrier", () => {
  assert.equal(getAdapter(null), undefined);
  assert.equal(getAdapter(undefined), undefined);
  assert.equal(getAdapter("Nhà xe ABC"), undefined);
});
