const MAC_BOOTSTRAP_API = "https://zurios-api-openpayglobal-5300s-projects.vercel.app";
const MEBUMIP_API_FALLBACK = import.meta.env.VITE_MEBUMIP_API_BASE ?? "https://zuri-mebumip-api-openpayglobal-5300s-projects.vercel.app";
let cachedBase = MEBUMIP_API_FALLBACK;
let cachedAt = 0;
let pending: Promise<string> | null = null;

export async function getMeBuMIPApiBase(): Promise<string> {
  if (pending && Date.now() - cachedAt < 30_000) return pending;
  cachedAt = Date.now();
  pending = (async () => {
    try {
      const response = await fetch(MAC_BOOTSTRAP_API + "/platform/public/runtime-config", { cache: "no-store" });
      if (response.ok) {
        const runtime = await response.json();
        const origin = runtime?.apiOrigins?.mebumip;
        if (typeof origin === "string" && origin.startsWith("https://")) cachedBase = origin;
      }
    } catch {
      // Keep the stable Vercel project-domain bootstrap when MAC is temporarily unavailable.
    }
    return cachedBase;
  })();
  return pending;
}
