import { test } from "node:test";
import assert from "node:assert/strict";
import {
  currentRate,
  replayLedger,
  walletValueVnd,
  type LedgerEntry,
} from "../src/lib/cny-wallet.ts";

const nap = (cny: number, vnd: number): LedgerEntry => ({
  kind: "nap",
  cnyDelta: cny,
  vndPaid: vnd,
});
const chi = (cny: number): LedgerEntry => ({
  kind: "chi",
  cnyDelta: -cny,
  vndPaid: null,
});

test("sổ rỗng → số dư 0, giá vốn 0", () => {
  const s = replayLedger([]);
  assert.equal(s.balance, 0);
  assert.equal(s.avgCost, 0);
});

test("nạp lần đầu: giá vốn = VND trả ÷ ¥ nhận", () => {
  // 10.000.000₫ mua 2.700¥ → 3.703,7₫/¥
  const s = replayLedger([nap(2700, 10000000)]);
  assert.equal(s.balance, 2700);
  assert.equal(Math.round(s.avgCost), 3704);
});

test("nạp đợt hai: bình quân gia quyền", () => {
  // 1000¥ giá 3.600 + 1000¥ giá 3.800 → bq 3.700
  const s = replayLedger([nap(1000, 3600000), nap(1000, 3800000)]);
  assert.equal(s.balance, 2000);
  assert.equal(s.avgCost, 3700);
});

test("chi tiền chỉ trừ số dư, KHÔNG làm đổi giá vốn", () => {
  const s = replayLedger([nap(1000, 3600000), chi(400)]);
  assert.equal(s.balance, 600);
  assert.equal(s.avgCost, 3600);
});

test("chi rồi nạp tiếp: bình quân tính trên số dư CÒN LẠI", () => {
  // còn 600¥ giá 3.600 (=2.160.000) + nạp 400¥ giá 4.000 (=1.600.000)
  // → (2.160.000 + 1.600.000) / 1000 = 3.760
  const s = replayLedger([nap(1000, 3600000), chi(400), nap(400, 1600000)]);
  assert.equal(s.balance, 1000);
  assert.equal(s.avgCost, 3760);
});

test("số dư âm được phép — ghi được sự thật quan trọng hơn sổ đẹp", () => {
  const s = replayLedger([nap(100, 360000), chi(300)]);
  assert.equal(s.balance, -200);
});

test("nạp khi số dư ÂM → ĐẶT LẠI giá vốn, không bình quân với số âm", () => {
  // Bình quân với số dư âm cho ra giá vốn vô nghĩa (thậm chí âm).
  const s = replayLedger([nap(100, 360000), chi(300), nap(500, 2000000)]);
  assert.equal(s.balance, 300);
  assert.equal(s.avgCost, 4000, "giá vốn phải đặt lại = 2.000.000/500");
});

test("nạp khi số dư đúng bằng 0 → đặt lại giá vốn", () => {
  const s = replayLedger([nap(100, 360000), chi(100), nap(200, 800000)]);
  assert.equal(s.balance, 200);
  assert.equal(s.avgCost, 4000);
});

test("dòng điều chỉnh cư xử như chi: chỉ đổi số dư", () => {
  const s = replayLedger([
    nap(1000, 3600000),
    chi(400),
    { kind: "dieu_chinh", cnyDelta: -50, vndPaid: null },
  ]);
  assert.equal(s.balance, 550);
  assert.equal(s.avgCost, 3600);
});

test("điều chỉnh dương (nhập ¥ thừa, trả lại ví)", () => {
  const s = replayLedger([
    nap(1000, 3600000),
    chi(400),
    { kind: "dieu_chinh", cnyDelta: 30, vndPaid: null },
  ]);
  assert.equal(s.balance, 630);
  assert.equal(s.avgCost, 3600);
});

test("nạp với ¥ bằng 0 bị bỏ qua, không làm vỡ phép chia", () => {
  const s = replayLedger([nap(1000, 3600000), nap(0, 500000)]);
  assert.equal(s.balance, 1000);
  assert.equal(s.avgCost, 3600);
});

test("currentRate trả giá vốn hiện tại để chốt cứng vào đơn", () => {
  assert.equal(currentRate([nap(1000, 3600000)]), 3600);
  assert.equal(currentRate([]), 0);
});

test("quy giá trị ví ra VND", () => {
  assert.equal(walletValueVnd({ balance: 1000, avgCost: 3600 }), 3600000);
  assert.equal(walletValueVnd({ balance: -200, avgCost: 3600 }), -720000);
});
