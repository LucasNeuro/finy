import { getCompanyIdFromCookie } from "@/lib/auth/get-company";
import { requireAdmin } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const companyId = await getCompanyIdFromCookie();
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channels")
    .select("id, name, uazapi_instance_id, queue_id, is_active, created_at")
    .eq("company_id", companyId)
    .order("name");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const companyId = await getCompanyIdFromCookie();
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminError = await requireAdmin(companyId);
  if (adminError) {
    return NextResponse.json({ error: adminError.error }, { status: adminError.status });
  }
  let body: { name?: string; uazapi_instance_id?: string; uazapi_token_encrypted?: string; queue_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const uazapi_instance_id = typeof body?.uazapi_instance_id === "string" ? body.uazapi_instance_id.trim() : "";
  const uazapi_token_encrypted = typeof body?.uazapi_token_encrypted === "string" ? body.uazapi_token_encrypted.trim() : "";
  const queue_id = typeof body?.queue_id === "string" ? body.queue_id : null;
  if (!name || !uazapi_instance_id) {
    return NextResponse.json({ error: "name and uazapi_instance_id required" }, { status: 400 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channels")
    .insert({
      company_id: companyId,
      name,
      uazapi_instance_id,
      uazapi_token_encrypted: uazapi_token_encrypted || null,
      queue_id: queue_id || null,
    })
    .select("id, name, uazapi_instance_id, queue_id, is_active, created_at")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}