import { ConversasSidebar } from "@/components/ConversasSidebar";

export default function ConversasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <ConversasSidebar />
      {children}
    </div>
  );
}
