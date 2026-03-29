export type CopilotEdgeChatPayload = Record<string, unknown>;

export type CopilotEdgeChatResult = {
  reply: string;
  mistralConversationId?: string | null;
};

/**
 * Se COPILOT_EDGE_FUNCTION_URL estiver definida, o chat do copiloto chama a Edge Function (Supabase ou outra URL)
 * com o mesmo contexto; a função deve devolver JSON { reply: string, mistralConversationId?: string }.
 */
export async function invokeCopilotEdge(
  payload: CopilotEdgeChatPayload
): Promise<CopilotEdgeChatResult | null> {
  const url = process.env.COPILOT_EDGE_FUNCTION_URL?.trim();
  if (!url) return null;
  const secret = process.env.COPILOT_EDGE_SECRET?.trim();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Copilot edge HTTP ${res.status}`);
  }
  const json = (await res.json()) as { reply?: unknown; mistralConversationId?: unknown };
  const reply = typeof json.reply === "string" ? json.reply : "";
  const mid =
    typeof json.mistralConversationId === "string" && json.mistralConversationId.startsWith("conv_")
      ? json.mistralConversationId.trim()
      : null;
  return { reply, mistralConversationId: mid };
}
