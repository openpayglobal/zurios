import { useEffect, useState, type FormEvent } from "react";

const API_BASE = import.meta.env.VITE_MEBUMIP_API_BASE ?? "http://localhost:4100";
type Resource = "overview" | "tenants" | "admins" | "audit";
type ApiData = {
  platform?: { tenants: number; activeTenants: number; activeUsers: number; activeSessions: number };
  integrations?: { connectedMetaAccounts: number; pendingWebhookEvents: number };
  items?: Array<Record<string, unknown>>;
  hasMore?: boolean;
  retention?: string;
};

export function AuthPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState(() => sessionStorage.getItem("mebumip_access_token") ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(API_BASE + "/v1/auth/login", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error === "UNAUTHORIZED" ? "Email or password is incorrect." : "Sign-in failed.");
      sessionStorage.setItem("mebumip_access_token", data.accessToken);
      setToken(data.accessToken); setPassword(""); window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.");
    } finally { setBusy(false); }
  }

  async function logout() {
    if (token) await fetch(API_BASE + "/v1/auth/logout", { method: "POST", headers: { Authorization: "Bearer " + token } }).catch(() => undefined);
    sessionStorage.removeItem("mebumip_access_token"); setToken(""); window.location.reload();
  }

  return <section className="api-auth">
    {token
      ? <><span className="api-online">Authenticated session established</span><button type="button" onClick={logout}>Sign out</button></>
      : <form onSubmit={submit}><div><strong>Platform administrator sign in</strong><small>Sign in to load protected MAC and MAD data.</small></div><input type="email" autoComplete="username" placeholder="Administrator email" value={email} onChange={(event) => setEmail(event.target.value)} required/><input type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} required/><button disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in"}</button>{error && <span className="api-error">{error}</span>}</form>}
  </section>;
}

export function AdminData({ resource }: { resource: Resource }) {
  const [data, setData] = useState<ApiData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [auditAction, setAuditAction] = useState("");
  const [auditResult, setAuditResult] = useState("");
  useEffect(() => {
    const token = sessionStorage.getItem("mebumip_access_token");
    if (!token) { setLoading(false); setError("Sign in above to view protected platform data."); return; }
    let active = true;
    const path = resource === "overview" ? "/v1/mad/overview" : resource === "tenants" ? "/v1/mac/tenants" : resource === "admins" ? "/v1/mac/admins" : "/v1/mac/audit-events?limit=50";
    fetch(API_BASE + path, { headers: { Authorization: "Bearer " + token } })
      .then(async (response) => {
        const body = await response.json();
        if (response.status === 401) { sessionStorage.removeItem("mebumip_access_token"); window.location.reload(); throw new Error("Session expired. Sign in again."); }
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
  if (resource === "admins") return <div className="api-data"><h3>Platform administrators · live API</h3>{items.length === 0 ? <p>No platform administrators found.</p> : <div className="api-table-wrap"><table><thead><tr><th>Administrator</th><th>Role</th><th>Status</th></tr></thead><tbody>{items.map((item, index) => <tr key={String(item.id ?? index)}><td>{String(item.displayName ?? item.email ?? "")}<small>{String(item.email ?? "")}</small></td><td>{String(item.role ?? "")}</td><td>{String(item.status ?? "")}</td></tr>)}</tbody></table></div>}<p>Role and suspension changes are available through the audited, MFA-gated MAC API.</p></div>;
  if (resource === "tenants") return <div className="api-data"><h3>Business directory · live API</h3>{items.length === 0 ? <p>No tenant records found.</p> : <div className="api-table-wrap"><table><thead><tr><th>Business</th><th>Slug</th><th>Status</th></tr></thead><tbody>{items.map((item, index) => <tr key={String(item.id ?? index)}><td>{String(item.name ?? "")}</td><td>{String(item.slug ?? "")}</td><td>{String(item.status ?? "")}</td></tr>)}</tbody></table></div>}</div>;
  async function runAuditAction(action: "verify" | "export") {
    const token = sessionStorage.getItem("mebumip_access_token");
    if (!token) { setAuditResult("Sign in to perform audit operations."); return; }
    setAuditAction(action); setAuditResult("");
    try {
      const response = await fetch(API_BASE + (action === "verify" ? "/v1/mac/audit-events/verify" : "/v1/mac/audit-events/export?limit=200"), { headers: { Authorization: "Bearer " + token } });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Audit operation failed.");
      setAuditResult(action === "verify"
        ? "Checked " + body.checked + " records: " + body.verified + " verified, " + body.unsigned + " unsigned, " + body.invalid + " invalid."
        : "Prepared " + body.count + " records for export. Signed: " + body.integrity.signed + ". Unsigned or invalid: " + body.integrity.unsignedOrInvalid + ". " + body.archiveStatus + ".");
    } catch (cause) {
      setAuditResult(cause instanceof Error ? cause.message : "Audit operation failed.");
    } finally { setAuditAction(""); }
  }

  return <div className="api-data"><h3>Audit events · latest {items.length}</h3><div className="api-audit-actions"><button type="button" disabled={auditAction !== ""} onClick={() => void runAuditAction("verify")}>{auditAction === "verify" ? "Verifying…" : "Verify latest 500"}</button><button type="button" disabled={auditAction !== ""} onClick={() => void runAuditAction("export")}>{auditAction === "export" ? "Preparing…" : "Prepare export"}</button></div>{auditResult && <p role="status">{auditResult}</p>}{data.retention && <p>{data.retention}</p>}{items.length === 0 ? <p>No audit events found.</p> : <div className="api-table-wrap"><table><thead><tr><th>Action</th><th>Actor</th><th>Outcome</th><th>Time</th></tr></thead><tbody>{items.map((item, index) => <tr key={String(item._id ?? index)}><td>{String(item.action ?? "")}</td><td>{String(item.actorUserId ?? "")}</td><td>{String(item.outcome ?? "")}</td><td>{item.occurredAt ? new Date(String(item.occurredAt)).toLocaleString() : ""}</td></tr>)}</tbody></table></div>}</div>;
}
