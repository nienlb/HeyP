import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/session-token";

/**
 * Cửa đăng nhập đặt TRƯỚC khi render — đây là chỗ DUY NHẤT chặn được người
 * chưa đăng nhập mà không rơi vào cái bẫy dưới đây.
 *
 * SỰ CỐ 01/09 (mở app là đứng ở màn "Đang tải…" vĩnh viễn, không bao giờ
 * thấy được form đăng nhập):
 *
 * `src/app/loading.tsx` tạo một Suspense boundary ở GỐC. Có boundary đó,
 * Next đẩy phần vỏ trang xuống trình duyệt NGAY — nghĩa là HTTP header đã
 * gửi đi rồi. Lát sau requireAuth() gọi redirect("/login"), nhưng lúc này
 * không còn cách nào trả 307 nữa, nên Next đành:
 *   1. nhét `<meta id="__next-page-redirect" http-equiv="refresh"
 *      content="1;url=/login">` vào <head>, và
 *   2. đánh dấu boundary là lỗi `NEXT_REDIRECT` trong luồng RSC.
 * Cả hai đều trượt: React 19 hydrate <head> và GỠ thẻ meta đó ra trước khi
 * đồng hồ 1 giây kịp chạy, còn nhánh RSC thì không bao giờ nổ vì React không
 * hydrate nội dung fallback của Suspense. Kết quả: HTTP 200, spinner quay
 * mãi, không có đường ra. Đã đo trên production: `curl /` trả 200 kèm
 * `NEXT_REDIRECT;replace;/login;307;`; bỏ loading.tsx đi thì trả 307 thật.
 *
 * Middleware chạy TRƯỚC toàn bộ chuyện đó nên không dính: 307 thật, không có
 * byte HTML nào được gửi, không phụ thuộc React chạy hay không.
 *
 * Chỉ kiểm CHỮ KÝ cookie (Web Crypto, không đụng DB): middleware chạy mọi
 * request nên phải rẻ, và Edge runtime cũng không nối được tới Postgres.
 * Việc "tài khoản còn sống, còn quyền không" vẫn do requireAuth()/requireAdmin()
 * đọc DB ở từng trang — middleware KHÔNG thay thế chúng.
 */

const LOGIN_PATH = "/login";

/** Đường công khai, không cần phiên. */
function isPublic(pathname: string): boolean {
  return pathname === LOGIN_PATH;
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  // CHỈ gác request điều hướng (GET/HEAD). Server action là POST tới chính
  // URL hiện tại; 307 giữ nguyên method nên chuyển hướng một POST là bắn lại
  // cả body sang /login — vừa vô nghĩa vừa nguy hiểm. Server action tự lo
  // phần phiên hết hạn bằng redirect("/login") của nó, và đường đó KHÔNG dính
  // lỗi trên vì lúc ấy React đã hydrate xong.
  if (req.method !== "GET" && req.method !== "HEAD") return NextResponse.next();

  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(
    token,
    process.env.SESSION_SECRET ?? "insecure-dev-secret-doi-di",
  );

  if (!session && !isPublic(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = "";
    return NextResponse.redirect(url, 307);
  }

  // Đã đăng nhập mà mở /login thì về Tổng quan. Trang /login cũng có
  // redirect("/") riêng, nhưng nó là redirect lúc render → dính đúng cái bẫy
  // mô tả ở trên. Chặn ở đây để nó không bao giờ phải chạy.
  if (session && pathname === LOGIN_PATH) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url, 307);
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Bỏ qua:
   *   - `api/…`  — route API tự xác thực theo cách riêng. Quan trọng:
   *     `/api/health` CỐ Ý không cần phiên (nó là thứ đi chẩn đoán lúc phiên
   *     đã chết), còn `/api/cron/track` vào bằng CRON_SECRET chứ không có
   *     cookie — gác chúng ở đây là tự bịt mắt mình và làm hỏng cron.
   *   - `_next/…` — bundle JS/CSS.
   *   - mọi đường có dấu chấm — file tĩnh (icon-192.png, manifest.webmanifest,
   *     logo.png…). Icon PWA phải tải được TRƯỚC khi đăng nhập.
   */
  matcher: ["/((?!api|_next|.*\\.).*)"],
};
