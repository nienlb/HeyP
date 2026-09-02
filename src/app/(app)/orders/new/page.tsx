import { requireAuth } from "@/lib/auth";
import { getSettings, listCustomers } from "@/db/queries";
import { NewOrderForm } from "./new-order-form";

export default async function NewOrderPage() {
  const [, customers, settings] = await Promise.all([
    requireAuth(),
    listCustomers(),
    getSettings(),
  ]);

  return (
    <>
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
    </>
  );
}
