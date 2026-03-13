"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, Tag, FileText, Search, ChevronDown } from "lucide-react";

const MAX_ATENDIMENTO_TAGS = 4;

type ConvMin = {
  id: string;
  channel_id: string | null;
  queue_id: string | null;
  customer_phone?: string | null;
  external_id?: string | null;
  is_group?: boolean;
  wa_chat_jid?: string | null;
};

type ContactTag = { id: string; name: string; color_hex: string | null; category_name: string };
type ConversationTag = { id: string; name: string; color_hex: string | null };
type FormField = { id: string; label: string; type: string; required: boolean; options?: string[] };
type FormMin = { id: string; name: string; description: string | null; fields: FormField[] };

type Props = {
  conv: ConvMin | null;
  apiHeaders: Record<string, string> | undefined;
  /** "tags" = só tags do contato e atendimento; "forms" = só formulários; "all" = tudo */
  showSection?: "tags" | "forms" | "all";
};

function numberFromConv(conv: ConvMin): string {
  if (conv.is_group && conv.wa_chat_jid) return conv.wa_chat_jid;
  const raw = (conv.customer_phone || conv.external_id || "").trim();
  const digits = raw.replace(/\D/g, "").trim();
  return digits || (conv.external_id as string) || (conv.customer_phone as string) || "";
}

export function ChatContactInfoTagsAndForms({ conv, apiHeaders, showSection = "all" }: Props) {
  const [contactTagsLoading, setContactTagsLoading] = useState(false);
  const [contactTagsError, setContactTagsError] = useState<string | null>(null);
  const [contactTags, setContactTags] = useState<ContactTag[]>([]);
  const [contactSelectedIds, setContactSelectedIds] = useState<Set<string>>(new Set());

  const [convTagsLoading, setConvTagsLoading] = useState(false);
  const [convTagsError, setConvTagsError] = useState<string | null>(null);
  const [convTags, setConvTags] = useState<ConversationTag[]>([]);
  const [convAppliedIds, setConvAppliedIds] = useState<Set<string>>(new Set());
  const [convSaving, setConvSaving] = useState(false);
  const [convDropdownOpen, setConvDropdownOpen] = useState(false);
  const [convSearch, setConvSearch] = useState("");
  const convDropdownRef = useRef<HTMLDivElement>(null);

  const [formsLoading, setFormsLoading] = useState(false);
  const [formsError, setFormsError] = useState<string | null>(null);
  const [forms, setForms] = useState<FormMin[]>([]);
  const [formAnswers, setFormAnswers] = useState<Record<string, { answers: Record<string, unknown>; answered_at: string }>>({});
  const [formDropdownOpen, setFormDropdownOpen] = useState(false);
  const [formSearch, setFormSearch] = useState("");
  const [formSelectedToFill, setFormSelectedToFill] = useState<FormMin | null>(null);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [formSaving, setFormSaving] = useState(false);
  const formDropdownRef = useRef<HTMLDivElement>(null);

  const number = conv ? numberFromConv(conv) : "";
  const channelId = conv?.channel_id ?? null;

  const fetchContactTags = useCallback(async () => {
    if (!apiHeaders || !channelId || !number) return;
    setContactTagsLoading(true);
    setContactTagsError(null);
    try {
      const q = new URLSearchParams({ channel_id: channelId, number });
      const r = await fetch(`/api/contact-tags?${q}`, { credentials: "include", headers: apiHeaders });
      const data = await r.json();
      if (r.ok && data?.tags) {
        setContactTags(
          (data.tags as { id: string; name: string; color_hex: string | null; category_name?: string }[]).map(
            (t) => ({ ...t, category_name: t.category_name ?? "" })
          )
        );
        setContactSelectedIds(new Set((data.selected_tag_ids as string[]) ?? []));
      } else setContactTagsError(data?.error ?? "Falha ao carregar tags do contato");
    } catch {
      setContactTagsError("Erro de rede");
    } finally {
      setContactTagsLoading(false);
    }
  }, [apiHeaders, channelId, number]);

  const fetchConvTags = useCallback(async () => {
    if (!apiHeaders || !conv?.id) return;
    setConvTagsLoading(true);
    setConvTagsError(null);
    try {
      const r = await fetch(`/api/conversations/${conv.id}/tags`, { credentials: "include", headers: apiHeaders });
      const data = await r.json();
      if (r.ok) {
        setConvTags((data.tags as ConversationTag[]) ?? []);
        setConvAppliedIds(new Set((data.applied_tag_ids as string[]) ?? []));
      } else setConvTagsError(data?.error ?? "Falha ao carregar tags do atendimento");
    } catch {
      setConvTagsError("Erro de rede");
    } finally {
      setConvTagsLoading(false);
    }
  }, [apiHeaders, conv?.id]);

  const fetchFormAnswers = useCallback(async () => {
    if (!apiHeaders || !conv?.id) return;
    setFormsLoading(true);
    setFormsError(null);
    try {
      const r = await fetch(`/api/conversations/${conv.id}/form-answers`, {
        credentials: "include",
        headers: apiHeaders,
      });
      const data = await r.json();
      if (r.ok) {
        setForms((data.forms as FormMin[]) ?? []);
        setFormAnswers((data.answers as Record<string, { answers: Record<string, unknown>; answered_at: string }>) ?? {});
      } else setFormsError(data?.error ?? "Falha ao carregar formulários");
    } catch {
      setFormsError("Erro de rede");
    } finally {
      setFormsLoading(false);
    }
  }, [apiHeaders, conv?.id]);

  useEffect(() => {
    if (!conv) return;
    if (showSection === "tags" || showSection === "all") {
      fetchContactTags();
      fetchConvTags();
    }
    if (showSection === "forms" || showSection === "all") {
      fetchFormAnswers();
    }
  }, [conv?.id, channelId, number, showSection, fetchContactTags, fetchConvTags, fetchFormAnswers]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (convDropdownRef.current && !convDropdownRef.current.contains(e.target as Node)) setConvDropdownOpen(false);
      if (formDropdownRef.current && !formDropdownRef.current.contains(e.target as Node)) setFormDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const saveConvTags = useCallback(
    async (tagIds: string[]) => {
      if (!apiHeaders || !conv?.id) return;
      setConvSaving(true);
      try {
        const r = await fetch(`/api/conversations/${conv.id}/tags`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...apiHeaders },
          body: JSON.stringify({ tag_ids: tagIds }),
        });
        if (r.ok) setConvAppliedIds(new Set(tagIds));
      } finally {
        setConvSaving(false);
      }
    },
    [apiHeaders, conv?.id]
  );

  const toggleConvTag = (tagId: string) => {
    const next = new Set(convAppliedIds);
    if (next.has(tagId)) next.delete(tagId);
    else if (next.size < MAX_ATENDIMENTO_TAGS) next.add(tagId);
    saveConvTags(Array.from(next));
  };

  const filteredConvTags = convSearch.trim()
    ? convTags.filter((t) => t.name.toLowerCase().includes(convSearch.toLowerCase()))
    : convTags;
  const filteredForms = formSearch.trim()
    ? forms.filter((f) => f.name.toLowerCase().includes(formSearch.toLowerCase()))
    : forms;

  const openFormToFill = (form: FormMin) => {
    setFormSelectedToFill(form);
    setFormValues((formAnswers[form.id]?.answers as Record<string, unknown>) ?? {});
    setFormDropdownOpen(false);
    setFormSearch("");
  };

  const saveForm = async () => {
    if (!formSelectedToFill || !apiHeaders || !conv?.id) return;
    setFormSaving(true);
    try {
      const r = await fetch(`/api/conversations/${conv.id}/form-answers`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ tag_form_id: formSelectedToFill.id, answers: formValues }),
      });
      if (r.ok) {
        setFormSelectedToFill(null);
        setFormValues({});
        fetchFormAnswers();
      }
    } finally {
      setFormSaving(false);
    }
  };

  if (!conv?.id) return null;

  /*
   * Ordem no atendimento: (1) Infos do contato (nome, telefone - no cabecalho do SideOver),
   * (2) Tags do contato (somente leitura), (3) Tags do atendimento (multiselect ate 4),
   * (4) Formularios de tabulacao (botao Tabular + dropdown + preenchimento inline),
   * (5) Midias e documentos (na pagina, abaixo deste componente).
   * Ao salvar formulario: POST /api/conversations/[id]/form-answers grava na conversa.
   * Ao marcar/desmarcar tags: POST /api/conversations/[id]/tags atualiza tags da conversa na fila.
   */
  const showTags = showSection === "tags" || showSection === "all";
  const showForms = showSection === "forms" || showSection === "all";

  const content = (
    <div className="space-y-4">
      {showTags && (
      <>
      {/* 1. Tags do contato - somente leitura */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
          <Tag className="h-3.5 w-3.5" />
          Tags do contato
        </h3>
        {contactTagsLoading ? (
          <div className="flex items-center gap-2 text-xs text-[#64748B]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Carregando...
          </div>
        ) : contactTagsError ? (
          <p className="text-xs text-amber-600">{contactTagsError}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {contactTags.filter((t) => contactSelectedIds.has(t.id)).length === 0 ? (
              <span className="text-xs text-[#94A3B8]">Nenhuma tag</span>
            ) : (
              contactTags
                .filter((t) => contactSelectedIds.has(t.id))
                .map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium text-white"
                    style={{ backgroundColor: t.color_hex ?? "#64748B" }}
                  >
                    {t.name}
                  </span>
                ))
            )}
          </div>
        )}
      </div>

      {/* Tags do atendimento - dropdown multiselect com busca, max 4 */}
      <div className="space-y-2" ref={convDropdownRef}>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
          Tags do atendimento
        </h3>
        {convTagsLoading ? (
          <div className="flex items-center gap-2 text-xs text-[#64748B]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Carregando...
          </div>
        ) : convTagsError ? (
          <p className="text-xs text-amber-600">{convTagsError}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5 mb-1">
              {convTags
                .filter((t) => convAppliedIds.has(t.id))
                .map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center rounded-full border border-[#E2E8F0] bg-[#F8FAFC] pl-2 pr-2 py-0.5 text-xs"
                  >
                    <span
                      className="h-2 w-2 rounded-full shrink-0 mr-1.5"
                      style={{ backgroundColor: t.color_hex ?? "#94A3B8" }}
                    />
                    {t.name}
                  </span>
                ))}
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setConvDropdownOpen((o) => !o)}
                className="w-full flex items-center justify-between gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#1E293B] hover:bg-[#F8FAFC]"
              >
                <span className="text-[#64748B]">
                  {convAppliedIds.size === 0
                    ? "Adicionar tags (até 4)"
                    : `Adicionar tags (${convAppliedIds.size}/${MAX_ATENDIMENTO_TAGS})`}
                </span>
                <ChevronDown className={`h-4 w-4 text-[#94A3B8] transition-transform ${convDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {convDropdownOpen && (
                <div className="absolute z-20 mt-1 w-full rounded-lg border border-[#E2E8F0] bg-white shadow-lg overflow-hidden">
                  <div className="p-2 border-b border-[#E2E8F0]">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                      <input
                        type="text"
                        value={convSearch}
                        onChange={(e) => setConvSearch(e.target.value)}
                        placeholder="Buscar tags..."
                        className="w-full rounded-md border border-[#E2E8F0] py-2 pl-9 pr-3 text-sm placeholder:text-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                      />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto p-1">
                    {filteredConvTags.length === 0 ? (
                      <p className="py-2 px-2 text-xs text-[#94A3B8]">Nenhuma tag encontrada</p>
                    ) : (
                      filteredConvTags.map((t) => {
                        const checked = convAppliedIds.has(t.id);
                        const disabled = !checked && convAppliedIds.size >= MAX_ATENDIMENTO_TAGS;
                        return (
                          <label
                            key={t.id}
                            className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer ${disabled ? "opacity-60 cursor-not-allowed" : "hover:bg-[#F8FAFC]"}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={() => toggleConvTag(t.id)}
                              className="rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
                            />
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: t.color_hex ?? "#94A3B8" }}
                            />
                            <span className="text-[#1E293B]">{t.name}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      </>
      )}

      {showForms && (
      <div className="space-y-2" ref={formDropdownRef}>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          Formulários de tabulação
        </h3>
        {formsLoading ? (
          <div className="flex items-center gap-2 text-xs text-[#64748B]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Carregando...
          </div>
        ) : formsError ? (
          <p className="text-xs text-amber-600">{formsError}</p>
        ) : formSelectedToFill ? (
          <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-medium text-[#1E293B]">{formSelectedToFill.name}</p>
              <button
                type="button"
                onClick={() => { setFormSelectedToFill(null); setFormValues({}); }}
                className="text-xs text-[#64748B] hover:text-[#1E293B]"
              >
                Fechar
              </button>
            </div>
            {formSelectedToFill.fields.map((field) => (
              <div key={field.id}>
                <label className="block text-sm font-medium text-[#334155] mb-1">
                  {field.label}
                  {field.required ? <span className="text-red-500"> *</span> : null}
                </label>
                {field.type === "text" && (
                  <input
                    type="text"
                    value={(formValues[field.id] as string) ?? ""}
                    onChange={(e) => setFormValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                    className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
                  />
                )}
                {field.type === "number" && (
                  <input
                    type="number"
                    value={(formValues[field.id] as number | string) ?? ""}
                    onChange={(e) =>
                      setFormValues((prev) => ({
                        ...prev,
                        [field.id]: e.target.value === "" ? "" : Number(e.target.value),
                      }))
                    }
                    className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
                  />
                )}
                {field.type === "select" && (
                  <select
                    value={(formValues[field.id] as string) ?? ""}
                    onChange={(e) => setFormValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                    className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
                  >
                    <option value="">Selecione</option>
                    {(field.options ?? []).map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                )}
                {field.type === "multiselect" && (
                  <div className="space-y-1.5">
                    {(field.options ?? []).map((opt) => {
                      const arr = (formValues[field.id] as string[]) ?? [];
                      return (
                        <label key={opt} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={arr.includes(opt)}
                            onChange={() => {
                              setFormValues((prev) => {
                                const current = (prev[field.id] as string[]) ?? [];
                                const next = arr.includes(opt) ? current.filter((x) => x !== opt) : [...current, opt];
                                return { ...prev, [field.id]: next };
                              });
                            }}
                            className="rounded border-[#E2E8F0] text-clicvend-orange"
                          />
                          {opt}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            <div className="flex gap-2 pt-2 border-t border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => { setFormSelectedToFill(null); setFormValues({}); }}
                className="flex-1 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-[#64748B]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveForm}
                disabled={formSaving}
                className="flex-1 rounded-lg bg-clicvend-orange px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {formSaving ? <Loader2 className="h-4 w-4 animate-spin inline" /> : null} Salvar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="relative">
              <button
                type="button"
                onClick={() => setFormDropdownOpen((o) => !o)}
                className="w-full flex items-center justify-between gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#1E293B] hover:bg-[#F8FAFC]"
              >
                <span className="text-[#64748B]">Selecionar formulário para preencher</span>
                <ChevronDown className={`h-4 w-4 text-[#94A3B8] transition-transform ${formDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {formDropdownOpen && (
                <div className="absolute z-20 mt-1 w-full rounded-lg border border-[#E2E8F0] bg-white shadow-lg overflow-hidden">
                  <div className="p-2 border-b border-[#E2E8F0]">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                      <input
                        type="text"
                        value={formSearch}
                        onChange={(e) => setFormSearch(e.target.value)}
                        placeholder="Buscar formularios..."
                        className="w-full rounded-md border border-[#E2E8F0] py-2 pl-9 pr-3 text-sm placeholder:text-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                      />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto p-1">
                    {filteredForms.length === 0 ? (
                      <p className="py-2 px-2 text-xs text-[#94A3B8]">Nenhum formulário encontrado</p>
                    ) : (
                      filteredForms.map((form) => {
                        const answered = formAnswers[form.id];
                        return (
                          <button
                            key={form.id}
                            type="button"
                            onClick={() => openFormToFill(form)}
                            className="w-full flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm text-left hover:bg-[#F8FAFC]"
                          >
                            <span className="font-medium text-[#1E293B] truncate">{form.name}</span>
                            <span className="text-xs text-[#64748B] shrink-0">
                              {answered ? "Preenchido" : "Não preenchido"}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
            {forms.length > 0 && (
              <p className="text-xs text-[#94A3B8]">
                {forms.filter((f) => formAnswers[f.id]).length} de {forms.length} preenchido(s).
              </p>
            )}
          </>
        )}
      </div>
      )}
    </div>
  );

  return content;
}
