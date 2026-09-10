# HeyP v9-B — Chuẩn hoá khoảng cách: kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa mọi khoảng cách trong `src/styles/` về thang token `--sp-*` theo VAI TRÒ của khoảng cách, và khoá lại bằng test để không tái phát.

**Architecture:** Xoá CSS chết trước (37 class không nơi nào dùng), rồi dựng test khoá kèm danh sách "mục chưa tới lượt", rồi chuẩn hoá từng mục của `legacy.css` theo năm đợt — mỗi đợt xoá một dòng khỏi danh sách đó nên test siết dần thay vì đỏ suốt.

**Tech Stack:** CSS thuần (không framework, không preprocessor) · test bằng `node:test` built-in · kiểm bằng preview trình duyệt của harness.

**Spec:** `docs/superpowers/specs/2026-09-10-heyp-v9b-chuan-hoa-khoang-cach-design.md`

## Global Constraints

- **Thang khoảng cách chỉ có bảy bậc**: `--sp-1` 4px · `--sp-2` 8px · `--sp-3` 12px · `--sp-4` 16px · `--sp-5` 24px · `--sp-6` 32px · `--sp-7` 48px. **Không thêm bậc mới.**
- **Luật vai trò** (spec mục 3) — quyết theo việc khoảng cách đó *làm*, không theo con số cũ:

| Vai trò | Token |
| --- | --- |
| Trong cùng một dòng: nhãn ↔ giá trị | `--sp-1` |
| Giữa các dòng cùng một nhóm | `--sp-2` |
| Giữa các thẻ / khối trong một màn | `--sp-3` |
| Padding bên trong thẻ | `--sp-4` |
| Giữa các mục lớn (`<section>` ↔ `<section>`) | `--sp-5` |

- **Chỉ đụng `padding` / `margin` / `gap` / `row-gap` / `column-gap`.** Không đụng màu, `font-size`, `border-radius`, `box-shadow`, `width`, `height`, `min-height`, `top/left/right/bottom`.
- **Không đổi cấu trúc DOM**, không sửa file `.tsx` (trừ khi Task nói rõ).
- **Không gỡ `legacy.css` khỏi `globals.css`** và không đổi thứ tự import.
- **Mọi ô nhập phải giữ `font-size: var(--fs-3)` (16px)** — dưới ngưỡng này Safari iOS tự phóng to trang khi chạm vào ô.
- **Mọi thanh dính đáy/đỉnh phải giữ `env(safe-area-inset-*)`** qua `--sat`/`--sab`.
- **CSS không có `tsc` bảo vệ**: gõ sai tên biến thì trình duyệt bỏ qua cả dòng, im lặng. Sau mỗi task PHẢI chạy `npm test` (test khoá kiểm cả biến không tồn tại).
- Commit tiếng Việt, kết thúc bằng `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Số liệu nền (đo ngày 10/09/2026)

| | Số lượng |
| --- | ---: |
| Khai báo đã dùng `var(--sp-*)` | 135 |
| Giá trị px đúng lưới nhưng gõ cứng | 69 |
| Giá trị px **lệch** lưới | 86 |
| **Tổng phải sửa** | **152** |
| Class không nơi nào dùng | 37 |

`legacy.css` chia sẵn thành 19 mục có tiêu đề, cộng phần đầu file không tiêu đề — tổng **20 khối**. Năm đợt dưới đây phủ hết cả 20.

## Cấu trúc file

**Tạo mới**

| File | Trách nhiệm |
| --- | --- |
| `tests/spacing-grid.test.ts` | Test khoá: quét CSS, bắt giá trị ngoài thang và biến không tồn tại |
| `scripts/spacing-audit.mjs` | Công cụ liệt kê khai báo cần sửa theo mục — dùng ở mỗi đợt |

**Sửa**

`src/styles/tokens.css` (thêm `--sidebar-w`, `--tabbar-clear`) · `src/styles/legacy.css` (phần lớn công việc) · `src/styles/layout.css` (3 chỗ) · `src/styles/screens.css` (1 chỗ) · `CLAUDE.md`

---

### Task 1: Xoá CSS chết

**Files:**
- Modify: `src/styles/legacy.css`

**Interfaces:**
- Consumes: không có (task đầu tiên)
- Produces: `legacy.css` không còn 37 class chết. Các task sau chuẩn hoá phần còn lại.

**Vì sao làm trước:** chuẩn hoá khoảng cách cho CSS không ai render là công vô ích, và không có cách nào nghiệm thu bằng mắt. Xoá trước thì bốn đợt sau nhẹ đi và mọi thay đổi còn lại đều nhìn thấy được.

- [ ] **Step 1: Xác nhận lại danh sách chết ngay trước khi xoá**

```bash
cd "/Users/nienlb/Coding/HeyP Concept" && python3 - <<'PY'
import re, glob
css = open("src/styles/legacy.css", encoding="utf-8").read()
blob = "\n".join(open(f, encoding="utf-8").read()
                 for f in glob.glob("src/app/**/*.ts*", recursive=True)
                        + glob.glob("src/lib/**/*.ts", recursive=True))
# Ba tiền tố này được dựng động trong TSX (`journey-step--${state}` v.v.)
# nên KHÔNG được coi là chết dù grep không thấy tên đầy đủ.
DYN = ("journey-alert--", "journey-step--", "status-card--")
chet = [c for c in sorted(set(re.findall(r"\.([a-zA-Z][a-zA-Z0-9_-]*)", css)))
        if c not in blob and not any(c.startswith(d) for d in DYN)]
print(len(chet)); print("\n".join(chet))
PY
```

Kỳ vọng: **37** tên. Nếu ra khác 37, **DỪNG** — ai đó vừa thêm/bớt class, phải đọc lại chứ không xoá theo danh sách cũ.

- [ ] **Step 2: Xoá các luật chỉ nhắm class chết**

Xoá khỏi `src/styles/legacy.css` mọi luật mà **toàn bộ** selector nhắm vào các tên dưới đây. Luật có selector ghép (ví dụ `.attention h2, .status-group h2`) thì **chỉ xoá phần chết**, giữ phần sống:

```
container  flag-reason  form-actions  grid-2
inv-cost  inv-item  inv-name  inv-photos  inv-qty  inv-sell-hint
item-row  line-removed  money-preview  org  w3  zalo-reader
order-age  order-customer  order-due  order-id  order-list  order-row  status-group
pkg-code  pkg-flag  pkg-form  pkg-grid  pkg-head  pkg-item  pkg-meta
pkg-order-link  pkg-orders  pkg-orders-line  pkg-update
stack-form
```

Ba lưu ý cụ thể:

1. **`.attention, .status-group { margin-bottom: 22px; }`** → thành `.attention { margin-bottom: 22px; }`. Tương tự `.attention h2, .status-group h2`.
2. **Mục `Tracking / Kiện`** mất gần trọn: giữ lại **`.pkg-list-mini`** (còn dùng ở `src/app/(app)/orders/[id]/page.tsx:225`), xoá 11 class `pkg-*` còn lại.
3. **Mục `Responsive`** có `.pkg-form .pkg-grid { … }` — xoá cả luật đó vì cả hai class đều chết.

- [ ] **Step 3: Xoá phần reset trùng với `base.css`**

Đầu `legacy.css` (dòng 1–20) lặp lại nguyên `* { box-sizing }`, `html, body { margin/padding/background/color/font-family }` và `a { color }` — `base.css` đã có đủ. Xoá cả ba khối đó khỏi `legacy.css`.

**Kiểm trước khi xoá** rằng `base.css` thật sự có, vì `legacy.css` import SAU nên nó đang là bản có hiệu lực:

```bash
grep -nE "box-sizing|^html,|^body|^a \{" src/styles/base.css
```

Kỳ vọng: thấy cả `box-sizing`, `html,`/`body`, và `a {`. Nếu thiếu cái nào thì **giữ** khối đó lại trong `legacy.css`.

- [ ] **Step 4: Kiểm không xoá nhầm**

```bash
npm test && npx tsc --noEmit
```

Rồi mở preview và xem bốn màn: `/`, `/orders`, `/orders/new`, `/inventory`. Không màn nào được mất khung, mất viền, hay đổi bố cục — task này chỉ xoá thứ không ai render.

```bash
git diff --stat src/styles/legacy.css
```

Kỳ vọng: số dòng **giảm** khoảng 200–260.

- [ ] **Step 5: Commit**

```bash
git add src/styles/legacy.css
git commit -m "$(cat <<'EOF'
khoảng cách: xoá 37 class CSS không nơi nào dùng

Gần trọn mục Tracking/Kiện chết theo việc bỏ Tracking khỏi nav ở v8-A;
mục Order list và Tồn kho chết theo đợt viết lại giao diện v5. Xoá trước
khi chuẩn hoá vì chuẩn hoá CSS không ai render là công vô ích và không
nghiệm thu bằng mắt được.

Cũng gỡ phần reset đầu file trùng nguyên si với base.css.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Token mới và test khoá

**Files:**
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/layout.css` (3 chỗ: 2 số ma + 1 giá trị âm)
- Create: `scripts/spacing-audit.mjs`
- Create: `tests/spacing-grid.test.ts`

**Interfaces:**
- Consumes: `legacy.css` đã dọn (Task 1)
- Produces:
  - Token `--sidebar-w: 240px`, `--tabbar-clear: calc(var(--tabbar-h) + var(--sp-6))`
  - `node scripts/spacing-audit.mjs "<tên mục>"` — in ra mọi khai báo cần sửa của mục đó
  - `tests/spacing-grid.test.ts` với mảng `CHUA_CHUAN_HOA` — mỗi đợt sau xoá bớt phần tử

- [ ] **Step 1: Thêm hai token có tên**

Trong `src/styles/tokens.css`, thêm ngay sau dòng `--tap: 44px;`:

```css
  /* Bề rộng sidebar ở ≥900px. Trước v9-B là số 240 gõ cứng trong layout.css:
     đổi bề rộng mà quên sửa chỗ bù margin là nội dung nằm đè lên sidebar. */
  --sidebar-w: 240px;

  /* Khoảng hở đáy để tabbar + FAB không che nội dung.
     Trước v9-B là `calc(84px + …)` — 84 là số ma (56 của tabbar + 28 nhô của
     FAB). Công thức này ra 88px, tức RỘNG HƠN 4px so với trước; đó là thay
     đổi có thật, không phải phép thay tương đương. */
  --tabbar-clear: calc(var(--tabbar-h) + var(--sp-6));
```

- [ ] **Step 2: Dùng hai token đó trong `layout.css`**

```css
/* dòng ~128 */
  padding-bottom: calc(var(--tabbar-clear) + var(--sab) + var(--sp-4));

/* dòng ~356 */
    margin-left: var(--sidebar-w);

/* dòng ~175 — giá trị ÂM cũng phải qua token */
  margin: calc(var(--sp-3) * -1) var(--sp-2) 0;
```

Sửa cả `-12px` ngay ở đây chứ không để tới đợt 5: test ở Step 6 khoá `layout.css`
ngay lập tức (chỉ `legacy.css` mới được `CHUA_CHUAN_HOA` che), nên bỏ sót là test
đỏ ngay trong task này.

- [ ] **Step 3: Viết công cụ liệt kê**

Tạo `scripts/spacing-audit.mjs`:

```js
/**
 * Liệt kê mọi khai báo khoảng cách CHƯA dùng token, theo từng mục của
 * legacy.css. Dùng ở mỗi đợt của v9-B để biết chính xác phải sửa những gì —
 * KHÔNG chép danh sách cứng vào kế hoạch, vì Task 1 đã xoá bớt và số dòng
 * trôi sau mỗi lần sửa.
 *
 *   node scripts/spacing-audit.mjs                 # tất cả các mục
 *   node scripts/spacing-audit.mjs "Cards & detail"  # một mục
 */
import { readFileSync } from "node:fs";

const FILES = [
  "src/styles/tokens.css",
  "src/styles/base.css",
  "src/styles/layout.css",
  "src/styles/components.css",
  "src/styles/screens.css",
  "src/styles/legacy.css",
];
const HDR = /^\/\* (?:-{10}|={5}) ?(.+?) ?(?:-{10}|={5}) \*\/$/;
const PROP =
  /^\s*(padding|margin|gap|row-gap|column-gap)(-top|-right|-bottom|-left)?\s*:\s*([^;]+);/;

const loc = process.argv[2] ?? null;
let tong = 0;

for (const file of FILES) {
  const lines = readFileSync(file, "utf8").split("\n");
  let muc = file.endsWith("legacy.css") ? "(đầu file)" : "(cả file)";
  let sel = "?";
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const h = HDR.exec(ln.trim());
    if (h) { muc = h[1]; continue; }
    const s = /^([.#*&a-z][^{]*)\{\s*$/.exec(ln.trim());
    if (s) sel = s[1].trim();
    const p = PROP.exec(ln);
    if (!p) continue;
    if (p[3].includes("var(--sp-")) continue;
    if (!/\d+px/.test(p[3])) continue;
    if (loc && muc !== loc) continue;
    console.log(`${file}:${i + 1}  [${muc}]  ${sel}  →  ${ln.trim()}`);
    tong++;
  }
}
console.log(`\nTổng khai báo cần sửa: ${tong}`);
```

- [ ] **Step 4: Chạy thử công cụ**

```bash
node scripts/spacing-audit.mjs | tail -3
```

Kỳ vọng: in ra tổng, và con số **nhỏ hơn 152** (Task 1 đã xoá bớt). Ghi lại con số này — Task 3–7 phải đưa nó về 0.

- [ ] **Step 5: Viết test khoá**

Tạo `tests/spacing-grid.test.ts`:

```ts
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
 */
const CHUA_CHUAN_HOA: string[] = [
  "(đầu file)",
  "Badges",
  "Order list",
  "Cards & detail",
  "Timeline",
  "Table",
  "Forms",
  "Khách hàng / cờ",
  "Lãi/lỗ",
  "Dòng đã tách",
  "Tồn kho",
  "Ảnh: upload + gallery",
  "Tracking / Kiện",
  "Đọc ảnh Zalo (AI)",
  "Đăng nhập",
  "Tổng quan (dashboard)",
  "Responsive",
  "v3-A: bóc lớp giá theo món & cờ cần bổ sung",
  "Hành trình đơn hàng (order detail)",
  "Thẻ trạng thái đơn (Tổng quan)",
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
```

- [ ] **Step 6: Chạy test — phải XANH**

```bash
npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"
```

Kỳ vọng: PASS. Lúc này `CHUA_CHUAN_HOA` còn đủ 20 mục nên `legacy.css` được miễn hoàn toàn; test đang khoá bốn file mới (`tokens`, `base`, `layout`, `components`, `screens`) — và chúng đã sạch sau Step 2.

Nếu đỏ, đó là hai chỗ `gap: 2px` còn lại (`layout.css` ~158, `screens.css` ~118)
— khe giữa icon và nhãn trong tabbar. Thêm miễn trừ **với lý do cuối cùng**, không
phải ghi tạm rồi sửa lại ở đợt 5:

```css
/* spacing-exempt: khe icon ↔ nhãn tabbar, 4px làm tabbar cao thêm và ăn vào nội dung */
gap: 2px;
```

- [ ] **Step 7: Kiểm hai token mới không phá bố cục**

Mở preview, xem ở **375px**: nội dung cuối trang không bị tabbar/FAB che (khoảng hở giờ 88px thay vì 84px). Rồi xem ở **1200px**: nội dung không đè lên sidebar.

```js
// chạy trong console trình duyệt
getComputedStyle(document.documentElement).getPropertyValue("--tabbar-clear")
```

Kỳ vọng: trả về `calc(56px + 32px)` hoặc `88px`.

- [ ] **Step 8: Commit**

```bash
git add src/styles/tokens.css src/styles/layout.css scripts/spacing-audit.mjs tests/spacing-grid.test.ts
git commit -m "$(cat <<'EOF'
khoảng cách: token có tên và test khoá thang 4pt

--sidebar-w và --tabbar-clear thay hai số ma trong layout.css. Khoảng hở
đáy đổi từ 84px thành 88px — thay đổi có thật, không phải tương đương.

Test khoá quét CSS, miễn trừ khai bằng comment `spacing-exempt: lý do`
cạnh dòng chứ không bằng số dòng. Nó cũng bắt biến không tồn tại — CSS
không có tsc, gõ sai tên biến là mất cả dòng mà không báo gì.

CHUA_CHUAN_HOA còn đủ 20 mục của legacy.css; mỗi đợt sau gỡ bớt.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Đợt 1 — phần dùng chung

**Files:**
- Modify: `src/styles/legacy.css` (mục `(đầu file)`, `Badges`, `Table`, `Forms`)
- Modify: `tests/spacing-grid.test.ts` (gỡ 4 mục khỏi `CHUA_CHUAN_HOA`)

**Interfaces:**
- Consumes: `scripts/spacing-audit.mjs`, `CHUA_CHUAN_HOA` (Task 2)
- Produces: bốn mục dùng chung đã chuẩn. Các đợt sau đứng trên nền này.

**Vì sao đợt này đi đầu:** `.card`, `.btn`, `.field`, `.tbl` xuất hiện ở cả bốn màn. Chuẩn hoá `Cards & detail` trước rồi mới sờ `Forms` thì form nằm trong card bị dịch hai lần, và lần xem preview đầu thành công cốc.

- [ ] **Step 1: Liệt kê chính xác việc phải làm**

```bash
for m in "(đầu file)" "Badges" "Table" "Forms"; do node scripts/spacing-audit.mjs "$m"; done
```

- [ ] **Step 2: Áp bảng quyết định**

Đây là các luật **còn sống sau Task 1** và token đích của chúng:

| Selector | Hiện tại | Thành | Vai trò |
| --- | --- | --- | --- |
| `.card` | `padding: 24px` | `var(--sp-3) var(--sp-4)` | padding trong thẻ — khớp `.list-row`/`.dt-row`/`.kpi` của v5 |
| `.btn` | `gap: 8px` | `var(--sp-2)` | khe icon ↔ chữ |
| `.btn` | `padding: 10px 16px` | `var(--sp-3) var(--sp-4)` | `min-height: var(--tap)` đã có nên không phá vùng chạm |
| `.btn-sm` | `padding: 6px 12px` | `var(--sp-2) var(--sp-3)` | nút phụ, cố ý nhỏ hơn |
| `.field` | `gap: 6px` | `var(--sp-1)` | nhãn ↔ ô nhập, cùng một dòng logic |
| `.field` | `margin-bottom: 14px` | `var(--sp-3)` | giữa các dòng nhập |
| `.field input` | `padding: 10px 12px` | `var(--sp-3)` | trong ô nhập |
| `.search input` | `padding: 9px 12px` | `var(--sp-3)` | như trên |
| `.error` | `padding: 10px 12px` | `var(--sp-3)` | trong khối |
| `.error` | `margin-bottom: 14px` | `var(--sp-3)` | giữa các khối |
| `.badge` | `padding: 3px 9px` | **miễn trừ** | viên thuốc cố ý chật |
| `.tbl th, .tbl td` | `padding: 9px 10px` | `var(--sp-2) var(--sp-3)` | ô bảng |
| `.order-note` | `margin: 12px 0 0` | `var(--sp-3) 0 0` | giữa các khối |
| `.order-form .field` | `margin-bottom: 12px` | `var(--sp-3)` | giữa các dòng nhập |
| `.order-form select, textarea` | `padding: 10px 12px` | `var(--sp-3)` | trong ô nhập |

> **`.card` 24px → 12/16px là thay đổi dễ thấy nhất của cả v9-B.** Nó làm mọi
> thẻ **gọn lại**, ngược chiều với các khe hở (10→12px) đang giãn ra. Lý do:
> hệ v5 đã chốt `padding: var(--sp-3) var(--sp-4)` cho `.list-row`, `.dt-row`,
> `.kpi`, `.skel-card`; `.card` ở 24px là phần sót của v2 chưa ai đụng tới, và
> hiện một `.card` đặt cạnh một `.list-row` có padding trong khác hẳn nhau.

Miễn trừ cho badge viết đúng dạng này:

```css
.badge {
  display: inline-block;
  /* spacing-exempt: viên badge cố ý chật; ép về lưới là đổi hình dạng, không phải sửa khoảng cách */
  padding: 3px 9px;
```

- [ ] **Step 3: Gỡ bốn mục khỏi `CHUA_CHUAN_HOA`**

Trong `tests/spacing-grid.test.ts`, xoá bốn dòng: `"(đầu file)"`, `"Badges"`, `"Table"`, `"Forms"`.

- [ ] **Step 4: Chạy test — phải XANH**

```bash
npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)|✖"
```

Đỏ nghĩa là còn sót một khai báo trong bốn mục đó. Thông báo lỗi in ra `file:dòng` và giá trị còn sót — sửa rồi chạy lại.

- [ ] **Step 5: Kiểm bằng mắt ở 375px**

Mở preview, chụp `/`, `/orders`, `/orders/new`, `/orders/<id>` ở 375px. Kiểm ba điều:

1. Thẻ gọn lại nhưng chữ **không** chạm viền.
2. Nút bấm vẫn cao ≥44px:
   ```js
   [...document.querySelectorAll(".btn")].map(b => b.getBoundingClientRect().height)
   ```
   Kỳ vọng: mọi số ≥ 44.
3. Ô nhập vẫn 16px:
   ```js
   [...new Set([...document.querySelectorAll("input,select,textarea")].map(el => getComputedStyle(el).fontSize))]
   ```
   Kỳ vọng: `["16px"]`.

- [ ] **Step 6: Commit**

```bash
git add src/styles/legacy.css tests/spacing-grid.test.ts
git commit -m "$(cat <<'EOF'
khoảng cách đợt 1: phần dùng chung (đầu file, badge, bảng, form)

.card đổi từ padding 24px sang var(--sp-3) var(--sp-4) — khớp .list-row,
.dt-row, .kpi của hệ v5. Đây là thay đổi dễ thấy nhất của v9-B: thẻ gọn
lại, ngược chiều với các khe hở đang giãn ra.

Badge giữ 3px 9px, miễn trừ có ghi lý do: ép về lưới là đổi hình dạng.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Đợt 2 — màn Đơn và Chi tiết đơn

**Files:**
- Modify: `src/styles/legacy.css` (mục `Order list`, `Cards & detail`, `Timeline`, `v3-A: bóc lớp giá theo món & cờ cần bổ sung`, `Hành trình đơn hàng (order detail)`)
- Modify: `tests/spacing-grid.test.ts`

**Interfaces:**
- Consumes: nền đã chuẩn từ Task 3
- Produces: hai màn dùng nhiều nhất đã chuẩn

Đây là đợt nặng nhất: riêng mục `v3-A` có ~205 dòng và `Hành trình đơn hàng` ~152 dòng.

- [ ] **Step 1: Liệt kê**

```bash
for m in "Order list" "Cards & detail" "Timeline" \
         "v3-A: bóc lớp giá theo món & cờ cần bổ sung" \
         "Hành trình đơn hàng (order detail)"; do
  node scripts/spacing-audit.mjs "$m"
done
```

- [ ] **Step 2: Áp bảng quyết định cho các luật đã biết**

| Selector | Hiện tại | Thành | Vai trò |
| --- | --- | --- | --- |
| `.attention` | `margin-bottom: 22px` | `var(--sp-5)` | giữa hai mục lớn |
| `.attention h2` | `margin: 0 0 10px` | `0 0 var(--sp-2)` | tiêu đề ↔ nội dung của nó |
| `.attention h2` | `gap: 8px` | `var(--sp-2)` | chữ ↔ số đếm, cùng dòng |
| `.card-title` | `margin: 0 0 14px` | `0 0 var(--sp-3)` | tiêu đề ↔ nội dung thẻ |
| `.card-title` | `gap: 8px` | `var(--sp-2)` | tiêu đề ↔ nút Sửa, cùng dòng |
| `.two-col` | `gap: 16px` | `var(--sp-4)` | giữa hai cột |
| `.two-col` | `margin-bottom: 16px` | `var(--sp-4)` | giữa các khối |
| `.card` | `margin-bottom: 16px` | `var(--sp-3)` | giữa các thẻ |
| `.kv` | `gap: 12px` | `var(--sp-3)` | nhãn ↔ giá trị, cùng dòng |
| `.kv` | `padding: 6px 0` | `var(--sp-2) 0` | giữa các dòng cùng nhóm |
| `.kv-total` | `margin-top: 4px` | `var(--sp-1)` | sát khối trên |
| `.kv-total` | `padding-top: 10px` | `var(--sp-2)` | tách khỏi đường kẻ |
| `.warn-flag` | `padding: 10px 12px` | `var(--sp-3)` | trong khối |
| `.warn-flag` | `margin-bottom: 14px` | `var(--sp-3)` | giữa các khối |
| `.timeline` | `gap: 12px` | `var(--sp-3)` | giữa các mốc |
| `.timeline li` | `padding-left: 12px` | `var(--sp-3)` | tách khỏi đường kẻ trái |
| `.tl-meta` | `margin-top: 2px` | **miễn trừ** | chú thích cố ý sát dòng trên |

Các luật còn lại của hai mục `v3-A` và `Hành trình đơn hàng` không liệt kê ở đây (quá dài, và Task 1 đã xoá bớt) — áp **bảng vai trò ở Global Constraints** cho chúng. Quy tắc đọc nhanh:

- Khoảng cách nằm **bên trong một dòng** (giữa chữ và số, giữa icon và nhãn) → `--sp-1` hoặc `--sp-2`
- Khoảng cách **giữa các dòng/mục lặp lại** → `--sp-2`
- Khoảng cách **giữa các khối/thẻ** → `--sp-3`
- **Padding trong một khối có nền/viền** → `var(--sp-3) var(--sp-4)`
- Khoảng cách **giữa các mục lớn có tiêu đề riêng** → `--sp-5`

- [ ] **Step 3: Gỡ năm mục khỏi `CHUA_CHUAN_HOA`**

Xoá: `"Order list"`, `"Cards & detail"`, `"Timeline"`, `"v3-A: bóc lớp giá theo món & cờ cần bổ sung"`, `"Hành trình đơn hàng (order detail)"`.

- [ ] **Step 4: Chạy test**

```bash
npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)|✖"
```

Kỳ vọng: PASS.

- [ ] **Step 5: Kiểm bằng mắt**

Mở `/orders` và `/orders/<id>` ở 375px, xem cả bốn tab của chi tiết đơn (`?tab=tom_tat`, `mon`, `tien`, `anh`). Kiểm riêng khối **Hành trình đơn hàng** — nó có timeline ngang dễ vỡ:

```js
// các bước hành trình không được chồng lên nhau
[...document.querySelectorAll(".journey-step")].map(e => e.getBoundingClientRect().width)
```

Kỳ vọng: mọi số > 0 và gần bằng nhau.

- [ ] **Step 6: Commit**

```bash
git add src/styles/legacy.css tests/spacing-grid.test.ts
git commit -m "$(cat <<'EOF'
khoảng cách đợt 2: màn Đơn và Chi tiết đơn

Gồm hai mục nặng nhất là bóc lớp giá theo món (v3-A) và hành trình đơn.
.tl-meta giữ margin-top 2px, miễn trừ có lý do: chú thích cố ý sát dòng
trên nó.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Đợt 3 — Tổng quan và Báo cáo

**Files:**
- Modify: `src/styles/legacy.css` (mục `Tổng quan (dashboard)`, `Thẻ trạng thái đơn (Tổng quan)`, `Lãi/lỗ`)
- Modify: `tests/spacing-grid.test.ts`

**Interfaces:**
- Consumes: nền từ Task 3
- Produces: màn Tổng quan và Báo cáo đã chuẩn

- [ ] **Step 1: Liệt kê**

```bash
for m in "Tổng quan (dashboard)" "Thẻ trạng thái đơn (Tổng quan)" "Lãi/lỗ"; do
  node scripts/spacing-audit.mjs "$m"
done
```

Mục `Lãi/lỗ` chỉ có `.pos`/`.neg` (thuần màu) nên nhiều khả năng ra 0 dòng — vẫn phải gỡ khỏi `CHUA_CHUAN_HOA` để nó bị khoá.

- [ ] **Step 2: Áp bảng quyết định**

| Selector | Hiện tại | Thành | Vai trò |
| --- | --- | --- | --- |
| `.dash-debtors li` | `gap: 12px` | `var(--sp-3)` | tên ↔ số tiền, cùng dòng |
| `.dash-debtors li` | `padding: 8px 0` | `var(--sp-2) 0` | giữa các dòng cùng nhóm |
| `.dash-actions` | `gap: 8px` | `var(--sp-2)` | giữa các nút xếp dọc |

Các luật của `Thẻ trạng thái đơn` áp bảng vai trò ở Global Constraints.

- [ ] **Step 3: Gỡ ba mục khỏi `CHUA_CHUAN_HOA`**

- [ ] **Step 4: Chạy test**

```bash
npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)|✖"
```

- [ ] **Step 5: Kiểm bằng mắt**

Mở `/` và `/reports` ở 375px **và** 1200px — màn Tổng quan có hàng KPI riêng cho desktop từ v8-A, phải xem cả hai.

- [ ] **Step 6: Commit**

```bash
git add src/styles/legacy.css tests/spacing-grid.test.ts
git commit -m "$(cat <<'EOF'
khoảng cách đợt 3: Tổng quan và Báo cáo

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Đợt 4 — Kho

**Files:**
- Modify: `src/styles/legacy.css` (mục `Tồn kho`, `Ảnh: upload + gallery`, `Tracking / Kiện`)
- Modify: `tests/spacing-grid.test.ts`

**Interfaces:**
- Consumes: nền từ Task 3
- Produces: màn Kho và khối ảnh đã chuẩn

Mục `Tracking / Kiện` sau Task 1 chỉ còn `.pkg-list-mini`.

- [ ] **Step 1: Liệt kê**

```bash
for m in "Tồn kho" "Ảnh: upload + gallery" "Tracking / Kiện"; do
  node scripts/spacing-audit.mjs "$m"
done
```

- [ ] **Step 2: Áp bảng vai trò ở Global Constraints**

Chú ý riêng khối ảnh: các ô ảnh trong lưới (`gap` giữa các thumbnail) thuộc vai trò "giữa các dòng cùng nhóm" → `--sp-2`. Padding của nút "+ Ảnh" theo `.btn-sm` đã chuẩn ở Task 3.

- [ ] **Step 3: Gỡ ba mục khỏi `CHUA_CHUAN_HOA`**

- [ ] **Step 4: Chạy test**

```bash
npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)|✖"
```

- [ ] **Step 5: Kiểm bằng mắt**

Mở `/inventory` ở 375px. Mở một dòng tồn để hiện Sheet (có khối ảnh + form bán). Rồi mở `/orders/<id>?tab=anh` để xem gallery ảnh.

Kiểm ảnh trong lưới không bị méo:
```js
[...document.querySelectorAll(".item-photo img, .gallery img")].map(i => `${i.clientWidth}x${i.clientHeight}`)
```
Kỳ vọng: các ô vuông đều nhau.

- [ ] **Step 6: Commit**

```bash
git add src/styles/legacy.css tests/spacing-grid.test.ts
git commit -m "$(cat <<'EOF'
khoảng cách đợt 4: màn Kho và khối ảnh

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Đợt 5 — phần còn lại, khoá toàn bộ

**Files:**
- Modify: `src/styles/legacy.css` (mọi mục còn lại)
- Modify: `src/styles/layout.css`, `src/styles/screens.css` (3 giá trị lệch)
- Modify: `tests/spacing-grid.test.ts` (`CHUA_CHUAN_HOA` thành mảng rỗng)

**Interfaces:**
- Consumes: bốn đợt trước
- Produces: `CHUA_CHUAN_HOA = []` — toàn bộ CSS bị khoá

- [ ] **Step 1: Liệt kê phần còn lại**

```bash
node scripts/spacing-audit.mjs
```

Còn lại các mục: `Khách hàng / cờ`, `Dòng đã tách`, `Đọc ảnh Zalo (AI)`, `Đăng nhập`, `Responsive`, cộng 3 giá trị trong `layout.css`/`screens.css`.

- [ ] **Step 2: Xác nhận `layout.css` và `screens.css` đã sạch từ Task 2**

Ba giá trị lệch của hai file mới đã xử lý xong ở Task 2 (`240px` → `--sidebar-w`,
`84px` → `--tabbar-clear`, `-12px` → `calc(var(--sp-3) * -1)`), và hai chỗ
`gap: 2px` của tabbar đã có miễn trừ với lý do cuối cùng. Chỉ cần kiểm lại:

```bash
node scripts/spacing-audit.mjs | grep -E "layout.css|screens.css" || echo "sạch"
```

Kỳ vọng: `sạch`. Nếu còn dòng nào, xử lý theo bảng vai trò ở Global Constraints.

- [ ] **Step 3: Áp bảng vai trò cho các mục còn lại của `legacy.css`**

Mục `Responsive` là `@media (max-width: 720px)` — bên trong chỉ có `grid-template-columns` và `min-width`, **không phải khoảng cách**, nên nhiều khả năng không phải sửa gì.

- [ ] **Step 4: Đặt `CHUA_CHUAN_HOA` thành mảng rỗng**

```ts
/**
 * RỖNG = toàn bộ legacy.css đã chuẩn hoá và bị khoá (v9-B xong).
 * Đừng thêm mục vào đây để né test — thêm `spacing-exempt` kèm lý do ở đúng
 * dòng cần miễn, hoặc sửa cho đúng thang.
 */
const CHUA_CHUAN_HOA: string[] = [];
```

- [ ] **Step 5: Chạy test và công cụ audit — cả hai phải sạch**

```bash
npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)|✖"
node scripts/spacing-audit.mjs | tail -1
```

Kỳ vọng: test PASS, và audit in `Tổng khai báo cần sửa: 0`.

Hai con số này kiểm hai thứ khác nhau: audit đếm px gõ cứng, test còn bắt cả biến không tồn tại và giá trị được miễn trừ sai cách. Cả hai phải sạch.

- [ ] **Step 6: Nghiệm thu toàn app**

Mở lần lượt ở **375px**: `/`, `/orders`, `/orders/new`, `/orders/<id>` (cả 4 tab), `/customers`, `/inventory`, `/products`, `/finance`, `/reports`, `/settings`, `/login`.

Hai phép kiểm bắt buộc của spec:

```js
// 1. Ô nhập vẫn 16px — dưới ngưỡng là Safari iOS tự phóng to trang
[...new Set([...document.querySelectorAll("input,select,textarea")].map(el => getComputedStyle(el).fontSize))]
```
Kỳ vọng: `["16px"]`.

```js
// 2. Thanh dính đáy vẫn cộng safe-area
getComputedStyle(document.querySelector(".tabbar")).paddingBottom
```
Kỳ vọng: khác `"0px"` trên thiết bị có safe-area; trên trình duyệt desktop trả `"0px"` là bình thường — kiểm bằng cách xác nhận CSS còn chứa `var(--sab)`:
```bash
grep -n "var(--sab)" src/styles/layout.css src/styles/components.css
```

- [ ] **Step 7: Commit**

```bash
git add src/styles/legacy.css src/styles/layout.css src/styles/screens.css tests/spacing-grid.test.ts
git commit -m "$(cat <<'EOF'
khoảng cách đợt 5: phần còn lại, khoá toàn bộ CSS

CHUA_CHUAN_HOA thành mảng rỗng — từ đây mọi padding/margin/gap trong
src/styles/ phải dùng var(--sp-*) hoặc mang comment spacing-exempt kèm
lý do.

Hai chỗ `gap: 2px` của tabbar được miễn trừ: đẩy lên 4px làm tabbar cao
thêm và ăn vào vùng nội dung.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Ghi nhận vào CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: bảy task trước
- Produces: không có

- [ ] **Step 1: Thêm v9-B vào dòng trạng thái**

Nối vào cuối đoạn trạng thái, ngay sau phần v9-A:

```
**v9-B xong** — chuẩn hoá toàn bộ khoảng cách về thang `--sp-*` theo VAI TRÒ
(không phải làm tròn con số cũ), xoá 37 class CSS chết, và khoá lại bằng
`tests/spacing-grid.test.ts`. Thay đổi dễ thấy nhất: `.card` từ `padding: 24px`
về `var(--sp-3) var(--sp-4)` cho khớp `.list-row`/`.dt-row`/`.kpi` của hệ v5.
Spec: `docs/superpowers/specs/2026-09-10-heyp-v9b-chuan-hoa-khoang-cach-design.md`,
kế hoạch: `docs/superpowers/plans/2026-09-10-heyp-v9b-chuan-hoa-khoang-cach.md`.
```

- [ ] **Step 2: Thêm gotcha**

Thêm vào mục "LƯU Ý QUAN TRỌNG", đặt cạnh gotcha về luật 16px của ô nhập:

```markdown
- **Mọi `padding`/`margin`/`gap` trong `src/styles/` phải dùng `var(--sp-*)`**
  (v9-B) — `tests/spacing-grid.test.ts` khoá điều này. Cố ý lệch thì thêm
  comment `/* spacing-exempt: lý do ≥10 ký tự */` ở dòng NGAY TRÊN; không có
  lý do thì test đỏ. Test cũng bắt `var(--sp-33)` kiểu gõ sai — CSS không có
  `tsc`, biến không tồn tại thì trình duyệt bỏ qua cả dòng, im lặng, phần tử
  rơi về `margin: 0`.
- **Chuẩn hoá khoảng cách theo VAI TRÒ, không làm tròn con số** (v9-B) — hai
  thẻ đang 20px và 14px mà làm tròn thì ra 24 và 16, **vẫn khác nhau**, tức
  không chữa được gì. Bảng vai trò nằm ở mục 3 của spec v9-B; thấy giao diện
  thưa/chật quá thì sửa MỘT dòng trong bảng đó rồi áp lại, đừng chỉnh tay
  từng chỗ.
- **`--tabbar-clear` = `calc(var(--tabbar-h) + var(--sp-6))` = 88px** (v9-B),
  thay số ma `84px` cũ. Đổi chiều cao tabbar giờ tự kéo theo khoảng hở đáy;
  trước v9-B quên sửa số 84 là nội dung cuối trang bị tabbar che mà không có
  gì báo.
```

- [ ] **Step 3: Thêm vào mục Tài liệu**

```markdown
- Thiết kế v9-B (chuẩn hoá khoảng cách): `docs/superpowers/specs/2026-09-10-heyp-v9b-chuan-hoa-khoang-cach-design.md`, kế hoạch: `docs/superpowers/plans/2026-09-10-heyp-v9b-chuan-hoa-khoang-cach.md`
```

- [ ] **Step 4: Commit và push**

```bash
npm test && npx tsc --noEmit
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
tài liệu: ghi nhận v9-B và ba gotcha khoảng cách

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
git push
```

- [ ] **Step 5: Kiểm production sau deploy**

```bash
curl -s -o /dev/null -w '%{http_code}\n' --max-redirs 0 https://hey-p.vercel.app/
```

Kỳ vọng: **307**. Ra 200 là hỏng cửa đăng nhập — xem gotcha `loading.tsx` trong CLAUDE.md.

## Nghiệm thu cuối

- [ ] `npm test` xanh, gồm `spacing-grid.test.ts`
- [ ] `npx tsc --noEmit` sạch
- [ ] `node scripts/spacing-audit.mjs | tail -1` in `Tổng khai báo cần sửa: 0`
- [ ] `CHUA_CHUAN_HOA` là mảng rỗng
- [ ] Mọi ô nhập còn `16px` trên mọi màn
- [ ] Cửa đăng nhập production trả 307
