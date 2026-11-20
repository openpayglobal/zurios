import { useEffect, useState, type FormEvent } from "react";

const API_BASE = import.meta.env.VITE_MEBUMIP_API_BASE ?? "http://localhost:4100";
function csrfHeaders(): Record<string, string> { const value = document.cookie.split("; ").find((part) => part.startsWith("mebumip_csrf="))?.split("=").slice(1).join("="); return value ? { "x-csrf-token": decodeURIComponent(value) } : {}; }
type Resource = "overview" | "tenants" | "admins" | "audit" | "sessions" | "settings";
type ApiData = {
  platform?: { tenants: number; activeTenants: number; activeUsers: number; activeSessions: number };
  integrations?: { connectedMetaAccounts: number; pendingWebhookEvents: number };
  settings?: Record<string, unknown>;
  items?: Array<Record<string, unknown>>;
  hasMore?: boolean;
  retention?: string;
};

export function AuthPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  useEffect(() => { fetch(API_BASE + "/v1/auth/me", { credentials: "include" }).then((response) => setAuthenticated(response.ok)).catch(() => setAuthenticated(false)).finally(() => setChecking(false)); }, []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState<"login" | "request" | "reset">("login");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(API_BASE + "/v1/auth/login", {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error === "UNAUTHORIZED" ? "Email or password is incorrect." : "Sign-in failed.");
      setAuthenticated(true); setPassword(""); window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.");
    } finally { setBusy(false); }
  }

  async function requestPasswordRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setRecoveryMessage("");
    try {
      const response = await fetch(API_BASE + "/v1/auth/password/recovery", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: recoveryEmail }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not request recovery.");
      setRecoveryMessage(body.message ?? "If the account exists, recovery instructions will be sent.");
    } catch (cause) { setRecoveryMessage(cause instanceof Error ? cause.message : "Could not request recovery."); }
    finally { setBusy(false); }
  }

  async function resetAccountPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setRecoveryMessage("");
    try {
      const response = await fetch(API_BASE + "/v1/auth/password/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: resetToken, newPassword }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Password reset failed.");
      setRecoveryMode("login"); setPassword(""); setNewPassword(""); setResetToken(""); setRecoveryMessage("Password reset successful. Sign in with your new password.");
    } catch (cause) { setRecoveryMessage(cause instanceof Error ? cause.message : "Password reset failed."); }
    finally { setBusy(false); }
  }
  async function logout() {
    await fetch(API_BASE + "/v1/auth/logout", { method: "POST", credentials: "include", headers: csrfHeaders() }).catch(() => undefined);
    setAuthenticated(false); window.location.reload();
  }

  return <section className="api-auth">
    {checking ? <span>Checking secure session…</span> : authenticated
      ? <><span className="api-online">Authenticated secure session established</span><button type="button" onClick={logout}>Sign out</button></>
      : recoveryMode === "login" ? <form onSubmit={submit}><div><strong>Platform administrator sign in</strong><small>Sign in to load protected MAC and MAD data.</small></div><input type="email" autoComplete="username" placeholder="Administrator email" value={email} onChange={(event) => setEmail(event.target.value)} required/><input type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} required/><button disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in"}</button><button type="button" onClick={() => { setRecoveryEmail(email); setRecoveryMode("request"); setRecoveryMessage(""); }}>Forgot password?</button>{error && <span className="api-error">{error}</span>}{recoveryMessage && <span role="status">{recoveryMessage}</span>}</form>
      : recoveryMode === "request" ? <form onSubmit={requestPasswordRecovery}><div><strong>Recover your password</strong><small>We will send a one-time reset token if this account exists.</small></div><input type="email" placeholder="Account email" value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} required/><button disabled={busy} type="submit">{busy ? "Sending…" : "Send recovery email"}</button><button type="button" onClick={() => setRecoveryMode("reset")}>I already have a reset token</button><button type="button" onClick={() => setRecoveryMode("login")}>Back to sign in</button>{recoveryMessage && <span role="status">{recoveryMessage}</span>}</form>
      : <form onSubmit={resetAccountPassword}><div><strong>Set a new password</strong><small>Paste the one-time token from your recovery email.</small></div><input placeholder="Password reset token" value={resetToken} onChange={(event) => setResetToken(event.target.value)} required/><input type="password" autoComplete="new-password" minLength={12} placeholder="New password (12+ characters)" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required/><button disabled={busy} type="submit">{busy ? "Resetting…" : "Reset password"}</button><button type="button" onClick={() => setRecoveryMode("login")}>Back to sign in</button>{recoveryMessage && <span role="status">{recoveryMessage}</span>}</form>}
  </section>;
}

export function AdminData({ resource }: { resource: Resource }) {
  const [data, setData] = useState<ApiData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [auditAction, setAuditAction] = useState("");
  const [auditResult, setAuditResult] = useState("");
  const [stepUpCode, setStepUpCode] = useState("");
  const [stepUpMessage, setStepUpMessage] = useState("");
  const [stepUpBusy, setStepUpBusy] = useState(false);
  const [adminBusy, setAdminBusy] = useState("");
  useEffect(() => {
    let active = true;
    const path = resource === "overview" ? "/v1/mad/overview" : resource === "tenants" ? "/v1/mac/tenants" : resource === "admins" ? "/v1/mac/admins" : resource === "sessions" ? "/v1/auth/sessions" : resource === "settings" ? "/v1/mac/settings" : "/v1/mac/audit-events?limit=50";
    fetch(API_BASE + path, { credentials: "include" })
      .then(async (response) => {
        const body = await response.json();
        if (response.status === 401) throw new Error("Sign in above to view protected platform data.");
        if (!response.ok) throw new Error(response.status === 403 ? "Your platform role does not have permission to view this data." : "API request failed.");
        if (active) { setData(body as ApiData); setError(""); }
      }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load data."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [resource]);

  if (loading) return <div className="api-data"><p>Loading live platform data…</p></div>;
  if (error) return <div className="api-data"><p>{error}</p></div>;
  if (!data) return null;
  if (resource === "overview" && data.platform && data.integrations) return <div className="api-data"><h3>Live platform aggregates</h3><div className="api-stats"><span><b>{data.platform.tenants}</b>Tenants</span><span><b>{data.platform.activeUsers}</b>Active users</span><span><b>{data.platform.activeSessions}</b>Active sessions</span><span><b>{data.integrations.connectedMetaAccounts}</b>Meta connections</span><span><b>{data.integrations.pendingWebhookEvents}</b>Pending webhooks</span></div></div>;
  const items = data.items ?? [];
  async function verifyAdminStepUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStepUpBusy(true); setStepUpMessage("");
    try {
      const response = await fetch(API_BASE + "/v1/auth/step-up", { method: "POST", credentials: "include", headers: { ...csrfHeaders(), "content-type": "application/json" }, body: JSON.stringify({ code: stepUpCode }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "MFA verification failed.");
      setStepUpCode(""); setStepUpMessage("MFA verified. Privileged MAC actions are enabled for five minutes.");
    } catch (cause) { setStepUpMessage(cause instanceof Error ? cause.message : "MFA verification failed."); }
    finally { setStepUpBusy(false); }
  }

  async function updatePlatformAdmin(userId: string, changes: { role?: string; status?: string }) {
    setAdminBusy(userId); setStepUpMessage("");
    try {
      const response = await fetch(API_BASE + "/v1/mac/admins/" + encodeURIComponent(userId), { method: "PATCH", credentials: "include", headers: { ...csrfHeaders(), "content-type": "application/json" }, body: JSON.stringify(changes) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error === "STEP_UP_REQUIRED" ? "Verify MFA above before changing administrators." : body.error ?? "Administrator update failed.");
      setData((current) => current ? { ...current, items: (current.items ?? []).map((item) => String(item.id) === userId ? { ...item, role: body.role, status: body.status } : item) } : current);
      setStepUpMessage("Administrator record updated and audited.");
    } catch (cause) { setStepUpMessage(cause instanceof Error ? cause.message : "Administrator update failed."); }
    finally { setAdminBusy(""); }
  }
  if (resource === "admins") return <div className="api-data"><h3>Platform administrators · live API</h3>
    <form className="api-auth" onSubmit={verifyAdminStepUp}><div><strong>Privileged action verification</strong><small>Enter the current six-digit authenticator code. Verification lasts five minutes.</small></div><input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="6-digit MFA code" value={stepUpCode} onChange={(event) => setStepUpCode(event.target.value)} required/><button type="submit" disabled={stepUpBusy}>{stepUpBusy ? "Verifying…" : "Verify MFA"}</button></form>
    {stepUpMessage && <p role="status">{stepUpMessage}</p>}
    {items.length === 0 ? <p>No platform administrators found.</p> : <div className="api-table-wrap"><table><thead><tr><th>Administrator</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>{items.map((item, index) => { const id = String(item.id ?? ""); const protectedOwner = item.status === "protected"; return <tr key={id || index}><td>{String(item.displayName ?? item.email ?? "")}<small>{String(item.email ?? "")}</small></td><td>{String(item.role ?? "")}</td><td>{String(item.status ?? "")}</td><td>{protectedOwner ? "Protected owner" : <div className="api-admin-actions"><button type="button" disabled={adminBusy === id} onClick={() => void updatePlatformAdmin(id, { role: "platform_admin" })}>Make admin</button><button type="button" disabled={adminBusy === id} onClick={() => void updatePlatformAdmin(id, { status: item.status === "suspended" ? "active" : "suspended" })}>{item.status === "suspended" ? "Reactivate" : "Suspend"}</button></div>}</td></tr>; })}</tbody></table></div>}
    <p>New administrator invitations and account creation remain pending. Every role or status change requires platform-owner authorization, MFA step-up and audit logging.</p></div>;
  if (resource === "tenants") return <div className="api-data"><h3>Business directory · live API</h3>{items.length === 0 ? <p>No tenant records found.</p> : <div className="api-table-wrap"><table><thead><tr><th>Business</th><th>Slug</th><th>Status</th></tr></thead><tbody>{items.map((item, index) => <tr key={String(item.id ?? index)}><td>{String(item.name ?? "")}</td><td>{String(item.slug ?? "")}</td><td>{String(item.status ?? "")}</td></tr>)}</tbody></table></div>}</div>;
  async function revokeSession(sessionId: string) {
    try {
      const response = await fetch(API_BASE + "/v1/auth/sessions/" + encodeURIComponent(sessionId), { method: "DELETE", credentials: "include", headers: csrfHeaders() });
      if (!response.ok) throw new Error(response.status === 404 ? "Session is already revoked or expired." : "Could not revoke session.");
      setData((current) => current ? { ...current, items: (current.items ?? []).filter((item) => String(item.id) !== sessionId) } : current);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not revoke session."); }
  }
  async function runAuditAction(action: "verify" | "export") {
    setAuditAction(action); setAuditResult("");
    try {
      const response = await fetch(API_BASE + (action === "verify" ? "/v1/mac/audit-events/verify" : "/v1/mac/audit-events/export?limit=200"), { credentials: "include" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Audit operation failed.");
      if (action === "export") {
        const blob = new Blob([JSON.stringify(body, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url; link.download = "zuri-mebumip-audit-export.json"; link.click();
        URL.revokeObjectURL(url);
      }
      setAuditResult(action === "verify"
        ? "Checked " + body.checked + " records: " + body.verified + " verified, " + body.unsigned + " unsigned, " + body.invalid + " invalid; sequence gaps: " + body.sequenceGaps + "."
        : "Downloaded " + body.manifest.count + " records. Manifest signature: " + (body.manifest.integrity.signature ? "present" : "missing") + ". " + body.archiveStatus + ".");
    } catch (cause) {
      setAuditResult(cause instanceof Error ? cause.message : "Audit operation failed.");
    } finally { setAuditAction(""); }
  }

  if (resource === "settings" && data.settings) return <div className="api-data"><h3>Runtime configuration · read only</h3><p>Safe configuration status only. Secret values are never returned to the browser.</p><div className="api-stats">{Object.entries(data.settings).map(([key, value]) => <span key={key}><b>{typeof value === "boolean" ? (value ? "Configured / enabled" : "Not configured / disabled") : Array.isArray(value) ? value.join(", ") : String(value)}</b>{key.replaceAll(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase())}</span>)}</div><p>Change secrets and deployment-level settings through the approved secret manager and deployment configuration, not through the browser.</p></div>;
  if (resource === "sessions") return <div className="api-data"><h3>Your active sessions</h3><p>Review active sign-in sessions for this account. Device labels are based on the reported browser user-agent; IP addresses are never displayed.</p>
    {items.length === 0 ? <p>No active sessions found.</p> : <div className="api-table-wrap"><table><thead><tr><th>Device / browser</th><th>Created</th><th>Expires</th><th>Action</th></tr></thead><tbody>{items.map((item, index) => { const id = String(item.id ?? ""); return <tr key={id || index}><td>{String(item.userAgent ?? "Unknown device")}{item.current ? <small>Current session</small> : null}</td><td>{item.createdAt ? new Date(String(item.createdAt)).toLocaleString() : ""}</td><td>{item.expiresAt ? new Date(String(item.expiresAt)).toLocaleString() : ""}</td><td>{item.current ? "Current" : <button type="button" onClick={() => void revokeSession(id)}>Revoke</button>}</td></tr>; })}</tbody></table></div>}</div>;
  return <div className="api-data"><h3>Audit events · latest {items.length}</h3><div className="api-audit-actions"><button type="button" disabled={auditAction !== ""} onClick={() => void runAuditAction("verify")}>{auditAction === "verify" ? "Verifying…" : "Verify latest 500"}</button><button type="button" disabled={auditAction !== ""} onClick={() => void runAuditAction("export")}>{auditAction === "export" ? "Preparing…" : "Prepare export"}</button></div>{auditResult && <p role="status">{auditResult}</p>}{data.retention && <p>{data.retention}</p>}{items.length === 0 ? <p>No audit events found.</p> : <div className="api-table-wrap"><table><thead><tr><th>Action</th><th>Actor</th><th>Outcome</th><th>Time</th></tr></thead><tbody>{items.map((item, index) => <tr key={String(item._id ?? index)}><td>{String(item.action ?? "")}</td><td>{String(item.actorUserId ?? "")}</td><td>{String(item.outcome ?? "")}</td><td>{item.occurredAt ? new Date(String(item.occurredAt)).toLocaleString() : ""}</td></tr>)}</tbody></table></div>}</div>;
}
