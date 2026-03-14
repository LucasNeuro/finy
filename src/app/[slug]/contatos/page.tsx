"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { RefreshCw, Users, MessageCircle, Loader2, Plug, Eye, Trash2, ChevronLeft, ChevronRight, Ban, Unlock, X, User, Settings, Copy, Plus, Download, Upload } from "lucide-react";
import Link from "next/link";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SideOver } from "@/components/SideOver";
import { ContactDetailSideOver, type Contact } from "./ContactDetailSideOver";
import { GroupDetailSideOver, type Group } from "./GroupDetailSideOver";
import { GroupManageSideOver } from "./GroupManageSideOver";
import { CreateCommunitySideOver } from "./CreateCommunitySideOver";
import { CreateGroupSideOver } from "./CreateGroupSideOver";

type Channel = { id: string; name: string };

const PAGE_SIZE = 150;

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
/** Formata número para exibição: (DDD) 9 00000-0000. Aceita dígitos puros ou jid. */
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

function canonicalContactDigits(phone: string | null | undefined, jid: string | null | undefined): string | null {
  const phoneDigits = (phone ?? "").replace(/\D/g, "").trim();
  const jidDigits = (jid ?? "").replace(/@.*$/, "").replace(/\D/g, "").trim();
  const digits = phoneDigits || jidDigits;
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return digits;
  return digits;
}

/** URL de avatar: se for externa (http/https), usa proxy para evitar CORS/referrer e permitir cache. */
function avatarSrc(avatarUrl: string | null): string | null {
  if (!avatarUrl?.trim()) return null;
  const u = avatarUrl.trim();
  if (u.startsWith("http://") || u.startsWith("https://")) {
    return `/api/contacts/avatar?url=${encodeURIComponent(u)}`;
  }
  return u;
}

function ContactListAvatar({ avatarUrl, name }: { avatarUrl: string | null; name: string }) {
  const [error, setError] = useState(false);
  const src = avatarSrc(avatarUrl);
  const showImg = src && !error;
  const initial = (name || " ").slice(0, 1).toUpperCase();
  return (
    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[#E2E8F0] flex items-center justify-center text-sm font-semibold text-[#64748B]">
      {showImg ? (
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setError(true)}
        />
      ) : (
        <span aria-hidden>{initial || <User className="h-5 w-5 text-[#94A3B8]" />}</span>
      )}
    </div>
  );
}

function AddToAgendaModal({
  open,
  onClose,
  contacts,
  apiHeaders,
  channelName,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  contacts: Contact[];
  apiHeaders: Record<string, string> | undefined;
  channelName: (id: string) => string;
  onSuccess: () => void;
}) {
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && contacts.length > 0) {
      const initial: Record<string, string> = {};
      contacts.forEach((c) => {
        const def = (c.contact_name || c.first_name || c.phone || c.jid?.replace(/@.*$/, "") || "").trim() || c.jid || "";
        initial[c.id] = def;
      });
      setNames(initial);
      setError(null);
    }
  }, [open, contacts]);

  if (!open) return null;

  const handleSubmit = async () => {
    const invalid = contacts.some((c) => !(names[c.id] ?? "").trim());
    if (invalid) {
      setError("Preencha o nome para salvar em todos os contatos.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await Promise.all(
        contacts.map((c) => {
          const number = (c.phone ?? c.jid ?? "").replace(/\D/g, "") || c.jid.replace(/@.*$/, "");
          const name = (names[c.id] ?? "").trim() || number;
          return fetch("/api/contacts/add-to-agenda", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json", ...apiHeaders },
            body: JSON.stringify({ channel_id: c.channel_id, number, name }),
          });
        })
      );
      onSuccess();
      onClose();
    } catch {
      setError("Erro ao adicionar à agenda. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="add-agenda-title">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-lg rounded-xl bg-white shadow-xl border border-[#E2E8F0] overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-[#E2E8F0]">
          <h2 id="add-agenda-title" className="text-lg font-semibold text-[#1E293B]">
            Como salvar na agenda do celular?
          </h2>
          <p className="mt-1 text-sm text-[#64748B]">
            O nome abaixo será o que aparece nos contatos do WhatsApp. Edite para encontrar o contato mais fácil depois.
          </p>
        </div>
        <div className="p-4 overflow-y-auto flex-1 min-h-0 space-y-3">
          {contacts.map((c) => (
            <div key={c.id} className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[#64748B]">
                {c.phone || c.jid?.replace(/@.*$/, "") || c.jid} · {channelName(c.channel_id)}
              </label>
              <input
                type="text"
                value={names[c.id] ?? ""}
                onChange={(e) => setNames((prev) => ({ ...prev, [c.id]: e.target.value }))}
                placeholder="Nome para salvar"
                maxLength={100}
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              />
            </div>
          ))}
        </div>
        {error && (
          <div className="px-4 pb-2">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
        <div className="p-4 border-t border-[#E2E8F0] flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC] disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Adicionar à agenda
          </button>
        </div>
      </div>
    </div>
  );
}

function BlockedRow({
  jid,
  channelId,
  contactInfo,
  apiHeaders,
  onUnblock,
  selected,
  onToggleSelect,
}: {
  jid: string;
  channelId: string;
  contactInfo: { contact_name: string | null; first_name: string | null; phone: string | null; avatar_url?: string | null } | null;
  apiHeaders: Record<string, string> | undefined;
  onUnblock: () => void;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const number = jid.replace(/@s\.whatsapp\.net$/, "");
  const displayName = contactInfo
    ? (contactInfo.contact_name || contactInfo.first_name || "").trim() || "—"
    : "—";
  const displayPhone = contactInfo?.phone?.trim() || number || jid;
  const avatarSrcRes = avatarSrc(contactInfo?.avatar_url?.trim() || null);
  const handleUnblock = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/contacts/block", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ channel_id: channelId, number, block: false }),
      });
      if (r.ok) onUnblock();
    } finally {
      setLoading(false);
    }
  };
  return (
    <tr className="border-b border-[#E2E8F0] hover:bg-[#F8FAFC]">
      {onToggleSelect != null && (
        <td className="px-4 py-3 w-10">
          <input
            type="checkbox"
            checked={selected ?? false}
            onChange={onToggleSelect}
            className="h-4 w-4 rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
            aria-label={displayName !== "—" ? `Selecionar ${displayName}` : "Selecionar bloqueado"}
          />
        </td>
      )}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[#E2E8F0] flex items-center justify-center">
            {avatarSrcRes ? (
              <img src={avatarSrcRes} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <User className="h-5 w-5 text-[#94A3B8]" />
            )}
          </div>
          <div>
        <div className="font-medium text-[#1E293B]">{displayName}</div>
        <div className="text-sm text-[#64748B]">{displayPhone}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          onClick={handleUnblock}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9] hover:text-clicvend-orange disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : <Unlock className="h-4 w-4 shrink-0" />}
          Desbloquear
        </button>
      </td>
    </tr>
  );
}

function GroupsManageActions({
  channelId,
  channelName,
  contacts,
  groups,
  apiHeaders,
  onSuccess,
  setAlertMessage,
}: {
  channelId: string;
  channelName: string;
  contacts: Contact[];
  groups: Group[];
  apiHeaders: Record<string, string> | undefined;
  onSuccess: () => void;
  setAlertMessage: (msg: string | null) => void;
}) {
  const [createName, setCreateName] = useState("");
  const [selectedParticipants, setSelectedParticipants] = useState<Contact[]>([]);
  const [participantSearch, setParticipantSearch] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [communityName, setCommunityName] = useState("");
  const [communityLoading, setCommunityLoading] = useState(false);
  const [editCommunityJid, setEditCommunityJid] = useState("");
  const [editCommunityAction, setEditCommunityAction] = useState<"add" | "remove">("add");
  const [editCommunityGroupJids, setEditCommunityGroupJids] = useState<string[]>([]);
  const [editCommunityLoading, setEditCommunityLoading] = useState(false);
  const channelGroups = groups.filter((g) => g.channel_id === channelId);

  const channelContacts = contacts.filter((c) => c.channel_id === channelId);
  const participantSearchLower = participantSearch.trim().toLowerCase();
  const availableContacts = channelContacts.filter(
    (c) =>
      !selectedParticipants.some((p) => p.id === c.id) &&
      (!participantSearchLower ||
        (c.contact_name?.toLowerCase().includes(participantSearchLower) ||
          c.first_name?.toLowerCase().includes(participantSearchLower) ||
          c.phone?.toLowerCase().includes(participantSearchLower) ||
          c.jid?.toLowerCase().includes(participantSearchLower)))
  );
  const addParticipant = (contact: Contact) => {
    if (selectedParticipants.some((p) => p.id === contact.id || p.jid === contact.jid)) return;
    setSelectedParticipants((prev) => [...prev, contact]);
  };
  const removeParticipant = (id: string) => {
    setSelectedParticipants((prev) => prev.filter((p) => p.id !== id));
  };
  const getNumber = (c: Contact) => c.phone?.replace(/\D/g, "") || c.jid.replace(/@.*$/, "").replace(/\D/g, "") || "";

  const handleCreate = async () => {
    const name = createName.trim();
    const participants = selectedParticipants.map(getNumber).filter(Boolean);
    if (!name) {
      setAlertMessage("Informe o nome do grupo.");
      return;
    }
    if (participants.length === 0) {
      setAlertMessage("Adicione pelo menos um participante pelo dropdown acima.");
      return;
    }
    setCreateLoading(true);
    try {
      const r = await fetch("/api/groups/create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ channel_id: channelId, name, participants }),
      });
      const data = await r.json();
      if (r.ok) {
        setCreateName("");
        setSelectedParticipants([]);
        onSuccess();
        setAlertMessage("Grupo criado com sucesso.");
      } else {
        setAlertMessage(data?.error ?? "Falha ao criar grupo.");
      }
    } catch {
      setAlertMessage("Erro de rede ao criar grupo.");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleJoin = async () => {
    const code = joinCode.trim();
    if (!code) {
      setAlertMessage("Informe o link ou código de convite.");
      return;
    }
    setJoinLoading(true);
    try {
      const r = await fetch("/api/groups/join", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ channel_id: channelId, invitecode: code }),
      });
      const data = await r.json();
      if (r.ok) {
        setJoinCode("");
        onSuccess();
        setAlertMessage("Entrada no grupo realizada com sucesso.");
      } else {
        setAlertMessage(data?.error ?? "Falha ao entrar no grupo.");
      }
    } catch {
      setAlertMessage("Erro de rede ao entrar no grupo.");
    } finally {
      setJoinLoading(false);
    }
  };

  const handleCreateCommunity = async () => {
    const name = communityName.trim();
    if (!name) {
      setAlertMessage("Informe o nome da comunidade.");
      return;
    }
    setCommunityLoading(true);
    try {
      const r = await fetch("/api/communities/create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ channel_id: channelId, name }),
      });
      const data = await r.json();
      if (r.ok) {
        setCommunityName("");
        onSuccess();
        setAlertMessage("Comunidade criada com sucesso.");
      } else {
        setAlertMessage(data?.error ?? "Falha ao criar comunidade.");
      }
    } catch {
      setAlertMessage("Erro de rede ao criar comunidade.");
    } finally {
      setCommunityLoading(false);
    }
  };

  const handleEditCommunityGroups = async () => {
    const community = editCommunityJid.trim();
    if (!community || !community.endsWith("@g.us")) {
      setAlertMessage("Selecione a comunidade (JID).");
      return;
    }
    if (editCommunityGroupJids.length === 0) {
      setAlertMessage("Selecione ao menos um grupo.");
      return;
    }
    setEditCommunityLoading(true);
    try {
      const r = await fetch("/api/communities/edit-groups", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({
          channel_id: channelId,
          community,
          action: editCommunityAction,
          groupjids: editCommunityGroupJids,
        }),
      });
      const data = await r.json();
      if (r.ok) {
        setEditCommunityGroupJids([]);
        onSuccess();
        setAlertMessage(data?.failed?.length ? `Concluído. Alguns grupos falharam: ${data.failed.join(", ")}` : "Comunidade atualizada.");
      } else {
        setAlertMessage(data?.error ?? "Falha ao atualizar comunidade.");
      }
    } catch {
      setAlertMessage("Erro de rede.");
    } finally {
      setEditCommunityLoading(false);
    }
  };

  const toggleEditCommunityGroup = (jid: string) => {
    setEditCommunityGroupJids((prev) =>
      prev.includes(jid) ? prev.filter((j) => j !== jid) : [...prev, jid]
    );
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4">
        <h3 className="text-sm font-semibold text-[#1E293B] mb-3">Criar novo grupo</h3>
        <p className="text-xs text-[#64748B] mb-3">Conexão: {channelName}</p>
        <input
          type="text"
          value={createName}
          onChange={(e) => setCreateName(e.target.value)}
          placeholder="Nome do grupo (1–100 caracteres)"
          maxLength={100}
          className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#1E293B] mb-3"
        />
        <label className="block text-xs font-medium text-[#64748B] mb-1.5">Participantes (contatos da instância)</label>
        <input
          type="search"
          value={participantSearch}
          onChange={(e) => setParticipantSearch(e.target.value)}
          placeholder="Buscar contato por nome ou telefone..."
          className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#1E293B] mb-2"
        />
        <select
          value=""
          onChange={(e) => {
            const id = e.target.value;
            if (!id) return;
            const c = channelContacts.find((x) => x.id === id);
            if (c) addParticipant(c);
            e.target.value = "";
          }}
          className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#1E293B] mb-2"
        >
          <option value="">
            {availableContacts.length === 0 && channelContacts.length > 0
              ? "Nenhum contato encontrado para a busca"
              : "Selecione um contato para adicionar"}
          </option>
          {availableContacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.contact_name || c.first_name || c.phone || c.jid}
              {c.phone ? ` (${c.phone})` : ""}
            </option>
          ))}
        </select>
        {channelContacts.length === 0 && (
          <p className="text-xs text-amber-600 mb-2">Nenhum contato nesta conexão. Sincronize contatos na aba Contatos primeiro.</p>
        )}
        {selectedParticipants.length > 0 && (
          <div className="rounded-lg border border-[#E2E8F0] bg-white overflow-hidden mb-3 max-h-[180px] overflow-y-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-[#F8FAFC]">
                <tr className="border-b border-[#E2E8F0]">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-[#64748B]">Nome</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-[#64748B]">Telefone</th>
                  <th className="px-3 py-2 w-10 text-right text-xs font-semibold text-[#64748B]"></th>
                </tr>
              </thead>
              <tbody>
                {selectedParticipants.map((c) => (
                  <tr key={c.id} className="border-b border-[#E2E8F0] last:border-0 hover:bg-[#F8FAFC]">
                    <td className="px-3 py-2 text-[#1E293B]">{c.contact_name || c.first_name || "—"}</td>
                    <td className="px-3 py-2 text-[#64748B]">{c.phone || c.jid}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeParticipant(c.id)}
                        className="rounded p-1 text-[#64748B] hover:bg-red-50 hover:text-red-600"
                        title="Remover"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button
          type="button"
          onClick={handleCreate}
          disabled={createLoading}
          className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
        >
          {createLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Criar grupo
        </button>
      </div>
      <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4">
        <h3 className="text-sm font-semibold text-[#1E293B] mb-3">Entrar em grupo por convite</h3>
        <p className="text-xs text-[#64748B] mb-3">Conexão: {channelName}</p>
        <input
          type="text"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
          placeholder="Link (https://chat.whatsapp.com/...) ou código do convite"
          className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#1E293B] mb-3"
        />
        <button
          type="button"
          onClick={handleJoin}
          disabled={joinLoading}
          className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
        >
          {joinLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Entrar no grupo
        </button>
      </div>
      <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4">
        <h3 className="text-sm font-semibold text-[#1E293B] mb-3">Criar comunidade</h3>
        <p className="text-xs text-[#64748B] mb-3">Conexão: {channelName}</p>
        <input
          type="text"
          value={communityName}
          onChange={(e) => setCommunityName(e.target.value)}
          placeholder="Nome da comunidade"
          maxLength={100}
          className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#1E293B] mb-3"
        />
        <button
          type="button"
          onClick={handleCreateCommunity}
          disabled={communityLoading}
          className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
        >
          {communityLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Criar comunidade
        </button>
      </div>
      <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4 md:col-span-2">
        <h3 className="text-sm font-semibold text-[#1E293B] mb-3">Gerenciar grupos em uma comunidade</h3>
        <p className="text-xs text-[#64748B] mb-3">Conexão: {channelName}</p>
        <div className="grid gap-3 sm:grid-cols-2 mb-3">
          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1">Comunidade (JID)</label>
            <select
              value={editCommunityJid}
              onChange={(e) => setEditCommunityJid(e.target.value)}
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#1E293B]"
            >
              <option value="">Selecione a comunidade</option>
              {channelGroups.map((g) => (
                <option key={g.jid} value={g.jid}>{g.name ?? g.jid}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1">Ação</label>
            <select
              value={editCommunityAction}
              onChange={(e) => setEditCommunityAction(e.target.value as "add" | "remove")}
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#1E293B]"
            >
              <option value="add">Adicionar grupos à comunidade</option>
              <option value="remove">Remover grupos da comunidade</option>
            </select>
          </div>
        </div>
        <label className="block text-xs font-medium text-[#64748B] mb-1">Grupos selecionados ({editCommunityGroupJids.length})</label>
        <div className="max-h-32 overflow-y-auto rounded-lg border border-[#E2E8F0] bg-white p-2 mb-3">
          {channelGroups.filter((g) => g.jid !== editCommunityJid).map((g) => (
            <label key={g.jid} className="flex items-center gap-2 py-1 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={editCommunityGroupJids.includes(g.jid)}
                onChange={() => toggleEditCommunityGroup(g.jid)}
                className="rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
              />
              {g.name ?? g.jid}
            </label>
          ))}
          {channelGroups.length <= 1 && <p className="text-xs text-[#64748B]">Nenhum outro grupo nesta conexão para vincular.</p>}
        </div>
        <button
          type="button"
          onClick={handleEditCommunityGroups}
          disabled={editCommunityLoading || !editCommunityJid || editCommunityGroupJids.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
        >
          {editCommunityLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Aplicar
        </button>
      </div>
    </div>
  );
}

export default function ContatosPage() {
  const pathname = usePathname();
  const slug = pathname?.split("/").filter(Boolean)[0] ?? "";
  const apiHeaders = slug ? { "X-Company-Slug": slug } : undefined;

  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<number>(0);
  const [filterChannelId, setFilterChannelId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"contacts" | "groups" | "blocked" | "communities">("contacts");
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const [detailContact, setDetailContact] = useState<Contact | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailGroup, setDetailGroup] = useState<Group | null>(null);
  const [detailGroupOpen, setDetailGroupOpen] = useState(false);
  const [manageGroup, setManageGroup] = useState<Group | null>(null);
  const [manageGroupOpen, setManageGroupOpen] = useState(false);
  const [createCommunityOpen, setCreateCommunityOpen] = useState(false);
  const [createCommunityContext, setCreateCommunityContext] = useState<{ groups: Group[]; channelId: string } | null>(null);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [createGroupContext, setCreateGroupContext] = useState<{ contacts: Contact[]; channelId: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Contact | null>(null);
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState<Group | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [blockList, setBlockList] = useState<string[]>([]);
  const [blockListLoading, setBlockListLoading] = useState(false);
  const [listSearch, setListSearch] = useState("");
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [selectedCommunityIds, setSelectedCommunityIds] = useState<Set<string>>(new Set());
  const [selectedBlockedJids, setSelectedBlockedJids] = useState<Set<string>>(new Set());
  const [unblockingBulk, setUnblockingBulk] = useState(false);
  const [contactsActionLoading, setContactsActionLoading] = useState(false);
  const [addToAgendaModalOpen, setAddToAgendaModalOpen] = useState(false);
  const [addContactSideOverOpen, setAddContactSideOverOpen] = useState(false);
  const [addContactTab, setAddContactTab] = useState<"single" | "bulk">("single");
  const [addContactChannelId, setAddContactChannelId] = useState<string>("");
  const [addContactPhone, setAddContactPhone] = useState("");
  const [addContactName, setAddContactName] = useState("");
  const [addContactSaving, setAddContactSaving] = useState(false);
  const [addContactResult, setAddContactResult] = useState<{ ok: number; fail: number } | null>(null);
  const [addContactError, setAddContactError] = useState<string | null>(null);
  const [bulkContactsText, setBulkContactsText] = useState("");
  const [bulkContactsRows, setBulkContactsRows] = useState<{ number: string; name: string }[]>([]);
  const [bulkContactsImporting, setBulkContactsImporting] = useState(false);
  const [contactTagsLoading, setContactTagsLoading] = useState(false);
  const [availableContactTags, setAvailableContactTags] = useState<
    { id: string; name: string; color_hex: string | null; category_name: string; active: boolean }[]
  >([]);
  const [selectedNewContactTagIds, setSelectedNewContactTagIds] = useState<Set<string>>(new Set());

  const fetchChannels = useCallback(() => {
    return fetch("/api/channels", { credentials: "include", headers: apiHeaders })
      .then((r) => r.json())
      .then((data) => setChannels(Array.isArray(data) ? data : []))
      .catch(() => setChannels([]));
  }, [slug]);

  // Carrega tags de contato para uso no formulário "Um por vez"
  useEffect(() => {
    const loadContactTags = async () => {
      if (!slug) return;
      // Evita refetch infinito: se já carregou uma vez, não busca de novo
      if (availableContactTags.length > 0 || contactTagsLoading) return;
      setContactTagsLoading(true);
      try {
        const r = await fetch("/api/tags", { credentials: "include", headers: apiHeaders });
        const data = await r.json();
        if (r.ok && data && Array.isArray(data.data)) {
          const contactTags = (data.data as any[])
            .filter((t) => t.category_type === "contact")
            .map((t) => ({
              id: t.id as string,
              name: t.name as string,
              color_hex: (t.color_hex as string | null) ?? null,
              category_name: (t.category_name as string) ?? "",
              active: t.active !== false,
            }));
          setAvailableContactTags(contactTags);
        } else {
          setAvailableContactTags([]);
        }
      } catch {
        setAvailableContactTags([]);
      } finally {
        setContactTagsLoading(false);
      }
    };
    loadContactTags();
  }, [slug]);

  const toggleNewContactTag = (id: string) => {
    setSelectedNewContactTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const contactsKey = useMemo(() => ["contacts", slug, filterChannelId || ""] as const, [slug, filterChannelId]);
  const groupsKey = useMemo(() => ["groups", slug, filterChannelId || ""] as const, [slug, filterChannelId]);
  const communitiesKey = useMemo(() => ["communities", slug, filterChannelId || ""] as const, [slug, filterChannelId]);

  const fetcherContacts = useCallback(
    async ([_, s, channelId]: readonly [string, string, string]) => {
      const url = channelId ? `/api/contacts?channel_id=${encodeURIComponent(channelId)}` : "/api/contacts";
      const r = await fetch(url, { credentials: "include", headers: apiHeaders });
      const data = await r.json();
      return Array.isArray(data) ? data as Contact[] : [];
    },
    [apiHeaders]
  );
  const fetcherGroups = useCallback(
    async ([_, s, channelId]: readonly [string, string, string]) => {
      const url = channelId ? `/api/groups?channel_id=${encodeURIComponent(channelId)}` : "/api/groups";
      const r = await fetch(url, { credentials: "include", headers: apiHeaders });
      const data = await r.json();
      return Array.isArray(data) ? data as Group[] : [];
    },
    [apiHeaders]
  );
  const fetcherCommunities = useCallback(
    async ([_, s, channelId]: readonly [string, string, string]) => {
      const url = channelId ? `/api/communities?channel_id=${encodeURIComponent(channelId)}` : "/api/communities";
      const r = await fetch(url, { credentials: "include", headers: apiHeaders });
      const data = await r.json();
      return Array.isArray(data) ? data as Group[] : [];
    },
    [apiHeaders]
  );

  const { data: contactsData, mutate: mutateContacts } = useSWR(contactsKey, fetcherContacts, {
    revalidateOnFocus: false,
    dedupingInterval: 5000,
  });
  const { data: groupsData, mutate: mutateGroups } = useSWR(groupsKey, fetcherGroups, {
    revalidateOnFocus: false,
    dedupingInterval: 5000,
  });
  const { data: communitiesData, mutate: mutateCommunities } = useSWR(
    activeTab === "communities" ? communitiesKey : null,
    fetcherCommunities,
    { revalidateOnFocus: false, dedupingInterval: 5000 }
  );

  const contacts = contactsData ?? [];
  const groups = groupsData ?? [];
  const communities = communitiesData ?? [];

  const dedupedContacts = useMemo(() => {
    const byKey = new Map<string, Contact>();
    for (const c of contacts) {
      const canonical = canonicalContactDigits(c.phone, c.jid);
      const key = `${c.channel_id}:${canonical || c.jid || c.id}`;
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, c);
        continue;
      }
      const prevScore =
        (prev.contact_name?.trim() ? 4 : 0) +
        (prev.first_name?.trim() ? 2 : 0) +
        (prev.avatar_url?.trim() ? 2 : 0) +
        (prev.phone?.trim() ? 1 : 0);
      const nextScore =
        (c.contact_name?.trim() ? 4 : 0) +
        (c.first_name?.trim() ? 2 : 0) +
        (c.avatar_url?.trim() ? 2 : 0) +
        (c.phone?.trim() ? 1 : 0);
      if (nextScore > prevScore) byKey.set(key, c);
      else if (nextScore === prevScore) {
        const prevTs = new Date(prev.synced_at || 0).getTime();
        const nextTs = new Date(c.synced_at || 0).getTime();
        if (nextTs > prevTs) byKey.set(key, c);
      }
    }
    return Array.from(byKey.values());
  }, [contacts]);

  const fetchBlockList = useCallback(() => {
    if (!filterChannelId) {
      setBlockList([]);
      return;
    }
    setBlockListLoading(true);
    fetch(`/api/contacts/blocklist?channel_id=${encodeURIComponent(filterChannelId)}`, {
      credentials: "include",
      headers: apiHeaders,
    })
      .then((r) => r.json())
      .then((data) => setBlockList(Array.isArray(data?.blockList) ? data.blockList : []))
      .catch(() => setBlockList([]))
      .finally(() => setBlockListLoading(false));
  }, [filterChannelId, apiHeaders]);

  const parseContactsCSVLine = (line: string, sep: string): string[] => {
    const parts: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (!inQuotes && c === sep) {
        parts.push(current.trim());
        current = "";
      } else {
        current += c;
      }
    }
    parts.push(current.trim());
    return parts;
  };

  const handleDownloadContactsTemplate = () => {
    const bom = "\uFEFF";
    // Modelo mais próximo da tabela channel_contacts
    const header = "phone;contact_name;first_name;avatar_url";
    const example1 =
      "5511999990000;João Silva;João;https://exemplo.com/avatar-joao.jpg";
    const example2 =
      "5548999991111;Maria - Cliente VIP;Maria;https://exemplo.com/avatar-maria.jpg";
    const example3 = "5511944442222;Sem Nome (usa número);;";
    const content = [header, example1, example2, example3].join("\n");
    const blob = new Blob([bom + content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-contatos.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseContactsCSVFile = (
    file: File
  ): Promise<{ number: string; name: string }[]> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result ?? "");
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        if (lines.length === 0) {
          resolve([]);
          return;
        }
        const first = lines[0].toLowerCase();
        // Aceita cabeçalho antigo (telefone/número) ou novo (phone;contact_name;first_name;avatar_url)
        const hasHeader =
          first.includes("telefone") ||
          first.includes("numero") ||
          first.includes("phone");
        const dataLines = hasHeader ? lines.slice(1) : lines;
        const rows: { number: string; name: string }[] = [];
        for (const line of dataLines) {
          const sep = line.includes(";") ? ";" : ",";
          const parts = parseContactsCSVLine(line, sep).map((p) =>
            p.replace(/^"|"$/g, "").trim()
          );
          // Coluna 0: phone (obrigatório)
          // Coluna 1: contact_name (opcional)
          // Coluna 2: first_name (opcional, hoje ignorado)
          // Coluna 3: avatar_url (opcional, hoje ignorado)
          const number = (parts[0] ?? "").replace(/\D/g, "");
          const contactName = (parts[1] ?? "").trim();
          const name = contactName;
          if (!number) continue;
          rows.push({ number, name: name || number });
        }
        resolve(rows);
      };
      reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
      reader.readAsText(file, "UTF-8");
    });

  useEffect(() => {
    setLoading(true);
    fetchChannels().then(() => setLoading(false));
  }, [fetchChannels]);

  useEffect(() => {
    if (filterChannelId && (activeTab === "blocked" || activeTab === "contacts")) fetchBlockList();
    else if (activeTab !== "blocked" && activeTab !== "contacts") setBlockList([]);
  }, [activeTab, filterChannelId, fetchBlockList]);

  const handleSync = async (channelId: string, clearFirst = false) => {
    if (syncing !== null) return;
    setSyncing(channelId);
    setSyncProgress(0);
    try {
      const url = `/api/channels/${channelId}/sync-contacts?stream=1${clearFirst ? "&clear=1" : ""}`;
      const r = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: apiHeaders,
      });
      if (!r.ok || !r.body) {
        const data = await r.json().catch(() => ({}));
        setAlertMessage(data?.error ?? "Falha ao sincronizar");
        setSyncing(null);
        setSyncProgress(0);
        return;
      }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line) as { progress?: number; ok?: boolean; error?: string };
            if (typeof data.progress === "number") setSyncProgress(Math.min(100, Math.max(0, data.progress)));
            if (data.progress === 100) {
              if (data.ok) {
                await Promise.all([mutateContacts(), mutateGroups(), mutateCommunities()]);
                fetchChannels();
              } else if (data.error) setAlertMessage(data.error);
            }
          } catch {
            // ignore parse errors
          }
        }
      }
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer) as { progress?: number; ok?: boolean; error?: string };
          if (typeof data.progress === "number") setSyncProgress(Math.min(100, Math.max(0, data.progress)));
          if (data.progress === 100) {
            if (data.ok) {
              await Promise.all([mutateContacts(), mutateGroups(), mutateCommunities()]);
              fetchChannels();
            } else if (data.error) setAlertMessage(data.error);
          }
        } catch {
          // ignore
        }
      }
    } catch {
      setAlertMessage("Erro de rede ao sincronizar");
    } finally {
      setSyncing(null);
      setSyncProgress(0);
    }
  };

  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? id.slice(0, 8);

  const openDetail = (contact: Contact) => {
    setDetailContact(contact);
    setDetailOpen(true);
  };

  const openGroupDetail = (group: Group) => {
    setDetailGroup(group);
    setDetailGroupOpen(true);
  };

  useEffect(() => {
    setSelectedContactIds(new Set());
    setSelectedGroupIds(new Set());
    setSelectedCommunityIds(new Set());
    setSelectedBlockedJids(new Set());
  }, [activeTab]);

  const handleDeleteContact = async () => {
    const c = deleteConfirm;
    setDeleteConfirm(null);
    if (!c) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/contacts/${encodeURIComponent(c.id)}`, {
        method: "DELETE",
        credentials: "include",
        headers: apiHeaders,
      });
      if (r.ok) {
        mutateContacts();
      } else {
        const data = await r.json();
        setAlertMessage(data?.error ?? "Falha ao excluir contato");
      }
    } catch {
      setAlertMessage("Erro de rede ao excluir");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteGroup = async () => {
    const g = deleteGroupConfirm;
    setDeleteGroupConfirm(null);
    if (!g?.jid || !g?.channel_id) return;
    setDeletingGroup(true);
    try {
      const r = await fetch("/api/groups/delete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ channel_id: g.channel_id, groupjid: g.jid, leave_first: true }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        mutateGroups();
        mutateCommunities();
        setSelectedGroupIds((prev) => { const next = new Set(prev); next.delete(g.id); return next; });
        setSelectedCommunityIds((prev) => { const next = new Set(prev); next.delete(g.id); return next; });
        setManageGroupOpen(false);
        setManageGroup(null);
      } else {
        setAlertMessage(data?.error ?? "Falha ao excluir");
      }
    } catch {
      setAlertMessage("Erro de rede ao excluir");
    } finally {
      setDeletingGroup(false);
    }
  };

  const contactColumns = useMemo<ColumnDef<Contact>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => {
          const pageIds = table.getCoreRowModel().rows.map((r) => r.original.id);
          const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedContactIds.has(id));
          return (
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => {
                if (allSelected) {
                  setSelectedContactIds((prev) => {
                    const next = new Set(prev);
                    pageIds.forEach((id) => next.delete(id));
                    return next;
                  });
                } else {
                  setSelectedContactIds((prev) => {
                    const next = new Set(prev);
                    pageIds.forEach((id) => next.add(id));
                    return next;
                  });
                }
              }}
              className="h-4 w-4 rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
              aria-label="Selecionar todos (todas as páginas)"
            />
          );
        },
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={selectedContactIds.has(row.original.id)}
            onChange={() => {
              const id = row.original.id;
              setSelectedContactIds((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              });
            }}
            className="h-4 w-4 rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
            aria-label={`Selecionar ${row.original.contact_name || row.original.first_name || "contato"}`}
          />
        ),
      },
      {
        header: "Nome",
        accessorFn: (c) => c.contact_name || c.first_name || formatPhoneBrazil(c.phone || c.jid || "") || "—",
        cell: ({ row }) => {
          const c = row.original;
          const name = c.contact_name || c.first_name || formatPhoneBrazil(c.phone || c.jid || "") || "—";
          const avatarUrl = c.avatar_url?.trim() || null;
          return (
            <div className="flex items-center gap-3">
              <ContactListAvatar avatarUrl={avatarUrl} name={name} />
              <span className="font-medium text-[#1E293B]">{name}</span>
            </div>
          );
        },
      },
      {
        header: "Número",
        accessorFn: (c) => c.phone || c.jid || "—",
        cell: ({ row }) => {
          const c = row.original;
          const raw = c.phone || (c.jid ?? "").replace(/@.*$/, "") || "";
          const formatted = formatPhoneBrazil(raw);
          const toCopy = raw.replace(/\D/g, "") || (c.jid ?? "").replace(/@.*$/, "");
          return (
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center rounded-md bg-[#F1F5F9] px-2 py-0.5 text-sm font-medium text-[#334155]">
                {formatted}
              </span>
              {toCopy ? (
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(toCopy)}
                  className="rounded p-1 text-[#64748B] hover:bg-[#E2E8F0] hover:text-clicvend-orange"
                  title="Copiar número"
                  aria-label="Copiar número"
                >
                  <Copy className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          );
        },
      },
      {
        header: "Conexão",
        accessorKey: "channel_id",
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1 text-sm text-[#64748B]">
            <Plug className="h-4 w-4 text-clicvend-orange" />
            {channelName(row.original.channel_id)}
          </span>
        ),
      },
      {
        header: "Filas",
        id: "queues",
        cell: ({ row }) => {
          const queues = Array.isArray(row.original.queue_names) ? row.original.queue_names : [];
          if (queues.length === 0) return <span className="text-[#94A3B8]">—</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {queues.slice(0, 2).map((q) => (
                <span
                  key={q}
                  className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                  title={q}
                >
                  {q}
                </span>
              ))}
              {queues.length > 2 && (
                <span className="inline-flex items-center rounded-md bg-[#F1F5F9] px-2 py-0.5 text-xs font-medium text-[#64748B]">
                  +{queues.length - 2}
                </span>
              )}
            </div>
          );
        },
      },
      {
        header: "Tags",
        id: "tags",
        cell: ({ row }) => {
          const tags = Array.isArray(row.original.tag_names) ? row.original.tag_names : [];
          if (tags.length === 0) return <span className="text-[#94A3B8]">—</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 2).map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center rounded-md bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700"
                  title={t}
                >
                  {t}
                </span>
              ))}
              {tags.length > 2 && (
                <span className="inline-flex items-center rounded-md bg-[#F1F5F9] px-2 py-0.5 text-xs font-medium text-[#64748B]">
                  +{tags.length - 2}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="inline-flex rounded-lg border border-[#E2E8F0] bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => openDetail(row.original)}
              className="rounded-none border-r border-[#E2E8F0] p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-clicvend-orange last:border-r-0"
              title="Ver detalhes"
              aria-label="Ver detalhes do contato"
            >
              <Eye className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setDeleteConfirm(row.original)}
              className="rounded-none border-r border-[#E2E8F0] p-2 text-[#64748B] hover:bg-red-50 hover:text-red-600 last:border-r-0"
              title="Excluir da lista"
              aria-label="Excluir contato da lista"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ),
      },
    ],
    [channels, selectedContactIds]
  );

  const groupColumns = useMemo<ColumnDef<Group>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => {
          const pageIds = table.getCoreRowModel().rows.map((r) => r.original.id);
          const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedGroupIds.has(id));
          return (
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => {
                if (allSelected) {
                  setSelectedGroupIds((prev) => {
                    const next = new Set(prev);
                    pageIds.forEach((id) => next.delete(id));
                    return next;
                  });
                } else {
                  setSelectedGroupIds((prev) => {
                    const next = new Set(prev);
                    pageIds.forEach((id) => next.add(id));
                    return next;
                  });
                }
              }}
              className="h-4 w-4 rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
              aria-label="Selecionar todos (todas as páginas)"
            />
          );
        },
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={selectedGroupIds.has(row.original.id)}
            onChange={() => {
              const id = row.original.id;
              setSelectedGroupIds((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              });
            }}
            className="h-4 w-4 rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
            aria-label={`Selecionar ${row.original.name || "grupo"}`}
          />
        ),
      },
      {
        header: "Nome",
        accessorFn: (g) => g.name ?? "—",
        cell: ({ row }) => {
          const g = row.original;
          const name = g.name ?? "—";
          return (
            <div className="flex items-center gap-3">
              <ContactListAvatar avatarUrl={g.avatar_url?.trim() || null} name={name} />
              <span className="font-medium text-[#1E293B]">{name}</span>
            </div>
          );
        },
      },
      {
        header: "Descrição",
        accessorFn: (g) => g.topic ?? "—",
        cell: ({ getValue }) => (
          <span className="text-sm text-[#64748B] max-w-[200px] truncate block" title={String(getValue())}>
            {String(getValue())}
          </span>
        ),
      },
      {
        header: "Conexão",
        accessorKey: "channel_id",
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1 text-sm text-[#64748B]">
            <Plug className="h-4 w-4 text-clicvend-orange" />
            {channelName(row.original.channel_id)}
          </span>
        ),
      },
      {
        header: "ID (JID)",
        accessorKey: "jid",
        cell: ({ row }) => {
          const jid = row.original.jid ?? "";
          return (
            <div className="flex items-center gap-1.5 max-w-[200px]">
              <span className="truncate text-sm text-[#64748B]" title={jid}>
                {jid || "—"}
              </span>
              {jid ? (
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(jid)}
                  className="shrink-0 rounded p-1 text-[#64748B] hover:bg-[#E2E8F0] hover:text-clicvend-orange"
                  title="Copiar JID do grupo"
                  aria-label="Copiar JID"
                >
                  <Copy className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          );
        },
      },
      {
        header: "Status",
        id: "groupStatus",
        cell: ({ row }) => {
          const g = row.original;
          if (!g.left_at) return <span className="text-[#94A3B8]">—</span>;
          return (
            <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
              Saiu do grupo
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="inline-flex rounded-lg border border-[#E2E8F0] bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => openGroupDetail(row.original)}
              className="rounded-none border-r border-[#E2E8F0] p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-clicvend-orange last:border-r-0"
              title="Ver detalhes"
              aria-label="Ver detalhes do grupo"
            >
              <Eye className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => { setManageGroup(row.original); setManageGroupOpen(true); }}
              className="rounded-none border-r border-[#E2E8F0] p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-clicvend-orange last:border-r-0"
              title="Gerenciar grupo"
              aria-label="Gerenciar grupo"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        ),
      },
    ],
    [channels, selectedGroupIds]
  );

  const searchLower = listSearch.trim().toLowerCase();
  const filteredContacts = useMemo(() => {
    if (!searchLower) return dedupedContacts;
    return dedupedContacts.filter(
      (c) =>
        (c.contact_name?.toLowerCase().includes(searchLower) ||
          c.first_name?.toLowerCase().includes(searchLower) ||
          c.phone?.toLowerCase().includes(searchLower) ||
          c.jid?.toLowerCase().includes(searchLower))
    );
  }, [dedupedContacts, searchLower]);

  const sortedFilteredContacts = useMemo(() => {
    const channelOrder: Record<string, number> = {};
    channels.forEach((ch, i) => {
      channelOrder[ch.id] = i;
    });
    return [...filteredContacts].sort((a, b) => {
      const orderA = channelOrder[a.channel_id] ?? 999;
      const orderB = channelOrder[b.channel_id] ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      const nameA = (a.contact_name || a.first_name || a.phone || a.jid || "").toLowerCase();
      const nameB = (b.contact_name || b.first_name || b.phone || b.jid || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [filteredContacts, channels]);
  const filteredGroups = useMemo(() => {
    if (!searchLower) return groups;
    return groups.filter(
      (g) =>
        (g.name?.toLowerCase().includes(searchLower) || g.topic?.toLowerCase().includes(searchLower))
    );
  }, [groups, searchLower]);
  const filteredCommunities = useMemo(() => {
    if (!searchLower) return communities;
    return communities.filter(
      (c) =>
        (c.name?.toLowerCase().includes(searchLower) || c.topic?.toLowerCase().includes(searchLower))
    );
  }, [communities, searchLower]);
  const filteredBlockList = useMemo(() => {
    if (!searchLower) return blockList;
    return blockList.filter((jid) => jid.toLowerCase().includes(searchLower));
  }, [blockList, searchLower]);

  const [tablePagination, setTablePagination] = useState({ pageIndex: 0, pageSize: PAGE_SIZE });
  const [groupsPagination, setGroupsPagination] = useState({ pageIndex: 0, pageSize: PAGE_SIZE });
  const [communitiesPagination, setCommunitiesPagination] = useState({ pageIndex: 0, pageSize: PAGE_SIZE });

  const table = useReactTable({
    data: sortedFilteredContacts,
    columns: contactColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination: tablePagination },
    onPaginationChange: (updater) => {
      setTablePagination((prev) => {
        const next = typeof updater === "function" ? updater(prev) : prev;
        return { ...next, pageSize: PAGE_SIZE };
      });
    },
  });

  const groupsTable = useReactTable({
    data: filteredGroups,
    columns: groupColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination: groupsPagination },
    onPaginationChange: (updater) => {
      setGroupsPagination((prev) => {
        const next = typeof updater === "function" ? updater(prev) : prev;
        return { ...next, pageSize: PAGE_SIZE };
      });
    },
  });

  const communityColumns = useMemo<ColumnDef<Group>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => {
          const pageIds = table.getCoreRowModel().rows.map((r) => r.original.id);
          const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedCommunityIds.has(id));
          return (
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => {
                if (allSelected) {
                  setSelectedCommunityIds((prev) => {
                    const next = new Set(prev);
                    pageIds.forEach((id) => next.delete(id));
                    return next;
                  });
                } else {
                  setSelectedCommunityIds((prev) => {
                    const next = new Set(prev);
                    pageIds.forEach((id) => next.add(id));
                    return next;
                  });
                }
              }}
              className="h-4 w-4 rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
              aria-label="Selecionar todos (todas as páginas)"
            />
          );
        },
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={selectedCommunityIds.has(row.original.id)}
            onChange={() => {
              const id = row.original.id;
              setSelectedCommunityIds((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              });
            }}
            className="h-4 w-4 rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
            aria-label={`Selecionar ${row.original.name || "comunidade"}`}
          />
        ),
      },
      {
        header: "Nome",
        accessorFn: (g) => g.name ?? "—",
        cell: ({ row }) => {
          const g = row.original;
          const name = g.name ?? "—";
          return (
            <div className="flex items-center gap-3">
              <ContactListAvatar avatarUrl={g.avatar_url?.trim() || null} name={name} />
              <span className="font-medium text-[#1E293B]">{name}</span>
            </div>
          );
        },
      },
      {
        header: "Descrição",
        accessorFn: (g) => g.topic ?? "—",
        cell: ({ getValue }) => (
          <span className="text-sm text-[#64748B] max-w-[200px] truncate block" title={String(getValue())}>
            {String(getValue())}
          </span>
        ),
      },
      {
        header: "Conexão",
        accessorKey: "channel_id",
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1 text-sm text-[#64748B]">
            <Plug className="h-4 w-4 text-clicvend-orange" />
            {channelName(row.original.channel_id)}
          </span>
        ),
      },
      {
        header: "ID (JID)",
        accessorKey: "jid",
        cell: ({ row }) => {
          const jid = row.original.jid ?? "";
          return (
            <div className="flex items-center gap-1.5 max-w-[200px]">
              <span className="truncate text-sm text-[#64748B]" title={jid}>
                {jid || "—"}
              </span>
              {jid ? (
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(jid)}
                  className="shrink-0 rounded p-1 text-[#64748B] hover:bg-[#E2E8F0] hover:text-clicvend-orange"
                  title="Copiar JID da comunidade"
                  aria-label="Copiar JID"
                >
                  <Copy className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          );
        },
      },
    ],
    [channels, selectedCommunityIds]
  );

  const communitiesTable = useReactTable({
    data: filteredCommunities,
    columns: communityColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination: communitiesPagination },
    onPaginationChange: (updater) => {
      setCommunitiesPagination((prev) => {
        const next = typeof updater === "function" ? updater(prev) : prev;
        return { ...next, pageSize: PAGE_SIZE };
      });
    },
  });

  // auto fechar toast simples após alguns segundos
  useEffect(() => {
    if (!alertMessage) return;
    const id = window.setTimeout(() => setAlertMessage(null), 5000);
    return () => window.clearTimeout(id);
  }, [alertMessage]);

  return (
    <div className="flex flex-col gap-4 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
        <h1 className="text-2xl font-bold text-[#1E293B]">Contatos e grupos</h1>
          <p className="mt-0.5 text-sm text-[#64748B]">
            Total: <span className="font-medium tabular-nums text-[#1E293B]">{dedupedContacts.length}</span> contato{dedupedContacts.length !== 1 ? "s" : ""} · <span className="font-medium tabular-nums text-[#1E293B]">{groups.length}</span> grupo{groups.length !== 1 ? "s" : ""}
            {filterChannelId ? ` (${channelName(filterChannelId)})` : " (todas as instâncias)"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-[#64748B]"></span>
            <select
              value={filterChannelId}
              onChange={(e) => setFilterChannelId(e.target.value)}
              className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
            >
              <option value="">Todas</option>
              {channels.map((ch) => (
                <option key={ch.id} value={ch.id}>{ch.name}</option>
              ))}
            </select>
            <input
              type="search"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder={
                activeTab === "contacts"
                  ? "Buscar contatos..."
                  : activeTab === "groups"
                    ? "Buscar grupos..."
                    : activeTab === "blocked"
                      ? "Buscar bloqueados..."
                      : "Buscar..."
              }
              className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange min-w-[160px] sm:min-w-[180px]"
            />
          </div>
          <div className="flex flex-1 min-w-0 items-center gap-1.5 overflow-x-auto rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-1">
            {channels.map((ch) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => handleSync(ch.id)}
                disabled={syncing !== null}
                className="relative shrink-0 max-w-[120px] overflow-hidden rounded-md bg-clicvend-orange px-2 py-1.5 text-xs font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
                title={
                  syncing === ch.id
                    ? "Sincronizando contatos, grupos e comunidades…"
                    : `Sincronizar: traz contatos que têm conversa com ${ch.name} (não usa agenda do celular)`
                }
              >
                <span className="relative z-10 flex items-center justify-center gap-1 truncate">
                  {syncing === ch.id ? (
                    <span className="shrink-0 tabular-nums font-semibold">{syncProgress}%</span>
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="truncate">{ch.name}</span>
                </span>
                {syncing === ch.id && (
                  <span
                    className="absolute bottom-0 left-0 right-0 h-1 bg-black/20"
                    aria-hidden
                  >
                    <span className="animate-sync-progress absolute left-0 top-0 h-full w-1/3 bg-black rounded-full" />
                  </span>
                )}
              </button>
            ))}
            {filterChannelId && (
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm("Limpar contatos, grupos e comunidades desta conexão e sincronizar de novo com o WhatsApp? Isso remove duplicatas e atualiza a lista.")) return;
                  handleSync(filterChannelId, true);
                }}
                disabled={syncing !== null}
                className="shrink-0 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                title="Limpar lista desta conexão e sincronizar de novo (remove duplicatas)"
              >
                Limpar e sincronizar
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setAddContactChannelId(filterChannelId || (channels[0]?.id ?? ""));
                setAddContactPhone("");
                setAddContactName("");
                setBulkContactsText("");
                setAddContactResult(null);
                setAddContactError(null);
                setAddContactTab("single");
                setAddContactSideOverOpen(true);
              }}
              disabled={channels.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-medium text-clicvend-orange hover:bg-[#E2E8F0] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar contatos
            </button>
          </div>
          {channels.length === 0 && !loading && (
            <Link
              href={slug ? `/${slug}/conexoes` : "/conexoes"}
              className="text-sm font-medium text-clicvend-orange hover:underline"
            >
              Conectar um número em Conexões para sincronizar contatos, grupos e comunidades
            </Link>
          )}
        </div>
      </div>

     

      <div className="flex gap-2 border-b border-[#E2E8F0]">
          <button
            type="button"
          onClick={() => setActiveTab("contacts")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "contacts" ? "border-clicvend-orange text-clicvend-orange" : "border-transparent text-[#64748B] hover:text-[#1E293B]"
          }`}
          >
          <Users className="h-4 w-4" />
          Contatos ({dedupedContacts.length})
          </button>
          <button
            type="button"
          onClick={() => setActiveTab("groups")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "groups" ? "border-clicvend-orange text-clicvend-orange" : "border-transparent text-[#64748B] hover:text-[#1E293B]"
          }`}
          >
          <MessageCircle className="h-4 w-4" />
          Grupos ({groups.length})
          </button>
          <button
            type="button"
          onClick={() => setActiveTab("blocked")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "blocked" ? "border-clicvend-orange text-clicvend-orange" : "border-transparent text-[#64748B] hover:text-[#1E293B]"
          }`}
          >
          <Ban className="h-4 w-4" />
          Bloqueados {filterChannelId ? `(${listSearch.trim() ? filteredBlockList.length : blockList.length})` : ""}
          </button>
          <button
            type="button"
          onClick={() => setActiveTab("communities")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "communities" ? "border-clicvend-orange text-clicvend-orange" : "border-transparent text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          <MessageCircle className="h-4 w-4" />
          Comunidades ({communities.length})
          </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-clicvend-orange" />
        </div>
      ) : activeTab === "contacts" ? (
        <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden flex flex-col">
          {dedupedContacts.length === 0 ? (
            <div className="p-8 text-center text-[#64748B]">
              <Users className="mx-auto h-12 w-12 text-[#94A3B8]" />
              <p className="mt-2">Nenhum contato sincronizado.</p>
              <p className="mt-1 text-sm">Conecte um número em Conexões e clique em Sincronizar para trazer a agenda.</p>
            </div>
          ) : (
            <>
              {selectedContactIds.size > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 bg-clicvend-orange/10 border-b border-[#E2E8F0]">
                  <span className="text-sm font-medium text-[#1E293B]">
                    {selectedContactIds.size} contato(s) selecionado(s)
                  </span>
                  <div className="inline-flex flex-wrap rounded-lg border border-[#E2E8F0] bg-white overflow-hidden shadow-sm">
                    <button
                      type="button"
                      disabled={contactsActionLoading}
                      onClick={() => {
                        const ids = Array.from(selectedContactIds);
                        const blob = new Blob([
                          "Nome;Número;Conexão\n" +
                          ids
                            .map((id) => {
                              const c = contacts.find((x) => x.id === id);
                              if (!c) return "";
                              const name = (c.contact_name || c.first_name || "").trim() || "—";
                              const phone = (c.phone || c.jid || "").trim() || "—";
                              const conn = channelName(c.channel_id);
                              return `"${name}";"${phone}";"${conn}"`;
                            })
                            .filter(Boolean)
                            .join("\n"),
                        ], { type: "text/csv;charset=utf-8" });
                        const a = document.createElement("a");
                        a.href = URL.createObjectURL(blob);
                        a.download = "contatos-selecionados.csv";
                        a.click();
                        URL.revokeObjectURL(a.href);
                      }}
                      className="inline-flex items-center gap-1.5 border-r border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-60 last:border-r-0"
                      title="Baixar os contatos selecionados em um arquivo CSV (nome, número e conexão) para uso em planilhas ou backup."
                    >
                      Exportar CSV
                    </button>
                    <button
                      type="button"
                      disabled={contactsActionLoading}
                      onClick={() => {
                        const ids = Array.from(selectedContactIds);
                        const selected = contacts.filter((c) => ids.includes(c.id));
                        const channelIds = [...new Set(selected.map((c) => c.channel_id))];
                        if (channelIds.length > 1) {
                          setAlertMessage("Selecione contatos de uma única conexão para criar o grupo.");
                          return;
                        }
                        if (channelIds.length === 0) return;
                        setCreateGroupContext({ contacts: selected, channelId: channelIds[0] });
                        setCreateGroupOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 border-r border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC] hover:text-clicvend-orange last:border-r-0"
                      title="Criar um novo grupo no WhatsApp com os contatos selecionados (mesma conexão)."
                    >
                      <MessageCircle className="h-4 w-4" />
                      Criar grupo
                    </button>
                    <button
                      type="button"
                      disabled={contactsActionLoading}
                      onClick={async () => {
                        if (!window.confirm(`Bloquear ${selectedContactIds.size} contato(s) no WhatsApp?`)) return;
                        setContactsActionLoading(true);
                        try {
                          const ids = Array.from(selectedContactIds);
                          await Promise.all(
                            ids.map((id) => {
                              const c = contacts.find((x) => x.id === id);
                              if (!c) return Promise.resolve();
                              const number = (c.phone ?? c.jid ?? "").replace(/\D/g, "") || c.jid.replace(/@.*$/, "");
                              return fetch("/api/contacts/block", {
                                method: "POST",
                                credentials: "include",
                                headers: { "Content-Type": "application/json", ...apiHeaders },
                                body: JSON.stringify({ channel_id: c.channel_id, number, block: true }),
                              });
                            })
                          );
                          setSelectedContactIds(new Set());
                          mutateContacts();
                          if (filterChannelId) fetchBlockList();
                        } finally {
                          setContactsActionLoading(false);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 border-r border-[#E2E8F0] bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60 last:border-r-0"
                      title="Bloquear os contatos selecionados no WhatsApp. Eles não poderão enviar mensagens para este número."
                    >
                      {contactsActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                      Bloquear
                    </button>
                    <button
                      type="button"
                      disabled={contactsActionLoading}
                      onClick={() => {
                        const list = Array.from(selectedContactIds)
                          .map((id) => contacts.find((x) => x.id === id))
                          .filter((c): c is Contact => Boolean(c));
                        if (list.length === 0) return;
                        setAddToAgendaModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 border-r border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-60 last:border-r-0"
                      title="Adicionar os números selecionados à agenda do WhatsApp do celular conectado (salvar como contatos)."
                    >
                      {contactsActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Adicionar à agenda
                    </button>
                    <button
                      type="button"
                      disabled={contactsActionLoading}
                      onClick={async () => {
                        setContactsActionLoading(true);
                        try {
                          const ids = Array.from(selectedContactIds);
                          await Promise.all(
                            ids.map((id) => {
                              const c = contacts.find((x) => x.id === id);
                              if (!c) return Promise.resolve();
                              const number = (c.phone ?? c.jid ?? "").replace(/\D/g, "") || c.jid.replace(/@.*$/, "");
                              return fetch("/api/contacts/remove-from-agenda", {
                                method: "POST",
                                credentials: "include",
                                headers: { "Content-Type": "application/json", ...apiHeaders },
                                body: JSON.stringify({ channel_id: c.channel_id, number }),
                              });
                            })
                          );
                          setSelectedContactIds(new Set());
                          mutateContacts();
                        } finally {
                          setContactsActionLoading(false);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 border-r border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-60 last:border-r-0"
                      title="Remover os contatos selecionados da agenda do WhatsApp do celular conectado (apagam do celular)."
                    >
                      {contactsActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Remover da agenda
                    </button>
                    <button
                      type="button"
                      disabled={contactsActionLoading}
                      onClick={async () => {
                        if (!window.confirm(`Excluir ${selectedContactIds.size} contato(s) da lista? Eles continuarão no WhatsApp; apenas serão removidos desta lista.`)) return;
                        setContactsActionLoading(true);
                        try {
                          const ids = Array.from(selectedContactIds);
                          await Promise.all(
                            ids.map((id) =>
                              fetch(`/api/contacts/${encodeURIComponent(id)}`, {
                                method: "DELETE",
                                credentials: "include",
                                headers: apiHeaders,
                              })
                            )
                          );
                          setSelectedContactIds(new Set());
                          mutateContacts();
                        } finally {
                          setContactsActionLoading(false);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 border-r border-[#E2E8F0] bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60 last:border-r-0"
                      title="Remover os contatos selecionados apenas da lista desta aplicação. Eles continuam no WhatsApp e na agenda do celular."
                    >
                      {contactsActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      Excluir da lista
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedContactIds(new Set())}
                      disabled={contactsActionLoading}
                      className="inline-flex items-center gap-1.5 bg-white px-3 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9] disabled:opacity-60 last:border-r-0"
                      title="Desmarcar todos os contatos selecionados para escolher outros."
                    >
                      Limpar seleção
                    </button>
                  </div>
                </div>
              )}
              <div className="overflow-auto max-h-[60vh] min-h-[200px]">
                <table className="w-full min-w-[760px] border-collapse">
                  <thead className="sticky top-0 z-10 bg-[#F8FAFC]">
                    {table.getHeaderGroups().map((hg) => (
                      <tr key={hg.id} className="border-b border-[#E2E8F0]">
                        {hg.headers.map((h) => (
                          <th
                            key={h.id}
                            className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]"
                          >
                            {flexRender(h.column.columnDef.header, h.getContext())}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {(() => {
                      const rows = table.getRowModel().rows;
                      const colCount = table.getVisibleLeafColumns().length;
                      const channelNameById = (id: string) => channels.find((c) => c.id === id)?.name ?? id.slice(0, 8);
                      return rows.flatMap((row, index) => {
                        const prev = rows[index - 1];
                        const needSeparator = index === 0 || (prev && row.original.channel_id !== prev.original.channel_id);
                        const elements: React.ReactNode[] = [];
                        if (needSeparator) {
                          const channelId = row.original.channel_id;
                          const countForChannel = sortedFilteredContacts.filter((c) => c.channel_id === channelId).length;
                          elements.push(
                            <tr key={`sep-${channelId}-${index}`} className="bg-[#F1F5F9]">
                              <td colSpan={colCount} className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[#64748B] border-t border-b border-[#E2E8F0]">
                                <span className="inline-flex items-center gap-1.5">
                                  <Plug className="h-3.5 w-3.5 text-clicvend-orange" />
                                  {channelNameById(channelId)} ({countForChannel})
                                </span>
                              </td>
                            </tr>
                          );
                        }
                        elements.push(
                      <tr
                        key={row.id}
                        className="border-b border-[#E2E8F0] hover:bg-[#F8FAFC]"
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-4 py-3">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                        );
                        return elements;
                      });
                    })()}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2">
                <span className="text-sm text-[#64748B]">
                  Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount() || 1} ({filteredContacts.length} contato{filteredContacts.length !== 1 ? "s" : ""})
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                    className="rounded p-2 text-[#64748B] hover:bg-white hover:text-[#1E293B] disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                    className="rounded p-2 text-[#64748B] hover:bg-white hover:text-[#1E293B] disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      ) : activeTab === "groups" ? (
        <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden flex flex-col">
          {groups.length === 0 ? (
            <div className="p-8 text-center text-[#64748B]">
              <MessageCircle className="mx-auto h-12 w-12 text-[#94A3B8]" />
              <p className="mt-2">Nenhum grupo sincronizado.</p>
              <p className="mt-1 text-sm">Quando o número for adicionado a grupos, sincronize para listar aqui.</p>
            </div>
      ) : (
        <>
              <p className="px-4 py-2 text-xs text-[#64748B] bg-[#F8FAFC] border-b border-[#E2E8F0]">
                Quando nome ou descrição aparecem como &quot;-&quot;, o grupo ainda não teve os dados carregados pelo WhatsApp. Use o botão de <strong>Sincronizar</strong> do canal ou abra o grupo para atualizar.
              </p>
              {selectedGroupIds.size > 0 && (
                <div className="flex items-center justify-between gap-4 px-4 py-3 bg-clicvend-orange/10 border-b border-[#E2E8F0]">
                  <span className="text-sm font-medium text-[#1E293B]">
                    {selectedGroupIds.size} grupo(s) selecionado(s)
                  </span>
                  <div className="inline-flex rounded-lg border border-[#E2E8F0] bg-white overflow-hidden shadow-sm">
                    <button
                      type="button"
                      onClick={() => {
                        const ids = Array.from(selectedGroupIds);
                        const blob = new Blob([
                          "Nome;Descrição;Conexão\n" +
                          ids
                            .map((id) => {
                              const g = groups.find((x) => x.id === id);
                              if (!g) return "";
                              const name = (g.name ?? "").trim() || "—";
                              const topic = (g.topic ?? "").trim() || "—";
                              const conn = channelName(g.channel_id);
                              return `"${name}";"${topic}";"${conn}"`;
                            })
                            .filter(Boolean)
                            .join("\n"),
                        ], { type: "text/csv;charset=utf-8" });
                        const a = document.createElement("a");
                        a.href = URL.createObjectURL(blob);
                        a.download = "grupos-selecionados.csv";
                        a.click();
                        URL.revokeObjectURL(a.href);
                      }}
                      className="inline-flex items-center gap-1.5 border-r border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC] last:border-r-0"
                      title="Baixar os grupos selecionados em um arquivo CSV (nome, descrição e conexão)."
                    >
                      Exportar CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedGroupIds(new Set())}
                      className="inline-flex items-center gap-1.5 border-r border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9] last:border-r-0"
                      title="Desmarcar todos os grupos selecionados."
                    >
                      Limpar seleção
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const ids = Array.from(selectedGroupIds);
                        const selected = groups.filter((g) => ids.includes(g.id));
                        const channelIds = [...new Set(selected.map((g) => g.channel_id))];
                        if (channelIds.length > 1) {
                          setAlertMessage("Selecione grupos de uma única conexão para criar a comunidade.");
                          return;
                        }
                        if (channelIds.length === 0) return;
                        setCreateCommunityContext({ groups: selected, channelId: channelIds[0] });
                        setCreateCommunityOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 border-r border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC] hover:text-clicvend-orange last:border-r-0"
                      title="Criar uma comunidade e vincular os grupos selecionados (mesma conexão)."
                    >
                      Criar comunidades
                    </button>
                    <button
                      type="button"
                      disabled={selectedGroupIds.size !== 1}
                      onClick={() => {
                        if (selectedGroupIds.size !== 1) return;
                        const id = Array.from(selectedGroupIds)[0];
                        const g = groups.find((x) => x.id === id);
                        if (g) {
                          setManageGroup(g);
                          setManageGroupOpen(true);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 bg-white px-3 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9] hover:text-clicvend-orange disabled:opacity-50 disabled:cursor-not-allowed border-r border-[#E2E8F0]"
                      title={selectedGroupIds.size === 1 ? "Abrir gerenciamento do grupo selecionado" : "Selecione um grupo para gerenciar"}
                    >
                      Gerenciar grupo
                    </button>
                    <button
                      type="button"
                      disabled={selectedGroupIds.size === 0 || deletingGroup}
                      onClick={async () => {
                        const ids = Array.from(selectedGroupIds);
                        if (ids.length === 0 || !window.confirm(`Excluir ${ids.length} grupo(s) da lista e sair no WhatsApp? Esta ação não pode ser desfeita.`)) return;
                        setDeletingGroup(true);
                        try {
                          for (const id of ids) {
                            const g = groups.find((x) => x.id === id);
                            if (g?.jid && g?.channel_id) {
                              await fetch("/api/groups/delete", {
                                method: "POST",
                                credentials: "include",
                                headers: { "Content-Type": "application/json", ...apiHeaders },
                                body: JSON.stringify({ channel_id: g.channel_id, groupjid: g.jid, leave_first: true }),
                              });
                            }
                          }
                          setSelectedGroupIds(new Set());
                          await Promise.all([mutateGroups(), mutateCommunities()]);
                        } finally {
                          setDeletingGroup(false);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 last:border-r-0"
                      title="Excluir grupos selecionados da lista e sair no WhatsApp"
                    >
                      {deletingGroup ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      Excluir selecionados
                    </button>
                  </div>
                </div>
              )}
              <div className="overflow-auto max-h-[60vh] min-h-[200px]">
                <table className="w-full min-w-[520px] border-collapse">
                  <thead className="sticky top-0 z-10 bg-[#F8FAFC]">
                    {groupsTable.getHeaderGroups().map((hg) => (
                      <tr key={hg.id} className="border-b border-[#E2E8F0]">
                        {hg.headers.map((h) => (
                          <th
                            key={h.id}
                            className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]"
                          >
                            {flexRender(h.column.columnDef.header, h.getContext())}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {groupsTable.getRowModel().rows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-[#E2E8F0] hover:bg-[#F8FAFC]"
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-4 py-3">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2">
                <span className="text-sm text-[#64748B]">
                  Página {groupsTable.getState().pagination.pageIndex + 1} de {groupsTable.getPageCount() || 1} ({filteredGroups.length} grupo{filteredGroups.length !== 1 ? "s" : ""})
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => groupsTable.previousPage()}
                    disabled={!groupsTable.getCanPreviousPage()}
                    className="rounded p-2 text-[#64748B] hover:bg-white hover:text-[#1E293B] disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => groupsTable.nextPage()}
                    disabled={!groupsTable.getCanNextPage()}
                    className="rounded p-2 text-[#64748B] hover:bg-white hover:text-[#1E293B] disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      ) : activeTab === "blocked" ? (
        <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden flex flex-col">
          {selectedBlockedJids.size > 0 && filterChannelId && (
            <div className="flex items-center justify-between gap-4 px-4 py-3 bg-clicvend-orange/10 border-b border-[#E2E8F0]">
              <span className="text-sm font-medium text-[#1E293B]">
                {selectedBlockedJids.size} bloqueado(s) selecionado(s)
              </span>
              <div className="inline-flex rounded-lg border border-[#E2E8F0] bg-white overflow-hidden shadow-sm">
                <button
                  type="button"
                  disabled={unblockingBulk}
                  onClick={async () => {
                    const jids = Array.from(selectedBlockedJids);
                    setUnblockingBulk(true);
                    try {
                      await Promise.all(
                        jids.map((jid) => {
                          const number = jid.replace(/@s\.whatsapp\.net$/, "");
                          return fetch("/api/contacts/block", {
                            method: "POST",
                            credentials: "include",
                            headers: { "Content-Type": "application/json", ...apiHeaders },
                            body: JSON.stringify({ channel_id: filterChannelId, number, block: false }),
                          });
                        })
                      );
                      setSelectedBlockedJids(new Set());
                      fetchBlockList();
                    } finally {
                      setUnblockingBulk(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 border-r border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-60 last:border-r-0"
                  title="Desbloquear no WhatsApp os contatos selecionados. Eles poderão enviar mensagens novamente."
                >
                  {unblockingBulk ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />}
                  Desbloquear selecionados
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedBlockedJids(new Set())}
                  disabled={unblockingBulk}
                  className="inline-flex items-center gap-1.5 bg-white px-3 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9] disabled:opacity-60 last:border-r-0"
                  title="Desmarcar todos os bloqueados selecionados."
                >
                  Limpar seleção
                </button>
              </div>
            </div>
          )}
          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full min-w-[400px]">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                  {filterChannelId && filteredBlockList.length > 0 && (
                    <th className="px-4 py-3 w-10 text-left">
                      <input
                        type="checkbox"
                        checked={filteredBlockList.length > 0 && filteredBlockList.every((jid) => selectedBlockedJids.has(jid))}
                        onChange={() => {
                          if (filteredBlockList.every((jid) => selectedBlockedJids.has(jid))) {
                            setSelectedBlockedJids((prev) => {
                              const next = new Set(prev);
                              filteredBlockList.forEach((jid) => next.delete(jid));
                              return next;
                            });
                          } else {
                            setSelectedBlockedJids((prev) => {
                              const next = new Set(prev);
                              filteredBlockList.forEach((jid) => next.add(jid));
                              return next;
                            });
                          }
                        }}
                        className="h-4 w-4 rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
                        aria-label="Selecionar todos"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">Contato</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[#64748B]">Ação</th>
                </tr>
              </thead>
              <tbody>
                {!filterChannelId ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center text-[#64748B]">
                      <Ban className="mx-auto h-10 w-10 text-[#94A3B8]" />
                      <p className="mt-2">Selecione uma conexão no menu acima para ver os contatos bloqueados.</p>
                    </td>
                  </tr>
                ) : blockListLoading ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-12 text-center">
                      <Loader2 className="mx-auto h-8 w-8 animate-spin text-clicvend-orange" />
                    </td>
                  </tr>
                ) : filteredBlockList.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center text-[#64748B]">
                      <Ban className="mx-auto h-10 w-10 text-[#94A3B8]" />
                      <p className="mt-2">
                        {blockList.length === 0
                          ? "Nenhum contato bloqueado nesta conexão."
                          : "Nenhum resultado para a busca."}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredBlockList.map((jid) => {
                    const numberFromJid = jid.replace(/@s\.whatsapp\.net$/, "");
                    const contact = contacts.find(
                      (c) =>
                        c.channel_id === filterChannelId &&
                        (c.jid === jid || c.phone === numberFromJid || c.jid === numberFromJid || (c.phone && c.phone.replace(/\D/g, "") === numberFromJid.replace(/\D/g, "")))
                    );
                    const contactInfo = contact
                      ? { contact_name: contact.contact_name, first_name: contact.first_name, phone: contact.phone, avatar_url: contact.avatar_url }
                      : null;
                    return (
                      <BlockedRow
                        key={jid}
                        jid={jid}
                        channelId={filterChannelId}
                        contactInfo={contactInfo}
                        apiHeaders={apiHeaders}
                        onUnblock={() => fetchBlockList()}
                        selected={selectedBlockedJids.has(jid)}
                        onToggleSelect={() => {
                          setSelectedBlockedJids((prev) => {
                            const next = new Set(prev);
                            if (next.has(jid)) next.delete(jid);
                            else next.add(jid);
                            return next;
                          });
                        }}
                      />
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === "communities" ? (
        <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden flex flex-col">
          {communities.length === 0 ? (
            <div className="p-8 text-center text-[#64748B]">
              <MessageCircle className="mx-auto h-12 w-12 text-[#94A3B8]" />
              <p className="mt-2">Nenhuma comunidade criada.</p>
              <p className="mt-1 text-sm">Crie comunidades na aba Grupos selecionando grupos e usando &quot;Criar comunidades&quot;.</p>
            </div>
          ) : (
            <>
              {selectedCommunityIds.size > 0 && (
                <div className="flex items-center justify-between gap-4 px-4 py-3 bg-clicvend-orange/10 border-b border-[#E2E8F0]">
                  <span className="text-sm font-medium text-[#1E293B]">
                    {selectedCommunityIds.size} comunidade(s) selecionada(s)
                  </span>
                  <div className="inline-flex rounded-lg border border-[#E2E8F0] bg-white overflow-hidden shadow-sm">
            <button
              type="button"
                      onClick={() => {
                        const ids = Array.from(selectedCommunityIds);
                        const blob = new Blob([
                          "Nome;Descrição;Conexão\n" +
                          ids
                            .map((id) => {
                              const c = communities.find((x) => x.id === id);
                              if (!c) return "";
                              const name = (c.name ?? "").trim() || "—";
                              const topic = (c.topic ?? "").trim() || "—";
                              const conn = channelName(c.channel_id);
                              return `"${name}";"${topic}";"${conn}"`;
                            })
                            .filter(Boolean)
                            .join("\n"),
                        ], { type: "text/csv;charset=utf-8" });
                        const a = document.createElement("a");
                        a.href = URL.createObjectURL(blob);
                        a.download = "comunidades-selecionadas.csv";
                        a.click();
                        URL.revokeObjectURL(a.href);
                      }}
                      className="inline-flex items-center gap-1.5 border-r border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC] last:border-r-0"
                      title="Baixar as comunidades selecionadas em CSV"
                    >
                      Exportar CSV
            </button>
            <button
              type="button"
                      onClick={() => setSelectedCommunityIds(new Set())}
                      className="inline-flex items-center gap-1.5 border-r border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9] last:border-r-0"
                      title="Limpar seleção"
                    >
                      Limpar seleção
                    </button>
                    <button
                      type="button"
                      disabled={selectedCommunityIds.size !== 1}
              onClick={() => {
                        if (selectedCommunityIds.size !== 1) return;
                        const id = Array.from(selectedCommunityIds)[0];
                        const c = communities.find((x) => x.id === id);
                        if (c) {
                          setManageGroup(c);
                setManageGroupOpen(true);
                        }
              }}
                      className="inline-flex items-center gap-1.5 bg-white px-3 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9] hover:text-clicvend-orange disabled:opacity-50 disabled:cursor-not-allowed border-r border-[#E2E8F0]"
                      title={selectedCommunityIds.size === 1 ? "Abrir configuração da comunidade" : "Selecione uma comunidade para configurar"}
            >
                      Configurar
            </button>
                    <button
                      type="button"
                      disabled={selectedCommunityIds.size === 0 || deletingGroup}
                      onClick={async () => {
                        const ids = Array.from(selectedCommunityIds);
                        if (ids.length === 0 || !window.confirm(`Excluir ${ids.length} comunidade(s) da lista e sair no WhatsApp? Esta ação não pode ser desfeita.`)) return;
                        setDeletingGroup(true);
                        try {
                          for (const id of ids) {
                            const c = communities.find((x) => x.id === id);
                            if (c?.jid && c?.channel_id) {
                              await fetch("/api/groups/delete", {
                                method: "POST",
                                credentials: "include",
                                headers: { "Content-Type": "application/json", ...apiHeaders },
                                body: JSON.stringify({ channel_id: c.channel_id, groupjid: c.jid, leave_first: true }),
                              });
                            }
                          }
                          setSelectedCommunityIds(new Set());
                          await Promise.all([mutateGroups(), mutateCommunities()]);
                        } finally {
                          setDeletingGroup(false);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 last:border-r-0"
                      title="Excluir comunidades selecionadas da lista e sair no WhatsApp"
                    >
                      {deletingGroup ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      Excluir selecionados
                    </button>
                  </div>
                </div>
              )}
              <div className="overflow-auto max-h-[60vh] min-h-[200px]">
                <table className="w-full min-w-[520px] border-collapse">
                  <thead className="sticky top-0 z-10 bg-[#F8FAFC]">
                    {communitiesTable.getHeaderGroups().map((hg) => (
                      <tr key={hg.id} className="border-b border-[#E2E8F0]">
                        {hg.headers.map((h) => (
                          <th key={h.id} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                            {flexRender(h.column.columnDef.header, h.getContext())}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {communitiesTable.getRowModel().rows.map((row) => (
                      <tr key={row.id} className="border-b border-[#E2E8F0] hover:bg-[#F8FAFC]">
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-4 py-3">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                        ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
              <div className="flex items-center justify-between gap-2 border-t border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2">
                <span className="text-sm text-[#64748B]">
                  Página {communitiesTable.getState().pagination.pageIndex + 1} de {communitiesTable.getPageCount() || 1} ({filteredCommunities.length} comunidade{filteredCommunities.length !== 1 ? "s" : ""})
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => communitiesTable.previousPage()}
                    disabled={!communitiesTable.getCanPreviousPage()}
                    className="rounded p-2 text-[#64748B] hover:bg-white hover:text-[#1E293B] disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => communitiesTable.nextPage()}
                    disabled={!communitiesTable.getCanNextPage()}
                    className="rounded p-2 text-[#64748B] hover:bg-white hover:text-[#1E293B] disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
          </div>
        </>
      )}
        </div>
      ) : null}

      <ContactDetailSideOver
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setDetailContact(null);
          mutateContacts();
        }}
        contact={detailContact}
        channelName={detailContact ? channelName(detailContact.channel_id) : ""}
        companySlug={slug}
        onBlockChange={() => { fetchBlockList(); mutateContacts(); }}
        onTagsSaved={(contactId, tagNames) => {
          mutateContacts(
            (prev) =>
              Array.isArray(prev)
                ? prev.map((c) =>
                    c.id === contactId
                      ? { ...c, tag_names: tagNames }
                      : c
                  )
                : prev,
            { revalidate: false }
          );
          mutateContacts();
        }}
      />

      <AddToAgendaModal
        open={addToAgendaModalOpen}
        onClose={() => setAddToAgendaModalOpen(false)}
        contacts={contacts.filter((c) => selectedContactIds.has(c.id))}
        apiHeaders={apiHeaders}
        channelName={channelName}
        onSuccess={() => {
          setSelectedContactIds(new Set());
          mutateContacts();
        }}
      />

      <GroupDetailSideOver
        open={detailGroupOpen}
        onClose={() => { setDetailGroupOpen(false); setDetailGroup(null); }}
        group={detailGroup}
        channelName={detailGroup ? channelName(detailGroup.channel_id) : ""}
        companySlug={slug}
        onLeaveSuccess={() => { mutateGroups(); setDetailGroupOpen(false); setDetailGroup(null); }}
      />

      <GroupManageSideOver
        open={manageGroupOpen}
        onClose={() => { setManageGroupOpen(false); setManageGroup(null); }}
        group={manageGroup}
        channelName={manageGroup ? channelName(manageGroup.channel_id) : ""}
        companySlug={slug}
        onLeaveSuccess={() => { mutateGroups(); setManageGroupOpen(false); setManageGroup(null); }}
        onUpdateSuccess={() => { mutateGroups(); mutateCommunities(); }}
      />

      <CreateCommunitySideOver
        open={createCommunityOpen}
        onClose={() => { setCreateCommunityOpen(false); setCreateCommunityContext(null); }}
        selectedGroups={createCommunityContext?.groups ?? []}
        channelId={createCommunityContext?.channelId ?? ""}
        channelName={createCommunityContext ? channelName(createCommunityContext.channelId) : ""}
        apiHeaders={apiHeaders}
        onSuccess={() => { mutateGroups(); mutateCommunities(); setSelectedGroupIds(new Set()); }}
        onError={(msg) => setAlertMessage(msg)}
      />

      <CreateGroupSideOver
        open={createGroupOpen}
        onClose={() => { setCreateGroupOpen(false); setCreateGroupContext(null); }}
        selectedContacts={createGroupContext?.contacts ?? []}
        channelId={createGroupContext?.channelId ?? ""}
        channelName={createGroupContext ? channelName(createGroupContext.channelId) : ""}
        apiHeaders={apiHeaders}
        onSuccess={() => { mutateGroups(); setSelectedContactIds(new Set()); }}
        onError={(msg) => setAlertMessage(msg)}
      />

      <SideOver
        open={addContactSideOverOpen}
        onClose={() => setAddContactSideOverOpen(false)}
        title="Adicionar contatos manualmente"
        width={520}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2 border-b border-[#E2E8F0] pb-3">
            <button
              type="button"
              onClick={() => setAddContactTab("single")}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                addContactTab === "single"
                  ? "bg-clicvend-orange/10 text-clicvend-orange"
                  : "text-[#64748B] hover:bg-[#F1F5F9]"
              }`}
            >
              Um por vez
            </button>
            <button
              type="button"
              onClick={() => setAddContactTab("bulk")}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                addContactTab === "bulk"
                  ? "bg-clicvend-orange/10 text-clicvend-orange"
                  : "text-[#64748B] hover:bg-[#F1F5F9]"
              }`}
            >
              Em massa
            </button>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-[#334155]">Conexão</label>
            <select
              value={addContactChannelId}
              onChange={(e) => setAddContactChannelId(e.target.value)}
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
            >
              <option value="">Selecionar conexão…</option>
              {channels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-[#64748B]">
              O contato será criado na agenda do WhatsApp da conexão selecionada.
            </p>
          </div>

          {addContactTab === "single" && (
            <div className="space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-[#334155]">Telefone</label>
                  <input
                    type="tel"
                    value={addContactPhone}
                    onChange={(e) => setAddContactPhone(e.target.value)}
                    placeholder="Ex.: 55 11 99999-0000"
                    className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#334155]">Nome</label>
                  <input
                    type="text"
                    value={addContactName}
                    onChange={(e) => setAddContactName(e.target.value)}
                    placeholder="Nome que aparecerá na agenda"
                    className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                  />
                </div>
              </div>

              <div className="border-t border-[#E2E8F0] pt-4">
                <p className="text-sm font-medium text-[#334155]">Tags do contato</p>
                <p className="text-xs text-[#64748B] mb-2">
                  Opcional. Essas tags ajudam a classificar o tipo de contato.
                </p>
                {contactTagsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-[#64748B]">
                    <Loader2 className="h-3 w-3 animate-spin text-clicvend-orange" />
                    Carregando tags…
                  </div>
                ) : availableContactTags.length === 0 ? (
                  <p className="text-xs text-[#94A3B8]">
                    Nenhuma tag de contato cadastrada ainda. Crie em{" "}
                    <span className="font-medium">Tags e formulários</span>.
                  </p>
                ) : (
                  <>
                    <div className="mb-2 flex flex-wrap gap-2">
                      {availableContactTags.map((tag) => (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleNewContactTag(tag.id)}
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                            selectedNewContactTagIds.has(tag.id)
                              ? "border-transparent text-white"
                              : "border-[#E2E8F0] text-[#475569] bg-white hover:bg-[#F8FAFC]"
                          }`}
                          style={
                            selectedNewContactTagIds.has(tag.id) && tag.color_hex
                              ? { backgroundColor: tag.color_hex }
                              : undefined
                          }
                        >
                          <span className="truncate">{tag.name}</span>
                        </button>
                      ))}
                    </div>
                    {selectedNewContactTagIds.size > 0 && (
                      <div className="rounded-lg border border-[#E2E8F0] bg-white">
                        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-3 py-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                            Tags selecionadas ({selectedNewContactTagIds.size})
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedNewContactTagIds(new Set())}
                            className="text-[11px] font-medium text-[#64748B] hover:text-[#0F172A]"
                          >
                            Limpar
                          </button>
                        </div>
                        <div className="divide-y divide-[#F1F5F9]">
                          {availableContactTags
                            .filter((t) => selectedNewContactTagIds.has(t.id))
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
            </div>
          )}

          {addContactTab === "bulk" && (
            <div className="space-y-4">
              <p className="text-sm text-[#64748B]">
                Use uma planilha para importar vários contatos de uma vez (até{" "}
                <span className="font-semibold">90 contatos</span> por importação). Cada linha deve ter{" "}
                <span className="font-mono text-xs text-[#0F172A]">telefone;nome</span>. O cabeçalho é
                opcional.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleDownloadContactsTemplate}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC]"
                >
                  <Download className="h-4 w-4" />
                  Baixar modelo (CSV)
                </button>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC]">
                  <Upload className="h-4 w-4" />
                  Enviar planilha preenchida
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      try {
                        const rows = await parseContactsCSVFile(file);
                        setBulkContactsRows(rows);
                        setAddContactResult(null);
                        setAddContactError(null);
                      } catch {
                        setAddContactError("Erro ao processar o arquivo. Use o modelo em CSV.");
                      }
                    }}
                  />
                </label>
              </div>

              <pre className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-2 text-xs text-[#475569]">
telefone;nome{"\n"}5511999990000;João Silva{"\n"}5548999991111;Maria - Cliente VIP{"\n"}5511944442222;Sem Nome (usa número)
              </pre>

              {bulkContactsRows.length > 0 && (
                <>
                  <p className="text-sm font-medium text-[#334155]">
                    Preview: {bulkContactsRows.length} contato(s) pronto(s) para importar
                  </p>
                  {bulkContactsRows.length > 90 && (
                    <p className="text-xs text-red-600">
                      Limite de <strong>90 contatos</strong> por importação. Serão considerados apenas os
                      90 primeiros desta lista.
                    </p>
                  )}
                  <div className="max-h-48 overflow-auto rounded-lg border border-[#E2E8F0]">
                    <table className="min-w-full text-xs">
                      <thead className="sticky top-0 bg-[#F8FAFC]">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-[#64748B]">Telefone</th>
                          <th className="px-2 py-1.5 text-left font-medium text-[#64748B]">Nome</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0]">
                        {bulkContactsRows.slice(0, 30).map((row, i) => (
                          <tr key={i}>
                            <td className="px-2 py-1.5 text-[#1E293B]">{row.number}</td>
                            <td className="px-2 py-1.5 text-[#64748B]">{row.name}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {bulkContactsRows.length > 30 && (
                      <p className="px-2 py-1 text-[11px] text-[#94A3B8]">
                        … e mais {bulkContactsRows.length - 30} contato(s).
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {addContactError && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {addContactError}
            </div>
          )}
          {addContactResult && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Criados {addContactResult.ok} contato(s)
              {addContactResult.fail > 0 ? `, ${addContactResult.fail} falha(s).` : "."}
            </div>
          )}

          <div className="mt-2 flex justify-end gap-2 border-t border-[#E2E8F0] pt-3">
            <button
              type="button"
              className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]"
              disabled={addContactSaving}
              onClick={() => setAddContactSideOverOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={
                addContactSaving ||
                !addContactChannelId ||
                (addContactTab === "single" ? !addContactPhone.trim() : bulkContactsRows.length === 0)
              }
              onClick={async () => {
                if (!addContactChannelId) return;
                setAddContactSaving(true);
                setAddContactError(null);
                setAddContactResult(null);
                try {
                  if (addContactTab === "single") {
                    const number = addContactPhone.replace(/\D/g, "");
                    const name = addContactName.trim() || number;
                    const res = await fetch("/api/contacts/add-to-agenda", {
                      method: "POST",
                      credentials: "include",
                      headers: { "Content-Type": "application/json", ...(apiHeaders ?? {}) },
                      body: JSON.stringify({ channel_id: addContactChannelId, number, name }),
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      setAddContactError(data?.error ?? "Falha ao adicionar contato.");
                    } else {
                      // Se houver tags selecionadas para o novo contato, aplica após criar na agenda
                      if (selectedNewContactTagIds.size > 0) {
                        try {
                          const tagsRes = await fetch("/api/contact-tags", {
                            method: "POST",
                            credentials: "include",
                            headers: {
                              "Content-Type": "application/json",
                              ...(apiHeaders ?? {}),
                            },
                            body: JSON.stringify({
                              channel_id: addContactChannelId,
                              number,
                              tag_ids: Array.from(selectedNewContactTagIds),
                            }),
                          });
                          if (!tagsRes.ok) {
                            const tagsData = await tagsRes.json().catch(() => ({}));
                            setAddContactError(
                              tagsData?.error ?? "Contato criado, mas falha ao aplicar tags."
                            );
                          } else {
                            setSelectedNewContactTagIds(new Set());
                          }
                        } catch {
                          setAddContactError(
                            (prev) =>
                              prev ??
                              "Contato criado, mas ocorreu um erro de rede ao aplicar tags."
                          );
                        }
                      }
                      setAddContactResult({ ok: 1, fail: 0 });
                      setAddContactPhone("");
                      setAddContactName("");
                      mutateContacts();
                    }
                  } else {
                    let ok = 0;
                    let fail = 0;
                    let firstError: string | null = null;
                    const maxPerBatch = 90;
                    const rowsToProcess = bulkContactsRows.slice(0, maxPerBatch);
                    for (const row of rowsToProcess) {
                      const number = row.number.replace(/\D/g, "");
                      const name = row.name.trim() || number;
                      if (!number) {
                        fail++;
                        if (!firstError) firstError = "Telefone inválido em uma das linhas.";
                        continue;
                      }
                      try {
                        const res = await fetch("/api/contacts/add-to-agenda", {
                          method: "POST",
                          credentials: "include",
                          headers: { "Content-Type": "application/json", ...(apiHeaders ?? {}) },
                          body: JSON.stringify({ channel_id: addContactChannelId, number, name }),
                        });
                        if (res.ok) {
                          ok++;
                        } else {
                          fail++;
                          if (!firstError) {
                            const data = await res.json().catch(() => ({}));
                            firstError = data?.error ?? "Falha ao adicionar um dos contatos.";
                          }
                        }
                      } catch {
                        fail++;
                        if (!firstError) firstError = "Erro de rede ao adicionar um dos contatos.";
                      }
                    }
                    if (bulkContactsRows.length > maxPerBatch && !firstError) {
                      firstError = `Limite de ${maxPerBatch} contatos por importação. Apenas os primeiros ${maxPerBatch} foram processados.`;
                    }
                    setAddContactResult({ ok, fail });
                    if (firstError) setAddContactError(firstError);
                    if (ok > 0) {
                      mutateContacts();
                    }
                  }
                } finally {
                  setAddContactSaving(false);
                }
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
            >
              {addContactSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar
            </button>
          </div>
        </div>
      </SideOver>

      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Excluir contato"
        message="Remover este contato da lista? Ele continuará na agenda do WhatsApp; apenas deixará de aparecer aqui até a próxima sincronização."
        confirmLabel="Excluir"
        variant="danger"
        onConfirm={handleDeleteContact}
      />
      <ConfirmDialog
        open={!!deleteGroupConfirm}
        onClose={() => setDeleteGroupConfirm(null)}
        title={deleteGroupConfirm ? "Excluir da lista" : ""}
        message={deleteGroupConfirm ? "Este grupo/comunidade será removido da lista e o número sairá dele no WhatsApp. Esta ação não pode ser desfeita. Continuar?" : ""}
        confirmLabel="Excluir"
        variant="danger"
        onConfirm={handleDeleteGroup}
      />
      {/* Toast simples para mensagens de feedback */}
      {alertMessage && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg bg-[#0F172A] px-4 py-3 text-sm text-white shadow-lg flex items-start gap-2">
          <span className="flex-1">{alertMessage}</span>
          <button
            type="button"
            onClick={() => setAlertMessage(null)}
            className="ml-2 rounded-full p-1 text-[#E2E8F0] hover:bg-white/10"
            aria-label="Fechar aviso"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
