-- v8-C: hai vai trò (admin/nhan_vien) thành ba (owner/admin/member).
--
-- Cột `users.role` là `text` thuần, KHÔNG có CHECK constraint (đã kiểm trên
-- DB thật ngày 02/09), nên không cần DDL nào cho tập giá trị — enum của
-- Drizzle chỉ tồn tại ở tầng TypeScript.

UPDATE users SET role = 'member' WHERE role = 'nhan_vien';

ALTER TABLE users ALTER COLUMN role SET DEFAULT 'member';

-- Dòng này là DỮ LIỆU, không phải cấu trúc — cố ý để trong migration.
-- Thiếu nó thì ngay sau deploy hệ thống có 0 owner, và vì quản lý thành viên
-- là Owner-only nên KHÔNG AI vào được màn đó nữa để tự sửa; phải sửa thẳng
-- trong Supabase mới cứu được.
UPDATE users SET role = 'owner' WHERE username = 'nien';
