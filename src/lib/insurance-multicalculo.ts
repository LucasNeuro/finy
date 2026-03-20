export type QuoteStatus = "draft" | "calculated" | "proposal_sent" | "archived";

export type InsuredData = {
  cpfCnpj: string;
  nome: string;
  cep: string;
  email?: string;
  telefone?: string;
};

export type DriverData = {
  hasMainDriver: boolean;
  relationToInsured?: string;
  cpf?: string;
  nome?: string;
  birthDate?: string;
  gender?: string;
  maritalStatus?: string;
  licenseYears?: number | null;
};

export type VehicleData = {
  placa?: string;
  chassi?: string;
  anoModelo?: string;
  zeroKm?: boolean;
  marca?: string;
  modelo?: string;
  combustivel?: string;
  fipeCode?: string;
  cepPernoite?: string;
};

export type QuestionnaireData = {
  garagemResidencia?: string;
  garagemTrabalho?: string;
  tipoUso?: string;
  kmMensal?: number | null;
  distanciaTrabalhoKm?: number | null;
  menores26?: string;
  quantidadeVeiculos?: number | null;
};

export type PolicyData = {
  tipoSeguro: "novo" | "renovacao";
  vigenciaInicial?: string;
  vigenciaFinal?: string;
  comissaoPercent?: number | null;
  bancoRelacionamento?: string;
  seguradoraAnterior?: string;
  bonus?: string;
  codigoIdentificacao?: string;
};

export type CoverageData = {
  tipoCobertura?: string;
  franquia?: string;
  fatorAjustePercent?: number | null;
  valorReferencia?: number | null;
  rcfMateriais?: number | null;
  rcfCorporais?: number | null;
  rcfMorais?: number | null;
  appMorte?: number | null;
  appInvalidez?: number | null;
};

export type ServicesData = {
  assistencia?: string;
  vidros?: string;
  carroReserva?: string;
  arCondicionado?: boolean;
  garantiaZeroKm?: string;
  despesasExtras?: string;
};

export type QuotePayload = {
  title?: string;
  status?: QuoteStatus;
  insured_data: InsuredData;
  driver_data: DriverData;
  vehicle_data: VehicleData;
  questionnaire_data: QuestionnaireData;
  policy_data: PolicyData;
  coverage_data: CoverageData;
  services_data: ServicesData;
  quotes_result?: unknown[];
  selected_quote?: unknown;
  notes?: string;
};

type ValidationResult = { ok: true } | { ok: false; errors: string[] };

function cleanDigits(value: string): string {
  return String(value || "").replace(/\D/g, "");
}

export function validateQuotePayload(payload: Partial<QuotePayload>, strict: boolean): ValidationResult {
  const errors: string[] = [];
  const insured = payload.insured_data ?? ({} as InsuredData);
  const policy = payload.policy_data ?? ({} as PolicyData);

  if (strict || insured.cpfCnpj) {
    const doc = cleanDigits(insured.cpfCnpj || "");
    if (![11, 14].includes(doc.length)) errors.push("CPF/CNPJ inválido.");
  }
  if (strict && !String(insured.nome || "").trim()) errors.push("Nome do segurado é obrigatório.");
  if (strict || insured.cep) {
    const cep = cleanDigits(insured.cep || "");
    if (cep.length !== 8) errors.push("CEP inválido.");
  }
  if (insured.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(insured.email)) errors.push("E-mail inválido.");
  if (strict && !policy.tipoSeguro) errors.push("Tipo de seguro é obrigatório.");
  if (policy.comissaoPercent != null && (policy.comissaoPercent < 0 || policy.comissaoPercent > 100)) {
    errors.push("Comissão deve estar entre 0 e 100.");
  }

  if (!strict && errors.length > 0) {
    // Em modo draft toleramos ausência; apenas bloqueamos valores muito inválidos.
    const hardErrors = errors.filter((e) => !e.includes("obrigatório"));
    if (hardErrors.length > 0) return { ok: false, errors: hardErrors };
    return { ok: true };
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

/** Referência em BRL para multiplicar pelos fatores das seguradoras (mock). */
export function computeReferencePrice(payload: QuotePayload): number {
  const base = 1100;
  const factorAge = payload.driver_data.licenseYears && payload.driver_data.licenseYears < 2 ? 1.15 : 1;
  const factorZeroKm = payload.vehicle_data.zeroKm ? 1.08 : 1;
  const factorTipo = payload.policy_data.tipoSeguro === "renovacao" ? 0.95 : 1;
  return Math.round(base * factorAge * factorZeroKm * factorTipo);
}

export type MulticalculoQuoteRow = {
  partner_id?: string;
  slug?: string;
  insurer: string;
  price: number;
  coverages: string;
  discount: string;
  logo_url?: string | null;
};

export const INSURANCE_PARTNER_LOGOS_BUCKET = "insurance-partner-logos";

/** Extensões tentadas no Storage (pasta por slug ou arquivo na raiz). */
export const INSURANCE_PARTNER_LOGO_EXTENSIONS = ["png", "webp", "svg", "jpg", "jpeg"] as const;

/**
 * Nomes reais dos ficheiros na raiz do bucket (quando não seguem `{slug}.png`).
 * Ordem: mais específico primeiro. Atualize aqui ou use `logo_storage_path` na tabela `insurance_partner_catalog`.
 */
export const INSURANCE_LOGO_FILE_BY_SLUG: Record<string, readonly string[]> = {
  "porto-seguro": ["porto.png", "porto-seguro.png", "Porto Seguro.png"],
  "bradesco-seguros": ["Bradesco Seguros.png", "bradesco-seguros.png", "bradesco.png"],
  "itau-seguros": ["itau.png", "itau-seguros.png", "Itaú Seguros.png"],
  "sulamerica": ["sulamerica.png", "SulAmérica.png", "SulAmerica.png"],
  "allianz-seguros": ["Allianz Seguros.png", "allianz-seguros.png", "allianz.png"],
  "tokio-marine": ["tokio.jpg", "tokio.png", "tokio-marine.png", "Tokio Marine.png"],
  mapfre: ["mapfre.png", "Mapfre.png"],
  "liberty-seguros": ["Liberty Seguros.jpg", "liberty-seguros.png", "Liberty Seguros.png"],
  "hdi-seguros": ["hdiseguros.png", "hdi-seguros.png", "HDI Seguros.png"],
  "zurich-brasil": ["zurich.jpg", "zurich.png", "zurich-brasil.png", "Zurich Brasil.png"],
  /** No bucket do cliente o ficheiro aparece como sonpo.png */
  "sompo-seguros": ["sonpo.png", "sompo.png", "sompo-seguros.png", "Sompo Seguros.png"],
  "chubb-seguros": ["chubblogo.png", "chubb-seguros.png", "Chubb Seguros.png"],
  "maritima-seguros": ["maritima.png", "maritima-seguros.png", "Marítima Seguros.png"],
};

/** Caminhos relativos ao bucket: aliases conhecidos, depois `{slug}/logo.*` e `{slug}.*` na raiz. */
export function storagePathsToTryForPartnerSlug(slug: string): string[] {
  const s = slug.trim();
  if (!s) return [];
  const paths: string[] = [];
  const aliases = INSURANCE_LOGO_FILE_BY_SLUG[s];
  if (aliases) {
    paths.push(...aliases);
  }
  for (const ext of INSURANCE_PARTNER_LOGO_EXTENSIONS) {
    paths.push(`${s}/logo.${ext}`, `${s}.${ext}`);
  }
  return [...new Set(paths)];
}

/** Monta URL pública do Storage (bucket `insurance-partner-logos`). Path ex.: `porto-seguro/logo.png` */
export function publicInsurancePartnerLogoUrl(path: string | null | undefined): string | null {
  const p = String(path ?? "").trim();
  if (!p) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) return null;
  const clean = p.replace(/^\//, "");
  return `${base}/storage/v1/object/public/${INSURANCE_PARTNER_LOGOS_BUCKET}/${clean.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Se não houver `logo_storage_path` no banco, assume convenção `{slug}/logo.png` no bucket
 * (você pode usar .webp/.svg — o front tenta variações em cascata).
 */
export function resolvePartnerLogoStoragePath(slug: string, logo_storage_path: string | null | undefined): string {
  const custom = String(logo_storage_path ?? "").trim();
  if (custom) return custom;
  const s = slug.trim();
  const aliases = INSURANCE_LOGO_FILE_BY_SLUG[s];
  if (aliases?.[0]) return aliases[0];
  return `${s}/logo.png`;
}

/** Várias formas de URL para o mesmo path (evita falha por encoding no CDN). */
export function publicInsurancePartnerLogoUrlCandidates(path: string | null | undefined): string[] {
  const encoded = publicInsurancePartnerLogoUrl(path);
  if (!encoded) return [];
  const clean = String(path ?? "").trim().replace(/^\//, "");
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base || !clean) return [encoded];
  if (/^[a-zA-Z0-9/_.-]+$/.test(clean)) {
    const raw = `${base}/storage/v1/object/public/${INSURANCE_PARTNER_LOGOS_BUCKET}/${clean}`;
    return raw === encoded ? [encoded] : [encoded, raw];
  }
  return [encoded];
}

/** Garante logo_url em cada cotação quando houver slug (servidor tem sempre NEXT_PUBLIC_SUPABASE_URL). */
export function enrichMulticalculoQuotesResult(quotesResult: unknown): unknown {
  if (!Array.isArray(quotesResult)) return quotesResult;
  return quotesResult.map((q) => {
    if (!q || typeof q !== "object") return q;
    const row = q as Record<string, unknown>;
    const existing = typeof row.logo_url === "string" ? row.logo_url.trim() : "";
    if (existing) return row;
    const slug = typeof row.slug === "string" ? row.slug.trim() : "";
    if (!slug) return row;
    const storagePath = resolvePartnerLogoStoragePath(slug, null);
    const url = publicInsurancePartnerLogoUrl(storagePath);
    return { ...row, logo_url: url ?? null };
  });
}

export function enrichInsuranceMulticalculoQuoteRow(row: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!row) return row;
  return {
    ...row,
    quotes_result: enrichMulticalculoQuotesResult(row.quotes_result),
  };
}

/** Fallback quando o catálogo no banco não estiver disponível. */
export function buildMockQuotes(payload: QuotePayload): MulticalculoQuoteRow[] {
  const reference = computeReferencePrice(payload);

  return [
    {
      insurer: "Seguradora Alpha",
      price: Math.round(reference * 1.02),
      coverages: "Compreensiva, APP, Vidros, Assistência 24h",
      discount: "10%",
      logo_url: null,
    },
    {
      insurer: "Seguradora Beta",
      price: Math.round(reference * 0.96),
      coverages: "Compreensiva, RCF, Carro Reserva",
      discount: "6%",
      logo_url: null,
    },
    {
      insurer: "Seguradora Gamma",
      price: Math.round(reference * 1.08),
      coverages: "Compreensiva, APP, RCF, Despesas Extras",
      discount: "12%",
      logo_url: null,
    },
  ];
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

type CatalogInsurerRow = {
  id: string;
  name: string;
  slug: string;
  logo_storage_path: string | null;
  insurance_partner_mock_simulation: {
    price_factor: number;
    coverages_text: string;
    discount_label: string;
  } | null;
};

/** Até `max` cotações a partir do catálogo + perfil mock (seguradoras). */
export function buildQuotesFromCatalog(
  rows: CatalogInsurerRow[],
  referencePrice: number,
  max = 6,
): MulticalculoQuoteRow[] {
  const withMock = rows.filter((r) => r.insurance_partner_mock_simulation);
  if (withMock.length === 0) return [];
  shuffleInPlace(withMock);
  shuffleInPlace(withMock);
  const picked = withMock.slice(0, Math.min(max, withMock.length));
  return picked.map((r) => {
    const m = r.insurance_partner_mock_simulation!;
    const jitter = 0.97 + Math.random() * 0.06;
    const price = Math.round(referencePrice * Number(m.price_factor) * jitter);
    const storagePath = resolvePartnerLogoStoragePath(r.slug, r.logo_storage_path);
    return {
      partner_id: r.id,
      slug: r.slug,
      insurer: r.name,
      price,
      coverages: m.coverages_text,
      discount: m.discount_label,
      logo_url: publicInsurancePartnerLogoUrl(storagePath),
    };
  });
}
