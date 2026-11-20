import { useState } from "react";
import { AdminData, AuthPanel } from "./ApiPanels";
import {
  Activity, ArrowDownRight, ArrowUpRight, BadgeCheck, BarChart3, Bell,
  Blocks, Building2, CheckCircle2, ChevronDown, CircleAlert, Command,
  Facebook, Gauge, Globe2, Instagram, LayoutDashboard, LockKeyhole,
  MessageCircle, Plug, Radio, Search, Settings2, ShieldCheck, ShieldEllipsis,
  Users, Waypoints, Workflow, X
} from "lucide-react";

type Section = "dashboard" | "objectives" | "tenants" | "connections" | "integrations" | "security" | "settings";
type Objective = { id: string; title: string; phase: string; status: string; description: string; icon: typeof Facebook };

const objectives: Objective[] = [
  { id: "A", title: "Facebook & Instagram management", phase: "Phase 2", status: "Planned", description: "Pages, professional accounts, publishing, inbox and insights.", icon: Instagram },
  { id: "B", title: "Facebook & Instagram advertising", phase: "Phase 3", status: "Planned", description: "Ad accounts, campaigns, audiences, spend controls and reporting.", icon: BarChart3 },
  { id: "C", title: "WhatsApp Business Platform", phase: "Phase 4", status: "Planned", description: "Embedded Signup, WABAs, phone numbers, templates, messaging and webhooks.", icon: MessageCircle },
  { id: "D", title: "Multi-business Meta management", phase: "Phase 5", status: "Planned", description: "Tenant onboarding, isolated workspaces, delegated roles and usage controls.", icon: Building2 },
  { id: "E", title: "External software integrations", phase: "Phase 6", status: "Planned", description: "Versioned APIs, outbound webhooks, Zuri OS adapter and developer access.", icon: Waypoints },
];

const phases: Array<[string, string, string, string]> = [
  ["0", "Product governance & Meta prerequisites", "In progress", "Meta portfolio creation deferred by owner"],
  ["1", "Standalone foundation, MAC & MAD", "In progress", "Product workspace and administration shell"],
  ["2", "Facebook & Instagram", "Not started", "Objective A"],
  ["3", "Advertising management", "Not started", "Objective B"],
  ["4", "WhatsApp Business Platform", "Not started", "Objective C"],
  ["5", "Multi-business SaaS", "Not started", "Objective D"],
  ["6", "Unified software integrations", "Not started", "Objective E"],
  ["7", "Production readiness & launch", "Not started", "All objectives"],
];

const nav: { id: Section; label: string; icon: typeof LayoutDashboard; group: string }[] = [
  { id: "dashboard", label: "Master Dashboard", icon: LayoutDashboard, group: "MAD · MONITORING" },
  { id: "objectives", label: "Objectives & roadmap", icon: Gauge, group: "MAD · MONITORING" },
  { id: "tenants", label: "Business directory", icon: Building2, group: "MAC · CONTROL" },
  { id: "connections", label: "Meta connections", icon: Plug, group: "MAC · CONTROL" },
  { id: "integrations", label: "API integrations", icon: Workflow, group: "MAC · CONTROL" },
  { id: "security", label: "Security & audit", icon: ShieldCheck, group: "MAC · GOVERNANCE" },
  { id: "settings", label: "Platform settings", icon: Settings2, group: "MAC · GOVERNANCE" },
];

function Status({ children }: { children: string }) {
  const cls = children === "In progress" ? "status progress" : children === "Complete" ? "status complete" : children === "Blocked" ? "status blocked" : "status planned";
  return <span className={cls}><span />{children}</span>;
}

function App() {
  const [section, setSection] = useState<Section>("dashboard");
  const [mobileNav, setMobileNav] = useState(false);
  const [query, setQuery] = useState("");
  const selected = nav.find((item) => item.id === section)!;
  const filtered = objectives.filter((item) => (item.id + item.title + item.description).toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="shell">
      {mobileNav && <button className="scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
      <aside className={mobileNav ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="brand-mark"><Command size={21} /></div>
          <div><strong>ZURI <span>MeBuMIP</span></strong><small>BUSINESS INTEGRATION PLATFORM</small></div>
          <button className="icon-btn close-nav" onClick={() => setMobileNav(false)} aria-label="Close"><X size={18}/></button>
        </div>
        <div className="workspace"><div className="workspace-icon">BI</div><div><strong>Blockchain Innovations LTD</strong><small>Platform owner workspace</small></div><ChevronDown size={15}/></div>
        {["MAD · MONITORING", "MAC · CONTROL", "MAC · GOVERNANCE"].map((group) => (
          <div className="nav-group" key={group}>
            <p>{group}</p>
            {nav.filter((item) => item.group === group).map((item) => {
              const Icon = item.icon;
              return <button key={item.id} className={section === item.id ? "nav-item active" : "nav-item"} onClick={() => { setSection(item.id); setMobileNav(false); }}><Icon size={17}/><span>{item.label}</span></button>;
            })}
          </div>
        ))}
        <div className="sidebar-foot"><div className="secure-dot"/><span>Administration shell · Demo data</span></div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Command size={19}/></button>
          <div className="crumb">ZURI MeBuMIP <span>/</span> {selected.label}</div>
          <div className="top-actions"><span className="env"><i/> DEVELOPMENT</span><button className="icon-btn" aria-label="Notifications"><Bell size={18}/></button><div className="avatar">BI</div></div>
        </header>

        <div className="content">
          <div className="welcome">
            <div><div className="eyebrow">MASTER ADMINISTRATION · {section === "dashboard" || section === "objectives" ? "MAD" : "MAC"}</div><h1>{section === "dashboard" ? "Master Admin Dashboard" : selected.label}</h1><p>{section === "dashboard" ? "Operational visibility across the Zuri MeBuMIP platform." : section === "objectives" ? "Track all five approved objectives through their planned delivery phases." : "Master control plane for the Zuri MeBuMIP platform."}</p></div>
            <div className="date-pill"><Activity size={15}/> Programme status · 19 Nov 2026</div>
          </div>

          <AuthPanel />
          {section === "dashboard" && <>
            <AdminData resource="overview" />
            <div className="notice"><CircleAlert size={18}/><div><strong>Meta Business Portfolio not connected</strong><span>Live Meta integrations are intentionally deferred. The platform foundation can be developed and tested using mock adapters until the owner completes Meta setup.</span></div><span className="notice-tag">EXPECTED</span></div>
            <div className="metrics">
              <Metric icon={Building2} label="Registered businesses" value="0" detail="Tenant onboarding not enabled"/>
              <Metric icon={Plug} label="Meta connections" value="0" detail="No live credentials configured"/>
              <Metric icon={MessageCircle} label="WhatsApp accounts" value="0" detail="Phase 4"/>
              <Metric icon={Activity} label="Programme phases" value="2 / 8" detail="Foundation work in progress"/>
            </div>
            <div className="section-head"><div><h2>Five strategic objectives</h2><p>All objectives remain in scope; delivery is sequenced by phase.</p></div><button className="text-btn" onClick={() => setSection("objectives")}>View roadmap <ArrowUpRight size={15}/></button></div>
            <div className="objective-grid">{objectives.map((item) => <ObjectiveCard key={item.id} item={item}/>)}</div>
            <div className="bottom-grid">
              <div className="panel"><div className="panel-head"><div><h3>Implementation phases</h3><p>Controlled delivery programme</p></div><span className="tiny-tag">8 PHASES</span></div><div className="phase-list">{phases.slice(0,5).map((phase) => <div className="phase-row" key={phase[0]}><div className="phase-number">{phase[0]}</div><div className="phase-copy"><strong>{phase[1]}</strong><small>{phase[3]}</small></div><Status>{phase[2]}</Status></div>)}</div><button className="panel-link" onClick={() => setSection("objectives")}>See all phases <ArrowUpRight size={14}/></button></div>
              <div className="panel"><div className="panel-head"><div><h3>Platform health</h3><p>Initial foundation environment</p></div><span className="health-pill"><i/> FOUNDATION</span></div><div className="health-row"><span><ShieldCheck size={16}/> Administration surfaces</span><strong>Shell established</strong></div><div className="health-row"><span><LockKeyhole size={16}/> Tenant authorization</span><strong>Pending implementation</strong></div><div className="health-row"><span><Radio size={16}/> Meta webhooks</span><strong>Not configured</strong></div><div className="health-row"><span><Globe2 size={16}/> External API</span><strong>Planned · Phase 6</strong></div><div className="health-note"><CheckCircle2 size={15}/> No live credentials are stored in this workspace.</div></div>
            </div>
          </>}

          {section === "objectives" && <><div className="section-head"><div><h2>Objective delivery register</h2><p>Search and review the complete A–E scope.</p></div><div className="search"><Search size={15}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search objectives"/></div></div><div className="objective-grid">{filtered.map((item) => <ObjectiveCard key={item.id} item={item}/>)}</div><div className="panel phase-panel"><div className="panel-head"><div><h3>Full implementation roadmap</h3><p>Phase gates and current delivery status</p></div></div>{phases.map((phase) => <div className="phase-row" key={phase[0]}><div className="phase-number">{phase[0]}</div><div className="phase-copy"><strong>{phase[1]}</strong><small>{phase[3]}</small></div><Status>{phase[2]}</Status></div>)}</div></>}

          {section === "tenants" && <AdminData resource="tenants" />}
          {section === "connections" && <EmptyState icon={Plug} title="Meta connections" detail="Facebook, Instagram, advertising and WhatsApp connection flows will be enabled in their respective delivery phases. No customer credentials or Meta tokens are configured in this development shell." phase="Phases 2–4 · Objectives A–C"/>}
          {section === "integrations" && <EmptyState icon={Workflow} title="API integrations" detail="Versioned REST APIs, outbound webhooks, client credentials and the Zuri OS adapter are planned here. External applications will receive tenant-scoped permissions." phase="Phase 6 · Objective E"/>}
          {section === "security" && <AdminData resource="audit" />}
          {section === "settings" && <EmptyState icon={Settings2} title="Platform settings" detail="Global configuration, feature flags, integration policy and service settings will be managed here by explicitly authorized platform administrators." phase="Phase 1 foundation"/>}

          <footer><span>© 2026 Blockchain Innovations LTD</span><span>Zuri MeBuMIP · Development foundation · Not connected to Meta</span></footer>
        </div>
      </main>
    </div>
  );
}

function Metric({icon: Icon,label,value,detail}:{icon:typeof Activity;label:string;value:string;detail:string}) {
  return <div className="metric"><div className="metric-top"><span>{label}</span><Icon size={17}/></div><strong>{value}</strong><small>{detail}</small></div>;
}
function ObjectiveCard({item}:{item:Objective}) {
  const Icon = item.icon;
  return <article className="objective-card"><div className="objective-top"><div className="objective-icon"><Icon size={18}/></div><span className="objective-id">OBJECTIVE {item.id}</span><Status>{item.status}</Status></div><h3>{item.title}</h3><p>{item.description}</p><div className="objective-foot"><span>{item.phase}</span><span>Delivery queued <ArrowDownRight size={14}/></span></div></article>;
}
function EmptyState({icon:Icon,title,detail,phase}:{icon:typeof Activity;title:string;detail:string;phase:string}) {
  return <div className="empty-panel"><div className="empty-icon"><Icon size={24}/></div><span className="eyebrow">MASTER ADMIN CONSOLE · MAC</span><h2>{title}</h2><p>{detail}</p><span className="phase-chip">{phase}</span><div className="empty-foot"><BadgeCheck size={16}/> Module is included in the approved product scope.</div></div>;
}
export default App;