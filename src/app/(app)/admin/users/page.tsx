import { requireOwner } from "@/lib/auth";
import { listUsers } from "@/db/users";
import { UsersList, type UserItem } from "./users-list";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const [session, { ok, err }, users] = await Promise.all([
    requireOwner(),
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
    <>
      {err && <div className="error">{err}</div>}
      {ok && <div className="ok-banner">✓ Đã lưu.</div>}
      <UsersList users={items} currentUserId={session.id} />
    </>
  );
}
