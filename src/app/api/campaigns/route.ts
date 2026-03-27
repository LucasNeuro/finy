import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { toCanonicalDigits, toCanonicalJid } from "@/lib/phone-canonical";
import { createClient } from "@/lib/supabase/server";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { callUazSender } from "@/lib/uazapi/sender";
import { NextResponse } from "next/server";

type CampaignMode = "simple" | "advanced";
type BatchingPayload = { enabled?: boolean; plan?: string; interval_minutes?: number };

type NormalizedTarget = {
  raw: string;
  digits: string | null;
  jid: string | null;
};

function normalizeTarget(raw: string): NormalizedTarget {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { raw: "", digits: null, jid: null };
  if (trimmed.includes("@")) {
    if (trimmed.toLowerCase().endsWith("@g.us")) {
      return { raw: trimmed, digits: null, jid: null };
    }
    const digits = toCanonicalDigits(trimmed.replace(/@.*$/, ""));
    const jid = digits ? toCanonicalJid(digits, false) : null;
    return { raw: trimmed, digits: digits ?? null, jid };
  }
  const digits = toCanonicalDigits(trimmed);
  const jid = digits ? toCanonicalJid(digits, false) : null;
  return { raw: trimmed, digits: digits ?? null, jid };
}

function collectTargets(mode: CampaignMode, payload: Record<string, unknown>): NormalizedTarget[] {
  if (mode === "simple") {
    const numbers = Array.isArray(payload.numbers) ? payload.numbers : [];
    return numbers
      .map((n) => normalizeTarget(String(n)))
      .filter((t) => t.raw);
  }

  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  return messages
    .map((m) => {
      const row = (m ?? {}) as Record<string, unknown>;
      const number = typeof row.number === "string"
        ? row.number
        : typeof row.chatid === "string"
          ? row.chatid
          : "";
      return normalizeTarget(number);
    })
    .filter((t) => t.raw);
}

async function validateOptIn(
  companyId: string,
  channelId: string,
  targets: NormalizedTarget[]
): Promise<{ ok: boolean; blocked: string[]; error?: string }> {
  if (targets.length === 0) return { ok: true, blocked: [] };
  const supabase = await createClient();

  const digitsList = Array.from(new Set(targets.map((t) => t.digits).filter(Boolean))) as string[];
  const jidList = Array.from(new Set(targets.map((t) => t.jid).filter(Boolean))) as string[];

  type ConsentRow = { phone: string | null; jid: string; opt_in_at: string | null; opt_out_at: string | null };
  const rows: ConsentRow[] = [];

  if (digitsList.length > 0) {
    const { data, error } = await supabase
      .from("channel_contacts")
      .select("phone, jid, opt_in_at, opt_out_at")
      .eq("company_id", companyId)
      .eq("channel_id", channelId)
      .in("phone", digitsList);
    if (error) {
      if (String(error.message || "").toLowerCase().includes("opt_in_at")) {
        return { ok: false, blocked: [], error: "Campos de consentimento não encontrados. Execute a migration de opt-in." };
      }
      return { ok: false, blocked: [], error: error.message };
    }
    rows.push(...(((data ?? []) as ConsentRow[])));
  }

  if (jidList.length > 0) {
    const { data, error } = await supabase
      .from("channel_contacts")
      .select("phone, jid, opt_in_at, opt_out_at")
      .eq("company_id", companyId)
      .eq("channel_id", channelId)
      .in("jid", jidList);
    if (error) {
      if (String(error.message || "").toLowerCase().includes("opt_in_at")) {
        return { ok: false, blocked: [], error: "Campos de consentimento não encontrados. Execute a migration de opt-in." };
      }
      return { ok: false, blocked: [], error: error.message };
    }
    rows.push(...(((data ?? []) as ConsentRow[])));
  }

  const consentByKey = new Map<string, { opt_in_at: string | null; opt_out_at: string | null }>();
  for (const row of rows) {
    const d = toCanonicalDigits(row.phone ?? row.jid?.replace(/@.*$/, "") ?? "");
    const j = d ? toCanonicalJid(d, false) : (row.jid || null);
    if (d) consentByKey.set(`d:${d}`, { opt_in_at: row.opt_in_at, opt_out_at: row.opt_out_at });
    if (j) consentByKey.set(`j:${j}`, { opt_in_at: row.opt_in_at, opt_out_at: row.opt_out_at });
  }

  const blocked: string[] = [];
  for (const target of targets) {
    const match =
      (target.digits ? consentByKey.get(`d:${target.digits}`) : undefined) ??
      (target.jid ? consentByKey.get(`j:${target.jid}`) : undefined);
    const allowed = Boolean(match?.opt_in_at) && !Boolean(match?.opt_out_at);
    if (!allowed) blocked.push(target.raw);
  }

  return { ok: blocked.length === 0, blocked };
}

function parseBatchPlan(raw: string | undefined): number[] {
  if (!raw) return [];
  const parsed = raw
    .split(/[,\s;]+/)
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.floor(n));
  return parsed.slice(0, 10);
}

function withScheduleOffset(original: unknown, minutesToAdd: number): number {
  const now = Date.now();
  const asNumber = typeof original === "number" ? original : Number(original);
  if (!Number.isFinite(asNumber) || asNumber <= 0) {
    return now + minutesToAdd * 60_000;
  }
  // UAZ aceita "minutos a partir de agora" ou epoch ms; heurística:
  if (asNumber < 1_000_000_000_000) {
    return Math.max(1, Math.floor(asNumber + minutesToAdd));
  }
  return asNumber + minutesToAdd * 60_000;
}

export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const permErr = await requirePermission(companyId, PERMISSIONS.campaigns.view);
  if (permErr) return NextResponse.json({ error: permErr.error }, { status: permErr.status });

  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get("channel_id")?.trim();
  const status = searchParams.get("status")?.trim();
  if (!channelId) {
    return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
  }

  const resolved = await getChannelToken(channelId, companyId);
  if (!resolved) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const qs = new URLSearchParams();
  if (status) qs.set("status", status);
  const path = qs.toString() ? `/sender/listfolders?${qs}` : "/sender/listfolders";
  const result = await callUazSender<unknown[]>(resolved.token, path, { method: "GET" });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Failed to list campaigns" }, { status: 502 });
  }

  return NextResponse.json(Array.isArray(result.data) ? result.data : []);
}

export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const permErr = await requirePermission(companyId, PERMISSIONS.campaigns.manage);
  if (permErr) return NextResponse.json({ error: permErr.error }, { status: permErr.status });

  let body: { channel_id?: string; mode?: CampaignMode; payload?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const channelId = typeof body?.channel_id === "string" ? body.channel_id.trim() : "";
  if (!channelId) return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
  const mode: CampaignMode = body?.mode === "advanced" ? "advanced" : "simple";
  const payload = (body?.payload ?? {}) as Record<string, unknown>;

  const resolved = await getChannelToken(channelId, companyId);
  if (!resolved) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const targets = collectTargets(mode, payload);
  const consent = await validateOptIn(companyId, channelId, targets);
  if (!consent.ok) {
    return NextResponse.json(
      {
        error: consent.error ?? "Alguns contatos não possuem opt-in válido para campanha.",
        blocked_targets: consent.blocked,
      },
      { status: 400 }
    );
  }

  const batching = ((payload.batching ?? {}) as BatchingPayload) || {};
  const batchEnabled = Boolean(batching.enabled);
  const batchPlan = parseBatchPlan(batching.plan);
  const batchInterval = Math.max(1, Number(batching.interval_minutes) || 10);

  const path = mode === "advanced" ? "/sender/advanced" : "/sender/simple";
  if (!batchEnabled || batchPlan.length === 0) {
    const result = await callUazSender(resolved.token, path, { method: "POST", body: payload });
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Failed to create campaign" }, { status: 502 });
    }
    return NextResponse.json(result.data ?? { ok: true });
  }

  const scheduleBase = payload.scheduled_for;

  if (mode === "simple") {
    const numbers = Array.isArray(payload.numbers) ? payload.numbers.map((n) => String(n)).filter(Boolean) : [];
    if (numbers.length === 0) {
      return NextResponse.json({ error: "numbers is required for batching" }, { status: 400 });
    }
    const responses: unknown[] = [];
    let cursor = 0;
    let offsetMinutes = 0;
    let batchIndex = 0;
    while (cursor < numbers.length) {
      const size = batchPlan[Math.min(batchIndex, batchPlan.length - 1)]!;
      const chunk = numbers.slice(cursor, cursor + size);
      const bodyChunk: Record<string, unknown> = {
        ...payload,
        numbers: chunk,
        scheduled_for: withScheduleOffset(scheduleBase, offsetMinutes),
        folder: `${String(payload.folder ?? "Campanha")} [Lote ${batchIndex + 1}]`,
      };
      delete bodyChunk.batching;
      const result = await callUazSender(resolved.token, path, { method: "POST", body: bodyChunk });
      if (!result.ok) {
        return NextResponse.json({ error: result.error ?? `Falha no lote ${batchIndex + 1}` }, { status: 502 });
      }
      responses.push(result.data ?? { ok: true, batch: batchIndex + 1, size: chunk.length });
      cursor += size;
      batchIndex += 1;
      offsetMinutes += batchInterval;
    }
    return NextResponse.json({ ok: true, mode, batched: true, batches: responses.length, responses });
  }

  const messages = Array.isArray(payload.messages)
    ? payload.messages.filter((m): m is Record<string, unknown> => Boolean(m && typeof m === "object"))
    : [];
  if (messages.length === 0) {
    return NextResponse.json({ error: "messages is required for batching" }, { status: 400 });
  }

  const responses: unknown[] = [];
  let cursor = 0;
  let offsetMinutes = 0;
  let batchIndex = 0;
  while (cursor < messages.length) {
    const size = batchPlan[Math.min(batchIndex, batchPlan.length - 1)]!;
    const chunk = messages.slice(cursor, cursor + size);
    const bodyChunk: Record<string, unknown> = {
      ...payload,
      messages: chunk,
      scheduled_for: withScheduleOffset(scheduleBase, offsetMinutes),
      info: `${String(payload.info ?? "Campanha avançada")} [Lote ${batchIndex + 1}]`,
    };
    delete bodyChunk.batching;
    const result = await callUazSender(resolved.token, path, { method: "POST", body: bodyChunk });
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? `Falha no lote ${batchIndex + 1}` }, { status: 502 });
    }
    responses.push(result.data ?? { ok: true, batch: batchIndex + 1, size: chunk.length });
    cursor += size;
    batchIndex += 1;
    offsetMinutes += batchInterval;
  }

  return NextResponse.json({ ok: true, mode, batched: true, batches: responses.length, responses });
}

export async function PATCH(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const permErr = await requirePermission(companyId, PERMISSIONS.campaigns.manage);
  if (permErr) return NextResponse.json({ error: permErr.error }, { status: permErr.status });

  let body: { channel_id?: string; folder_id?: string; action?: "stop" | "continue" | "delete" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const channelId = typeof body?.channel_id === "string" ? body.channel_id.trim() : "";
  const folderId = typeof body?.folder_id === "string" ? body.folder_id.trim() : "";
  const action = body?.action;
  if (!channelId || !folderId || !action) {
    return NextResponse.json({ error: "channel_id, folder_id and action are required" }, { status: 400 });
  }

  const resolved = await getChannelToken(channelId, companyId);
  if (!resolved) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const result = await callUazSender(resolved.token, "/sender/edit", {
    method: "POST",
    body: { folder_id: folderId, action },
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Failed to update campaign" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
