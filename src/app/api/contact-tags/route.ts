import { NextResponse } from "next/server";
import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { toCanonicalDigits } from "@/lib/phone-canonical";
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
  let channelContactId = url.searchParams.get("channel_contact_id");
  const channelIdParam = url.searchParams.get("channel_id");
  const numberParam = url.searchParams.get("number");

  const supabase = await createClient();

  // Resolve channel_contact_id from channel_id + number (ex.: chat sidebar)
  if (!channelContactId && channelIdParam?.trim() && numberParam?.trim()) {
    const channelId = channelIdParam.trim();
    const canonicalDigits = toCanonicalDigits(numberParam) ?? numberParam.replace(/\D/g, "").trim();
    const rawDigits = numberParam.replace(/\D/g, "").trim();
    const jidCandidates = Array.from(
      new Set(
        [numberParam.trim(), rawDigits ? `${rawDigits}@s.whatsapp.net` : "", canonicalDigits ? `${canonicalDigits}@s.whatsapp.net` : ""]
          .map((s) => s.trim())
          .filter(Boolean)
      )
    );
    if (jidCandidates.length > 0) {
      const { data: contactRows } = await supabase
        .from("channel_contacts")
        .select("id, synced_at")
        .eq("company_id", companyId)
        .eq("channel_id", channelId)
        .in("jid", jidCandidates)
        .order("synced_at", { ascending: false })
        .limit(1);
      if (Array.isArray(contactRows) && contactRows[0]?.id) {
        channelContactId = contactRows[0].id as string;
      }
    }
    if (!channelContactId && canonicalDigits) {
      const { data: contactRowsByPhone } = await supabase
        .from("channel_contacts")
        .select("id, synced_at")
        .eq("company_id", companyId)
        .eq("channel_id", channelId)
        .eq("phone", canonicalDigits)
        .order("synced_at", { ascending: false })
        .limit(1);
      if (Array.isArray(contactRowsByPhone) && contactRowsByPhone[0]?.id) {
        channelContactId = contactRowsByPhone[0].id as string;
      }
    }
  }

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

    const canonicalDigits = toCanonicalDigits(number) ?? number.replace(/\D/g, "");
    const rawDigits = number.replace(/\D/g, "");
    const jidCandidates = Array.from(
      new Set(
        [number.trim(), rawDigits ? `${rawDigits}@s.whatsapp.net` : "", canonicalDigits ? `${canonicalDigits}@s.whatsapp.net` : ""]
          .map((s) => s.trim())
          .filter(Boolean)
      )
    );
    if (!canonicalDigits && jidCandidates.length === 0) {
      return NextResponse.json({ error: "Número inválido" }, { status: 400 });
    }

    const { data: contactRows, error: contactErr } = await supabase
      .from("channel_contacts")
      .select("id, synced_at")
      .eq("company_id", companyId)
      .eq("channel_id", channelId)
      .in("jid", jidCandidates)
      .order("synced_at", { ascending: false })
      .limit(1);

    if (contactErr) {
      return NextResponse.json({ error: contactErr.message }, { status: 500 });
    }

    if (Array.isArray(contactRows) && contactRows[0]?.id) {
      contactId = contactRows[0].id as string;
    } else if (canonicalDigits) {
      const { data: contactRowsByPhone, error: phoneErr } = await supabase
        .from("channel_contacts")
        .select("id, synced_at")
        .eq("company_id", companyId)
        .eq("channel_id", channelId)
        .eq("phone", canonicalDigits)
        .order("synced_at", { ascending: false })
        .limit(1);
      if (phoneErr) {
        return NextResponse.json({ error: phoneErr.message }, { status: 500 });
      }
      if (Array.isArray(contactRowsByPhone) && contactRowsByPhone[0]?.id) {
        contactId = contactRowsByPhone[0].id as string;
      }
    }

    if (!contactId) {
      const jidToInsert =
        (canonicalDigits ? `${canonicalDigits}@s.whatsapp.net` : "") ||
        jidCandidates[0] ||
        "";
      if (!jidToInsert) {
        return NextResponse.json({ error: "Número inválido" }, { status: 400 });
      }

      // Se ainda não existir em channel_contacts (ex.: recém criado manualmente),
      // criamos um registro mínimo apenas na nossa base, sem depender da UAZAPI.
      const now = new Date().toISOString();
      const { data: inserted, error: insertErr } = await supabase
        .from("channel_contacts")
        .insert({
          company_id: companyId,
          channel_id: channelId,
          jid: jidToInsert,
          phone: canonicalDigits || rawDigits || null,
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

