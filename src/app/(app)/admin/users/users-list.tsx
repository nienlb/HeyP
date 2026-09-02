"use client";

import { useState } from "react";
import { Sheet } from "@/app/_components/sheet";
import { ListRow } from "@/app/_components/list-row";
import { ROLE_LABELS, USER_ROLES, type UserRole } from "@/lib/roles";
import { createUserAction, userAdminAction } from "./actions";

export type UserItem = {
  id: number;
  username: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
};

export function UsersList({
  users,
  currentUserId,
}: {
  users: UserItem[];
  currentUserId: number;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<UserItem | null>(null);

  return (
    <>
      <button
        type="button"
        className="header-action-float"
        onClick={() => setAddOpen(true)}
        aria-label="Thêm thành viên"
      >
        +
      </button>

      {users.map((u) => (
        <ListRow
          key={u.id}
          onClick={() => setEditing(u)}
          title={
            <>
              {u.username}
              {u.id === currentUserId && (
                <span className="muted small"> · bạn</span>
              )}
            </>
          }
          meta={`${ROLE_LABELS[u.role]} · ${u.active ? "Đang hoạt động" : "Đã khoá"} · ${u.createdAt}`}
        />
      ))}

      <Sheet
        open={addOpen}
        title="Thêm thành viên"
        onClose={() => setAddOpen(false)}
      >
        <form action={createUserAction}>
          <label className="field">
            <span>Tài khoản *</span>
            <input name="username" required autoComplete="off" />
          </label>
          <label className="field">
            <span>Mật khẩu *</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="new-password"
            />
          </label>
          <label className="field">
            <span>Vai trò</span>
            <select name="role" defaultValue="member">
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn" style={{ width: "100%" }}>
            Tạo tài khoản
          </button>
        </form>
      </Sheet>

      <Sheet
        open={editing !== null}
        title={editing ? editing.username : ""}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <div className="sheet-menu">
            <form action={userAdminAction}>
              <input type="hidden" name="op" value="role" />
              <input type="hidden" name="id" value={editing.id} />
              <label className="field">
                <span>Vai trò</span>
                <select name="role" defaultValue={editing.role}>
                  {USER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="btn btn-outline">
                Lưu vai trò
              </button>
            </form>

            <form action={userAdminAction}>
              <input type="hidden" name="op" value="password" />
              <input type="hidden" name="id" value={editing.id} />
              <label className="field">
                <span>Đặt lại mật khẩu</span>
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Mật khẩu mới"
                />
              </label>
              <button type="submit" className="btn btn-outline">
                Đặt lại mật khẩu
              </button>
            </form>

            <form action={userAdminAction}>
              <input type="hidden" name="op" value="active" />
              <input type="hidden" name="id" value={editing.id} />
              <input
                type="hidden"
                name="active"
                value={editing.active ? "false" : "true"}
              />
              <button type="submit" className="btn btn-outline">
                {editing.active ? "Khoá tài khoản" : "Mở khoá tài khoản"}
              </button>
            </form>

            <form action={userAdminAction}>
              <input type="hidden" name="op" value="delete" />
              <input type="hidden" name="id" value={editing.id} />
              <button type="submit" className="btn btn-danger">
                Xoá tài khoản
              </button>
            </form>
          </div>
        )}
      </Sheet>
    </>
  );
}
