"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { 
  Building2, 
  MapPin, 
  Link2, 
  Copy, 
  Share2, 
  User, 
  Briefcase,
  Check,
  Camera
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PERMISSIONS } from "@/lib/auth/permissions";

// Função utilitária para classes condicionais
function classNames(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}

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
  
  // Estados de dados
  const [company, setCompany] = useState<Company | null>(null);
  const [canView, setCanView] = useState<boolean | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [userAvatarUrl, setUserAvatarUrl] = useState<string>("");
  const [linkData, setLinkData] = useState<{ slug: string } | null>(null);
  
  // Estados de UI
  const [activeTab, setActiveTab] = useState<"geral" | "empresa">("geral");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [loading, setLoading] = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);

  // Efeitos de carga (mantidos do original)
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

  useEffect(() => {
    fetch("/api/company/links")
      .then((r) => r.json())
      .then((data) => {
        if (data?.slug) setLinkData({ slug: data.slug });
        else setLinkData(null);
      })
      .catch(() => setLinkData(null));
  }, []);

  // Handlers
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
          setAvatarError("Falha ao enviar a foto.");
          setAvatarUploading(false);
          return;
        }
        const { data } = supabase.storage.from("user-avatars").getPublicUrl(path);
        const publicUrl = data?.publicUrl;
        if (!publicUrl) {
          setAvatarError("Erro ao gerar link da foto.");
          setAvatarUploading(false);
          return;
        }
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ avatar_url: publicUrl })
          .eq("user_id", userId)
          .eq("company_id", company.id);
        if (updateError) {
          setAvatarError("Erro ao salvar no perfil.");
          setAvatarUploading(false);
          return;
        }
        setUserAvatarUrl(publicUrl);
      } catch {
        setAvatarError("Erro de rede.");
      } finally {
        setAvatarUploading(false);
      }
    },
    [company, userId]
  );

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

  // Renderização
  if (canView === false || (canView === null && slug) || loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
          <span className="text-sm text-slate-500">Carregando...</span>
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
        <p className="text-slate-500">Empresa não encontrada.</p>
        <Link href={base} className="text-sm font-medium text-slate-900 hover:underline">
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
    // Alteração 1: Removido items-center e justify-center, adicionado flex-col para ocupar altura natural
    <div className="flex flex-col h-[calc(100vh-6rem)] p-4 md:p-8">
      {/* Alteração 2: Aumentado max-w para 95% ou full com margem, removido max-w-7xl fixo */}
      <div className="flex h-full w-full max-w-[98%] mx-auto flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-900/5">
        
        {/* Header do Card */}
        <div className="relative shrink-0 bg-slate-50 px-8 pt-8 pb-4 border-b border-slate-100">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
            <div className="flex items-center gap-5">
              {/* Alteração 3: Cor do avatar mudada para tons de cinza/preto */}
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 text-3xl font-bold text-white shadow-lg shadow-slate-900/10">
                {company.name?.[0]?.toUpperCase() ?? "E"}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                  {company.nome_fantasia || company.name || company.razao_social}
                </h1>
                {company.cnpj && (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/10">
                      CNPJ: {cnpjFormatted}
                    </span>
                    {company.situacao_cadastral && (
                      <span className={classNames(
                        "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset",
                        company.situacao_cadastral === "ATIVA" 
                          ? "bg-green-50 text-green-700 ring-green-600/20" 
                          : "bg-red-50 text-red-700 ring-red-600/20"
                      )}>
                        {company.situacao_cadastral}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Abas de Navegação */}
          <div className="mt-8 flex gap-6 border-b border-slate-200">
            <button
              onClick={() => setActiveTab("geral")}
              className={classNames(
                "group relative pb-3 text-sm font-medium transition-colors",
                activeTab === "geral" 
                  ? "text-slate-900" // Alteração 4: Cor ativa cinza escuro
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              <span className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Visão Geral
              </span>
              {activeTab === "geral" && (
                <span className="absolute bottom-0 left-0 h-0.5 w-full bg-slate-900" /> // Alteração 5: Barra ativa cinza escuro
              )}
            </button>
            <button
              onClick={() => setActiveTab("empresa")}
              className={classNames(
                "group relative pb-3 text-sm font-medium transition-colors",
                activeTab === "empresa" 
                  ? "text-slate-900" // Alteração 6: Cor ativa cinza escuro
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              <span className="flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Detalhes da Empresa
              </span>
              {activeTab === "empresa" && (
                <span className="absolute bottom-0 left-0 h-0.5 w-full bg-slate-900" /> // Alteração 7: Barra ativa cinza escuro
              )}
            </button>
          </div>
        </div>

        {/* Conteúdo Scrollável */}
        <div className="flex-1 overflow-y-auto bg-slate-50/50 p-8">
          
          {/* Aba Geral */}
          {activeTab === "geral" && (
            <div className="grid gap-6 md:grid-cols-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
              
              {/* Card Usuário */}
              <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 transition-all hover:border-slate-300 hover:shadow-md"> {/* Alteração 8: hover border neutro */}
                <div className="absolute top-0 right-0 p-4 opacity-0 transition-opacity group-hover:opacity-100">
                  <div className="rounded-full bg-slate-100 p-2 text-slate-400">
                    <User className="h-4 w-4" />
                  </div>
                </div>
                
                <h3 className="text-base font-semibold text-slate-900">Seu Perfil</h3>
                <p className="text-sm text-slate-500 mb-6">Suas informações de acesso nesta empresa.</p>
                
                <div className="flex items-center gap-4">
                  <div className="relative h-16 w-16 shrink-0">
                    {userAvatarUrl ? (
                      <img
                        src={userAvatarUrl}
                        alt="Foto"
                        className="h-full w-full rounded-full object-cover ring-4 ring-slate-50"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center rounded-full bg-slate-100 text-xl font-bold text-slate-400 ring-4 ring-slate-50">
                        {(userEmail || "U").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <label className="absolute -bottom-1 -right-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200 transition-transform hover:scale-110 active:scale-95">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarChange}
                        disabled={avatarUploading}
                      />
                      {avatarUploading ? (
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" /> // Alteração 9: Spinner neutro
                      ) : (
                        <Camera className="h-3.5 w-3.5 text-slate-600" />
                      )}
                    </label>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900" title={userEmail}>
                      {userEmail}
                    </p>
                    <p className="text-xs text-slate-500">Usuário do sistema</p>
                    {avatarError && <p className="mt-1 text-xs text-red-500">{avatarError}</p>}
                  </div>
                </div>
              </div>

              {/* Card Link de Acesso */}
              {linkData && (
                <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 transition-all hover:border-slate-300 hover:shadow-md"> {/* Alteração 10: hover border neutro */}
                  <div className="absolute top-0 right-0 p-4 opacity-0 transition-opacity group-hover:opacity-100">
                    <div className="rounded-full bg-slate-100 p-2 text-slate-400">
                      <Link2 className="h-4 w-4" />
                    </div>
                  </div>

                  <h3 className="text-base font-semibold text-slate-900">Link de Acesso</h3>
                  <p className="text-sm text-slate-500 mb-6">Compartilhe o acesso ao painel.</p>

                  <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                    <p className="truncate font-mono text-sm text-clicvend-blue">{accessLink}</p>
                  </div>

                  <div className="mt-4 flex gap-3">
                    <button
                      onClick={copyLink}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 shadow-sm" // Alteração 11: Botão preto
                    >
                      {linkCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {linkCopied ? "Copiado" : "Copiar"}
                    </button>
                    <button
                      onClick={shareLink}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50" // Alteração 12: Botão secundário neutro
                    >
                      <Share2 className="h-4 w-4" />
                      Compartilhar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Aba Empresa */}
          {activeTab === "empresa" && (
            <div className="grid gap-6 md:grid-cols-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Detalhes Fiscais */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="rounded-lg bg-slate-100 p-2 text-slate-600"> {/* Alteração 13: Ícone neutro */}
                    <Building2 className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-slate-900">Dados Cadastrais</h3>
                </div>
                
                <dl className="space-y-4">
                  <div>
                    <dt className="text-xs font-medium text-slate-500 uppercase tracking-wider">Razão Social</dt>
                    <dd className="mt-1 text-sm font-medium text-slate-900">{company.razao_social || "—"}</dd>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <dt className="text-xs font-medium text-slate-500 uppercase tracking-wider">CNPJ</dt>
                      <dd className="mt-1 text-sm font-medium text-slate-900">{cnpjFormatted || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-500 uppercase tracking-wider">Porte</dt>
                      <dd className="mt-1 text-sm font-medium text-slate-900">{company.porte_empresa || "—"}</dd>
                    </div>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500 uppercase tracking-wider">Natureza Jurídica</dt>
                    <dd className="mt-1 text-sm font-medium text-slate-900">{company.natureza_juridica || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500 uppercase tracking-wider">Email Corporativo</dt>
                    <dd className="mt-1 text-sm font-medium text-slate-900">{company.email || "—"}</dd>
                  </div>
                </dl>
              </div>

              {/* Endereço */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="rounded-lg bg-slate-100 p-2 text-slate-600"> {/* Alteração 14: Ícone neutro */}
                    <MapPin className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-slate-900">Endereço</h3>
                </div>

                <dl className="space-y-4">
                  <div>
                    <dt className="text-xs font-medium text-slate-500 uppercase tracking-wider">Logradouro</dt>
                    <dd className="mt-1 text-sm font-medium text-slate-900">{enderecoCompleto || "—"}</dd>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <dt className="text-xs font-medium text-slate-500 uppercase tracking-wider">Bairro</dt>
                      <dd className="mt-1 text-sm font-medium text-slate-900">{company.bairro || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-500 uppercase tracking-wider">CEP</dt>
                      <dd className="mt-1 text-sm font-medium text-slate-900">{cepFormatted || "—"}</dd>
                    </div>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500 uppercase tracking-wider">Cidade / UF</dt>
                    <dd className="mt-1 text-sm font-medium text-slate-900">{cidadeUf || "—"}</dd>
                  </div>
                </dl>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
