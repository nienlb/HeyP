import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_FILTERS,
  activeGroupCount,
  clearGroup,
  dateBounds,
  filtersToParams,
  matchesOrderFilters,
  parseOrderFilters,
} from "../src/lib/order-filters.ts";

// 21/09/2026 12:00 giờ VN.
const NOW = new Date("2026-09-21T05:00:00Z");
const row = (over: Partial<Parameters<typeof matchesOrderFilters>[0]> = {}) => ({
  createdAt: new Date("2026-09-21T02:00:00Z"),
  status: "da_mua_tq" as const,
  orderType: "order_ho" as const,
  amountDue: 100_000,
  ...over,
});

test("parse: giá trị hợp lệ", () => {
  const f = parseOrderFilters({
    d: "7d",
    st: "da_mua_tq,da_giao_khach",
    type: "ban_tu_kho",
    due: "owing",
  });
  assert.deepEqual(f, {
    date: { preset: "7d" },
    statuses: ["da_mua_tq", "da_giao_khach"],
    types: ["ban_tu_kho"],
    due: "owing",
  });
});

test("parse: giá trị lạ bị bỏ qua, không lỗi; mã về hưu không lọc được", () => {
  const f = parseOrderFilters({
    d: "xyz",
    st: "da_mua_tq,bogus,cho_bao_gia,da_mua_tq",
    type: "abc",
    due: "maybe",
  });
  assert.deepEqual(f, { ...EMPTY_FILTERS, statuses: ["da_mua_tq"] });
});

test("parse: khoảng ngày, đảo ngược thì tự sửa, sai định dạng thì bỏ", () => {
  assert.deepEqual(parseOrderFilters({ d: "2026-09-01_2026-09-15" }).date, {
    from: "2026-09-01",
    to: "2026-09-15",
  });
  assert.deepEqual(parseOrderFilters({ d: "2026-09-15_2026-09-01" }).date, {
    from: "2026-09-01",
    to: "2026-09-15",
  });
  assert.equal(parseOrderFilters({ d: "2026-9-1_2026-09-15" }).date, null);
});

test("serialize rồi parse lại ra đúng cái cũ, và giữ tham số khác", () => {
  const f = parseOrderFilters({
    d: "2026-09-01_2026-09-15",
    st: "hoan_tat",
    due: "paid",
  });
  const p = filtersToParams(f, new URLSearchParams("q=lan&f=&d=today"));
  assert.equal(p.get("q"), "lan");
  assert.equal(p.get("f"), "");
  assert.deepEqual(
    parseOrderFilters(Object.fromEntries(p) as Record<string, string>),
    f,
  );
  assert.equal(
    filtersToParams(EMPTY_FILTERS, new URLSearchParams("d=7d")).has("d"),
    false,
  );
});

test("dateBounds: hôm nay theo giờ VN", () => {
  const b = dateBounds({ preset: "today" }, NOW);
  assert.equal(b.fromMs, Date.parse("2026-09-20T17:00:00Z"));
  assert.equal(b.toMs, Date.parse("2026-09-21T17:00:00Z"));
});

test("dateBounds: 7 ngày = hôm nay + 6 ngày trước", () => {
  const b = dateBounds({ preset: "7d" }, NOW);
  assert.equal(b.fromMs, Date.parse("2026-09-14T17:00:00Z"));
  assert.equal(b.toMs, Date.parse("2026-09-21T17:00:00Z"));
});

test("dateBounds: tháng trước khi đang ở tháng 1 lùi về tháng 12 năm trước", () => {
  const jan = new Date("2027-01-10T05:00:00Z");
  const b = dateBounds({ preset: "prev_month" }, jan);
  assert.equal(b.fromMs, Date.parse("2026-11-30T17:00:00Z"));
  assert.equal(b.toMs, Date.parse("2026-12-31T17:00:00Z"));
});

test("dateBounds: khoảng từ–đến bao gồm cả ngày cuối", () => {
  const b = dateBounds({ from: "2026-09-01", to: "2026-09-15" }, NOW);
  assert.equal(b.fromMs, Date.parse("2026-08-31T17:00:00Z"));
  assert.equal(b.toMs, Date.parse("2026-09-15T17:00:00Z"));
});

test("match: biên ngày theo giờ VN — 23:30 và 00:30", () => {
  const f = { ...EMPTY_FILTERS, date: { preset: "today" as const } };
  // 20/09 23:30 giờ VN — hôm qua.
  assert.equal(
    matchesOrderFilters(row({ createdAt: new Date("2026-09-20T16:30:00Z") }), f, NOW),
    false,
  );
  // 21/09 00:30 giờ VN — hôm nay (theo UTC vẫn là 20/09).
  assert.equal(
    matchesOrderFilters(row({ createdAt: new Date("2026-09-20T17:30:00Z") }), f, NOW),
    true,
  );
});

test("match: trạng thái và loại đơn là HOẶC trong nhóm, VÀ giữa các nhóm", () => {
  const ff = parseOrderFilters({ st: "da_mua_tq,hoan_tat", type: "order_ho" });
  assert.equal(matchesOrderFilters(row(), ff, NOW), true);
  assert.equal(matchesOrderFilters(row({ status: "hoan_tat" }), ff, NOW), true);
  assert.equal(matchesOrderFilters(row({ status: "khach_chot" }), ff, NOW), false);
  assert.equal(
    matchesOrderFilters(row({ orderType: "ban_tu_kho" }), ff, NOW),
    false,
  );
});

test("match: còn nợ bỏ qua đơn huỷ và đơn nhập kho (giống chip Chưa thu đủ)", () => {
  const owing = { ...EMPTY_FILTERS, due: "owing" as const };
  const paid = { ...EMPTY_FILTERS, due: "paid" as const };
  assert.equal(matchesOrderFilters(row(), owing, NOW), true);
  assert.equal(matchesOrderFilters(row({ status: "huy" }), owing, NOW), false);
  assert.equal(
    matchesOrderFilters(row({ orderType: "nhap_kho" }), owing, NOW),
    false,
  );
  assert.equal(matchesOrderFilters(row({ amountDue: 0 }), paid, NOW), true);
  assert.equal(matchesOrderFilters(row(), paid, NOW), false);
});

test("đếm nhóm đang lọc và xoá một nhóm", () => {
  const f = parseOrderFilters({ d: "month", st: "hoan_tat", due: "paid" });
  assert.equal(activeGroupCount(f), 3);
  assert.equal(activeGroupCount(clearGroup(f, "status")), 2);
  assert.equal(activeGroupCount(EMPTY_FILTERS), 0);
});
