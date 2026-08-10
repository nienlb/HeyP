import { requireAuth } from "@/lib/auth";
import { AppHeader } from "../_components/app-header";
import { listInventory } from "@/db/queries";
import { formatVnd } from "@/lib/format";
import {
  INVENTORY_SOURCES,
  INVENTORY_SOURCE_LABELS,
  type InventorySource,
} from "@/lib/inventory";
import { SellForm } from "./sell-form";

export default async function InventoryPage() {
  const session = await requireAuth();
  const rows = await listInventory();
  const inStock = rows.filter((r) => r.quantity > 0);

  const groups = INVENTORY_SOURCES.map((source) => ({
    source,
    items: inStock.filter((r) => r.source === source),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <AppHeader username={session.username} />
      <main className="container">
        <div className="page-head">
          <h1>Tồn kho</h1>
        </div>

        {inStock.length === 0 ? (
          <div className="card empty">
            <p>
              Kho trống. Hàng vào kho từ đơn Nhập kho (về VN), hàng lỗi NCC, đổi
              trả, hoặc khách bom.
            </p>
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.source} className="status-group">
              <h2>{INVENTORY_SOURCE_LABELS[g.source as InventorySource]}</h2>
              <div className="order-list">
                {g.items.map((it) => (
                  <details key={it.id} className="inv-item card">
                    <summary>
                      <span className="inv-name">{it.productName}</span>
                      <span className="inv-qty">Còn {it.quantity}</span>
                      <span className="inv-cost">
                        Vốn {formatVnd(it.avgCost)}/cái
                      </span>
                      <span className="inv-sell-hint">Bán →</span>
                    </summary>
                    <SellForm
                      inventoryId={it.id}
                      quantity={it.quantity}
                      avgCost={it.avgCost}
                    />
                  </details>
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </>
  );
}
