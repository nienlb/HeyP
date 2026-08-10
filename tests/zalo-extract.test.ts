import { test } from "node:test";
import assert from "node:assert/strict";
import { itemAttributes } from "../src/lib/zalo-extract.ts";

test("ghép thuộc tính màu + size", () => {
  assert.equal(
    itemAttributes({ name: "Slingback", color: "be", size: "36", quantity: 1 }),
    "màu be - size 36",
  );
});

test("thiếu màu hoặc size thì bỏ phần đó", () => {
  assert.equal(
    itemAttributes({ name: "X", color: null, size: "39", quantity: 1 }),
    "size 39",
  );
  assert.equal(
    itemAttributes({ name: "X", color: "đen", size: null, quantity: 1 }),
    "màu đen",
  );
  assert.equal(
    itemAttributes({ name: "X", color: null, size: null, quantity: 1 }),
    "",
  );
});
