"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Send, Search, ArrowRightLeft, MoreVertical, CheckCheck, Phone } from "lucide-react";

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
  queue_id: string | null;
  assigned_to: string | null;
  channel_name?: string | null;
  queue_name?: string | null;
  assigned_to_name?: string | null;
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
  const apiHeaders = slug ? { "X-Company-Slug": slug } : undefined;

  const fetchConversation = useCallback(async (id: string, options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        credentials: "include",
        headers: apiHeaders,
      });
      if (!res.ok) {
        if (!options?.silent) setConv(null);
        return;
      }
      const data = await res.json();
      setConv(data);
    } catch {
      if (!options?.silent) setConv(null);
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (!resolved?.id) return;
    fetchConversation(resolved.id);
  }, [resolved?.id, fetchConversation]);

  // Atualiza mensagens a cada 15s para exibir novas entradas (webhook) sem recarregar a página
  useEffect(() => {
    if (!resolved?.id || !conv) return;
    const interval = setInterval(() => {
      fetchConversation(resolved.id, { silent: true });
    }, 15_000);
    return () => clearInterval(interval);
  }, [resolved?.id, conv, fetchConversation]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = sendValue.trim();
    if (!text || !resolved?.id || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${resolved.id}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
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
        <a href={`${base}/conversas`} className="mt-2 text-clicvend-orange hover:underline">
          Voltar
        </a>
      </div>
    );
  }

  const name = conv.customer_name || conv.customer_phone;
  const showTransfer = !!conv.assigned_to;

  return (
    <div className="flex flex-1 flex-col bg-[#F1F5F9]">
      {/* Cabeçalho do chat: voltar, contato, badges (canal, fila, atendente), ações */}
      <header className="flex items-center gap-3 border-b border-[#E2E8F0] bg-white px-4 py-3">
        <a
          href={`${base}/conversas`}
          className="shrink-0 text-[#64748B] hover:text-[#1E293B] transition-colors"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </a>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E2E8F0] text-sm font-medium text-[#64748B]">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-[#1E293B]">{name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {conv.channel_name && (
              <span className="rounded bg-clicvend-green/15 px-1.5 py-0.5 text-xs font-medium text-clicvend-green">
                {conv.channel_name}
              </span>
            )}
            {conv.queue_name && (
              <span className="rounded bg-[#E2E8F0] px-1.5 py-0.5 text-xs text-[#64748B]">
                {conv.queue_name}
              </span>
            )}
            {conv.assigned_to_name && (
              <span className="rounded bg-[#E2E8F0] px-1.5 py-0.5 text-xs text-[#64748B]">
                {conv.assigned_to_name}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" className="rounded p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B]" aria-label="Buscar">
            <Search className="h-4 w-4" />
          </button>
          <button type="button" className="rounded p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B]" aria-label="Transferir">
            <ArrowRightLeft className="h-4 w-4" />
          </button>
          <button type="button" className="rounded p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B]" aria-label="Mais">
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Área de mensagens */}
        <div className="flex flex-1 flex-col min-w-0">
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
                    <p className="text-xs font-medium text-[#64748B] mb-0.5">
                      {m.direction === "out" ? "Você" : name}
                    </p>
                    <p className="whitespace-pre-wrap text-sm">{m.content}</p>
                    <div className="mt-1 flex items-center justify-end gap-1">
                      <span className="text-xs text-[#64748B]">
                        {new Date(m.sent_at).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {m.direction === "out" && (
                        <CheckCheck className="h-3.5 w-3.5 text-[#64748B]" aria-hidden />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Rodapé: transferir (só quando atribuído) + envio */}
          <div className="border-t border-[#E2E8F0] bg-white p-2">
            {showTransfer && (
              <p className="mb-2 text-xs text-[#64748B]">
                Chamado pertence a outro atendente.{" "}
                <button type="button" className="text-clicvend-orange hover:underline font-medium">
                  Transferir chamado
                </button>
              </p>
            )}
            {error && <p className="mb-2 text-sm text-[#EF4444]">{error}</p>}
            <form onSubmit={handleSend} className="flex gap-2">
              <input
                type="text"
                value={sendValue}
                onChange={(e) => setSendValue(e.target.value)}
                placeholder="Digite sua mensagem…"
                className="flex-1 rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm text-[#1E293B] placeholder-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                disabled={sending}
              />
              <button
                type="submit"
                disabled={!sendValue.trim() || sending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:bg-[#94A3B8] disabled:cursor-not-allowed transition-colors"
              >
                <Send className="h-4 w-4" />
                Enviar
              </button>
            </form>
          </div>
        </div>

        {/* Painel direito: dados do contato (estrutura do exemplo) */}
        <aside className="hidden w-72 shrink-0 flex-col border-l border-[#E2E8F0] bg-white lg:flex">
          <div className="border-b border-[#E2E8F0] p-3">
            <p className="text-sm font-medium text-[#1E293B]">{name}</p>
            <a href={`tel:${conv.customer_phone}`} className="mt-1 flex items-center gap-2 text-xs text-[#64748B] hover:text-clicvend-orange">
              <Phone className="h-3.5 w-3.5" />
              {conv.customer_phone}
            </a>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            <div>
              <p className="text-xs font-medium text-[#64748B] uppercase tracking-wide">Mídias e documentos</p>
              <p className="mt-1 text-sm text-[#94A3B8]">0</p>
            </div>
            <div>
              <p className="text-xs font-medium text-[#64748B] uppercase tracking-wide">Pessoa</p>
              <p className="mt-1 text-sm text-[#94A3B8]">Selecione</p>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#64748B]">Silenciar</span>
              <span className="text-xs text-[#94A3B8]">Off</span>
            </div>
            <button type="button" className="w-full rounded-lg border border-[#E2E8F0] py-2 text-sm text-[#64748B] hover:bg-[#F8FAFC]">
              Marcar como não lida
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
