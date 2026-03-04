import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

/** GET: lista usuários (perfis) da empresa com cargo e caixas atribuídas */
export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const err = await requirePermission(companyId, PERMISSIONS.users.manage);
  if (err) return NextResponse.json({ error: err.error }, { status: err.status });

  const admin = createServiceRoleClient();
  const selectWithAvatar = "id, user_id, company_id, role_id, email, full_name, phone, cpf, avatar_url, is_owner, is_active, created_at, roles(id, name)";
  const selectWithoutAvatar = "id, user_id, company_id, role_id, email, full_name, phone, cpf, is_owner, is_active, created_at, roles(id, name)";
  let profiles: { id: string; user_id: string; company_id: string; role_id: string | null; email: string | null; full_name: string | null; phone: string | null; cpf: string | null; avatar_url?: string | null; is_owner: boolean; is_active?: boolean; created_at: string; roles: { id: string; name: string } | { id: string; name: string }[] | null }[] | null = null;
  let profError: { message: string } | null = null;
  const first = await admin
    .from("profiles")
    .select(selectWithAvatar)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  profiles = first.data;
  profError = first.error;
  if (profError?.message?.includes("avatar_url") || profError?.message?.includes("schema cache")) {
    const fallback = await admin
      .from("profiles")
      .select(selectWithoutAvatar)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    profiles = fallback.data as typeof profiles;
    profError = fallback.error;
  }
  if (profError) return NextResponse.json({ error: profError.message }, { status: 500 });

  const { data: assignments } = await admin
    .from("queue_assignments")
    .select("user_id, queue_id, queues(id, name)")
    .eq("company_id", companyId);

  const { data: groupAssignments } = await admin
    .from("channel_group_assignments")
    .select("user_id, channel_id, group_jid")
    .eq("company_id", companyId);

  type AssignRow = { user_id: string; queue_id: string; queues: { id: string; name: string } | { id: string; name: string }[] | null };
  const byUser = (assignments ?? []).reduce<Record<string, { id: string; name: string }[]>>((acc, row: AssignRow) => {
    const q = Array.isArray(row.queues) ? row.queues[0] : row.queues;
    if (!acc[row.user_id]) acc[row.user_id] = [];
    if (q) acc[row.user_id].push({ id: q.id, name: q.name });
    return acc;
  }, {});

  type GroupRow = { user_id: string; channel_id: string; group_jid: string };
  const groupByUser = (groupAssignments ?? []).reduce<Record<string, { channel_id: string; group_jid: string }[]>>((acc, row: GroupRow) => {
    if (!acc[row.user_id]) acc[row.user_id] = [];
    acc[row.user_id].push({ channel_id: row.channel_id, group_jid: row.group_jid });
    return acc;
  }, {});

  const list = (profiles ?? []).map((p: { id: string; user_id: string; company_id: string; role_id: string | null; email: string | null; full_name: string | null; phone: string | null; cpf: string | null; avatar_url?: string | null; is_owner: boolean; is_active?: boolean; created_at: string; roles: { id: string; name: string } | { id: string; name: string }[] | null }) => ({
    id: p.id,
    user_id: p.user_id,
    email: p.email ?? undefined,
    full_name: p.full_name ?? undefined,
    phone: p.phone ?? undefined,
    cpf: p.cpf ?? undefined,
    avatar_url: (p as { avatar_url?: string | null }).avatar_url ?? undefined,
    is_owner: p.is_owner,
    is_active: p.is_active !== false,
    role_id: p.role_id ?? undefined,
    role_name: Array.isArray(p.roles) ? p.roles[0]?.name : (p.roles as { name: string } | null)?.name,
    queues: byUser[p.user_id] ?? [],
    group_assignments: groupByUser[p.user_id] ?? [],
    created_at: p.created_at,
  }));

  return NextResponse.json(list);
}

/** POST: cria usuário (auth + perfil + atribuições a caixas) */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const err = await requirePermission(companyId, PERMISSIONS.users.manage);
  if (err) return NextResponse.json({ error: err.error }, { status: err.status });

  let body: { email?: string; password?: string; full_name?: string; phone?: string; cpf?: string; role_id?: string; queue_ids?: string[]; avatar_url?: string; group_assignments?: { channel_id: string; group_jid: string }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const fullName = typeof body?.full_name === "string" ? body.full_name.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone.replace(/\D/g, "").trim() || null : null;
  const cpf = typeof body?.cpf === "string" ? body.cpf.replace(/\D/g, "").trim() || null : null;
  const roleId = typeof body?.role_id === "string" ? body.role_id.trim() : null;
  const queueIds = Array.isArray(body?.queue_ids) ? body.queue_ids.filter((id): id is string => typeof id === "string") : [];
  const avatarUrl = typeof body?.avatar_url === "string" ? body.avatar_url.trim() || null : null;
  const groupAssignments = Array.isArray(body?.group_assignments)
    ? body.group_assignments.filter((a): a is { channel_id: string; group_jid: string } => typeof a?.channel_id === "string" && typeof a?.group_jid === "string")
    : [];

  if (!email) return NextResponse.json({ error: "E-mail é obrigatório" }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: "Senha deve ter no mínimo 6 caracteres" }, { status: 400 });
  if (!roleId) return NextResponse.json({ error: "Cargo é obrigatório" }, { status: 400 });

  const supabase = await createClient();
  const { data: role } = await supabase.from("roles").select("id").eq("id", roleId).eq("company_id", companyId).single();
  if (!role) return NextResponse.json({ error: "Cargo não encontrado" }, { status: 404 });

  const admin = createServiceRoleClient();
  let userId: string;
  const { data: newUser, error: createUserError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : undefined,
  });

  if (createUserError || !newUser?.user) {
    const isAlreadyRegistered =
      createUserError?.message?.toLowerCase().includes("already") ||
      createUserError?.message?.toLowerCase().includes("registered") ||
      createUserError?.message?.toLowerCase().includes("already been registered");
    if (isAlreadyRegistered) {
      const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const existing = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (existing?.id) {
        const { data: existingProfile } = await admin
          .from("profiles")
          .select("id")
          .eq("user_id", existing.id)
          .eq("company_id", companyId)
          .single();
        if (existingProfile) {
          return NextResponse.json(
            { error: "Este e-mail já está vinculado a esta empresa. Use outro e-mail ou edite o usuário existente." },
            { status: 400 }
          );
        }
        userId = existing.id;
        if (password.length >= 6) {
          await admin.auth.admin.updateUserById(userId, { password });
        }
      } else {
        return NextResponse.json(
          { error: createUserError?.message ?? "E-mail já cadastrado no sistema. Use outro e-mail." },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: createUserError?.message ?? "Falha ao criar usuário." },
        { status: 400 }
      );
    }
  } else {
    userId = newUser!.user.id;
  }

  const profilePayload: Record<string, unknown> = {
    user_id: userId,
    company_id: companyId,
    role_id: roleId,
    role: "agent",
    email,
    is_owner: false,
    ...(fullName && { full_name: fullName }),
    ...(phone && { phone: phone }),
    ...(cpf && { cpf: cpf }),
    ...(avatarUrl && { avatar_url: avatarUrl }),
  };
  let { data: insertedProfile, error: profileError } = await admin
    .from("profiles")
    .insert(profilePayload)
    .select("id")
    .single();
  if (profileError && (profileError.message?.includes("avatar_url") || profileError.message?.includes("schema cache"))) {
    const { avatar_url: _, ...payloadWithoutAvatar } = profilePayload;
    const retry = await admin.from("profiles").insert(payloadWithoutAvatar).select("id").single();
    insertedProfile = retry.data;
    profileError = retry.error;
  }
  if (profileError) {
    return NextResponse.json({ error: profileError.message ?? "Falha ao criar perfil" }, { status: 500 });
  }

  if (queueIds.length > 0) {
    const rows = queueIds.map((queue_id) => ({ queue_id, user_id: userId, company_id: companyId }));
    const { error: assignError } = await admin.from("queue_assignments").insert(rows);
    if (assignError) {
      return NextResponse.json({ error: assignError.message ?? "Falha ao atribuir caixas" }, { status: 500 });
    }
  }

  if (groupAssignments.length > 0) {
    const rows = groupAssignments.map(({ channel_id, group_jid }) => ({
      channel_id,
      company_id: companyId,
      group_jid,
      user_id: userId,
    }));
    const { error: groupErr } = await admin.from("channel_group_assignments").insert(rows);
    if (groupErr) {
      return NextResponse.json({ error: groupErr.message ?? "Falha ao atribuir responsabilidades em grupos" }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    user_id: userId,
    profile_id: insertedProfile?.id ?? undefined,
  });
}
