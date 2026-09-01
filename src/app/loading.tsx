import { LoadingScreen } from "./_components/loading-screen";

/**
 * Suspense boundary ở GỐC — trước đây app không có file này, nên bấm sang màn
 * khác mà server render lâu thì tuyệt đối không có phản hồi nào: màn hình cũ
 * đứng nguyên, không biết máy có nhận lệnh không. Đó chính là cái "đơ" người
 * dùng thấy.
 *
 * Đặt ở gốc là đủ cho mọi màn: các trang không dùng layout chung có bọc dữ
 * liệu riêng, mỗi trang tự dựng AppShell của nó, nên khi chuyển màn là cả
 * khung thay mới — không có phần nào đáng giữ lại trong lúc chờ.
 */
export default function Loading() {
  return <LoadingScreen />;
}
