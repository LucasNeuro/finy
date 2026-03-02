import { ConversasSidebar } from "@/components/ConversasSidebar";

export default function ConversasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 overflow-hidden">
      <ConversasSidebar />
      {children}
    </div>
  );
}
