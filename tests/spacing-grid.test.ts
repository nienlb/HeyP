import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Khoá thang khoảng cách 4pt (v9-B).
 *
 * Dự án khoá bất biến bằng test đọc mã nguồn (activity-coverage, screen-meta).
 * Đây là bản cho CSS — cần thiết vì CSS KHÔNG có tsc bảo vệ: gõ sai tên biến
 * thì trình duyệt bỏ qua cả dòng, im lặng, phần tử rơi về margin 0.
 */

const FILES = [
  "src/styles/tokens.css",
  "src/styles/base.css",
  "src/styles/layout.css",
  "src/styles/components.css",
  "src/styles/screens.css",
  "src/styles/legacy.css",
];

/**
 * Mục trong legacy.css CHƯA tới lượt chuẩn hoá.
 *
 * Mỗi đợt của v9-B xoá bớt vài dòng ở đây. Khi mảng rỗng thì cả file bị khoá.
 * Dùng TÊN MỤC chứ không dùng số dòng: số dòng trôi ngay lần sửa đầu tiên và
 * danh sách thành rác.
 *
 * Task 1 đã xoá sạch ba mục (Order list, Khách hàng / cờ, Dòng đã tách) —
 * toàn bộ nội dung của chúng chỉ chứa CSS chết. Danh sách dưới đây liệt kê
 * đúng 17 mục còn lại trong file, không phải 20 như lúc mới đo.
 */
const CHUA_CHUAN_HOA: string[] = [
  "Đọc ảnh Zalo (AI)",
  "Đăng nhập",
  "Responsive",
];

/** Biến KHÔNG thuộc thang --sp-* nhưng hợp lệ trong khoảng cách. */
const BIEN_RIENG = new Set([
  "--sat",
  "--sab",
  "--sidebar-w",
  "--tabbar-h",
  "--tabbar-clear",
  "--header-h",
  "--tap",
]);

const HDR = /^\/\* (?:-{10}|={5}) ?(.+?) ?(?:-{10}|={5}) \*\/$/;
const PROP =
  /^\s*(padding|margin|gap|row-gap|column-gap)(-top|-right|-bottom|-left)?\s*:\s*([^;]+);/;

/** Giá trị còn sót gì sau khi bỏ hết phần hợp lệ? Rỗng = đạt. */
function conSot(value: string): string[] {
  let v = value;
  // Bỏ var() hợp lệ; var() không hợp lệ thì đánh dấu để báo lỗi.
  v = v.replace(/var\(\s*(--[a-zA-Z0-9-]+)\s*(?:,[^)]*)?\)/g, (_m, ten: string) =>
    ten.startsWith("--sp-") || BIEN_RIENG.has(ten) ? " " : ` «${ten}» `,
  );
  v = v.replace(/env\([^)]*\)/g, " ");
  const px = v.match(/-?\d*\.?\d+(px|rem|em)/g) ?? [];
  const bienLa = v.match(/«--[a-zA-Z0-9-]+»/g) ?? [];
  return [...px, ...bienLa];
}

/** Mọi --sp-N dùng ở đâu đó đều phải được khai trong tokens.css. */
test("mọi --sp-* dùng trong CSS đều có khai báo trong tokens.css", () => {
  const tokens = readFileSync("src/styles/tokens.css", "utf8");
  const daKhai = new Set(
    [...tokens.matchAll(/^\s*(--sp-[a-zA-Z0-9-]+)\s*:/gm)].map((m) => m[1]),
  );
  const thieu = new Set<string>();
  for (const file of FILES) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/var\(\s*(--sp-[a-zA-Z0-9-]+)/g)) {
      if (!daKhai.has(m[1])) thieu.add(`${file}: ${m[1]}`);
    }
  }
  assert.deepEqual(
    [...thieu],
    [],
    "Biến không tồn tại — CSS sẽ bỏ qua cả dòng, im lặng, không báo lỗi.",
  );
});

test("mọi khoảng cách đều nằm trên thang --sp-* (hoặc được miễn trừ có lý do)", () => {
  const loi: string[] = [];

  for (const file of FILES) {
    const lines = readFileSync(file, "utf8").split("\n");
    let muc = file.endsWith("legacy.css") ? "(đầu file)" : "(cả file)";

    for (let i = 0; i < lines.length; i++) {
      const h = HDR.exec(lines[i].trim());
      if (h) {
        muc = h[1];
        continue;
      }
      const p = PROP.exec(lines[i]);
      if (!p) continue;

      // Mục chưa tới lượt — bỏ qua, đợt sau sẽ gỡ khỏi CHUA_CHUAN_HOA.
      if (file.endsWith("legacy.css") && CHUA_CHUAN_HOA.includes(muc)) continue;

      const sot = conSot(p[3]);
      if (sot.length === 0) continue;

      // Miễn trừ: comment ở dòng NGAY TRÊN, kèm lý do không rỗng.
  // PHẢI là MỘT dòng — regex chỉ đọc lines[i-1]. Comment nhiều dòng thì dòng
  // sát khai báo mới được đọc, phần lý do ở các dòng trên bị bỏ qua và test
  // vẫn đỏ dù người viết tưởng đã ghi lý do. Đã dính khi viết test này.
      const tren = (lines[i - 1] ?? "").trim();
      const mienTru = /spacing-exempt:\s*(\S.*?)\s*(\*\/)?$/.exec(tren);
      if (mienTru && mienTru[1].length >= 10) continue;

      loi.push(
        `${file}:${i + 1} [${muc}] ${lines[i].trim()}  ← ${sot.join(", ")}`,
      );
    }
  }

  assert.deepEqual(
    loi,
    [],
    `\nKhoảng cách phải dùng var(--sp-*).\n` +
      `Cố ý lệch thì thêm comment ngay TRÊN dòng đó:\n` +
      `  /* spacing-exempt: lý do cụ thể, ít nhất 10 ký tự */\n\n` +
      loi.join("\n"),
  );
});

test("CHUA_CHUAN_HOA chỉ chứa tên mục có thật trong legacy.css", () => {
  const src = readFileSync("src/styles/legacy.css", "utf8");
  const coThat = new Set(
    [...src.matchAll(/^\/\* (?:-{10}|={5}) ?(.+?) ?(?:-{10}|={5}) \*\/$/gm)].map(
      (m) => m[1],
    ),
  );
  coThat.add("(đầu file)");
  const ma = CHUA_CHUAN_HOA.filter((m) => !coThat.has(m));
  assert.deepEqual(
    ma,
    [],
    "Tên mục trong CHUA_CHUAN_HOA không khớp tiêu đề nào — gõ sai thì mục thật " +
      "vẫn bị kiểm và test đỏ nhầm chỗ, hoặc mục đã đổi tên mà quên sửa ở đây.",
  );
});
