"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { SideOver } from "@/components/SideOver";
import { Loader2, MessageCircle, LogOut, Link2, Shield, Lock } from "lucide-react";

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
  /** Opcional: chamado após atualizações (não usado neste painel simplificado; aceito para compatibilidade). */
  onUpdateSuccess?: () => void;
};

export function GroupDetailSideOver({
  open,
  onClose,
  group,
  channelName,
  companySlug,
  onLeaveSuccess,
  onUpdateSuccess: _onUpdateSuccess,
}: GroupDetailSideOverProps) {
  const [info, setInfo] = useState<GroupInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  return (
    <SideOver open={open} onClose={onClose} title="Detalhes do grupo" width={440}>
      {!group ? (
        <p className="text-sm text-[#64748B]">Nenhum grupo selecionado.</p>
      ) : (
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
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-[#E2E8F0] flex items-center justify-center">
                  <MessageCircle className="h-10 w-10 text-[#94A3B8]" />
                </div>
                <p className="font-semibold text-[#1E293B] text-center">{displayName}</p>
                <p className="text-xs text-[#94A3B8]">{channelName}</p>
              </div>

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
                <p className="text-xs text-[#94A3B8]">
                  {participants.length} participante(s).
                </p>
              </div>

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
            </>
          )}
        </div>
      )}
    </SideOver>
  );
}
