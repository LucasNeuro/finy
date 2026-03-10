"use client";

import { ConversasSidebar } from "@/components/ConversasSidebar";
import { FocusModeTabs } from "@/components/FocusModeTabs";
import { useInboxStore } from "@/stores/inbox-store";

export function ConversasLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const focusMode = useInboxStore((s) => s.focusMode);

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-row overflow-hidden">
      {!focusMode && <ConversasSidebar />}
      <div className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${focusMode ? "pl-3" : ""}`}>
        {focusMode && <FocusModeTabs />}
        {children}
      </div>
    </div>
  );
}
