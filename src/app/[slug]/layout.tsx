import { AppHeader } from "@/components/AppHeader";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[#F8FAFC]">
      <AppHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}
