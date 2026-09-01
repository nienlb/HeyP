import { LoadingScreen } from "./_components/loading-screen";
import { RedirectRescue } from "./_components/redirect-rescue";

/**
 * Suspense boundary ở GỐC — trước đây app không có file này, nên bấm sang màn
 * khác mà server render lâu thì tuyệt đối không có phản hồi nào: màn hình cũ
 * đứng nguyên, không biết máy có nhận lệnh không. Đó chính là cái "đơ" người
 * dùng thấy.
 *
 * Đặt ở gốc là đủ cho mọi màn: các trang không dùng layout chung có bọc dữ
 * liệu riêng, mỗi trang tự dựng AppShell của nó, nên khi chuyển màn là cả
 * khung thay mới — không có phần nào đáng giữ lại trong lúc chờ.
 *
 * CÁI GIÁ của boundary này, và vì sao có <RedirectRescue>: xem chú thích dài
 * trong src/middleware.ts. Tóm tắt: có boundary ở gốc thì vỏ trang được đẩy
 * xuống trình duyệt ngay, nên một redirect() lúc render KHÔNG còn trả 307
 * được nữa; Next lùi về thẻ meta refresh mà React 19 gỡ mất → spinner quay
 * vĩnh viễn. Middleware đã dọn trường hợp thường gặp nhất (chưa đăng nhập);
 * RedirectRescue lo phần còn lại (requireAdmin, tài khoản bị khoá giữa chừng).
 */
export default function Loading() {
  return (
    <>
      <RedirectRescue />
      <LoadingScreen />
    </>
  );
}
