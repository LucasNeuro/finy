"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Building2, MapPin, Pencil, Link2, Copy, Share2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PERMISSIONS } from "@/lib/auth/permissions";

type Company = {
  id: string;
  name: string;
  slug: string;
  cnpj?: string;
  razao_social?: string;
  nome_fantasia?: string;
  situacao_cadastral?: string;
  porte_empresa?: string;
  natureza_juridica?: string;
  email?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cep?: string;
  uf?: string;
  municipio?: string;
};

export default function PerfilPage() {
  const params = useParams();
  const router = useRouter();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const base = slug ? `/${slug}` : "";
  const [company, setCompany] = useState<Company | null>(null);
  const [canView, setCanView] = useState<boolean | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [userAvatarUrl, setUserAvatarUrl] = useState<string>("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [loading, setLoading] = useState(true);
  const [linkData, setLinkData] = useState<{ slug: string } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setUserEmail(user.email);
      if (user?.id) setUserId(user.id);
    });
  }, []);

  useEffect(() => {
    if (!slug) {
      setCanView(false);
      return;
    }
    fetch("/api/auth/permissions", {
      credentials: "include",
      headers: { "X-Company-Slug": slug },
    })
      .then((r) => r.json())
      .then((data) => {
        const perms = Array.isArray(data?.permissions) ? data.permissions : [];
        setCanView(perms.includes(PERMISSIONS.profile.view));
      })
      .catch(() => setCanView(false));
  }, [slug]);

  useEffect(() => {
    if (canView === false && base) {
      router.replace(`${base}/conversas`);
    }
  }, [canView, base, router]);

  useEffect(() => {
    fetch("/api/company")
      .then((r) => r.json())
      .then((data) => {
        if (data?.id) setCompany(data);
        else setCompany(null);
      })
      .catch(() => setCompany(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!company || !userId) return;
    const supabase = createClient();
    void supabase
      .from("profiles")
      .select("avatar_url")
      .eq("user_id", userId)
      .eq("company_id", company.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data && typeof data.avatar_url === "string") {
          setUserAvatarUrl(data.avatar_url);
        }
      });
  }, [company, userId]);

  const handleAvatarChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !company || !userId) return;
      setAvatarError("");
      setAvatarUploading(true);
      try {
        const supabase = createClient();
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${company.id}/${userId}-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("user-avatars")
          .upload(path, file, { upsert: true });
        if (uploadError) {
          setAvatarError("Falha ao enviar a foto. Tente novamente.");
          setAvatarUploading(false);
          return;
        }
        const { data } = supabase.storage.from("user-avatars").getPublicUrl(path);
        const publicUrl = data?.publicUrl;
        if (!publicUrl) {
          setAvatarError("Foto enviada, mas não foi possível gerar o link público.");
          setAvatarUploading(false);
          return;
        }
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ avatar_url: publicUrl })
          .eq("user_id", userId)
          .eq("company_id", company.id);
        if (updateError) {
          setAvatarError("Foto enviada, mas não foi possível salvar no perfil.");
          setAvatarUploading(false);
          return;
        }
        setUserAvatarUrl(publicUrl);
      } catch {
        setAvatarError("Erro de rede ao enviar a foto.");
      } finally {
        setAvatarUploading(false);
      }
    },
    [company, userId]
  );

  useEffect(() => {
    fetch("/api/company/links")
      .then((r) => r.json())
      .then((data) => {
        if (data?.slug) setLinkData({ slug: data.slug });
        else setLinkData(null);
      })
      .catch(() => setLinkData(null));
  }, []);

  const accessLink = linkData && typeof window !== "undefined" ? `${window.location.origin}/${linkData.slug}` : linkData ? `/${linkData.slug}` : "";

  const copyLink = () => {
    if (!accessLink) return;
    navigator.clipboard.writeText(accessLink).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  const shareLink = async () => {
    if (!accessLink) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Link de acesso",
          text: `Acesse o painel: ${accessLink}`,
          url: accessLink,
        });
      } catch {
        copyLink();
      }
    } else {
      copyLink();
    }
  };

  if (canView === false || (canView === null && slug)) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-clicvend-orange border-t-transparent" />
          <span className="text-sm text-[#64748B]">{canView === false ? "Redirecionando…" : "Carregando…"}</span>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-clicvend-orange border-t-transparent" />
          <span className="text-sm text-[#64748B]">Carregando…</span>
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-4">
        <p className="text-[#64748B]">Não foi possível carregar os dados da empresa.</p>
        <Link href={base} className="text-sm font-medium text-clicvend-blue hover:underline">
          Voltar ao painel
        </Link>
      </div>
    );
  }

  const cnpjFormatted = company.cnpj?.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  const cepFormatted = company.cep?.replace(/(\d{5})(\d{3})/, "$1-$2");
  const enderecoCompleto = [company.logradouro, company.numero, company.complemento]
    .filter(Boolean)
    .join(", ");
  const cidadeUf = [company.municipio, company.uf].filter(Boolean).join(" - ");

  return (
    <div className="space-y-6 p-6">
      {/* Banner laranja - resumo do perfil */}
      <div className="rounded-2xl bg-gradient-to-br from-clicvend-orange to-clicvend-orange-dark p-6 text-white shadow-lg shadow-clicvend-orange/25">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/20 text-2xl font-bold">
              {company.name?.[0] ?? "E"}
            </div>
            <div>
              <h1 className="text-xl font-bold">{company.razao_social || company.name}</h1>
              <p className="text-sm opacity-90">{userEmail || company.email || "—"}</p>
              {company.nome_fantasia && (
                <p className="text-sm opacity-90">Nome Fantasia: {company.nome_fantasia}</p>
              )}
            </div>
          </div>
          <Link
            href={`${base}/perfil/editar`}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-white/50 bg-white/10 px-4 py-2.5 font-semibold transition-colors hover:bg-white/20"
          >
            <Pencil className="h-4 w-4" />
            Editar Perfil
          </Link>
        </div>
      </div>

      {/* Seu usuário */}
      <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-[#1E293B]">Seu usuário</h2>
        <p className="mt-1 text-sm text-[#64748B]">
          Foto e e-mail usados para identificar você no atendimento.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            {userAvatarUrl ? (
              <img
                src={userAvatarUrl}
                alt="Foto do usuário"
                className="h-12 w-12 rounded-full object-cover ring-2 ring-[#E2E8F0]"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E2E8F0] text-sm font-semibold text-[#475569]">
                {(userEmail || company.email || "U").charAt(0).toUpperCase()}
              </div>
            )}
            <div className="text-sm">
              <div className="font-medium text-[#1E293B]">
                {company.nome_fantasia || company.name}
              </div>
              <div className="text-[#64748B]">{userEmail || company.email || "—"}</div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#334155] hover:bg-[#F8FAFC]">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
                disabled={avatarUploading}
              />
              {avatarUploading ? "Enviando foto…" : "Alterar foto"}
            </label>
            {avatarError && <p className="text-xs text-red-600">{avatarError}</p>}
          </div>
        </div>
      </div>

      {/* Link de acesso */}
      {linkData && (
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-bold text-[#1E293B]">
            <Link2 className="h-5 w-5 text-clicvend-orange" />
            Link de acesso
          </h2>
          <p className="mt-1 text-sm text-[#64748B]">URL da sua empresa</p>
          <p className="mt-1 font-mono text-sm font-medium text-clicvend-blue break-all">{accessLink}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] px-4 py-2.5 text-sm font-medium text-[#64748B] transition-colors hover:border-[#CBD5E1] hover:bg-[#F8FAFC]"
            >
              <Copy className="h-4 w-4" />
              {linkCopied ? "Copiado!" : "Copiar"}
            </button>
            <button
              type="button"
              onClick={shareLink}
              className="inline-flex items-center gap-2 rounded-xl bg-clicvend-orange px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-clicvend-orange-dark"
            >
              <Share2 className="h-4 w-4" />
              Compartilhar
            </button>
          </div>
        </div>
      )}

      {/* Cards de dados */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Dados da Empresa */}
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
          <h2 className="flex items-center gap-2 text-lg font-bold text-[#1E293B]">
            <Building2 className="h-5 w-5 text-clicvend-orange" />
            Dados da Empresa
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            {company.cnpj && (
              <div>
                <dt className="text-[#64748B]">CNPJ</dt>
                <dd className="font-medium">{cnpjFormatted}</dd>
              </div>
            )}
            {company.razao_social && (
              <div>
                <dt className="text-[#64748B]">Razão Social</dt>
                <dd className="font-medium">{company.razao_social}</dd>
              </div>
            )}
            {company.nome_fantasia && (
              <div>
                <dt className="text-[#64748B]">Nome Fantasia</dt>
                <dd className="font-medium">{company.nome_fantasia}</dd>
              </div>
            )}
            {company.situacao_cadastral && (
              <div>
                <dt className="text-[#64748B]">Situação Cadastral</dt>
                <dd>
                  <span className="inline-flex rounded-full bg-[#FEE2E2] px-2.5 py-0.5 text-xs font-medium text-[#B91C1C]">
                    {company.situacao_cadastral}
                  </span>
                </dd>
              </div>
            )}
            {company.porte_empresa && (
              <div>
                <dt className="text-[#64748B]">Porte da Empresa</dt>
                <dd className="font-medium">{company.porte_empresa}</dd>
              </div>
            )}
            {company.natureza_juridica && (
              <div>
                <dt className="text-[#64748B]">Natureza Jurídica</dt>
                <dd className="font-medium">{company.natureza_juridica}</dd>
              </div>
            )}
            {!company.cnpj && !company.razao_social && !company.nome_fantasia && (
              <p className="text-[#94A3B8]">Nenhum dado cadastral preenchido.</p>
            )}
          </dl>
        </div>

        {/* Endereço */}
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
          <h2 className="flex items-center gap-2 text-lg font-bold text-[#1E293B]">
            <MapPin className="h-5 w-5 text-clicvend-orange" />
            Endereço
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            {company.cep && (
              <div>
                <dt className="text-[#64748B]">CEP</dt>
                <dd className="font-medium">{cepFormatted}</dd>
              </div>
            )}
            {enderecoCompleto && (
              <div>
                <dt className="text-[#64748B]">Logradouro</dt>
                <dd className="font-medium">{enderecoCompleto}</dd>
              </div>
            )}
            {company.bairro && (
              <div>
                <dt className="text-[#64748B]">Bairro</dt>
                <dd className="font-medium">{company.bairro}</dd>
              </div>
            )}
            {cidadeUf && (
              <div>
                <dt className="text-[#64748B]">Cidade/UF</dt>
                <dd className="font-medium">{cidadeUf}</dd>
              </div>
            )}
            {!company.cep && !enderecoCompleto && !company.bairro && !cidadeUf && (
              <p className="text-[#94A3B8]">Nenhum endereço cadastrado.</p>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
}
