import { ConversasSidebar } from "@/components/ConversasSidebar";

export default function ConversasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 h-full w-full flex-1 flex-col overflow-hidden">
      <ConversasSidebar />
      <div className="min-h-0 min-w-0 flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
