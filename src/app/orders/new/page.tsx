import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { AppHeader } from "../../_components/app-header";
import { listCustomers } from "@/db/queries";
import { NewOrderForm } from "./new-order-form";

export default async function NewOrderPage() {
  const session = await requireAuth();
  const customers = await listCustomers();

  return (
    <>
      <AppHeader username={session.username} />
      <main className="container">
        <div className="crumbs">
          <Link href="/orders">← Danh sách đơn</Link>
        </div>
        <h1>Tạo đơn nhanh</h1>
        <NewOrderForm
          customers={customers.map((c) => ({ id: c.id, name: c.name }))}
          defaultExchangeRate={3600}
        />
      </main>
    </>
  );
}
