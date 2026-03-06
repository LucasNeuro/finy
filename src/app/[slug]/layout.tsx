import { AppHeader } from "@/components/AppHeader";
import { AppSidebar } from "@/components/AppSidebar";
import { AppNavTabs } from "@/components/AppNavTabs";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#F1F5F9]">
      <AppHeader />
      <div className="flex min-h-0 flex-1 overflow-hidden pt-14">
        <AppSidebar />
        <div className="ml-16 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {/* Barra de abas fixa ao rolar (sempre visível abaixo do header) */}
          <header className="fixed left-16 right-0 top-14 z-30 shrink-0 border-b border-white/10 bg-[#0a0a0a]">
            <AppNavTabs />
          </header>
          <main className="min-h-0 flex-1 flex flex-col overflow-hidden bg-[#FAFBFC] pt-12">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
