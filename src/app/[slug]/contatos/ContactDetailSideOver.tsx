"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { SideOver } from "@/components/SideOver";
import { Loader2, User, Ban, UserPlus, UserMinus } from "lucide-react";

export type Contact = {
  id: string;
  channel_id: string;
  jid: string;
  phone: string | null;
  contact_name: string | null;
  first_name: string | null;
  avatar_url?: string | null;
  synced_at: string;
};

export type ChatDetails = {
  id?: string;
  name?: string;
  wa_name?: string;
  wa_contactName?: string;
  phone?: string;
  image?: string;
  imagePreview?: string;
  wa_isBlocked?: boolean;
  wa_isGroup?: boolean;
  wa_archived?: boolean;
  common_groups?: string;
  lead_name?: string;
  lead_fullName?: string;
  lead_email?: string;
  lead_status?: string;
  lead_notes?: string;
  lead_tags?: string[];
  [key: string]: unknown;
};

const DETAIL_LABELS: Record<string, string> = {
  id: "ID",
  wa_fastid: "Fast ID",
  wa_chatid: "Chat ID",
  wa_chatlid: "Chat LID",
  wa_archived: "Arquivado",
  wa_contactName: "Nome (contato WA)",
  wa_name: "Nome (WA)",
  name: "Nome",
  image: "Imagem",
  imagePreview: "Imagem (preview)",
  wa_ephemeralExpiration: "Mensagens temporárias (expiração)",
  wa_isBlocked: "Bloqueado",
  wa_isGroup: "É grupo",
  wa_isGroup_admin: "Admin do grupo",
  wa_isGroup_announce: "Grupo só admins",
  wa_isGroup_community: "É comunidade",
  wa_isGroup_member: "Membro do grupo",
  wa_isPinned: "Fixado",
  wa_label: "Etiquetas",
  wa_lastMessageTextVote: "Última mensagem (voto)",
  wa_lastMessageType: "Tipo última mensagem",
  wa_lastMsgTimestamp: "Última mensagem (data)",
  wa_lastMessageSender: "Remetente última mensagem",
  wa_muteEndTime: "Silenciado até",
  owner: "Proprietário",
  wa_unreadCount: "Não lidas",
  phone: "Telefone",
  common_groups: "Grupos em comum",
  lead_name: "Nome (lead)",
  lead_fullName: "Nome completo (lead)",
  lead_email: "E-mail (lead)",
  lead_personalid: "ID pessoal (lead)",
  lead_status: "Status (lead)",
  lead_tags: "Tags (lead)",
  lead_notes: "Observações (lead)",
  lead_isTicketOpen: "Ticket aberto",
  lead_assignedAttendant_id: "Atendente (lead)",
  lead_kanbanOrder: "Ordem kanban",
  lead_field01: "Campo 01",
  lead_field02: "Campo 02",
  lead_field03: "Campo 03",
  lead_field04: "Campo 04",
  lead_field05: "Campo 05",
  lead_field06: "Campo 06",
  lead_field07: "Campo 07",
  lead_field08: "Campo 08",
  lead_field09: "Campo 09",
  lead_field10: "Campo 10",
  lead_field11: "Campo 11",
  lead_field12: "Campo 12",
  lead_field13: "Campo 13",
  lead_field14: "Campo 14",
  lead_field15: "Campo 15",
  lead_field16: "Campo 16",
  lead_field17: "Campo 17",
  lead_field18: "Campo 18",
  lead_field19: "Campo 19",
  lead_field20: "Campo 20",
  chatbot_agentResetMemoryAt: "Chatbot: reset memória em",
  chatbot_lastTrigger_id: "Chatbot: último gatilho",
  chatbot_lastTriggerAt: "Chatbot: último gatilho em",
  chatbot_disableUntil: "Chatbot: desativado até",
};

type ContactDetailSideOverProps = {
  open: boolean;
  onClose: () => void;
  contact: Contact | null;
  channelName: string;
  companySlug: string;
  onBlockChange?: () => void;
};

function numberForApi(contact: Contact): string {
  const digits = (contact.phone ?? "").replace(/\D/g, "").trim();
  if (digits) return digits;
  const jid = (contact.jid ?? "").trim();
  return jid.replace(/@.*$/, "").trim() || jid;
}

export function ContactDetailSideOver({
  open,
  onClose,
  contact,
  channelName,
  companySlug,
  onBlockChange,
}: ContactDetailSideOverProps) {
  const [details, setDetails] = useState<ChatDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockLoading, setBlockLoading] = useState(false);
  const [showAddToAgendaName, setShowAddToAgendaName] = useState(false);
  const [addToAgendaName, setAddToAgendaName] = useState("");
  const [addToAgendaLoading, setAddToAgendaLoading] = useState(false);

  const apiHeaders = useMemo(
    () => (companySlug ? { "X-Company-Slug": companySlug } : undefined),
    [companySlug]
  );

  const fetchDetails = useCallback(() => {
    if (!contact) return;
    setLoading(true);
    setError(null);
    setDetails(null);
    const number = numberForApi(contact);
    fetch("/api/contacts/chat-details", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...apiHeaders },
      body: JSON.stringify({ channel_id: contact.channel_id, number, preview: true }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (r.ok) setDetails(data);
        else setError(data?.error ?? "Falha ao carregar detalhes");
      })
      .catch(() => setError("Erro de rede"))
      .finally(() => setLoading(false));
  }, [contact, apiHeaders]);

  useEffect(() => {
    if (open && contact) {
      setImageError(false);
      fetchDetails();
    } else if (!open) {
      setDetails(null);
      setError(null);
      setImageError(false);
    }
  }, [open, contact, fetchDetails]);

  const handleBlockToggle = async () => {
    if (!contact) return;
    setBlockLoading(true);
    try {
      const r = await fetch("/api/contacts/block", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({
          channel_id: contact.channel_id,
          number: numberForApi(contact),
          block: !details?.wa_isBlocked,
        }),
      });
      if (r.ok) {
        setDetails((d) => (d ? { ...d, wa_isBlocked: !d.wa_isBlocked } : d));
        onBlockChange?.();
      }
    } finally {
      setBlockLoading(false);
    }
  };

  const displayName =
    details?.name ?? details?.wa_name ?? details?.wa_contactName ?? contact?.contact_name ?? contact?.first_name ?? "—";
  const displayPhone = details?.phone ?? contact?.phone ?? contact?.jid ?? "—";
  const imageUrl = details?.imagePreview ?? details?.image ?? contact?.avatar_url?.trim() ?? null;
  const [imageError, setImageError] = useState(false);
  const showImage = imageUrl && !imageError;
  const imageSrc =
    showImage && imageUrl
      ? imageUrl.startsWith("http://") || imageUrl.startsWith("https://")
        ? `/api/contacts/avatar?url=${encodeURIComponent(imageUrl)}`
        : imageUrl
      : null;

  const handleAddToAgenda = async () => {
    if (!contact) return;
    const nameToUse = addToAgendaName.trim() || numberForApi(contact);
    setAddToAgendaLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/contacts/add-to-agenda", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({
          channel_id: contact.channel_id,
          number: numberForApi(contact),
          name: nameToUse,
        }),
      });
      if (r.ok) {
        setShowAddToAgendaName(false);
        setAddToAgendaName("");
        onBlockChange?.();
      } else {
        const data = await r.json();
        setError(data?.error ?? "Falha ao adicionar à agenda");
      }
    } finally {
      setAddToAgendaLoading(false);
    }
  };

  const handleRemoveFromAgenda = async () => {
    if (!contact) return;
    setBlockLoading(true);
    try {
      const r = await fetch("/api/contacts/remove-from-agenda", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({
          channel_id: contact.channel_id,
          number: numberForApi(contact),
        }),
      });
      if (r.ok) onBlockChange?.();
      else {
        const data = await r.json();
        setError(data?.error ?? "Falha ao remover da agenda");
      }
    } finally {
      setBlockLoading(false);
    }
  };

  return (
    <SideOver open={open} onClose={onClose} title="Detalhes do contato" width={640}>
      {!contact ? (
        <p className="text-sm text-[#64748B]">Nenhum contato selecionado.</p>
      ) : (
        <div className="space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-clicvend-orange" />
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {error}
            </div>
          )}
          {!loading && (details || !error) && (
            <>
              <div className="flex flex-col items-center gap-3 border-b border-[#E2E8F0] pb-4">
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full bg-[#E2E8F0]">
                  {imageSrc ? (
                    <img
                      src={imageSrc}
                      alt=""
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={() => setImageError(true)}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-3xl text-[#94A3B8]">
                      <User className="h-12 w-12" />
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <p className="font-semibold text-[#1E293B]">{displayName}</p>
                  <p className="text-sm text-[#64748B]">{displayPhone}</p>
                  <p className="mt-1 text-xs text-[#94A3B8]">{channelName}</p>
                  {details && (
                    <div className="mt-4 w-full flex justify-center">
                      <div className="inline-flex rounded-xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
                        <button
                          type="button"
                          onClick={handleBlockToggle}
                          disabled={blockLoading}
                          className={`inline-flex flex-1 items-center justify-center gap-2 min-w-0 px-4 py-3 text-sm font-medium transition-all border-r border-[#E2E8F0] last:border-r-0 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-clicvend-orange ${
                            details.wa_isBlocked
                              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 active:bg-emerald-200"
                              : "bg-red-50 text-red-700 hover:bg-red-100 active:bg-red-200"
                          } disabled:opacity-60 disabled:pointer-events-none`}
                        >
                          {blockLoading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Ban className="h-4 w-4 shrink-0" />}
                          <span className="truncate">{details.wa_isBlocked ? "Desbloquear" : "Bloquear"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAddToAgendaName(
                              (contact?.contact_name || contact?.first_name || contact?.phone || numberForApi(contact!)).trim() || numberForApi(contact!)
                            );
                            setShowAddToAgendaName(true);
                          }}
                          disabled={blockLoading}
                          className="inline-flex flex-1 items-center justify-center gap-2 min-w-0 px-4 py-3 text-sm font-medium text-emerald-800 bg-emerald-50/80 hover:bg-emerald-100 border-r border-[#E2E8F0] last:border-r-0 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-clicvend-orange transition-all active:bg-emerald-200 disabled:opacity-60 disabled:pointer-events-none"
                        >
                          <UserPlus className="h-4 w-4 shrink-0 text-emerald-600" />
                          <span className="truncate">Adicionar à agenda</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleRemoveFromAgenda}
                          disabled={blockLoading}
                          className="inline-flex flex-1 items-center justify-center gap-2 min-w-0 px-4 py-3 text-sm font-medium text-[#64748B] bg-[#F8FAFC] hover:bg-[#F1F5F9] border-r border-[#E2E8F0] last:border-r-0 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-clicvend-orange transition-all active:bg-[#E2E8F0] disabled:opacity-60 disabled:pointer-events-none"
                        >
                          <UserMinus className="h-4 w-4 shrink-0 text-[#64748B]" />
                          <span className="truncate">Remover da agenda</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {showAddToAgendaName && contact && (
                <div className="border-t border-[#E2E8F0] pt-4">
                  <p className="text-sm font-medium text-[#334155] mb-2">Nome para salvar no celular</p>
                  <p className="text-xs text-[#64748B] mb-2">Esse nome aparecerá na agenda do WhatsApp para você localizar o contato.</p>
                  <input
                    type="text"
                    value={addToAgendaName}
                    onChange={(e) => setAddToAgendaName(e.target.value)}
                    placeholder="Ex: João Silva - Vendas"
                    className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
                    autoFocus
                  />
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setShowAddToAgendaName(false); setAddToAgendaName(""); }}
                      className="flex-1 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleAddToAgenda}
                      disabled={addToAgendaLoading}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {addToAgendaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Adicionar à agenda
                    </button>
                  </div>
                </div>
              )}
              {details && (
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    Outras informações <span className="font-normal normal-case">(dados do WhatsApp /chat/details)</span>
                  </h3>
                  <dl className="space-y-2 text-sm">
                    {(() => {
                      const skip = new Set(["name", "wa_name", "wa_contactName", "phone", "image", "imagePreview"]);
                      const entries = Object.entries(details).filter(
                        ([k, v]) => !skip.has(k) && v !== undefined && v !== null && v !== ""
                      );
                      return entries.map(([key, value]) => {
                        const label = DETAIL_LABELS[key] ?? key;
                        let display: string;
                        if (typeof value === "boolean") display = value ? "Sim" : "Não";
                        else if (Array.isArray(value)) display = value.join(", ");
                        else if (typeof value === "number" && (key.includes("Timestamp") || key.includes("At") || key.includes("Time") || key.includes("Expiration"))) {
                          try {
                            display = value > 0 ? new Date(value).toLocaleString("pt-BR") : "—";
                          } catch {
                            display = String(value);
                          }
                        } else if (typeof value === "object") display = JSON.stringify(value);
                        else display = String(value);
                        return (
                          <div key={key}>
                            <dt className="text-[#64748B]">{label}</dt>
                            <dd className="font-medium text-[#1E293B] break-words whitespace-pre-wrap">{display}</dd>
                          </div>
                        );
                      });
                    })()}
                  </dl>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </SideOver>
  );
}
