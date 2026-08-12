import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergeItems,
  mergeMoneyFields,
  type MergeableItem,
  type MoneyFields,
} from "../src/lib/zalo-merge.ts";
import type { ZaloExtract } from "../src/lib/zalo-extract.ts";

const EMPTY_EXTRACT: ZaloExtract = {
  items: [],
  totalVnd: null,
  depositVnd: null,
  shipVnd: null,
  shipFree: false,
  shipUnknown: false,
  customerName: null,
  customerPhone: null,
  customerAddress: null,
  notes: null,
};

const extract = (over: Partial<ZaloExtract>): ZaloExtract => ({
  ...EMPTY_EXTRACT,
  ...over,
});

const INITIAL: MoneyFields = {
  customerMode: "existing",
  newCustomerName: "",
  newCustomerPhone: "",
  newCustomerAddress: "",
  quotedTotal: "",
  deposit: "",
  shipStatus: "unknown",
  shippingFee: "",
};

function apply(state: MoneyFields, e: ZaloExtract): MoneyFields {
  const { patch } = mergeMoneyFields(e);
  return { ...state, ...patch };
}

/* ---------- mergeMoneyFields: từng trường riêng lẻ ---------- */

test("extract rỗng hoàn toàn → không patch gì, found rỗng", () => {
  const { patch, found } = mergeMoneyFields(EMPTY_EXTRACT);
  assert.deepEqual(patch, {});
  assert.deepEqual(found, []);
});

test("chỉ có Total → chỉ patch quotedTotal", () => {
  const { patch, found } = mergeMoneyFields(extract({ totalVnd: 410000 }));
  assert.deepEqual(patch, { quotedTotal: "410000" });
  assert.equal(found.length, 1);
});

test("chỉ có cọc → chỉ patch deposit", () => {
  const { patch } = mergeMoneyFields(extract({ depositVnd: 100000 }));
  assert.deepEqual(patch, { deposit: "100000" });
});

test("chỉ có tên khách → patch customerMode + tên, KHÔNG đụng SĐT/địa chỉ", () => {
  const { patch, found } = mergeMoneyFields(
    extract({ customerName: "Văn Trần" }),
  );
  assert.deepEqual(patch, {
    customerMode: "new",
    newCustomerName: "Văn Trần",
  });
  assert.ok(!("newCustomerPhone" in patch));
  assert.ok(!("newCustomerAddress" in patch));
  assert.deepEqual(found, ["thông tin khách"]);
});

test("chỉ có SĐT (không tên) → vẫn chuyển customerMode=new, chỉ patch SĐT", () => {
  const { patch } = mergeMoneyFields(extract({ customerPhone: "0901234567" }));
  assert.deepEqual(patch, {
    customerMode: "new",
    newCustomerPhone: "0901234567",
  });
});

/* ---------- Ship: bẫy shipVnd=0 khi shipUnknown=true ---------- */

test("shipUnknown=true VÀ shipVnd=0 (Gemini trả 0 thay vì null) → KHÔNG patch ship", () => {
  const { patch, found } = mergeMoneyFields(
    extract({ shipUnknown: true, shipVnd: 0, shipFree: false }),
  );
  assert.ok(!("shipStatus" in patch), "không được đụng shipStatus");
  assert.ok(!("shippingFee" in patch), "không được đụng shippingFee");
  assert.deepEqual(found, []);
});

test("shipFree=true → patch free + phí 0", () => {
  const { patch } = mergeMoneyFields(extract({ shipFree: true }));
  assert.deepEqual(patch, { shipStatus: "free", shippingFee: "0" });
});

test("shipUnknown=false, shipVnd có số thật → patch set + đúng số", () => {
  const { patch } = mergeMoneyFields(
    extract({ shipUnknown: false, shipVnd: 22000 }),
  );
  assert.deepEqual(patch, { shipStatus: "set", shippingFee: "22000" });
});

test("shipVnd=0 KHÔNG qua cờ shipFree → không patch (0đ chỉ đáng tin qua shipFree)", () => {
  const { patch, found } = mergeMoneyFields(
    extract({ shipUnknown: false, shipFree: false, shipVnd: 0 }),
  );
  assert.deepEqual(patch, {});
  assert.deepEqual(found, []);
});

/* ---------- Bẫy totalVnd/depositVnd=0 khi ảnh không liên quan gì ---------- */
/* Phát hiện khi kiểm bằng ảnh thật (khối màu trơn) qua Gemini thật: model
 * trả totalVnd:0, depositVnd:0, shipVnd:0 (số 0 THẬT, không phải null) khi
 * ảnh chẳng có nội dung đơn hàng nào — dù prompt yêu cầu trả null. Đây
 * chính là nguyên nhân thật của lỗi "thả ảnh 2 xoá mất Total/cọc của ảnh 1"
 * — không unit test giả định nào bắt được, chỉ lộ ra khi gọi Gemini thật. */

test("BẤT BIẾN QUAN TRỌNG NHẤT: ảnh không liên quan trả totalVnd=0/depositVnd=0/shipVnd=0 → KHÔNG patch gì, Total/cọc/ship cũ giữ nguyên", () => {
  const anhKhongLienQuan = extract({
    totalVnd: 0,
    depositVnd: 0,
    shipVnd: 0,
    shipUnknown: false,
    shipFree: false,
  });
  const { patch, found } = mergeMoneyFields(anhKhongLienQuan);
  assert.deepEqual(patch, {}, "0 không phải null — không được coi là có dữ liệu");
  assert.deepEqual(found, []);
});

test("tái hiện đúng kịch bản thật: đọc ảnh chốt đơn rồi đọc ảnh trơn không liên quan → Total/cọc còn nguyên", () => {
  const anhChotDon = extract({ totalVnd: 410000, depositVnd: 100000 });
  const anhTron = extract({
    totalVnd: 0,
    depositVnd: 0,
    shipVnd: 0,
    shipUnknown: false,
  });

  let state = apply(INITIAL, anhChotDon);
  assert.equal(state.quotedTotal, "410000");
  assert.equal(state.deposit, "100000");

  state = apply(state, anhTron);

  assert.equal(state.quotedTotal, "410000", "Total bị 0 đè mất — lỗi tái hiện!");
  assert.equal(state.deposit, "100000", "Cọc bị 0 đè mất — lỗi tái hiện!");
});

/* ---------- Kịch bản đúng lỗi báo cáo: đọc ảnh A rồi đọc ảnh B ---------- */

test("BẤT BIẾN: đọc ảnh chốt đơn (Total+cọc) rồi đọc ảnh thông tin khách riêng → Total/cọc còn nguyên", () => {
  const anhChotDon = extract({
    totalVnd: 410000,
    depositVnd: 100000,
    shipUnknown: true,
  });
  const anhThongTinKhach = extract({
    customerName: "Văn Trần",
    customerPhone: "0901234567",
  });

  let state = apply(INITIAL, anhChotDon);
  assert.equal(state.quotedTotal, "410000");
  assert.equal(state.deposit, "100000");

  state = apply(state, anhThongTinKhach);

  // Đây chính là lỗi bị báo cáo: Total/cọc KHÔNG được mất sau ảnh thứ 2.
  assert.equal(state.quotedTotal, "410000", "Total bị xoá mất — lỗi tái hiện!");
  assert.equal(state.deposit, "100000", "Cọc bị xoá mất — lỗi tái hiện!");
  assert.equal(state.customerMode, "new");
  assert.equal(state.newCustomerName, "Văn Trần");
  assert.equal(state.newCustomerPhone, "0901234567");
});

test("BẤT BIẾN: thứ tự ngược lại (thông tin khách trước, chốt đơn sau) vẫn không mất gì", () => {
  const anhThongTinKhach = extract({ customerName: "Chị Hoa" });
  const anhChotDon = extract({ totalVnd: 730000, depositVnd: 500000 });

  let state = apply(INITIAL, anhThongTinKhach);
  state = apply(state, anhChotDon);

  assert.equal(state.newCustomerName, "Chị Hoa", "tên khách bị mất");
  assert.equal(state.quotedTotal, "730000");
  assert.equal(state.deposit, "500000");
});

test("đọc 3 ảnh liên tiếp (chốt đơn, thông tin khách, ảnh sản phẩm rỗng) → cộng dồn đủ cả 3, không cái nào đè cái nào", () => {
  const a1 = extract({ totalVnd: 200000, shipUnknown: true });
  const a2 = extract({ customerAddress: "12 Lê Lợi, Q1" });
  const a3 = EMPTY_EXTRACT; // ảnh sản phẩm — không có dữ liệu đơn

  let state = apply(INITIAL, a1);
  state = apply(state, a2);
  state = apply(state, a3);

  assert.equal(state.quotedTotal, "200000");
  assert.equal(state.newCustomerAddress, "12 Lê Lợi, Q1");
  assert.equal(state.customerMode, "new");
});

test("đọc lại ảnh chốt đơn khác (Total mới) → Total mới ghi đè Total cũ (đúng ý, không phải gộp cộng)", () => {
  let state = apply(INITIAL, extract({ totalVnd: 100000 }));
  state = apply(state, extract({ totalVnd: 999000 }));
  assert.equal(state.quotedTotal, "999000");
});

/* ---------- mergeItems ---------- */

const item = (name: string, cny = "60"): MergeableItem => ({
  name,
  productUrl: "",
  attributes: "",
  quantity: "1",
  unitPriceCny: cny,
  costConfirmed: false,
});

const EMPTY_ROW: MergeableItem = {
  name: "",
  productUrl: "",
  attributes: "",
  quantity: "1",
  unitPriceCny: "",
  costConfirmed: true,
};

test("dòng hiện tại còn trống ban đầu → thay thế bằng dòng mới", () => {
  const result = mergeItems([EMPTY_ROW], [item("Giày lưới")]);
  assert.deepEqual(result, [item("Giày lưới")]);
});

test("đã có dữ liệu thật → nối thêm, không xoá dòng cũ", () => {
  const result = mergeItems([item("Giày lưới")], [item("Túi xách")]);
  assert.deepEqual(result, [item("Giày lưới"), item("Túi xách")]);
});

test("newRows rỗng → giữ nguyên danh sách hiện tại (kể cả khi đang trống)", () => {
  assert.deepEqual(mergeItems([EMPTY_ROW], []), [EMPTY_ROW]);
  assert.deepEqual(mergeItems([item("A")], []), [item("A")]);
});

test("BẤT BIẾN: 3 lần đọc liên tiếp có sản phẩm → cả 3 đợt đều còn đủ, không đợt nào mất", () => {
  let items: MergeableItem[] = [EMPTY_ROW];
  items = mergeItems(items, [item("Giày lưới")]);
  items = mergeItems(items, [item("Túi xách"), item("Ví da")]);
  items = mergeItems(items, [item("Dép")]);

  assert.deepEqual(items.map((i) => i.name), [
    "Giày lưới",
    "Túi xách",
    "Ví da",
    "Dép",
  ]);
});

test("dòng hiện tại có tên nhưng đã bị xoá trắng bằng tay (chuỗi rỗng có khoảng trắng) vẫn coi là 'còn trống'", () => {
  const blank: MergeableItem = { ...EMPTY_ROW, name: "   " };
  const result = mergeItems([blank], [item("Giày lưới")]);
  assert.deepEqual(result, [item("Giày lưới")]);
});
