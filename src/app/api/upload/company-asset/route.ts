import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { NextResponse } from "next/server";

/**
 * Bucket único por empresa: paths {companyId}/channels/, {companyId}/groups/, etc.
 * Uso: logos de conexões, imagens de grupos, etc.
 */
const BUCKET = "company-assets";
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES: Record<string, string[]> = {
  "channel-logo": ["image/jpeg", "image/png", "image/gif", "image/webp"],
  "group-image": ["image/jpeg", "image/png", "image/gif", "image/webp"],
  "broadcast-image": ["image/jpeg", "image/png", "image/gif", "image/webp"],
};
const DEFAULT_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const type = (formData.get("type") as string)?.trim() || "group-image";
  const allowedTypes = ["channel-logo", "group-image", "broadcast-image"];
  const effectiveType = allowedTypes.includes(type) ? type : "group-image";

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Arquivo muito grande. Máximo 5MB." }, { status: 400 });
  }

  const allowed = ALLOWED_TYPES[effectiveType] ?? DEFAULT_TYPES;
  const fileType = file.type?.toLowerCase();
  if (!fileType || !allowed.includes(fileType)) {
    return NextResponse.json({ error: "Tipo não permitido. Use JPEG, PNG, GIF ou WebP." }, { status: 400 });
  }

  const ext = fileType.split("/")[1] ?? "jpg";
  const path = `${companyId}/${effectiveType}/${crypto.randomUUID()}.${ext}`;

  const supabase = createServiceRoleClient();
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some((b) => b.name === BUCKET)) {
      await supabase.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: "5MB",
        allowedMimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
      });
    }
  } catch {
    // Bucket pode já existir
  }

  const { data, error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: fileType,
    upsert: false,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
  return NextResponse.json({ url: urlData.publicUrl });
}
