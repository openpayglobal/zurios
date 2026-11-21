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
  const [recoveryMode, setRecoveryMode] = useState<"login" | "request" | "reset" | "admin-register">("login");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [platformInviteToken, setPlatformInviteToken] = useState("");
  const [platformInviteEmail, setPlatformInviteEmail] = useState("");
  const [platformInvitePassword, setPlatformInvitePassword] = useState("");
  const [platformInviteName, setPlatformInviteName] = useState("");
  const [acceptInviteMode, setAcceptInviteMode] = useState(false);
  const [platformInviteMessage, setPlatformInviteMessage] = useState("");

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
  async function registerInvitedPlatformAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setPlatformInviteMessage("");
    try {
      const response = await fetch(API_BASE + "/v1/auth/register-platform-admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: platformInviteToken, email: platformInviteEmail, password: platformInvitePassword, displayName: platformInviteName }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Administrator registration failed.");
      setEmail(platformInviteEmail); setPassword(""); setPlatformInviteToken(""); setPlatformInvitePassword(""); setRecoveryMode("login");
      setPlatformInviteMessage("Platform administrator account created. Sign in to continue.");
    } catch (cause) { setPlatformInviteMessage(cause instanceof Error ? cause.message : "Administrator registration failed."); }
    finally { setBusy(false); }
  }

  async function acceptExistingPlatformAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setPlatformInviteMessage("");
    try {
      const response = await fetch(API_BASE + "/v1/mac/admin-invitations/accept", { method: "POST", credentials: "include", headers: { ...csrfHeaders(), "content-type": "application/json" }, body: JSON.stringify({ token: platformInviteToken }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Invitation acceptance failed.");
      setPlatformInviteToken(""); setPlatformInviteMessage("Platform administrator access activated as " + body.role + "."); setAcceptInviteMode(false); window.location.reload();
    } catch (cause) { setPlatformInviteMessage(cause instanceof Error ? cause.message : "Invitation acceptance failed."); }
    finally { setBusy(false); }
  }
  async function logout() {
    await fetch(API_BASE + "/v1/auth/logout", { method: "POST", credentials: "include", headers: csrfHeaders() }).catch(() => undefined);
    setAuthenticated(false); window.location.reload();
  }

  return <section className="api-auth">
    {checking ? <span>Checking secure session…</span> : authenticated
      ? <><span className="api-online">Authenticated secure session established</span><button type="button" onClick={() => { setAcceptInviteMode((value) => !value); setPlatformInviteMessage(""); }}>Accept administrator invitation</button>{acceptInviteMode && <form onSubmit={acceptExistingPlatformAdmin}><input placeholder="Administrator invitation token" value={platformInviteToken} onChange={(event) => setPlatformInviteToken(event.target.value)} required/><button disabled={busy} type="submit">{busy ? "Accepting…" : "Accept invitation"}</button></form>}{platformInviteMessage && <span role="status">{platformInviteMessage}</span>}<button type="button" onClick={logout}>Sign out</button></>
      : recoveryMode === "login" ? <form onSubmit={submit}><div><strong>Platform administrator sign in</strong><small>Sign in to load protected MAC and MAD data.</small></div><input type="email" autoComplete="username" placeholder="Administrator email" value={email} onChange={(event) => setEmail(event.target.value)} required/><input type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} required/><button disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in"}</button><button type="button" onClick={() => { setRecoveryEmail(email); setRecoveryMode("request"); setRecoveryMessage(""); }}>Forgot password?</button><button type="button" onClick={() => { setRecoveryMode("admin-register"); setPlatformInviteMessage(""); }}>Register from administrator invitation</button>{error && <span className="api-error">{error}</span>}{recoveryMessage && <span role="status">{recoveryMessage}</span>}</form>
      : recoveryMode === "admin-register" ? <form onSubmit={registerInvitedPlatformAdmin}><div><strong>Register as a platform administrator</strong><small>Use the one-time invitation token sent to your email address.</small></div><input placeholder="Administrator invitation token" value={platformInviteToken} onChange={(event) => setPlatformInviteToken(event.target.value)} required/><input type="email" placeholder="Invited email address" value={platformInviteEmail} onChange={(event) => setPlatformInviteEmail(event.target.value)} required/><input placeholder="Full name" value={platformInviteName} onChange={(event) => setPlatformInviteName(event.target.value)} required/><input type="password" autoComplete="new-password" minLength={12} placeholder="Password (12+ characters)" value={platformInvitePassword} onChange={(event) => setPlatformInvitePassword(event.target.value)} required/><button disabled={busy} type="submit">{busy ? "Registering…" : "Create administrator account"}</button><button type="button" onClick={() => setRecoveryMode("login")}>Back to sign in</button>{platformInviteMessage && <span role="status">{platformInviteMessage}</span>}</form>
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
  const [adminInviteEmail, setAdminInviteEmail] = useState("");
  const [adminInviteRole, setAdminInviteRole] = useState("platform_auditor");
  const [adminInviteMessage, setAdminInviteMessage] = useState("");
  const [adminInviteBusy, setAdminInviteBusy] = useState(false);
  const [pendingAdminInvitations, setPendingAdminInvitations] = useState<Array<Record<string, unknown>>>([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [tenantMembers, setTenantMembers] = useState<Array<Record<string, unknown>>>([]);
  const [tenantInvitations, setTenantInvitations] = useState<Array<Record<string, unknown>>>([]);
  const [tenantInviteEmail, setTenantInviteEmail] = useState("");
  const [tenantInviteRole, setTenantInviteRole] = useState("viewer");
  const [tenantMessage, setTenantMessage] = useState("");
  const [tenantBusy, setTenantBusy] = useState("");
  useEffect(() => {
    let active = true;
    const path = resource === "overview" ? "/v1/mad/overview" : resource === "tenants" ? "/v1/mac/tenants" : resource === "admins" ? "/v1/mac/admins" : resource === "sessions" ? "/v1/auth/sessions" : resource === "settings" ? "/v1/mac/settings" : "/v1/mac/audit-events?limit=50";
    if (resource === "admins") fetch(API_BASE + "/v1/mac/admin-invitations", { credentials: "include" }).then((response) => response.ok ? response.json() : null).then((body) => { if (active && body) setPendingAdminInvitations(body.items ?? []); }).catch(() => undefined);
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
  useEffect(() => {
    if (resource !== "tenants" || !selectedTenantId) return;
    let active = true;
    fetch(API_BASE + "/v1/mac/tenants/" + encodeURIComponent(selectedTenantId) + "/members", { credentials: "include" })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not load tenant membership."); if (active) { setTenantMembers(body.members ?? []); setTenantInvitations(body.invitations ?? []); } })
      .catch((cause) => { if (active) setTenantMessage(cause instanceof Error ? cause.message : "Could not load tenant membership."); });
    return () => { active = false; };
  }, [resource, selectedTenantId]);

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

  async function revokePlatformAdminInvitation(invitationId: string) {
    try {
      const response = await fetch(API_BASE + "/v1/mac/admin-invitations/" + encodeURIComponent(invitationId), { method: "DELETE", credentials: "include", headers: csrfHeaders() });
      if (!response.ok) throw new Error(response.status === 404 ? "Invitation is no longer pending." : "Could not revoke invitation.");
      setPendingAdminInvitations((current) => current.filter((item) => String(item.id) !== invitationId));
      setAdminInviteMessage("Invitation revoked and audited.");
    } catch (cause) { setAdminInviteMessage(cause instanceof Error ? cause.message : "Could not revoke invitation."); }
  }
  async function invitePlatformAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setAdminInviteBusy(true); setAdminInviteMessage("");
    try {
      const response = await fetch(API_BASE + "/v1/mac/admin-invitations", { method: "POST", credentials: "include", headers: { ...csrfHeaders(), "content-type": "application/json" }, body: JSON.stringify({ email: adminInviteEmail, role: adminInviteRole }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error === "STEP_UP_REQUIRED" ? "Verify MFA above before inviting administrators." : body.error ?? "Invitation failed.");
      setAdminInviteEmail(""); setAdminInviteMessage("Invitation email sent to " + body.email + ". Expires " + new Date(body.expiresAt).toLocaleString() + ".");
      const pending = await fetch(API_BASE + "/v1/mac/admin-invitations", { credentials: "include" });
      if (pending.ok) setPendingAdminInvitations((await pending.json()).items ?? []);
    } catch (cause) { setAdminInviteMessage(cause instanceof Error ? cause.message : "Invitation failed."); }
    finally { setAdminInviteBusy(false); }
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
    <form className="api-auth" onSubmit={invitePlatformAdmin}><div><strong>Invite a platform administrator</strong><small>Requires platform-owner authorization and a recent MFA verification.</small></div><input type="email" placeholder="Administrator email" value={adminInviteEmail} onChange={(event) => setAdminInviteEmail(event.target.value)} required/><select value={adminInviteRole} onChange={(event) => setAdminInviteRole(event.target.value)}><option value="platform_admin">Platform administrator</option><option value="platform_operator">Platform operator</option><option value="platform_auditor">Platform auditor</option></select><button type="submit" disabled={adminInviteBusy}>{adminInviteBusy ? "Sending invitation…" : "Send invitation"}</button>{adminInviteMessage && <span role="status">{adminInviteMessage}</span>}</form>
    {pendingAdminInvitations.length > 0 && <div className="api-data"><h4>Pending administrator invitations</h4>{pendingAdminInvitations.map((item) => <p key={String(item.id)}>{String(item.email)} · {String(item.role)} · expires {new Date(String(item.expiresAt)).toLocaleString()} <button type="button" onClick={() => void revokePlatformAdminInvitation(String(item.id))}>Revoke</button></p>)}</div>}
    {stepUpMessage && <p role="status">{stepUpMessage}</p>}
    {items.length === 0 ? <p>No platform administrators found.</p> : <div className="api-table-wrap"><table><thead><tr><th>Administrator</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>{items.map((item, index) => { const id = String(item.id ?? ""); const protectedOwner = item.status === "protected"; return <tr key={id || index}><td>{String(item.displayName ?? item.email ?? "")}<small>{String(item.email ?? "")}</small></td><td>{String(item.role ?? "")}</td><td>{String(item.status ?? "")}</td><td>{protectedOwner ? "Protected owner" : <div className="api-admin-actions"><button type="button" disabled={adminBusy === id} onClick={() => void updatePlatformAdmin(id, { role: "platform_admin" })}>Make admin</button><button type="button" disabled={adminBusy === id} onClick={() => void updatePlatformAdmin(id, { status: item.status === "suspended" ? "active" : "suspended" })}>{item.status === "suspended" ? "Reactivate" : "Suspend"}</button></div>}</td></tr>; })}</tbody></table></div>}
    <p>New administrator invitations, existing-user acceptance, new-user registration and revocation are connected. Role and status changes require platform-owner authorization, MFA step-up and audit logging.</p></div>;
  if (resource === "tenants") return <div className="api-data"><h3>Business directory · live API</h3>{items.length === 0 ? <p>No tenant records found.</p> : <div className="api-table-wrap"><table><thead><tr><th>Business</th><th>Slug</th><th>Status</th><th>Actions</th></tr></thead><tbody>{items.map((item, index) => <tr key={String(item.id ?? index)}><td>{String(item.name ?? "")}</td><td>{String(item.slug ?? "")}</td><td>{String(item.status ?? "")}</td><td><button type="button" onClick={() => { setSelectedTenantId(String(item.id)); setTenantMessage(""); }}>Manage members</button></td></tr>)}</tbody></table></div>}
    {selectedTenantId && <section><h3>Tenant membership and invitations</h3><p>Selected tenant: {String(items.find((item) => String(item.id) === selectedTenantId)?.name ?? selectedTenantId)}</p>
      <form className="api-auth" onSubmit={verifyAdminStepUp}><div><strong>Privileged action verification</strong><small>Enter a current six-digit authenticator code before changing tenant membership.</small></div><input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="6-digit MFA code" value={stepUpCode} onChange={(event) => setStepUpCode(event.target.value)} required/><button type="submit" disabled={stepUpBusy}>{stepUpBusy ? "Verifying…" : "Verify MFA"}</button></form>
      <form className="api-auth" onSubmit={inviteTenantMember}><div><strong>Invite a business member</strong><small>Invitation expires after 72 hours and is delivered by email.</small></div><input type="email" placeholder="Member email" value={tenantInviteEmail} onChange={(event) => setTenantInviteEmail(event.target.value)} required/><select value={tenantInviteRole} onChange={(event) => setTenantInviteRole(event.target.value)}><option value="tenant_admin">Tenant administrator</option><option value="publisher">Publisher</option><option value="advertiser">Advertiser</option><option value="support_agent">Support agent</option><option value="viewer">Viewer</option></select><button type="submit" disabled={tenantBusy === "invite"}>{tenantBusy === "invite" ? "Sending…" : "Send invitation"}</button></form>
      {tenantMessage && <p role="status">{tenantMessage}</p>}
      <h4>Members</h4>{tenantMembers.length === 0 ? <p>No active or suspended members.</p> : <div className="api-table-wrap"><table><thead><tr><th>Member</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>{tenantMembers.map((member) => { const id = String(member.userId); const owner = member.role === "tenant_owner"; return <tr key={String(member.id)}><td>{String(member.displayName || member.email || id)}<small>{String(member.email || "")}</small></td><td>{String(member.role)}</td><td>{String(member.status)}</td><td>{owner ? "Protected owner" : <div className="api-admin-actions"><select value={String(member.role)} onChange={(event) => void updateTenantMember(id, { role: event.target.value })}><option value="tenant_admin">Tenant admin</option><option value="publisher">Publisher</option><option value="advertiser">Advertiser</option><option value="support_agent">Support agent</option><option value="viewer">Viewer</option></select><button type="button" disabled={tenantBusy === id} onClick={() => void updateTenantMember(id, { status: member.status === "suspended" ? "active" : "suspended" })}>{member.status === "suspended" ? "Reactivate" : "Suspend"}</button><button type="button" disabled={tenantBusy === id} onClick={() => void removeTenantMember(id)}>Remove</button></div>}</td></tr>; })}</tbody></table></div>}
      <h4>Pending invitations</h4>{tenantInvitations.length === 0 ? <p>No pending invitations.</p> : tenantInvitations.map((invite) => <p key={String(invite.id)}>{String(invite.email)} · {String(invite.role)} · expires {new Date(String(invite.expiresAt)).toLocaleString()} <button type="button" onClick={() => void revokeTenantInvitation(String(invite.id))}>Revoke</button></p>)}
    </section>}</div>;
  async function inviteTenantMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedTenantId) return;
    setTenantBusy("invite"); setTenantMessage("");
    try {
      const response = await fetch(API_BASE + "/v1/mac/tenants/" + encodeURIComponent(selectedTenantId) + "/invitations", { method: "POST", credentials: "include", headers: { ...csrfHeaders(), "content-type": "application/json" }, body: JSON.stringify({ email: tenantInviteEmail, role: tenantInviteRole }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error === "STEP_UP_REQUIRED" ? "Verify MFA above before inviting members." : body.error ?? "Invitation failed.");
      setTenantInviteEmail(""); setTenantMessage("Invitation emailed to " + body.email + ".");
      const latest = await fetch(API_BASE + "/v1/mac/tenants/" + encodeURIComponent(selectedTenantId) + "/members", { credentials: "include" }); if (latest.ok) { const result = await latest.json(); setTenantMembers(result.members ?? []); setTenantInvitations(result.invitations ?? []); }
    } catch (cause) { setTenantMessage(cause instanceof Error ? cause.message : "Invitation failed."); } finally { setTenantBusy(""); }
  }

  async function updateTenantMember(userId: string, changes: { role?: string; status?: string }) {
    if (!selectedTenantId) return; setTenantBusy(userId); setTenantMessage("");
    try {
      const response = await fetch(API_BASE + "/v1/mac/tenants/" + encodeURIComponent(selectedTenantId) + "/members/" + encodeURIComponent(userId), { method: "PATCH", credentials: "include", headers: { ...csrfHeaders(), "content-type": "application/json" }, body: JSON.stringify(changes) });
      const body = response.status === 204 ? {} : await response.json(); if (!response.ok) throw new Error(body.error === "STEP_UP_REQUIRED" ? "Verify MFA above before changing membership." : body.error ?? "Membership update failed.");
      setTenantMembers((current) => current.map((member) => String(member.userId) === userId ? { ...member, ...changes } : member)); setTenantMessage("Membership updated and audited.");
    } catch (cause) { setTenantMessage(cause instanceof Error ? cause.message : "Membership update failed."); } finally { setTenantBusy(""); }
  }

  async function removeTenantMember(userId: string) {
    if (!selectedTenantId) return; setTenantBusy(userId); setTenantMessage("");
    try {
      const response = await fetch(API_BASE + "/v1/mac/tenants/" + encodeURIComponent(selectedTenantId) + "/members/" + encodeURIComponent(userId), { method: "DELETE", credentials: "include", headers: csrfHeaders() });
      if (!response.ok) throw new Error(response.status === 404 ? "Membership not found or protected." : "Membership removal failed.");
      setTenantMembers((current) => current.filter((member) => String(member.userId) !== userId)); setTenantMessage("Membership removed and audited.");
    } catch (cause) { setTenantMessage(cause instanceof Error ? cause.message : "Membership removal failed."); } finally { setTenantBusy(""); }
  }

  async function revokeTenantInvitation(invitationId: string) {
    if (!selectedTenantId) return; setTenantBusy(invitationId); setTenantMessage("");
    try {
      const response = await fetch(API_BASE + "/v1/mac/tenants/" + encodeURIComponent(selectedTenantId) + "/invitations/" + encodeURIComponent(invitationId), { method: "DELETE", credentials: "include", headers: csrfHeaders() });
      if (!response.ok) throw new Error("Invitation revocation failed.");
      setTenantInvitations((current) => current.filter((invite) => String(invite.id) !== invitationId)); setTenantMessage("Invitation revoked and audited.");
    } catch (cause) { setTenantMessage(cause instanceof Error ? cause.message : "Invitation revocation failed."); } finally { setTenantBusy(""); }
  }
  async function revokeSession(sessionId: string) {
    try {
      const response = await fetch(API_BASE + "/v1/auth/sessions/" + encodeURIComponent(sessionId), { method: "DELETE", credentials: "include", headers: csrfHeaders() });
      if (!response.ok) throw new Error(response.status === 404 ? "Session is already revoked or expired." : "Could not revoke session.");
      setData((current) => current ? { ...current, items: (current.items ?? []).filter((item) => String(item.id) !== sessionId) } : current);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not revoke session."); }
  }
  async function prepareAuditArchive() {
    const fromRaw = window.prompt("First audit sequence to include:");
    if (fromRaw === null) return;
    const toRaw = window.prompt("Last audit sequence to include:");
    if (toRaw === null) return;
    const fromSequence = Number(fromRaw), toSequence = Number(toRaw);
    if (!Number.isSafeInteger(fromSequence) || !Number.isSafeInteger(toSequence) || fromSequence < 1 || toSequence < fromSequence || toSequence - fromSequence + 1 > 1000) {
      setAuditResult("Enter a valid contiguous sequence range of at most 1,000 events.");
      return;
    }
    setAuditAction("archive"); setAuditResult("");
    try {
      const response = await fetch(API_BASE + "/v1/mac/audit-events/archive?fromSequence=" + fromSequence + "&toSequence=" + toSequence, { credentials: "include" });
      if (!response.ok) { const body = await response.json(); throw new Error(body.error ?? "Archive package preparation failed."); }
      const blob = await response.blob(), objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = objectUrl; link.download = "mebumip-audit-" + fromSequence + "-" + toSequence + ".json"; link.click(); URL.revokeObjectURL(objectUrl);
      const digest = response.headers.get("X-Audit-Archive-SHA256") ?? "unavailable";
      const objectKey = response.headers.get("X-Audit-Archive-Object-Key") ?? "unavailable";
      setAuditResult("Prepared signed archive package for sequences " + fromSequence + "–" + toSequence + " (SHA-256 " + digest + "; object key " + objectKey + "). It has not yet been written to independent immutable storage.");
    } catch (cause) { setAuditResult(cause instanceof Error ? cause.message : "Archive package preparation failed."); }
    finally { setAuditAction(""); }
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
  return <div className="api-data"><h3>Audit events · latest {items.length}</h3><div className="api-audit-actions"><button type="button" disabled={auditAction !== ""} onClick={() => void runAuditAction("verify")}>{auditAction === "verify" ? "Verifying…" : "Verify latest 500"}</button><button type="button" disabled={auditAction !== ""} onClick={() => void runAuditAction("export")}>{auditAction === "export" ? "Preparing…" : "Prepare export"}</button><button type="button" disabled={auditAction !== ""} onClick={() => void prepareAuditArchive()}>{auditAction === "archive" ? "Preparing…" : "Prepare archive batch"}</button></div>{auditResult && <p role="status">{auditResult}</p>}{data.retention && <p>{data.retention}</p>}{items.length === 0 ? <p>No audit events found.</p> : <div className="api-table-wrap"><table><thead><tr><th>Action</th><th>Actor</th><th>Outcome</th><th>Time</th></tr></thead><tbody>{items.map((item, index) => <tr key={String(item._id ?? index)}><td>{String(item.action ?? "")}</td><td>{String(item.actorUserId ?? "")}</td><td>{String(item.outcome ?? "")}</td><td>{item.occurredAt ? new Date(String(item.occurredAt)).toLocaleString() : ""}</td></tr>)}</tbody></table></div>}</div>;
}

type TenantMembership = { tenantId: string; role: string; status: string };
type MetaConnection = { connectionId: string; providerUserId: string; providerUserName?: string; grantedScopes: string[]; status: string };
type MetaPageAsset = { providerAssetId: string; name: string; tasks: string[]; instagramBusinessAccount?: { id: string; username?: string }; status: string };

export function MetaConnectionsPanel() {
  const callbackParams = new URLSearchParams(window.location.search);
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [tenantId, setTenantId] = useState(callbackParams.get("tenantId") ?? "");
  const [connections, setConnections] = useState<MetaConnection[]>([]);
  const [connectionId, setConnectionId] = useState(callbackParams.get("connectionId") ?? "");
  const [assets, setAssets] = useState<MetaPageAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState(() => {
    const status = callbackParams.get("meta_connection");
    return status === "connected" ? "Meta account connected. Review its Pages and run discovery." : status === "denied" ? "Meta authorization was declined." : status === "failed" ? "Meta connection could not be completed. Review configuration and try again." : "";
  });
  const [stepUpCode, setStepUpCode] = useState("");
  const [stepUpMessage, setStepUpMessage] = useState("");
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let active = true;
    fetch(API_BASE + "/v1/auth/me", { credentials: "include" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(response.status === 401 ? "Sign in above with an active tenant-member account." : "Could not read the current identity.");
        const items = (body.tenantMemberships ?? []) as TenantMembership[];
        if (active) {
          setMemberships(items);
          setTenantId((current) => items.some((item) => item.tenantId === current) ? current : items[0]?.tenantId ?? "");
        }
      })
      .catch((cause) => { if (active) setMessage(cause instanceof Error ? cause.message : "Could not load tenant memberships."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!tenantId) { setConnections([]); setConnectionId(""); return; }
    let active = true;
    fetch(API_BASE + "/v1/tenants/" + encodeURIComponent(tenantId) + "/meta/connections", { credentials: "include" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error === "UNAUTHORIZED" ? "Sign in to continue." : body.error === "TENANT_ACCESS_DENIED" ? "Your tenant role cannot view Meta connections." : body.error ?? "Could not load Meta connections.");
        const items = (body.items ?? []) as MetaConnection[];
        if (active) {
          setConnections(items);
          setConnectionId((current) => items.some((item) => item.connectionId === current) ? current : items[0]?.connectionId ?? "");
          setMessage((current) => current || "Meta connection records loaded. No provider token is exposed to this browser.");
        }
      })
      .catch((cause) => { if (active) setMessage(cause instanceof Error ? cause.message : "Could not load Meta connections."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tenantId, refreshCount]);

  useEffect(() => {
    if (!tenantId || !connectionId) { setAssets([]); return; }
    let active = true;
    fetch(API_BASE + "/v1/tenants/" + encodeURIComponent(tenantId) + "/meta/connections/" + encodeURIComponent(connectionId) + "/assets", { credentials: "include" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Could not load Page assets.");
        if (active) setAssets((body.items ?? []) as MetaPageAsset[]);
      })
      .catch((cause) => { if (active) setMessage(cause instanceof Error ? cause.message : "Could not load Page assets."); });
    return () => { active = false; };
  }, [tenantId, connectionId, refreshCount]);

  async function verifyStepUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("step-up"); setStepUpMessage("");
    try {
      const response = await fetch(API_BASE + "/v1/auth/step-up", { method: "POST", credentials: "include", headers: { ...csrfHeaders(), "content-type": "application/json" }, body: JSON.stringify({ code: stepUpCode }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "MFA verification failed.");
      setStepUpCode(""); setStepUpMessage("MFA verified. Sensitive Meta actions are enabled for five minutes.");
    } catch (cause) { setStepUpMessage(cause instanceof Error ? cause.message : "MFA verification failed."); }
    finally { setBusy(""); }
  }

  async function startMetaConnection() {
    if (!tenantId) return;
    setBusy("connect"); setMessage("");
    try {
      const response = await fetch(API_BASE + "/v1/tenants/" + encodeURIComponent(tenantId) + "/meta/oauth/start", { method: "POST", credentials: "include", headers: { ...csrfHeaders(), "content-type": "application/json" }, body: JSON.stringify({}) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error === "STEP_UP_REQUIRED" ? "Verify MFA before connecting a Meta account." : body.error ?? "Could not start Meta authorization.");
      window.location.assign(body.authorizationUrl);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not start Meta authorization."); setBusy(""); }
  }

  async function discoverPages() {
    if (!tenantId || !connectionId) return;
    setBusy("discover"); setMessage("");
    try {
      const response = await fetch(API_BASE + "/v1/tenants/" + encodeURIComponent(tenantId) + "/meta/connections/" + encodeURIComponent(connectionId) + "/assets/discover", { method: "POST", credentials: "include", headers: { ...csrfHeaders(), "content-type": "application/json" }, body: JSON.stringify({}) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error === "STEP_UP_REQUIRED" ? "Verify MFA before discovering Pages." : body.error ?? "Page discovery failed.");
      setAssets((body.items ?? []) as MetaPageAsset[]);
      setMessage("Discovery complete: " + body.discovered + " Pages, " + body.instagramLinked + " linked Instagram accounts, " + body.unavailable + " Pages marked unavailable.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Page discovery failed."); }
    finally { setBusy(""); }
  }

  async function disconnectMetaConnection() {
    if (!tenantId || !connectionId || !window.confirm("Disconnect this Meta account and erase locally stored user and Page tokens?")) return;
    setBusy("disconnect"); setMessage("");
    try {
      const response = await fetch(API_BASE + "/v1/tenants/" + encodeURIComponent(tenantId) + "/meta/connections/" + encodeURIComponent(connectionId), { method: "DELETE", credentials: "include", headers: csrfHeaders() });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error === "STEP_UP_REQUIRED" ? "Verify MFA before disconnecting." : body.error ?? "Disconnect failed.");
      setMessage("Local tokens erased. Meta remote permission revocation: " + body.remoteRevocation + ".");
      setConnectionId(""); setAssets([]); setRefreshCount((value) => value + 1);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Disconnect failed."); }
    finally { setBusy(""); }
  }

  if (loading) return <div className="api-data"><p>Loading tenant Meta integration…</p></div>;
  if (memberships.length === 0) return <div className="api-data"><h3>Meta connections</h3><p>This API requires an active tenant membership. A platform administrator role by itself does not grant tenant access. Sign in with a tenant owner, tenant administrator or appropriately delegated member account.</p>{message && <p role="status">{message}</p>}</div>;

  return <div className="api-data meta-connections">
    <h3>Meta connections · tenant workspace</h3>
    <p>OAuth and Page discovery are connected to the API. Provider tokens stay encrypted server-side and are never sent to this browser.</p>
    <div className="api-auth"><form onSubmit={(event) => { event.preventDefault(); setRefreshCount((value) => value + 1); }}><div><strong>Active tenant</strong><small>Select a workspace where your membership grants Meta permissions.</small></div><select value={tenantId} onChange={(event) => { setTenantId(event.target.value); setConnectionId(""); setAssets([]); }}><option value="">Select tenant</option>{memberships.map((item) => <option key={item.tenantId} value={item.tenantId}>{item.tenantId} · {item.role}</option>)}</select><button type="submit">Refresh</button></form></div>
    <form className="api-auth" onSubmit={verifyStepUp}><div><strong>MFA step-up</strong><small>Required for Meta connect, Page discovery and disconnect. Verification lasts five minutes.</small></div><input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="6-digit authenticator code" value={stepUpCode} onChange={(event) => setStepUpCode(event.target.value)} required/><button type="submit" disabled={busy === "step-up"}>{busy === "step-up" ? "Verifying…" : "Verify MFA"}</button></form>
    {stepUpMessage && <p role="status">{stepUpMessage}</p>}
    <div className="api-admin-actions"><button type="button" disabled={!tenantId || busy !== ""} onClick={() => void startMetaConnection()}>{busy === "connect" ? "Opening Meta…" : "Connect Meta account"}</button><button type="button" disabled={!tenantId || !connectionId || busy !== ""} onClick={() => void discoverPages()}>{busy === "discover" ? "Discovering Pages…" : "Discover Pages"}</button><button type="button" disabled={!tenantId || !connectionId || busy !== ""} onClick={() => void disconnectMetaConnection()}>{busy === "disconnect" ? "Disconnecting…" : "Disconnect account"}</button><button type="button" disabled={busy !== ""} onClick={() => setRefreshCount((value) => value + 1)}>Refresh data</button></div>
    {message && <p role="status">{message}</p>}
    <h4>Connected Meta accounts</h4>
    {connections.length === 0 ? <p>No Meta account is connected to this tenant. Connect a test account after configuring the owner-managed Meta app and callback URI.</p> : <div className="api-table-wrap"><table><thead><tr><th>Account</th><th>Meta user ID</th><th>Granted permissions</th><th>Status</th></tr></thead><tbody>{connections.map((item) => <tr key={item.connectionId}><td><button type="button" onClick={() => setConnectionId(item.connectionId)}>{item.providerUserName ?? item.connectionId}</button></td><td>{item.providerUserId}</td><td>{item.grantedScopes.join(", ")}</td><td>{item.status}</td></tr>)}</tbody></table></div>}
    {connections.length > 0 && <div className="api-auth"><form onSubmit={(event) => { event.preventDefault(); setRefreshCount((value) => value + 1); }}><div><strong>Selected connection</strong><small>Choose which Meta account to discover Pages for.</small></div><select value={connectionId} onChange={(event) => setConnectionId(event.target.value)}>{connections.map((item) => <option key={item.connectionId} value={item.connectionId}>{item.providerUserName ?? item.providerUserId} · {item.connectionId}</option>)}</select><button type="submit">Load assets</button></form></div>}
    <h4>Facebook Pages and linked Instagram Business accounts</h4>
    {assets.length === 0 ? <p>No Page assets discovered for this connection yet. Run Discover Pages after MFA verification.</p> : <div className="api-table-wrap"><table><thead><tr><th>Facebook Page</th><th>Page ID</th><th>Tasks</th><th>Instagram Business account</th><th>Status</th></tr></thead><tbody>{assets.map((item) => <tr key={item.providerAssetId}><td>{item.name}</td><td>{item.providerAssetId}</td><td>{item.tasks.join(", ")}</td><td>{item.instagramBusinessAccount ? (item.instagramBusinessAccount.username ?? item.instagramBusinessAccount.id) : "Not linked"}</td><td>{item.status}</td></tr>)}</tbody></table></div>}
    <p>Publishing, media, comments, inbox, insights, Instagram eligibility checks and webhook operations are not yet enabled. Disconnect attempts Meta permission revocation and always erases local encrypted tokens.</p>
  </div>;
}
