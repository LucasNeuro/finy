\"use client\";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type Ticket = {
  id: string;
  customer_phone: string;
  customer_name: string | null;
  status: string;
  queue_id: string | null;
  assigned_to: string | null;
  last_message_at: string;
  created_at: string;
};

type Queue = { id: string; name: string };

const STATUS_COLUMNS: { key: string; title: string }[] = [
  { key: "open", title: "Abertos" },
  { key: "in_progress", title: "Em atendimento" },
  { key: "waiting", title: "Aguardando" },
  { key: "closed", title: "Fechados" },
];

function normalizeStatus(raw: string): string {
  const s = (raw || "").toLowerCase();
  if (s === "closed" || s === "fechado" || s === "resolvido") return "closed";
  if (s === "waiting" || s === "pendente" || s === "pending") return "waiting";
  if (s === "in_progress" || s === "atendimento" || s === "ongoing") return "in_progress";
  return "open";
}

export default function TicketsPage() {
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const slug = segments[0];
  const apiHeaders = slug ? { "X-Company-Slug": slug } : undefined;

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [queueId, setQueueId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    fetch("/api/queues?for_inbox=1", { credentials: "include", headers: apiHeaders })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setQueues(
            data.map((q: { id: string; name: string }) => ({ id: q.id, name: q.name ?? "(sem nome)" }))
          );
        } else {
          setQueues([]);
        }
      })
      .catch(() => setQueues([]));
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (queueId) params.set("queue_id", queueId);
    fetch(`/api/conversations?${params}`, { credentials: "include", headers: apiHeaders })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body?.error || "Falha ao carregar tickets");
        }
        return r.json();
      })
      .then((res) => {
        setTickets(Array.isArray(res?.data) ? res.data : []);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Erro ao carregar tickets");
        setTickets([]);
      })
      .finally(() => setLoading(false));
  }, [slug, queueId]);

  const queueById = useMemo(() => {
    const map = new Map<string, string>();
    queues.forEach((q) => map.set(q.id, q.name));
    return map;
  }, [queues]);

  const columns = useMemo(() => {
    const grouped: Record<string, Ticket[]> = {};
    STATUS_COLUMNS.forEach((c) => {
      grouped[c.key] = [];
    });
    for (const t of tickets) {
      const key = normalizeStatus(t.status);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(t);
    }
    return STATUS_COLUMNS.map((c) => ({
      ...c,
      items: grouped[c.key] ?? [],
    }));
  }, [tickets]);

  return (
    <div className="flex h-full flex-col gap-4 bg-[#F1F5F9] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#0F172A]">Tickets</h1>
          <p className="text-sm text-[#64748B]">
            Visão em quadro dos atendimentos por status. Sua permissão define quais filas você enxerga.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-[#64748B]">
            Fila:&nbsp;
            <select
              value={queueId}
              onChange={(e) => setQueueId(e.target.value)}
              className="rounded border border-[#E2E8F0] bg-white px-2 py-1.5 text-sm text-[#1E293B]"
            >
              <option value="">Todas</option>
              {queues.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-[#64748B]">
          Carregando tickets…
        </div>
      ) : tickets.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-[#64748B]">
          Nenhum ticket encontrado para os filtros atuais.
        </div>
      ) : (
        <div className="flex flex-1 gap-4 overflow-x-auto pb-2">
          {columns.map((col) => (
            <div
              key={col.key}
              className="flex min-w-[260px] max-w-xs flex-1 flex-col rounded-lg bg-[#E2E8F0]/60 p-2"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-[#0F172A]">{col.title}</h2>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-[#64748B]">
                  {col.items.length}
                </span>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto pb-1">
                {col.items.map((t) => (
                  <a
                    key={t.id}
                    href={slug ? `/${slug}/conversas/${t.id}` : `#/tickets/${t.id}`}
                    className="block rounded-lg bg-white p-3 text-sm shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="max-w-[160px] truncate font-medium text-[#0F172A]">
                        {t.customer_name || t.customer_phone}
                      </p>
                      <span
                        className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          t.assigned_to
                            ? "bg-clicvend-green/10 text-clicvend-green"
                            : "bg-[#E2E8F0] text-[#64748B]"
                        }`}
                      >
                        {t.assigned_to ? "Em atendimento" : "Na fila"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-[#64748B]">
                      <span className="truncate">
                        {t.queue_id ? queueById.get(t.queue_id) ?? "Fila" : "Sem fila"}
                      </span>
                      <span>
                        {new Date(t.last_message_at || t.created_at).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "2-digit",
                        })}
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

