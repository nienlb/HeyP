import Link from "next/link";
import { getLogoUrl } from "@/lib/logo";

/**
 * Trang 404 — CỐ Ý không bọc <AppShell>.
 *
 * AppShell gọi getSession(), tức là đọc bảng users mỗi lần render. Nhưng 404
 * là màn phải hiện được cả khi phiên hỏng hoặc DB chậm; bắt nó đọc DB là tự
 * thêm một chỗ có thể treo, đúng vào lúc mọi thứ khác đã hỏng.
 *
 * Người CHƯA đăng nhập gõ URL sai sẽ bị middleware đá về /login trước khi tới
 * đây (middleware gác mọi GET), nên trang này gần như chỉ người đã đăng nhập
 * mới thấy.
 */
export default function NotFound() {
  const logoUrl = getLogoUrl();
  return (
    <div className="error-screen">
      <div className="error-screen-inner">
        {logoUrl ? (
          <img src={logoUrl} alt="HeyP" width={56} height={56} />
        ) : (
          <strong style={{ fontSize: "var(--fs-5)" }}>HeyP</strong>
        )}
        <h1 className="error-screen-heading">Không tìm thấy trang</h1>
        <p className="recovery-detail" style={{ margin: 0 }}>
          Đường dẫn này không tồn tại, hoặc mục bạn tìm đã bị xoá.
        </p>
        <div className="recovery-actions">
          <Link className="btn" href="/">
            Về Tổng quan
          </Link>
          <Link className="btn btn-outline" href="/orders">
            Xem danh sách đơn
          </Link>
        </div>
      </div>
    </div>
  );
}
