"use client";

import { useState } from "react";
import Link from "next/link";
import { ListRow } from "@/app/_components/list-row";
import { Sheet } from "@/app/_components/sheet";
import { formatDateTime } from "@/lib/format";
import { updatePackageStatusAction } from "./actions";

export type PackageRowData = {
  id: number;
  trackingCode: string;
  carrier: string | null;
  mode: "auto" | "manual";
  weightKg: number | null;
  trackingStatus: string | null;
  lastCheckedAt: number | null;
  needsManualCheck: boolean;
  orderIds: number[];
};

export function PackageRow({ pkg }: { pkg: PackageRowData }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <ListRow
        onClick={() => setOpen(true)}
        title={
          <>
            {pkg.needsManualCheck && <span className="warn-dot" title="Cần tra tay" />}
            {pkg.trackingCode}
          </>
        }
        meta={
          <>
            {pkg.carrier ? `${pkg.carrier} · ` : ""}
            {pkg.trackingStatus ?? "— chưa có —"}
          </>
        }
        amount={pkg.mode === "auto" ? "Tự động" : "Tra tay"}
      />

      <Sheet open={open} title={pkg.trackingCode} onClose={() => setOpen(false)}>
        <div className="kv">
          <span>Đơn vị vận chuyển</span>
          <span>{pkg.carrier ?? "—"}</span>
        </div>
        <div className="kv">
          <span>Chế độ tra</span>
          <span>{pkg.mode === "auto" ? "Tự động" : "Tra tay"}</span>
        </div>
        {pkg.weightKg != null && (
          <div className="kv">
            <span>Cân nặng</span>
            <span>{pkg.weightKg} kg</span>
          </div>
        )}
        <div className="kv">
          <span>Trạng thái</span>
          <span>{pkg.trackingStatus ?? "— chưa có —"}</span>
        </div>
        {pkg.lastCheckedAt && (
          <div className="kv">
            <span>Tra lúc</span>
            <span>{formatDateTime(pkg.lastCheckedAt)}</span>
          </div>
        )}
        <div className="kv">
          <span>Đơn liên quan</span>
          <span>
            {pkg.orderIds.length === 0 ? (
              "chưa gắn"
            ) : (
              pkg.orderIds.map((oid, i) => (
                <span key={oid}>
                  {i > 0 && ", "}
                  <Link href={`/orders/${oid}`}>#{oid}</Link>
                </span>
              ))
            )}
          </span>
        </div>

        <form
          action={updatePackageStatusAction}
          style={{ marginTop: 16 }}
        >
          <input type="hidden" name="packageId" value={pkg.id} />
          <label className="field">
            <span>Cập nhật trạng thái bằng tay</span>
            <input name="status" placeholder="Đang vận chuyển…" defaultValue="" />
          </label>
          <button type="submit" className="btn">
            Lưu
          </button>
        </form>
      </Sheet>
    </>
  );
}
