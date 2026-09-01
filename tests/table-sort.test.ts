import { test } from "node:test";
import assert from "node:assert/strict";
import { sortRows } from "../src/lib/table-sort.ts";

type Row = { id: number; ten: string; tien: number | null };

const ROWS: Row[] = [
  { id: 1, ten: "Bình", tien: 300 },
  { id: 2, ten: "Ánh", tien: 100 },
  { id: 3, ten: "Cường", tien: null },
  { id: 4, ten: "Ánh", tien: 200 },
];

test("sắp xếp số tăng dần", () => {
  const out = sortRows(ROWS, (r) => r.tien, "asc");
  assert.deepEqual(
    out.map((r) => r.id),
    [2, 4, 1, 3],
  );
});

test("sắp xếp số giảm dần", () => {
  const out = sortRows(ROWS, (r) => r.tien, "desc");
  assert.deepEqual(
    out.map((r) => r.id),
    [1, 4, 2, 3],
  );
});

test("null luôn xuống cuối, bất kể chiều", () => {
  const asc = sortRows(ROWS, (r) => r.tien, "asc");
  const desc = sortRows(ROWS, (r) => r.tien, "desc");
  assert.equal(asc[asc.length - 1].id, 3);
  assert.equal(desc[desc.length - 1].id, 3);
});

test("chuỗi so theo tiếng Việt: Á đứng trước B", () => {
  const out = sortRows(ROWS, (r) => r.ten, "asc");
  assert.deepEqual(
    out.map((r) => r.ten),
    ["Ánh", "Ánh", "Bình", "Cường"],
  );
});

test("ổn định: hai hàng cùng khoá giữ nguyên thứ tự gốc", () => {
  const out = sortRows(ROWS, (r) => r.ten, "asc");
  // Hai "Ánh": id 2 đứng trước id 4 trong mảng gốc.
  assert.deepEqual(
    out.filter((r) => r.ten === "Ánh").map((r) => r.id),
    [2, 4],
  );
});

test("không có keyOf thì trả nguyên thứ tự gốc", () => {
  const out = sortRows(ROWS, undefined, "desc");
  assert.deepEqual(
    out.map((r) => r.id),
    [1, 2, 3, 4],
  );
});

test("không sửa mảng gốc", () => {
  const before = ROWS.map((r) => r.id);
  sortRows(ROWS, (r) => r.tien, "desc");
  assert.deepEqual(
    ROWS.map((r) => r.id),
    before,
  );
});
