import { requireAuth } from "@/lib/auth";
import { atLeast } from "@/lib/roles";
import { listProducts } from "@/db/products";
import { ProductsScreen } from "./products-screen";

export default async function ProductsPage() {
  // Layout (app)/layout.tsx đã lo khung; trang chỉ render nội dung.
  const [session, products] = await Promise.all([requireAuth(), listProducts()]);
  return (
    <ProductsScreen
      canDelete={atLeast(session.role, "admin")}
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
  );
}
