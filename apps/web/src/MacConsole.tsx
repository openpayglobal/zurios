import {useMemo,useState} from "react";
import type {ReactNode} from "react";
import {
  Activity,AlertTriangle,Blocks,Building2,CheckCircle2,ChevronRight,Cloud,
  Command,Database,FileKey2,Globe2,KeyRound,LayoutDashboard,LockKeyhole,
  Menu,RefreshCw,Search,Settings2,Shield,ShieldCheck,Workflow
} from "lucide-react";

type Section = "Overview"|"Ecosystems"|"Tenants"|"Environment & Secrets"|"Providers"|"Deployments"|"Security & Audit"|"Approvals"|"Settings";

const navigation:{label:string;icon:typeof LayoutDashboard;group:string}[]=[
 {label:"Overview",icon:LayoutDashboard,group:"Command"},
 {label:"Ecosystems",icon:Blocks,group:"Command"},
 {label:"Tenants",icon:Building2,group:"Command"},
 {label:"Environment & Secrets",icon:FileKey2,group:"Infrastructure"},
 {label:"Providers",icon:Cloud,group:"Infrastructure"},
 {label:"Deployments",icon:Workflow,group:"Infrastructure"},
 {label:"Security & Audit",icon:ShieldCheck,group:"Governance"},
 {label:"Approvals",icon:CheckCircle2,group:"Governance"},
 {label:"Settings",icon:Settings2,group:"Governance"}
];

const bootstrapVariables=[
 {name:"NODE_ENV",classification:"Deployment configuration",exposure:"Non-secret"},
 {name:"MONGODB_URI",classification:"Bootstrap credential",exposure:"Secret"},
 {name:"MONGODB_DATABASE",classification:"Deployment configuration",exposure:"Non-secret"},
 {name:"JWT_ISSUER",classification:"Identity configuration",exposure:"Non-secret"},
 {name:"JWT_AUDIENCE",classification:"Identity configuration",exposure:"Non-secret"},
 {name:"JWT_SECRET",classification:"Signing key",exposure:"Secret"},
 {name:"MFA_ENCRYPTION_KEY",classification:"Encryption key",exposure:"Secret"},
 {name:"CORS_ORIGINS",classification:"Network policy",exposure:"Non-secret"}
];

function StatePill({children,kind="neutral"}:{children:ReactNode;kind?:"neutral"|"warning"|"success"}) {
 const style=kind==="warning"?"border-amber-300/20 bg-amber-300/[0.07] text-amber-200":kind==="success"?"border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-200":"border-white/10 bg-white/[0.035] text-slate-400";
 return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${style}`}><span className="h-1.5 w-1.5 rounded-full bg-current"/>{children}</span>;
}

function Overview(){
 const cards=[
  {label:"Ecosystem services",value:"Unknown",hint:"No live registry connection",icon:Blocks},
  {label:"Tenant environments",value:"Unknown",hint:"Awaiting platform API",icon:Building2},
  {label:"Deployment health",value:"Unknown",hint:"Provider telemetry not connected",icon:Workflow},
  {label:"Security posture",value:"Review required",hint:"Production controls not verified",icon:Shield}
 ];
 const queues=[
  {title:"Platform API integration",detail:"Connect MAC overview to authenticated administrative endpoints",state:"Not connected"},
  {title:"Provider capability discovery",detail:"Read project and deployment state through an approved provider adapter",state:"Pending"},
  {title:"Runtime configuration service",detail:"Implement encrypted, versioned, server-side runtime configuration",state:"Not implemented"},
  {title:"Production network perimeter",detail:"Replace unrestricted Atlas ingress before production use",state:"Action required"}
 ];
 return <div className="space-y-8">
  <div className="flex flex-wrap items-end justify-between gap-4">
   <div><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200">Global command centre</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Master Admin Dashboard</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">A single operational view of the Zuri OS ecosystem. Live health and resource data will appear only after authenticated platform telemetry is connected.</p></div>
   <StatePill kind="warning">Development · telemetry not connected</StatePill>
  </div>
  <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">{cards.map(({label,value,hint,icon:Icon})=><article key={label} className="rounded-2xl border border-white/[0.08] bg-[#111d2e] p-5"><div className="flex items-center justify-between"><span className="text-xs text-slate-400">{label}</span><Icon size={17} className="text-cyan-200/70"/></div><p className="mt-4 text-2xl font-semibold text-slate-200">{value}</p><p className="mt-1 text-[11px] text-slate-500">{hint}</p></article>)}</div>
  <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
   <section className="rounded-2xl border border-white/[0.08] bg-[#111d2e] p-5 md:p-6"><div className="flex items-center justify-between"><div><h2 className="font-semibold text-white">Operational attention</h2><p className="mt-1 text-xs text-slate-500">Verified implementation and infrastructure blockers</p></div><AlertTriangle size={18} className="text-amber-200"/></div><div className="mt-5 space-y-3">{queues.map(q=><div key={q.title} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"><div><p className="text-sm font-medium text-slate-200">{q.title}</p><p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">{q.detail}</p></div><StatePill kind="warning">{q.state}</StatePill></div>)}</div></section>
   <section className="rounded-2xl border border-white/[0.08] bg-[#111d2e] p-5 md:p-6"><h2 className="font-semibold text-white">Control plane architecture</h2><p className="mt-1 text-xs text-slate-500">Global governance and operational visibility</p><div className="mt-5 space-y-4">{[{icon:ShieldCheck,title:"MAC · Management plane",desc:"Policies, configuration, approvals and controlled execution"},{icon:Activity,title:"MAD · Operational picture",desc:"Health, activity, risk, capacity and exceptions"},{icon:Database,title:"MongoDB · Platform data",desc:"Tenant-scoped application records and administrative metadata"},{icon:KeyRound,title:"Secrets · Bootstrap boundary",desc:"Server-side credentials; never exposed to browser clients"}].map(({icon:Icon,title,desc})=><div key={title} className="flex gap-3"><div className="rounded-lg border border-cyan-200/10 bg-cyan-200/[0.05] p-2 text-cyan-200"><Icon size={16}/></div><div><p className="text-sm font-medium text-slate-200">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{desc}</p></div></div>)}</div></section>
  </div>
 </div>;
}

function EnvironmentSecrets(){
 return <div className="space-y-6">
  <div><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200">Configuration governance</p><h1 className="mt-2 text-3xl font-semibold text-white">Environment & Secrets</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Manage deployment-scoped variables separately from live runtime configuration. Secret values must be written through an authenticated server endpoint and are never readable again through ordinary list APIs.</p></div>
  <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-4"><div className="flex gap-3"><AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-200"/><div><p className="text-sm font-semibold text-amber-100">Management API not connected</p><p className="mt-1 text-xs leading-5 text-amber-100/70">This workspace is currently a UI foundation. It does not write to Vercel or MongoDB. Do not enter live secrets here until the authenticated, audited configuration API and encryption bootstrap are implemented.</p></div></div></div>
  <div className="grid gap-4 lg:grid-cols-2">
   <article className="rounded-2xl border border-white/[0.08] bg-[#111d2e] p-5"><div className="flex items-center gap-2"><Cloud size={17} className="text-cyan-200"/><h2 className="font-semibold text-white">Deployment variables</h2></div><p className="mt-2 text-xs leading-5 text-slate-500">Provider-managed variables consumed by a new deployment. Updating Vercel variables does not change existing running deployments.</p><div className="mt-4"><StatePill kind="warning">Provider adapter pending</StatePill></div></article>
   <article className="rounded-2xl border border-white/[0.08] bg-[#111d2e] p-5"><div className="flex items-center gap-2"><RefreshCw size={17} className="text-cyan-200"/><h2 className="font-semibold text-white">Live runtime configuration</h2></div><p className="mt-2 text-xs leading-5 text-slate-500">Approved non-bootstrap settings served server-side from a versioned, encrypted configuration service with bounded cache freshness.</p><div className="mt-4"><StatePill kind="warning">Service not implemented</StatePill></div></article>
  </div>
  <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111d2e]">
   <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] p-5"><div><h2 className="font-semibold text-white">API bootstrap variable schema</h2><p className="mt-1 text-xs text-slate-500">Names and classifications only · values are intentionally not displayed</p></div><StatePill>8 required keys</StatePill></div>
   <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="bg-white/[0.025] text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3 font-medium">Variable</th><th className="px-5 py-3 font-medium">Classification</th><th className="px-5 py-3 font-medium">Handling</th><th className="px-5 py-3 font-medium">Management state</th></tr></thead><tbody>{bootstrapVariables.map(v=><tr key={v.name} className="border-t border-white/[0.05]"><td className="px-5 py-3 font-mono text-slate-200">{v.name}</td><td className="px-5 py-3 text-slate-400">{v.classification}</td><td className="px-5 py-3">{v.exposure==="Secret"?<span className="inline-flex items-center gap-1.5 text-amber-200"><LockKeyhole size={12}/> Secret</span>:<span className="text-slate-400">Configuration</span>}</td><td className="px-5 py-3"><StatePill kind="warning">API not connected</StatePill></td></tr>)}</tbody></table></div>
   <div className="border-t border-white/[0.07] p-4 text-[11px] leading-5 text-slate-500">A successful provider write must be followed by a deployment and configuration-consumption verification. Bootstrap credentials cannot be stored solely inside the runtime service they are required to unlock.</div>
  </section>
 </div>;
}

function Placeholder({section}:{section:Exclude<Section,"Overview"|"Environment & Secrets">}){
 const content:Record<Exclude<Section,"Overview"|"Environment & Secrets">,{icon:typeof Blocks;description:string;items:string[]}> = {
  "Ecosystems":{icon:Blocks,description:"Registry of Zuri OS products, modules, services, versions and entitlements.",items:["Product and module lifecycle","Service ownership and dependencies","Feature entitlements and activation"]},
  "Tenants":{icon:Building2,description:"Global tenant and environment inventory with strict separation from tenant-level administration.",items:["Tenant lifecycle and status","Organization and workspace structure","Environment and regional configuration"]},
  "Providers":{icon:Cloud,description:"Provider-neutral infrastructure registry. Provider capabilities are reported as supported, unsupported or unknown.",items:["Hosting provider registry","Project and credential metadata","Capability and connection health"]},
  "Deployments":{icon:Workflow,description:"Controlled preview and production release operations with approval, health gates and rollback records.",items:["Deployment history and build state","Release approvals and promotion","Rollback and change windows"]},
  "Security & Audit":{icon:ShieldCheck,description:"Global security posture, privileged access, policy decisions, incidents and immutable administrative audit.",items:["Privileged access review","Policy denials and security alerts","Audit search and export"]},
  "Approvals":{icon:CheckCircle2,description:"Human approval queue for high-impact operations. No approval is inferred from a UI click alone.",items:["Production configuration changes","Identity and policy changes","Infrastructure and destructive operations"]},
  "Settings":{icon:Settings2,description:"Global platform defaults, localization, feature controls and MAC operator preferences.",items:["Localization and currencies","Global platform settings","Notification and access preferences"]}
 };
 const data=content[section],Icon=data.icon;
 return <div className="max-w-3xl space-y-6"><div><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200">Master Admin Console</p><h1 className="mt-2 text-3xl font-semibold text-white">{section}</h1><p className="mt-2 text-sm leading-6 text-slate-400">{data.description}</p></div><div className="rounded-2xl border border-white/[0.08] bg-[#111d2e] p-6"><div className="flex items-center gap-3"><div className="rounded-xl border border-cyan-200/15 bg-cyan-200/[0.06] p-3 text-cyan-200"><Icon size={20}/></div><div><p className="font-semibold text-white">Workspace foundation</p><StatePill kind="warning">Backend integration pending</StatePill></div></div><ul className="mt-6 space-y-3">{data.items.map(item=><li key={item} className="flex items-center gap-3 text-sm text-slate-300"><ChevronRight size={15} className="text-cyan-200"/>{item}</li>)}</ul><p className="mt-6 border-t border-white/[0.07] pt-4 text-xs leading-5 text-slate-500">This page currently describes the intended administrative domain. It does not yet read or mutate live platform resources.</p></div></div>;
}

export default function MacConsole(){
 const [section,setSection]=useState<Section>("Overview");
 const [search,setSearch]=useState("");
 const [mobileNav,setMobileNav]=useState(false);
 const groups=useMemo(()=>Array.from(new Set(navigation.map(n=>n.group))),[]);
 return <div className="min-h-screen bg-[#0a1220] text-slate-100">
  <aside className={`fixed inset-y-0 left-0 z-30 flex w-[270px] flex-col border-r border-white/[0.07] bg-[#0d1929] transition-transform xl:translate-x-0 ${mobileNav?"translate-x-0":"-translate-x-full"}`}>
   <div className="flex h-[76px] items-center gap-3 border-b border-white/[0.07] px-5"><div className="rounded-xl border border-cyan-200/20 bg-cyan-200/[0.07] p-2 text-cyan-200"><Command size={20}/></div><div><p className="font-semibold tracking-[0.16em] text-white">ZURI OS</p><p className="text-[9px] uppercase tracking-[0.2em] text-slate-500">Master Admin Console</p></div></div>
   <div className="mx-4 mt-5 rounded-xl border border-amber-200/15 bg-amber-200/[0.045] p-3"><div className="flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-100">Environment</span><StatePill kind="warning">Preview</StatePill></div><p className="mt-2 text-[11px] leading-5 text-slate-400">Development control plane · no production actions enabled</p></div>
   <nav className="mt-6 flex-1 overflow-y-auto px-3 pb-4">{groups.map(group=><div key={group} className="mb-6"><p className="px-3 pb-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-600">{group}</p><div className="space-y-1">{navigation.filter(n=>n.group===group).map(item=>{const Icon=item.icon,active=section===item.label;return <button key={item.label} onClick={()=>{setSection(item.label as Section);setMobileNav(false);}} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs transition ${active?"border border-cyan-200/15 bg-cyan-200/[0.08] text-cyan-100":"text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"}`}><Icon size={16}/><span className="flex-1">{item.label}</span>{active&&<span className="h-1.5 w-1.5 rounded-full bg-cyan-200"/>}</button>})}</div></div>)}</nav>
   <div className="border-t border-white/[0.07] p-4"><div className="flex items-center gap-2 text-[10px] text-slate-500"><ShieldCheck size={13}/> Protected administration surface</div><p className="mt-2 text-[9px] text-slate-600">OIPTECH / ODEL Developers</p></div>
  </aside>
  {mobileNav&&<button aria-label="Close navigation" onClick={()=>setMobileNav(false)} className="fixed inset-0 z-20 bg-black/60 xl:hidden"/>}
  <div className="min-h-screen xl:pl-[270px]">
   <header className="sticky top-0 z-10 flex h-[76px] items-center justify-between border-b border-white/[0.07] bg-[#0a1220]/90 px-4 backdrop-blur-xl md:px-8">
    <div className="flex items-center gap-3"><button onClick={()=>setMobileNav(v=>!v)} aria-label="Toggle navigation" className="rounded-lg border border-white/10 p-2 text-slate-300 xl:hidden"><Menu size={17}/></button><div><p className="text-[10px] text-slate-500">Zuri OS / Master Admin / <span className="text-slate-300">{section}</span></p><p className="mt-1 text-xs font-medium text-slate-200">Global ecosystem control plane</p></div></div>
    <div className="flex items-center gap-2 md:gap-3"><label className="hidden items-center gap-2 rounded-lg border border-white/10 bg-white/[0.025] px-3 py-2 sm:flex"><Search size={13} className="text-slate-500"/><input aria-label="Search console" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search console" className="w-28 bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600 md:w-40"/></label><span className="hidden items-center gap-1.5 text-[10px] text-slate-500 md:flex"><Globe2 size={13}/> Global scope</span><div className="grid h-8 w-8 place-items-center rounded-full border border-cyan-200/20 bg-cyan-200/[0.07] text-[10px] font-semibold text-cyan-100">ZO</div></div>
   </header>
   <main className="mx-auto max-w-[1500px] px-4 py-7 md:px-8 md:py-10">
    {section==="Overview"?<Overview/>:section==="Environment & Secrets"?<EnvironmentSecrets/>:<Placeholder section={section}/>}
    <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-5 text-[9px] text-slate-600"><span>ZURI OS · MAC/MAD · Development foundation</span><span>All resource data is unconnected until authenticated APIs are enabled</span></footer>
   </main>
  </div>
 </div>;
}
