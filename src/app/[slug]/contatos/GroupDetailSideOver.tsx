"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { SideOver } from "@/components/SideOver";
import {
  Loader2,
  MessageCircle,
  LogOut,
  Settings,
  Users,
  Info,
  Link2,
  RefreshCw,
  Shield,
  Lock,
  UserPlus,
  UserMinus,
  ShieldPlus,
  ShieldMinus,
} from "lucide-react";

export type Group = {
  id: string;
  channel_id: string;
  jid: string;
  name: string | null;
  topic: string | null;
  invite_link: string | null;
  synced_at: string;
};

type GroupParticipant = {
  JID?: string;
  IsAdmin?: boolean;
  [key: string]: unknown;
};

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

type GroupDetailSideOverProps = {
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
  { id: "settings", label: "Configurações", icon: Settings },
  { id: "participants", label: "Participantes", icon: Users },
  { id: "leave", label: "Sair", icon: LogOut },
] as const;

export function GroupDetailSideOver({
  open,
  onClose,
  group,
  channelName,
  companySlug,
  onLeaveSuccess,
  onUpdateSuccess,
}: GroupDetailSideOverProps) {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]["id"]>("info");
  const [info, setInfo] = useState<GroupInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [leaving, setLeaving] = useState(false);

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
      setActiveTab("info");
    }
  }, [open, group, fetchInfo]);

  const displayName = info?.Name ?? group?.name ?? "—";
  const topic = info?.Topic ?? group?.topic ?? null;
  const inviteLink = info?.InviteLink ?? group?.invite_link ?? null;
  const participants = info?.Participants ?? [];

  const runAction = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      if (!group) return;
      setActionLoading(true);
      setError(null);
      try {
        const r = await fetch(path, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...apiHeaders },
          body: JSON.stringify({ channel_id: group.channel_id, groupjid: group.jid, ...body }),
        });
        const data = await r.json();
        if (r.ok) {
          if (data.group) setInfo((prev) => (prev ? { ...prev, ...data.group } : data.group));
          if (data.inviteLink) setInfo((prev) => (prev ? { ...prev, InviteLink: data.inviteLink } : { InviteLink: data.inviteLink }));
          onUpdateSuccess?.();
          fetchInfo();
        } else {
          setError(data?.error ?? "Falha na operação");
        }
      } catch {
        setError("Erro de rede");
      } finally {
        setActionLoading(false);
      }
    },
    [group, apiHeaders, fetchInfo, onUpdateSuccess]
  );

  const handleLeave = () => {
    if (!group || !window.confirm("Tem certeza que deseja sair deste grupo?")) return;
    setLeaving(true);
    setError(null);
    fetch("/api/groups/leave", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...apiHeaders },
      body: JSON.stringify({ channel_id: group.channel_id, groupjid: group.jid }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (r.ok) {
          onLeaveSuccess?.();
          onClose();
        } else setError(data?.error ?? "Falha ao sair do grupo");
      })
      .catch(() => setError("Erro de rede"))
      .finally(() => setLeaving(false));
  };

  const handleResetInvite = () => runAction("/api/groups/reset-invite", {});
  const handleUpdateName = (name: string) => runAction("/api/groups/update-name", { name });
  const handleUpdateDescription = (description: string) => runAction("/api/groups/update-description", { description });
  const handleUpdateImage = (image: string) => runAction("/api/groups/update-image", { image });
  const handleUpdateAnnounce = (announce: boolean) => runAction("/api/groups/update-announce", { announce });
  const handleUpdateLocked = (locked: boolean) => runAction("/api/groups/update-locked", { locked });
  const handleUpdateParticipants = (action: string, participants: string[]) =>
    runAction("/api/groups/update-participants", { action, participants });

  return (
    <SideOver open={open} onClose={onClose} title="Detalhes do grupo" width={520}>
      {!group ? (
        <p className="text-sm text-[#64748B]">Nenhum grupo selecionado.</p>
      ) : (
        <div className="flex flex-col h-full">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-clicvend-orange" />
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 mb-4">
              {error}
            </div>
          )}
          {!loading && info && (
            <>
              <div className="flex flex-col items-center gap-2 border-b border-[#E2E8F0] pb-4 mb-4">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-[#E2E8F0] flex items-center justify-center">
                  <MessageCircle className="h-10 w-10 text-[#94A3B8]" />
                </div>
                <p className="font-semibold text-[#1E293B]">{displayName}</p>
                <p className="text-xs text-[#94A3B8]">{channelName}</p>
              </div>

              <nav className="flex gap-1 border-b border-[#E2E8F0] mb-4 overflow-x-auto">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`inline-flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm font-medium whitespace-nowrap ${
                        activeTab === tab.id
                          ? "bg-[#F1F5F9] text-clicvend-orange border-b-2 border-clicvend-orange -mb-px"
                          : "text-[#64748B] hover:bg-[#F8FAFC]"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </nav>

              <div className="flex-1 min-h-0 overflow-y-auto">
                {activeTab === "info" && (
                  <div className="space-y-3 text-sm">
                    {topic && (
                      <div>
                        <dt className="text-[#64748B] font-medium">Descrição</dt>
                        <dd className="text-[#1E293B] break-words mt-0.5">{topic}</dd>
                      </div>
                    )}
                    {inviteLink && (
                      <div>
                        <dt className="text-[#64748B] font-medium flex items-center gap-1">
                          <Link2 className="h-3.5 w-3.5" /> Link de convite
                        </dt>
                        <dd className="mt-1 break-all">
                          <a
                            href={inviteLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-clicvend-orange hover:underline"
                          >
                            {inviteLink}
                          </a>
                        </dd>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#F1F5F9] px-2.5 py-1 text-xs text-[#64748B]">
                        <Shield className="h-3.5 w-3.5" />
                        {info.IsAnnounce ? "Só admins enviam" : "Todos podem enviar"}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#F1F5F9] px-2.5 py-1 text-xs text-[#64748B]">
                        <Lock className="h-3.5 w-3.5" />
                        {info.IsLocked ? "Só admins editam" : "Todos podem editar"}
                      </span>
                    </div>
                    <p className="text-xs text-[#94A3B8]">
                      {participants.length} participante(s). Algumas ações só estão disponíveis para administradores do grupo.
                    </p>
                  </div>
                )}

                {activeTab === "settings" && (
                  <div className="space-y-4">
                    <p className="text-xs text-[#64748B]">
                      Alterações só funcionam se este número for administrador do grupo.
                    </p>
                    <GroupEditForm
                      currentName={displayName}
                      currentTopic={topic ?? ""}
                      onSaveName={handleUpdateName}
                      onSaveDescription={handleUpdateDescription}
                      onSaveImage={handleUpdateImage}
                      onResetInvite={handleResetInvite}
                      inviteLink={inviteLink ?? ""}
                      announce={info.IsAnnounce ?? false}
                      locked={info.IsLocked ?? false}
                      onAnnounceChange={handleUpdateAnnounce}
                      onLockedChange={handleUpdateLocked}
                      loading={actionLoading}
                    />
                  </div>
                )}

                {activeTab === "participants" && (
                  <div className="space-y-4">
                    <p className="text-sm text-[#64748B]">
                      {participants.length} participante(s). Ações de adicionar/remover/promover/rebaixar só para admins.
                    </p>
                    <ParticipantsList
                      participants={participants}
                      onAction={handleUpdateParticipants}
                      loading={actionLoading}
                    />
                  </div>
                )}

                {activeTab === "leave" && (
                  <div className="space-y-4">
                    <p className="text-sm text-[#64748B]">
                      Ao sair do grupo você deixará de receber mensagens e não constará mais na lista de participantes.
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
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </SideOver>
  );
}

function GroupEditForm({
  currentName,
  currentTopic,
  onSaveName,
  onSaveDescription,
  onSaveImage,
  onResetInvite,
  inviteLink,
  announce,
  locked,
  onAnnounceChange,
  onLockedChange,
  loading,
}: {
  currentName: string;
  currentTopic: string;
  onSaveName: (n: string) => void;
  onSaveDescription: (d: string) => void;
  onSaveImage: (i: string) => void;
  onResetInvite: () => void;
  inviteLink: string;
  announce: boolean;
  locked: boolean;
  onAnnounceChange: (v: boolean) => void;
  onLockedChange: (v: boolean) => void;
  loading: boolean;
}) {
  const [name, setName] = useState(currentName);
  const [topic, setTopic] = useState(currentTopic);
  const [image, setImage] = useState("");
  useEffect(() => {
    setName(currentName);
    setTopic(currentTopic);
  }, [currentName, currentTopic]);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-[#64748B] mb-1">Nome do grupo (1–25 caracteres)</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 25))}
            className="flex-1 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
            maxLength={25}
          />
          <button
            type="button"
            onClick={() => name.trim() && onSaveName(name.trim())}
            disabled={loading || !name.trim()}
            className="rounded-lg bg-clicvend-orange px-3 py-2 text-sm font-medium text-white hover:bg-clicvend-orange/90 disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-[#64748B] mb-1">Descrição</label>
        <div className="flex gap-2">
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value.slice(0, 512))}
            rows={2}
            className="flex-1 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm resize-none"
            maxLength={512}
          />
          <button
            type="button"
            onClick={() => onSaveDescription(topic)}
            disabled={loading}
            className="rounded-lg bg-clicvend-orange px-3 py-2 text-sm font-medium text-white hover:bg-clicvend-orange/90 disabled:opacity-50 self-end"
          >
            Salvar
          </button>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-[#64748B] mb-1">Imagem (URL ou &quot;remove&quot;)</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={image}
            onChange={(e) => setImage(e.target.value)}
            placeholder="https://... ou remove"
            className="flex-1 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => image.trim() && onSaveImage(image.trim())}
            disabled={loading || !image.trim()}
            className="rounded-lg bg-clicvend-orange px-3 py-2 text-sm font-medium text-white hover:bg-clicvend-orange/90 disabled:opacity-50"
          >
            Atualizar
          </button>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-[#64748B] mb-1">Link de convite</label>
        {inviteLink && (
          <p className="text-sm text-[#1E293B] break-all mb-2">{inviteLink}</p>
        )}
        <button
          type="button"
          onClick={onResetInvite}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" />
          Gerar novo link
        </button>
      </div>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={announce}
            onChange={(e) => onAnnounceChange(e.target.checked)}
            disabled={loading}
            className="rounded border-[#E2E8F0] text-clicvend-orange"
          />
          <span className="text-sm">Apenas admins podem enviar mensagens</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={locked}
            onChange={(e) => onLockedChange(e.target.checked)}
            disabled={loading}
            className="rounded border-[#E2E8F0] text-clicvend-orange"
          />
          <span className="text-sm">Apenas admins podem editar informações do grupo</span>
        </label>
      </div>
    </div>
  );
}

function ParticipantsList({
  participants,
  onAction,
  loading,
}: {
  participants: GroupParticipant[];
  onAction: (action: string, participants: string[]) => void;
  loading: boolean;
}) {
  const [addNumbers, setAddNumbers] = useState("");

  const handleAdd = () => {
    const numbers = addNumbers
      .split(/[\s,;]+/)
      .map((n) => n.replace(/\D/g, "").trim())
      .filter(Boolean);
    if (numbers.length) {
      onAction("add", numbers);
      setAddNumbers("");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-[#64748B] mb-1">Adicionar participantes (números separados por vírgula)</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={addNumbers}
            onChange={(e) => setAddNumbers(e.target.value)}
            placeholder="5511999999999, 5521988888888"
            className="flex-1 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={loading || !addNumbers.trim()}
            className="rounded-lg bg-clicvend-orange px-3 py-2 text-sm font-medium text-white hover:bg-clicvend-orange/90 disabled:opacity-50"
          >
            <UserPlus className="h-4 w-4" />
          </button>
        </div>
      </div>
      <ul className="space-y-1 max-h-[240px] overflow-y-auto">
        {participants.map((p) => {
          const jid = p.JID ?? "";
          const isAdmin = p.IsAdmin ?? false;
          return (
            <li
              key={jid}
              className="flex items-center justify-between rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
            >
              <span className="text-[#1E293B] truncate" title={jid}>
                {jid}
                {isAdmin && (
                  <span className="ml-1 inline-flex items-center text-amber-600" title="Administrador">
                    <Shield className="h-3.5 w-3.5" />
                  </span>
                )}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onAction(isAdmin ? "demote" : "promote", [jid])}
                  disabled={loading}
                  className="rounded p-1.5 text-[#64748B] hover:bg-[#F1F5F9] hover:text-clicvend-orange disabled:opacity-50"
                  title={isAdmin ? "Rebaixar" : "Promover a admin"}
                >
                  {isAdmin ? <ShieldMinus className="h-4 w-4" /> : <ShieldPlus className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => jid && onAction("remove", [jid])}
                  disabled={loading}
                  className="rounded p-1.5 text-[#64748B] hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  title="Remover do grupo"
                >
                  <UserMinus className="h-4 w-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
