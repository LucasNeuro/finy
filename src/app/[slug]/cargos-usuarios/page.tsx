"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { UserCog, Users, Plus, Loader2, Settings, Trash2, Briefcase, UserCircle, Eye, EyeOff, List, UserPlus, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
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
  avatar_url?: string;
  is_owner: boolean;
  is_active?: boolean;
  role_id?: string;
  role_name?: string;
  queues: { id: string; name: string }[];
  group_assignments?: { channel_id: string; group_jid: string }[];
  created_at: string;
};

type Channel = { id: string; name: string };
type ChannelGroup = { id: string; channel_id: string; jid: string; name: string | null; left_at: string | null };
const ROLES_PAGE_SIZE = 10;
const USERS_PAGE_SIZE = 6;

export default function CargosUsuariosPage() {
  const pathname = usePathname();
  const router = useRouter();
  const slug = getCompanySlug(pathname);
  const apiHeaders = slug ? { "X-Company-Slug": slug } : undefined;

  const { data: permissionsData } = useQuery({
    queryKey: queryKeys.permissions(slug ?? ""),
    queryFn: () =>
      fetch("/api/auth/permissions", { credentials: "include", headers: apiHeaders }).then((r) => r.json()),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });
  const permissions = Array.isArray(permissionsData?.permissions) ? permissionsData.permissions : [];
  const canAccessUsers = permissions.includes("users.view") || permissions.includes("users.manage");

  useEffect(() => {
    if (slug && permissionsData !== undefined && !canAccessUsers) {
      router.replace(`/${slug}/conversas`);
    }
  }, [slug, permissionsData, canAccessUsers, router]);

  const [activeTab, setActiveTab] = useState<"cargos" | "usuarios">("cargos");
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [queues, setQueues] = useState<{ id: string; name: string }[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelGroups, setChannelGroups] = useState<ChannelGroup[]>([]);
  const [userGroupAssignments, setUserGroupAssignments] = useState<{ channel_id: string; group_jid: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [roleSearch, setRoleSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set());
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [rolesPageIndex, setRolesPageIndex] = useState(0);
  const [usersPageIndex, setUsersPageIndex] = useState(0);
  const [bulkQueueSideOverOpen, setBulkQueueSideOverOpen] = useState(false);
  const [bulkQueueIds, setBulkQueueIds] = useState<string[]>([]);
  const [bulkQueueMode, setBulkQueueMode] = useState<"add" | "replace">("add");
  const [bulkQueueSaving, setBulkQueueSaving] = useState(false);

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
  const [userAvatarUrl, setUserAvatarUrl] = useState("");
  const [userFetchingWhatsProfile, setUserFetchingWhatsProfile] = useState(false);
  const [whatsProfilePhone, setWhatsProfilePhone] = useState<string | null>(null);

  const [deleteRoleConfirm, setDeleteRoleConfirm] = useState<Role | null>(null);
  const [deleteSelectedRolesConfirmOpen, setDeleteSelectedRolesConfirmOpen] = useState(false);

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

  const fetchChannels = useCallback(() => {
    return fetch("/api/channels", { credentials: "include", headers: apiHeaders })
      .then((r) => r.json())
      .then((data) => setChannels(Array.isArray(data) ? data : []))
      .catch(() => setChannels([]));
  }, [slug]);

  const fetchChannelGroups = useCallback(() => {
    return fetch("/api/groups", { credentials: "include", headers: apiHeaders })
      .then((r) => r.json())
      .then((data) => setChannelGroups(Array.isArray(data) ? data : []))
      .catch(() => setChannelGroups([]));
  }, [slug]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchRoles(), fetchUsers(), fetchQueues(), fetchChannels(), fetchChannelGroups()]).finally(() => setLoading(false));
  }, [fetchRoles, fetchUsers, fetchQueues, fetchChannels, fetchChannelGroups]);

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
    setUserGroupAssignments([]);
    setUserAvatarUrl("");
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
    setUserAvatarUrl(u.avatar_url ?? "");
    setUserRoleId(u.role_id ?? roles[0]?.id ?? "");
    setUserQueueIds(u.queues?.map((q) => q.id) ?? []);
    setUserGroupAssignments(u.group_assignments ?? []);
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
        const body: { role_id: string; queue_ids: string[]; group_assignments: { channel_id: string; group_jid: string }[]; full_name?: string; phone?: string; cpf?: string } = {
          role_id: userRoleId,
          queue_ids: userQueueIds,
          group_assignments: userGroupAssignments,
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
            group_assignments: userGroupAssignments,
            avatar_url: userAvatarUrl || undefined,
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
            setError("Usuário criado. " + (sendData?.error ?? "Não foi possível enviar credenciais por WhatsApp."));
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

  const fetchWhatsappProfile = async () => {
    if (editingUser) return;
    const raw = userPhone.trim();
    const numeric = raw.replace(/\D/g, "");
    if (!numeric) return;
    if (whatsProfilePhone && whatsProfilePhone === numeric) return;
    setError("");
    setUserFetchingWhatsProfile(true);
    try {
      const r = await fetch("/api/users/whatsapp-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ phone: numeric }),
        credentials: "include",
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.error ?? "Falha ao buscar dados no WhatsApp.");
        return;
      }
      setWhatsProfilePhone(data.phone || numeric);
      // Preenche apenas nome e avatar automaticamente; demais campos o usuário completa manualmente.
      if (data.full_name && !userFullName) {
        setUserFullName(data.full_name);
      }
      if (data.avatar_url && !userAvatarUrl) {
        setUserAvatarUrl(data.avatar_url);
      }
    } catch {
      setError("Erro de rede ao consultar WhatsApp.");
    } finally {
      setUserFetchingWhatsProfile(false);
    }
  };

  const togglePermission = (key: PermissionKey) => {
    setRolePermissions((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  };

  const filteredRoles = useMemo(() => {
    const term = roleSearch.trim().toLowerCase();
    if (!term) return roles;
    return roles.filter((r) => r.name.toLowerCase().includes(term));
  }, [roles, roleSearch]);

  const filteredUsers = useMemo(() => {
    const term = userSearch.trim().toLowerCase();
    if (!term) return users;
    return users.filter((u) => {
      const name = (u.full_name ?? "").toLowerCase();
      const email = (u.email ?? "").toLowerCase();
      const phone = (u.phone ?? "").toLowerCase();
      const roleName = (u.role_name ?? "").toLowerCase();
      return name.includes(term) || email.includes(term) || phone.includes(term) || roleName.includes(term);
    });
  }, [users, userSearch]);

  const rolesPageCount = Math.max(1, Math.ceil(filteredRoles.length / ROLES_PAGE_SIZE));
  const usersPageCount = Math.max(1, Math.ceil(filteredUsers.length / USERS_PAGE_SIZE));
  const pagedRoles = useMemo(
    () => filteredRoles.slice(rolesPageIndex * ROLES_PAGE_SIZE, (rolesPageIndex + 1) * ROLES_PAGE_SIZE),
    [filteredRoles, rolesPageIndex]
  );
  const pagedUsers = useMemo(
    () => filteredUsers.slice(usersPageIndex * USERS_PAGE_SIZE, (usersPageIndex + 1) * USERS_PAGE_SIZE),
    [filteredUsers, usersPageIndex]
  );

  useEffect(() => {
    setSelectedRoleIds((prev) => {
      const next = new Set<string>();
      const allowed = new Set(filteredRoles.map((r) => r.id));
      prev.forEach((id) => {
        if (allowed.has(id)) next.add(id);
      });
      return next;
    });
  }, [filteredRoles]);

  useEffect(() => {
    setSelectedUserIds((prev) => {
      const next = new Set<string>();
      const allowed = new Set(filteredUsers.map((u) => u.id));
      prev.forEach((id) => {
        if (allowed.has(id)) next.add(id);
      });
      return next;
    });
  }, [filteredUsers]);

  useEffect(() => {
    setRolesPageIndex((prev) => Math.min(prev, Math.max(0, rolesPageCount - 1)));
  }, [rolesPageCount]);

  useEffect(() => {
    setUsersPageIndex((prev) => Math.min(prev, Math.max(0, usersPageCount - 1)));
  }, [usersPageCount]);

  useEffect(() => {
    setRolesPageIndex(0);
  }, [roleSearch]);

  useEffect(() => {
    setUsersPageIndex(0);
  }, [userSearch]);

  const toggleRoleSelected = (id: string) => {
    setSelectedRoleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleUserSelected = (id: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisibleRoles = () => {
    setSelectedRoleIds((prev) => {
      const allSelected = pagedRoles.length > 0 && pagedRoles.every((r) => prev.has(r.id));
      const next = new Set(prev);
      if (allSelected) {
        pagedRoles.forEach((r) => next.delete(r.id));
      } else {
        pagedRoles.forEach((r) => next.add(r.id));
      }
      return next;
    });
  };

  const toggleAllVisibleUsers = () => {
    setSelectedUserIds((prev) => {
      const allSelected = pagedUsers.length > 0 && pagedUsers.every((u) => prev.has(u.id));
      const next = new Set(prev);
      if (allSelected) {
        pagedUsers.forEach((u) => next.delete(u.id));
      } else {
        pagedUsers.forEach((u) => next.add(u.id));
      }
      return next;
    });
  };

  const deleteSelectedRoles = async () => {
    if (selectedRoleIds.size === 0) return;
    const ids = Array.from(selectedRoleIds);
    setError("");
    try {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/roles/${id}`, {
            method: "DELETE",
            credentials: "include",
            headers: apiHeaders,
          })
        )
      );
      setSelectedRoleIds(new Set());
      fetchRoles();
    } catch {
      setError("Erro de rede ao excluir cargos.");
    }
  };

  const bulkSetUsersActive = async (active: boolean) => {
    if (selectedUserIds.size === 0) return;
    const selectedRows = users.filter((u) => selectedUserIds.has(u.id) && !u.is_owner);
    if (selectedRows.length === 0) return;
    setError("");
    try {
      await Promise.all(
        selectedRows.map((u) =>
          fetch(`/api/users/${u.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...apiHeaders },
            body: JSON.stringify({ is_active: active }),
            credentials: "include",
          })
        )
      );
      fetchUsers();
      setSelectedUserIds(new Set());
    } catch {
      setError("Erro de rede ao atualizar usuários.");
    }
  };

  const openBulkQueueSideOver = () => {
    setBulkQueueIds([]);
    setBulkQueueMode("add");
    setBulkQueueSideOverOpen(true);
  };

  const saveBulkQueueAssignment = async () => {
    if (selectedUserIds.size === 0) {
      setError("Selecione ao menos um usuário.");
      return;
    }
    const selectedRows = users.filter((u) => selectedUserIds.has(u.id) && !u.is_owner);
    if (selectedRows.length === 0) {
      setError("Nenhum usuário elegível para atribuição em massa.");
      return;
    }
    if (bulkQueueIds.length === 0 && bulkQueueMode === "add") {
      setError("Selecione pelo menos uma fila para adicionar.");
      return;
    }
    setError("");
    setBulkQueueSaving(true);
    try {
      await Promise.all(
        selectedRows.map((u) => {
          const currentQueueIds = Array.isArray(u.queues) ? u.queues.map((q) => q.id) : [];
          const nextQueueIds =
            bulkQueueMode === "replace"
              ? [...bulkQueueIds]
              : Array.from(new Set([...currentQueueIds, ...bulkQueueIds]));
          return fetch(`/api/users/${u.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...apiHeaders },
            body: JSON.stringify({ queue_ids: nextQueueIds }),
            credentials: "include",
          });
        })
      );
      await fetchUsers();
      setBulkQueueSideOverOpen(false);
      setSelectedUserIds(new Set());
    } catch {
      setError("Erro de rede ao atribuir filas em massa.");
    } finally {
      setBulkQueueSaving(false);
    }
  };

  if (slug && permissionsData !== undefined && !canAccessUsers) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4 bg-[#F1F5F9] p-4 md:p-6">
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
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-semibold text-[#334155]">Cargos</h2>
                  <span className="rounded-full bg-[#E2E8F0] px-2 py-0.5 text-xs font-medium text-[#475569]">
                    {filteredRoles.length}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                    <input
                      value={roleSearch}
                      onChange={(e) => setRoleSearch(e.target.value)}
                      placeholder="Buscar cargo..."
                      className="w-52 rounded-lg border border-[#E2E8F0] bg-white py-2 pl-8 pr-3 text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={openNewRole}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-clicvend-orange px-3 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark"
                  >
                    <Plus className="h-4 w-4" />
                    Novo cargo
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
              {selectedRoleIds.size > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D9EEF0] bg-[#ECF8FA] px-3 py-2">
                  <span className="text-sm font-medium text-[#1E293B]">
                    {selectedRoleIds.size} cargo(s) selecionado(s)
                  </span>
                  <div className="inline-flex flex-wrap rounded-lg border border-[#E2E8F0] bg-white overflow-hidden shadow-sm">
                    {selectedRoleIds.size === 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const r = roles.find((x) => selectedRoleIds.has(x.id));
                          if (r) openEditRole(r);
                        }}
                        className="inline-flex items-center gap-1.5 border-r border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC] last:border-r-0"
                        title="Editar cargo selecionado"
                      >
                        Editar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedRoleIds.size === 0) return;
                        setDeleteSelectedRolesConfirmOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 border-r border-[#E2E8F0] bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 last:border-r-0"
                      title="Excluir cargos selecionados"
                    >
                      Excluir
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedRoleIds(new Set())}
                      className="inline-flex items-center gap-1.5 bg-white px-3 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9] last:border-r-0"
                      title="Limpar seleção"
                    >
                      Limpar seleção
                    </button>
                  </div>
                </div>
              )}
              <div className="max-h-[60vh] overflow-auto">
                <table className="w-full min-w-[400px]">
                  <thead>
                    <tr className="sticky top-0 z-10 border-b border-[#E2E8F0] bg-[#F8FAFC]">
                      <th className="w-10 px-2 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={pagedRoles.length > 0 && pagedRoles.every((r) => selectedRoleIds.has(r.id))}
                          onChange={toggleAllVisibleRoles}
                          className="h-4 w-4 rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
                          aria-label="Selecionar todos os cargos visíveis"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-[#64748B]">Nome</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-[#64748B]">Permissões</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-[#64748B]">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRoles.map((r) => (
                      <tr key={r.id} className="border-b border-[#E2E8F0] hover:bg-[#F8FAFC]">
                        <td className="w-10 px-2 py-3">
                          <input
                            type="checkbox"
                            checked={selectedRoleIds.has(r.id)}
                            onChange={() => toggleRoleSelected(r.id)}
                            className="h-4 w-4 rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
                            aria-label={`Selecionar cargo ${r.name}`}
                          />
                        </td>
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
              <div className="flex items-center justify-between gap-2 border-t border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2">
                <span className="text-sm text-[#64748B]">
                  Página {rolesPageIndex + 1} de {rolesPageCount} ({filteredRoles.length} cargo{filteredRoles.length !== 1 ? "s" : ""})
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setRolesPageIndex((i) => Math.max(0, i - 1))}
                    disabled={rolesPageIndex === 0}
                    className="rounded p-2 text-[#64748B] hover:bg-white hover:text-[#1E293B] disabled:pointer-events-none disabled:opacity-40"
                    aria-label="Página anterior de cargos"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRolesPageIndex((i) => Math.min(rolesPageCount - 1, i + 1))}
                    disabled={rolesPageIndex >= rolesPageCount - 1}
                    className="rounded p-2 text-[#64748B] hover:bg-white hover:text-[#1E293B] disabled:pointer-events-none disabled:opacity-40"
                    aria-label="Próxima página de cargos"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {filteredRoles.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-[#94A3B8]">
                  {roleSearch.trim() ? "Nenhum cargo encontrado para a busca." : "Nenhum cargo cadastrado."}
                </p>
              )}
            </div>
            </div>
          )}

          {activeTab === "usuarios" && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-semibold text-[#334155]">Usuários</h2>
                  <span className="rounded-full bg-[#E2E8F0] px-2 py-0.5 text-xs font-medium text-[#475569]">
                    {filteredUsers.length}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                    <input
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Buscar usuário..."
                      className="w-56 rounded-lg border border-[#E2E8F0] bg-white py-2 pl-8 pr-3 text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                    />
                  </div>
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

              <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
              {selectedUserIds.size > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D9EEF0] bg-[#ECF8FA] px-3 py-2">
                  <span className="text-sm font-medium text-[#1E293B]">
                    {selectedUserIds.size} usuário(s) selecionado(s)
                  </span>
                  <div className="inline-flex flex-wrap rounded-lg border border-[#E2E8F0] bg-white overflow-hidden shadow-sm">
                    <button
                      type="button"
                      onClick={openBulkQueueSideOver}
                      className="inline-flex items-center gap-1.5 border-r border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC] last:border-r-0"
                      title="Atribuir filas aos usuários selecionados"
                    >
                      Filas em massa
                    </button>
                    <button
                      type="button"
                      onClick={() => bulkSetUsersActive(true)}
                      className="inline-flex items-center gap-1.5 border-r border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC] last:border-r-0"
                      title="Ativar usuários selecionados"
                    >
                      Ativar
                    </button>
                    <button
                      type="button"
                      onClick={() => bulkSetUsersActive(false)}
                      className="inline-flex items-center gap-1.5 border-r border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC] last:border-r-0"
                      title="Desativar usuários selecionados"
                    >
                      Desativar
                    </button>
                    {selectedUserIds.size === 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const u = users.find((x) => selectedUserIds.has(x.id));
                          if (u) openEditUser(u);
                        }}
                        className="inline-flex items-center gap-1.5 border-r border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC] last:border-r-0"
                        title="Editar usuário selecionado"
                      >
                        Editar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedUserIds(new Set())}
                      className="inline-flex items-center gap-1.5 bg-white px-3 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9] last:border-r-0"
                      title="Limpar seleção"
                    >
                      Limpar seleção
                    </button>
                  </div>
                </div>
              )}
              <div className="max-h-[48vh] overflow-auto">
                <table className="w-full min-w-[520px]">
                  <thead>
                    <tr className="sticky top-0 z-10 border-b border-[#E2E8F0] bg-[#F8FAFC]">
                      <th className="w-10 px-2 py-2.5 text-left">
                        <input
                          type="checkbox"
                          checked={pagedUsers.length > 0 && pagedUsers.every((u) => selectedUserIds.has(u.id))}
                          onChange={toggleAllVisibleUsers}
                          className="h-4 w-4 rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
                          aria-label="Selecionar todos os usuários visíveis"
                        />
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase text-[#64748B]">Nome / E-mail</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase text-[#64748B]">WhatsApp</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase text-[#64748B]">Cargo</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase text-[#64748B]">Ativo</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase text-[#64748B]">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedUsers.map((u) => (
                      <tr key={u.id} className="border-b border-[#E2E8F0] last:border-0 hover:bg-[#F8FAFC]">
                        <td className="w-10 px-2 py-2.5">
                          <input
                            type="checkbox"
                            checked={selectedUserIds.has(u.id)}
                            onChange={() => toggleUserSelected(u.id)}
                            className="h-4 w-4 rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
                            aria-label={`Selecionar usuário ${u.full_name || u.email || u.id}`}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-3">
                            {u.avatar_url ? (
                              <img
                                src={u.avatar_url}
                                alt={u.full_name || u.email || "Usuário"}
                                className="h-8 w-8 rounded-full object-cover ring-2 ring-[#E2E8F0]"
                              />
                            ) : (
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E2E8F0] text-xs font-semibold text-[#475569]">
                                {(u.full_name || u.email || "U").charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div className="font-medium text-[#1E293B]">
                                {u.full_name || u.email || "—"}
                              </div>
                              {u.full_name && u.email && (
                                <div className="text-xs text-[#64748B]">{u.email}</div>
                              )}
                            </div>
                          </div>
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
              <div className="flex items-center justify-between gap-2 border-t border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2">
                <span className="text-sm text-[#64748B]">
                  Página {usersPageIndex + 1} de {usersPageCount} ({filteredUsers.length} usuário{filteredUsers.length !== 1 ? "s" : ""})
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setUsersPageIndex((i) => Math.max(0, i - 1))}
                    disabled={usersPageIndex === 0}
                    className="rounded p-2 text-[#64748B] hover:bg-white hover:text-[#1E293B] disabled:pointer-events-none disabled:opacity-40"
                    aria-label="Página anterior de usuários"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setUsersPageIndex((i) => Math.min(usersPageCount - 1, i + 1))}
                    disabled={usersPageIndex >= usersPageCount - 1}
                    className="rounded p-2 text-[#64748B] hover:bg-white hover:text-[#1E293B] disabled:pointer-events-none disabled:opacity-40"
                    aria-label="Próxima página de usuários"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {filteredUsers.length === 0 && (
                <p className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-center text-sm text-[#94A3B8]">
                  {userSearch.trim()
                    ? "Nenhum usuário encontrado para a busca."
                    : "Nenhum usuário cadastrado. Use \"Novo usuário\" ou \"Gestão de usuários\" para criar."}
                </p>
              )}
              {error && activeTab === "usuarios" && <p className="px-4 py-2 text-sm text-red-600">{error}</p>}
            </div>
            </div>
          )}
        </>
      )}

      <SideOver
        open={roleSideOverOpen}
        onClose={() => setRoleSideOverOpen(false)}
        title={editingRole ? `Cargo: ${editingRole.name}` : "Novo cargo"}
        width={680}
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
                <p className="mb-2 text-xs text-[#64748B]">Marque os acessos e ações que este cargo terá em cada módulo.</p>
                <div className="space-y-4 max-h-[420px] overflow-auto rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
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
        onClose={() => {
          setUserSideOverOpen(false);
          setError("");
          if (!editingUser) {
            setUserEmail("");
            setUserFullName("");
            setUserPhone("");
            setUserCpf("");
            setUserPassword("");
            setUserShowPassword(false);
            setUserSendCredentialsWhatsApp(false);
            setUserRoleId(roles[0]?.id ?? "");
            setUserQueueIds([]);
            setUserGroupAssignments([]);
            setUserAvatarUrl("");
            setWhatsProfilePhone(null);
          }
        }}
        title={userSideOverTab === "form" ? (editingUser ? `Editar: ${editingUser.email ?? "Usuário"}` : "Novo usuário") : "Gestão de usuários"}
        width={840}
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
              onClick={() => { setUserSideOverTab("form"); if (!editingUser) openNewUser(); }}
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
                          <div className="flex items-center gap-3">
                            {u.avatar_url ? (
                              <img
                                src={u.avatar_url}
                                alt={u.full_name || u.email || "Usuário"}
                                className="h-8 w-8 rounded-full object-cover ring-2 ring-[#E2E8F0]"
                              />
                            ) : (
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E2E8F0] text-xs font-semibold text-[#475569]">
                                {(u.full_name || u.email || "U").charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div className="font-medium text-[#1E293B]">
                                {u.full_name || u.email || "—"}
                              </div>
                              {u.full_name && u.email && (
                                <div className="text-xs text-[#64748B]">{u.email}</div>
                              )}
                            </div>
                          </div>
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
              {/* Cabeçalho com avatar e resumo do usuário */}
              <div className="flex items-center gap-3">
                {userAvatarUrl ? (
                  <img
                    src={userAvatarUrl}
                    alt={userFullName || userEmail || userPhone || "Usuário"}
                    className="h-10 w-10 rounded-full object-cover ring-2 ring-[#E2E8F0]"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E2E8F0] text-xs font-semibold text-[#475569]">
                    {(userFullName || userEmail || userPhone || "U").charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="text-sm">
                  <div className="font-medium text-[#1E293B]">
                    {userFullName || "Novo usuário"}
                  </div>
                  <div className="text-[#64748B]">
                    {userEmail || (userPhone ? `+${userPhone}` : "Preencha os dados abaixo")}
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[#334155]">Telefone WhatsApp</label>
                <input
                  type="tel"
                  autoComplete="off"
                  value={userPhone}
                  onChange={(e) => {
                    setUserPhone(e.target.value);
                    setWhatsProfilePhone(null);
                  }}
                  placeholder="Ex: 11999998888 (apenas números)"
                  className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                />
                <p className="mt-1 text-xs text-[#64748B]">
                  Para enviar login e senha por WhatsApp ao criar o usuário. Se o número existir no WhatsApp/CRM,
                  clique em &quot;Sincronizar com WhatsApp&quot; para buscar nome e foto.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!userPhone.trim()) {
                        setError("Informe o telefone antes de sincronizar.");
                        return;
                      }
                      fetchWhatsappProfile();
                    }}
                    disabled={userFetchingWhatsProfile}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-clicvend-orange/10 px-3 py-2 text-sm font-medium text-clicvend-orange hover:bg-clicvend-orange/20 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {userFetchingWhatsProfile ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    Sincronizar com WhatsApp
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#334155]">Nome completo</label>
                <input
                  type="text"
                  autoComplete="off"
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
                  autoComplete="off"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  disabled={!!editingUser}
                  className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange disabled:bg-[#F1F5F9] disabled:text-[#64748B]"
                />
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
                <p className="mb-2 text-xs text-[#64748B]">Usuário poderá ver e atender conversas destas caixas (atendimentos normais da fila).</p>
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
              <div>
                <label className="mb-1 block text-sm font-medium text-[#334155]">Responsabilidades em grupos</label>
                <p className="mb-2 text-xs text-[#64748B]">
                  Apenas usuários atribuídos a um grupo recebem as conversas desse grupo e podem interagir nele. Atendimentos normais (DM) continuam sendo distribuídos pelas caixas acima.
                </p>
                <div className="max-h-48 overflow-auto rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-2 space-y-3">
                  {channels.length === 0 && (
                    <p className="text-xs text-[#94A3B8]">Nenhum canal. Conecte um canal em Conexões para sincronizar grupos.</p>
                  )}
                  {channels.map((ch) => {
                    const groupsInChannel = channelGroups.filter((g) => g.channel_id === ch.id && !g.left_at);
                    if (groupsInChannel.length === 0) return null;
                    return (
                      <div key={ch.id}>
                        <div className="text-xs font-medium text-[#64748B] mb-1">{ch.name}</div>
                        <div className="space-y-1 pl-1">
                          {groupsInChannel.map((g) => {
                            const key = `${g.channel_id}:${g.jid}`;
                            const checked = userGroupAssignments.some((a) => a.channel_id === g.channel_id && a.group_jid === g.jid);
                            return (
                              <label key={key} className="flex items-center gap-2 text-sm text-[#334155]">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    setUserGroupAssignments((prev) =>
                                      e.target.checked
                                        ? [...prev, { channel_id: g.channel_id, group_jid: g.jid }]
                                        : prev.filter((a) => !(a.channel_id === g.channel_id && a.group_jid === g.jid))
                                    );
                                  }}
                                  className="rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
                                />
                                {g.name || g.jid}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {channels.length > 0 && channelGroups.filter((g) => !g.left_at).length === 0 && (
                    <p className="text-xs text-[#94A3B8]">Nenhum grupo sincronizado. Sincronize contatos nos canais para listar grupos.</p>
                  )}
                </div>
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
      <ConfirmDialog
        open={deleteSelectedRolesConfirmOpen}
        onClose={() => setDeleteSelectedRolesConfirmOpen(false)}
        onConfirm={async () => {
          setDeleteSelectedRolesConfirmOpen(false);
          await deleteSelectedRoles();
        }}
        title="Excluir cargos selecionados?"
        message={`Excluir ${selectedRoleIds.size} cargo(s) selecionado(s)? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        variant="danger"
      />

      <SideOver
        open={bulkQueueSideOverOpen}
        onClose={() => setBulkQueueSideOverOpen(false)}
        title="Atribuir filas em massa"
        width={620}
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-sm text-[#334155]">
            {selectedUserIds.size} usuário(s) selecionado(s). Escolha como aplicar as filas:
          </div>

          <div className="inline-flex w-fit overflow-hidden rounded-lg border border-[#E2E8F0] bg-white">
            <button
              type="button"
              onClick={() => setBulkQueueMode("add")}
              className={`px-3 py-2 text-sm font-medium ${bulkQueueMode === "add" ? "bg-clicvend-orange/10 text-clicvend-orange" : "text-[#64748B] hover:bg-[#F8FAFC]"}`}
            >
              Adicionar filas
            </button>
            <button
              type="button"
              onClick={() => setBulkQueueMode("replace")}
              className={`border-l border-[#E2E8F0] px-3 py-2 text-sm font-medium ${bulkQueueMode === "replace" ? "bg-clicvend-orange/10 text-clicvend-orange" : "text-[#64748B] hover:bg-[#F8FAFC]"}`}
            >
              Substituir filas
            </button>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#334155]">Filas</label>
            <div className="max-h-64 overflow-auto rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-2">
              {queues.length === 0 ? (
                <p className="text-xs text-[#94A3B8]">Nenhuma fila cadastrada.</p>
              ) : (
                <div className="space-y-1">
                  {queues.map((q) => (
                    <label key={q.id} className="flex items-center gap-2 rounded px-1 py-1.5 text-sm text-[#334155] hover:bg-white">
                      <input
                        type="checkbox"
                        checked={bulkQueueIds.includes(q.id)}
                        onChange={(e) => {
                          setBulkQueueIds((prev) =>
                            e.target.checked ? [...prev, q.id] : prev.filter((id) => id !== q.id)
                          );
                        }}
                        className="h-4 w-4 rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
                      />
                      {q.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setBulkQueueSideOverOpen(false)}
              className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={saveBulkQueueAssignment}
              disabled={bulkQueueSaving || queues.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
            >
              {bulkQueueSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Aplicar
            </button>
          </div>
        </div>
      </SideOver>
    </div>
  );
}
