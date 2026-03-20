import { redirect } from "next/navigation";

/**
 * Redireciona /[slug]/login para /login?returnUrl=/{slug}
 * para que o usuário caia na página de login e, após entrar, seja enviado à empresa correta.
 */
export default async function SlugLoginPage({
  params,
}: {
  params: Promise<{ slug: string }> | { slug: string };
}) {
  const resolved = await Promise.resolve(params);
  const slug = typeof resolved?.slug === "string" ? resolved.slug.trim() : "";
  if (!slug) redirect("/login");
  redirect(`/login?returnUrl=/${encodeURIComponent(slug)}`);
}
