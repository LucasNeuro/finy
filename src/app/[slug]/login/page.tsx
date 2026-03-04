import { redirect } from "next/navigation";

/**
 * Redireciona /[slug]/login para /login?returnUrl=/{slug}
 * para que o usuário caia na página de login e, após entrar, seja enviado à empresa correta.
 */
export default function SlugLoginPage({
  params,
}: {
  params: { slug: string };
}) {
  const slug = typeof params?.slug === "string" ? params.slug.trim() : "";
  if (!slug) redirect("/login");
  redirect(`/login?returnUrl=/${encodeURIComponent(slug)}`);
}
