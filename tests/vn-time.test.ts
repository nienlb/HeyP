import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shortDateVn,
  vnMidnightMs,
  vnYmd,
  yearInVn,
  yearsFromDates,
} from "../src/lib/vn-time.ts";

test("đúng năm cho một thời điểm giữa năm", () => {
  assert.equal(yearInVn(new Date("2026-06-15T03:00:00Z")), 2026);
});

test("5h sáng 01/01 giờ VN vẫn là năm mới, dù UTC còn ở năm cũ", () => {
  // 2025-12-31T22:00:00Z = 2026-01-01 05:00 giờ VN (UTC+7).
  // Đây là ca đã suýt làm đơn rơi nhầm năm — xem spec mục 6.2.
  assert.equal(yearInVn(new Date("2025-12-31T22:00:00Z")), 2026);
});

test("23h30 ngày 31/12 giờ VN vẫn là năm cũ", () => {
  // 2025-12-31T16:30:00Z = 2025-12-31 23:30 giờ VN.
  assert.equal(yearInVn(new Date("2025-12-31T16:30:00Z")), 2025);
});

test("danh sách năm: giảm dần, không trùng", () => {
  const out = yearsFromDates([
    new Date("2025-03-01T00:00:00Z"),
    new Date("2026-07-01T00:00:00Z"),
    new Date("2025-09-01T00:00:00Z"),
    new Date("2025-12-31T22:00:00Z"), // → 2026 giờ VN
  ]);
  assert.deepEqual(out, [2026, 2025]);
});

test("mảng rỗng trả mảng rỗng", () => {
  assert.deepEqual(yearsFromDates([]), []);
});

test("vnYmd: 23:30 UTC là sáng hôm sau ở VN", () => {
  assert.deepEqual(vnYmd(new Date("2026-09-20T23:30:00Z")), { y: 2026, m: 9, d: 21 });
  assert.deepEqual(vnYmd(new Date("2026-09-20T16:59:59Z")), { y: 2026, m: 9, d: 20 });
});

test("vnMidnightMs: 00:00 giờ VN = 17:00 UTC hôm trước, tràn tháng tự xử lý", () => {
  assert.equal(vnMidnightMs(2026, 9, 21), Date.parse("2026-09-20T17:00:00Z"));
  assert.equal(vnMidnightMs(2026, 13, 1), Date.parse("2026-12-31T17:00:00Z"));
  assert.equal(vnMidnightMs(2026, 0, 1), Date.parse("2025-11-30T17:00:00Z"));
});

test("shortDateVn: cùng năm dd/mm, khác năm dd/mm/yy", () => {
  const now = new Date("2026-09-21T05:00:00Z");
  assert.equal(shortDateVn(new Date("2026-09-20T23:30:00Z"), now), "21/09");
  assert.equal(shortDateVn(new Date("2025-12-31T18:00:00Z"), now), "01/01");
  assert.equal(shortDateVn(new Date("2025-12-31T10:00:00Z"), now), "31/12/25");
});
