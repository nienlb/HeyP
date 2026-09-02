"use client";

import { useActionState } from "react";
import { changePasswordAction, type PasswordState } from "./actions";

export function PasswordForm() {
  const [state, formAction, pending] = useActionState<PasswordState, FormData>(
    changePasswordAction,
    {},
  );

  return (
    <section className="card" style={{ maxWidth: 520 }}>
      <h2 className="card-title">Đổi mật khẩu</h2>

      {state.error && <div className="error">{state.error}</div>}
      {state.ok && <div className="ok-banner">✓ Đã đổi mật khẩu.</div>}

      <form action={formAction}>
        <label className="field">
          <span>Mật khẩu hiện tại</span>
          <input
            name="current"
            type="password"
            required
            autoComplete="current-password"
          />
        </label>
        <label className="field">
          <span>Mật khẩu mới</span>
          <input
            name="next"
            type="password"
            required
            autoComplete="new-password"
          />
        </label>
        <label className="field">
          <span>Nhập lại mật khẩu mới</span>
          <input
            name="confirm"
            type="password"
            required
            autoComplete="new-password"
          />
        </label>
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Đang đổi…" : "Đổi mật khẩu"}
        </button>
      </form>

      <p className="muted small" style={{ marginBottom: 0 }}>
        Đổi mật khẩu không làm bạn bị đăng xuất trên máy này.
      </p>
    </section>
  );
}
