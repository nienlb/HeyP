import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { AppShell } from "../../_components/app-shell";
import { getSettings, listCustomers } from "@/db/queries";
import { NewOrderForm } from "./new-order-form";

export default async function NewOrderPage() {
  const [session, customers, settings] = await Promise.all([
    requireAuth(),
    listCustomers(),
    getSettings(),
  ]);

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
          defaultExchangeRate={settings.sellRate}
          defaultMarginVnd={settings.defaultMarginVnd}
        />
    </AppShell>
  );
}
