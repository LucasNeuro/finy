import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCompanyIdFromCookie } from "@/lib/auth/get-company";
import { NextResponse } from "next/server";

const BUCKET = "channel-profile-images";
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export async function POST(request: Request) {
  const companyId = await getCompanyIdFromCookie();
  if (!companyId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Arquivo muito grande. Máximo 5MB." }, { status: 400 });
  }

  const type = file.type?.toLowerCase();
  if (!type || !ALLOWED_TYPES.includes(type)) {
    return NextResponse.json({ error: "Tipo não permitido. Use JPEG, PNG, GIF ou WebP." }, { status: 400 });
  }

  const ext = type.split("/")[1] ?? "jpg";
  const path = `${companyId}/${crypto.randomUUID()}.${ext}`;

  const supabase = createServiceRoleClient();
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some((b) => b.name === BUCKET)) {
      await supabase.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: "5MB",
        allowedMimeTypes: ALLOWED_TYPES,
      });
    }
  } catch {
    // Bucket pode já existir
  }

  const { data, error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: type,
    upsert: false,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
  return NextResponse.json({ url: urlData.publicUrl });
}
