"use client";

import { useState, useEffect, useCallback } from "react";
import { UserCog, Users, Plus, Loader2, Settings, Trash2, Briefcase, UserCircle, Eye, EyeOff, List, UserPlus } from "lucide-react";
import { usePathname } from "next/navigation";
import { SideOver } from "@/components/SideOver";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  type PermissionKey,
} from "@/lib/auth/permissions";

function getCompanySlug(pathname: string | null): string {
  const fromPath = pathname?.split("/").filter(Boolean)[0] ?? "";
  if (fromPath && !["login", "api", "onboarding", "auth"].includes(fromPath)) return fromPath;
  if (typeof document !== "undefined") {
    const match = document.cookie.match(/\bclicvend_slug=([^;]+)/);
    if (match?.[1]) return match[1].trim();
  }
  return fromPath;
}

type Role = { id: string; name: string; permissions: string[]; created_at?: string };
type UserRow = {
  id: string;
  user_id: string;
  email?: string;
  full_name?: string;
  phone?: string;
  cpf?: string;
  is_owner: boolean;
  is_active?: boolean;
  role_id?: string;
  role_name?: string;
  queues: { id: string; name: string }[];
  created_at: string;
};

export default function CargosUsuariosPage() {
  const pathname = usePathname();
  const slug = getCompanySlug(pathname);
  const apiHeaders = slug ? { "X-Company-Slug": slug } : undefined;

  const [activeTab, setActiveTab] = useState<"cargos" | "usuarios">("cargos");
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [queues, setQueues] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [roleSideOverOpen, setRoleSideOverOpen] = useState(false);
  const [roleSideOverTab, setRoleSideOverTab] = useState<"cargo" | "usuarios">("cargo");
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleName, setRoleName] = useState("");
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);
  const [roleSaving, setRoleSaving] = useState(false);

  const [userSideOverOpen, setUserSideOverOpen] = useState(false);
  const [userSideOverTab, setUserSideOverTab] = useState<"lista" | "form">("lista");
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [userFullName, setUserFullName] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [userCpf, setUserCpf] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userShowPassword, setUserShowPassword] = useState(false);
  const [userSendCredentialsWhatsApp, setUserSendCredentialsWhatsApp] = useState(false);
  const [userRoleId, setUserRoleId] = useState("");
  const [userQueueIds, setUserQueueIds] = useState<string[]>([]);
  const [userSaving, setUserSaving] = useState(false);
  const [userToggleActiveId, setUserToggleActiveId] = useState<string | null>(null);

  const [deleteRoleConfirm, setDeleteRoleConfirm] = useState<Role | null>(null);

  const fetchRoles = useCallback(() => {
    return fetch("/api/roles", { credentials: "include", headers: apiHeaders })
      .then((r) => r.json())
      .then((data) => setRoles(Array.isArray(data) ? data : []))
      .catch(() => setRoles([]));
  }, [slug]);

  const fetchUsers = useCallback(() => {
    return fetch("/api/users", { credentials: "include", headers: apiHeaders })
      .then((r) => r.json())
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => setUsers([]));
  }, [slug]);

  const fetchQueues = useCallback(() => {
    return fetch("/api/queues", { credentials: "include", headers: apiHeaders })
      .then((r) => r.json())
      .then((data) => setQueues(Array.isArray(data) ? data : []))
      .catch(() => setQueues([]));
  }, [slug]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchRoles(), fetchUsers(), fetchQueues()]).finally(() => setLoading(false));
  }, [fetchRoles, fetchUsers, fetchQueues]);

  const openNewRole = () => {
    setEditingRole(null);
    setRoleName("");
    setRolePermissions([]);
    setRoleSideOverTab("cargo");
    setError("");
    setRoleSideOverOpen(true);
  };

  const openEditRole = (r: Role) => {
    setEditingRole(r);
    setRoleName(r.name);
    setRolePermissions(Array.isArray(r.permissions) ? r.permissions : []);
    setRoleSideOverTab("cargo");
    setError("");
    setRoleSideOverOpen(true);
  };

  const saveRole = async () => {
    const name = roleName.trim();
    if (!name) {
      setError("Informe o nome do cargo.");
      return;
    }
    setError("");
    setRoleSaving(true);
    try {
      const url = editingRole ? `/api/roles/${editingRole.id}` : "/api/roles";
      const method = editingRole ? "PATCH" : "POST";
      const body = editingRole
        ? { name, permissions: rolePermissions }
        : { name, permissions: rolePermissions };
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify(body),
        credentials: "include",
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.error ?? "Falha ao salvar");
        setRoleSaving(false);
        return;
      }
      fetchRoles();
      setRoleSideOverOpen(false);
    } catch {
      setError("Erro de rede.");
    }
    setRoleSaving(false);
  };

  const deleteRole = async () => {
    const r = deleteRoleConfirm;
    if (!r) return;
    setDeleteRoleConfirm(null);
    try {
      const res = await fetch(`/api/roles/${r.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: apiHeaders,
      });
      if (res.ok) fetchRoles();
    } catch {
      // ignore
    }
  };

  const openUserManagement = () => {
    setUserSideOverTab("lista");
    setEditingUser(null);
    setError("");
    setUserSideOverOpen(true);
  };

  const openNewUser = () => {
    setEditingUser(null);
    setUserEmail("");
    setUserFullName("");
    setUserPhone("");
    setUserCpf("");
    setUserPassword("");
    setUserShowPassword(false);
    setUserSendCredentialsWhatsApp(false);
    setUserRoleId(roles[0]?.id ?? "");
    setUserQueueIds([]);
    setError("");
    setUserSideOverTab("form");
    setUserSideOverOpen(true);
  };

  const openEditUser = (u: UserRow) => {
    setEditingUser(u);
    setUserEmail(u.email ?? "");
    setUserFullName(u.full_name ?? "");
    setUserPhone(u.phone ?? "");
    setUserCpf(u.cpf ?? "");
    setUserPassword("");
    setUserShowPassword(false);
    setUserRoleId(u.role_id ?? roles[0]?.id ?? "");
    setUserQueueIds(u.queues?.map((q) => q.id) ?? []);
    setError("");
    setUserSideOverTab("form");
    setUserSideOverOpen(true);
  };

  const toggleUserActive = async (u: UserRow) => {
    if (u.is_owner) return;
    const next = !(u.is_active !== false);
    setUserToggleActiveId(u.id);
    try {
      const r = await fetch(`/api/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ is_active: next }),
        credentials: "include",
      });
      if (r.ok) fetchUsers();
      else {
        const data = await r.json();
        setError(data?.error ?? "Falha ao atualizar");
      }
    } catch {
      setError("Erro de rede.");
    } finally {
      setUserToggleActiveId(null);
    }
  };

  const saveUser = async () => {
    setError("");
    setUserSaving(true);
    try {
      if (editingUser) {
        const body: { role_id: string; queue_ids: string[]; full_name?: string; phone?: string; cpf?: string } = {
          role_id: userRoleId,
          queue_ids: userQueueIds,
          full_name: userFullName.trim() || undefined,
          phone: userPhone.trim() || undefined,
          cpf: userCpf.replace(/\D/g, "").trim() || undefined,
        };
        const r = await fetch(`/api/users/${editingUser.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...apiHeaders },
          body: JSON.stringify(body),
          credentials: "include",
        });
        const data = await r.json();
        if (!r.ok) {
          setError(data?.error ?? "Falha ao atualizar");
          setUserSaving(false);
          return;
        }
      } else {
        const email = userEmail.trim();
        const password = userPassword;
        if (!email) {
          setError("E-mail é obrigatório.");
          setUserSaving(false);
          return;
        }
        if (password.length < 6) {
          setError("Senha deve ter no mínimo 6 caracteres.");
          setUserSaving(false);
          return;
        }
        if (!userRoleId) {
          setError("Selecione um cargo.");
          setUserSaving(false);
          return;
        }
        const sendCredentials = userSendCredentialsWhatsApp;
        if (sendCredentials && !userPhone.trim().replace(/\D/g, "")) {
          setError("Para enviar credenciais por WhatsApp, informe o telefone do usuário.");
          setUserSaving(false);
          return;
        }
        const r = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...apiHeaders },
          body: JSON.stringify({
            email,
            password,
            full_name: userFullName.trim() || undefined,
            phone: userPhone.trim().replace(/\D/g, "") || undefined,
            cpf: userCpf.replace(/\D/g, "").trim() || undefined,
            role_id: userRoleId,
            queue_ids: userQueueIds,
          }),
          credentials: "include",
        });
        const data = await r.json();
        if (!r.ok) {
          setError(data?.error ?? "Falha ao criar usuário");
          setUserSaving(false);
          return;
        }
        if (sendCredentials && data?.user_id && userPhone.trim()) {
          const sendR = await fetch("/api/users/send-credentials", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...apiHeaders },
            body: JSON.stringify({
              user_id: data.user_id,
              password,
              phone: userPhone.trim().replace(/\D/g, ""),
            }),
            credentials: "include",
          });
          if (!sendR.ok) {
            const sendData = await sendR.json().catch(() => ({}));
            setError(sendData?.error ?? "Usuário criado, mas falha ao enviar credenciais por WhatsApp.");
            setUserSaving(false);
            return;
          }
        }
      }
      fetchUsers();
      setUserSideOverOpen(false);
    } catch {
      setError("Erro de rede.");
    }
    setUserSaving(false);
  };

  const togglePermission = (key: PermissionKey) => {
    setRolePermissions((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold text-[#1E293B]">Cargos e usuários</h1>
      <p className="text-sm text-[#64748B]">
        Crie cargos com permissões e cadastre usuários atribuindo cargo e caixas de atendimento.
      </p>

      <div className="flex gap-1 border-b border-[#E2E8F0]">
        <button
          type="button"
          onClick={() => setActiveTab("cargos")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${
            activeTab === "cargos"
              ? "border-clicvend-orange text-clicvend-orange"
              : "border-transparent text-[#64748B] hover:text-[#334155]"
          }`}
        >
          <Briefcase className="h-4 w-4" />
          Cargos
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("usuarios")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${
            activeTab === "usuarios"
              ? "border-clicvend-orange text-clicvend-orange"
              : "border-transparent text-[#64748B] hover:text-[#334155]"
          }`}
        >
          <Users className="h-4 w-4" />
          Usuários
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-clicvend-orange" />
        </div>
      ) : (
        <>
          {activeTab === "cargos" && (
            <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
                <h2 className="text-sm font-semibold text-[#334155]">Cargos</h2>
                <button
                  type="button"
                  onClick={openNewRole}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-clicvend-orange px-3 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark"
                >
                  <Plus className="h-4 w-4" />
                  Novo cargo
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[400px]">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-[#64748B]">Nome</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-[#64748B]">Permissões</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-[#64748B]">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roles.map((r) => (
                      <tr key={r.id} className="border-b border-[#E2E8F0] hover:bg-[#F8FAFC]">
                        <td className="px-4 py-3 font-medium text-[#1E293B]">{r.name}</td>
                        <td className="px-4 py-3 text-sm text-[#64748B]">
                          {Array.isArray(r.permissions) ? r.permissions.length : 0} permissões
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => openEditRole(r)}
                            className="rounded p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B]"
                            title="Editar"
                          >
                            <Settings className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteRoleConfirm(r)}
                            className="rounded p-2 text-[#64748B] hover:bg-red-50 hover:text-red-600"
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {roles.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-[#94A3B8]">Nenhum cargo cadastrado.</p>
              )}
            </div>
          )}

          {activeTab === "usuarios" && (
            <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
                <h2 className="text-sm font-semibold text-[#334155]">Usuários</h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openUserManagement}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC]"
                  >
                    <UserCog className="h-4 w-4" />
                    Gestão de usuários
                  </button>
                  <button
                    type="button"
                    onClick={openNewUser}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-clicvend-orange px-3 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark"
                  >
                    <Plus className="h-4 w-4" />
                    Novo usuário
                  </button>
                </div>
              </div>
              <div className="p-6 text-center text-sm text-[#64748B]">
                {users.length} usuário(s) na empresa. Abra a gestão para ver a lista, ativar/desativar e editar.
              </div>
            </div>
          )}
        </>
      )}

      <SideOver
        open={roleSideOverOpen}
        onClose={() => setRoleSideOverOpen(false)}
        title={editingRole ? `Cargo: ${editingRole.name}` : "Novo cargo"}
        width={600}
      >
        <div className="flex flex-col gap-4">
          <div className="flex gap-1 overflow-x-auto pb-2 -mx-1">
            <button
              type="button"
              onClick={() => setRoleSideOverTab("cargo")}
              className={`flex items-center gap-1.5 shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                roleSideOverTab === "cargo" ? "bg-clicvend-orange/10 text-clicvend-orange" : "text-[#64748B] hover:bg-[#F1F5F9]"
              }`}
            >
              <Briefcase className="h-4 w-4" />
              Cargo
            </button>
            <button
              type="button"
              onClick={() => setRoleSideOverTab("usuarios")}
              className={`flex items-center gap-1.5 shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                roleSideOverTab === "usuarios" ? "bg-clicvend-orange/10 text-clicvend-orange" : "text-[#64748B] hover:bg-[#F1F5F9]"
              }`}
            >
              <UserCircle className="h-4 w-4" />
              Usuários com este cargo
            </button>
          </div>

          {roleSideOverTab === "cargo" && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[#334155]">Nome do cargo</label>
                <input
                  type="text"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  placeholder="Ex: Atendente, Supervisor"
                  className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[#334155]">Permissões</label>
                <p className="mb-2 text-xs text-[#64748B]">Marque as liberações que este cargo terá na plataforma.</p>
                <div className="space-y-4 max-h-[320px] overflow-auto rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                  {PERMISSION_GROUPS.map((group) => (
                    <div key={group.label}>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#64748B]">{group.label}</p>
                      <div className="space-y-1.5">
                        {group.keys.map((key) => (
                          <label key={key} className="flex items-center gap-2 text-sm text-[#334155]">
                            <input
                              type="checkbox"
                              checked={rolePermissions.includes(key)}
                              onChange={() => togglePermission(key)}
                              className="rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
                            />
                            {PERMISSION_LABELS[key]}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRoleSideOverOpen(false)}
                  className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={saveRole}
                  disabled={roleSaving || !roleName.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
                >
                  {roleSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Salvar
                </button>
              </div>
            </div>
          )}

          {roleSideOverTab === "usuarios" && (
            <div className="space-y-3">
              <p className="text-sm text-[#64748B]">
                {editingRole
                  ? "Usuários que possuem este cargo. Edite na aba Usuários da página para alterar cargo ou caixas."
                  : "Salve o cargo primeiro para ver os usuários vinculados."}
              </p>
              {editingRole ? (
                (() => {
                  const withRole = users.filter((u) => u.role_id === editingRole.id);
                  return withRole.length === 0 ? (
                    <p className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-center text-sm text-[#94A3B8]">
                      Nenhum usuário com este cargo.
                    </p>
                  ) : (
                    <ul className="divide-y divide-[#E2E8F0] rounded-lg border border-[#E2E8F0] bg-white">
                      {withRole.map((u) => (
                        <li key={u.id} className="flex items-center justify-between px-3 py-2">
                          <span className="text-sm font-medium text-[#1E293B]">{u.email ?? "—"}</span>
                          <span className="text-xs text-[#64748B]">
                            {u.queues?.length ? `${u.queues.length} caixa(s)` : "Sem caixas"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  );
                })()
              ) : (
                <p className="rounded-lg border border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-4 text-center text-sm text-[#94A3B8]">
                  Crie e salve o cargo para vincular usuários.
                </p>
              )}
            </div>
          )}
        </div>
      </SideOver>

      <SideOver
        open={userSideOverOpen}
        onClose={() => setUserSideOverOpen(false)}
        title={userSideOverTab === "form" ? (editingUser ? `Editar: ${editingUser.email ?? "Usuário"}` : "Novo usuário") : "Gestão de usuários"}
        width={760}
      >
        <div className="flex flex-col gap-4">
          <div className="flex gap-1 overflow-x-auto pb-2 -mx-1">
            <button
              type="button"
              onClick={() => setUserSideOverTab("lista")}
              className={`flex items-center gap-1.5 shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                userSideOverTab === "lista" ? "bg-clicvend-orange/10 text-clicvend-orange" : "text-[#64748B] hover:bg-[#F1F5F9]"
              }`}
            >
              <List className="h-4 w-4" />
              Lista de usuários
            </button>
            <button
              type="button"
              onClick={() => { setUserSideOverTab("form"); if (!editingUser && !userEmail) openNewUser(); }}
              className={`flex items-center gap-1.5 shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                userSideOverTab === "form" ? "bg-clicvend-orange/10 text-clicvend-orange" : "text-[#64748B] hover:bg-[#F1F5F9]"
              }`}
            >
              <UserPlus className="h-4 w-4" />
              {editingUser ? "Editar usuário" : "Novo usuário"}
            </button>
          </div>

          {userSideOverTab === "lista" && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={openNewUser}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-clicvend-orange px-3 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark"
                >
                  <Plus className="h-4 w-4" />
                  Novo usuário
                </button>
              </div>
              <div className="overflow-x-auto rounded-lg border border-[#E2E8F0]">
                <table className="w-full min-w-[520px]">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase text-[#64748B]">Nome / E-mail</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase text-[#64748B]">WhatsApp</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase text-[#64748B]">Cargo</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase text-[#64748B]">Ativo</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase text-[#64748B]">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b border-[#E2E8F0] last:border-0 hover:bg-[#F8FAFC]">
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-[#1E293B]">{u.full_name || u.email ?? "—"}</div>
                          {u.full_name && u.email && <div className="text-xs text-[#64748B]">{u.email}</div>}
                          {u.is_owner && (
                            <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                              Proprietário
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-sm text-[#64748B]">{u.phone ? `+55 ${u.phone}` : "—"}</td>
                        <td className="px-3 py-2.5 text-sm text-[#64748B]">{u.role_name ?? "—"}</td>
                        <td className="px-3 py-2.5">
                          {u.is_owner ? (
                            <span className="text-xs text-[#94A3B8]">—</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggleUserActive(u)}
                              disabled={userToggleActiveId === u.id}
                              className={`relative inline-flex h-6 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-clicvend-orange focus:ring-offset-1 disabled:opacity-50 ${
                                u.is_active !== false ? "bg-clicvend-orange" : "bg-[#E2E8F0]"
                              }`}
                              role="switch"
                              aria-checked={u.is_active !== false}
                            >
                              <span
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                                  u.is_active !== false ? "translate-x-4" : "translate-x-0.5"
                                }`}
                              />
                              {userToggleActiveId === u.id && (
                                <span className="absolute inset-0 flex items-center justify-center">
                                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                                </span>
                              )}
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => openEditUser(u)}
                            className="rounded p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B]"
                            title="Editar"
                          >
                            <Settings className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {users.length === 0 && (
                <p className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-center text-sm text-[#94A3B8]">
                  Nenhum usuário cadastrado. Use &quot;Novo usuário&quot; para criar.
                </p>
              )}
              {error && userSideOverTab === "lista" && <p className="text-sm text-red-600">{error}</p>}
            </div>
          )}

          {userSideOverTab === "form" && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[#334155]">Nome completo</label>
                <input
                  type="text"
                  value={userFullName}
                  onChange={(e) => setUserFullName(e.target.value)}
                  placeholder="Ex: Maria Silva"
                  className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#334155]">E-mail</label>
                <input
                  type="email"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  disabled={!!editingUser}
                  className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange disabled:bg-[#F1F5F9] disabled:text-[#64748B]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#334155]">Telefone WhatsApp</label>
                <input
                  type="tel"
                  value={userPhone}
                  onChange={(e) => setUserPhone(e.target.value)}
                  placeholder="Ex: 11999998888 (apenas números)"
                  className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                />
                <p className="mt-1 text-xs text-[#64748B]">Para enviar login e senha por WhatsApp ao criar o usuário.</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#334155]">CPF</label>
                <input
                  type="text"
                  value={userCpf}
                  onChange={(e) => setUserCpf(e.target.value)}
                  placeholder="Apenas números"
                  maxLength={14}
                  className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                />
              </div>
              {!editingUser ? (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[#334155]">Senha inicial</label>
                    <p className="mb-1.5 text-xs text-[#64748B]">Pode colar a senha para compartilhar com o usuário. Use &quot;Mostrar senha&quot; para copiar.</p>
                    <div className="flex gap-2">
                      <input
                        type={userShowPassword ? "text" : "password"}
                        value={userPassword}
                        onChange={(e) => setUserPassword(e.target.value)}
                        placeholder="Mín. 6 caracteres (pode colar)"
                        autoComplete="new-password"
                        className="flex-1 rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                      />
                      <button
                        type="button"
                        onClick={() => setUserShowPassword((p) => !p)}
                        className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#64748B] hover:bg-[#F8FAFC]"
                        title={userShowPassword ? "Ocultar senha" : "Mostrar senha"}
                      >
                        {userShowPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <label className="mt-2 flex items-center gap-2 text-sm text-[#334155]">
                    <input
                      type="checkbox"
                      checked={userSendCredentialsWhatsApp}
                      onChange={(e) => setUserSendCredentialsWhatsApp(e.target.checked)}
                      className="rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
                    />
                    Enviar credenciais de acesso por WhatsApp (login e senha) para o telefone informado
                  </label>
                </>
              ) : (
                <p className="text-xs text-[#64748B]">Deixe a senha em branco para não alterar. Para redefinir, use a opção de recuperação ou altere em edição (futuro).</p>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium text-[#334155]">Cargo</label>
                <select
                  value={userRoleId}
                  onChange={(e) => setUserRoleId(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                >
                  <option value="">Selecionar…</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#334155]">Caixas de atendimento</label>
                <p className="mb-2 text-xs text-[#64748B]">Usuário poderá ver e atender conversas destas caixas.</p>
                <div className="max-h-40 overflow-auto rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-2 space-y-1">
                  {queues.map((q) => (
                    <label key={q.id} className="flex items-center gap-2 text-sm text-[#334155]">
                      <input
                        type="checkbox"
                        checked={userQueueIds.includes(q.id)}
                        onChange={(e) =>
                          setUserQueueIds((prev) =>
                            e.target.checked ? [...prev, q.id] : prev.filter((id) => id !== q.id)
                          )
                        }
                        className="rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
                      />
                      {q.name}
                    </label>
                  ))}
                </div>
                {queues.length === 0 && <p className="text-xs text-[#94A3B8]">Nenhuma caixa cadastrada. Crie em Filas.</p>}
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setUserSideOverOpen(false); setError(""); }}
                  className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={saveUser}
                  disabled={userSaving}
                  className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
                >
                  {userSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {editingUser ? "Salvar" : "Criar usuário"}
                </button>
              </div>
            </div>
          )}
        </div>
      </SideOver>

      <ConfirmDialog
        open={!!deleteRoleConfirm}
        onClose={() => setDeleteRoleConfirm(null)}
        onConfirm={deleteRole}
        title="Excluir cargo?"
        message={
          deleteRoleConfirm
            ? `Excluir o cargo "${deleteRoleConfirm.name}"? Usuários com este cargo precisarão ser reatribuídos.`
            : ""
        }
        confirmLabel="Excluir"
        variant="danger"
      />
    </div>
  );
}
