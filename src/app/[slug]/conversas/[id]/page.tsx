"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Send } from "lucide-react";

type Message = {
  id: string;
  direction: "in" | "out";
  content: string;
  sent_at: string;
};

type ConversationDetail = {
  id: string;
  customer_phone: string;
  customer_name: string | null;
  messages: Message[];
};

export default function ConversaThreadPage({
  params,
}: {
  params: { slug: string; id: string };
}) {
  const pathname = usePathname();
  const [conv, setConv] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendValue, setSendValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolved = params;
  const slug = resolved?.slug ?? pathname?.split("/")[1] ?? "";

  const fetchConversation = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) {
        setConv(null);
        return;
      }
      const data = await res.json();
      setConv(data);
    } catch {
      setConv(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!resolved?.id) return;
    fetchConversation(resolved.id);
  }, [resolved?.id, fetchConversation]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = sendValue.trim();
    if (!text || !resolved?.id || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${resolved.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err?.error ?? "Falha ao enviar");
        return;
      }
      setSendValue("");
      await fetchConversation(resolved.id);
    } catch {
      setError("Falha ao enviar");
    } finally {
      setSending(false);
    }
  }

  const base = slug ? `/${slug}` : "";

  if (loading && !conv) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-[#F1F5F9] text-[#64748B]">
        Carregando…
      </div>
    );
  }
  if (!conv) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-[#F1F5F9] text-[#64748B]">
        <p>Conversa não encontrada.</p>
        <a href={`${base}/conversas`} className="mt-2 text-[#6366F1] hover:underline">
          Voltar
        </a>
      </div>
    );
  }

  const name = conv.customer_name || conv.customer_phone;

  return (
    <div className="flex flex-1 flex-col bg-[#F1F5F9]">
      {/* Cabeçalho do chat */}
      <header className="flex items-center gap-3 border-b border-[#E2E8F0] bg-white px-4 py-3">
        <a
          href={`${base}/conversas`}
          className="text-[#64748B] hover:text-[#1E293B] transition-colors"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </a>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E2E8F0] text-sm font-medium text-[#64748B]">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-[#1E293B]">{name}</p>
          <p className="text-xs text-[#64748B]">{conv.customer_phone}</p>
        </div>
      </header>

      {/* Thread */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-3">
          {conv.messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 ${
                  m.direction === "out"
                    ? "bg-[#DCFCE7] text-[#1E293B]"
                    : "bg-white border border-[#E2E8F0] text-[#1E293B]"
                }`}
              >
                <p className="whitespace-pre-wrap text-sm">{m.content}</p>
                <p className="mt-1 text-xs text-[#64748B]">
                  {new Date(m.sent_at).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rodapé: transferir + envio */}
      <div className="border-t border-[#E2E8F0] bg-white p-2">
        <p className="mb-2 text-xs text-[#64748B]">
          Chamado pertence a outro atendente. <a href="#" className="text-[#6366F1] hover:underline">Transferir chamado</a>
        </p>
        {error && <p className="mb-2 text-sm text-[#EF4444]">{error}</p>}
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            value={sendValue}
            onChange={(e) => setSendValue(e.target.value)}
            placeholder="Digite sua mensagem…"
            className="flex-1 rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm text-[#1E293B] placeholder-[#94A3B8] focus:border-[#6366F1] focus:outline-none focus:ring-1 focus:ring-[#6366F1]"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={!sendValue.trim() || sending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#6366F1] px-4 py-2 text-sm font-medium text-white hover:bg-[#4F46E5] disabled:bg-[#94A3B8] disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-4 w-4" />
            Enviar
          </button>
        </form>
      </div>
    </div>
  );
}
