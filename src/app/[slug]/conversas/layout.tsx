import { ConversasLayoutClient } from "./ConversasLayoutClient";

export default function ConversasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConversasLayoutClient>{children}</ConversasLayoutClient>;
}
