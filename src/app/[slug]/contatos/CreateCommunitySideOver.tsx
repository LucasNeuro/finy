"use client";

import { useState, useEffect } from "react";
import { SideOver } from "@/components/SideOver";
import { Loader2, MessageCircle, ImagePlus, Sparkles } from "lucide-react";
import { FileDropzone } from "@/components/FileDropzone";
import type { Group } from "./GroupDetailSideOver";

type CreateCommunitySideOverProps = {
  open: boolean;
  onClose: () => void;
  selectedGroups: Group[];
  channelId: string;
  channelName: string;
  apiHeaders: Record<string, string> | undefined;
  onSuccess: () => void;
  onError: (message: string) => void;
};

export function CreateCommunitySideOver({
  open,
  onClose,
  selectedGroups,
  channelId,
  channelName,
  apiHeaders,
  onSuccess,
  onError,
}: CreateCommunitySideOverProps) {
  const [communityName, setCommunityName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);

  useEffect(() => {
    if (open) {
      setCommunityName("");
      setDescription("");
      setImageUrl("");
      onError("");
    }
  }, [open, onError]);

  const handleCreate = async () => {
    const name = communityName.trim();
    if (!name) {
      onError("Informe o nome da comunidade.");
      return;
    }
    if (selectedGroups.length === 0) {
      onError("Selecione ao menos um grupo na tabela.");
      return;
    }
    setLoading(true);
    onError("");
    const TIMEOUT_MS = 90_000; // 90s para create + edit-groups + desc + image
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS);
    });
    try {
      const createRes = await Promise.race([
        fetch("/api/communities/create", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...apiHeaders },
          body: JSON.stringify({ channel_id: channelId, name }),
        }),
        timeoutPromise,
      ]).then((r) => r as Response);
      const createData = await createRes.json();
      if (!createRes.ok) {
        onError(createData?.error ?? "Falha ao criar comunidade.");
        setLoading(false);
        return;
      }
      const communityJid =
        (typeof createData?.JID === "string" && createData.JID.trim()) ||
        (typeof createData?.jid === "string" && createData.jid.trim()) ||
        (createData?.group && typeof createData.group.JID === "string" && createData.group.JID.trim()) ||
        (createData?.group && typeof createData.group.jid === "string" && createData.group.jid.trim()) ||
        "";
      if (!communityJid) {
        onError("Resposta da API sem JID da comunidade. A comunidade foi criada; vincule os grupos manualmente na conexão.");
        setLoading(false);
        return;
      }
      const groupjids = selectedGroups.map((g) => (g.jid ?? "").trim()).filter((j) => j.endsWith("@g.us"));
      if (groupjids.length === 0) {
        onError("Nenhum JID de grupo válido (formato xxx@g.us). Verifique os grupos selecionados.");
        setLoading(false);
        return;
      }
      await new Promise((r) => setTimeout(r, 1500));
      const editRes = await Promise.race([
        fetch("/api/communities/edit-groups", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...apiHeaders },
          body: JSON.stringify({
            channel_id: channelId,
            community: communityJid,
            action: "add",
            groupjids,
          }),
        }),
        timeoutPromise,
      ]).then((r) => r as Response);
      const editData = await editRes.json();
      if (!editRes.ok) {
        onError(editData?.error ?? "Comunidade criada, mas falha ao vincular grupos. Tente adicionar os grupos manualmente na comunidade.");
        setLoading(false);
        return;
      }
      const failed = editData?.failed;
      if (Array.isArray(failed) && failed.length > 0) {
        onError(`Comunidade criada. Alguns grupos não foram vinculados: ${failed.length}. Detalhes: ${failed.join(", ")}`);
        setLoading(false);
        return;
      }

      const baseBody = { channel_id: channelId, groupjid: communityJid };
      if (description.trim()) {
        await new Promise((r) => setTimeout(r, 400));
        const descRes = await Promise.race([
          fetch("/api/groups/update-description", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json", ...apiHeaders },
            body: JSON.stringify({ ...baseBody, description: description.trim().slice(0, 512) }),
          }),
          timeoutPromise,
        ]).then((r) => r as Response);
        if (!descRes.ok) {
          const errData = await descRes.json().catch(() => ({}));
          onError(errData?.error ?? "Comunidade criada e grupos vinculados; falha ao definir descrição.");
        }
      }
      if (imageUrl.trim()) {
        await new Promise((r) => setTimeout(r, 400));
        const imgRes = await Promise.race([
          fetch("/api/groups/update-image", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json", ...apiHeaders },
            body: JSON.stringify({ ...baseBody, image: imageUrl.trim() }),
          }),
          timeoutPromise,
        ]).then((r) => r as Response);
        if (!imgRes.ok) {
          const errData = await imgRes.json().catch(() => ({}));
          onError(errData?.error ?? "Comunidade criada; falha ao definir imagem. Defina depois em Gerenciar grupo.");
        }
      }

      onSuccess();
      onClose();
    } catch (e) {
      const isTimeout = e instanceof Error && e.message === "timeout";
      onError(
        isTimeout
          ? "A criação demorou demais (timeout). Verifique a conexão e o status do WhatsApp; tente novamente."
          : "Erro de rede."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SideOver open={open} onClose={onClose} title="Criar comunidade" width={640}>
      <div className="space-y-4">
        <p className="text-sm text-[#64748B]">
          A comunidade será criada na conexão <strong>{channelName}</strong>. Os grupos selecionados serão vinculados a ela. Opcionalmente defina descrição e imagem; elas serão aplicadas após a criação.
        </p>
        <div>
          <label className="block text-sm font-medium text-[#334155] mb-1">Nome da comunidade</label>
          <input
            type="text"
            value={communityName}
            onChange={(e) => setCommunityName(e.target.value)}
            placeholder="Ex: Suporte Oficial"
            maxLength={100}
            className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] placeholder:text-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
            disabled={loading}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[#334155] mb-1">Descrição (opcional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: Canal oficial de suporte da empresa"
            maxLength={512}
            rows={3}
            className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] placeholder:text-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange resize-none"
            disabled={loading}
          />
          <button
            type="button"
            onClick={async () => {
              setGeneratingDesc(true);
              onError("");
              try {
                const res = await fetch("/api/ai/generate-description", {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json", ...apiHeaders },
                  body: JSON.stringify({
                    type: "community",
                    name: communityName.trim() || undefined,
                  }),
                });
                const data = await res.json();
                if (res.ok && typeof data?.text === "string") {
                  setDescription(data.text);
                } else {
                  onError(data?.error ?? "Falha ao gerar descrição com IA.");
                }
              } catch {
                onError("Erro de rede ao gerar descrição.");
              } finally {
                setGeneratingDesc(false);
              }
            }}
            disabled={loading || generatingDesc}
            className="mt-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9] hover:text-clicvend-orange disabled:opacity-50 inline-flex items-center gap-1.5"
            title="Gerar descrição com IA"
          >
            {generatingDesc ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Gerar com IA
          </button>
          <p className="mt-1.5 text-xs text-[#94A3B8]">Até 512 caracteres. Aplicada após criar a comunidade.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-[#334155] mb-1 flex items-center gap-1.5">
            <ImagePlus className="h-4 w-4 text-[#94A3B8]" />
            Imagem da comunidade (opcional)
          </label>
          <FileDropzone
            accept="image/*"
            maxSize={5 * 1024 * 1024}
            loading={imageUploading}
            disabled={!!loading}
            label="Arraste uma imagem ou clique para selecionar do computador"
            onFileSelect={async (file) => {
              setImageUploading(true);
              onError("");
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
                  onError(data?.error ?? "Falha no upload da imagem.");
                  setImageUploading(false);
                  return;
                }
                setImageUrl(data.url);
              } catch {
                onError("Erro ao enviar imagem.");
              } finally {
                setImageUploading(false);
              }
            }}
          />
          <p className="mt-0.5 text-xs text-[#94A3B8]">Aplicada após criar a comunidade.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-[#334155] mb-2">
            Grupos que serão vinculados ({selectedGroups.length})
          </label>
          <ul className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] max-h-48 overflow-y-auto p-2 space-y-1">
            {selectedGroups.map((g) => (
              <li key={g.id} className="flex items-center gap-2 px-2 py-1.5 text-sm text-[#1E293B]">
                <MessageCircle className="h-4 w-4 shrink-0 text-[#94A3B8]" />
                <span className="truncate">{g.name ?? g.jid ?? "—"}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC] disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={loading || !communityName.trim()}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Criar comunidade
          </button>
        </div>
      </div>
    </SideOver>
  );
}
