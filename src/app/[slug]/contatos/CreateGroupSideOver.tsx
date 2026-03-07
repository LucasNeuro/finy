"use client";

import { useState, useEffect } from "react";
import { SideOver } from "@/components/SideOver";
import { Loader2, MessageCircle, User, X } from "lucide-react";
import type { Contact } from "./ContactDetailSideOver";

type CreateGroupSideOverProps = {
  open: boolean;
  onClose: () => void;
  selectedContacts: Contact[];
  channelId: string;
  channelName: string;
  apiHeaders: Record<string, string> | undefined;
  onSuccess: () => void;
  onError: (message: string) => void;
};

/** Número para a API: dígitos do phone ou extraído do jid */
function contactToNumber(c: Contact): string {
  const raw = (c.phone ?? c.jid ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits) return digits;
  const fromJid = (c.jid ?? "").replace(/@.*$/, "").replace(/\D/g, "");
  return fromJid || "";
}

export function CreateGroupSideOver({
  open,
  onClose,
  selectedContacts,
  channelId,
  channelName,
  apiHeaders,
  onSuccess,
  onError,
}: CreateGroupSideOverProps) {
  const [groupName, setGroupName] = useState("");
  const [participants, setParticipants] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && selectedContacts.length > 0) {
      setGroupName("");
      setParticipants([...selectedContacts]);
      onError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedContacts]);

  const removeParticipant = (id: string) => {
    setParticipants((prev) => prev.filter((p) => p.id !== id));
  };

  const handleCreate = async () => {
    const name = groupName.trim();
    if (!name) {
      onError("Informe o nome do grupo.");
      return;
    }
    if (participants.length === 0) {
      onError("Adicione pelo menos um participante.");
      return;
    }
    const numbers = participants.map(contactToNumber).filter(Boolean);
    if (numbers.length === 0) {
      onError("Nenhum número válido nos participantes.");
      return;
    }
    setLoading(true);
    onError("");
    try {
      const res = await fetch("/api/groups/create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({
          channel_id: channelId,
          name,
          participants: numbers,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onError(data?.error ?? "Falha ao criar grupo.");
        setLoading(false);
        return;
      }
      onSuccess();
      onClose();
    } catch {
      onError("Erro de rede ao criar grupo.");
    } finally {
      setLoading(false);
    }
  };

  const displayName = (c: Contact) =>
    (c.contact_name || c.first_name || c.phone || c.jid?.replace(/@.*$/, "") || "—").trim() || "—";

  return (
    <SideOver
      open={open}
      onClose={onClose}
      title="Novo grupo"
      width={600}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[#64748B]">
          Conexão: <span className="font-medium text-[#1E293B]">{channelName}</span>
        </p>

        <div>
          <label className="block text-sm font-medium text-[#334155] mb-1.5">
            Nome do grupo
          </label>
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Ex: Equipe vendas"
            maxLength={100}
            className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-[#334155]">
              Participantes ({participants.length})
            </label>
            {participants.length < 2 && (
              <span className="text-xs text-amber-600">Mínimo 1 participante</span>
            )}
          </div>
          <ul className="border border-[#E2E8F0] rounded-lg divide-y divide-[#E2E8F0] max-h-[280px] overflow-y-auto bg-[#F8FAFC]">
            {participants.length === 0 ? (
              <li className="px-3 py-4 text-center text-sm text-[#64748B]">
                Nenhum participante. Selecione contatos na tabela e clique em &quot;Criar grupo&quot;.
              </li>
            ) : (
              participants.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-white"
                >
                  <div className="h-9 w-9 shrink-0 rounded-full bg-[#E2E8F0] flex items-center justify-center">
                    <User className="h-4 w-4 text-[#94A3B8]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#1E293B] truncate">
                      {displayName(c)}
                    </p>
                    <p className="text-xs text-[#64748B] truncate">
                      {contactToNumber(c) || c.jid || "—"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeParticipant(c.id)}
                    className="shrink-0 rounded p-1.5 text-[#64748B] hover:bg-[#E2E8F0] hover:text-[#1E293B]"
                    title="Remover participante"
                    aria-label={`Remover ${displayName(c)}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))
            )}
          </ul>
          <p className="mt-1 text-xs text-[#64748B]">
            Estilo WhatsApp Web: os contatos selecionados na tabela já vêm aqui. Remova quem não for entrar no grupo.
          </p>
        </div>

        <div className="flex gap-2 pt-2 border-t border-[#E2E8F0]">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={loading || !groupName.trim() || participants.length === 0}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2.5 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageCircle className="h-4 w-4" />
            )}
            Criar grupo
          </button>
        </div>
      </div>
    </SideOver>
  );
}
