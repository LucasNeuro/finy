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
import { RefreshCw, Users, MessageCircle, Loader2, Plug, Eye, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ContactDetailSideOver, type Contact } from "./ContactDetailSideOver";

type Channel = { id: string; name: string };
type Group = { id: string; channel_id: string; jid: string; name: string | null; topic: string | null; invite_link: string | null; synced_at: string };

const PAGE_SIZE = 25;

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
  const [activeTab, setActiveTab] = useState<"contacts" | "groups">("contacts");
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const [detailContact, setDetailContact] = useState<Contact | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? id.slice(0, 8);

  const openDetail = (contact: Contact) => {
    setDetailContact(contact);
    setDetailOpen(true);
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
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => openDetail(row.original)}
              className="rounded p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-clicvend-orange"
              title="Ver detalhes"
            >
              <Eye className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setDeleteConfirm(row.original)}
              className="rounded p-2 text-[#64748B] hover:bg-red-50 hover:text-red-600"
              title="Excluir da lista"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ),
      },
    ],
    [channels]
  );

  const table = useReactTable({
    data: contacts,
    columns: contactColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: PAGE_SIZE } },
  });

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-[#1E293B]">Contatos e grupos</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[#64748B]">Conexão:</span>
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
          {channels.map((ch) => (
            <button
              key={ch.id}
              type="button"
              onClick={() => handleSync(ch.id)}
              disabled={syncing !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-clicvend-orange px-3 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
            >
              {syncing === ch.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sincronizar {ch.name}
            </button>
          ))}
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

      <p className="text-sm text-[#64748B]">
        Contatos e grupos são sincronizados da agenda e dos grupos do WhatsApp de cada número. Use <strong>Sincronizar</strong> após conectar um número para trazer contatos e grupos para cá.
      </p>

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
      ) : (
        <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
          {groups.length === 0 ? (
            <div className="p-8 text-center text-[#64748B]">
              <MessageCircle className="mx-auto h-12 w-12 text-[#94A3B8]" />
              <p className="mt-2">Nenhum grupo sincronizado.</p>
              <p className="mt-1 text-sm">Quando o número for adicionado a grupos, sincronize para listar aqui.</p>
            </div>
          ) : (
            <div className="overflow-auto max-h-[60vh]">
              <table className="w-full min-w-[520px]">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">Nome</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">Descrição</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">Conexão</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.id} className="border-b border-[#E2E8F0] hover:bg-[#F8FAFC]">
                      <td className="px-4 py-3 font-medium text-[#1E293B]">{g.name || "—"}</td>
                      <td className="px-4 py-3 text-sm text-[#64748B] max-w-[200px] truncate" title={g.topic ?? undefined}>
                        {g.topic || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-sm text-[#64748B]">
                          <Plug className="h-4 w-4 text-clicvend-orange" />
                          {channelName(g.channel_id)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <ContactDetailSideOver
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setDetailContact(null); }}
        contact={detailContact}
        channelName={detailContact ? channelName(detailContact.channel_id) : ""}
        companySlug={slug}
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
      <ConfirmDialog
        open={!!alertMessage}
        onClose={() => setAlertMessage(null)}
        title="Aviso"
        message={alertMessage ?? ""}
        confirmLabel="OK"
        alertOnly
        onConfirm={() => setAlertMessage(null)}
      />
    </div>
  );
}
