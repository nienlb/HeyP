"use client";

import { Sheet } from "../_components/sheet";
import { STATUS_LABELS } from "@/lib/order-status";
import { formatCny } from "@/lib/format";
import type { BulkPlan } from "@/lib/bulk-status";

export function BulkSheet({
  open,
  plan,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  plan: BulkPlan;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Sheet
      open={open}
      title="Chuyển bước tiếp theo"
      onClose={onClose}
      footer={
        <div className="sheet-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Huỷ
          </button>
          <button
            type="button"
            className="btn"
            disabled={pending || plan.total === 0}
            onClick={onConfirm}
          >
            {pending ? "Đang chuyển…" : `Chuyển ${plan.total} đơn`}
          </button>
        </div>
      }
    >
      {plan.groups.map((g) => (
        <div key={`${g.from}-${g.to}`} className="bulk-group">
          <strong>{g.ids.length} đơn</strong>{" "}
          <span>
            {STATUS_LABELS[g.from]} → {STATUS_LABELS[g.to]}
          </span>
          {g.cnyTotal > 0 && (
            <div className="bulk-warn">
              ⚠ sẽ trừ {formatCny(g.cnyTotal)} khỏi ví
            </div>
          )}
        </div>
      ))}

      {plan.skipped.length > 0 && (
        <div className="bulk-group muted">
          <strong>{plan.skipped.length} đơn</strong> bỏ qua —{" "}
          {plan.skipped[0].reason}
          {plan.skipped.length > 1 && " (và tương tự)"}
        </div>
      )}

      {plan.total === 0 && <p className="muted">Không đơn nào chuyển được.</p>}
    </Sheet>
  );
}
