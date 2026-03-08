-- Foto do grupo (URL) para exibir na lista de contatos/grupos e nos detalhes, como nos contatos.
-- Preenchida ao sincronizar contatos (sync-contacts) via getChatDetails com JID do grupo.
ALTER TABLE public.channel_groups
  ADD COLUMN IF NOT EXISTS avatar_url text;

COMMENT ON COLUMN public.channel_groups.avatar_url IS 'URL da foto do grupo (ex.: da UAZAPI) para exibir na lista e nos detalhes, como nos contatos.';
