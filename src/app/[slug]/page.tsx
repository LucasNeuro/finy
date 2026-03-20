import { redirect } from "next/navigation";

export default async function SlugHomePage({
  params,
}: {
  params: Promise<{ slug: string }> | { slug: string };
}) {
  const resolved = await Promise.resolve(params);
  const slug = resolved?.slug ?? "";
  if (!slug) redirect("/login");
  redirect(`/${slug}/conversas`);
}
