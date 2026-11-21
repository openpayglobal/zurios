import type {ReactNode} from "react";

declare global {
 interface ImportMetaEnv { readonly VITE_DEMO_MODE?: string; readonly VITE_VERCEL_ENV?: string; readonly VITE_DEMO_PASSWORD?: string }
 interface ImportMeta { readonly env: ImportMetaEnv }
}

const scenarios=[
 {label:"Standard member",email:"demo.member@zuri.test",description:"One active workspace membership"},
 {label:"Multi-workspace member",email:"demo.multi@zuri.test",description:"Choose between two authorized workspaces"},
 {label:"No workspace assigned",email:"demo.unassigned@zuri.test",description:"Identity with no membership; access request remains separate"}
] as const;

export function DemoCredentials({onSelect}:{onSelect:(email:string,password:string)=>void}):ReactNode{
 const enabled=import.meta.env.VITE_DEMO_MODE==="true"&&(
  (import.meta.env.DEV===true)||
  (import.meta.env.VITE_VERCEL_ENV==="preview"&&import.meta.env.MODE==="production")
 );
 const password=import.meta.env.VITE_DEMO_PASSWORD??"";
 if(!enabled||password.length<16)return null;
 return <section aria-label="Demo sign-in credentials" className="mt-5 rounded-xl border border-cyan-200/20 bg-cyan-200/[0.045] p-4">
  <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-cyan-100">Preview demo accounts</p><p className="mt-1 text-[10px] text-slate-500">Fills the sign-in form only; it does not sign you in.</p></div><span className="rounded-full border border-cyan-200/20 px-2 py-1 text-[9px] uppercase tracking-wider text-cyan-200">Non-production</span></div>
  <div className="space-y-2">
   {scenarios.map(scenario=><button key={scenario.email} type="button" onClick={()=>onSelect(scenario.email,password)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#0a1422] px-3 py-2.5 text-left transition hover:border-cyan-200/30"><span><span className="block text-xs font-medium text-slate-200">{scenario.label}</span><span className="mt-0.5 block text-[10px] text-slate-500">{scenario.description}</span></span><span className="shrink-0 text-[10px] text-cyan-200">Fill</span></button>)}
  </div>
  <p className="mt-3 text-[10px] leading-4 text-slate-500">Demo password is supplied through a preview-only Vercel environment variable and is never stored in source control.</p>
 </section>;
}
