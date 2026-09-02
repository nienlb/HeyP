import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Lưới an toàn cho việc "thêm action mới rồi quên ghi nhật ký".
 *
 * Nó khớp CHUỖI trên mã nguồn chứ không chạy thật — không đẹp, nhưng dự án
 * không có DB test, và đây là cách rẻ nhất bắt được đúng lỗi hay xảy ra nhất.
 *
 * Thêm server action mới thì thêm tên nó vào đây.
 */
const PHAI_GHI: Record<string, string[]> = {
  "src/app/(app)/orders/actions.ts": [
    "createOrderAction",
    "changeStatusAction",
    "bulkAdvanceAction",
    "addItemAction",
    "removeItemAction",
    "updateItemAction",
    "setQuotedTotalAction",
    "setOrderCustomerAction",
    "updateCustomerAction",
    "updateOrderMetaAction",
    "setShipFeeAction",
    "updateLineCostAction",
    "updateLineMarginAction",
    "lineExceptionAction",
    "addPaymentAction",
    "deletePaymentAction",
    "deleteOrderAction",
    "deletePhotoAction",
  ],
  "src/app/(app)/customers/actions.ts": ["deleteCustomerAction"],
  "src/app/(app)/finance/actions.ts": [
    "addTopupAction",
    "deleteLedgerAction",
    "addExpenseAction",
    "deleteExpenseAction",
  ],
  "src/app/(app)/inventory/actions.ts": ["stockInAction", "sellFromStockAction"],
  "src/app/(app)/settings/actions.ts": ["saveSettingsAction"],
  "src/app/(app)/admin/users/actions.ts": [
    "createUserAction",
    "userAdminAction",
  ],
  // login/ nằm NGOÀI route group (app) — nó là màn công khai.
  "src/app/login/actions.ts": ["loginAction"],
};

/** Cắt thân một hàm: từ dòng khai báo tới khai báo `export` kế tiếp. */
function thanHam(nguon: string, ten: string): string | null {
  const mo = nguon.indexOf(`export async function ${ten}`);
  if (mo < 0) return null;
  const sau = nguon.slice(mo + 1);
  const ke = sau.search(/\nexport (async function|function|const|type) /);
  return ke < 0 ? sau : sau.slice(0, ke);
}

for (const [duongDan, tenHams] of Object.entries(PHAI_GHI)) {
  test(`${duongDan}: mọi action bắt buộc đều gọi logActivity`, () => {
    const nguon = readFileSync(duongDan, "utf8");
    const thieu: string[] = [];
    for (const ten of tenHams) {
      const than = thanHam(nguon, ten);
      assert.ok(than !== null, `Không tìm thấy hàm ${ten} trong ${duongDan}`);
      if (!than.includes("logActivity(")) thieu.push(ten);
    }
    assert.deepEqual(thieu, [], `Thiếu logActivity trong: ${thieu.join(", ")}`);
  });
}

test("không action nào ghi GIÁ TRỊ mật khẩu vào nhật ký", () => {
  for (const duongDan of Object.keys(PHAI_GHI)) {
    const nguon = readFileSync(duongDan, "utf8");
    for (const goi of nguon.matchAll(/logActivity\(([\s\S]*?)\n\s*\}\);/g)) {
      // Bỏ mọi chuỗi trong nháy TRƯỚC khi tìm. Không có bước này thì
      // `detail: { op: "password" }` — một NHÃN thao tác hoàn toàn hợp lệ —
      // bị báo nhầm là rò mật khẩu.
      const khongChuoi = goi[1]
        .replace(/"[^"]*"/g, '""')
        .replace(/'[^']*'/g, "''")
        .replace(/`[^`]*`/g, "``");
      assert.equal(
        /password|passwordHash|matKhau/i.test(khongChuoi),
        false,
        `${duongDan}: có vẻ truyền GIÁ TRỊ mật khẩu vào logActivity —\n${goi[0]}`,
      );
    }
  }
});
