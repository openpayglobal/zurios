import { useEffect, useState, type FormEvent } from "react";
import { getMeBuMIPApiBase } from "./runtime-api";

type Membership = { tenantId: string; role: string; status: string };
type Onboarding = {
  tenantId: string;
  businessProfile: null | { legalName?: string; displayName?: string; industry?: string; countryCode?: string; timezone?: string; website?: string; contactEmail?: string };
  steps: Array<{ id: string; label: string; status: string; phase?: number; objective?: string }>;
  providerReadiness: { metaOAuth: string; message: string };
  memberCount: number;
};
function csrf(): Record<string, string> {
  const value = document.cookie.split("; ").find((part) => part.startsWith("mebumip_csrf="))?.split("=").slice(1).join("=");
  return value ? { "x-csrf-token": decodeURIComponent(value) } : {};
}
export function CustomerWorkspace() {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [data, setData] = useState<Onboarding | null>(null);
  const [members, setMembers] = useState<Array<{ id: string; userId: string; role: string; status: string }>>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [stepUpCode, setStepUpCode] = useState("");
  const [teamMessage, setTeamMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [profile, setProfile] = useState({ legalName: "", displayName: "", industry: "", countryCode: "UG", timezone: "Africa/Kampala", website: "", contactEmail: "" });

  async function load(tenant: string) {
    const response = await fetch((await getMeBuMIPApiBase()) + "/v1/workspace/onboarding?tenantId=" + encodeURIComponent(tenant), { credentials: "include" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to load workspace onboarding.");
    setData(body);
    setProfile({ legalName: "", displayName: "", industry: "", countryCode: "UG", timezone: "Africa/Kampala", website: "", contactEmail: "", ...(body.businessProfile ?? {}) });
    const memberResponse = await fetch((await getMeBuMIPApiBase()) + "/v1/tenants/" + encodeURIComponent(tenant) + "/members", { credentials: "include" });
    const memberBody = await memberResponse.json();
    if (memberResponse.ok) setMembers(memberBody.members ?? []);
  }
  useEffect(() => {
    let active = true;
    void getMeBuMIPApiBase().then((base) => fetch(base + "/v1/auth/me", { credentials: "include" }))
      .then(async (response) => {
        if (!response.ok) throw new Error("Sign in with a customer workspace account to continue.");
        const body = await response.json();
        const list = (body.tenantMemberships ?? []).filter((item: Membership) => item.status === "active");
        if (!active) return;
        setMemberships(list);
        if (list.length === 1) setTenantId(list[0].tenantId);
        else setTenantId("");
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Sign in required."); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (tenantId) { setData(null); setMembers([]); void load(tenantId).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load onboarding.")); } }, [tenantId]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch((await getMeBuMIPApiBase()) + "/v1/workspace/onboarding/business-profile", {
        method: "PUT", credentials: "include", headers: { ...csrf(), "content-type": "application/json" },
        body: JSON.stringify({ tenantId, ...profile }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Business profile could not be saved.");
      setNotice("Business profile saved and audited.");
      await load(tenantId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Save failed."); }
    finally { setBusy(false); }
  }
  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setTeamMessage(""); setError("");
    try {
      const stepUp = await fetch((await getMeBuMIPApiBase()) + "/v1/auth/step-up", {
        method: "POST", credentials: "include", headers: { ...csrf(), "content-type": "application/json" },
        body: JSON.stringify({ code: stepUpCode }),
      });
      const stepUpBody = await stepUp.json();
      if (!stepUp.ok) throw new Error(stepUpBody.error ?? "MFA step-up verification failed.");
      const response = await fetch((await getMeBuMIPApiBase()) + "/v1/tenants/" + encodeURIComponent(tenantId) + "/invitations", {
        method: "POST", credentials: "include", headers: { ...csrf(), "content-type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Team invitation failed.");
      setTeamMessage("Invitation sent to " + body.email + ". It expires in 72 hours.");
      setInviteEmail(""); setStepUpCode("");
      const latest = await fetch((await getMeBuMIPApiBase()) + "/v1/tenants/" + encodeURIComponent(tenantId) + "/members", { credentials: "include" });
      if (latest.ok) { const result = await latest.json(); setMembers(result.members ?? []); }
    } catch (cause) { setTeamMessage(cause instanceof Error ? cause.message : "Team invitation failed."); }
    finally { setBusy(false); }
  }

  async function connectMeta() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch((await getMeBuMIPApiBase()) + "/v1/workspace/onboarding/meta/connect", {
        method: "POST", credentials: "include", headers: { ...csrf(), "content-type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? body.error ?? "Meta connection is unavailable.");
      setNotice("Meta connection started.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Meta connection is unavailable."); }
    finally { setBusy(false); }
  }

  return <section className="customer-workflow">
    <div className="welcome"><div><div className="eyebrow">CUSTOMER WORKSPACE · ONBOARDING</div><h1>Set up your business workspace</h1><p>Complete your business profile, invite your team and connect approved business assets. Each step is recorded against your workspace.</p></div></div>
    {error && <p className="api-error" role="alert">{error}</p>}
    {notice && <p className="api-online" role="status">{notice}</p>}
    {!memberships.length ? <div className="empty-panel"><h2>Workspace access required</h2><p>Sign in with an invited customer account. If you do not yet have access, request it through the Zuri OS access workflow. Platform administration does not automatically grant a customer membership.</p></div> : <>
      <div className="panel">
        <label>Active business workspace <select value={tenantId} onChange={(event) => setTenantId(event.target.value)} required><option value="">Choose a workspace…</option>{memberships.map((membership) => <option key={membership.tenantId} value={membership.tenantId}>{membership.tenantId} · {membership.role}</option>)}</select></label>
        <p>Membership-based access only. Changing this selection reloads the workspace-scoped onboarding record.</p>
      </div>
      {data && <div className="panel"><div className="panel-head"><div><h3>Onboarding checklist</h3><p>{data.steps.filter((step) => step.status === "complete").length} of {data.steps.length} steps complete</p></div></div>
        {data.steps.map((step) => <div className="phase-row" key={step.id}><div className="phase-number">{step.phase ?? "•"}</div><div className="phase-copy"><strong>{step.label}</strong><small>{step.objective ? "Objective " + step.objective : step.id}</small></div><span className={"status " + (step.status === "complete" ? "complete" : step.status === "blocked" ? "blocked" : "planned")}>{step.status.replaceAll("_", " ")}</span></div>)}
      </div>}
      <div className="panel">
        <div className="panel-head"><div><h3>Business profile</h3><p>Required workspace information. Changes are validated and audited.</p></div></div>
        <form className="api-auth" onSubmit={saveProfile}>
          {(["legalName","displayName","industry","countryCode","timezone","website","contactEmail"] as const).map((key) => <label key={key}>{key.replace(/([A-Z])/g, " $1")}<input value={profile[key]} required={key !== "website"} onChange={(event) => setProfile((current) => ({ ...current, [key]: key === "countryCode" ? event.target.value.toUpperCase() : event.target.value }))} /></label>)}
          <button type="submit" disabled={busy || !tenantId}>{busy ? "Saving…" : "Save business profile"}</button>
        </form>
      </div>
      <div className="panel">
        <div className="panel-head"><div><h3>Team and access</h3><p>Invite team members with least-privilege roles. Sensitive changes require a fresh MFA step-up.</p></div></div>
        <div className="api-table-wrap"><table><thead><tr><th>Member</th><th>Role</th><th>Status</th></tr></thead><tbody>{members.map((member) => <tr key={member.id}><td>{member.userId}</td><td>{member.role}</td><td>{member.status}</td></tr>)}</tbody></table></div>
        <form className="api-auth" onSubmit={inviteMember}>
          <label>Invitee email<input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} required /></label>
          <label>Role<select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}><option value="viewer">Viewer</option><option value="publisher">Publisher</option><option value="advertiser">Advertiser</option><option value="support_agent">Support agent</option><option value="tenant_admin">Tenant administrator</option></select></label>
          <label>Authenticator code<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={stepUpCode} onChange={(event) => setStepUpCode(event.target.value)} required /></label>
          <button type="submit" disabled={busy || !tenantId}>{busy ? "Sending…" : "Verify MFA and invite"}</button>
        </form>
        {teamMessage && <p role="status">{teamMessage}</p>}
      </div>
      <div className="panel">
        <div className="panel-head"><div><h3>Connect Meta Business</h3><p>OAuth and asset selection will be enabled after Meta app prerequisites and provider-issued credentials are configured.</p></div></div>
        <p>{data?.providerReadiness.message ?? "Checking provider readiness…"}</p>
        <button type="button" disabled={busy || data?.providerReadiness.metaOAuth !== "ready"} onClick={() => void connectMeta()}>Connect Meta Business</button>
      </div>
    </>}
  </section>;
}
