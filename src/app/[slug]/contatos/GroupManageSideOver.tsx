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
  Info,
  RefreshCw,
  UserPlus,
  UserMinus,
  Crown,
  UserCog,
} from "lucide-react";
import type { Group } from "./GroupDetailSideOver";

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

  if (!group) {
    return (
      <SideOver open={open} onClose={onClose} title="Gerenciar grupo" width={480}>
        <p className="text-sm text-[#64748B]">Nenhum grupo selecionado.</p>
      </SideOver>
    );
  }

  return (
    <SideOver open={open} onClose={onClose} title="Gerenciar grupo" width={480}>
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

            <div className="flex gap-1 overflow-x-auto border-b border-[#E2E8F0] pb-2 -mx-1">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap ${
                    activeTab === id
                      ? "bg-clicvend-orange/10 text-clicvend-orange border-b-2 border-clicvend-orange -mb-0.5"
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
                participantsCount={participants.length}
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
            {activeTab === "leave" && (
              <div className="border-t border-[#E2E8F0] pt-4">
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
  participantsCount,
}: {
  displayName: string;
  topic: string | null;
  inviteLink: string | null;
  info: GroupInfo;
  participantsCount: number;
}) {
  return (
    <div className="space-y-3 text-sm">
      {topic ? (
        <div>
          <dt className="text-[#64748B] font-medium">Descrição</dt>
          <dd className="text-[#1E293B] break-words mt-0.5">{topic}</dd>
        </div>
      ) : null}
      {inviteLink ? (
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
      ) : null}
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
      <p className="text-xs text-[#94A3B8]">{participantsCount} participante(s).</p>
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
  const [imageUrl, setImageUrl] = useState("");
  const [announce, setAnnounce] = useState(info?.IsAnnounce ?? false);
  const [locked, setLocked] = useState(info?.IsLocked ?? false);
  const [saving, setSaving] = useState<string | null>(null);
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

  const save = (key: string, body: Record<string, unknown>, endpoint: string) => {
    setSaving(key);
    onError(null);
    apiCall(endpoint, body, apiHeaders).then(({ ok, error: err }) => {
      setSaving(null);
      if (ok) onSuccess();
      else onError(err ?? "Falha ao salvar");
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
      <div>
        <label className="block text-[#64748B] font-medium mb-1">Nome do grupo</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const v = name.trim();
            if (v && v !== (info?.Name ?? group.name ?? "")) {
              save("name", { ...base, name: v }, "/api/groups/update-name");
            }
          }}
          disabled={saving === "name"}
          className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] disabled:opacity-60"
        />
      </div>
      <div>
        <label className="block text-[#64748B] font-medium mb-1">Descrição</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => {
            const v = description.trim();
            if (v !== (info?.Topic ?? group.topic ?? "")) {
              save("description", { ...base, description: v }, "/api/groups/update-description");
            }
          }}
          disabled={saving === "description"}
          rows={2}
          className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] disabled:opacity-60"
        />
      </div>
      <div>
        <label className="block text-[#64748B] font-medium mb-1">URL da imagem do grupo</label>
        <input
          type="url"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://..."
          className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B]"
        />
        <button
          type="button"
          disabled={!imageUrl.trim() || saving === "image"}
          onClick={() => save("image", { ...base, image: imageUrl.trim() }, "/api/groups/update-image")}
          className="mt-2 rounded-lg bg-clicvend-orange px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving === "image" ? "Salvando…" : "Atualizar imagem"}
        </button>
      </div>
      <div>
        <label className="block text-[#64748B] font-medium mb-1">Link de convite</label>
        <button
          type="button"
          onClick={handleResetInvite}
          disabled={resettingLink}
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
          onClick={() => save("announce", { ...base, announce: !announce }, "/api/groups/update-announce")}
          disabled={saving === "announce"}
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
          onClick={() => save("locked", { ...base, locked: !locked }, "/api/groups/update-locked")}
          disabled={saving === "locked"}
          className={`relative h-6 w-11 rounded-full transition-colors ${locked ? "bg-clicvend-orange" : "bg-[#E2E8F0]"}`}
        >
          <span
            className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${locked ? "left-6" : "left-1"}`}
          />
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
                  >
                    {isAdmin ? <UserCog className="h-4 w-4" /> : <Crown className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    title="Remover"
                    onClick={() => runAction("remove", [jid])}
                    disabled={actioning !== null}
                    className="rounded p-1 text-[#64748B] hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
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
