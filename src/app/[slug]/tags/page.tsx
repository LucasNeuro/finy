/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Plus,
  Tag,
  Filter,
  FileText,
  Loader2,
  Edit3,
  Trash2,
  ChevronRight,
} from "lucide-react";
import { SideOver } from "@/components/SideOver";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type Queue = { id: string; name: string };

type TagCategoryType = "contact" | "conversation";

type TagRow = {
  id: string;
  name: string;
  category_type: TagCategoryType;
  category_name: string;
  color_hex: string | null;
  queues: Queue[];
  active: boolean;
};

type FormRow = {
  id: string;
  name: string;
  description: string | null;
  queues: Queue[];
  active: boolean;
  fields?: FormBuilderField[];
};

type TagFormState = {
  id: string | null;
  name: string;
  categoryType: TagCategoryType;
  categoryName: string;
  colorHex: string;
  queueIds: string[];
  active: boolean;
};

type FormBuilderField = {
  id: string;
  label: string;
  type: "select" | "multiselect" | "text" | "number";
  required: boolean;
  options: string[];
};

type FormBuilderState = {
  id: string | null;
  name: string;
  description: string;
  queueIds: string[];
  active: boolean;
  fields: FormBuilderField[];
};

const EMPTY_TAG_FORM: TagFormState = {
  id: null,
  name: "",
  categoryType: "contact",
  categoryName: "",
  colorHex: "#0EA5E9",
  queueIds: [],
  active: true,
};

const EMPTY_FORM_BUILDER: FormBuilderState = {
  id: null,
  name: "",
  description: "",
  queueIds: [],
  active: true,
  fields: [],
};

export default function TagsPage() {
  const pathname = usePathname();
  const slug = pathname?.split("/").filter(Boolean)[0] ?? "";

  const apiHeaders = useMemo(
    () => (slug ? { "X-Company-Slug": slug } : undefined),
    [slug]
  );

  const [activeTab, setActiveTab] = useState<"tags" | "forms">("tags");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [queues, setQueues] = useState<Queue[]>([]);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [forms, setForms] = useState<FormRow[]>([]);

  const [search, setSearch] = useState("");
  const [tagSideOverOpen, setTagSideOverOpen] = useState(false);
  const [formSideOverOpen, setFormSideOverOpen] = useState(false);
  const [tagForm, setTagForm] = useState<TagFormState>(EMPTY_TAG_FORM);
  const [formBuilder, setFormBuilder] = useState<FormBuilderState>(EMPTY_FORM_BUILDER);
  const [savingTag, setSavingTag] = useState(false);
  const [savingForm, setSavingForm] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<TagRow | null>(null);
  const [formToDelete, setFormToDelete] = useState<FormRow | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [selectedFormIds, setSelectedFormIds] = useState<Set<string>>(new Set());

  const fetchQueues = useCallback(async () => {
    if (!apiHeaders) return;
    try {
      const res = await fetch("/api/queues", {
        credentials: "include",
        headers: apiHeaders,
      });
      const data = await res.json().catch(() => []);
      if (!res.ok) return;
      const list = Array.isArray(data) ? data : [];
      const rows: Queue[] = list.map((q: { id: string; name: string }) => ({
        id: q.id,
        name: q.name,
      }));
      setQueues(rows);
    } catch {
      setQueues([]);
    }
  }, [apiHeaders]);

  const fetchTagsAndForms = useCallback(async () => {
    if (!apiHeaders) return;
    setLoading(true);
    setError(null);
    try {
      const [tagsRes, formsRes] = await Promise.all([
        fetch("/api/tags", { credentials: "include", headers: apiHeaders }),
        fetch("/api/tag-forms", { credentials: "include", headers: apiHeaders }),
      ]);
      const tagsData = await tagsRes.json().catch(() => ({}));
      const formsData = await formsRes.json().catch(() => ({}));
      if (!tagsRes.ok) {
        setError(tagsData?.error ?? "Falha ao carregar tags.");
      } else {
        setTags(Array.isArray(tagsData?.data) ? (tagsData.data as TagRow[]) : []);
      }
      // Para formulários, se a rota ainda não existir ou falhar,
      // apenas consideramos como lista vazia (não mostramos erro vermelho).
      if (formsRes.ok) {
        setForms(Array.isArray(formsData?.data) ? (formsData.data as FormRow[]) : []);
      } else {
        setForms([]);
      }
    } catch {
      setError("Erro de rede ao carregar tags e formulários.");
      setTags([]);
      setForms([]);
    } finally {
      setLoading(false);
    }
  }, [apiHeaders]);

  useEffect(() => {
    fetchQueues();
    fetchTagsAndForms();
  }, [fetchQueues, fetchTagsAndForms]);

  const filteredTags = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return tags;
    return tags.filter(
      (t) =>
        t.name.toLowerCase().includes(term) ||
        t.category_name.toLowerCase().includes(term)
    );
  }, [tags, search]);

  const filteredForms = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return forms;
    return forms.filter(
      (f) =>
        f.name.toLowerCase().includes(term) ||
        (f.description ?? "").toLowerCase().includes(term)
    );
  }, [forms, search]);

  const openNewTag = () => {
    setTagForm({
      ...EMPTY_TAG_FORM,
      categoryType: "contact",
      categoryName: "Perfil do contato",
    });
    setTagSideOverOpen(true);
  };

  const openEditTag = (row: TagRow) => {
    setTagForm({
      id: row.id,
      name: row.name,
      categoryType: row.category_type,
      categoryName: row.category_name,
      colorHex: row.color_hex || "#0EA5E9",
      queueIds: row.queues.map((q) => q.id),
      active: row.active,
    });
    setTagSideOverOpen(true);
  };

  const openNewForm = () => {
    setFormBuilder({
      ...EMPTY_FORM_BUILDER,
      fields: [],
    });
    setFormSideOverOpen(true);
  };

  const toggleSelectForm = (id: string) => {
    setSelectedFormIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectTag = (id: string) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSaveTag = async () => {
    if (!apiHeaders) return;
    if (!tagForm.name.trim()) {
      setError("Preencha o nome da tag.");
      return;
    }
    if (!tagForm.categoryName.trim()) {
      setError("Preencha o nome da categoria.");
      return;
    }
    setSavingTag(true);
    setError(null);
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({
          ...(tagForm.id ? { id: tagForm.id } : {}),
          name: tagForm.name.trim(),
          category_type: tagForm.categoryType,
          category_name: tagForm.categoryName.trim(),
          color_hex: tagForm.colorHex || null,
          queue_ids: tagForm.queueIds,
          active: tagForm.active,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Falha ao salvar tag.");
        return;
      }
      setTagSideOverOpen(false);
      setTagForm(EMPTY_TAG_FORM);
      fetchTagsAndForms();
    } catch {
      setError("Erro de rede ao salvar tag.");
    } finally {
      setSavingTag(false);
    }
  };

  const handleSaveForm = async () => {
    if (!apiHeaders) return;
    if (!formBuilder.name.trim()) {
      setError("Preencha o nome do formulário.");
      return;
    }
    setSavingForm(true);
    setError(null);
    try {
      const res = await fetch("/api/tag-forms", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({
          ...(formBuilder.id ? { id: formBuilder.id } : {}),
          name: formBuilder.name.trim(),
          description: formBuilder.description.trim() || null,
          queue_ids: formBuilder.queueIds,
          active: formBuilder.active,
          fields: formBuilder.fields,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Falha ao salvar formulário.");
        return;
      }
      setFormSideOverOpen(false);
      setFormBuilder(EMPTY_FORM_BUILDER);
      fetchTagsAndForms();
    } catch {
      setError("Erro de rede ao salvar formulário.");
    } finally {
      setSavingForm(false);
    }
  };

  const handleDeleteTag = async () => {
    if (!apiHeaders || !tagToDelete) return;
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ id: tagToDelete.id, delete: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Falha ao excluir tag.");
      } else {
        fetchTagsAndForms();
      }
    } catch {
      setError("Erro de rede ao excluir tag.");
    } finally {
      setTagToDelete(null);
    }
  };

  const handleDeleteForm = async () => {
    if (!apiHeaders || !formToDelete) return;
    try {
      const res = await fetch("/api/tag-forms", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ id: formToDelete.id, delete: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Falha ao excluir formulário.");
      } else {
        fetchTagsAndForms();
      }
    } catch {
      setError("Erro de rede ao excluir formulário.");
    } finally {
      setFormToDelete(null);
    }
  };

  const handleBulkUpdateForms = async (active: boolean | null) => {
    if (!apiHeaders || selectedFormIds.size === 0) return;
    setError(null);
    try {
      await Promise.all(
        Array.from(selectedFormIds).map((id) =>
          fetch("/api/tag-forms", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json", ...apiHeaders },
            body: JSON.stringify(
              active === null ? { id, delete: true } : { id, active }
            ),
          })
        )
      );
      setSelectedFormIds(new Set());
      fetchTagsAndForms();
    } catch {
      setError("Erro ao aplicar ação em massa nos formulários.");
    }
  };

  const handleBulkUpdateTags = async (active: boolean | null) => {
    if (!apiHeaders || selectedTagIds.size === 0) return;
    setError(null);
    try {
      await Promise.all(
        Array.from(selectedTagIds).map((id) =>
          fetch("/api/tags", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json", ...apiHeaders },
            body: JSON.stringify(
              active === null ? { id, delete: true } : { id, active }
            ),
          })
        )
      );
      setSelectedTagIds(new Set());
      fetchTagsAndForms();
    } catch {
      setError("Erro ao aplicar ação em massa nas tags.");
    }
  };

  return (
    <div className="flex flex-col gap-4 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E293B]">Tags e formulários</h1>
          <p className="mt-0.5 text-sm text-[#64748B]">
            Configure tags para contatos e atendimentos, e formulários de tabulação usados pelos agentes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                activeTab === "tags"
                  ? "Buscar tags ou categorias…"
                  : "Buscar formulários…"
              }
              className="rounded-lg border border-[#E2E8F0] bg-white pl-9 pr-4 py-2 text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange min-w-[220px]"
            />
          </div>
          {activeTab === "tags" ? (
            <button
              type="button"
              onClick={openNewTag}
              className="inline-flex items-center gap-1.5 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark"
            >
              <Plus className="h-4 w-4" />
              Nova tag
            </button>
          ) : (
            <button
              type="button"
              onClick={openNewForm}
              className="inline-flex items-center gap-1.5 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark"
            >
              <Plus className="h-4 w-4" />
              Novo formulário
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-b border-[#E2E8F0]">
        <button
          type="button"
          onClick={() => setActiveTab("tags")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "tags"
              ? "border-clicvend-orange text-clicvend-orange"
              : "border-transparent text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          <Tag className="h-4 w-4" />
          Tags
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("forms")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "forms"
              ? "border-clicvend-orange text-clicvend-orange"
              : "border-transparent text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          <FileText className="h-4 w-4" />
          Formulários de tabulação
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-clicvend-orange" />
        </div>
      ) : activeTab === "tags" ? (
        <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden flex flex-col">
          {filteredTags.length === 0 ? (
            <div className="p-8 text-center text-[#64748B]">
              <Tag className="mx-auto h-10 w-10 text-[#94A3B8]" />
              <p className="mt-2">Nenhuma tag cadastrada.</p>
              <p className="mt-1 text-sm">
                Crie tags para classificar contatos e atendimentos por tipo, assunto ou motivo.
              </p>
            </div>
          ) : (
            <>
              {selectedTagIds.size > 0 && (
                <div className="flex items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50/70 px-4 py-2 text-xs text-emerald-800">
                  <span>
                    {selectedTagIds.size} tag
                    {selectedTagIds.size > 1 ? "s" : ""} selecionada
                    {selectedTagIds.size > 1 ? "s" : ""}.
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleBulkUpdateTags(true)}
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 font-medium text-white hover:bg-emerald-700"
                    >
                      Ativar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkUpdateTags(false)}
                      className="inline-flex items-center gap-1 rounded-md bg-slate-700 px-2.5 py-1 font-medium text-white hover:bg-slate-800"
                    >
                      Desativar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkUpdateTags(null)}
                      className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 font-medium text-white hover:bg-red-700"
                    >
                      Excluir
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedTagIds(new Set())}
                      className="text-[11px] font-medium text-emerald-900/80 underline-offset-2 hover:underline"
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
                      <th className="w-10 px-3 py-3 text-left">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-[#CBD5E1] text-clicvend-orange focus:ring-clicvend-orange"
                          checked={
                            filteredTags.length > 0 &&
                            selectedTagIds.size === filteredTags.length
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTagIds(
                                new Set(filteredTags.map((t) => t.id))
                              );
                            } else {
                              setSelectedTagIds(new Set());
                            }
                          }}
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                        Tag
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                        Categoria
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                        Tipo
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                        Filas
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                        Status
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTags.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-[#E2E8F0] transition-colors hover:bg-[#F8FAFC]"
                      >
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-[#CBD5E1] text-clicvend-orange focus:ring-clicvend-orange"
                            checked={selectedTagIds.has(row.id)}
                            onChange={() => toggleSelectTag(row.id)}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full"
                              style={{ backgroundColor: row.color_hex ?? "#0EA5E9" }}
                            />
                            <span className="font-semibold text-[#1E293B]">
                              {row.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-[#64748B]">
                          {row.category_name}
                        </td>
                        <td className="px-4 py-3 text-sm text-[#64748B]">
                          {row.category_type === "contact"
                            ? "Contato"
                            : "Atendimento"}
                        </td>
                        <td className="px-4 py-3 text-sm text-[#64748B]">
                          {row.queues.length === 0
                            ? "Todas as filas"
                            : row.queues.map((q) => q.name).join(", ")}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              row.active
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {row.active ? "Ativa" : "Inativa"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openEditTag(row)}
                              className="rounded-lg p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B]"
                              title="Editar tag"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setTagToDelete(row)}
                              className="rounded-lg p-2 text-[#64748B] hover:bg-red-50 hover:text-red-600"
                              title="Excluir tag"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden flex flex-col">
          {filteredForms.length === 0 ? (
            <div className="p-8 text-center text-[#64748B]">
              <FileText className="mx-auto h-10 w-10 text-[#94A3B8]" />
              <p className="mt-2">Nenhum formulário de tabulação criado.</p>
              <p className="mt-1 text-sm">
                Crie formulários para padronizar a tabulação dos atendimentos por fila.
              </p>
            </div>
          ) : (
            <>
              {selectedFormIds.size > 0 && (
                <div className="flex items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50/70 px-4 py-2 text-xs text-emerald-800">
                  <span>
                    {selectedFormIds.size} formulário
                    {selectedFormIds.size > 1 ? "s" : ""} selecionado
                    {selectedFormIds.size > 1 ? "s" : ""}.
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleBulkUpdateForms(true)}
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 font-medium text-white hover:bg-emerald-700"
                    >
                      Ativar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkUpdateForms(false)}
                      className="inline-flex items-center gap-1 rounded-md bg-slate-700 px-2.5 py-1 font-medium text-white hover:bg-slate-800"
                    >
                      Desativar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkUpdateForms(null)}
                      className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 font-medium text-white hover:bg-red-700"
                    >
                      Excluir
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedFormIds(new Set())}
                      className="text-[11px] font-medium text-emerald-900/80 underline-offset-2 hover:underline"
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
                      <th className="w-10 px-3 py-3 text-left">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-[#CBD5E1] text-clicvend-orange focus:ring-clicvend-orange"
                          checked={
                            filteredForms.length > 0 &&
                            selectedFormIds.size === filteredForms.length
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedFormIds(
                                new Set(filteredForms.map((f) => f.id))
                              );
                            } else {
                              setSelectedFormIds(new Set());
                            }
                          }}
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                        Formulário
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                        Filas
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                        Status
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredForms.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-[#E2E8F0] transition-colors hover:bg-[#F8FAFC]"
                      >
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-[#CBD5E1] text-clicvend-orange focus:ring-clicvend-orange"
                            checked={selectedFormIds.has(row.id)}
                            onChange={() => toggleSelectForm(row.id)}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E0F2FE] text-[#0369A1]">
                              <FileText className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-[#1E293B]">
                                {row.name}
                              </p>
                              {row.description && (
                                <p className="mt-0.5 line-clamp-2 text-xs text-[#64748B]">
                                  {row.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-[#64748B]">
                          {row.queues.length === 0
                            ? "Todas as filas"
                            : row.queues.map((q) => q.name).join(", ")}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              row.active
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {row.active ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setFormBuilder({
                                  id: row.id,
                                  name: row.name,
                                  description: row.description ?? "",
                                  queueIds: row.queues.map((q) => q.id),
                                  active: row.active,
                                  fields: row.fields ?? [],
                                });
                                setFormSideOverOpen(true);
                              }}
                              className="rounded-lg p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B]"
                              title="Editar formulário"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setFormToDelete(row)}
                              className="rounded-lg p-2 text-[#64748B] hover:bg-red-50 hover:text-red-600"
                              title="Excluir formulário"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      <SideOver
        open={tagSideOverOpen}
        onClose={() => setTagSideOverOpen(false)}
        title={tagForm.id ? `Editar tag: ${tagForm.name}` : "Nova tag"}
        width={520}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[#64748B]">
            Use tags de <strong>contato</strong> para classificar perfis e tags de{" "}
            <strong>atendimento</strong> para tabular motivos dos chamados.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-[#334155]">Tipo de tag</label>
              <select
                value={tagForm.categoryType}
                onChange={(e) =>
                  setTagForm((cur) => ({
                    ...cur,
                    categoryType: e.target.value === "conversation" ? "conversation" : "contact",
                  }))
                }
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              >
                <option value="contact">Contato</option>
                <option value="conversation">Atendimento</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-[#334155]">Cor (hex)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={tagForm.colorHex}
                  onChange={(e) =>
                    setTagForm((cur) => ({ ...cur, colorHex: e.target.value || "#0EA5E9" }))
                  }
                  className="h-9 w-9 cursor-pointer rounded border border-[#E2E8F0]"
                />
                <input
                  type="text"
                  value={tagForm.colorHex}
                  onChange={(e) =>
                    setTagForm((cur) => ({ ...cur, colorHex: e.target.value || "#0EA5E9" }))
                  }
                  className="flex-1 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-[#334155]">Nome da tag</label>
            <input
              type="text"
              value={tagForm.name}
              onChange={(e) => setTagForm((cur) => ({ ...cur, name: e.target.value }))}
              placeholder="Ex.: Lead quente, Boleto, Upgrade de plano…"
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-[#334155]">Categoria</label>
            <input
              type="text"
              value={tagForm.categoryName}
              onChange={(e) => setTagForm((cur) => ({ ...cur, categoryName: e.target.value }))}
              placeholder={
                tagForm.categoryType === "contact"
                  ? "Ex.: Perfil, Jornada, Segmento…"
                  : "Ex.: Motivo, Resultado, Tipo de solicitação…"
              }
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-[#334155]">Filas</label>
            <p className="text-xs text-[#64748B]">
              Se nenhuma fila for selecionada, a tag ficará disponível em{" "}
              <strong>todas</strong> as filas da empresa.
            </p>
            {queues.length === 0 ? (
              <p className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-3 text-sm text-[#64748B]">
                Nenhuma fila configurada. Cadastre filas na área de Filas.
              </p>
            ) : (
              <select
                multiple
                value={tagForm.queueIds}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, (o) => o.value);
                  setTagForm((cur) => ({ ...cur, queueIds: selected }));
                }}
                className="h-28 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              >
                {queues.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-[#334155]">
              <input
                type="checkbox"
                checked={tagForm.active}
                onChange={(e) =>
                  setTagForm((cur) => ({ ...cur, active: e.target.checked }))
                }
                className="h-4 w-4 rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
              />
              Tag ativa
            </label>
          </div>

          <div className="mt-2 flex justify-end gap-2 border-t border-[#E2E8F0] pt-3">
            <button
              type="button"
              onClick={() => setTagSideOverOpen(false)}
              disabled={savingTag}
              className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveTag}
              disabled={savingTag}
              className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
            >
              {savingTag && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </button>
          </div>
        </div>
      </SideOver>

      <SideOver
        open={formSideOverOpen}
        onClose={() => setFormSideOverOpen(false)}
        title={formBuilder.id ? `Editar formulário: ${formBuilder.name}` : "Novo formulário"}
        width={560}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[#64748B]">
            Formulários de tabulação são exibidos para o agente ao encerrar o atendimento, para
            registrar motivo, solução e outras informações importantes.
          </p>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-[#334155]">Nome</label>
            <input
              type="text"
              value={formBuilder.name}
              onChange={(e) =>
                setFormBuilder((cur) => ({ ...cur, name: e.target.value }))
              }
              placeholder="Ex.: Pós-atendimento WhatsApp, Reclamações, Suporte nível 1…"
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-[#334155]">Descrição (opcional)</label>
            <textarea
              value={formBuilder.description}
              onChange={(e) =>
                setFormBuilder((cur) => ({ ...cur, description: e.target.value }))
              }
              rows={2}
              placeholder="Explique quando este formulário deve ser usado pelos agentes."
              className="w-full resize-none rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-[#334155]">Filas</label>
            <p className="text-xs text-[#64748B]">
              Se nenhuma fila for selecionada, o formulário ficará disponível para{" "}
              <strong>todas</strong> as filas.
            </p>
            {queues.length === 0 ? (
              <p className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-3 text-sm text-[#64748B]">
                Nenhuma fila configurada. Cadastre filas na área de Filas.
              </p>
            ) : (
              <select
                multiple
                value={formBuilder.queueIds}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, (o) => o.value);
                  setFormBuilder((cur) => ({ ...cur, queueIds: selected }));
                }}
                className="h-28 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              >
                {queues.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-[#334155]">
                Campos do formulário
              </label>
              <button
                type="button"
                onClick={() =>
                  setFormBuilder((cur) => ({
                    ...cur,
                    fields: [
                      ...cur.fields,
                      {
                        id: crypto.randomUUID(),
                        label: `Campo ${cur.fields.length + 1}`,
                        type: "select",
                        required: false,
                      options: [],
                      },
                    ],
                  }))
                }
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-medium text-[#334155] hover:bg-[#F8FAFC]"
              >
                <Plus className="h-3 w-3" />
                Adicionar campo
              </button>
            </div>
            {formBuilder.fields.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-3 py-3 text-sm text-[#64748B]">
                Nenhum campo adicionado. Crie ao menos um campo para começar a tabular.
              </p>
            ) : (
              <div className="space-y-2">
                {formBuilder.fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="flex items-start gap-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2"
                  >
                    <span className="mt-1 text-xs font-medium text-[#94A3B8]">
                      {index + 1}.
                    </span>
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        value={field.label}
                        onChange={(e) =>
                          setFormBuilder((cur) => ({
                            ...cur,
                            fields: cur.fields.map((f) =>
                              f.id === field.id ? { ...f, label: e.target.value } : f
                            ),
                          }))
                        }
                        className="w-full rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                        placeholder="Título do campo (ex.: Motivo principal, Resultado, Satisfação…)"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={field.type}
                          onChange={(e) =>
                            setFormBuilder((cur) => ({
                              ...cur,
                              fields: cur.fields.map((f) =>
                                f.id === field.id
                                  ? {
                                      ...f,
                                      type:
                                        e.target.value === "multiselect"
                                          ? "multiselect"
                                          : e.target.value === "text"
                                          ? "text"
                                          : e.target.value === "number"
                                          ? "number"
                                          : "select",
                                    }
                                  : f
                              ),
                            }))
                          }
                          className="rounded-lg border border-[#E2E8F0] bg-white px-2 py-1.5 text-xs text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                        >
                          <option value="select">Seleção única</option>
                          <option value="multiselect">Seleção múltipla</option>
                          <option value="text">Texto</option>
                          <option value="number">Número</option>
                        </select>
                        <label className="flex items-center gap-1 text-xs text-[#334155]">
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(e) =>
                              setFormBuilder((cur) => ({
                                ...cur,
                                fields: cur.fields.map((f) =>
                                  f.id === field.id
                                    ? { ...f, required: e.target.checked }
                                    : f
                                ),
                              }))
                            }
                            className="h-3.5 w-3.5 rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
                          />
                          Obrigatório
                        </label>
                      </div>
                      {(field.type === "select" || field.type === "multiselect") && (
                        <div className="space-y-1 rounded-lg border border-dashed border-[#CBD5E1] bg-white px-3 py-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-[#334155]">
                              Opções ({field.options.length || 0})
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setFormBuilder((cur) => ({
                                  ...cur,
                                  fields: cur.fields.map((f) =>
                                    f.id === field.id
                                      ? {
                                          ...f,
                                          options: [...(f.options ?? []), ""],
                                        }
                                      : f
                                  ),
                                }))
                              }
                              className="inline-flex items-center gap-1 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-1 text-[11px] font-medium text-[#334155] hover:bg-[#E2E8F0]"
                            >
                              <Plus className="h-3 w-3" />
                              Adicionar opção
                            </button>
                          </div>
                          {field.options.length === 0 ? (
                            <p className="text-[11px] text-[#94A3B8]">
                              Adicione opções como &quot;Sim&quot;, &quot;Não&quot;, &quot;Parcialmente&quot;…
                            </p>
                          ) : (
                            <div className="space-y-1">
                              {field.options.map((opt, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                  <span className="w-4 text-[11px] text-[#94A3B8]">
                                    {idx + 1}.
                                  </span>
                                  <input
                                    type="text"
                                    value={opt}
                                    onChange={(e) =>
                                      setFormBuilder((cur) => ({
                                        ...cur,
                                        fields: cur.fields.map((f) =>
                                          f.id === field.id
                                            ? {
                                                ...f,
                                                options: f.options.map((o, i) =>
                                                  i === idx ? e.target.value : o
                                                ),
                                              }
                                            : f
                                        ),
                                      }))
                                    }
                                    placeholder="Texto da opção"
                                    className="flex-1 rounded-lg border border-[#E2E8F0] px-2 py-1 text-xs text-[#1E293B] placeholder:text-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setFormBuilder((cur) => ({
                                        ...cur,
                                        fields: cur.fields.map((f) =>
                                          f.id === field.id
                                            ? {
                                                ...f,
                                                options: f.options.filter((_, i) => i !== idx),
                                              }
                                            : f
                                        ),
                                      }))
                                    }
                                    className="rounded-full p-1 text-[#64748B] hover:bg-red-50 hover:text-red-600"
                                    title="Remover opção"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setFormBuilder((cur) => ({
                          ...cur,
                          fields: cur.fields.filter((f) => f.id !== field.id),
                        }))
                      }
                      className="mt-1 rounded-lg p-1.5 text-[#64748B] hover:bg-red-50 hover:text-red-600"
                      title="Remover campo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-[#334155]">
              <input
                type="checkbox"
                checked={formBuilder.active}
                onChange={(e) =>
                  setFormBuilder((cur) => ({ ...cur, active: e.target.checked }))
                }
                className="h-4 w-4 rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
              />
              Formulário ativo
            </label>
          </div>

          <div className="mt-2 flex justify-end gap-2 border-t border-[#E2E8F0] pt-3">
            <button
              type="button"
              onClick={() => setFormSideOverOpen(false)}
              disabled={savingForm}
              className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveForm}
              disabled={savingForm}
              className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
            >
              {savingForm && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </button>
          </div>
        </div>
      </SideOver>

      <ConfirmDialog
        open={!!tagToDelete}
        onClose={() => setTagToDelete(null)}
        title="Excluir tag"
        message={
          tagToDelete
            ? `Excluir a tag "${tagToDelete.name}"? Ela deixará de aparecer para novos atendimentos, mas continua registrada no histórico.`
            : ""
        }
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={handleDeleteTag}
      />

      <ConfirmDialog
        open={!!formToDelete}
        onClose={() => setFormToDelete(null)}
        title="Excluir formulário"
        message={
          formToDelete
            ? `Excluir o formulário "${formToDelete.name}"? Ele deixará de ser exibido para os agentes.`
            : ""
        }
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={handleDeleteForm}
      />
    </div>
  );
}
