import { unstable_serialize } from "swr";
import { headers } from "next/headers";
import { AppHeader } from "@/components/AppHeader";
import { AppSidebar } from "@/components/AppSidebar";
import { AppNavTabs } from "@/components/AppNavTabs";
import { SWRProviderWithPrefetch } from "@/components/SWRProviderWithPrefetch";
import { QueryProvider } from "@/components/QueryProvider";
import { RealtimeConversations } from "@/components/RealtimeConversations";

async function getPrefetchData(slug: string) {
  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const proto = headersList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = `${proto}://${host}`;
  const cookie = headersList.get("cookie") ?? "";
  const apiHeaders: Record<string, string> = {
    "X-Company-Slug": slug,
    ...(cookie ? { cookie } : {}),
  };

  const [permissionsRes, countsRes, queuesRes] = await Promise.all([
    fetch(`${base}/api/auth/permissions`, { headers: apiHeaders, cache: "no-store" }),
    fetch(`${base}/api/conversations/counts`, { headers: apiHeaders, cache: "no-store" }),
    fetch(`${base}/api/queues?for_inbox=1`, { headers: apiHeaders, cache: "no-store" }),
  ]);

  const permissionsData = permissionsRes.ok ? await permissionsRes.json().catch(() => ({})) : {};
  const countsData = countsRes.ok ? await countsRes.json().catch(() => ({})) : {};
  const queuesData = queuesRes.ok ? await queuesRes.json().catch(() => []) : [];

  return {
    swrFallback: {
      [unstable_serialize(["/api/auth/permissions", slug])]: permissionsData,
      [unstable_serialize(["/api/conversations/counts", slug])]: countsData,
    },
    queryInitialData: {
      slug,
      permissions: permissionsData,
      counts: countsData,
      queues: Array.isArray(queuesData) ? queuesData.map((q: { id: string; name: string }) => ({ id: q.id, name: q.name ?? "(sem nome)" })) : [],
    },
  };
}

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }> | { slug: string };
}) {
  const resolved = await Promise.resolve(params);
  const slug = resolved.slug ?? "";
  const prefetch = slug ? await getPrefetchData(slug) : null;

  return (
    <QueryProvider initialData={prefetch?.queryInitialData ?? null}>
      <RealtimeConversations />
      <SWRProviderWithPrefetch fallback={prefetch?.swrFallback ?? {}}>
        <div className="flex h-screen flex-col overflow-hidden bg-[#F1F5F9]">
          <AppHeader />
          <div className="flex min-h-0 flex-1 overflow-hidden pt-14">
            <AppSidebar />
            <div className="ml-[5px] flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <header className="fixed left-[5px] right-0 top-14 z-30 shrink-0 border-b border-white/10 bg-[#0a0a0a]">
                <AppNavTabs />
              </header>
              <main className="min-h-0 flex-1 flex flex-col overflow-hidden bg-[#FAFBFC] pt-12">
                {children}
              </main>
            </div>
          </div>
        </div>
      </SWRProviderWithPrefetch>
    </QueryProvider>
  );
}
