import { NextResponse } from "next/server";
import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { createClient } from "@/lib/supabase/server";

type ContactTagsPostBody =
  | {
      channel_contact_id: string;
      tag_ids: string[];
    }
  | {
      channel_id: string;
      number: string;
      tag_ids: string[];
    };

export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const channelContactId = url.searchParams.get("channel_contact_id");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tags")
    .select(
      `
        id,
        name,
        color_hex,
        is_active,
        tag_categories ( id, name, kind )
      `
    )
    .eq("company_id", companyId)
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const allContactTags =
    (data ?? [])
      .map((row: any) => {
        const cat = row.tag_categories as { id: string; name: string; kind: string } | null;
        if (!cat || cat.kind !== "contact") return null;
        return {
          id: row.id as string,
          name: row.name as string,
          color_hex: (row.color_hex as string | null) ?? null,
          active: row.is_active !== false,
          category_id: cat.id as string,
          category_name: cat.name as string,
        };
      })
      .filter(Boolean) as {
      id: string;
      name: string;
      color_hex: string | null;
      active: boolean;
      category_id: string;
      category_name: string;
    }[];

  if (!channelContactId) {
    return NextResponse.json({
      tags: allContactTags,
      selected_tag_ids: [] as string[],
    });
  }

  const { data: existingTags, error: ctError } = await supabase
    .from("contact_tags")
    .select("tag_id")
    .eq("company_id", companyId)
    .eq("channel_contact_id", channelContactId);

  if (ctError) {
    return NextResponse.json({ error: ctError.message }, { status: 500 });
  }

  const selectedTagIds = (existingTags ?? []).map((row: any) => row.tag_id as string);

  return NextResponse.json({
    tags: allContactTags,
    selected_tag_ids: selectedTagIds,
  });
}

export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ContactTagsPostBody;
  try {
    body = (await request.json()) as ContactTagsPostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = await createClient();

  let contactId: string | null = null;

  if ("channel_contact_id" in body && body.channel_contact_id) {
    contactId = body.channel_contact_id;
  } else if ("channel_id" in body && "number" in body) {
    const channelId = (body.channel_id ?? "").trim();
    const number = (body.number ?? "").trim();
    if (!channelId || !number) {
      return NextResponse.json(
        { error: "channel_id e number são obrigatórios" },
        { status: 400 }
      );
    }

    const digits = number.replace(/\D/g, "");
    const jid = digits ? `${digits}@s.whatsapp.net` : "";
    if (!jid) {
      return NextResponse.json({ error: "Número inválido" }, { status: 400 });
    }

    const { data: contactRow, error: contactErr } = await supabase
      .from("channel_contacts")
      .select("id")
      .eq("company_id", companyId)
      .eq("channel_id", channelId)
      .eq("jid", jid)
      .maybeSingle();

    if (contactErr) {
      return NextResponse.json({ error: contactErr.message }, { status: 500 });
    }

    if (contactRow?.id) {
      contactId = contactRow.id as string;
    } else {
      // Se ainda não existir em channel_contacts (ex.: recém criado manualmente),
      // criamos um registro mínimo apenas na nossa base, sem depender da UAZAPI.
      const now = new Date().toISOString();
      const { data: inserted, error: insertErr } = await supabase
        .from("channel_contacts")
        .insert({
          company_id: companyId,
          channel_id: channelId,
          jid,
          phone: digits,
          contact_name: null,
          first_name: null,
          synced_at: now,
        })
        .select("id")
        .single();

      if (insertErr || !inserted) {
        return NextResponse.json(
          { error: insertErr?.message ?? "Falha ao criar contato para atribuir tags" },
          { status: 500 }
        );
      }

      contactId = inserted.id as string;
    }
  }

  if (!contactId) {
    return NextResponse.json(
      { error: "channel_contact_id ou (channel_id + number) são obrigatórios" },
      { status: 400 }
    );
  }

  const tagIds = Array.isArray((body as any).tag_ids)
    ? (body as any).tag_ids.map((t: string) => t.trim()).filter(Boolean)
    : [];

  // Limpa tags atuais
  await supabase
    .from("contact_tags")
    .delete()
    .eq("company_id", companyId)
    .eq("channel_contact_id", contactId);

  if (tagIds.length > 0) {
    const rows = tagIds.map((tagId: string) => ({
      company_id: companyId,
      channel_contact_id: contactId!,
      tag_id: tagId,
    }));
    const { error } = await supabase.from("contact_tags").insert(rows);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, contact_id: contactId });
}

