import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { AppShell } from "../../_components/app-shell";
import { listCustomers } from "@/db/queries";
import { NewOrderForm } from "./new-order-form";

export default async function NewOrderPage() {
  const session = await requireAuth();
  const customers = await listCustomers();

  return (
    <AppShell username={session.username}>
        <div className="crumbs">
          <Link href="/orders">← Danh sách đơn</Link>
        </div>
        <h1>Tạo đơn nhanh</h1>
        <NewOrderForm
          customers={customers.map((c) => ({
            id: c.id,
            name: c.name,
            warningFlag: c.warningFlag,
            warningReason: c.warningReason,
          }))}
          defaultExchangeRate={3600}
        />
    </AppShell>
  );
}
