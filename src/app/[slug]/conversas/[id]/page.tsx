"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Send, Search, ArrowRightLeft, MoreVertical, CheckCheck, Phone, User } from "lucide-react";
import { SideOver } from "@/components/SideOver";
import { Loader2 } from "lucide-react";

type Message = {
  id: string;
  direction: "in" | "out";
  content: string;
  sent_at: string;
};

type ConversationDetail = {
  id: string;
  channel_id: string | null;
  external_id: string;
  wa_chat_jid: string | null;
  kind?: string;
  is_group?: boolean;
  customer_phone: string;
  customer_name: string | null;
  queue_id: string | null;
  assigned_to: string | null;
  channel_name?: string | null;
  queue_name?: string | null;
  assigned_to_name?: string | null;
  messages: Message[];
};

type ChatDetails = {
  name?: string;
  wa_name?: string;
  wa_contactName?: string;
  phone?: string;
  image?: string;
  imagePreview?: string;
  wa_isBlocked?: boolean;
  wa_isGroup?: boolean;
  common_groups?: string;
  lead_name?: string;
  lead_email?: string;
  lead_status?: string;
  lead_notes?: string;
  [key: string]: unknown;
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
  const [infoOpen, setInfoOpen] = useState(false);
  const [contactDetails, setContactDetails] = useState<ChatDetails | null>(null);
  const [contactDetailsLoading, setContactDetailsLoading] = useState(false);
  const [contactDetailsError, setContactDetailsError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!resolved?.id || !conv) return;
    const interval = setInterval(() => {
      fetchConversation(resolved.id, { silent: true });
    }, 15_000);
    return () => clearInterval(interval);
  }, [resolved?.id, conv, fetchConversation]);

  const fetchContactDetails = useCallback(() => {
    if (!conv?.channel_id) return;
    const number = conv.is_group && conv.wa_chat_jid
      ? conv.wa_chat_jid
      : (conv.customer_phone || conv.external_id || "").replace(/\D/g, "").trim() || conv.external_id || conv.customer_phone;
    if (!number) return;
    setContactDetailsLoading(true);
    setContactDetailsError(null);
    setContactDetails(null);
    fetch("/api/contacts/chat-details", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...apiHeaders },
      body: JSON.stringify({ channel_id: conv.channel_id, number, preview: true }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (r.ok) setContactDetails(data);
        else setContactDetailsError(data?.error ?? "Falha ao carregar detalhes");
      })
      .catch(() => setContactDetailsError("Erro de rede"))
      .finally(() => setContactDetailsLoading(false));
  }, [conv, apiHeaders]);

  useEffect(() => {
    if (infoOpen && conv?.channel_id) fetchContactDetails();
    if (!infoOpen) {
      setContactDetails(null);
      setContactDetailsError(null);
    }
  }, [infoOpen, conv?.channel_id, fetchContactDetails]);

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
  const displayName = contactDetails?.name ?? contactDetails?.wa_name ?? contactDetails?.wa_contactName ?? name;
  const displayPhone = contactDetails?.phone ?? conv.customer_phone;
  const imageUrl = contactDetails?.imagePreview ?? contactDetails?.image ?? null;

  return (
    <div className="flex flex-1 flex-col bg-[#F1F5F9]">
      <header className="flex shrink-0 items-center gap-3 border-b border-[#E2E8F0] bg-white px-4 py-3">
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
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            className="rounded p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B]"
            aria-label="Ver informações do contato"
          >
            <User className="h-4 w-4" />
          </button>
          <button type="button" className="rounded p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B]" aria-label="Mais">
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 flex-col min-w-0">
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

        <div className="shrink-0 border-t border-[#E2E8F0] bg-white p-2">
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

      {/* SideOver de informações do contato — abre só ao clicar no botão (padrão do sistema), com rolagem própria e fotos/infos */}
      <SideOver
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title="Informações do contato"
        width={420}
      >
        <div className="flex flex-col h-full overflow-hidden">
          <div className="flex-1 overflow-y-auto min-h-0">
            {contactDetailsLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-clicvend-orange" />
              </div>
            )}
            {contactDetailsError && !contactDetailsLoading && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {contactDetailsError}
              </div>
            )}
            {!contactDetailsLoading && (contactDetails || !conv.channel_id) && (
              <div className="space-y-4">
                <div className="flex flex-col items-center gap-3 border-b border-[#E2E8F0] pb-4">
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full bg-[#E2E8F0]">
                    {imageUrl ? (
                      <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-3xl text-[#94A3B8]">
                        <User className="h-12 w-12" />
                      </div>
                    )}
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-[#1E293B]">{displayName}</p>
                    <a
                      href={`tel:${displayPhone}`}
                      className="mt-1 flex items-center justify-center gap-2 text-sm text-[#64748B] hover:text-clicvend-orange"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {displayPhone}
                    </a>
                    {conv.channel_name && (
                      <p className="mt-1 text-xs text-[#94A3B8]">{conv.channel_name}</p>
                    )}
                  </div>
                </div>
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">Mídias e documentos</h3>
                  <p className="text-sm text-[#94A3B8]">0</p>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">Pessoa</h3>
                  <p className="text-sm text-[#94A3B8]">Selecione</p>
                </div>
                {contactDetails && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">Outras informações</h3>
                    <dl className="space-y-2 text-sm">
                      {contactDetails.wa_isBlocked != null && (
                        <div>
                          <dt className="text-[#64748B]">Bloqueado</dt>
                          <dd className="font-medium text-[#1E293B]">{contactDetails.wa_isBlocked ? "Sim" : "Não"}</dd>
                        </div>
                      )}
                      {contactDetails.lead_email && (
                        <div>
                          <dt className="text-[#64748B]">E-mail (lead)</dt>
                          <dd className="font-medium text-[#1E293B]">{contactDetails.lead_email}</dd>
                        </div>
                      )}
                      {contactDetails.lead_status && (
                        <div>
                          <dt className="text-[#64748B]">Status (lead)</dt>
                          <dd className="font-medium text-[#1E293B]">{contactDetails.lead_status}</dd>
                        </div>
                      )}
                      {contactDetails.common_groups && (
                        <div>
                          <dt className="text-[#64748B]">Grupos em comum</dt>
                          <dd className="font-medium text-[#1E293B] break-words">{contactDetails.common_groups}</dd>
                        </div>
                      )}
                      {contactDetails.lead_notes && (
                        <div>
                          <dt className="text-[#64748B]">Observações</dt>
                          <dd className="font-medium text-[#1E293B] whitespace-pre-wrap">{contactDetails.lead_notes}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                )}
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-[#64748B]">Silenciar</span>
                  <span className="text-xs text-[#94A3B8]">Off</span>
                </div>
                <button type="button" className="w-full rounded-lg border border-[#E2E8F0] py-2 text-sm text-[#64748B] hover:bg-[#F8FAFC]">
                  Marcar como não lida
                </button>
              </div>
            )}
            {!conv.channel_id && !contactDetailsLoading && (
              <p className="text-sm text-[#64748B]">Canal não disponível para detalhes.</p>
            )}
          </div>
        </div>
      </SideOver>
    </div>
  );
}
