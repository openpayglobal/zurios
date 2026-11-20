import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent,type ReactNode} from "react";
import {
 ArrowDownToLine,ArrowRight,Blocks,Building2,Check,ChevronDown,Command,FileSearch,Grid2X2,
 KeyRound,Layers3,LockKeyhole,LogOut,Menu,RefreshCw,Settings2,ShieldCheck,UserPlus,Users,
 X,AlertTriangle,Mail,CheckCircle2
} from "lucide-react";

declare global {
 interface ImportMetaEnv { readonly VITE_API_BASE_URL?: string }
 interface ImportMeta { readonly env: ImportMetaEnv }
}

const API_BASE=import.meta.env.VITE_API_BASE_URL??"https://zurios-api.vercel.app";
type View="overview"|"organizations"|"identity"|"governance"|"audit"|"breakglass"|"configuration"|"tenants";
type Principal={userId:string;tenantId:string;membershipId:string;roleKeys:string[];permissions:string[];platformPermissions?:string[]};
type Session={accessToken:string;refreshToken:string;sessionId:string};\ntype WorkspaceOption={tenantId:string;slug:string;displayName:string;legalName:string;membershipId:string;roleKeys:string[];organizationIds:string[];locationIds:string[]};
const navigation:Array<{id:View;label:string;icon:typeof Grid2X2;permission?:string;platform?:string}>= [
 {id:"overview",label:"Overview",icon:Grid2X2,permission:"platform.admin.overview.read"},
 {id:"organizations",label:"Organizations",icon:Building2,permission:"platform.organizations.read"},
 {id:"identity",label:"Identity & users",icon:Users,permission:"platform.users.read"},
 {id:"governance",label:"Governance & approvals",icon:ShieldCheck,permission:"platform.approvals.read"},
 {id:"audit",label:"Audit centre",icon:FileSearch,permission:"platform.audit.read"},
 {id:"breakglass",label:"Break-glass",icon:KeyRound,permission:"platform.breakglass.read"},
 {id:"configuration",label:"Configuration",icon:Settings2,permission:"platform.configuration.read"},
 {id:"tenants",label:"Tenant directory",icon:Layers3,platform:"platform.tenants.read"}
];
function cn(...values:Array<string|false|undefined>){return values.filter(Boolean).join(" ");}
function Panel({children,className=""}:{children:ReactNode;className?:string}){
 return <section className={cn("rounded-2xl border border-white/[0.08] bg-[#111d2e]/85 shadow-[0_18px_55px_rgba(0,0,0,.12)]",className)}>{children}</section>;
}
function SectionTitle({eyebrow,title,description,action}:{eyebrow:string;title:string;description:string;action?:ReactNode}){
 return <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-cyan-200/80">{eyebrow}</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100 md:text-3xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{description}</p></div>{action}</div>;
}
function Button({children,onClick,disabled=false,variant="primary",type="button"}:{children:ReactNode;onClick?:()=>void;disabled?:boolean;variant?:"primary"|"secondary"|"danger";type?:"button"|"submit"}){
 const styles={primary:"border-cyan-200/20 bg-cyan-200/[0.12] text-cyan-100 hover:bg-cyan-200/[0.18]",secondary:"border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]",danger:"border-rose-300/20 bg-rose-300/[0.08] text-rose-200 hover:bg-rose-300/[0.14]"};
 return <button type={type} onClick={onClick} disabled={disabled} className={cn("inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",styles[variant])}>{children}</button>;
}
function Input({label,value,onChange,placeholder="",type="text",required=false}:{label:string;value:string;onChange:(value:string)=>void;placeholder?:string;type?:string;required?:boolean}){
 return <label className="block"><span className="mb-2 block text-xs font-medium text-slate-400">{label}</span><input type={type} required={required} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-white/10 bg-[#0a1422] px-3.5 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-200/40 focus:ring-2 focus:ring-cyan-200/10"/></label>;
}
function Status({value}:{value:string}){
 const good=["active","executed","approved","sent","published"].includes(value.toLowerCase());
 const bad=["failed","rejected","revoked","dead_letter","suspended","expired"].includes(value.toLowerCase());
 return <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium",good?"border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-200":bad?"border-rose-300/20 bg-rose-300/[0.07] text-rose-200":"border-amber-200/15 bg-amber-200/[0.06] text-amber-100")}>{value.replaceAll("_"," ")}</span>;
}
function Empty({label}:{label:string}){return <div className="rounded-xl border border-dashed border-white/10 px-5 py-10 text-center text-sm text-slate-500">{label}</div>;}
function ErrorBanner({message}:{message:string}){return message?<div className="mb-5 flex items-start gap-2 rounded-xl border border-rose-300/20 bg-rose-300/[0.06] px-4 py-3 text-xs leading-5 text-rose-200"><AlertTriangle size={15} className="mt-0.5 shrink-0"/>{message}</div>:null;}
function Loading(){return <div className="flex items-center gap-2 py-10 text-sm text-slate-500"><RefreshCw size={15} className="animate-spin"/> Loading platform data…</div>;}
export default function App(){
 const [session,setSession]=useState<Session|null>(null);
 const [principal,setPrincipal]=useState<Principal|null>(null);
 const [view,setView]=useState<View>("overview");
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [viewData,setViewData]=useState<Record<string,unknown>>({});
 const [workspaceOptions,setWorkspaceOptions]=useState<WorkspaceOption[]>([]);\n const [workspaceSelectionToken,setWorkspaceSelectionToken]=useState("");\n const [availableWorkspaces,setAvailableWorkspaces]=useState<WorkspaceOption[]>([]);\n const [workspaceMenuOpen,setWorkspaceMenuOpen]=useState(false);
 const [email,setEmail]=useState("");
 const [password,setPassword]=useState("");
 const [challengeToken,setChallengeToken]=useState("");
 const [mfaCode,setMfaCode]=useState("");
 const [busy,setBusy]=useState(false);
 const [mobileNav,setMobileNav]=useState(false);
 const refreshPromise=useRef<Promise<string>|null>(null);

 const saveSession=useCallback((value:Session)=>{setSession(value);setError("");setNotice("");setWorkspaceOptions([]);setWorkspaceSelectionToken("");},[]);
 const clearSession=useCallback(()=>{setSession(null);setPrincipal(null);setViewData({});setChallengeToken("");setPassword("");setWorkspaceOptions([]);setWorkspaceSelectionToken("");setAvailableWorkspaces([]);setWorkspaceMenuOpen(false);},[]);
 const refreshAccessToken=useCallback(async()=>{
  if(!session)throw new Error("Your session has expired. Sign in again.");
  if(!refreshPromise.current){
   refreshPromise.current=(async()=>{
    const response=await fetch(API_BASE+"/auth/refresh",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({sessionId:session.sessionId,refreshToken:session.refreshToken})});
    if(!response.ok)throw new Error("Your session has expired. Sign in again.");
    const value=await response.json() as Session;
    saveSession(value);return value.accessToken;
   })().finally(()=>{refreshPromise.current=null;});
  }
  return refreshPromise.current;
 },[session,saveSession]);
 const api=useCallback(async <T = Record<string,unknown>,>(path:string,init:RequestInit={}):Promise<T>=>{
  if(!session)throw new Error("Sign in to continue.");
  const send=async(token:string)=>fetch(API_BASE+path,{...init,headers:{...(init.body?{"content-type":"application/json"}:{}),...(init.headers??{}),authorization:"Bearer "+token}});
  let response=await send(session.accessToken);
  if(response.status===401){
   try{const token=await refreshAccessToken();response=await send(token);}catch{clearSession();throw new Error("Your session expired. Please sign in again.");}
  }
  if(!response.ok){
   let message="Request failed ("+response.status+")";
   try{const body=await response.json();if(body.error)message=String(body.error);}catch{}
   throw new Error(message);
  }
  if(response.status===204)return null as T;
  return await response.json() as T;
 },[session,refreshAccessToken,clearSession]);

 const loadPrincipal=useCallback(async()=>{
  try{const result=await api<{principal:Principal}>("/auth/me");setPrincipal(result.principal);}
  catch(e){setError(e instanceof Error?e.message:"Unable to load identity.");}
 },[api]);
 useEffect(()=>{if(session&&!principal)void loadPrincipal();},[session,principal,loadPrincipal]);

 const loadView=useCallback(async(target:View)=>{
  if(!session)return;
  setLoading(true);setError("");
  try{
   let result:unknown;
   if(target==="overview")result=await api("/v1/platform/admin/overview");
   if(target==="organizations"){
    const [organizations,locations]=await Promise.all([api("/v1/platform/organizations"),api("/v1/platform/locations")]);
    result={organizations,locations};
   }
   if(target==="identity")result=await api("/v1/platform/admin/users");
   if(target==="governance")result=await api("/v1/platform/admin/approvals");
   if(target==="audit")result=await api("/v1/platform/admin/audit-events");
   if(target==="breakglass")result=await api("/v1/platform/admin/break-glass");
   if(target==="configuration")result=await api("/v1/platform/admin/configuration");
   if(target==="tenants")result=await api("/v1/platform/admin/tenants");
   setViewData(previous=>({...previous,[target]:result}));
  }catch(e){setError(e instanceof Error?e.message:"Unable to load this workspace.");}
  finally{setLoading(false);}
 },[api,session]);
 useEffect(()=>{if(session&&principal)void loadView(view);},[session,principal,view,loadView]);

 const login=async(event:FormEvent)=>{
  event.preventDefault();setBusy(true);setError("");
  try{
   const response=await fetch(API_BASE+"/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password,tenantSlug})});
   const result=await response.json();
   if(!response.ok)throw new Error(result.error??"Sign-in failed.");
   if(result.mfaRequired){setChallengeToken(result.challengeToken);setNotice("Enter the current authenticator code to finish signing in.");}
   else saveSession(result as Session);
  }catch(e){setError(e instanceof Error?e.message:"Sign-in failed.");}
  finally{setBusy(false);}
 };
 const verifyMfa=async(event:FormEvent)=>{
  event.preventDefault();setBusy(true);setError("");
  try{
   const response=await fetch(API_BASE+"/auth/mfa/verify",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({challengeToken,code:mfaCode})});
   const result=await response.json();if(!response.ok)throw new Error(result.error??"MFA verification failed.");
   saveSession(result as Session);setChallengeToken("");setMfaCode("");
  }catch(e){setError(e instanceof Error?e.message:"MFA verification failed.");}
  finally{setBusy(false);}
 };
 const selectWorkspace=async(tenantId:string)=>{
  if(!workspaceSelectionToken)return;
  setBusy(true);setError("");
  try{
   const response=await fetch(API_BASE+"/auth/workspace/select",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({selectionToken:workspaceSelectionToken,tenantId})});
   const result=await response.json();
   if(!response.ok)throw new Error(result.error??"Workspace selection failed.");
   saveSession(result as Session);
  }catch(e){setError(e instanceof Error?e.message:"Workspace selection failed.");}
  finally{setBusy(false);}
 };
 const switchToWorkspace=async(tenantId:string)=>{
  if(!session||tenantId===principal?.tenantId){setWorkspaceMenuOpen(false);return;}
  setBusy(true);setError("");
  try{
   const result=await api<Session>("/auth/workspace/switch",{method:"POST",body:JSON.stringify({tenantId})});
   setPrincipal(null);setViewData({});setView("overview");setWorkspaceMenuOpen(false);saveSession(result);
  }catch(e){setError(e instanceof Error?e.message:"Unable to switch workspace.");}
  finally{setBusy(false);}
 };
 const logout=async()=>{
  try{if(session)await api("/auth/logout",{method:"POST"});}catch{}
  clearSession();setNotice("You have signed out.");
 };

 const allowedNavigation=useMemo(()=>navigation.filter(item=>item.platform?principal?.platformPermissions?.includes(item.platform):!item.permission||principal?.permissions?.includes(item.permission)),[principal]);
 const title=navigation.find(item=>item.id===view)?.label??"Overview";
 const refresh=()=>void loadView(view);
 const idempotency=()=>crypto.randomUUID();

 if(!session||!principal){
  return <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#091321] px-4 py-10 text-slate-100">
   <div className="pointer-events-none absolute -left-28 top-0 h-96 w-96 rounded-full bg-cyan-400/[0.08] blur-3xl"/><div className="pointer-events-none absolute -right-28 bottom-0 h-96 w-96 rounded-full bg-blue-500/[0.08] blur-3xl"/>
   <div className="relative w-full max-w-md">
    <div className="mb-8 flex items-center justify-center gap-3"><div className="rounded-2xl border border-cyan-200/20 bg-cyan-200/10 p-3 text-cyan-100"><Command size={25}/></div><div><p className="text-lg font-semibold tracking-[.18em]">ZURI OS</p><p className="text-[10px] uppercase tracking-[.22em] text-slate-500">Unified operating platform</p></div></div>
    <Panel className="p-7 md:p-8">
     {challengeToken? <><div className="mb-6"><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-cyan-200">Multi-factor authentication</p><h1 className="mt-2 text-2xl font-semibold">Verify your identity</h1><p className="mt-2 text-sm leading-6 text-slate-400">Enter the current code from your authenticator app.</p></div><ErrorBanner message={error}/><form onSubmit={verifyMfa} className="space-y-4"><Input label="Authenticator code or recovery code" value={mfaCode} onChange={setMfaCode} placeholder="000000" required/><Button type="submit" disabled={busy}>{busy?"Verifying…":"Verify and continue"} <ArrowRight size={15}/></Button><button type="button" onClick={()=>{setChallengeToken("");setMfaCode("");}} className="ml-3 text-xs text-slate-500 hover:text-slate-300">Back to sign in</button></form></>:
     {workspaceSelectionToken? <><div className="mb-6"><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-cyan-200">Workspace access</p><h1 className="mt-2 text-2xl font-semibold">Choose your workspace</h1><p className="mt-2 text-sm leading-6 text-slate-400">Your Zuri identity can belong to more than one workspace. Choose where you want to continue.</p></div><ErrorBanner message={error}/>{workspaceOptions.length? <div className="space-y-3">{workspaceOptions.map(workspace=><button key={workspace.membershipId} type="button" disabled={busy} onClick={()=>void selectWorkspace(workspace.tenantId)} className="w-full rounded-xl border border-white/10 bg-white/[0.035] p-4 text-left transition hover:border-cyan-200/30 hover:bg-cyan-200/[0.06] disabled:opacity-50"><span className="flex items-center justify-between gap-3"><span className="font-semibold text-slate-100">{workspace.displayName||workspace.legalName}</span><ArrowRight size={16} className="text-cyan-200"/></span><span className="mt-1 block text-xs text-slate-500">{workspace.roleKeys.join(" · ")||"Workspace member"}</span></button>)}</div>:<div className="rounded-xl border border-dashed border-white/10 px-5 py-8 text-center text-sm leading-6 text-slate-400">Your Zuri identity does not have an active workspace membership yet. Accept a workspace invitation or ask a workspace administrator to grant access.</div>}<button type="button" onClick={()=>{setWorkspaceSelectionToken("");setWorkspaceOptions([]);setPassword("");}} className="mt-5 text-xs text-slate-500 hover:text-slate-300">Back to sign in</button></> : <><div className="mb-6"><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-cyan-200">Secure workspace access</p><h1 className="mt-2 text-2xl font-semibold">Sign in to Zuri OS</h1><p className="mt-2 text-sm leading-6 text-slate-400">Use your Zuri OS identity. You can choose among all workspaces you are authorized to access after signing in.</p></div><ErrorBanner message={error}/><form onSubmit={login} className="space-y-4"><Input label="Email address" value={email} onChange={setEmail} type="email" placeholder="you@organization.com" required/><Input label="Password" value={password} onChange={setPassword} type="password" placeholder="Your password" required/><Button type="submit" disabled={busy}>{busy?"Signing in…":"Sign in securely"} <ArrowRight size={15}/></Button></form><div className="mt-6 flex items-center gap-2 border-t border-white/[0.07] pt-5 text-[11px] text-slate-500"><LockKeyhole size={14}/> Credentials are sent only to your configured Zuri OS API.</div></>}}
    </Panel>
    <p className="mt-5 text-center text-[10px] text-slate-600">OIPTECH / ODEL Developers · Governed by default</p>
   </div>
  </div>;
 }

 const data=(viewData[view]??{}) as any;
 const orgRows=(data.organizations?.data??[]) as any[];
 const locationRows=(data.locations?.data??[]) as any[];
 const users=(data.data??[]) as any[];
 const approvals=(data.data??[]) as any[];
 const auditEvents=(data.data??[]) as any[];
 const grants=(data.data??[]) as any[];
 const configRows=(data.data??[]) as any[];
 const tenants=(data.data??[]) as any[];

 const submitInvitation=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();const form=new FormData(event.currentTarget);
  try{
   await api("/v1/platform/admin/users/invitations",{method:"POST",headers:{"idempotency-key":idempotency()},body:JSON.stringify({email:form.get("email"),displayName:form.get("displayName"),organizationIds:[form.get("organizationId")],locationIds:form.get("locationId")?[form.get("locationId")]:[],roleIds:[],reason:form.get("reason")})});
   setNotice("Membership invitation queued for secure delivery.");event.currentTarget.reset();void loadView("identity");
  }catch(e){setError(e instanceof Error?e.message:"Invitation failed.");}
 };
 const decideApproval=async(requestId:string,decision:"approve"|"reject",reason:string)=>{
  try{await api("/v1/platform/admin/approvals/"+requestId+"/"+decision,{method:"POST",headers:{"idempotency-key":idempotency()},body:JSON.stringify({reason})});setNotice(decision==="approve"?"Approval request approved.":"Approval request rejected.");void loadView("governance");}
  catch(e){setError(e instanceof Error?e.message:"Approval action failed.");}
 };
 const revokeGrant=async(grantId:string,reason:string)=>{
  try{await api("/v1/platform/admin/break-glass/"+grantId+"/revoke",{method:"POST",headers:{"idempotency-key":idempotency()},body:JSON.stringify({reason})});setNotice("Emergency grant revoked.");void loadView("breakglass");}
  catch(e){setError(e instanceof Error?e.message:"Grant revocation failed.");}
 };
 const updateConfig=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();const form=new FormData(event.currentTarget),key=String(form.get("key")),value=form.get("value");
  try{await api("/v1/platform/admin/configuration/"+key,{method:"PUT",headers:{"idempotency-key":idempotency()},body:JSON.stringify({value,reason:form.get("reason")})});setNotice("Tenant configuration updated.");void loadView("configuration");}
  catch(e){setError(e instanceof Error?e.message:"Configuration update failed.");}
 };
 const resendInvitation=async(membershipId:string)=>{
  const reason=window.prompt("Reason for reissuing this invitation (20+ characters):");
  if(!reason||reason.length<20)return;
  try{await api("/v1/platform/admin/users/invitations/"+membershipId+"/resend",{method:"POST",headers:{"idempotency-key":idempotency()},body:JSON.stringify({reason})});setNotice("A new invitation was queued; the previous token is invalid.");void loadView("identity");}
  catch(e){setError(e instanceof Error?e.message:"Invitation resend failed.");}
 };
 const requestMembershipChange=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();const form=new FormData(event.currentTarget);
  try{await api("/v1/platform/admin/approvals",{method:"POST",headers:{"idempotency-key":idempotency()},body:JSON.stringify({action:"membership.suspend",targetType:"membership",targetId:form.get("membershipId"),payload:{},reason:form.get("reason")})});setNotice("Membership suspension request submitted for independent approval.");event.currentTarget.reset();void loadView("governance");}
  catch(e){setError(e instanceof Error?e.message:"Approval request failed.");}
 };
 const requestStructureChange=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();const form=new FormData(event.currentTarget),kind=String(form.get("kind")),targetId=String(form.get("targetId"));
  try{await api("/v1/platform/admin/"+kind+"/"+targetId+"/lifecycle-requests",{method:"POST",headers:{"idempotency-key":idempotency()},body:JSON.stringify({reason:form.get("reason")})});setNotice("Structure lifecycle request submitted for independent approval.");event.currentTarget.reset();void loadView("governance");}
  catch(e){setError(e instanceof Error?e.message:"Lifecycle request failed.");}
 };
 const requestTenantLifecycle=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();const form=new FormData(event.currentTarget),tenantId=String(form.get("tenantId"));
  try{await api("/v1/platform/admin/tenants/"+tenantId+"/lifecycle-requests",{method:"POST",headers:{"idempotency-key":idempotency()},body:JSON.stringify({action:form.get("action"),reason:form.get("reason")})});setNotice("Platform tenant lifecycle request submitted for independent approval.");event.currentTarget.reset();void loadView("governance");}
  catch(e){setError(e instanceof Error?e.message:"Tenant lifecycle request failed.");}
 };
 const createTenant=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();const form=new FormData(event.currentTarget);
  try{await api("/v1/platform/admin/tenants",{method:"POST",headers:{"idempotency-key":idempotency()},body:JSON.stringify({slug:form.get("slug"),legalName:form.get("legalName"),displayName:form.get("displayName"),defaultLocale:"en",defaultCurrency:"UGX",timezone:"Africa/Kampala",owner:{email:form.get("ownerEmail"),displayName:form.get("ownerName")},reason:form.get("reason")})});setNotice("Tenant provisioned. Initial owner invitation is queued.");event.currentTarget.reset();void loadView("tenants");}
  catch(e){setError(e instanceof Error?e.message:"Tenant provisioning failed.");}
 };

 return <div className="min-h-screen bg-[#091321] text-slate-100">
  <aside className={cn("fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-white/[0.07] bg-[#0d1929] transition-transform xl:translate-x-0",mobileNav?"translate-x-0":"-translate-x-full")}>
   <div className="flex h-[76px] items-center gap-3 border-b border-white/[0.07] px-6"><div className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-2 text-cyan-200"><Command size={21}/></div><div><p className="font-semibold tracking-[.16em]">ZURI OS</p><p className="text-[10px] uppercase tracking-[.2em] text-slate-500">Operating platform</p></div><button className="ml-auto text-slate-500 xl:hidden" onClick={()=>setMobileNav(false)}><X size={18}/></button></div>
   <div className="px-4 pt-6"><p className="px-3 text-[10px] font-semibold uppercase tracking-[.2em] text-slate-500">Active workspace</p><button type="button" onClick={()=>setWorkspaceMenuOpen(value=>!value)} aria-expanded={workspaceMenuOpen} className="mt-3 flex w-full items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.035] p-3 text-left hover:border-cyan-200/20"><div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-cyan-300/20 to-blue-500/20 text-cyan-200"><Blocks size={18}/></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{availableWorkspaces.find(w=>w.tenantId===principal.tenantId)?.displayName??principal.tenantId}</p><p className="text-[11px] text-slate-500">{principal.platformPermissions?.length?"Platform operator":"Tenant workspace"}</p></div><ChevronDown size={15} className={cn("text-slate-500 transition",workspaceMenuOpen&&"rotate-180")}/></button>{workspaceMenuOpen&&<div className="mt-2 space-y-1 rounded-xl border border-white/[0.08] bg-[#101e30] p-2">{availableWorkspaces.map(workspace=><button key={workspace.membershipId} type="button" disabled={busy} onClick={()=>void switchToWorkspace(workspace.tenantId)} className={cn("w-full rounded-lg px-3 py-2 text-left text-xs transition hover:bg-white/[0.06]",workspace.tenantId===principal.tenantId?"text-cyan-100":"text-slate-300")}><span className="block truncate font-medium">{workspace.displayName||workspace.legalName}</span><span className="mt-1 block text-[10px] text-slate-500">{workspace.roleKeys.join(" · ")||"Member"}</span></button>)}</div>}</div>
   <nav className="mt-7 flex-1 space-y-1 overflow-y-auto px-4"><p className="px-3 pb-3 text-[10px] font-semibold uppercase tracking-[.2em] text-slate-500">Administration</p>{allowedNavigation.map(item=>{const Icon=item.icon;return <button key={item.id} onClick={()=>{setView(item.id);setMobileNav(false);}} className={cn("flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition",view===item.id?"border-cyan-300/15 bg-cyan-300/[0.08] text-cyan-100":"border-transparent text-slate-400 hover:bg-white/[0.04] hover:text-slate-200")}><Icon size={17}/>{item.label}</button>;})}</nav>
   <div className="m-4 rounded-xl border border-white/[0.07] bg-white/[0.025] p-4"><div className="flex items-center gap-2 text-xs text-slate-300"><ShieldCheck size={15}/> Governed workspace</div><p className="mt-2 break-all text-[11px] leading-5 text-slate-500">{principal.userId}</p><button onClick={logout} className="mt-3 flex items-center gap-2 text-xs text-slate-400 hover:text-rose-200"><LogOut size={14}/> Sign out</button></div>
  </aside>
  {mobileNav&&<button aria-label="Close navigation" className="fixed inset-0 z-20 bg-black/60 xl:hidden" onClick={()=>setMobileNav(false)}/>}
  <div className="xl:pl-72">
   <header className="sticky top-0 z-10 flex h-[76px] items-center justify-between border-b border-white/[0.07] bg-[#091321]/90 px-4 backdrop-blur-xl md:px-8">
    <div className="flex items-center gap-3"><button onClick={()=>setMobileNav(true)} className="rounded-lg border border-white/10 p-2 text-slate-400 xl:hidden"><Menu size={17}/></button><div><p className="text-[11px] text-slate-500">Zuri OS / <span className="text-slate-300">{title}</span></p><p className="mt-1 text-sm font-medium">Shared platform administration</p></div></div>
    <div className="flex items-center gap-3"><span className="hidden text-[11px] text-slate-500 md:inline">{principal.roleKeys.join(" · ")||"Platform identity"}</span><button onClick={refresh} className="rounded-lg border border-white/10 p-2 text-slate-400 hover:text-cyan-100" title="Refresh data"><RefreshCw size={16}/></button><div className="grid h-9 w-9 place-items-center rounded-full border border-cyan-200/20 bg-cyan-200/10 text-xs font-semibold text-cyan-100">{principal.userId.slice(0,2).toUpperCase()}</div></div>
   </header>
   <main className="mx-auto max-w-[1500px] px-4 py-7 md:px-8 md:py-10">
    <ErrorBanner message={error}/>{notice&&<div className="mb-5 flex items-center justify-between rounded-xl border border-emerald-300/15 bg-emerald-300/[0.06] px-4 py-3 text-xs text-emerald-200"><span className="flex items-center gap-2"><CheckCircle2 size={15}/>{notice}</span><button onClick={()=>setNotice("")}><X size={14}/></button></div>}
    {loading&&!viewData[view]?<Loading/>:null}
    {view==="overview"&&<><SectionTitle eyebrow="Platform foundation" title="Operations overview" description="Live tenant-scoped metrics from Zuri OS shared platform services." action={<Button variant="secondary" onClick={refresh}><RefreshCw size={14}/> Refresh</Button>}/>{data.data&&<><div className="mb-5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500"><span className="rounded-full border border-cyan-200/15 bg-cyan-200/[0.05] px-2.5 py-1 text-cyan-200">{data.data.scope}</span><span>Generated {new Date(data.data.generatedAt).toLocaleString()}</span></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(data.data.counts??{}).map(([label,value])=><Panel key={label} className="p-5"><p className="text-xs capitalize text-slate-500">{label.replaceAll(/([A-Z])/g," $1")}</p><p className="mt-3 text-3xl font-semibold tracking-tight">{value===null?"—":String(value)}</p><p className="mt-1 text-[10px] text-slate-600">Current workspace</p></Panel>)}</div><div className="mt-5 grid gap-4 lg:grid-cols-2"><Panel className="p-5"><h2 className="text-sm font-semibold">Governance activity</h2>{data.data.governance?<div className="mt-5 grid grid-cols-2 gap-4"><div><p className="text-2xl font-semibold">{data.data.governance.pendingApprovals}</p><p className="mt-1 text-xs text-slate-500">Pending approvals</p></div><div><p className="text-2xl font-semibold">{data.data.governance.recentAuditEvents}</p><p className="mt-1 text-xs text-slate-500">Audit events · 24h</p></div></div>:<p className="mt-4 text-xs text-slate-500">Tenant-wide governance metrics require the corresponding overview permission.</p>}</Panel><Panel className="p-5"><h2 className="text-sm font-semibold">Event delivery</h2>{data.data.events?<div className="mt-5 grid grid-cols-2 gap-4"><div><p className="text-2xl font-semibold">{data.data.events.pending}</p><p className="mt-1 text-xs text-slate-500">Pending / processing</p></div><div><p className="text-2xl font-semibold">{data.data.events.deadLettered}</p><p className="mt-1 text-xs text-slate-500">Dead-letter events</p></div></div>:<p className="mt-4 text-xs text-slate-500">Event delivery metrics are not exposed at this scope.</p>}</Panel></div></>}</>}
    {view==="organizations"&&<><SectionTitle eyebrow="Structure" title="Organizations & locations" description="View the organization hierarchy and physical or operational locations within your authorized scope."/><div className="grid gap-5 xl:grid-cols-2"><Panel className="p-5"><h2 className="mb-4 text-sm font-semibold">Organizations <span className="ml-2 text-xs font-normal text-slate-500">{orgRows.length}</span></h2>{orgRows.length?orgRows.map((org:any)=><div key={org.organizationId} className="flex items-center justify-between border-t border-white/[0.06] py-3"><div><p className="text-sm font-medium">{org.name}</p><p className="mt-1 text-[11px] text-slate-500">{org.code} · {org.type}</p></div><Status value={org.status}/></div>):<Empty label="No organizations in your assigned scope."/ >}</Panel><Panel className="p-5"><h2 className="mb-4 text-sm font-semibold">Locations <span className="ml-2 text-xs font-normal text-slate-500">{locationRows.length}</span></h2>{locationRows.length?locationRows.map((loc:any)=><div key={loc.locationId} className="flex items-center justify-between border-t border-white/[0.06] py-3"><div><p className="text-sm font-medium">{loc.name}</p><p className="mt-1 text-[11px] text-slate-500">{loc.code} · {loc.type} · {loc.organizationId}</p></div><Status value={loc.status}/></div>):<Empty label="No locations in your assigned scope."/ >}</Panel></div><Panel className="mt-5 p-5"><h2 className="mb-4 text-sm font-semibold">Request structure deactivation</h2><form onSubmit={requestStructureChange} className="grid gap-3 md:grid-cols-3"><label className="block"><span className="mb-2 block text-xs text-slate-400">Resource type</span><select name="kind" className="w-full rounded-xl border border-white/10 bg-[#0a1422] px-3 py-3 text-sm"><option value="organizations">Organization</option><option value="locations">Location</option></select></label><label className="block"><span className="mb-2 block text-xs text-slate-400">Resource ID</span><input name="targetId" required className="w-full rounded-xl border border-white/10 bg-[#0a1422] px-3 py-3 text-sm"/></label><label className="block"><span className="mb-2 block text-xs text-slate-400">Reason</span><input name="reason" required minLength={20} className="w-full rounded-xl border border-white/10 bg-[#0a1422] px-3 py-3 text-sm"/></label><div className="md:col-span-3"><Button type="submit">Request deactivation approval</Button></div></form></Panel></>}
    {view==="identity"&&<><SectionTitle eyebrow="Identity lifecycle" title="Users & memberships" description="Tenant-scoped directory. Credentials, recovery material and authentication secrets are never displayed."/><div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]"><Panel className="p-5"><div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold">People</h2><span className="text-xs text-slate-500">{users.length} shown</span></div>{users.length?users.map((user:any)=><div key={user.userId} className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{user.displayName}</p><p className="mt-1 truncate text-xs text-slate-500">{user.emailNormalized}</p><div className="mt-2 flex flex-wrap gap-2">{user.memberships?.map((m:any)=><span key={m.membershipId} className="inline-flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.025] px-2 py-1 text-[10px] text-slate-500">{m.membershipId} · {m.status}{m.status==="invited"&&<button type="button" onClick={()=>void resendInvitation(m.membershipId)} className="text-cyan-200 hover:text-cyan-100">Resend</button>}</span>)}</div></div><Status value={user.status}/></div>):<Empty label="No users are available in this scope."/ >}</Panel><Panel className="p-5"><div className="mb-4 flex items-center gap-2"><UserPlus size={16} className="text-cyan-200"/><h2 className="text-sm font-semibold">Invite a member</h2></div><form onSubmit={submitInvitation} className="space-y-3"><label className="block"><span className="mb-2 block text-xs text-slate-400">Email address</span><input name="email" type="email" required placeholder="person@organization.com" className="w-full rounded-xl border border-white/10 bg-[#0a1422] px-3.5 py-3 text-sm outline-none focus:border-cyan-200/40"/></label><label className="block"><span className="mb-2 block text-xs text-slate-400">Display name</span><input name="displayName" required minLength={2} className="w-full rounded-xl border border-white/10 bg-[#0a1422] px-3.5 py-3 text-sm outline-none focus:border-cyan-200/40"/></label><label className="block"><span className="mb-2 block text-xs text-slate-400">Organization ID</span><input name="organizationId" required placeholder="org_…" className="w-full rounded-xl border border-white/10 bg-[#0a1422] px-3.5 py-3 text-sm outline-none focus:border-cyan-200/40"/></label><label className="block"><span className="mb-2 block text-xs text-slate-400">Location ID (optional)</span><input name="locationId" placeholder="loc_…" className="w-full rounded-xl border border-white/10 bg-[#0a1422] px-3.5 py-3 text-sm outline-none focus:border-cyan-200/40"/></label><label className="block"><span className="mb-2 block text-xs text-slate-400">Reason</span><textarea name="reason" required minLength={20} rows={3} placeholder="Why is this membership being created?" className="w-full rounded-xl border border-white/10 bg-[#0a1422] px-3.5 py-3 text-sm outline-none focus:border-cyan-200/40"/></label><Button type="submit"><Mail size={14}/> Queue invitation</Button></form><p className="mt-4 text-[10px] leading-5 text-slate-500">Delivery is queued through the notification event stream. An email provider must be configured for actual delivery.</p></Panel></div></>}
    {view==="governance"&&<><SectionTitle eyebrow="Access control" title="Governance & approvals" description="Review pending changes. Approval requires a different identity from the requester."/><div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]"><Panel className="p-5"><h2 className="mb-4 text-sm font-semibold">Request membership suspension</h2><form onSubmit={requestMembershipChange} className="space-y-3"><label className="block"><span className="mb-2 block text-xs text-slate-400">Membership ID</span><input name="membershipId" required className="w-full rounded-xl border border-white/10 bg-[#0a1422] px-3.5 py-3 text-sm"/></label><label className="block"><span className="mb-2 block text-xs text-slate-400">Reason</span><textarea name="reason" required minLength={20} rows={3} className="w-full rounded-xl border border-white/10 bg-[#0a1422] px-3.5 py-3 text-sm"/></label><Button type="submit">Submit approval request</Button></form><p className="mt-4 text-[10px] leading-5 text-slate-500">The requester cannot approve their own request. Changes execute only after independent approval.</p></Panel><Panel className="p-5"><h2 className="mb-4 text-sm font-semibold">Approval queue</h2>{approvals.length?approvals.map((item:any)=><ApprovalCard key={item.requestId} item={item} onDecide={decideApproval}/>):<Empty label="No approval requests are available."/ >}</Panel></div></>}
    {view==="audit"&&<><SectionTitle eyebrow="Accountability" title="Audit centre" description="Tenant-scoped event history with actor, outcome and correlation context."/><Panel className="p-5"><div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold">Recent events</h2><Button variant="secondary" onClick={async()=>{try{await api("/v1/platform/admin/audit-exports",{method:"POST",headers:{"idempotency-key":idempotency()},body:JSON.stringify({filters:{limit:10000},reason:"Export requested by authorized tenant administrator for compliance review."})});setNotice("Audit export job queued.");}catch(e){setError(e instanceof Error?e.message:"Export request failed.");}}}><ArrowDownToLine size={14}/> Request export</Button></div>{auditEvents.length?auditEvents.map((event:any)=><div key={event.eventId} className="grid gap-2 border-t border-white/[0.06] py-3 md:grid-cols-[1fr_1fr_auto] md:items-center"><div><p className="text-xs font-medium">{event.action}</p><p className="mt-1 text-[10px] text-slate-500">{event.resourceType} {event.resourceId??""} · {event.actor?.userId??event.actor?.service??"system"}</p></div><p className="text-[10px] text-slate-500">{event.occurredAt?new Date(event.occurredAt).toLocaleString():"—"}</p><Status value={event.outcome}/></div>):<Empty label="No audit events returned."/ >}</Panel></>}
    {view==="breakglass"&&<><SectionTitle eyebrow="Emergency controls" title="Break-glass access" description="Time-bound emergency permissions, constrained to explicit organizations and locations. Every action is audited."/><Panel className="p-5">{grants.length?grants.map((grant:any)=><div key={grant.grantId} className="flex flex-col justify-between gap-3 border-t border-white/[0.06] py-4 md:flex-row md:items-center"><div><p className="text-sm font-medium">{grant.userId}</p><p className="mt-1 text-xs text-slate-500">{grant.permissionKeys?.join(", ")}</p><p className="mt-1 text-[10px] text-slate-600">Expires {new Date(grant.expiresAt).toLocaleString()} · Approved by {grant.approvedBy}</p></div><div className="flex items-center gap-3"><Status value={grant.status}/>{grant.status==="active"&&<Button variant="danger" onClick={()=>{const reason=window.prompt("Reason for emergency grant revocation (20+ characters):");if(reason&&reason.length>=20)void revokeGrant(grant.grantId,reason);}}><X size={14}/> Revoke</Button>}</div></div>):<Empty label="No emergency grants found."/ >}</Panel></>}
    {view==="configuration"&&<><SectionTitle eyebrow="Tenant settings" title="Configuration" description="Controlled tenant-level defaults. Sensitive secrets and provider credentials are managed outside this workspace."/><div className="grid gap-5 xl:grid-cols-[1fr_.8fr]"><Panel className="p-5"><h2 className="mb-4 text-sm font-semibold">Current configuration</h2>{configRows.length?configRows.map((row:any)=><div key={row.key} className="flex items-center justify-between border-t border-white/[0.06] py-3"><p className="text-xs text-slate-400">{row.key}</p><p className="text-xs font-medium text-slate-200">{String(row.value)}</p></div>):<Empty label="No tenant overrides are configured."/ >}</Panel><Panel className="p-5"><h2 className="mb-4 text-sm font-semibold">Update a setting</h2><form onSubmit={updateConfig} className="space-y-3"><label className="block"><span className="mb-2 block text-xs text-slate-400">Setting</span><select name="key" className="w-full rounded-xl border border-white/10 bg-[#0a1422] px-3.5 py-3 text-sm"><option value="displayName">Display name</option><option value="defaultLocale">Default locale</option><option value="defaultCurrency">Default currency</option><option value="timezone">Timezone</option></select></label><label className="block"><span className="mb-2 block text-xs text-slate-400">Value</span><input name="value" required className="w-full rounded-xl border border-white/10 bg-[#0a1422] px-3.5 py-3 text-sm"/></label><label className="block"><span className="mb-2 block text-xs text-slate-400">Reason</span><textarea name="reason" required minLength={20} rows={3} className="w-full rounded-xl border border-white/10 bg-[#0a1422] px-3.5 py-3 text-sm"/></label><Button type="submit"><Check size={14}/> Save configuration</Button></form></Panel></div></>}
    {view==="tenants"&&<><SectionTitle eyebrow="Platform operations" title="Tenant directory" description="Cross-tenant provisioning and lifecycle operations are restricted to separately provisioned platform operators."/><div className="grid gap-5 xl:grid-cols-[1fr_.9fr]"><Panel className="p-5"><h2 className="mb-4 text-sm font-semibold">Tenants</h2>{tenants.length?tenants.map((tenant:any)=><div key={tenant.tenantId} className="flex items-center justify-between border-t border-white/[0.06] py-3"><div><p className="text-sm font-medium">{tenant.displayName}</p><p className="mt-1 text-[10px] text-slate-500">{tenant.slug} · {tenant.tenantId}</p></div><Status value={tenant.status}/></div>):<Empty label="No tenant records returned."/ >}</Panel><Panel className="p-5"><h2 className="mb-4 text-sm font-semibold">Provision a tenant</h2><form onSubmit={createTenant} className="space-y-3"><label className="block"><span className="mb-2 block text-xs text-slate-400">Tenant slug</span><input name="slug" required pattern="[a-z0-9-]{2,64}" className="w-full rounded-xl border border-white/10 bg-[#0a1422] px-3.5 py-3 text-sm"/></label><label className="block"><span className="mb-2 block text-xs text-slate-400">Legal name</span><input name="legalName" required minLength={2} className="w-full rounded-xl border border-white/10 bg-[#0a1422] px-3.5 py-3 text-sm"/></label><label className="block"><span className="mb-2 block text-xs text-slate-400">Display name</span><input name="displayName" required minLength={2} className="w-full rounded-xl border border-white/10 bg-[#0a1422] px-3.5 py-3 text-sm"/></label><div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className="mb-2 block text-xs text-slate-400">Owner name</span><input name="ownerName" required minLength={2} className="w-full rounded-xl border border-white/10 bg-[#0a1422] px-3.5 py-3 text-sm"/></label><label className="block"><span className="mb-2 block text-xs text-slate-400">Owner email</span><input name="ownerEmail" type="email" required className="w-full rounded-xl border border-white/10 bg-[#0a1422] px-3.5 py-3 text-sm"/></label></div><label className="block"><span className="mb-2 block text-xs text-slate-400">Reason</span><textarea name="reason" required minLength={20} rows={3} className="w-full rounded-xl border border-white/10 bg-[#0a1422] px-3.5 py-3 text-sm"/></label><Button type="submit"><Building2 size={14}/> Provision tenant</Button></form><div className="mt-8 border-t border-white/[0.07] pt-5"><h3 className="mb-3 text-sm font-semibold">Request tenant lifecycle change</h3><form onSubmit={requestTenantLifecycle} className="space-y-3"><label className="block"><span className="mb-2 block text-xs text-slate-400">Tenant ID</span><input name="tenantId" required className="w-full rounded-xl border border-white/10 bg-[#0a1422] px-3.5 py-3 text-sm"/></label><label className="block"><span className="mb-2 block text-xs text-slate-400">Action</span><select name="action" className="w-full rounded-xl border border-white/10 bg-[#0a1422] px-3.5 py-3 text-sm"><option value="tenant.activate">Activate</option><option value="tenant.suspend">Suspend</option><option value="tenant.close">Close</option></select></label><label className="block"><span className="mb-2 block text-xs text-slate-400">Reason</span><textarea name="reason" required minLength={20} rows={3} className="w-full rounded-xl border border-white/10 bg-[#0a1422] px-3.5 py-3 text-sm"/></label><Button type="submit">Request lifecycle approval</Button></form></div></Panel></div></>}
    <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-5 text-[10px] text-slate-600"><span>ZURI OS · One foundation · Many governed ecosystems</span><span>OIPTECH / ODEL Developers</span></footer>
   </main>
  </div>
 </div>;
}

function ApprovalCard({item,onDecide}:{item:any;onDecide:(id:string,decision:"approve"|"reject",reason:string)=>void}){
 const [reason,setReason]=useState("");
 return <div className="border-t border-white/[0.06] py-4 first:border-0 first:pt-0"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">{item.action}</p><p className="mt-1 text-xs text-slate-500">{item.targetType} · {item.targetId}</p><p className="mt-2 max-w-2xl text-xs leading-5 text-slate-400">{item.reason}</p><p className="mt-2 text-[10px] text-slate-600">Requested by {item.requestedBy} · {new Date(item.createdAt).toLocaleString()}</p></div><Status value={item.status}/></div>{item.status==="pending"&&<div className="mt-4 flex flex-col gap-2 md:flex-row"><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Independent decision reason (10+ characters)" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0a1422] px-3 py-2.5 text-xs outline-none focus:border-cyan-200/40"/><Button disabled={reason.length<10} onClick={()=>onDecide(item.requestId,"approve",reason)}><Check size={14}/> Approve</Button><Button variant="danger" disabled={reason.length<10} onClick={()=>onDecide(item.requestId,"reject",reason)}><X size={14}/> Reject</Button></div>}</div>;
}
