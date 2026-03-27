import { NextResponse } from "next/server";
import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { toCanonicalDigits } from "@/lib/phone-canonical";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { callUazSender } from "@/lib/uazapi/sender";

type Body = {
  channel_id?: string;
  number?: string;
  short_cut?: string;
  text?: string;
  menu_type?: "button" | "list" | "poll" | "carousel";
  choices?: string[];
  footer_text?: string;
  list_button?: string;
  selectable_count?: number;
  image_button?: string;
};

function normalizeChoices(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v).trim()).filter(Boolean);
}

export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const permErr = await requirePermission(companyId, PERMISSIONS.quickreplies.manage);
  if (permErr) return NextResponse.json({ error: permErr.error }, { status: permErr.status });

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const channelId = String(body.channel_id ?? "").trim();
  const numberDigits = toCanonicalDigits(String(body.number ?? ""));
  const text = String(body.text ?? "").trim();
  const shortCut = String(body.short_cut ?? "campaign_template").trim();
  const menuType = body.menu_type ?? "button";
  const choices = normalizeChoices(body.choices);
  const footerText = String(body.footer_text ?? "").trim();
  const listButton = String(body.list_button ?? "Ver opções").trim();
  const selectableCount = Math.max(1, Number(body.selectable_count) || 1);
  const imageButton = String(body.image_button ?? "").trim();

  if (!channelId) return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
  if (!numberDigits) return NextResponse.json({ error: "Número inválido para teste." }, { status: 400 });
  if (!text) return NextResponse.json({ error: "Texto principal é obrigatório." }, { status: 400 });

  const resolved = await getChannelToken(channelId, companyId);
  if (!resolved) return NextResponse.json({ error: "Canal não encontrado." }, { status: 404 });

  const finalChoices =
    choices.length > 0 ? choices : menuType === "button" ? ["Quero saber mais|campaign_info"] : ["Opção 1"];

  const trackId = `campaign_test_${shortCut}_${Date.now()}`;
  const payload: Record<string, unknown> = {
    number: numberDigits,
    type: menuType,
    text,
    choices: finalChoices,
    readchat: true,
    async: true,
    track_source: "campaign_test",
    track_id: trackId,
  };

  if (footerText) payload.footerText = footerText;
  if (menuType === "list") payload.listButton = listButton || "Ver opções";
  if (menuType === "poll") payload.selectableCount = selectableCount;
  if (menuType === "button" && imageButton) payload.imageButton = imageButton;

  const result = await callUazSender(resolved.token, "/send/menu", {
    method: "POST",
    body: payload,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Falha ao enviar teste de campanha." },
      { status: result.status || 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    track_id: trackId,
    channel_id: channelId,
    number: numberDigits,
    payload,
    response: result.data ?? { status: "queued" },
  });
}
