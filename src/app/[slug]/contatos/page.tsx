"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { usePathname } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { RefreshCw, Users, MessageCircle, Loader2, Plug, Eye, Trash2, ChevronLeft, ChevronRight, Ban, Settings, Unlock, X } from "lucide-react";
import Link from "next/link";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ContactDetailSideOver, type Contact } from "./ContactDetailSideOver";
import { GroupDetailSideOver, type Group } from "./GroupDetailSideOver";
import { GroupManageSideOver } from "./GroupManageSideOver";

type Channel = { id: string; name: string };

const PAGE_SIZE = 25;

function BlockedRow({
  jid,
  channelId,
  contactInfo,
  apiHeaders,
  onUnblock,
}: {
  jid: string;
  channelId: string;
  contactInfo: { contact_name: string | null; first_name: string | null; phone: string | null } | null;
  apiHeaders: Record<string, string> | undefined;
  onUnblock: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const number = jid.replace(/@s\.whatsapp\.net$/, "");
  const displayName = contactInfo
    ? (contactInfo.contact_name || contactInfo.first_name || "").trim() || "—"
    : "—";
  const displayPhone = contactInfo?.phone?.trim() || number || jid;
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
      <td className="px-4 py-3">
        <div className="font-medium text-[#1E293B]">{displayName}</div>
        <div className="text-sm text-[#64748B]">{displayPhone}</div>
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
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [filterChannelId, setFilterChannelId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"contacts" | "groups" | "blocked" | "groupsManage">("contacts");
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const [detailContact, setDetailContact] = useState<Contact | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailGroup, setDetailGroup] = useState<Group | null>(null);
  const [detailGroupOpen, setDetailGroupOpen] = useState(false);
  const [manageGroup, setManageGroup] = useState<Group | null>(null);
  const [manageGroupOpen, setManageGroupOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [blockList, setBlockList] = useState<string[]>([]);
  const [blockListLoading, setBlockListLoading] = useState(false);
  const [listSearch, setListSearch] = useState("");

  const fetchChannels = useCallback(() => {
    return fetch("/api/channels", { credentials: "include", headers: apiHeaders })
      .then((r) => r.json())
      .then((data) => setChannels(Array.isArray(data) ? data : []))
      .catch(() => setChannels([]));
  }, [slug]);

  const fetchContacts = useCallback(() => {
    const url = filterChannelId ? `/api/contacts?channel_id=${encodeURIComponent(filterChannelId)}` : "/api/contacts";
    return fetch(url, { credentials: "include", headers: apiHeaders })
      .then((r) => r.json())
      .then((data) => setContacts(Array.isArray(data) ? data : []))
      .catch(() => setContacts([]));
  }, [filterChannelId, slug]);

  const fetchGroups = useCallback(() => {
    const url = filterChannelId ? `/api/groups?channel_id=${encodeURIComponent(filterChannelId)}` : "/api/groups";
    return fetch(url, { credentials: "include", headers: apiHeaders })
      .then((r) => r.json())
      .then((data) => setGroups(Array.isArray(data) ? data : []))
      .catch(() => setGroups([]));
  }, [filterChannelId, slug]);

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
  }, [filterChannelId, slug]);

  useEffect(() => {
    setLoading(true);
    fetchChannels().then(() => setLoading(false));
  }, [fetchChannels]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  useEffect(() => {
    if (filterChannelId && (activeTab === "blocked" || activeTab === "contacts")) fetchBlockList();
    else if (activeTab !== "blocked" && activeTab !== "contacts") setBlockList([]);
  }, [activeTab, filterChannelId, fetchBlockList]);

  const handleSync = async (channelId: string) => {
    setSyncing(channelId);
    try {
      const r = await fetch(`/api/channels/${channelId}/sync-contacts`, {
        method: "POST",
        credentials: "include",
        headers: apiHeaders,
      });
      const data = await r.json();
      if (r.ok) {
        fetchContacts();
        fetchGroups();
      } else {
        setAlertMessage(data?.error ?? "Falha ao sincronizar");
      }
    } catch {
      setAlertMessage("Erro de rede ao sincronizar");
    } finally {
      setSyncing(null);
    }
  };

  const handleSyncAll = async () => {
    if (channels.length === 0) return;
    for (const ch of channels) {
      await handleSync(ch.id);
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
        fetchContacts();
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

  const contactColumns = useMemo<ColumnDef<Contact>[]>(
    () => [
      {
        header: "Nome",
        accessorFn: (c) => c.contact_name || c.first_name || "—",
        cell: ({ getValue }) => (
          <span className="font-medium text-[#1E293B]">{String(getValue())}</span>
        ),
      },
      {
        header: "Telefone",
        accessorFn: (c) => c.phone || c.jid || "—",
        cell: ({ getValue }) => (
          <span className="text-sm text-[#64748B]">{String(getValue())}</span>
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
        header: "Status",
        id: "status",
        cell: ({ row }) => {
          const c = row.original;
          const isBlocked =
            filterChannelId &&
            c.channel_id === filterChannelId &&
            blockList.some((jid) => jid === c.jid || jid === c.jid?.split("@")[0]);
          if (!isBlocked) return <span className="text-[#94A3B8]">—</span>;
          return (
            <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
              Bloqueado
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => openDetail(row.original)}
              className="rounded p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-clicvend-orange"
              title="Ver detalhes"
              aria-label="Ver detalhes do contato"
            >
              <Eye className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setDeleteConfirm(row.original)}
              className="rounded p-2 text-[#64748B] hover:bg-red-50 hover:text-red-600"
              title="Excluir da lista"
              aria-label="Excluir contato da lista"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ),
      },
    ],
    [channels, filterChannelId, blockList]
  );

  const groupColumns = useMemo<ColumnDef<Group>[]>(
    () => [
      {
        header: "Nome",
        accessorFn: (g) => g.name ?? "—",
        cell: ({ getValue }) => (
          <span className="font-medium text-[#1E293B]">{String(getValue())}</span>
        ),
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
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => openGroupDetail(row.original)}
              className="rounded p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-clicvend-orange"
              title="Ver detalhes"
              aria-label="Ver detalhes do grupo"
            >
              <Eye className="h-4 w-4" />
            </button>
          </div>
        ),
      },
    ],
    [channels]
  );

  const searchLower = listSearch.trim().toLowerCase();
  const filteredContacts = useMemo(() => {
    if (!searchLower) return contacts;
    return contacts.filter(
      (c) =>
        (c.contact_name?.toLowerCase().includes(searchLower) ||
          c.first_name?.toLowerCase().includes(searchLower) ||
          c.phone?.toLowerCase().includes(searchLower) ||
          c.jid?.toLowerCase().includes(searchLower))
    );
  }, [contacts, searchLower]);
  const filteredGroups = useMemo(() => {
    if (!searchLower) return groups;
    return groups.filter(
      (g) =>
        (g.name?.toLowerCase().includes(searchLower) || g.topic?.toLowerCase().includes(searchLower))
    );
  }, [groups, searchLower]);
  const filteredBlockList = useMemo(() => {
    if (!searchLower) return blockList;
    return blockList.filter((jid) => jid.toLowerCase().includes(searchLower));
  }, [blockList, searchLower]);

  const table = useReactTable({
    data: filteredContacts,
    columns: contactColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: PAGE_SIZE } },
  });

  const groupsTable = useReactTable({
    data: filteredGroups,
    columns: groupColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: PAGE_SIZE } },
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
        <h1 className="text-2xl font-bold text-[#1E293B]">Contatos e grupos</h1>
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
                  : activeTab === "groups" || activeTab === "groupsManage"
                    ? "Buscar grupos..."
                    : activeTab === "blocked"
                      ? "Buscar bloqueados..."
                      : "Buscar..."
              }
              className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange min-w-[160px] sm:min-w-[180px]"
            />
          </div>
          <div className="flex flex-nowrap items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-1">
            {channels.map((ch) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => handleSync(ch.id)}
                disabled={syncing !== null}
                className="inline-flex items-center gap-1.5 rounded-md bg-clicvend-orange px-3 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60 whitespace-nowrap"
              >
                {syncing === ch.id ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : <RefreshCw className="h-4 w-4 shrink-0" />}
                {ch.name}
              </button>
            ))}
            {channels.length > 1 && (
              <button
                type="button"
                onClick={handleSyncAll}
                disabled={syncing !== null}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-[#64748B] hover:bg-white hover:text-clicvend-orange hover:border-clicvend-orange disabled:opacity-60 whitespace-nowrap"
              >
                {syncing !== null ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : <RefreshCw className="h-4 w-4 shrink-0" />}
                Todos
              </button>
            )}
          </div>
          {channels.length === 0 && !loading && (
            <Link
              href={slug ? `/${slug}/conexoes` : "/conexoes"}
              className="text-sm font-medium text-clicvend-orange hover:underline"
            >
              Conectar um número em Conexões para sincronizar contatos e grupos
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
          Contatos ({contacts.length})
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
          onClick={() => setActiveTab("groupsManage")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "groupsManage" ? "border-clicvend-orange text-clicvend-orange" : "border-transparent text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          <MessageCircle className="h-4 w-4" />
          Grupos e comunidades
          </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-clicvend-orange" />
        </div>
      ) : activeTab === "contacts" ? (
        <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden flex flex-col">
          {contacts.length === 0 ? (
            <div className="p-8 text-center text-[#64748B]">
              <Users className="mx-auto h-12 w-12 text-[#94A3B8]" />
              <p className="mt-2">Nenhum contato sincronizado.</p>
              <p className="mt-1 text-sm">Conecte um número em Conexões e clique em Sincronizar para trazer a agenda.</p>
            </div>
          ) : (
            <>
              <div className="overflow-auto max-h-[60vh] min-h-[200px]">
                <table className="w-full min-w-[520px] border-collapse">
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
                    {table.getRowModel().rows.map((row) => (
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
                  Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount() || 1} ({contacts.length} contatos)
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
                  Página {groupsTable.getState().pagination.pageIndex + 1} de {groupsTable.getPageCount() || 1} ({groups.length} grupos)
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
        <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full min-w-[400px]">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
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
                      ? { contact_name: contact.contact_name, first_name: contact.first_name, phone: contact.phone }
                      : null;
                    return (
                      <BlockedRow
                        key={jid}
                        jid={jid}
                        channelId={filterChannelId}
                        contactInfo={contactInfo}
                        apiHeaders={apiHeaders}
                        onUnblock={() => fetchBlockList()}
                      />
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === "groupsManage" ? (
        <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden flex flex-col gap-6 p-6">
          {!filterChannelId ? (
            <div className="p-8 text-center text-[#64748B]">
              <MessageCircle className="mx-auto h-12 w-12 text-[#94A3B8]" />
              <p className="mt-2">Selecione uma conexão para criar grupos ou entrar por link de convite.</p>
            </div>
          ) : (
            <>
              <GroupsManageActions
                channelId={filterChannelId}
                channelName={channelName(filterChannelId)}
                contacts={contacts}
                groups={groups}
                apiHeaders={apiHeaders}
                onSuccess={() => fetchGroups()}
                setAlertMessage={setAlertMessage}
              />
              <div>
                <h2 className="text-lg font-semibold text-[#1E293B] mb-3">Seus grupos nesta conexão</h2>
                {filteredGroups.filter((g) => g.channel_id === filterChannelId).length === 0 ? (
                  <p className="text-sm text-[#64748B]">
                    {groups.filter((g) => g.channel_id === filterChannelId).length === 0
                      ? "Nenhum grupo nesta conexão. Crie um ou entre por link acima."
                      : "Nenhum resultado para a busca."}
                  </p>
                ) : (
                  <div className="overflow-auto max-h-[40vh] rounded-lg border border-[#E2E8F0]">
                    <table className="w-full min-w-[400px]">
                      <thead>
                        <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">Nome</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">Descrição</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[#64748B]">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredGroups
                          .filter((g) => g.channel_id === filterChannelId)
                          .map((group) => (
                            <tr key={group.jid} className="border-b border-[#E2E8F0] hover:bg-[#F8FAFC]">
                              <td className="px-4 py-3 font-medium text-[#1E293B]">{group.name ?? "—"}</td>
                              <td className="px-4 py-3 text-sm text-[#64748B] max-w-[200px] truncate" title={group.topic ?? ""}>{group.topic ?? "—"}</td>
                              <td className="px-4 py-3 text-right">
            <button
              type="button"
              onClick={() => openGroupDetail(group)}
              className="mr-2 rounded p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-clicvend-orange"
              title="Ver detalhes"
              aria-label="Ver detalhes do grupo"
            >
              <Eye className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setManageGroup(group);
                setManageGroupOpen(true);
              }}
              className="rounded p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-clicvend-orange"
              title="Gerenciar"
              aria-label="Gerenciar grupo"
            >
              <Settings className="h-4 w-4" />
            </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
                )}
          </div>
        </>
      )}
        </div>
      ) : null}

      <ContactDetailSideOver
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setDetailContact(null); }}
        contact={detailContact}
        channelName={detailContact ? channelName(detailContact.channel_id) : ""}
        companySlug={slug}
        onBlockChange={() => fetchBlockList()}
      />

      <GroupDetailSideOver
        open={detailGroupOpen}
        onClose={() => { setDetailGroupOpen(false); setDetailGroup(null); }}
        group={detailGroup}
        channelName={detailGroup ? channelName(detailGroup.channel_id) : ""}
        companySlug={slug}
        onLeaveSuccess={() => { fetchGroups(); setDetailGroupOpen(false); setDetailGroup(null); }}
      />

      <GroupManageSideOver
        open={manageGroupOpen}
        onClose={() => { setManageGroupOpen(false); setManageGroup(null); }}
        group={manageGroup}
        channelName={manageGroup ? channelName(manageGroup.channel_id) : ""}
        companySlug={slug}
        onLeaveSuccess={() => { fetchGroups(); setManageGroupOpen(false); setManageGroup(null); }}
        onUpdateSuccess={() => fetchGroups()}
      />

      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Excluir contato"
        message="Remover este contato da lista? Ele continuará na agenda do WhatsApp; apenas deixará de aparecer aqui até a próxima sincronização."
        confirmLabel="Excluir"
        variant="danger"
        onConfirm={handleDeleteContact}
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
