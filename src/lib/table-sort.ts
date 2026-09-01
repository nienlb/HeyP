/**
 * Sắp xếp hàng cho DataTable. Module thuần — không import gì có alias `@/`.
 *
 * Ba tính chất phải giữ, đều có test khoá:
 *  - ỔN ĐỊNH: hai hàng cùng khoá giữ nguyên thứ tự gốc. Array.prototype.sort
 *    của V8 đã ổn định từ ES2019, nhưng ta vẫn kèm chỉ số gốc làm khoá phụ
 *    để tính chất này là của HÀM này chứ không phải đi mượn của runtime.
 *  - NULL XUỐNG CUỐI, bất kể chiều. Đảo cả null theo `desc` thì "chưa có số"
 *    nhảy lên đầu bảng — đúng chỗ mắt nhìn trước tiên, sai chỗ cần nhìn.
 *  - KHÔNG SỬA MẢNG GỐC.
 */
export type SortDir = "asc" | "desc";

type Key = number | string | null;

function compareKeys(a: Key, b: Key): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  // localeCompare "vi": "Ánh" < "Bình". So bằng mã ký tự thì "Á" (U+00C1)
  // rơi sau "Z" và tên có dấu bị dồn xuống cuối bảng.
  return String(a).localeCompare(String(b), "vi");
}

export function sortRows<T>(
  rows: T[],
  keyOf: ((row: T) => Key) | undefined,
  dir: SortDir,
): T[] {
  if (!keyOf) return [...rows];
  return rows
    .map((row, i) => ({ row, i, k: keyOf(row) }))
    .sort((a, b) => {
      // Tách null ra TRƯỚC và không cho nhánh đảo dấu bên dưới đụng tới —
      // đó là cách "null luôn xuống cuối" đúng ở cả hai chiều.
      const nullish = (a.k === null ? 1 : 0) - (b.k === null ? 1 : 0);
      if (nullish !== 0) return nullish;
      if (a.k === null) return a.i - b.i;
      const c = compareKeys(a.k, b.k);
      if (c !== 0) return dir === "asc" ? c : -c;
      return a.i - b.i;
    })
    .map((x) => x.row);
}
