"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { SideOver } from "@/components/SideOver";
import {
  Loader2,
  MessageCircle,
  LogOut,
  Link2,
  Shield,
  Lock,
  Settings,
  Users,
  UserCheck,
  Info,
  RefreshCw,
  UserPlus,
  UserMinus,
  Crown,
  UserCog,
  Copy,
  FolderOpen,
  Bell,
  Star,
  LockKeyhole,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { Group } from "./GroupDetailSideOver";
import { FileDropzone } from "@/components/FileDropzone";

type GroupParticipant = {
  JID?: string;
  IsAdmin?: boolean;
  [key: string]: unknown;
};

function GenerateDescriptionButton({
  type,
  field = "description",
  name,
  context,
  apiHeaders,
  onGenerated,
  onError,
  disabled,
  className = "",
}: {
  type: "community" | "group";
  field?: "description" | "name";
  name: string;
  context?: string;
  apiHeaders: Record<string, string> | undefined;
  onGenerated: (text: string) => void;
  onError: (msg: string | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const label = field === "name" ? "Gerar nome com IA" : "Gerar com IA";
  return (
    <button
      type="button"
      onClick={async () => {
        setLoading(true);
        onError(null);
        try {
          const res = await fetch("/api/ai/generate-description", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json", ...apiHeaders },
            body: JSON.stringify({ type, field, name: name || undefined, context: context || undefined }),
          });
          const data = await res.json();
          if (res.ok && typeof data?.text === "string") {
            onGenerated(data.text);
          } else {
            onError(data?.error ?? (field === "name" ? "Falha ao gerar nome com IA." : "Falha ao gerar descrição com IA."));
          }
        } catch {
          onError("Erro de rede ao gerar com IA.");
        } finally {
          setLoading(false);
        }
      }}
      disabled={disabled || loading}
      className={`shrink-0 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9] hover:text-clicvend-orange disabled:opacity-50 inline-flex items-center gap-1.5 ${className}`}
      title={field === "name" ? "Gerar nome com IA" : "Gerar descrição com IA"}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      {label}
    </button>
  );
}

type GroupInfo = {
  JID?: string;
  Name?: string;
  Topic?: string;
  InviteLink?: string;
  IsLocked?: boolean;
  IsAnnounce?: boolean;
  IsCommunity?: boolean;
  Participants?: GroupParticipant[];
  [key: string]: unknown;
};

type GroupManageSideOverProps = {
  open: boolean;
  onClose: () => void;
  group: Group | null;
  channelName: string;
  companySlug: string;
  onLeaveSuccess?: () => void;
  onUpdateSuccess?: () => void;
};

const TABS = [
  { id: "info", label: "Informações", icon: Info },
  { id: "config", label: "Configurações", icon: Settings },
  { id: "participants", label: "Participantes", icon: Users },
  { id: "attendants", label: "Atendentes responsáveis", icon: UserCheck },
  { id: "leave", label: "Sair", icon: LogOut },
] as const;

type TabId = (typeof TABS)[number]["id"];

function apiCall(
  url: string,
  body: Record<string, unknown>,
  apiHeaders: Record<string, string> | undefined
): Promise<{ ok: boolean; error?: string }> {
  return fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...apiHeaders },
    body: JSON.stringify(body),
  }).then(async (r) => {
    const data = await r.json();
    return { ok: r.ok, error: data?.error };
  });
}

export function GroupManageSideOver({
  open,
  onClose,
  group,
  channelName,
  companySlug,
  onLeaveSuccess,
  onUpdateSuccess,
}: GroupManageSideOverProps) {
  const [info, setInfo] = useState<GroupInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("info");
  const [leaving, setLeaving] = useState(false);
  const [deletingFromList, setDeletingFromList] = useState(false);

  const apiHeaders = useMemo(
    () => (companySlug ? { "X-Company-Slug": companySlug } : undefined),
    [companySlug]
  );

  const fetchInfo = useCallback(() => {
    if (!group) return;
    setLoading(true);
    setError(null);
    setInfo(null);
    fetch("/api/groups/info", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...apiHeaders },
      body: JSON.stringify({ channel_id: group.channel_id, groupjid: group.jid, getInviteLink: true }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (r.ok) setInfo(data);
        else setError(data?.error ?? "Falha ao carregar informações do grupo");
      })
      .catch(() => setError("Erro de rede"))
      .finally(() => setLoading(false));
  }, [group, apiHeaders]);

  useEffect(() => {
    if (open && group) fetchInfo();
    else if (!open) {
      setInfo(null);
      setError(null);
    }
  }, [open, group, fetchInfo]);

  const displayName = info?.Name ?? group?.name ?? "—";
  const topic = info?.Topic ?? group?.topic ?? null;
  const inviteLink = info?.InviteLink ?? group?.invite_link ?? null;
  const participants = info?.Participants ?? [];

  const handleLeave = () => {
    if (!group || !window.confirm("Tem certeza que deseja sair deste grupo?")) return;
    setLeaving(true);
    setError(null);
    apiCall(
      "/api/groups/leave",
      { channel_id: group.channel_id, groupjid: group.jid },
      apiHeaders
    )
      .then(({ ok, error: err }) => {
        if (ok) {
          onLeaveSuccess?.();
          onClose();
        } else setError(err ?? "Falha ao sair do grupo");
      })
      .finally(() => setLeaving(false));
  };

  const handleDeleteFromList = async () => {
    if (!group?.jid || !group?.channel_id || !window.confirm("Excluir este grupo/comunidade da lista e sair no WhatsApp? Esta ação não pode ser desfeita.")) return;
    setDeletingFromList(true);
    setError(null);
    try {
      const res = await fetch("/api/groups/delete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ channel_id: group.channel_id, groupjid: group.jid, leave_first: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onLeaveSuccess?.();
        onClose();
      } else {
        setError(data?.error ?? "Falha ao excluir");
      }
    } catch {
      setError("Erro de rede ao excluir");
    } finally {
      setDeletingFromList(false);
    }
  };

  if (!group) {
    return (
      <SideOver open={open} onClose={onClose} title="Gerenciar grupos e comunidades" width={880}>
        <p className="text-sm text-[#64748B]">Nenhum grupo selecionado.</p>
      </SideOver>
    );
  }

  return (
    <SideOver open={open} onClose={onClose} title="Gerenciar grupos e comunidades" width={880}>
      <div className="flex flex-col gap-4">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-clicvend-orange" />
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {error}
          </div>
        )}
        {!loading && info && (
          <>
            <div className="flex flex-col items-center gap-2 border-b border-[#E2E8F0] pb-4">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-[#E2E8F0] flex items-center justify-center">
                <MessageCircle className="h-8 w-8 text-[#94A3B8]" />
              </div>
              <p className="font-semibold text-[#1E293B] text-center">{displayName}</p>
              <p className="text-xs text-[#94A3B8]">{channelName}</p>
            </div>

            <div className="flex gap-1 pb-2 overflow-x-auto">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-1.5 shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    activeTab === id
                      ? "bg-clicvend-orange/10 text-clicvend-orange"
                      : "text-[#64748B] hover:bg-[#F1F5F9]"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>

            {activeTab === "info" && (
              <GroupInfoTab
                displayName={displayName}
                topic={topic}
                inviteLink={inviteLink}
                info={info}
                participants={participants}
                onGoToParticipants={() => setActiveTab("participants")}
              />
            )}
            {activeTab === "config" && (
              <GroupConfigTab
                group={group}
                info={info}
                apiHeaders={apiHeaders}
                onSuccess={() => {
                  setError(null);
                  fetchInfo();
                  onUpdateSuccess?.();
                }}
                onError={setError}
              />
            )}
            {activeTab === "participants" && (
              <GroupParticipantsTab
                group={group}
                participants={participants}
                apiHeaders={apiHeaders}
                onSuccess={() => {
                  setError(null);
                  fetchInfo();
                  onUpdateSuccess?.();
                }}
                onError={setError}
              />
            )}
            {activeTab === "attendants" && (
              <GroupAttendantsTab
                group={group}
                apiHeaders={apiHeaders}
                onError={setError}
              />
            )}
            {activeTab === "leave" && (
              <div className="border-t border-[#E2E8F0] pt-4 space-y-3">
                <p className="text-sm text-[#64748B]">
                  Sair do grupo remove o número do grupo no WhatsApp. Excluir da lista também remove da nossa lista e sai no WhatsApp.
                </p>
                <button
                  type="button"
                  onClick={handleLeave}
                  disabled={leaving}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                >
                  {leaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                  Sair do grupo
                </button>
                <button
                  type="button"
                  onClick={handleDeleteFromList}
                  disabled={leaving || deletingFromList}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-300 bg-red-100 px-4 py-3 text-sm font-medium text-red-800 hover:bg-red-200 disabled:opacity-60"
                >
                  {deletingFromList ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Excluir da lista e sair
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </SideOver>
  );
}

function GroupInfoTab({
  displayName,
  topic,
  inviteLink,
  info,
  participants,
  onGoToParticipants,
}: {
  displayName: string;
  topic: string | null;
  inviteLink: string | null;
  info: GroupInfo;
  participants: GroupParticipant[];
  onGoToParticipants: () => void;
}) {
  const formatJid = (jid: string) => jid.replace(/@s\.whatsapp\.net$/, "").replace(/@.*$/, "");
  return (
    <div className="space-y-0 text-sm">
      {topic ? (
        <div className="py-3 border-b border-[#E2E8F0]">
          <p className="text-[#64748B] text-xs font-medium uppercase tracking-wider mb-0.5">Descrição</p>
          <p className="text-[#1E293B] break-words">{topic}</p>
        </div>
      ) : null}

      <button
        type="button"
        className="w-full flex items-center justify-between py-3 border-b border-[#E2E8F0] text-left hover:bg-[#F8FAFC] rounded-lg -mx-1 px-1"
      >
        <span className="flex items-center gap-3 text-[#1E293B]">
          <FolderOpen className="h-5 w-5 text-[#94A3B8]" />
          Mídia, links e docs
        </span>
        <span className="text-[#94A3B8] text-xs">0</span>
      </button>

      <div className="py-3 border-b border-[#E2E8F0]">
        <button
          type="button"
          onClick={onGoToParticipants}
          className="w-full flex items-center justify-between text-left hover:bg-[#F8FAFC] rounded-lg -mx-1 px-1 py-1"
        >
          <span className="flex items-center gap-3 text-[#1E293B]">
            <Users className="h-5 w-5 text-[#94A3B8]" />
            Participantes
          </span>
          <span className="text-[#94A3B8] text-xs">{participants.length}</span>
        </button>
        <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
          {participants.slice(0, 8).map((p) => {
            const jid = p.JID ?? "";
            const isAdmin = p.IsAdmin === true;
            return (
              <li key={jid} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-[#F8FAFC]">
                <div className="h-8 w-8 rounded-full bg-[#E2E8F0] flex items-center justify-center shrink-0">
                  {isAdmin ? <Crown className="h-4 w-4 text-amber-500" /> : <UserCog className="h-4 w-4 text-[#94A3B8]" />}
                </div>
                <span className="text-[#1E293B] truncate">{formatJid(jid)}</span>
              </li>
            );
          })}
        </ul>
        {participants.length > 8 && (
          <button
            type="button"
            onClick={onGoToParticipants}
            className="text-clicvend-orange text-xs font-medium mt-1 hover:underline"
          >
            Ver todos os {participants.length} participantes
          </button>
        )}
      </div>

      <button
        type="button"
        className="w-full flex items-center gap-3 py-3 border-b border-[#E2E8F0] text-[#1E293B] hover:bg-[#F8FAFC] rounded-lg -mx-1 px-1"
      >
        <Star className="h-5 w-5 text-[#94A3B8]" />
        Mensagens favoritas
      </button>
      <button
        type="button"
        className="w-full flex items-center gap-3 py-3 border-b border-[#E2E8F0] text-[#1E293B] hover:bg-[#F8FAFC] rounded-lg -mx-1 px-1"
      >
        <Bell className="h-5 w-5 text-[#94A3B8]" />
        Configurações de notificação
      </button>
      <div className="py-3 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-3">
          <LockKeyhole className="h-5 w-5 text-[#94A3B8] shrink-0" />
          <div>
            <p className="font-medium text-[#1E293B]">Criptografia</p>
            <p className="text-xs text-[#64748B] mt-0.5">
              As mensagens são protegidas com a criptografia de ponta a ponta. Clique para saber mais.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-3">
        <span className="inline-flex items-center gap-1 rounded-full bg-[#F1F5F9] px-2.5 py-1 text-xs text-[#64748B]">
          <Shield className="h-3.5 w-3.5" />
          {info.IsAnnounce ? "Só admins enviam" : "Todos podem enviar"}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-[#F1F5F9] px-2.5 py-1 text-xs text-[#64748B]">
          <Lock className="h-3.5 w-3.5" />
          {info.IsLocked ? "Só admins editam" : "Todos podem editar"}
        </span>
      </div>
      {inviteLink ? (
        <div className="pt-3 border-t border-[#E2E8F0]">
          <p className="text-[#64748B] font-medium mb-1 flex items-center gap-1">
            <Link2 className="h-3.5 w-3.5" /> Link de convite
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={inviteLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-clicvend-orange hover:underline break-all text-xs"
            >
              {inviteLink}
            </a>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(inviteLink)}
              className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs font-medium text-[#64748B] hover:bg-[#F1F5F9] hover:text-clicvend-orange"
            >
              <Copy className="h-3.5 w-3.5" />
              Copiar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function GroupConfigTab({
  group,
  info,
  apiHeaders,
  onSuccess,
  onError,
}: {
  group: Group;
  info: GroupInfo | null;
  apiHeaders: Record<string, string> | undefined;
  onSuccess: () => void;
  onError: (msg: string | null) => void;
}) {
  const [name, setName] = useState(info?.Name ?? group.name ?? "");
  const [description, setDescription] = useState(info?.Topic ?? group.topic ?? "");
  const [imageUploading, setImageUploading] = useState(false);
  const [announce, setAnnounce] = useState(info?.IsAnnounce ?? false);
  const [locked, setLocked] = useState(info?.IsLocked ?? false);
  const [savingAll, setSavingAll] = useState(false);
  const [resettingLink, setResettingLink] = useState(false);

  useEffect(() => {
    if (info) {
      setName(info.Name ?? group.name ?? "");
      setDescription(info.Topic ?? group.topic ?? "");
      setAnnounce(info.IsAnnounce ?? false);
      setLocked(info.IsLocked ?? false);
    }
  }, [info, group.name, group.topic]);

  const base = { channel_id: group.channel_id, groupjid: group.jid };
  const currentName = (info?.Name ?? group.name ?? "").trim();
  const currentDesc = info?.Topic ?? group.topic ?? "";
  const currentAnnounce = info?.IsAnnounce ?? false;
  const currentLocked = info?.IsLocked ?? false;
  const hasChanges =
    name.trim() !== currentName ||
    description.trim() !== currentDesc ||
    announce !== currentAnnounce ||
    locked !== currentLocked;

  const handleSaveAll = () => {
    if (!hasChanges) return;
    setSavingAll(true);
    onError(null);
    const promises: Promise<{ ok: boolean; error?: string }>[] = [];
    if (name.trim() !== currentName && name.trim()) {
      promises.push(apiCall("/api/groups/update-name", { ...base, name: name.trim() }, apiHeaders));
    }
    if (description.trim() !== currentDesc) {
      promises.push(apiCall("/api/groups/update-description", { ...base, description: description.trim() }, apiHeaders));
    }
    if (announce !== currentAnnounce) {
      promises.push(apiCall("/api/groups/update-announce", { ...base, announce }, apiHeaders));
    }
    if (locked !== currentLocked) {
      promises.push(apiCall("/api/groups/update-locked", { ...base, locked }, apiHeaders));
    }
    Promise.all(promises).then((results) => {
      setSavingAll(false);
      const failed = results.find((r) => !r.ok);
      if (failed?.error) {
        onError(failed.error);
        return;
      }
      onSuccess();
    });
  };

  const handleResetInvite = () => {
    if (!window.confirm("Isso vai invalidar o link atual. Continuar?")) return;
    setResettingLink(true);
    onError(null);
    apiCall("/api/groups/reset-invite", base, apiHeaders).then(({ ok, error: err }) => {
      setResettingLink(false);
      if (ok) onSuccess();
      else onError(err ?? "Falha ao resetar link");
    });
  };

  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-[#64748B] mb-1">
        Edite os campos abaixo e clique em <strong>Salvar</strong> para que as alterações reflitam no grupo no WhatsApp.
      </p>
      <div>
        <label className="block text-[#64748B] font-medium mb-1">Nome do grupo</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={savingAll}
          placeholder="Nome do grupo"
          maxLength={25}
          className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] disabled:opacity-60"
        />
        <GenerateDescriptionButton
          type="group"
          field="name"
          name={name.trim()}
          apiHeaders={apiHeaders}
          onGenerated={setName}
          onError={onError}
          disabled={!!savingAll}
          className="mt-2"
        />
      </div>
      <div>
        <label className="block text-[#64748B] font-medium mb-1">Descrição</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={savingAll}
          rows={4}
          placeholder="Descrição do grupo"
          className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] disabled:opacity-60 resize-y min-h-[80px]"
        />
        <GenerateDescriptionButton
          type="group"
          name={(info?.Name ?? group.name ?? "").trim()}
          apiHeaders={apiHeaders}
          onGenerated={setDescription}
          onError={onError}
          disabled={!!savingAll}
          className="mt-2"
        />
      </div>
      <div>
        <label className="block text-[#64748B] font-medium mb-1">Imagem do grupo</label>
        <FileDropzone
          accept="image/*"
          maxSize={5 * 1024 * 1024}
          loading={imageUploading}
          disabled={!!savingAll}
          label="Arraste uma imagem ou clique para selecionar"
          onFileSelect={async (file) => {
            setImageUploading(true);
            try {
              const form = new FormData();
              form.append("file", file);
              form.append("type", "group-image");
              const res = await fetch("/api/upload/company-asset", {
                method: "POST",
                body: form,
                headers: apiHeaders ?? {},
                credentials: "include",
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok || !data?.url) {
                onError(data?.error ?? "Falha no upload da imagem");
                setImageUploading(false);
                return;
              }
              apiCall("/api/groups/update-image", { ...base, image: data.url }, apiHeaders).then(
                ({ ok, error: err }) => {
                  setImageUploading(false);
                  if (ok) onSuccess();
                  else onError(err ?? "Falha ao atualizar imagem do grupo");
                }
              );
            } catch (e) {
              onError(e instanceof Error ? e.message : "Erro ao enviar imagem");
              setImageUploading(false);
            }
          }}
        />
      </div>
      <div>
        <label className="block text-[#64748B] font-medium mb-1">Link de convite</label>
        {(info?.InviteLink ?? group?.invite_link) ? (
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-[#1E293B] text-sm break-all flex-1 min-w-0">
              {info?.InviteLink ?? group?.invite_link}
            </span>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText((info?.InviteLink ?? group?.invite_link) ?? "")}
              className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs font-medium text-[#64748B] hover:bg-[#F1F5F9] hover:text-clicvend-orange"
            >
              <Copy className="h-3.5 w-3.5" />
              Copiar
            </button>
          </div>
        ) : null}
        <button
          type="button"
          onClick={handleResetInvite}
          disabled={resettingLink || savingAll}
          className="inline-flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9] disabled:opacity-60"
        >
          {resettingLink ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Gerar novo link
        </button>
      </div>
      <div className="flex items-center justify-between rounded-lg border border-[#E2E8F0] px-3 py-2">
        <span className="text-[#1E293B]">Todos podem enviar mensagens</span>
        <button
          type="button"
          role="switch"
          aria-checked={!announce}
          onClick={() => setAnnounce((prev) => !prev)}
          disabled={savingAll}
          className={`relative h-6 w-11 rounded-full transition-colors ${announce ? "bg-[#E2E8F0]" : "bg-clicvend-orange"}`}
        >
          <span
            className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${announce ? "left-1" : "left-6"}`}
          />
        </button>
      </div>
      <div className="flex items-center justify-between rounded-lg border border-[#E2E8F0] px-3 py-2">
        <span className="text-[#1E293B]">Todos podem editar informações</span>
        <button
          type="button"
          role="switch"
          aria-checked={!locked}
          onClick={() => setLocked((prev) => !prev)}
          disabled={savingAll}
          className={`relative h-6 w-11 rounded-full transition-colors ${locked ? "bg-clicvend-orange" : "bg-[#E2E8F0]"}`}
        >
          <span
            className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${locked ? "left-6" : "left-1"}`}
          />
        </button>
      </div>
      <div className="pt-2 border-t border-[#E2E8F0]">
        <button
          type="button"
          onClick={handleSaveAll}
          disabled={!hasChanges || savingAll}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-clicvend-orange px-4 py-3 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-50 disabled:pointer-events-none"
        >
          {savingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Salvar alterações
        </button>
      </div>
    </div>
  );
}

function GroupParticipantsTab({
  group,
  participants,
  apiHeaders,
  onSuccess,
  onError,
}: {
  group: Group;
  participants: GroupParticipant[];
  apiHeaders: Record<string, string> | undefined;
  onSuccess: () => void;
  onError: (msg: string | null) => void;
}) {
  const [addJids, setAddJids] = useState("");
  const [actioning, setActioning] = useState<string | null>(null);
  const base = { channel_id: group.channel_id, groupjid: group.jid };

  const runAction = (action: string, jids: string[]) => {
    if (jids.length === 0) return;
    setActioning(action);
    onError(null);
    apiCall("/api/groups/update-participants", { ...base, action, participants: jids }, apiHeaders).then(
      ({ ok, error: err }) => {
        setActioning(null);
        if (ok) onSuccess();
        else onError(err ?? "Falha na ação");
      }
    );
  };

  const handleAdd = () => {
    const list = addJids
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((n) => (n.includes("@") ? n : `${n}@s.whatsapp.net`));
    if (list.length) {
      runAction("add", list);
      setAddJids("");
    }
  };

  const formatJid = (jid: string) => jid.replace(/@s\.whatsapp\.net$/, "").replace(/@.*$/, "");

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-[#64748B] font-medium mb-1">Adicionar participantes (número ou JID)</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={addJids}
            onChange={(e) => setAddJids(e.target.value)}
            placeholder="5511999999999 ou 55..."
            className="flex-1 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B]"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!addJids.trim() || actioning !== null}
            className="inline-flex items-center gap-1 rounded-lg bg-clicvend-orange px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            <UserPlus className="h-4 w-4" />
            Adicionar
          </button>
        </div>
      </div>
      <div>
        <p className="text-[#64748B] font-medium mb-2">Participantes ({participants.length})</p>
        <ul className="space-y-1 max-h-48 overflow-y-auto">
          {participants.map((p) => {
            const jid = p.JID ?? "";
            const isAdmin = p.IsAdmin === true;
            return (
              <li
                key={jid}
                className="flex items-center justify-between rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2 text-[#1E293B]">
                  {isAdmin ? <Crown className="h-4 w-4 text-amber-500" /> : <UserCog className="h-4 w-4 text-[#94A3B8]" />}
                  {formatJid(jid)}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    title={isAdmin ? "Rebaixar" : "Promover"}
                    onClick={() => runAction(isAdmin ? "demote" : "promote", [jid])}
                    disabled={actioning !== null}
                    className="rounded p-1 text-[#64748B] hover:bg-[#F1F5F9] hover:text-clicvend-orange disabled:opacity-50"
                    aria-label={isAdmin ? "Rebaixar participante" : "Promover participante para admin"}
                  >
                    {isAdmin ? <UserCog className="h-4 w-4" /> : <Crown className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    title="Remover"
                    onClick={() => runAction("remove", [jid])}
                    disabled={actioning !== null}
                    className="rounded p-1 text-[#64748B] hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    aria-label="Remover participante do grupo"
                  >
                    <UserMinus className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

type Agent = { id: string; user_id: string; full_name: string; email?: string };

function GroupAttendantsTab({
  group,
  apiHeaders,
  onError,
}: {
  group: Group;
  apiHeaders: Record<string, string> | undefined;
  onError: (msg: string | null) => void;
}) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!group) return;
    setLoading(true);
    const channelId = group.channel_id;
    const groupJid = group.jid;
    Promise.all([
      fetch("/api/company/agents", { credentials: "include", headers: apiHeaders }).then((r) => r.json()),
      fetch(`/api/groups/assignments?channel_id=${encodeURIComponent(channelId)}&group_jid=${encodeURIComponent(groupJid)}`, {
        credentials: "include",
        headers: apiHeaders,
      }).then((r) => r.json()),
    ])
      .then(([agentsList, assignments]) => {
        setAgents(Array.isArray(agentsList) ? agentsList : []);
        setAssignedUserIds(Array.isArray(assignments?.user_ids) ? assignments.user_ids : []);
      })
      .catch(() => onError("Erro ao carregar atendentes"))
      .finally(() => setLoading(false));
  }, [group?.channel_id, group?.jid, apiHeaders]);

  const toggle = (userId: string) => {
    setAssignedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSave = () => {
    setSaving(true);
    onError(null);
    fetch("/api/groups/assignments", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...apiHeaders },
      body: JSON.stringify({
        channel_id: group.channel_id,
        group_jid: group.jid,
        user_ids: assignedUserIds,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data?.error) onError(data.error);
      })
      .catch(() => onError("Erro ao salvar"))
      .finally(() => setSaving(false));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-clicvend-orange" />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-[#64748B]">
        Atendentes responsáveis por este grupo ou comunidade poderão ver e interagir com as conversas aqui no chat.
      </p>
      <div className="max-h-48 overflow-y-auto rounded-lg border border-[#E2E8F0] bg-white p-2">
        {agents.length === 0 ? (
          <p className="text-sm text-[#64748B]">Nenhum atendente cadastrado na empresa.</p>
        ) : (
          agents.map((a) => (
            <label key={a.user_id} className="flex items-center gap-2 py-2 px-2 rounded hover:bg-[#F8FAFC] cursor-pointer">
              <input
                type="checkbox"
                checked={assignedUserIds.includes(a.user_id)}
                onChange={() => toggle(a.user_id)}
                className="rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
              />
              <span className="text-sm font-medium text-[#1E293B]">{a.full_name}</span>
              {a.email && <span className="text-xs text-[#64748B]">({a.email})</span>}
            </label>
          ))
        )}
      </div>
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
        Salvar atendentes
      </button>
    </div>
  );
}
