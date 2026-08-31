import { test } from "node:test";
import assert from "node:assert/strict";
import { SETTING_DEFAULTS, parseSettings } from "../src/lib/settings.ts";

test("không có bản ghi nào → dùng mặc định", () => {
  const s = parseSettings([]);
  assert.equal(s.sellRate, 4000);
  assert.equal(s.defaultMarginVnd, 170000);
});

test("đọc được giá trị từ DB", () => {
  const s = parseSettings([
    { key: "sell_rate", value: "4100" },
    { key: "default_margin_vnd", value: "200000" },
  ]);
  assert.equal(s.sellRate, 4100);
  assert.equal(s.defaultMarginVnd, 200000);
});

test("giá trị rác → rơi về mặc định, không làm vỡ app", () => {
  const s = parseSettings([
    { key: "sell_rate", value: "abc" },
    { key: "default_margin_vnd", value: "" },
  ]);
  assert.equal(s.sellRate, SETTING_DEFAULTS.sellRate);
  assert.equal(s.defaultMarginVnd, SETTING_DEFAULTS.defaultMarginVnd);
});

test("tỷ giá bán 0 hoặc âm là vô nghĩa → mặc định", () => {
  assert.equal(parseSettings([{ key: "sell_rate", value: "0" }]).sellRate, 4000);
  assert.equal(parseSettings([{ key: "sell_rate", value: "-5" }]).sellRate, 4000);
});

test("chưa từng sao lưu → lastBackupAt là null, KHÔNG phải 0", () => {
  assert.equal(parseSettings([]).lastBackupAt, null);
});

test("đọc được mốc sao lưu gần nhất", () => {
  const s = parseSettings([{ key: "last_backup_at", value: "1756600000" }]);
  assert.equal(s.lastBackupAt, 1756600000);
});

test("giá trị rác ở mốc sao lưu → null, coi như chưa từng sao lưu", () => {
  assert.equal(
    parseSettings([{ key: "last_backup_at", value: "abc" }]).lastBackupAt,
    null,
  );
  assert.equal(
    parseSettings([{ key: "last_backup_at", value: "" }]).lastBackupAt,
    null,
  );
});
