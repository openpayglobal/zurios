import {Activity,Boxes,Building2,ChevronRight,Command,ShieldCheck,Users} from "lucide-react";
const foundations=[
 {icon:Building2,title:"Tenant & organization",detail:"Tenant-scoped workspace foundations"},
 {icon:Users,title:"Identity & membership",detail:"Users, memberships and sessions"},
 {icon:ShieldCheck,title:"Access governance",detail:"RBAC roles with ABAC policy hooks"},
 {icon:Activity,title:"Audit & observability",detail:"Append-only security event trail"}
];
export default function App(){
 return <main className="min-h-screen bg-ink text-slate-100">
  <header className="border-b border-white/10 bg-panel/70"><div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
   <div className="flex items-center gap-3"><div className="rounded-xl bg-accent/15 p-2 text-accent"><Command size={22}/></div><div><p className="font-semibold tracking-wide">ZURI OS</p><p className="text-xs text-slate-400">Business operating system</p></div></div>
   <span className="rounded-full border border-accent/30 px-3 py-1 text-xs text-accent">Platform foundation · 0.1.0</span>
  </div></header>
  <section className="mx-auto max-w-7xl px-6 py-16">
   <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent">One platform. Connected operations.</p>
   <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight md:text-6xl">Your operational world, <span className="text-accent">unified.</span></h1>
   <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-400">Zuri OS is being established as a modular, multi-tenant platform. Shared identity, governance and data foundations power every business ecosystem.</p>
   <div className="mt-12 grid gap-4 md:grid-cols-2">{foundations.map(({icon:Icon,title,detail})=><article key={title} className="rounded-2xl border border-white/10 bg-panel p-6 shadow-xl shadow-black/10"><div className="rounded-xl bg-white/5 p-3 text-accent w-fit"><Icon size={22}/></div><h2 className="mt-5 text-lg font-semibold">{title}</h2><p className="mt-2 text-sm text-slate-400">{detail}</p></article>)}</div>
   <div className="mt-10 flex items-center justify-between rounded-2xl border border-white/10 bg-panel/60 p-6"><div><p className="font-medium">Platform services are being initialized</p><p className="mt-1 text-sm text-slate-400">Business modules will be enabled after foundation verification.</p></div><ChevronRight className="text-accent"/></div>
   <footer className="mt-16 flex items-center gap-2 text-xs text-slate-500"><Boxes size={15}/> Zuri OS · Modular by design · Governed by default</footer>
  </section>
 </main>;
}
