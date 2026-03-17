"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { SideOver } from "@/components/SideOver";
import { Loader2, User, Ban, UserPlus, UserMinus, MessageCircle, Save } from "lucide-react";

export type Contact = {
  id: string;
  channel_id: string;
  jid: string;
  phone: string | null;
  contact_name: string | null;
  first_name: string | null;
  avatar_url?: string | null;
  queue_names?: string[];
  tag_names?: string[];
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
  wa_common_groups: "Grupos em comum",
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
  onTagsSaved?: (contactId: string, tagNames: string[]) => void;
  onOpenChat?: (contact: Contact) => void;
};

function numberForApi(contact: Contact): string {
  const digits = (contact.phone ?? "").replace(/\D/g, "").trim();
  if (digits) return digits;
  const jid = (contact.jid ?? "").trim();
  return jid.replace(/@.*$/, "").trim() || jid;
}

/** Corrige Brasil: DDD+0+8 dígitos → DDD+9+8 (celular). */
function fixBrazilMobileZero(d: string): string {
  if (d.length === 11 && !d.startsWith("55")) {
    const ddd = d.slice(0, 2);
    const rest = d.slice(2);
    if (/^\d{2}$/.test(ddd) && rest.length >= 9 && rest[0] === "0") return ddd + "9" + rest.slice(1, 9);
  }
  if (d.length === 13 && d.startsWith("55")) {
    const after55 = d.slice(2);
    if (after55.length >= 9 && after55[2] === "0") {
      const ddd = after55.slice(0, 2);
      const rest = after55.slice(2, 11);
      if (/^\d{2}$/.test(ddd) && rest[0] === "0") return "55" + ddd + "9" + rest.slice(1);
    }
  }
  return d;
}
/** Formata número para exibição Brasil. */
function formatPhoneBrazil(raw: string | null | undefined): string {
  let s = (raw ?? "").trim().replace(/\D/g, "");
  if (!s) return "—";
  s = fixBrazilMobileZero(s);
  const withCountry = s.length >= 12 && s.startsWith("55");
  const digits = withCountry ? s.slice(2) : s;
  if (digits.length >= 10) {
    const ddd = digits.slice(0, 2);
    const rest = digits.slice(2);
    if (rest.length >= 9 && rest[0] === "9") {
      return `(${ddd}) ${rest.slice(0, 1)} ${rest.slice(1, 6)}-${rest.slice(6, 10)}`;
    }
    if (rest.length >= 8) {
      return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4, 8)}`;
    }
  }
  if (s.length <= 14) return s;
  return s.slice(0, 14) + "…";
}

export function ContactDetailSideOver({
  open,
  onClose,
  contact,
  channelName,
  companySlug,
  onBlockChange,
  onTagsSaved,
  onOpenChat,
}: ContactDetailSideOverProps) {
  const [details, setDetails] = useState<ChatDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockLoading, setBlockLoading] = useState(false);
  const [showAddToAgendaName, setShowAddToAgendaName] = useState(false);
  const [addToAgendaName, setAddToAgendaName] = useState("");
  const [addToAgendaLoading, setAddToAgendaLoading] = useState(false);
  const [tagLoading, setTagLoading] = useState(false);
  const [availableTags, setAvailableTags] = useState<
    { id: string; name: string; color_hex: string | null; category_name: string; active: boolean }[]
  >([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [savingTags, setSavingTags] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [savingContact, setSavingContact] = useState(false);

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
      setEditName((contact.contact_name || contact.first_name || "").trim());
      setEditPhone((contact.phone || "").replace(/\D/g, ""));
    } else if (!open) {
      setDetails(null);
      setError(null);
      setImageError(false);
      setAvailableTags([]);
      setSelectedTagIds(new Set());
      setEditName("");
      setEditPhone("");
    }
  }, [open, contact, fetchDetails]);

  // Carrega tags de contato para este contato específico
  useEffect(() => {
    const loadTags = async () => {
      if (!open || !contact) return;
      setTagLoading(true);
      try {
        const params = new URLSearchParams({ channel_contact_id: contact.id });
        const r = await fetch(`/api/contact-tags?${params.toString()}`, {
          credentials: "include",
          headers: apiHeaders,
        });
        const data = await r.json();
        if (r.ok && data && Array.isArray(data.tags)) {
          setAvailableTags(
            data.tags.map((t: any) => ({
              id: t.id as string,
              name: t.name as string,
              color_hex: (t.color_hex as string | null) ?? null,
              category_name: (t.category_name as string) ?? "",
              active: t.active !== false,
            }))
          );
          const initialSelected = Array.isArray(data.selected_tag_ids)
            ? new Set<string>(data.selected_tag_ids as string[])
            : new Set<string>();
          setSelectedTagIds(initialSelected);
        } else {
          setAvailableTags([]);
          setSelectedTagIds(new Set());
        }
      } catch {
        setAvailableTags([]);
        setSelectedTagIds(new Set());
      } finally {
        setTagLoading(false);
      }
    };
    loadTags();
  }, [open, contact, apiHeaders]);

  const toggleTag = (id: string) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSaveTags = async () => {
    if (!contact) return;
    setSavingTags(true);
    try {
      const r = await fetch("/api/contact-tags", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({
          channel_contact_id: contact.id,
          tag_ids: Array.from(selectedTagIds),
        }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => null);
        setError(data?.error ?? "Falha ao salvar tags do contato");
      } else {
        const selectedNames = availableTags
          .filter((t) => selectedTagIds.has(t.id))
          .map((t) => t.name);
        onTagsSaved?.(contact.id, selectedNames);
      }
    } finally {
      setSavingTags(false);
    }
  };

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
  /** Preferir sempre o número salvo no contato (lista); a API pode retornar formato errado */
  const formattedPhone = formatPhoneBrazil(contact?.phone ?? contact?.jid);
  const displayPhone = formattedPhone !== "—" ? formattedPhone : (details?.phone ?? contact?.jid ?? "—");
  /** Preferir a foto já salva do contato (mesma da lista); só usar UAZAPI se não tiver */
  const imageUrl = (contact?.avatar_url?.trim() || details?.imagePreview || details?.image || null) || null;
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

  const handleSaveContact = async () => {
    if (!contact) return;
    setSavingContact(true);
    setError(null);
    try {
      const r = await fetch(`/api/contacts/${encodeURIComponent(contact.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({
          contact_name: editName.trim() || null,
          first_name: editName.trim() || null,
          phone: editPhone.trim() || null,
        }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) {
        setError(data?.error ?? "Falha ao salvar contato");
        return;
      }
      onBlockChange?.();
    } finally {
      setSavingContact(false);
    }
  };

  return (
    <SideOver open={open} onClose={onClose} title="Detalhes do contato" width={640}>
      {!contact ? (
        <p className="text-sm text-[#64748B]">Nenhum contato selecionado.</p>
      ) : (
        <div className="space-y-4">
          {loading && (
            <div className="flex justify-center py-2">
              <span className="inline-flex items-center gap-2 text-sm text-[#64748B]">
                <Loader2 className="h-4 w-4 animate-spin text-clicvend-orange" />
                Buscando detalhes no WhatsApp…
              </span>
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {error}
            </div>
          )}
          {contact && (
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
                          onClick={() => onOpenChat?.(contact)}
                          className="inline-flex flex-1 items-center justify-center gap-2 min-w-0 px-4 py-3 text-sm font-medium text-[#334155] bg-[#F8FAFC] hover:bg-[#F1F5F9] border-r border-[#E2E8F0] last:border-r-0 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-clicvend-orange transition-all"
                        >
                          <MessageCircle className="h-4 w-4 shrink-0" />
                          <span className="truncate">Abrir chat</span>
                        </button>
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
              {/* Tags do contato */}
              <div className="border-t border-[#E2E8F0] pt-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-[#334155]">Editar contato salvo</p>
                    <p className="text-xs text-[#64748B]">Atualize nome e telefone deste contato na lista.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveContact}
                    disabled={savingContact}
                    className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-3 py-1.5 text-xs font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
                  >
                    {savingContact ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Salvar contato
                  </button>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#64748B]">Nome</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      maxLength={120}
                      className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#64748B]">Telefone</label>
                    <input
                      type="text"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, ""))}
                      maxLength={20}
                      className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                    />
                  </div>
                </div>
              </div>

              {/* Tags do contato */}
              <div className="border-t border-[#E2E8F0] pt-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-[#334155]">Tags do contato</p>
                    <p className="text-xs text-[#64748B]">
                      Use tags para classificar o tipo de contato.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveTags}
                    disabled={savingTags || tagLoading}
                    className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-3 py-1.5 text-xs font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
                  >
                    {savingTags ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Salvar
                  </button>
                </div>
                {tagLoading ? (
                  <div className="flex items-center gap-2 text-xs text-[#64748B]">
                    <Loader2 className="h-3 w-3 animate-spin text-clicvend-orange" />
                    Carregando tags…
                  </div>
                ) : availableTags.length === 0 ? (
                  <p className="text-xs text-[#94A3B8]">
                    Nenhuma tag de contato cadastrada ainda. Crie em{" "}
                    <span className="font-medium">Tags e formulários</span>.
                  </p>
                ) : (
                  <>
                    <div className="mb-2 flex flex-wrap gap-2">
                      {availableTags.map((tag) => (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleTag(tag.id)}
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                            selectedTagIds.has(tag.id)
                              ? "border-transparent text-white"
                              : "border-[#E2E8F0] text-[#475569] bg-white hover:bg-[#F8FAFC]"
                          }`}
                          style={
                            selectedTagIds.has(tag.id) && tag.color_hex
                              ? { backgroundColor: tag.color_hex }
                              : undefined
                          }
                        >
                          <span className="truncate">{tag.name}</span>
                        </button>
                      ))}
                    </div>
                    {selectedTagIds.size > 0 && (
                      <div className="rounded-lg border border-[#E2E8F0] bg-white">
                        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-3 py-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                            Tags atribuídas ({selectedTagIds.size})
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedTagIds(new Set())}
                            className="text-[11px] font-medium text-[#64748B] hover:text-[#0F172A]"
                          >
                            Limpar
                          </button>
                        </div>
                        <div className="divide-y divide-[#F1F5F9]">
                          {availableTags
                            .filter((t) => selectedTagIds.has(t.id))
                            .map((tag) => (
                              <div
                                key={tag.id}
                                className="flex items-center justify-between px-3 py-2 text-xs"
                              >
                                <div className="flex items-center gap-2">
                                  <span
                                    className="h-2 w-2 rounded-full"
                                    style={{
                                      backgroundColor: tag.color_hex || "#CBD5F5",
                                    }}
                                  />
                                  <span className="font-medium text-[#0F172A]">
                                    {tag.name}
                                  </span>
                                </div>
                                <span className="text-[11px] uppercase tracking-wide text-[#94A3B8]">
                                  {tag.category_name}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
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
                  <dl className="space-y-2 text-sm">
                    {(() => {
                      const skip = new Set([
                        "name",
                        "wa_name",
                        "wa_contactName",
                        "phone",
                        "image",
                        "imagePreview",
                        "id",
                        "owner",
                        "wa_fastid",
                        "wa_chatid",
                        "wa_chatlid",
                        "lead_tags",
                        "wa_label",
                      ]);
                      const entries = Object.entries(details).filter(
                        ([k, v]) =>
                          !skip.has(k) &&
                          !k.toLowerCase().endsWith("_id") &&
                          v !== undefined &&
                          v !== null &&
                          v !== ""
                      );
                      if (entries.length === 0) {
                        return (
                          <p className="text-xs text-[#94A3B8]">
                            Sem informações adicionais relevantes para exibir.
                          </p>
                        );
                      }
                      return entries.map(([key, value]) => {
                        const label = DETAIL_LABELS[key] ?? key;
                        let display: string;
                        let listDisplay: string[] | null = null;
                        if (typeof value === "boolean") display = value ? "Sim" : "Não";
                        else if (Array.isArray(value)) {
                          listDisplay = value.map((v) => String(v)).filter(Boolean);
                          display = listDisplay.join(", ");
                        }
                        else if (typeof value === "number" && (key.includes("Timestamp") || key.includes("At") || key.includes("Time") || key.includes("Expiration"))) {
                          try {
                            display = value > 0 ? new Date(value).toLocaleString("pt-BR") : "—";
                          } catch {
                            display = String(value);
                          }
                        } else if (typeof value === "object") display = JSON.stringify(value);
                        else {
                          display = String(value);
                          if (key === "common_groups" || key === "wa_common_groups") {
                            listDisplay = display
                              .split(/\s*,\s*|\n+/)
                              .map((item) => item.replace(/\(.*?\)/g, "").trim())
                              .filter(Boolean);
                          }
                        }
                        return (
                          <div key={key}>
                            <dt className="text-[#64748B]">{label}</dt>
                            <dd className="font-medium text-[#1E293B] break-words whitespace-pre-wrap">
                              {listDisplay && listDisplay.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {listDisplay.map((item, idx) => (
                                    <span
                                      key={`${key}-${idx}`}
                                      className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700"
                                    >
                                      {item}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                display
                              )}
                            </dd>
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
