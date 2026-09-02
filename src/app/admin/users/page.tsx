import { requireAdmin } from "@/lib/auth";
import { listUsers } from "@/db/users";
import { AppShell } from "@/app/_components/app-shell";
import { UsersList, type UserItem } from "./users-list";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const [session, { ok, err }, users] = await Promise.all([
    requireAdmin(),
    searchParams,
    listUsers(),
  ]);

  const items: UserItem[] = users.map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    active: u.active,
    createdAt: u.createdAt.toLocaleDateString("vi-VN"),
  }));

  return (
    <AppShell username={session.username} title="Thành viên" backHref="/">
      {err && <div className="error">{err}</div>}
      {ok && <div className="ok-banner">✓ Đã lưu.</div>}
      <UsersList users={items} currentUserId={session.id} />
    </AppShell>
  );
}
