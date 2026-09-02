import { test } from "node:test";
import assert from "node:assert/strict";
import {
  atLeast,
  guardLastOwner,
  guardSelfAction,
  parseRole,
  ROLE_LABELS,
  USER_ROLES,
} from "../src/lib/roles.ts";

test("ba vai trò, đúng thứ tự từ cao xuống thấp", () => {
  assert.deepEqual([...USER_ROLES], ["owner", "admin", "member"]);
});

test("nhãn dùng đúng chữ tiếng Anh, không dịch", () => {
  assert.equal(ROLE_LABELS.owner, "Owner");
  assert.equal(ROLE_LABELS.admin, "Admin");
  assert.equal(ROLE_LABELS.member, "Member");
});

test("atLeast: owner làm được mọi thứ admin làm được", () => {
  assert.equal(atLeast("owner", "admin"), true);
  assert.equal(atLeast("owner", "member"), true);
  assert.equal(atLeast("owner", "owner"), true);
});

test("atLeast: admin KHÔNG chạm được bậc owner", () => {
  assert.equal(atLeast("admin", "owner"), false);
  assert.equal(atLeast("admin", "admin"), true);
  assert.equal(atLeast("admin", "member"), true);
});

test("atLeast: member chỉ ở bậc member", () => {
  assert.equal(atLeast("member", "owner"), false);
  assert.equal(atLeast("member", "admin"), false);
  assert.equal(atLeast("member", "member"), true);
});

test("parseRole nhận ba giá trị mới", () => {
  assert.equal(parseRole("owner"), "owner");
  assert.equal(parseRole("admin"), "admin");
  assert.equal(parseRole("member"), "member");
});

test("parseRole TỪ CHỐI mã cũ nhan_vien", () => {
  // Migration 0006 đã đổi hết sang 'member'. Còn nhận 'nhan_vien' thì một
  // form cũ hoặc URL gõ tay sẽ ghi lại giá trị chết vào DB.
  assert.equal(parseRole("nhan_vien"), null);
  assert.equal(parseRole("linh tinh"), null);
  assert.equal(parseRole(""), null);
});

test("guardLastOwner: chặn khi chỉ còn một owner đang hoạt động", () => {
  const err = guardLastOwner({ role: "owner", active: true }, 1);
  assert.ok(err, "phải trả về thông báo chặn");
  assert.match(err, /owner/i);
});

test("guardLastOwner: cho qua khi còn từ hai owner trở lên", () => {
  assert.equal(guardLastOwner({ role: "owner", active: true }, 2), null);
});

test("guardLastOwner: không chặn khi target không phải owner", () => {
  assert.equal(guardLastOwner({ role: "admin", active: true }, 1), null);
  assert.equal(guardLastOwner({ role: "member", active: true }, 1), null);
});

test("guardLastOwner: không chặn khi owner đó vốn đã bị khoá", () => {
  // Đã khoá thì nó không nằm trong activeOwnerCount, xoá nó không làm mất
  // owner nào đang hoạt động.
  assert.equal(guardLastOwner({ role: "owner", active: false }, 1), null);
});

test("guardSelfAction chặn tự thao tác lên chính mình", () => {
  assert.ok(guardSelfAction(5, 5));
  assert.equal(guardSelfAction(5, 6), null);
});
