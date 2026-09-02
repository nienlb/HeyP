import { ContentSkeleton } from "@/app/_components/content-skeleton";
import { RedirectRescue } from "@/app/_components/redirect-rescue";

/**
 * Ranh giới Suspense của group. Nó bọc {children} của (app)/layout.tsx, nên
 * khung (sidebar/header/tabbar) nằm TRÊN nó và không bị thay.
 *
 * RedirectRescue vẫn cần: redirect() xảy ra DƯỚI boundary này — requireAdmin()
 * ở màn admin, và tài khoản bị khoá giữa chừng — vẫn không trả 307 được.
 * Xem chú thích dài trong src/app/_components/redirect-rescue.tsx.
 */
export default function Loading() {
  return (
    <>
      <RedirectRescue />
      <ContentSkeleton />
    </>
  );
}
