import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ROLE_LABELS,
  USER_ROLES,
  guardLastAdmin,
  guardSelfAction,
  parseRole,
} from "../src/lib/roles.ts";

test("đúng hai vai trò, mỗi vai trò có nhãn tiếng Việt", () => {
  assert.deepEqual([...USER_ROLES], ["admin", "nhan_vien"]);
  for (const r of USER_ROLES) assert.equal(typeof ROLE_LABELS[r], "string");
});

test("parseRole lọc chuỗi lạ", () => {
  assert.equal(parseRole("admin"), "admin");
  assert.equal(parseRole("nhan_vien"), "nhan_vien");
  assert.equal(parseRole("superuser"), null);
  assert.equal(parseRole(""), null);
});

test("không được tự tác động lên chính mình", () => {
  assert.equal(typeof guardSelfAction(3, 3), "string");
  assert.equal(guardSelfAction(3, 4), null);
});

test("không được hạ/khoá/xoá admin đang hoạt động cuối cùng", () => {
  const admin = { role: "admin" as const, active: true };
  assert.equal(typeof guardLastAdmin(admin, 1), "string");
  assert.equal(guardLastAdmin(admin, 2), null);
});

test("admin đã khoá hoặc nhân viên không bị luật admin cuối chặn", () => {
  assert.equal(guardLastAdmin({ role: "admin", active: false }, 1), null);
  assert.equal(guardLastAdmin({ role: "nhan_vien", active: true }, 1), null);
});
