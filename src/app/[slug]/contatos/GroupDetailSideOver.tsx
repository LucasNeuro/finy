"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { SideOver } from "@/components/SideOver";
import { Loader2, MessageCircle, LogOut } from "lucide-react";

export type Group = {
  id: string;
  channel_id: string;
  jid: string;
  name: string | null;
  topic: string | null;
  invite_link: string | null;
  synced_at: string;
};

type GroupDetails = {
  name?: string;
  wa_name?: string;
  image?: string;
  imagePreview?: string;
  wa_isGroup?: boolean;
  wa_isGroup_admin?: boolean;
  wa_isGroup_announce?: boolean;
  wa_isGroup_community?: boolean;
  invite_link?: string;
  topic?: string;
  [key: string]: unknown;
};

type GroupDetailSideOverProps = {
  open: boolean;
  onClose: () => void;
  group: Group | null;
  channelName: string;
  companySlug: string;
  onLeaveSuccess?: () => void;
};

export function GroupDetailSideOver({
  open,
  onClose,
  group,
  channelName,
  companySlug,
  onLeaveSuccess,
}: GroupDetailSideOverProps) {
  const [details, setDetails] = useState<GroupDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const apiHeaders = useMemo(
    () => (companySlug ? { "X-Company-Slug": companySlug } : undefined),
    [companySlug]
  );

  const fetchDetails = useCallback(() => {
    if (!group) return;
    setLoading(true);
    setError(null);
    setDetails(null);
    fetch("/api/contacts/chat-details", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...apiHeaders },
      body: JSON.stringify({ channel_id: group.channel_id, number: group.jid, preview: true }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (r.ok) setDetails(data);
        else setError(data?.error ?? "Falha ao carregar detalhes");
      })
      .catch(() => setError("Erro de rede"))
      .finally(() => setLoading(false));
  }, [group, apiHeaders]);

  useEffect(() => {
    if (open && group) fetchDetails();
    else if (!open) {
      setDetails(null);
      setError(null);
    }
  }, [open, group, fetchDetails]);

  const handleLeave = () => {
    if (!group || !window.confirm("Tem certeza que deseja sair deste grupo?")) return;
    setLeaving(true);
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
        } else {
          setError(data?.error ?? "Falha ao sair do grupo");
        }
      })
      .catch(() => setError("Erro de rede ao sair do grupo"))
      .finally(() => setLeaving(false));
  };

  const displayName = details?.name ?? details?.wa_name ?? group?.name ?? "—";
  const imageUrl = details?.imagePreview ?? details?.image ?? null;
  const inviteLink = details?.invite_link ?? group?.invite_link ?? null;
  const topic = details?.topic ?? group?.topic ?? null;

  return (
    <SideOver open={open} onClose={onClose} title="Detalhes do grupo" width={480}>
      {!group ? (
        <p className="text-sm text-[#64748B]">Nenhum grupo selecionado.</p>
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
                  {imageUrl ? (
                    <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-3xl text-[#94A3B8]">
                      <MessageCircle className="h-12 w-12" />
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <p className="font-semibold text-[#1E293B]">{displayName}</p>
                  <p className="mt-1 text-xs text-[#94A3B8]">{channelName}</p>
                </div>
              </div>
              {details && (
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">Informações</h3>
                  <dl className="space-y-2 text-sm">
                    {topic && (
                      <div>
                        <dt className="text-[#64748B]">Descrição</dt>
                        <dd className="font-medium text-[#1E293B] break-words">{topic}</dd>
                      </div>
                    )}
                    {details.wa_isGroup_admin != null && (
                      <div>
                        <dt className="text-[#64748B]">Você é admin</dt>
                        <dd className="font-medium text-[#1E293B]">{details.wa_isGroup_admin ? "Sim" : "Não"}</dd>
                      </div>
                    )}
                    {inviteLink && (
                      <div>
                        <dt className="text-[#64748B]">Link de convite</dt>
                        <dd className="break-all">
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
                  </dl>
                </div>
              )}
              <div className="border-t border-[#E2E8F0] pt-4">
                <button
                  type="button"
                  onClick={handleLeave}
                  disabled={leaving}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
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
