import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { NextResponse } from "next/server";

/**
 * GET /api/contacts/avatar?url=ENCODED_IMAGE_URL
 * Proxy para imagens de avatar (ex.: UAZAPI/WhatsApp) que falham por CORS/referrer no browser.
 * Busca a imagem no servidor e devolve com cache para as fotos carregarem na lista e nos detalhes.
 */
export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return new Response(null, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("url");
  if (!raw || typeof raw !== "string") {
    return new Response(null, { status: 400 });
  }

  let url: URL;
  try {
    url = new URL(decodeURIComponent(raw.trim()));
  } catch {
    return new Response(null, { status: 400 });
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return new Response(null, { status: 400 });
  }

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "image/*",
        ...(url.hostname.includes("whatsapp.net") && {
          Referer: "https://www.whatsapp.com/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        }),
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return new Response(null, { status: res.status === 404 ? 404 : 502 });
    }

    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return new Response(null, { status: 400 });
    }

    const blob = await res.blob();
    return new Response(blob, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=86400, stale-while-revalidate=3600",
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
