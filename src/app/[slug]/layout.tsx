import { AppHeader } from "@/components/AppHeader";
import { AppSidebar } from "@/components/AppSidebar";
import { AppNavTabs } from "@/components/AppNavTabs";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[#F1F5F9]">
      <AppHeader />
      <div className="flex flex-1 overflow-hidden pt-14">
        <AppSidebar />
        <div className="ml-16 flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Barra de abas fixa no layout (mesma cor do minidrawer) */}
          <header className="sticky top-0 z-30 shrink-0">
            <AppNavTabs />
          </header>
          <main className="min-h-0 flex-1 overflow-auto bg-[#FAFBFC]">{children}</main>
        </div>
      </div>
    </div>
  );
}
