/**
 * Mã hành động cho nhật ký hoạt động (v8-C). Module thuần.
 *
 * Khuôn mã: `<entity>.<verb>`. Phần entity phải nằm trong ACTIVITY_ENTITIES —
 * có test khoá — để màn nhật ký lọc theo nhóm được mà không phải đoán.
 *
 * Nhãn để riêng khỏi mã: mã đi vào DB và không bao giờ đổi (dòng cũ vẫn phải
 * đọc được), còn nhãn là câu chữ giao diện, sửa lúc nào cũng được.
 */
export const ACTIVITY_ENTITIES = [
  "order",
  "customer",
  "payment",
  "expense",
  "cny",
  "inventory",
  "user",
  "settings",
  "backup",
  "session",
] as const;
export type ActivityEntity = (typeof ACTIVITY_ENTITIES)[number];

export const ACTION_LABELS: Record<string, string> = {
  "order.create": "Tạo đơn",
  "order.update": "Sửa đơn",
  "order.status": "Đổi trạng thái đơn",
  "order.item_add": "Thêm món",
  "order.item_remove": "Xoá món",
  "order.delete": "Xoá đơn",
  "order.photo_delete": "Xoá ảnh",
  "customer.delete": "Xoá khách",
  "payment.add": "Thu tiền",
  "payment.delete": "Xoá phiếu thu",
  "expense.add": "Thêm chi phí",
  "expense.delete": "Xoá chi phí",
  "cny.topup": "Nạp ví ¥",
  "cny.delete": "Xoá dòng ví ¥",
  "inventory.stock_in": "Nhập kho",
  "inventory.sell": "Bán từ kho",
  "user.create": "Tạo thành viên",
  "user.update": "Sửa thành viên",
  "settings.save": "Sửa cài đặt giá",
  "backup.download": "Tải bản sao lưu",
  "session.login": "Đăng nhập",
  "session.login_failed": "Đăng nhập thất bại",
};

export function entityOf(code: string): string {
  const i = code.indexOf(".");
  return i < 0 ? code : code.slice(0, i);
}

/** Trả chính mã khi chưa có nhãn — nhật ký cũ phải đọc được, không được vỡ. */
export function actionLabel(code: string): string {
  return ACTION_LABELS[code] ?? code;
}
