-- Migration 0002: bổ sung cho Tracking (Phase 6)
--   carrier: tên đơn vị vận chuyển (để chọn adapter tra tự động)
--   needs_manual_check: cờ "tra tay" khi tra tự động thất bại / chưa có adapter

ALTER TABLE packages ADD COLUMN carrier TEXT;
ALTER TABLE packages ADD COLUMN needs_manual_check INTEGER NOT NULL DEFAULT 0;
