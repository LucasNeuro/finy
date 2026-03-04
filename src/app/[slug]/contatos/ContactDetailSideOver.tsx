"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { SideOver } from "@/components/SideOver";
import { Loader2, User, Ban } from "lucide-react";

export type Contact = {
  id: string;
  channel_id: string;
  jid: string;
  phone: string | null;
  contact_name: string | null;
  first_name: string | null;
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
  common_groups?: string;
  lead_name?: string;
  lead_email?: string;
  lead_status?: string;
  lead_notes?: string;
  [key: string]: unknown;
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
    if (open && contact) fetchDetails();
    else if (!open) {
      setDetails(null);
      setError(null);
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
  const imageUrl = details?.imagePreview ?? details?.image ?? null;

  return (
    <SideOver open={open} onClose={onClose} title="Detalhes do contato" width={480}>
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
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
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
                    <button
                      type="button"
                      onClick={handleBlockToggle}
                      disabled={blockLoading}
                      className={`mt-3 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                        details.wa_isBlocked
                          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "bg-red-50 text-red-700 hover:bg-red-100"
                      } disabled:opacity-60`}
                    >
                      {blockLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                      {details.wa_isBlocked ? "Desbloquear" : "Bloquear"}
                    </button>
                  )}
                </div>
              </div>
              {details && (
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">Outras informações</h3>
                  <dl className="space-y-2 text-sm">
                    {details.wa_isBlocked != null && (
                      <div>
                        <dt className="text-[#64748B]">Bloqueado</dt>
                        <dd className="font-medium text-[#1E293B]">{details.wa_isBlocked ? "Sim" : "Não"}</dd>
                      </div>
                    )}
                    {details.lead_email && (
                      <div>
                        <dt className="text-[#64748B]">E-mail (lead)</dt>
                        <dd className="font-medium text-[#1E293B]">{details.lead_email}</dd>
                      </div>
                    )}
                    {details.lead_status && (
                      <div>
                        <dt className="text-[#64748B]">Status (lead)</dt>
                        <dd className="font-medium text-[#1E293B]">{details.lead_status}</dd>
                      </div>
                    )}
                    {details.common_groups && (
                      <div>
                        <dt className="text-[#64748B]">Grupos em comum</dt>
                        <dd className="font-medium text-[#1E293B] break-words">{details.common_groups}</dd>
                      </div>
                    )}
                    {details.lead_notes && (
                      <div>
                        <dt className="text-[#64748B]">Observações</dt>
                        <dd className="font-medium text-[#1E293B] whitespace-pre-wrap">{details.lead_notes}</dd>
                      </div>
                    )}
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
