import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const RESERVED_SLUGS = new Set([
  "login",
  "cadastro",
  "recuperar-senha",
  "sem-empresa",
  "auth",
  "api",
  "_next",
  "favicon.ico",
  "static",
  "onboarding",
]);

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;
  const segments = pathname.split("/").filter(Boolean);
  const firstSegment = segments[0];

  // Rotas de tenant: /[slug]/...
  if (firstSegment && !RESERVED_SLUGS.has(firstSegment) && !pathname.startsWith("/_next") && !pathname.startsWith("/api")) {
    if (!user) {
      const url = new URL("/login", request.url);
      url.searchParams.set("returnUrl", pathname);
      return NextResponse.redirect(url);
    }

    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("slug", firstSegment)
      .single();

    if (!company) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    response.cookies.set("clicvend_company_id", company.id, { path: "/" });
    response.cookies.set("clicvend_slug", firstSegment, { path: "/" });
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
