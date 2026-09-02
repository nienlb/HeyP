/**
 * Ngưỡng thời gian cho phản hồi "đang tải" của UI.
 *
 * Module thuần, KHÔNG import gì — cả client component lẫn route server đều
 * dùng chung, và test import trực tiếp được.
 */

/**
 * Bao lâu thì coi là "chậm bất thường" và bật bảng chẩn đoán.
 *
 * Chọn 8s: dài hơn hẳn một lần điều hướng bình thường (đo trên production:
 * 0.25–0.7s) nên người dùng thao tác bình thường không bao giờ thấy bảng
 * này; nhưng ngắn hơn statement_timeout 15s của DB, để lúc DB kẹt thì người
 * dùng được báo TRƯỚC khi request chết, thay vì ngồi nhìn màn hình đứng im.
 */
export const SLOW_AFTER_MS = 8000;

/**
 * Trần cho chính lời gọi /api/health. Phải ngắn — nó là thứ đi chẩn đoán,
 * không được kẹt theo cái mà nó đang chẩn đoán.
 */
export const PROBE_TIMEOUT_MS = 5000;
