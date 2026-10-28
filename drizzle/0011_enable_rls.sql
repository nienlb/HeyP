-- Supabase mở schema public qua REST API (PostgREST) cho vai trò anon và
-- authenticated, và mặc định cấp cho hai vai trò đó TOÀN QUYỀN trên mọi bảng
-- tạo trong public. Advisor báo "RLS Disabled in Public" ở mức ERROR cho cả
-- 16 bảng: ai cầm anon key là đọc được users.password_hash, sửa được tiền.
--
-- App KHÔNG dùng hai vai trò đó: DB đi bằng role postgres qua pooler, Storage
-- đi bằng service_role, cả hai đều BYPASSRLS. Nên bật RLS mà không có policy
-- nào = chặn hẳn anon/authenticated, app không đổi gì.
--
-- Hai lớp: (1) bật RLS mọi bảng public, (2) thu hồi quyền của anon/authenticated
-- trên bảng, sequence, function hiện có VÀ mặc định cho đối tượng tạo sau này.
-- Bảng mới tạo sau vẫn phải tự ENABLE ROW LEVEL SECURITY — default privileges
-- không bật RLS hộ.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;--> statement-breakpoint

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;--> statement-breakpoint

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
