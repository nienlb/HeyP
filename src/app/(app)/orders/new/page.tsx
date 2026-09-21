import { requireAuth } from "@/lib/auth";
import { getSettings, listCustomers } from "@/db/queries";
import { listProducts } from "@/db/products";
import { NewOrderForm } from "./new-order-form";

export default async function NewOrderPage() {
  const [, customers, settings, products] = await Promise.all([
    requireAuth(),
    listCustomers(),
    getSettings(),
    listProducts(),
  ]);

  return (
    <>
        <NewOrderForm
          customers={customers.map((c) => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            warningFlag: c.warningFlag,
            warningReason: c.warningReason,
          }))}
          products={products.map((p) => ({
            id: p.id,
            name: p.name,
            sizes: p.sizes,
            colors: p.colors,
            defaultSellVnd: p.defaultSellVnd,
            defaultUnitPriceCny: p.defaultUnitPriceCny,
            productUrl: p.productUrl,
            photoIds: p.photoIds,
          }))}
          defaultExchangeRate={settings.sellRate}
          defaultMarginVnd={settings.defaultMarginVnd}
        />
    </>
  );
}
