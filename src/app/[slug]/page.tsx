import { redirect } from "next/navigation";

export default function SlugHomePage({
  params,
}: {
  params: { slug: string };
}) {
  const { slug } = params;
  redirect(`/${slug}/conversas`);
}
