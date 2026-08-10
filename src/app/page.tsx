import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";

export default async function HomePage() {
  await requireAuth();
  redirect("/orders");
}
