-- Guardrail chống connection "mồ côi" trên Supavisor pooler (v6, 01/09).
--
-- VÌ SAO PHẢI ĐẶT Ở MỨC ROLE, KHÔNG PHẢI Ở CONNECTION OPTION:
-- Supavisor ở chế độ transaction (cổng 6543 — đúng cổng production dùng)
-- KHÔNG truyền tham số khởi tạo của client xuống server connection. Đã đo
-- thực tế: kết nối qua 6543 với option statement_timeout=15000 thì
-- `SHOW statement_timeout` vẫn trả về 2min (mặc định của server). Nghĩa là
-- option `connection: { statement_timeout }` trong src/db/index.ts KHÔNG có
-- tác dụng trên production — biện pháp chống sự cố 31/08 chưa bao giờ chạy.
--
-- Đặt ở mức ROLE thì server áp dụng lúc chính nó mở connection, nên pooler
-- không bỏ qua được.
--
-- Vì sao cần idle_in_transaction_session_timeout: mặc định của Supabase là 0
-- (TẮT). Khi Vercel đóng băng/giết function giữa một `withTx`, server
-- connection nằm lại ở trạng thái "idle in transaction" VĨNH VIỄN, giữ luôn
-- slot trong pool dùng chung. Đã tái hiện được bằng thí nghiệm. Tích luỹ đủ
-- nhiều thì pool cạn → request xếp hàng → đúng hiện tượng "lúc được lúc không".
--
-- statement_timeout chỉ tính thời gian THỰC THI, không tính lúc chờ client,
-- nên một mình nó không đủ — phải có cả hai.

ALTER ROLE postgres SET statement_timeout = '15s';
--> statement-breakpoint
ALTER ROLE postgres SET idle_in_transaction_session_timeout = '30s';
