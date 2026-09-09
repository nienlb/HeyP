import { requireAuth } from "@/lib/auth";
import { getSettings, listInventory, listPhotosForInventory } from "@/db/queries";
import { listProducts } from "@/db/products";
import {
  INVENTORY_SOURCES,
  INVENTORY_SOURCE_LABELS,
  type InventorySource,
} from "@/lib/inventory";
import { InventoryRow } from "./inventory-row";
import { StockInSheet } from "./stock-in-sheet";

export default async function InventoryPage() {
  const [session, rows, settings, products] = await Promise.all([
    requireAuth(),
    listInventory(),
    getSettings(),
    listProducts(),
  ]);
  const inStock = rows.filter((r) => r.quantity > 0);
  const photosByItem = new Map(
    await Promise.all(
      inStock.map(
        async (it) =>
          [it.id, await listPhotosForInventory(it.id)] as const,
      ),
    ),
  );

  const groups = INVENTORY_SOURCES.map((source) => ({
    source,
    items: inStock.filter((r) => r.source === source),
  })).filter((g) => g.items.length > 0);

  return (
    <>
        <StockInSheet
          defaultRate={settings.sellRate}
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
        />

        {inStock.length === 0 ? (
          <div className="card empty">
            <p>
              Kho trống. Bấm + ở góc trên để nhập hàng, hoặc hàng vào kho từ
              đơn Nhập kho, hàng lỗi NCC, đổi trả, hoặc khách bom.
            </p>
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.source}>
              <h2 className="sec-label">
                {INVENTORY_SOURCE_LABELS[g.source as InventorySource]}
              </h2>
              {g.items.map((it) => (
                <InventoryRow
                  key={it.id}
                  id={it.id}
                  productName={it.productName}
                  quantity={it.quantity}
                  avgCost={it.avgCost}
                  photos={(photosByItem.get(it.id) ?? []).map((p) => ({
                    id: p.id,
                    label: p.label,
                  }))}
                  size={it.size}
                  color={it.color}
                  hasProduct={it.productId !== null}
                />
              ))}
            </section>
          ))
        )}
    </>
  );
}
