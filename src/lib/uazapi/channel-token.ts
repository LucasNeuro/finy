import { createClient } from "@/lib/supabase/server";

/**
 * Obtém o token UAZAPI de um canal da empresa.
 * Retorna null se o canal não existir ou não pertencer à empresa.
 */
export async function getChannelToken(
  channelId: string,
  companyId: string
): Promise<{ token: string; channel: { id: string; name: string; uazapi_instance_id: string } } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channels")
    .select("id, name, uazapi_instance_id, uazapi_token_encrypted")
    .eq("id", channelId)
    .eq("company_id", companyId)
    .single();

  if (error || !data?.uazapi_token_encrypted) return null;
  return {
    token: data.uazapi_token_encrypted,
    channel: {
      id: data.id,
      name: data.name,
      uazapi_instance_id: data.uazapi_instance_id,
    },
  };
}
