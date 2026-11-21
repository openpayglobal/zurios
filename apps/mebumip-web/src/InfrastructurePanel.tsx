import { useCallback, useEffect, useState } from "react";

const INFRA_API = import.meta.env.VITE_MEBUMIP_API_BASE ?? "http://localhost:4100";
type Infrastructure = {
  generatedAt: string;
  environment: string;
  database: { configured: boolean; topology: { replicaSet: boolean; writablePrimary: boolean; transactionsAvailable: boolean }; source: string; note: string };
  keyrings: {
    managedSigning: Array<{ id: string; name: string; purpose: string; keyId: string; algorithm: string; environment: string; status: string }>;
    mfaEncryption: { configured: boolean; activeKeyId: string | null; source: string; status: string };
    legacyAuditHmac: { configured: boolean; activeKeyId: string | null; source: string };
  };
  apiOrigins: { items: string[]; source: string; status: string };
  providers: { email: { configured: boolean; provider: string | null }; meta: { configured: boolean; status: string }; whatsapp: { configured: boolean; status: string } };
  secretStore: { status: string; reason: string };
  note: string;
};
export function InfrastructurePanel() {
  const [data, setData] = useState<Infrastructure | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(INFRA_API + "/v1/mac/infrastructure", { credentials: "include", cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Infrastructure inventory unavailable.");
      setData(body);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Infrastructure inventory unavailable."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <section className="infrastructure-panel">
    <div className="section-head"><div><h2>Infrastructure and secrets</h2><p>MAC inventory of generated signing keys, database readiness, origins and provider configuration.</p></div><button className="text-btn" type="button" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh inventory"}</button></div>
    {error && <p className="api-error" role="alert">{error}</p>}
    {data && <>
      <div className="notice"><strong>Secret values are never displayed here.</strong><span>MAC exposes key IDs, status and lifecycle metadata only. Credential creation, encryption and activation remain separately gated.</span></div>
      <div className="objective-grid">
        <article className="objective-card"><div className="objective-top"><strong>MongoDB production connection</strong><span className={data.database.configured && data.database.topology.replicaSet && data.database.topology.transactionsAvailable ? "status complete" : "status blocked"}>{data.database.configured ? "Configured" : "Missing"}</span></div><p>Replica set: {String(data.database.topology.replicaSet)} · Writable primary: {String(data.database.topology.writablePrimary)} · Transactions: {String(data.database.topology.transactionsAvailable)}</p><small>{data.database.note}</small></article>
        <article className="objective-card"><div className="objective-top"><strong>MFA encryption keyring</strong><span className={data.keyrings.mfaEncryption.configured ? "status progress" : "status blocked"}>{data.keyrings.mfaEncryption.configured ? "Legacy/runtime key exists" : "Not configured"}</span></div><p>Active key ID: {data.keyrings.mfaEncryption.activeKeyId ?? "None"}</p><small>Requires dedicated encryption KMS/HSM before MAC-managed rotation.</small></article>
        <article className="objective-card"><div className="objective-top"><strong>MAC secret store</strong><span className="status blocked">Blocked</span></div><p>{data.secretStore.reason}</p></article>
        <article className="objective-card"><div className="objective-top"><strong>API origins</strong><span className="status progress">{data.apiOrigins.status.replaceAll("_", " ")}</span></div>{data.apiOrigins.items.map((origin) => <p key={origin}>{origin}</p>)}</article>
      </div>
      <div className="panel"><div className="panel-head"><div><h3>Vercel-managed signing keyrings</h3><p>Private signing keys remain in Vercel KMS; MAC displays metadata and controls after runtime integration.</p></div><span className="tiny-tag">{data.keyrings.managedSigning.length} ISSUERS</span></div>
        {data.keyrings.managedSigning.map((key) => <div className="phase-row" key={key.id}><div className="phase-number"><i className="secure-dot"/></div><div className="phase-copy"><strong>{key.name}</strong><small>{key.purpose} · {key.algorithm} · {key.environment} · key {key.keyId}</small><small>Issuer {key.id}</small></div><span className="status progress">Provisioned</span></div>)}
      </div>
      <div className="panel"><div className="panel-head"><div><h3>Provider connections</h3><p>Provider-issued credentials must be authorized and validated before activation.</p></div></div>
        <div className="health-row"><span>Email delivery</span><strong>{data.providers.email.configured ? "Configured" : "Not configured"}</strong></div>
        <div className="health-row"><span>Meta Business</span><strong>{data.providers.meta.status.replaceAll("_", " ")}</strong></div>
        <div className="health-row"><span>WhatsApp Business</span><strong>{data.providers.whatsapp.status.replaceAll("_", " ")}</strong></div>
      </div>
      <small>Last checked {new Date(data.generatedAt).toLocaleString()} · Environment {data.environment}</small>
    </>}
  </section>;
}
