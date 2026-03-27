"use client";

<<<<<<< HEAD
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
=======
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
>>>>>>> 90177313e89862f0eb89d72726a0395ad050d21b
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Eraser,
  Megaphone,
  Download,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Link,
  MessageSquare,
  Plus,
  RefreshCw,
  Settings,
  Sparkles,
  Strikethrough,
  Trash2,
  Underline,
  Upload,
  ChevronLeft,
  ChevronRight,
  Link2,
} from "lucide-react";
import { SideOver } from "@/components/SideOver";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type QuickReplyRow = {
  id: string;
  uazapiId: string | null;
  shortCut: string;
  type: string;
  text: string | null;
  file: string | null;
  docName: string | null;
  onWhatsApp: boolean;
  enabled: boolean;
  templateCategory: "general" | "consent" | "campaign";
  templateConfig?: Record<string, unknown>;
  queueIds: string[];
  createdAt: string;
  updatedAt: string;
  channels: { id: string; name: string }[];
};

type Channel = { id: string; name: string };
type Queue = { id: string; name: string };

const EMPTY_FORM: QuickReplyFormState = {
  id: null,
  uazapiId: null,
  shortCut: "",
  type: "text",
  text: "",
  file: "",
  docName: "",
  channelId: "",
  queueIds: [],
  templateCategory: "general",
  consentAction: "opt_in_request",
  consentAcceptKeywords: "SIM",
  consentOptOutKeywords: "SAIR,PARAR,STOP",
  consentLegalText: "",
  campaignButtonsText: "",
  campaignCarouselText: "",
};

type QuickReplyFormState = {
  id: string | null;
  uazapiId: string | null;
  shortCut: string;
  type: string;
  text: string;
  file: string;
  docName: string;
  channelId: string;
  queueIds: string[];
  templateCategory: "general" | "consent" | "campaign";
  consentAction: "opt_in_request" | "opt_in_confirm" | "opt_out_confirm";
  consentAcceptKeywords: string;
  consentOptOutKeywords: string;
  consentLegalText: string;
  campaignButtonsText: string;
  campaignCarouselText: string;
};

type AssistantDraftState = {
  channelId: string;
  queueIds: string[];
  shortCut: string;
  text: string;
  consentAction: "opt_in_request" | "opt_out_confirm";
  consentAcceptKeywords: string;
  consentOptOutKeywords: string;
  campaignMenuType: "button" | "list" | "poll" | "carousel";
  campaignContentType: "text" | "image" | "video" | "audio" | "document" | "carousel";
  campaignFile: string;
  campaignDocName: string;
  campaignChoicesText: string;
  campaignFooterText: string;
  campaignListButton: string;
  campaignSelectableCount: number;
  campaignImageButton: string;
};

function stripHtmlToText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function RichTextEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (el.innerHTML !== (value || "")) {
      el.innerHTML = value || "";
    }
  }, [value]);

  const saveSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    savedRangeRef.current = sel.getRangeAt(0);
  };

  const restoreSelection = () => {
    const sel = window.getSelection();
    if (!sel || !savedRangeRef.current) return;
    sel.removeAllRanges();
    sel.addRange(savedRangeRef.current);
  };

  const apply = (command: string, arg?: string) => {
    if (typeof document === "undefined") return;
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    restoreSelection();
    document.execCommand(command, false, arg);
    saveSelection();
    onChange(el.innerHTML);
  };
  const btnBase = "rounded p-1.5 hover:bg-[#E2E8F0]";
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white">
      <div className="flex flex-wrap items-center gap-1 border-b border-[#E2E8F0] bg-[#F8FAFC] p-2">
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => apply("bold")} className={btnBase} title="Negrito">
          <Bold className="h-4 w-4 text-[#475569]" />
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => apply("italic")} className={btnBase} title="Itálico">
          <Italic className="h-4 w-4 text-[#475569]" />
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => apply("underline")} className={btnBase} title="Sublinhado">
          <Underline className="h-4 w-4 text-[#475569]" />
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => apply("strikeThrough")} className={btnBase} title="Riscado">
          <Strikethrough className="h-4 w-4 text-[#475569]" />
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => apply("insertUnorderedList")} className={btnBase} title="Lista">
          <List className="h-4 w-4 text-[#475569]" />
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => apply("insertOrderedList")} className={btnBase} title="Lista numerada">
          <ListOrdered className="h-4 w-4 text-[#475569]" />
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => apply("justifyLeft")} className={btnBase} title="Alinhar esquerda">
          <AlignLeft className="h-4 w-4 text-[#475569]" />
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => apply("justifyCenter")} className={btnBase} title="Centralizar">
          <AlignCenter className="h-4 w-4 text-[#475569]" />
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => apply("justifyRight")} className={btnBase} title="Alinhar direita">
          <AlignRight className="h-4 w-4 text-[#475569]" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const url = window.prompt("URL do link");
            if (url) apply("createLink", url);
          }}
          className={btnBase}
          title="Inserir link"
        >
          <Link className="h-4 w-4 text-[#475569]" />
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => apply("removeFormat")} className={btnBase} title="Limpar formatação">
          <Eraser className="h-4 w-4 text-[#475569]" />
        </button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        onBlur={saveSelection}
        onInput={(e) => onChange((e.currentTarget as HTMLDivElement).innerHTML)}
        className="min-h-[160px] whitespace-pre-wrap px-3 py-2 text-sm text-[#1E293B] focus:outline-none"
        data-placeholder={placeholder ?? "Digite aqui..."}
      />
    </div>
  );
}

export default function RespostasRapidasPage() {
  const params = useParams();
  const router = useRouter();
  const slug = (params?.slug as string) ?? "";
  const apiHeadersForPerms = slug ? { "X-Company-Slug": slug } : undefined;

  const { data: permissionsData } = useQuery({
    queryKey: queryKeys.permissions(slug ?? ""),
    queryFn: () =>
      fetch("/api/auth/permissions", { credentials: "include", headers: apiHeadersForPerms }).then((r) => r.json()),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });
  const permissions = Array.isArray(permissionsData?.permissions) ? permissionsData.permissions : [];
  const canAccessQuickReplies = permissions.includes("quickreplies.view") || permissions.includes("quickreplies.manage");

  useEffect(() => {
    if (slug && permissionsData !== undefined && !canAccessQuickReplies) {
      router.replace(`/${slug}/conversas`);
    }
  }, [slug, permissionsData, canAccessQuickReplies, router]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<QuickReplyRow[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [channelQueues, setChannelQueues] = useState<Queue[]>([]);
  const [channelQueuesLoading, setChannelQueuesLoading] = useState(false);
  const [showGeneralForm, setShowGeneralForm] = useState(false);
  const [sideOverTab, setSideOverTab] = useState<"form" | "ativas" | "import">("form");
  const [form, setForm] = useState<QuickReplyFormState>(EMPTY_FORM);
  const [bulkChannelId, setBulkChannelId] = useState("");
  const [bulkQueueIds, setBulkQueueIds] = useState<string[]>([]);
  const [bulkParsedRows, setBulkParsedRows] = useState<{ shortCut: string; type: string; text: string; filas: string }[]>([]);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkImportResult, setBulkImportResult] = useState<{ ok: number; fail: number } | null>(null);
  const [bulkImportError, setBulkImportError] = useState<string | null>(null);
  const [bulkIdea, setBulkIdea] = useState("");
  const [bulkGeneratingAI, setBulkGeneratingAI] = useState(false);
  const [formAiError, setFormAiError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [deleteConfirmRow, setDeleteConfirmRow] = useState<QuickReplyRow | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [showBulkLink, setShowBulkLink] = useState(false);
  const [bulkLinkQueueIds, setBulkLinkQueueIds] = useState<string[]>([]);
  const [bulkLinkLoading, setBulkLinkLoading] = useState(false);
  const [moduleTab, setModuleTab] = useState<"general" | "campaign">("general");
  const [showAssistantBot, setShowAssistantBot] = useState(false);
  const [assistantKind, setAssistantKind] = useState<"consent" | "campaign">("consent");
  const [assistantStep, setAssistantStep] = useState(0);
  const [assistantSaving, setAssistantSaving] = useState(false);
  const [assistantTesting, setAssistantTesting] = useState(false);
  const [assistantTestNumber, setAssistantTestNumber] = useState("");
  const [assistantAiError, setAssistantAiError] = useState<string | null>(null);
  const [assistantDraft, setAssistantDraft] = useState<AssistantDraftState>({
    channelId: "",
    queueIds: [],
    shortCut: "",
    text: "",
    consentAction: "opt_in_request",
    consentAcceptKeywords: "SIM",
    consentOptOutKeywords: "SAIR,PARAR,STOP",
    campaignMenuType: "button",
    campaignContentType: "text",
    campaignFile: "",
    campaignDocName: "",
    campaignChoicesText: "Quero saber mais|campaign_info",
    campaignFooterText: "",
    campaignListButton: "Ver opções",
    campaignSelectableCount: 1,
    campaignImageButton: "",
  });
  const [detailTestNumber, setDetailTestNumber] = useState("");
  const [detailTesting, setDetailTesting] = useState(false);
  const PAGE_SIZE = 50;

  const apiHeaders = useMemo(
    () => (slug ? { "X-Company-Slug": slug } : undefined),
    [slug]
  );

  const fetchChannels = useCallback(() => {
    if (!slug) return;
    fetch("/api/channels", { credentials: "include", headers: apiHeaders })
      .then((r) => r.json())
      .then((data) => setChannels(Array.isArray(data) ? data : []))
      .catch(() => setChannels([]));
  }, [slug, apiHeaders]);

  const fetchQueues = useCallback(() => {
    if (!slug) return;
    fetch("/api/queues", { credentials: "include", headers: apiHeaders })
      .then((r) => r.json())
      .then((data) => setQueues(Array.isArray(data) ? data : []))
      .catch(() => setQueues([]));
  }, [slug, apiHeaders]);

  const fetchQueuesForChannel = useCallback(
    async (channelId: string) => {
      if (!channelId || !apiHeaders) {
        setChannelQueues([]);
        return;
      }
      setChannelQueuesLoading(true);
      try {
        const res = await fetch(`/api/channels/${channelId}/queues`, {
          credentials: "include",
          headers: apiHeaders,
        });
        const data = await res.json().catch(() => []);
        if (!res.ok) {
          setChannelQueues([]);
          return;
        }
        const list = Array.isArray(data) ? data : [];
        const items: Queue[] = list.map((item: { queue_id: string; queue?: { id: string; name: string } }) => ({
          id: item.queue_id,
          name: item.queue?.name ?? item.queue_id,
        }));
        setChannelQueues(items);
      } catch {
        setChannelQueues([]);
      } finally {
        setChannelQueuesLoading(false);
      }
    },
    [apiHeaders]
  );

  const fetchQuickReplies = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/quick-replies", {
        credentials: "include",
        headers: apiHeaders,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Falha ao carregar respostas rápidas.");
        setRows([]);
        return;
      }
      setRows(Array.isArray(data?.data) ? (data.data as QuickReplyRow[]) : []);
    } catch {
      setError("Erro de rede ao carregar respostas rápidas.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [slug, apiHeaders]);

  useEffect(() => {
    fetchChannels();
    fetchQueues();
  }, [fetchChannels, fetchQueues]);

  useEffect(() => {
    const anyFormOpen = showGeneralForm;
    if (anyFormOpen && form.channelId && (!showGeneralForm || sideOverTab !== "import")) {
      fetchQueuesForChannel(form.channelId);
    } else if (showAssistantBot && assistantDraft.channelId) {
      fetchQueuesForChannel(assistantDraft.channelId);
    } else if (showGeneralForm && sideOverTab === "import" && bulkChannelId) {
      fetchQueuesForChannel(bulkChannelId);
    } else if (!anyFormOpen || (sideOverTab === "form" && !form.channelId) || (sideOverTab === "import" && !bulkChannelId)) {
      setChannelQueues([]);
    }
  }, [
    showGeneralForm,
    form.channelId,
    showAssistantBot,
    assistantDraft.channelId,
    sideOverTab,
    bulkChannelId,
    fetchQueuesForChannel,
  ]);

  useEffect(() => {
    fetchQuickReplies();
  }, [fetchQuickReplies]);

  useEffect(() => {
    setPageIndex(0);
    setSelectedIds(new Set());
  }, [moduleTab]);

  const openNewForm = () => {
    const category = moduleTab;
    if (category !== "general") return;
    setForm({
      ...EMPTY_FORM,
      channelId: channels.length > 0 ? channels[0].id : "",
      templateCategory: category,
    });
    setBulkChannelId(channels.length > 0 ? channels[0].id : "");
    setBulkQueueIds([]);
    setBulkParsedRows([]);
    setBulkImportResult(null);
    setBulkImportError(null);
    setBulkIdea("");
    setFormAiError(null);
    setSideOverTab("form");
    setShowGeneralForm(true);
  };

  const openEditForm = (row: QuickReplyRow) => {
    const cfg = (row.templateConfig ?? {}) as Record<string, unknown>;
    setFormAiError(null);
    setForm({
      id: row.id,
      uazapiId: row.uazapiId,
      shortCut: row.shortCut,
      type: row.type,
      text: row.text ?? "",
      file: row.file ?? "",
      docName: row.docName ?? "",
      channelId: channels.length > 0 ? channels[0].id : "",
      queueIds: row.queueIds ?? [],
      templateCategory: row.templateCategory ?? "general",
      consentAction:
        cfg.consent_action === "opt_out_confirm"
          ? "opt_out_confirm"
          : "opt_in_request",
      consentAcceptKeywords: Array.isArray(cfg.accept_keywords)
        ? (cfg.accept_keywords as string[]).join(",")
        : "SIM",
      consentOptOutKeywords: Array.isArray(cfg.opt_out_keywords)
        ? (cfg.opt_out_keywords as string[]).join(",")
        : "SAIR,PARAR,STOP",
      consentLegalText: typeof cfg.legal_text === "string" ? cfg.legal_text : "",
      campaignButtonsText: Array.isArray(cfg.buttons)
        ? (cfg.buttons as Array<{ label?: string; url?: string }>)
            .map((b) => `${(b.label ?? "").trim()}|${(b.url ?? "").trim()}`.replace(/^\|/, ""))
            .filter(Boolean)
            .join("\n")
        : "",
      campaignCarouselText: Array.isArray(cfg.carousel_items)
        ? (cfg.carousel_items as string[]).join("\n")
        : "",
    });
    setSideOverTab("form");
    setShowGeneralForm(true);
    setDetailTestNumber("");
  };

  const handleChannelChange = (channelId: string) => {
    setForm((c) => ({ ...c, channelId, queueIds: [] }));
  };

  const CSV_SEP = ";";
  const TEMPLATE_HEADER = "atalho;tipo;texto;filas";
  const TEMPLATE_EXAMPLE = "saudacao;text;Olá! Como posso ajudar hoje?;COMERCIAL";

  /** Separa uma linha CSV respeitando aspas duplas (campos com ; ou , dentro de aspas). */
  const parseCSVLine = (line: string, sep: string): string[] => {
    const parts: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (!inQuotes && c === sep) {
        parts.push(current.trim());
        current = "";
      } else {
        current += c;
      }
    }
    parts.push(current.trim());
    return parts;
  };

  const handleDownloadTemplate = () => {
    const bom = "\uFEFF";
    const content = [TEMPLATE_HEADER, TEMPLATE_EXAMPLE, "obrigado;text;Agradecemos por utilizar nossos serviços!;COMERCIAL,ATENDIMENTOS GERAIS"].join("\n");
    const blob = new Blob([bom + content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-respostas-rapidas.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseBulkFile = (file: File): Promise<{ shortCut: string; type: string; text: string; filas: string }[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result ?? "");
        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (lines.length < 2) {
          resolve([]);
          return;
        }
        const headerLine = lines[0].toLowerCase();
        const sep = headerLine.includes(";") ? ";" : ",";
        const headerParts = parseCSVLine(lines[0], sep).map((p) => p.toLowerCase().replace(/^"|"$/g, "").trim());
        const dataLines = lines.slice(1);
        const idxAtalho = headerParts.findIndex((h) => h === "atalho");
        const idxTipo = headerParts.findIndex((h) => h === "tipo");
        const idxTexto = headerParts.findIndex((h) => h === "texto");
        const idxFilas = headerParts.findIndex((h) => h === "filas");
        const rows: { shortCut: string; type: string; text: string; filas: string }[] = [];
        for (const line of dataLines) {
          const parts = parseCSVLine(line, sep).map((p) => p.replace(/^"|"$/g, "").trim());
          const shortCut = idxAtalho >= 0 ? (parts[idxAtalho] ?? "") : parts[0] ?? "";
          const type = idxTipo >= 0 ? (parts[idxTipo] ?? "text") : parts[1] ?? "text";
          const text = idxTexto >= 0 ? (parts[idxTexto] ?? "") : parts[2] ?? "";
          const filas = idxFilas >= 0 ? (parts[idxFilas] ?? "") : parts[3] ?? "";
          if (shortCut) rows.push({ shortCut, type: type || "text", text, filas });
        }
        resolve(rows);
      };
      reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
      reader.readAsText(file, "UTF-8");
    });
  };

  const handleBulkFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBulkImportResult(null);
    setBulkImportError(null);
    try {
      const parsed = await parseBulkFile(file);
      setBulkParsedRows(parsed);
    } catch {
      setError("Erro ao processar o arquivo. Use o modelo em CSV (separador ; ou ,).");
    }
  };

  const handleGenerateBulkWithAI = async () => {
    const idea = bulkIdea.trim();
    if (!idea || !slug) return;
    setBulkGeneratingAI(true);
    setBulkImportError(null);
    setBulkImportResult(null);
    try {
      const res = await fetch("/api/ai/generate-bulk-quick-replies", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(apiHeaders ?? {}) },
        body: JSON.stringify({ idea, count: 8 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBulkImportError(data?.error ?? "Falha ao gerar sugestões com IA.");
        return;
      }
      const list = Array.isArray(data?.suggestions) ? data.suggestions : [];
      setBulkParsedRows(
        list.map((s: { shortCut?: string; type?: string; text?: string }) => ({
          shortCut: s.shortCut ?? "resposta",
          type: s.type ?? "text",
          text: s.text ?? "",
          filas: "",
        }))
      );
    } catch {
      setBulkImportError("Erro de rede ao gerar sugestões.");
    } finally {
      setBulkGeneratingAI(false);
    }
  };

  const handleBulkImport = async () => {
    if (!slug || !bulkChannelId || bulkParsedRows.length === 0) return;
    const invalidRows = bulkParsedRows.filter((r, i) => (r.type === "text" || !r.type) && !(r.text ?? "").trim());
    if (invalidRows.length > 0) {
      setBulkImportError(
        "Para tipo 'text', a coluna 'texto' é obrigatória. Preencha o texto nas linhas: " +
          invalidRows.map((r) => r.shortCut).slice(0, 5).join(", ") +
          (invalidRows.length > 5 ? "…" : "") +
          "."
      );
      return;
    }
    setBulkImporting(true);
    setError(null);
    setBulkImportResult(null);
    setBulkImportError(null);
    let ok = 0;
    let fail = 0;
    let firstErrorMessage: string | null = null;
    const delayMs = 500; // Pequena pausa entre cada criação para evitar 502/timeout na UAZAPI
    for (let i = 0; i < bulkParsedRows.length; i++) {
      const row = bulkParsedRows[i];
      const queueIds = bulkQueueIds.length > 0
        ? bulkQueueIds
        : row.filas
          ? row.filas.split(",").map((f) => f.trim()).filter(Boolean)
              .map((name) => channelQueues.find((q) => q.name.trim().toLowerCase() === name.toLowerCase())?.id)
              .filter((id): id is string => Boolean(id))
          : [];
      try {
        const res = await fetch("/api/quick-replies", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...(apiHeaders ?? {}) },
          body: JSON.stringify({
            channel_id: bulkChannelId,
            shortCut: row.shortCut,
            type: row.type || "text",
            templateCategory: moduleTab,
            text: row.text || undefined,
            queueIds,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          ok++;
        } else {
          fail++;
          if (!firstErrorMessage && typeof data?.error === "string") firstErrorMessage = data.error;
        }
        if (i < bulkParsedRows.length - 1) await new Promise((r) => setTimeout(r, delayMs));
      } catch (e) {
        fail++;
        if (!firstErrorMessage) firstErrorMessage = e instanceof Error ? e.message : "Erro de rede.";
      }
    }
    setBulkImportResult({ ok, fail });
    if (firstErrorMessage) setBulkImportError(firstErrorMessage);
    setBulkImporting(false);
    if (ok > 0) {
      fetchQuickReplies();
      setBulkParsedRows([]);
    }
  };

  const closeForm = () => {
    setShowGeneralForm(false);
    setSideOverTab("form");
    setForm(EMPTY_FORM);
    setFormAiError(null);
    setDetailTestNumber("");
  };

  const handleToggleEnabled = async (row: QuickReplyRow) => {
    setError(null);
    try {
      const res = await fetch("/api/quick-replies", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(apiHeaders ?? {}),
        },
        body: JSON.stringify({
          quick_reply_id: row.id,
          enabled: !row.enabled,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Falha ao ativar/desativar.");
        return;
      }
      fetchQuickReplies();
    } catch {
      setError("Erro de rede ao atualizar status.");
    }
  };

  const handleGenerateWithAI = async () => {
    if (!slug) return;
    setSaving(true);
    setFormAiError(null);
    try {
      const queueNames = form.queueIds
        .map((qid) => channelQueues.find((q) => q.id === qid)?.name)
        .filter(Boolean);
      const contextParts: string[] = [];
      if (form.shortCut) contextParts.push(`Título/atalho: ${form.shortCut}`);
      if (queueNames.length > 0) contextParts.push(`Filas: ${queueNames.join(", ")}`);
      const currentText = stripHtmlToText(form.text || "");
      if (currentText) {
        contextParts.push(`Texto atual do usuário (manter o contexto e melhorar sem mudar a intenção): ${currentText}`);
      }
      if (form.templateCategory === "consent") {
        contextParts.push("Uso: mensagem de consentimento para WhatsApp com linguagem clara, direta e amigável.");
        contextParts.push(`Palavras de aceite esperadas: ${form.consentAcceptKeywords || "SIM"}.`);
        contextParts.push(`Palavras de saída esperadas: ${form.consentOptOutKeywords || "SAIR"}.`);
        contextParts.push("Objetivo: solicitar autorização para envio de comunicações antes de campanhas.");
      } else if (form.templateCategory === "campaign") {
        contextParts.push("Uso: template para campanha no WhatsApp, comercial e objetivo.");
      } else {
      contextParts.push("Uso: mensagem curta e educada para atendimento no WhatsApp.");
      }
      const res = await fetch("/api/ai/generate-description", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(apiHeaders ?? {}),
        },
        body: JSON.stringify({
          type: "quick_reply",
          field: "description",
          name:
            form.shortCut ||
            (form.templateCategory === "consent"
              ? "Template de consentimento"
              : form.templateCategory === "campaign"
                ? "Template de campanha"
                : "Resposta rápida"),
          context: contextParts.join(". "),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.text) {
        setFormAiError(
          data?.error ?? "Sugestão indisponível no momento. Ignore ou tente mais tarde."
        );
        return;
      }
      setForm((cur) => ({ ...cur, text: data.text as string }));
      setFormAiError(null);
    } catch {
      setFormAiError("Erro de rede. Você pode preencher o texto manualmente.");
    } finally {
      setSaving(false);
    }
  };

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Falha ao ler arquivo."));
      reader.readAsDataURL(file);
    });

  const handleFormMediaUpload = async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setForm((prev) => ({ ...prev, file: dataUrl }));
    } catch {
      setError("Não foi possível carregar o arquivo.");
    }
  };

  const handleFormCarouselUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      const urls = await Promise.all(Array.from(files).map((file) => readFileAsDataUrl(file)));
      setForm((prev) => ({
        ...prev,
        campaignCarouselText: [...prev.campaignCarouselText.split(/\r?\n/).filter(Boolean), ...urls].join("\n"),
      }));
    } catch {
      setError("Não foi possível carregar as imagens do carrossel.");
    }
  };

  const handleAssistantMediaUpload = async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setAssistantDraft((prev) => ({
        ...prev,
        campaignFile: dataUrl,
        campaignImageButton: prev.campaignContentType === "image" ? dataUrl : prev.campaignImageButton,
      }));
    } catch {
      setError("Não foi possível carregar a mídia.");
    }
  };

  const handleAssistantCarouselUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      const urls = await Promise.all(Array.from(files).map((file) => readFileAsDataUrl(file)));
      const cards: string[] = [];
      urls.forEach((url, i) => {
        cards.push(`[Card ${i + 1}]`);
        cards.push(`{${url}}`);
        cards.push(`Saiba mais|card_${i + 1}`);
      });
      setAssistantDraft((prev) => ({
        ...prev,
        campaignChoicesText: cards.join("\n"),
      }));
    } catch {
      setError("Não foi possível carregar as imagens do carrossel.");
    }
  };

  const handleSave = async () => {
    const plainText = stripHtmlToText(form.text);
    if (!slug) return;
    if (!form.shortCut.trim()) {
      setError("Preencha o atalho da resposta rápida.");
      return;
    }
    if (form.type === "text" && !plainText) {
      setError("Preencha o texto da resposta rápida.");
      return;
    }
    if (form.type !== "text" && !form.file.trim()) {
      setError("Para templates com mídia, informe a URL/base64 do arquivo.");
      return;
    }
    if (!form.channelId.trim() && form.queueIds.length === 0) {
      setError("Selecione uma conexão para escolher as filas.");
      return;
    }
    if (form.templateCategory === "consent" && !plainText) {
      setError("Template de consentimento precisa de texto claro de autorização.");
      return;
    }
    if (form.templateCategory === "campaign" && form.type === "text" && !plainText) {
      setError("Template de campanha de texto precisa de mensagem.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const templateConfig: Record<string, unknown> =
        form.templateCategory === "consent"
          ? {
              consent_action: form.consentAction,
              accept_keywords: form.consentAcceptKeywords
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean),
              opt_out_keywords: form.consentOptOutKeywords
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean),
              legal_text: form.consentLegalText.trim() || null,
              rich_text_html: form.text || null,
            }
          : form.templateCategory === "campaign"
            ? {
                buttons: form.campaignButtonsText
                  .split(/\r?\n/)
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line) => {
                    const [labelRaw, urlRaw] = line.split("|");
                    return {
                      label: (labelRaw ?? "").trim(),
                      url: (urlRaw ?? "").trim(),
                    };
                  })
                  .filter((btn) => btn.label && btn.url),
                carousel_items: form.campaignCarouselText
                  .split(/\r?\n/)
                  .map((line) => line.trim())
                  .filter(Boolean),
                rich_text_html: form.text || null,
              }
          : {};
      const res = await fetch("/api/quick-replies", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(apiHeaders ?? {}),
        },
        body: JSON.stringify({
          ...(form.id ? { quick_reply_id: form.id } : {}),
          ...(form.channelId ? { channel_id: form.channelId } : {}),
          shortCut: form.shortCut.trim(),
          type: form.type,
          templateCategory: form.templateCategory,
          templateConfig,
          text: form.type === "text" ? plainText : undefined,
          file: form.type !== "text" ? form.file.trim() || undefined : undefined,
          docName: form.docName.trim() || undefined,
          queueIds: form.templateCategory === "consent" ? [] : form.queueIds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Falha ao salvar resposta rápida.");
        return;
      }
      fetchQuickReplies();
      setForm({ ...EMPTY_FORM, channelId: form.channelId, templateCategory: form.templateCategory });
      setFormAiError(null);
    } catch {
      setError("Erro de rede ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const openAssistant = (kind: "consent" | "campaign") => {
    setAssistantKind(kind);
    setAssistantStep(0);
    setAssistantAiError(null);
    setAssistantTestNumber("");
    setAssistantDraft((prev) => ({
      ...prev,
      channelId: channels[0]?.id ?? prev.channelId ?? "",
      queueIds: [],
      shortCut: "",
      text: "",
      ...(kind === "consent"
        ? {
            consentAction: "opt_in_request" as const,
            consentAcceptKeywords: "SIM",
            consentOptOutKeywords: "SAIR,PARAR,STOP",
          }
        : {
            campaignMenuType: "button" as const,
            campaignContentType: "text" as const,
            campaignFile: "",
            campaignDocName: "",
            campaignChoicesText: "Quero saber mais|campaign_info",
            campaignFooterText: "",
            campaignListButton: "Ver opções",
            campaignSelectableCount: 1,
            campaignImageButton: "",
          }),
    }));
    setShowAssistantBot(true);
  };

  const assistantChoices = assistantDraft.campaignChoicesText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const handleAssistantGenerateText = async () => {
    if (!slug) return;
    setAssistantSaving(true);
    setAssistantAiError(null);
    try {
      const currentText = stripHtmlToText(assistantDraft.text || "");
      const context =
        assistantKind === "consent"
          ? `Uso: mensagem de consentimento para WhatsApp. Palavras de aceite: ${assistantDraft.consentAcceptKeywords}. Palavras de saída: ${assistantDraft.consentOptOutKeywords}.${currentText ? ` Texto atual do usuário: ${currentText}. Reescreva mantendo o mesmo contexto.` : ""}`
          : `Uso: mensagem de campanha interativa no WhatsApp (tipo ${assistantDraft.campaignMenuType}).${currentText ? ` Texto atual do usuário: ${currentText}. Melhore sem fugir do contexto.` : ""}`;
      const res = await fetch("/api/ai/generate-description", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(apiHeaders ?? {}),
        },
        body: JSON.stringify({
          type: "quick_reply",
          field: "description",
          name: assistantDraft.shortCut || (assistantKind === "consent" ? "Template de consentimento" : "Template de campanha"),
          context,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.text) {
        setAssistantAiError(data?.error ?? "Falha ao gerar texto com IA.");
        return;
      }
      setAssistantDraft((prev) => ({ ...prev, text: String(data.text) }));
    } catch {
      setAssistantAiError("Erro de rede ao gerar texto.");
    } finally {
      setAssistantSaving(false);
    }
  };

  const handleAssistantSave = async () => {
    const assistantPlainText = stripHtmlToText(assistantDraft.text);
    if (!assistantDraft.channelId || !assistantDraft.shortCut.trim() || !assistantPlainText) {
      setError("Preencha conexão, atalho e texto antes de salvar.");
      return;
    }
    if (assistantKind === "campaign" && assistantDraft.queueIds.length === 0) {
      setError("Selecione uma fila para o template de campanha.");
      return;
    }
    setAssistantSaving(true);
    setError(null);
    try {
      if (assistantKind === "consent") {
        const templateConfig = {
          consent_action: assistantDraft.consentAction,
          accept_keywords: assistantDraft.consentAcceptKeywords.split(",").map((v) => v.trim()).filter(Boolean),
          opt_out_keywords: assistantDraft.consentOptOutKeywords.split(",").map((v) => v.trim()).filter(Boolean),
          source: "assistant_builder",
        };
        const res = await fetch("/api/quick-replies", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...(apiHeaders ?? {}) },
          body: JSON.stringify({
            channel_id: assistantDraft.channelId,
            shortCut: assistantDraft.shortCut.trim(),
            type: "text",
            text: assistantPlainText,
            templateCategory: "consent",
            templateConfig,
            queueIds: [],
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data?.error ?? "Falha ao salvar template de consentimento.");
          return;
        }
      } else {
        const menuType = assistantDraft.campaignContentType === "carousel" ? "carousel" : assistantDraft.campaignMenuType;
        const templateConfig = {
          content_type: assistantDraft.campaignContentType,
          menu_type: menuType,
          choices: assistantChoices,
          footer_text: assistantDraft.campaignFooterText.trim() || null,
          list_button: assistantDraft.campaignListButton.trim() || null,
          selectable_count: assistantDraft.campaignSelectableCount,
          image_button: assistantDraft.campaignImageButton.trim() || null,
          media_file: assistantDraft.campaignFile || null,
          media_doc_name: assistantDraft.campaignDocName || null,
          source: "assistant_builder",
        };
        const res = await fetch("/api/quick-replies", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...(apiHeaders ?? {}) },
          body: JSON.stringify({
            channel_id: assistantDraft.channelId,
            shortCut: assistantDraft.shortCut.trim(),
            type: assistantDraft.campaignContentType === "carousel" ? "text" : assistantDraft.campaignContentType,
            text: assistantPlainText,
            file: assistantDraft.campaignContentType !== "text" && assistantDraft.campaignContentType !== "carousel" ? assistantDraft.campaignFile || undefined : undefined,
            docName: assistantDraft.campaignContentType === "document" ? assistantDraft.campaignDocName || undefined : undefined,
            templateCategory: "campaign",
            templateConfig,
            queueIds: assistantDraft.queueIds,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data?.error ?? "Falha ao salvar template de campanha.");
          return;
        }
      }
      await fetchQuickReplies();
      setShowAssistantBot(false);
    } catch {
      setError("Erro de rede ao salvar template.");
    } finally {
      setAssistantSaving(false);
    }
  };

  const handleAssistantTest = async () => {
    if (!assistantDraft.channelId) {
      setError("Selecione uma conexão antes de testar.");
      return;
    }
    if (!assistantTestNumber.trim()) {
      setError("Informe um número para teste.");
      return;
    }
    setAssistantTesting(true);
    setError(null);
    try {
      const assistantPlainText = stripHtmlToText(assistantDraft.text);
      if (assistantKind === "consent") {
        setError("Teste de consentimento foi removido deste módulo. Use o fluxo de Contatos.");
        return;
      } else {
        const menuType = assistantDraft.campaignContentType === "carousel" ? "carousel" : assistantDraft.campaignMenuType;
        const res = await fetch("/api/campaigns/send-test", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...(apiHeaders ?? {}) },
          body: JSON.stringify({
            channel_id: assistantDraft.channelId,
            number: assistantTestNumber,
            short_cut: assistantDraft.shortCut || "campaign_assistant",
            text: assistantPlainText,
            menu_type: menuType,
            choices: assistantChoices,
            footer_text: assistantDraft.campaignFooterText,
            list_button: assistantDraft.campaignListButton,
            selectable_count: assistantDraft.campaignSelectableCount,
            image_button: assistantDraft.campaignImageButton || (assistantDraft.campaignContentType === "image" ? assistantDraft.campaignFile : ""),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data?.error ?? "Falha no teste de campanha.");
          return;
        }
      }
      setError("Teste enviado com sucesso.");
    } catch {
      setError("Erro de rede ao testar.");
    } finally {
      setAssistantTesting(false);
    }
  };

  const handleDetailTest = async () => {
    if (!form.channelId || !detailTestNumber.trim()) {
      setError("Informe conexão e número de teste no detalhe.");
      return;
    }
    setDetailTesting(true);
    setError(null);
    try {
      const formPlainText = stripHtmlToText(form.text);
      if (form.templateCategory === "consent") {
        setError("Teste de consentimento foi removido deste módulo. Use o fluxo de Contatos.");
        return;
      } else if (form.templateCategory === "campaign") {
        const cfg = (form.id ? rows.find((r) => r.id === form.id)?.templateConfig : {}) ?? {};
        const menuType = String((cfg as Record<string, unknown>).menu_type ?? "button") as "button" | "list" | "poll" | "carousel";
        const rawChoices = Array.isArray((cfg as Record<string, unknown>).choices)
          ? ((cfg as Record<string, unknown>).choices as string[])
          : [];
        const fallbackChoices =
          form.campaignCarouselText.trim().length > 0
            ? form.campaignCarouselText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
            : form.campaignButtonsText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        const res = await fetch("/api/campaigns/send-test", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...(apiHeaders ?? {}) },
          body: JSON.stringify({
            channel_id: form.channelId,
            number: detailTestNumber,
            short_cut: form.shortCut || "campaign_template",
            text: formPlainText,
            menu_type: menuType,
            choices: rawChoices.length > 0 ? rawChoices : fallbackChoices,
            image_button: form.type === "image" ? form.file : undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data?.error ?? "Falha no teste de campanha.");
          return;
        }
      } else {
        setError("Teste rápido disponível apenas para templates de consentimento e campanha.");
        return;
      }
      setError("Teste enviado com sucesso.");
    } catch {
      setError("Erro de rede ao testar.");
    } finally {
      setDetailTesting(false);
    }
  };

  const doDeleteOne = async (row: QuickReplyRow) => {
    if (!slug) return;
    setDeleting(row.id);
    setError(null);
    setDeleteConfirmRow(null);
    try {
      const res = await fetch("/api/quick-replies", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(apiHeaders ?? {}),
        },
        body: JSON.stringify({
          quick_reply_id: row.id,
          delete: true,
          shortCut: row.shortCut,
          type: row.type,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Falha ao excluir resposta rápida.");
        return;
      }
      fetchQuickReplies();
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    } catch {
      setError("Erro de rede ao excluir.");
    } finally {
      setDeleting(null);
    }
  };

  const doBulkDelete = async () => {
    if (!slug || selectedIds.size === 0) return;
    const toDelete = rows.filter((r) => selectedIds.has(r.id));
    setBulkActionLoading(true);
    setError(null);
    try {
      await Promise.all(
        toDelete.map((row) =>
          fetch("/api/quick-replies", {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              ...(apiHeaders ?? {}),
            },
            body: JSON.stringify({
              quick_reply_id: row.id,
              delete: true,
              shortCut: row.shortCut,
              type: row.type,
            }),
          })
        )
      );
      setSelectedIds(new Set());
      fetchQuickReplies();
    } catch {
      setError("Erro de rede ao excluir.");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkLinkSubmit = async () => {
    if (!slug || selectedIds.size === 0 || bulkLinkQueueIds.length === 0) return;
    setBulkLinkLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/quick-replies/bulk-link", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(apiHeaders ?? {}),
        },
        body: JSON.stringify({
          quick_reply_ids: Array.from(selectedIds),
          queue_ids: bulkLinkQueueIds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Falha ao vincular filas.");
        return;
      }
      setShowBulkLink(false);
      setBulkLinkQueueIds([]);
      setSelectedIds(new Set());
      fetchQuickReplies();
    } catch {
      setError("Erro de rede ao vincular filas.");
    } finally {
      setBulkLinkLoading(false);
    }
  };

  const toggleSelectAll = () => {
    if (tabRows.length > 0 && tabRows.every((r) => selectedIds.has(r.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tabRows.map((r) => r.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const queueNames = (queueIds: string[]) =>
    queueIds
      .map((qid) => queues.find((q) => q.id === qid)?.name)
      .filter(Boolean)
      .join(", ") || "—";

<<<<<<< HEAD
  const tabRows = useMemo(() => {
    return rows.filter((r) => (r.templateCategory ?? "general") === moduleTab);
  }, [rows, moduleTab]);

  const tabCounts = useMemo(
    () => ({
      general: rows.filter((r) => (r.templateCategory ?? "general") === "general").length,
      campaign: rows.filter((r) => (r.templateCategory ?? "general") === "campaign").length,
    }),
    [rows]
  );

  const pagedRows = tabRows.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE);
  const moduleTabMeta = {
    general: {
      singular: "resposta rápida",
      plural: "respostas rápidas",
      createLabel: "Nova resposta rápida",
      emptyTitle: "Nenhuma resposta rápida cadastrada.",
      emptyHint: "Crie templates para uso no chat dos agentes.",
    },
    campaign: {
      singular: "template de campanha",
      plural: "templates de campanha",
      emptyTitle: "Nenhum template de campanha cadastrado.",
      emptyHint: "As ações desta aba ficam na tabela (editar/excluir).",
    },
  }[moduleTab];
=======
  if (slug && permissionsData !== undefined && !canAccessQuickReplies) {
    return null;
  }
>>>>>>> 90177313e89862f0eb89d72726a0395ad050d21b

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1E293B]">Respostas rápidas</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchQuickReplies()}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0] transition-colors"
            aria-label="Atualizar"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </button>
          {moduleTab === "general" && (
            <button
              type="button"
              onClick={openNewForm}
              disabled={channels.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title={channels.length === 0 ? "Cadastre uma conexão antes" : undefined}
            >
              <Plus className="h-4 w-4" />
              {moduleTabMeta.createLabel}
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-b border-[#E2E8F0]">
        <button
          type="button"
          onClick={() => setModuleTab("general")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            moduleTab === "general"
              ? "border-clicvend-orange text-clicvend-orange"
              : "border-transparent text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          Respostas rápidas ({tabCounts.general})
        </button>
        <button
          type="button"
          onClick={() => setModuleTab("campaign")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            moduleTab === "campaign"
              ? "border-clicvend-orange text-clicvend-orange"
              : "border-transparent text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          <Megaphone className="h-4 w-4" />
          Templates de campanha ({tabCounts.campaign})
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && tabRows.length === 0 ? (
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-8 text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-[#94A3B8]" />
          <p className="mt-2 text-[#64748B]">Carregando respostas rápidas…</p>
        </div>
      ) : tabRows.length === 0 ? (
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-8 text-center">
          <MessageSquare className="mx-auto h-12 w-12 text-[#94A3B8]" />
          <p className="mt-2 text-[#64748B]">{moduleTabMeta.emptyTitle}</p>
          <p className="mt-1 text-xs text-[#94A3B8]">
            {moduleTabMeta.emptyHint}
          </p>
          {moduleTab === "general" && (
            <button
              type="button"
              onClick={openNewForm}
              disabled={channels.length === 0}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {moduleTabMeta.createLabel}
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
            <p className="text-sm text-[#64748B]">
              <span className="font-medium text-[#1E293B]">{tabRows.length}</span> item(ns) nesta aba
            </p>
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-[#64748B]">
                <MessageSquare className="h-4 w-4 text-clicvend-orange" />
                <span className="uppercase text-[10px] font-medium tracking-wider text-[#64748B]">
                  Templates
                </span>
                <strong className="text-[#1E293B]">{tabRows.length}</strong>
              </span>
            </div>
          </div>

          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 bg-clicvend-orange/10 border-b border-[#E2E8F0]">
              <span className="text-sm font-medium text-[#1E293B]">
                {selectedIds.size} resposta(s) rápida(s) selecionada(s)
              </span>
              <div className="inline-flex flex-wrap rounded-lg border border-[#E2E8F0] bg-white overflow-hidden shadow-sm">
                <button
                  type="button"
                  disabled={bulkActionLoading}
                  onClick={() => setShowBulkLink(true)}
                  className="inline-flex items-center gap-1.5 border-r border-[#E2E8F0] bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                  title="Vincular filas às respostas selecionadas."
                >
                  <Link2 className="h-4 w-4" />
                  Vincular
                </button>
                <button
                  type="button"
                  disabled={bulkActionLoading}
                  onClick={() => setBulkDeleteConfirm(true)}
                  className="inline-flex items-center gap-1.5 border-r border-[#E2E8F0] bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                  title="Excluir as respostas rápidas selecionadas."
                >
                  {bulkActionLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Excluir
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  disabled={bulkActionLoading}
                  className="inline-flex items-center gap-1.5 bg-white px-3 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9] disabled:opacity-60"
                  title="Desmarcar todas."
                >
                  Limpar seleção
                </button>
              </div>
            </div>
          )}

          <div className="overflow-auto max-h-[60vh] min-h-[200px]">
            <table className="w-full min-w-[640px] border-collapse">
              <thead className="sticky top-0 z-10 bg-[#F8FAFC]">
                <tr className="border-b border-[#E2E8F0]">
                  <th className="w-10 px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={tabRows.length > 0 && tabRows.every((r) => selectedIds.has(r.id))}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
                      aria-label="Selecionar todas"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    Atalho
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    Tipo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    Texto
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    Filas
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    Canais
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[#E2E8F0] transition-colors hover:bg-[#F8FAFC]"
                  >
                    <td className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        className="h-4 w-4 rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
                        aria-label={`Selecionar ${row.shortCut}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-semibold text-[#1E293B]">{row.shortCut}</p>
                        {row.uazapiId ? (
                          <p
                            className="font-mono text-[10px] text-[#94A3B8]"
                            title={`ID UAZAPI: ${row.uazapiId}`}
                          >
                            {row.uazapiId.length > 16
                              ? `${row.uazapiId.slice(0, 12)}…`
                              : row.uazapiId}
                          </p>
                        ) : (
                          <p
                            className="font-mono text-[10px] text-[#94A3B8] opacity-60"
                            title={`ID Interno: ${row.id}`}
                          >
                            Local: #{row.id.slice(0, 8)}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#64748B]">{row.type}</td>
                    <td className="max-w-[200px] px-4 py-3 text-sm text-[#64748B] truncate">
                      {row.text
                        ? row.text.length > 50
                          ? `${row.text.slice(0, 50)}…`
                          : row.text
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {row.onWhatsApp ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 uppercase">
                          WhatsApp
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 uppercase">
                          Aplicação
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-[#64748B]">
                      {queueNames(row.queueIds)}
                    </td>
                    <td className="px-4 py-3 text-sm text-[#64748B]">
                      {row.channels && row.channels.length > 0 ? (
                        row.channels.map((c) => c.name).join(", ")
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {deleting === row.id ? (
                          <Loader2 className="h-5 w-5 animate-spin text-[#64748B]" />
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditForm(row)}
                              title="Configurar"
                              className="rounded-lg p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B] transition-colors"
                            >
                              <Settings className="h-5 w-5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmRow(row)}
                              title="Excluir"
                              className="rounded-lg p-2 text-[#64748B] hover:bg-red-50 hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2">
            <span className="text-sm text-[#64748B]">
              Página {pageIndex + 1} de {Math.ceil(tabRows.length / PAGE_SIZE) || 1} ({tabRows.length} item{tabRows.length !== 1 ? "s" : ""})
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                disabled={pageIndex === 0}
                className="rounded p-2 text-[#64748B] hover:bg-white hover:text-[#1E293B] disabled:opacity-40 disabled:pointer-events-none"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setPageIndex((p) => Math.min(Math.ceil(tabRows.length / PAGE_SIZE) - 1, p + 1))}
                disabled={pageIndex >= Math.ceil(tabRows.length / PAGE_SIZE) - 1}
                className="rounded p-2 text-[#64748B] hover:bg-white hover:text-[#1E293B] disabled:opacity-40 disabled:pointer-events-none"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <SideOver
        open={showBulkLink}
        onClose={() => setShowBulkLink(false)}
        title={`Vincular ${selectedIds.size} resposta(s) a filas`}
        width={500}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[#64748B]">
            Selecione as filas que deseja vincular às respostas rápidas selecionadas.
            Isso tornará essas respostas disponíveis para os agentes dessas filas.
          </p>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[#334155]">Filas disponíveis</label>
            {queues.length === 0 ? (
              <p className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-3 text-sm text-[#64748B]">
                Nenhuma fila encontrada.
              </p>
            ) : (
              <div className="flex flex-col gap-2 rounded-lg border border-[#E2E8F0] p-2 max-h-[300px] overflow-y-auto">
                {queues.map((q) => (
                  <label key={q.id} className="flex items-center gap-2 p-2 hover:bg-[#F8FAFC] rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkLinkQueueIds.includes(q.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setBulkLinkQueueIds((prev) => [...prev, q.id]);
                        } else {
                          setBulkLinkQueueIds((prev) => prev.filter((id) => id !== q.id));
                        }
                      }}
                      className="h-4 w-4 rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
                    />
                    <span className="text-sm text-[#1E293B]">{q.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 flex justify-end gap-2 border-t border-[#E2E8F0] pt-4">
            <button
              type="button"
              onClick={() => setShowBulkLink(false)}
              className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleBulkLinkSubmit}
              disabled={bulkLinkLoading || bulkLinkQueueIds.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
            >
              {bulkLinkLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              Vincular Filas
            </button>
          </div>
        </div>
      </SideOver>

      <SideOver
        open={showGeneralForm}
        onClose={closeForm}
        title={
          form.id
            ? `Editar ${form.templateCategory === "consent" ? "template de consentimento" : form.templateCategory === "campaign" ? "template de campanha" : "resposta rápida"}: ${form.shortCut || "…"}`
            : "Nova resposta rápida"
        }
          width={500}
      >
        {form.templateCategory === "general" && (
          <div className="mb-4 flex flex-wrap gap-2 border-b border-[#E2E8F0] pb-3">
            <button
              type="button"
              onClick={() => setSideOverTab("form")}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                sideOverTab === "form"
                  ? "bg-clicvend-orange/10 text-clicvend-orange"
                  : "text-[#64748B] hover:bg-[#F1F5F9]"
              }`}
            >
              Configuração
            </button>
            <button
              type="button"
              onClick={() => setSideOverTab("import")}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                sideOverTab === "import"
                  ? "bg-clicvend-orange/10 text-clicvend-orange"
                  : "text-[#64748B] hover:bg-[#F1F5F9]"
              }`}
            >
              Importar em massa
            </button>
            <button
              type="button"
              onClick={() => setSideOverTab("ativas")}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                sideOverTab === "ativas"
                  ? "bg-clicvend-orange/10 text-clicvend-orange"
                  : "text-[#64748B] hover:bg-[#F1F5F9]"
              }`}
            >
              Respostas ativas
            </button>
          </div>
        )}

        {sideOverTab === "form" && (
          <>
            <p className="mb-4 text-sm text-[#64748B]">
              {form.templateCategory === "consent"
                ? "Edite o template de consentimento vinculado à instância."
                : form.templateCategory === "campaign"
                  ? "Edite o template de campanha e seus conteúdos."
                  : "Escolha a conexão e as filas em que esta resposta rápida ficará disponível no chat para os agentes."}
            </p>

            <p className="mb-4 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-xs text-[#64748B]">
              Categoria: <strong>{form.templateCategory === "consent" ? "Template de consentimento" : form.templateCategory === "campaign" ? "Template de campanha" : "Respostas rápidas (chat)"}</strong>
            </p>

            <label className="mb-1 block text-sm font-medium text-[#334155]">Conexão</label>
            <select
              value={form.channelId}
              onChange={(e) => handleChannelChange(e.target.value)}
              className="mb-4 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
            >
              <option value="">Selecionar conexão…</option>
              {channels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.name}
                </option>
              ))}
            </select>

            {form.templateCategory !== "consent" && (
              <>
                <label className="mb-1 block text-sm font-medium text-[#334155]">Filas (opcional)</label>
                <p className="mb-2 text-xs text-[#64748B]">
                  Filas vinculadas a esta conexão. Respostas vinculadas a uma fila ficam disponíveis para
                  agentes dessa fila no chat (até 40 respostas por fila).
                </p>
                {!form.channelId ? (
                  <p className="mb-4 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-3 text-sm text-[#64748B]">
                    Selecione uma conexão para ver as filas.
                  </p>
                ) : channelQueuesLoading ? (
                  <p className="mb-4 flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-3 text-sm text-[#64748B]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando filas…
                  </p>
                ) : channelQueues.length === 0 ? (
                  <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                    Nenhuma fila vinculada a esta conexão. Vincule filas em Configurar na tela de
                    Conexões.
                  </p>
                ) : (
                  <select
                    multiple
                    value={form.queueIds}
                    onChange={(e) => {
                      const selected = Array.from(e.target.selectedOptions, (o) => o.value);
                      setForm((c) => ({ ...c, queueIds: selected }));
                    }}
                    className="mb-4 h-24 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                  >
                    {channelQueues.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.name}
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}

            <label className="mb-1 block text-sm font-medium text-[#334155]">Atalho</label>
            <input
              type="text"
              value={form.shortCut}
              onChange={(e) => setForm((c) => ({ ...c, shortCut: e.target.value }))}
              placeholder="Ex: saudacao1"
              className="mb-4 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] placeholder:text-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
            />

            {form.templateCategory === "campaign" && (
              <>
                <label className="mb-1 block text-sm font-medium text-[#334155]">Tipo de conteúdo</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((c) => ({ ...c, type: e.target.value }))}
                  className="mb-4 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B]"
                >
                  <option value="text">Texto</option>
                  <option value="image">Imagem</option>
                  <option value="video">Video</option>
                  <option value="audio">Audio</option>
                  <option value="document">Documento</option>
                </select>
              </>
            )}

            <label className="mb-1 block text-sm font-medium text-[#334155]">
              {form.type === "text" ? "Texto" : "Mensagem / legenda"}
            </label>
            <div className="mb-2">
              <RichTextEditor
                value={form.text}
                onChange={(next) => setForm((c) => ({ ...c, text: next }))}
                placeholder={
                  form.templateCategory === "consent"
                    ? "Ex.: Para autorizar mensagens, responda SIM. Para sair, responda SAIR."
                    : "Ex: Olá! Como posso ajudar hoje?"
                }
              />
            </div>
            {stripHtmlToText(form.text).length > 0 && (
              <p className="mb-2 text-xs text-[#64748B]">
                Preview texto limpo: {stripHtmlToText(form.text).slice(0, 180)}
              </p>
            )}
            {form.templateCategory === "campaign" && form.type !== "text" && (
              <>
                <label className="mb-1 block text-sm font-medium text-[#334155]">Arquivo (URL/base64 ou upload)</label>
                <textarea
                  value={form.file}
                  onChange={(e) => setForm((c) => ({ ...c, file: e.target.value }))}
                  rows={3}
                  placeholder="Cole URL pública/base64 ou use o botão de upload abaixo"
                  className="mb-2 w-full resize-none rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B]"
                />
                <label className="mb-4 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#334155] hover:bg-[#F8FAFC]">
                  <Upload className="h-4 w-4" />
                  Subir arquivo
                  <input
                    type="file"
                    accept={form.type === "image" ? "image/*" : form.type === "video" ? "video/*" : form.type === "audio" ? "audio/*" : "*"}
                    className="sr-only"
                    onChange={(e) => handleFormMediaUpload(e.target.files?.[0] ?? null)}
                  />
                </label>
                {form.file && form.type === "image" && (
                  <img src={form.file} alt="preview" className="mb-4 max-h-36 rounded-lg border border-[#E2E8F0] object-cover" />
                )}
                {form.file && form.type === "video" && (
                  <video src={form.file} controls className="mb-4 max-h-36 w-full rounded-lg border border-[#E2E8F0]" />
                )}
                {form.file && form.type === "audio" && (
                  <audio src={form.file} controls className="mb-4 w-full" />
                )}
              </>
            )}
            {form.templateCategory === "campaign" && form.type === "document" && (
              <>
                <label className="mb-1 block text-sm font-medium text-[#334155]">Nome do documento</label>
                <input
                  type="text"
                  value={form.docName}
                  onChange={(e) => setForm((c) => ({ ...c, docName: e.target.value }))}
                  placeholder="Ex.: folder-promocao.pdf"
                  className="mb-4 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B]"
                />
              </>
            )}

            {form.templateCategory === "consent" && (
              <div className="mb-4 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                <p className="text-xs font-medium text-[#334155]">Configurações de consentimento</p>
                <div className="mt-2 grid gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#334155]">Ação do template</label>
                    <select
                      value={form.consentAction}
                      onChange={(e) =>
                        setForm((c) => ({
                          ...c,
                          templateCategory: "consent",
                          type: "text",
                          queueIds: [],
                          consentAction:
                            (e.target.value as "opt_in_request" | "opt_out_confirm") || "opt_in_request",
                        }))
                      }
                      className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                    >
                      <option value="opt_in_request">Solicitar opt-in (SIM confirma automaticamente)</option>
                      <option value="opt_out_confirm">Confirmar opt-out</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#334155]">Palavras de aceite</label>
                    <input
                      type="text"
                      value={form.consentAcceptKeywords}
                      onChange={(e) => setForm((c) => ({ ...c, consentAcceptKeywords: e.target.value }))}
                      placeholder="SIM,ACEITO,OK"
                      className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#334155]">Palavras de saída (opt-out)</label>
                    <input
                      type="text"
                      value={form.consentOptOutKeywords}
                      onChange={(e) => setForm((c) => ({ ...c, consentOptOutKeywords: e.target.value }))}
                      placeholder="SAIR,PARAR,STOP"
                      className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B]"
                    />
                  </div>
                </div>
              </div>
            )}

            {form.templateCategory === "campaign" && (
              <>
                <div className="mb-4 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                  <p className="text-xs font-medium text-[#334155]">Botões CTA</p>
                  <p className="mt-1 text-[11px] text-[#64748B]">Uma linha por botão: <code>label|url</code></p>
                  <textarea
                    value={form.campaignButtonsText}
                    onChange={(e) => setForm((c) => ({ ...c, campaignButtonsText: e.target.value }))}
                    rows={3}
                    placeholder={"Comprar agora|https://...\nFalar com vendedor|https://..."}
                    className="mt-2 w-full resize-none rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B]"
                  />
                </div>
                <div className="mb-4 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                  <p className="text-xs font-medium text-[#334155]">Carrossel (itens)</p>
                  <p className="mt-1 text-[11px] text-[#64748B]">Uma linha por item (URL de imagem/card).</p>
                  <textarea
                    value={form.campaignCarouselText}
                    onChange={(e) => setForm((c) => ({ ...c, campaignCarouselText: e.target.value }))}
                    rows={3}
                    placeholder={"https://.../card1.jpg\nhttps://.../card2.jpg"}
                    className="mt-2 w-full resize-none rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B]"
                  />
                  <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs text-[#334155] hover:bg-[#F8FAFC]">
                    <Upload className="h-3.5 w-3.5" />
                    Subir imagens do carrossel
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="sr-only"
                      onChange={(e) => handleFormCarouselUpload(e.target.files)}
                    />
                  </label>
                </div>
              </>
            )}
            <button
              type="button"
              disabled={saving}
              onClick={handleGenerateWithAI}
              className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/60 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              Sugerir com IA
            </button>
            {formAiError && (
              <p className="mb-4 text-xs text-amber-700">
                {formAiError}
                {formAiError.includes("Mistral") && (
                  <span className="block mt-1 text-[#64748B]">Você pode preencher o texto manualmente e salvar.</span>
                )}
              </p>
            )}
            {!formAiError && <div className="mb-4" />}
            {(form.templateCategory === "consent" || form.templateCategory === "campaign") && (
              <div className="mb-4 rounded-lg border border-[#E2E8F0] bg-white p-3">
                <p className="text-xs font-medium text-[#334155]">
                  Teste rápido ({form.templateCategory === "consent" ? "consentimento" : "campanha"})
                </p>
                <p className="mt-1 text-[11px] text-[#64748B]">
                  Informe um número e envie um teste do template atual para validar antes de usar em lote.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    value={detailTestNumber}
                    onChange={(e) => setDetailTestNumber(e.target.value)}
                    placeholder="Ex.: 5511999999999"
                    className="flex-1 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B] placeholder:text-[#94A3B8]"
                  />
                  <button
                    type="button"
                    onClick={handleDetailTest}
                    disabled={detailTesting}
                    className="inline-flex items-center gap-2 rounded-lg border border-clicvend-orange px-3 py-2 text-sm font-medium text-clicvend-orange hover:bg-clicvend-orange/10 disabled:opacity-60"
                  >
                    {detailTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Enviar teste
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando…
                  </>
                ) : (
                  "Salvar"
                )}
              </button>
            </div>
          </>
        )}

        {form.templateCategory === "general" && sideOverTab === "ativas" && (
          <div className="space-y-3">
            <p className="text-sm text-[#64748B]">
              Respostas ativas aparecem no chat para os agentes das filas vinculadas. Use o botão
              para ativar ou desativar.
            </p>
            {tabRows.length === 0 ? (
              <p className="py-4 text-center text-sm text-[#94A3B8]">
                Nenhum item desta aba. Crie na aba Configuração ou importe em massa.
              </p>
            ) : (
              tabRows.map((row) => (
                <div
                  key={row.id}
                  className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          row.enabled
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-[#E2E8F0] text-[#64748B]"
                        }`}
                      >
                        {row.enabled ? "Ativa" : "Inativa"}
                      </span>
                      {row.onWhatsApp && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 uppercase">
                          WhatsApp
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 font-semibold text-[#1E293B]">{row.shortCut}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-[#64748B]">
                      {row.text || "Sem texto definido."}
                    </p>
                    <p className="mt-1 text-[11px] text-[#94A3B8]">
                      Filas: {queueNames(row.queueIds)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleEnabled(row)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      row.enabled
                        ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                        : "bg-emerald-600 text-white hover:bg-emerald-700"
                    }`}
                  >
                    {row.enabled ? "Desativar" : "Ativar"}
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {form.templateCategory === "general" && sideOverTab === "import" && (
          <div className="space-y-4">
            <p className="text-sm text-[#64748B]">
              Escolha a conexão e as filas abaixo (igual à configuração individual). Baixe o modelo em CSV, preencha atalho, tipo e texto — ou descreva uma ideia e use a IA para gerar sugestões na tabela. Depois importe em massa.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="inline-flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC]"
              >
                <Download className="h-4 w-4" />
                Baixar modelo (CSV)
              </button>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC]">
                <Upload className="h-4 w-4" />
                Enviar planilha preenchida
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={handleBulkFileChange}
                />
              </label>
            </div>

            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
              <label className="block text-sm font-medium text-[#334155]">Gerar sugestões com IA</label>
              <p className="mt-0.5 text-xs text-[#64748B]">
                Descreva as respostas que deseja (ex.: saudação, estoque, horário de atendimento, despedida). A IA preenche a tabela abaixo.
              </p>
              <textarea
                value={bulkIdea}
                onChange={(e) => setBulkIdea(e.target.value)}
                placeholder="Ex.: saudação inicial, consulta de estoque, horário de funcionamento, pedido de feedback"
                rows={2}
                className="mt-2 w-full resize-none rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              />
              <button
                type="button"
                disabled={bulkGeneratingAI || !bulkIdea.trim()}
                onClick={handleGenerateBulkWithAI}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/60 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
              >
                {bulkGeneratingAI ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                Gerar sugestões com IA
              </button>
            </div>

            <label className="block text-sm font-medium text-[#334155]">Conexão para importar</label>
            <select
              value={bulkChannelId}
              onChange={(e) => {
                setBulkChannelId(e.target.value);
                setBulkQueueIds([]);
              }}
              className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
            >
              <option value="">Selecionar conexão…</option>
              {channels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[#64748B]">
              As respostas serão vinculadas às filas selecionadas e ficarão disponíveis no chat. Escolha as filas abaixo.
            </p>

            <label className="mt-4 block text-sm font-medium text-[#334155]">Filas (opcional)</label>
            <p className="mt-1 text-xs text-[#64748B]">
              Filas vinculadas a esta conexão. As respostas importadas ficarão disponíveis para as filas que você selecionar (até 40 por fila).
            </p>
            {!bulkChannelId ? (
              <p className="mt-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-3 text-sm text-[#64748B]">
                Selecione uma conexão para ver e escolher as filas.
              </p>
            ) : channelQueuesLoading ? (
              <p className="mt-1 flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-3 text-sm text-[#64748B]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando filas…
              </p>
            ) : channelQueues.length === 0 ? (
              <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                Nenhuma fila vinculada a esta conexão. Vincule filas em Configurar na tela de Conexões.
              </p>
            ) : (
              <select
                multiple
                value={bulkQueueIds}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, (o) => o.value);
                  setBulkQueueIds(selected);
                }}
                className="mt-1 h-24 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              >
                {channelQueues.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name}
                  </option>
                ))}
              </select>
            )}

            {bulkImportError && !bulkImportResult && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {bulkImportError}
              </div>
            )}
            {bulkImportResult && (
              <div className={`rounded-lg border px-3 py-2 text-sm ${bulkImportResult.fail > 0 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
                Importação concluída: {bulkImportResult.ok} criada(s), {bulkImportResult.fail} falha(s).
                {bulkImportError && bulkImportResult.fail > 0 && (
                  <p className="mt-2 text-xs opacity-90">Motivo: {bulkImportError}</p>
                )}
              </div>
            )}

            {bulkParsedRows.length > 0 && (
              <>
                <p className="text-sm font-medium text-[#334155]">
                  Preview: {bulkParsedRows.length} linha(s) — conexão: {channels.find((c) => c.id === bulkChannelId)?.name ?? "—"}
                  {bulkQueueIds.length > 0 && (
                    <> — filas: {channelQueues.filter((q) => bulkQueueIds.includes(q.id)).map((q) => q.name).join(", ")}</>
                  )}
                </p>
                <div className="max-h-48 overflow-auto rounded-lg border border-[#E2E8F0]">
                  <table className="min-w-full text-xs">
                    <thead className="sticky top-0 bg-[#F8FAFC]">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium text-[#64748B]">Atalho</th>
                        <th className="px-2 py-1.5 text-left font-medium text-[#64748B]">Tipo</th>
                        <th className="px-2 py-1.5 text-left font-medium text-[#64748B]">Texto</th>
                        <th className="px-2 py-1.5 text-left font-medium text-[#64748B]">Filas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {bulkParsedRows.slice(0, 20).map((row, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-[#1E293B]">{row.shortCut}</td>
                          <td className="px-2 py-1.5 text-[#64748B]">{row.type}</td>
                          <td className="max-w-[200px] truncate px-2 py-1.5 text-[#64748B]">{row.text}</td>
                          <td className="px-2 py-1.5 text-[#64748B]">
                            {bulkQueueIds.length > 0
                              ? channelQueues.filter((q) => bulkQueueIds.includes(q.id)).map((q) => q.name).join(", ")
                              : row.filas || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {bulkParsedRows.length > 20 && (
                    <p className="px-2 py-1 text-[11px] text-[#94A3B8]">
                      … e mais {bulkParsedRows.length - 20} linha(s).
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleBulkImport}
                    disabled={bulkImporting || !bulkChannelId}
                    className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-50"
                  >
                    {bulkImporting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Importando…
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        Importar {bulkParsedRows.length} resposta(s)
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setBulkParsedRows([]); setBulkImportResult(null); setBulkImportError(null); }}
                    className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]"
                  >
                    Limpar
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </SideOver>

      <SideOver
        open={showAssistantBot}
        onClose={() => setShowAssistantBot(false)}
        title={assistantKind === "consent" ? "Minichat: template de consentimento" : "Minichat: template de campanha"}
        width={560}
      >
        {(() => {
          const maxStep = assistantKind === "consent" ? 4 : 5;
          const progress = Math.round(((assistantStep + 1) / (maxStep + 1)) * 100);
          const canNext =
            assistantStep === 0
              ? assistantKind === "campaign"
                ? Boolean(assistantDraft.shortCut.trim())
                : Boolean(assistantDraft.channelId)
              : assistantStep === 1
                ? assistantKind === "campaign"
                  ? Boolean(assistantDraft.channelId && assistantDraft.queueIds.length > 0)
                  : Boolean(assistantDraft.shortCut.trim())
                : assistantStep === 2
                  ? assistantKind === "consent"
                    ? Boolean(stripHtmlToText(assistantDraft.text))
                    : Boolean(assistantDraft.campaignContentType)
                  : assistantStep === 3
                    ? assistantKind === "consent"
                      ? Boolean(
                          assistantDraft.consentAcceptKeywords.trim() &&
                            assistantDraft.consentOptOutKeywords.trim()
                        )
                      : Boolean(stripHtmlToText(assistantDraft.text))
                    : assistantStep === 4
                      ? assistantKind === "campaign"
                        ? assistantDraft.campaignContentType === "carousel"
                          ? Boolean(assistantChoices.length > 0)
                          : assistantDraft.campaignContentType === "text"
                            ? true
                            : Boolean(assistantDraft.campaignFile)
                        : true
                      : true;

          const question =
            assistantKind === "consent"
              ? assistantStep === 0
                ? "Qual conexão você quer usar para este template?"
                : assistantStep === 1
                  ? "Qual atalho vamos cadastrar?"
                  : assistantStep === 2
                    ? "Perfeito. Qual será a mensagem de consentimento?"
                    : assistantStep === 3
                      ? "Agora me diga as palavras de aceite e de saída."
                      : "Tudo certo. Vamos revisar, testar e salvar?"
              : assistantStep === 0
                ? "Primeiro passo: qual o nome da campanha/template?"
                : assistantStep === 1
                  ? "Agora selecione conexão e fila da campanha."
                  : assistantStep === 2
                    ? "Selecione o tipo de conteúdo da mensagem."
                    : assistantStep === 3
                      ? "Qual o texto principal da campanha?"
                      : assistantStep === 4
                        ? "Agora configure mídia/opções conforme o tipo escolhido."
                        : "Tudo certo. Vamos revisar, testar e salvar?";

          return (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                <div className="mb-2 flex items-center justify-between text-xs text-[#64748B]">
                  <span>Etapa {assistantStep + 1} de {maxStep + 1}</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#E2E8F0]">
                  <div className="h-full rounded-full bg-clicvend-orange transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>

              <div className="max-h-[300px] space-y-2 overflow-auto rounded-lg border border-[#E2E8F0] bg-white p-3">
                <div className="flex">
                  <div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-clicvend-orange/10 px-3 py-2 text-sm text-[#334155]">
                    {question}
                  </div>
                </div>
                {assistantDraft.channelId && (
                  <div className="flex justify-end">
                    <div className="max-w-[90%] rounded-2xl rounded-br-sm bg-[#F1F5F9] px-3 py-2 text-sm text-[#334155]">
                      Conexão: {channels.find((c) => c.id === assistantDraft.channelId)?.name ?? assistantDraft.channelId}
                    </div>
                  </div>
                )}
                {assistantDraft.shortCut.trim() && (
                  <div className="flex justify-end">
                    <div className="max-w-[90%] rounded-2xl rounded-br-sm bg-[#F1F5F9] px-3 py-2 text-sm text-[#334155]">
                      Atalho: {assistantDraft.shortCut}
                    </div>
                  </div>
                )}
                {stripHtmlToText(assistantDraft.text).trim() && assistantStep >= (assistantKind === "consent" ? 2 : 3) && (
                  <div className="flex justify-end">
                    <div className="max-w-[90%] rounded-2xl rounded-br-sm bg-[#F1F5F9] px-3 py-2 text-sm text-[#334155]">
                      Texto: {stripHtmlToText(assistantDraft.text).length > 180 ? `${stripHtmlToText(assistantDraft.text).slice(0, 180)}…` : stripHtmlToText(assistantDraft.text)}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3 rounded-lg border border-[#E2E8F0] bg-white p-3">
                {assistantStep === 0 && (
                  <>
                    {assistantKind === "campaign" ? (
                      <>
                        <label className="text-sm font-medium text-[#334155]">Nome da campanha/template</label>
                        <input
                          type="text"
                          value={assistantDraft.shortCut}
                          onChange={(e) => setAssistantDraft((prev) => ({ ...prev, shortCut: e.target.value }))}
                          placeholder="Ex.: campanha_black_friday"
                          className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B]"
                        />
                      </>
                    ) : (
                      <>
                        <label className="text-sm font-medium text-[#334155]">Conexão</label>
                        <select
                          value={assistantDraft.channelId}
                          onChange={(e) => setAssistantDraft((prev) => ({ ...prev, channelId: e.target.value }))}
                          className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                        >
                          <option value="">Selecionar conexão…</option>
                          {channels.map((ch) => (
                            <option key={ch.id} value={ch.id}>
                              {ch.name}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </>
                )}

                {assistantStep === 1 && (
                  <>
                    {assistantKind === "campaign" ? (
                      <>
                        <label className="text-sm font-medium text-[#334155]">Conexão</label>
                        <select
                          value={assistantDraft.channelId}
                          onChange={(e) => setAssistantDraft((prev) => ({ ...prev, channelId: e.target.value, queueIds: [] }))}
                          className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B]"
                        >
                          <option value="">Selecionar conexão…</option>
                          {channels.map((ch) => (
                            <option key={ch.id} value={ch.id}>
                              {ch.name}
                            </option>
                          ))}
                        </select>
                        <label className="mt-2 block text-sm font-medium text-[#334155]">Fila</label>
                        <select
                          value={assistantDraft.queueIds[0] ?? ""}
                          onChange={(e) =>
                            setAssistantDraft((prev) => ({
                              ...prev,
                              queueIds: e.target.value ? [e.target.value] : [],
                            }))
                          }
                          className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B]"
                        >
                          <option value="">Selecionar fila…</option>
                          {channelQueues.map((q) => (
                            <option key={q.id} value={q.id}>
                              {q.name}
                            </option>
                          ))}
                        </select>
                      </>
                    ) : (
                      <>
                        <label className="text-sm font-medium text-[#334155]">Atalho</label>
                        <input
                          type="text"
                          value={assistantDraft.shortCut}
                          onChange={(e) => setAssistantDraft((prev) => ({ ...prev, shortCut: e.target.value }))}
                          placeholder="Ex.: consent_boas_vindas"
                          className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B]"
                        />
                      </>
                    )}
                  </>
                )}

                {assistantKind === "consent" && assistantStep === 2 && (
                  <>
                    <label className="text-sm font-medium text-[#334155]">Mensagem de consentimento</label>
                    <RichTextEditor
                      value={assistantDraft.text}
                      onChange={(next) => setAssistantDraft((prev) => ({ ...prev, text: next }))}
                      placeholder="Ex.: Para autorizar mensagens, responda SIM. Para sair, responda SAIR."
                    />
                    <button
                      type="button"
                      onClick={handleAssistantGenerateText}
                      disabled={assistantSaving}
                      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/60 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                    >
                      {assistantSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      Sugerir com IA
                    </button>
                    {assistantAiError && <p className="text-xs text-amber-700">{assistantAiError}</p>}
                  </>
                )}

                {assistantKind === "consent" && assistantStep === 3 && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[#334155]">Palavras de aceite</label>
                      <input
                        type="text"
                        value={assistantDraft.consentAcceptKeywords}
                        onChange={(e) => setAssistantDraft((prev) => ({ ...prev, consentAcceptKeywords: e.target.value }))}
                        placeholder="SIM,ACEITO,OK"
                        className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[#334155]">Palavras de saída</label>
                      <input
                        type="text"
                        value={assistantDraft.consentOptOutKeywords}
                        onChange={(e) => setAssistantDraft((prev) => ({ ...prev, consentOptOutKeywords: e.target.value }))}
                        placeholder="SAIR,PARAR,STOP"
                        className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B]"
                      />
                    </div>
                  </div>
                )}

                {assistantKind === "campaign" && assistantStep === 2 && (
                  <>
                    <label className="text-sm font-medium text-[#334155]">Tipo de conteúdo da campanha</label>
                    <select
                      value={assistantDraft.campaignContentType}
                      onChange={(e) =>
                        setAssistantDraft((prev) => ({
                          ...prev,
                          campaignContentType: e.target.value as "text" | "image" | "video" | "audio" | "document" | "carousel",
                          campaignMenuType: e.target.value === "carousel" ? "carousel" : "button",
                        }))
                      }
                      className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B]"
                    >
                      <option value="text">Texto</option>
                      <option value="image">Imagem</option>
                      <option value="video">Vídeo</option>
                      <option value="audio">Áudio</option>
                      <option value="document">Documento</option>
                      <option value="carousel">Carrossel de imagens</option>
                    </select>
                  </>
                )}

                {assistantKind === "campaign" && assistantStep === 3 && (
                  <>
                    <label className="text-sm font-medium text-[#334155]">Texto principal</label>
                    <RichTextEditor
                      value={assistantDraft.text}
                      onChange={(next) => setAssistantDraft((prev) => ({ ...prev, text: next }))}
                      placeholder="Ex.: Confira nossas ofertas e escolha uma opção."
                    />
                    <button
                      type="button"
                      onClick={handleAssistantGenerateText}
                      disabled={assistantSaving}
                      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/60 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                    >
                      {assistantSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      Sugerir com IA
                    </button>
                    {assistantAiError && <p className="text-xs text-amber-700">{assistantAiError}</p>}
                  </>
                )}

                {assistantKind === "campaign" && assistantStep === 4 && (
                  <>
                    {assistantDraft.campaignContentType === "carousel" ? (
                      <>
                        <label className="text-sm font-medium text-[#334155]">Itens do carrossel (choices)</label>
                        <textarea
                          value={assistantDraft.campaignChoicesText}
                          onChange={(e) => setAssistantDraft((prev) => ({ ...prev, campaignChoicesText: e.target.value }))}
                          rows={4}
                          placeholder="[Card 1]\n{https://.../card1.jpg}\nSaiba mais|https://..."
                          className="w-full resize-none rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B]"
                        />
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs text-[#334155] hover:bg-[#F8FAFC]">
                          <Upload className="h-3.5 w-3.5" />
                          Subir imagens do carrossel
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="sr-only"
                            onChange={(e) => handleAssistantCarouselUpload(e.target.files)}
                          />
                        </label>
                      </>
                    ) : assistantDraft.campaignContentType === "text" ? (
                      <p className="text-xs text-[#64748B]">
                        Conteúdo de texto não exige upload. Você pode seguir para revisão e teste.
                      </p>
                    ) : (
                      <>
                        <label className="text-sm font-medium text-[#334155]">Mídia do template</label>
                        <textarea
                          value={assistantDraft.campaignFile}
                          onChange={(e) => setAssistantDraft((prev) => ({ ...prev, campaignFile: e.target.value }))}
                          rows={3}
                          placeholder="Cole URL/base64 ou use o upload"
                          className="w-full resize-none rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B]"
                        />
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs text-[#334155] hover:bg-[#F8FAFC]">
                          <Upload className="h-3.5 w-3.5" />
                          Subir arquivo
                          <input
                            type="file"
                            accept={assistantDraft.campaignContentType === "image" ? "image/*" : assistantDraft.campaignContentType === "video" ? "video/*" : assistantDraft.campaignContentType === "audio" ? "audio/*" : "*"}
                            className="sr-only"
                            onChange={(e) => handleAssistantMediaUpload(e.target.files?.[0] ?? null)}
                          />
                        </label>
                        {assistantDraft.campaignContentType === "document" && (
                          <input
                            type="text"
                            value={assistantDraft.campaignDocName}
                            onChange={(e) => setAssistantDraft((prev) => ({ ...prev, campaignDocName: e.target.value }))}
                            placeholder="Nome do documento (ex.: catalogo.pdf)"
                            className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B]"
                          />
                        )}
                        {assistantDraft.campaignFile && assistantDraft.campaignContentType === "image" && (
                          <img src={assistantDraft.campaignFile} alt="preview" className="max-h-36 rounded-lg border border-[#E2E8F0] object-cover" />
                        )}
                        {assistantDraft.campaignFile && assistantDraft.campaignContentType === "video" && (
                          <video src={assistantDraft.campaignFile} controls className="max-h-36 w-full rounded-lg border border-[#E2E8F0]" />
                        )}
                        {assistantDraft.campaignFile && assistantDraft.campaignContentType === "audio" && (
                          <audio src={assistantDraft.campaignFile} controls className="w-full" />
                        )}
                      </>
                    )}
                  </>
                )}

                {assistantStep === maxStep && (
                  <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                    <label className="mb-1 block text-xs font-medium text-[#334155]">Número de teste</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={assistantTestNumber}
                        onChange={(e) => setAssistantTestNumber(e.target.value)}
                        placeholder="Ex.: 5511999999999"
                        className="flex-1 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B]"
                      />
                      <button
                        type="button"
                        onClick={handleAssistantTest}
                        disabled={assistantTesting}
                        className="inline-flex items-center gap-2 rounded-lg border border-clicvend-orange px-3 py-2 text-sm font-medium text-clicvend-orange hover:bg-clicvend-orange/10 disabled:opacity-60"
                      >
                        {assistantTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Testar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-[#E2E8F0] pt-4">
                <button
                  type="button"
                  onClick={() => setAssistantStep((prev) => Math.max(0, prev - 1))}
                  disabled={assistantStep === 0}
                  className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50"
                >
                  Voltar
                </button>
                <div className="flex items-center gap-2">
                  {assistantStep < maxStep ? (
                    <button
                      type="button"
                      onClick={() => setAssistantStep((prev) => Math.min(maxStep, prev + 1))}
                      disabled={!canNext}
                      className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50"
                    >
                      Próxima etapa
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleAssistantSave}
                      disabled={assistantSaving}
                      className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-3 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
                    >
                      {assistantSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Salvar template
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </SideOver>

      <ConfirmDialog
        open={!!deleteConfirmRow}
        onClose={() => setDeleteConfirmRow(null)}
        title="Excluir resposta rápida"
        message={
          deleteConfirmRow
            ? `Excluir a resposta rápida "${deleteConfirmRow.shortCut}"? Esta ação não pode ser desfeita.`
            : ""
        }
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={() => deleteConfirmRow && doDeleteOne(deleteConfirmRow)}
        onCancel={() => setDeleteConfirmRow(null)}
      />

      <ConfirmDialog
        open={bulkDeleteConfirm}
        onClose={() => setBulkDeleteConfirm(false)}
        title="Excluir respostas rápidas"
        message={`Excluir ${selectedIds.size} resposta(s) rápida(s) selecionada(s)? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={doBulkDelete}
        onCancel={() => setBulkDeleteConfirm(false)}
      />
    </div>
  );
}
