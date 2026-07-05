import { useState } from "react";
import { useStore } from "../store/useStore";

// Панель «Аккаунт»: вход по email+паролю и сквозная синхронизация прогресса
// между устройствами. Если облако не настроено (нет ключей Supabase) —
// панель не показывается, приложение работает офлайн как раньше.
export default function AccountPanel() {
  const cloudEnabled = useStore((s) => s.cloudEnabled);
  const user = useStore((s) => s.user);
  const syncing = useStore((s) => s.syncing);
  const lastSyncedAt = useStore((s) => s.lastSyncedAt);
  const syncError = useStore((s) => s.syncError);
  const login = useStore((s) => s.login);
  const logout = useStore((s) => s.logout);
  const syncNow = useStore((s) => s.syncNow);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!cloudEnabled) return null;

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      setPassword("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <div className="panel">
        <div className="lbl" style={{ marginBottom: 4 }}>
          Аккаунт — сквозной прогресс
        </div>
        <p className="muted" style={{ fontSize: 13, margin: "0 0 12px" }}>
          Войди, чтобы прогресс синхронизировался между компом и iPad.
        </p>
        <form className="stack" onSubmit={onLogin}>
          <input
            className="auth-input"
            type="email"
            inputMode="email"
            autoComplete="username"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="auth-input"
            type="password"
            autoComplete="current-password"
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? "Вход…" : "Войти"}
          </button>
          {error && (
            <div style={{ color: "var(--red)", fontSize: 13 }}>{error}</div>
          )}
        </form>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="row-between" style={{ marginBottom: 12 }}>
        <div>
          <div className="lbl">Аккаунт</div>
          <div style={{ fontSize: 14 }}>{user.email}</div>
        </div>
        <span
          title={syncing ? "Синхронизация…" : "Синхронизировано"}
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: syncError
              ? "var(--red)"
              : syncing
                ? "var(--amber)"
                : "var(--green)",
          }}
        />
      </div>
      <div className="stack">
        <button className="btn ghost" onClick={() => syncNow()} disabled={syncing}>
          {syncing ? "Синхронизация…" : "🔄 Синхронизировать сейчас"}
        </button>
        <div className="muted" style={{ fontSize: 13, textAlign: "center" }}>
          {syncError
            ? `⚠️ ${syncError}`
            : lastSyncedAt
              ? `Обновлено: ${new Date(lastSyncedAt).toLocaleTimeString("ru-RU", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : "Прогресс синхронизируется автоматически."}
        </div>
        <button
          className="btn"
          style={{
            color: "var(--muted)",
            background: "transparent",
            border: "1px solid var(--border)",
          }}
          onClick={() => logout()}
        >
          Выйти
        </button>
      </div>
    </div>
  );
}
