-- Foto do contato (URL) para exibir na lista de conversas (estilo WhatsApp Web).
-- Pode ser preenchida ao sincronizar contatos ou ao abrir detalhes do chat (UAZAPI).
ALTER TABLE public.channel_contacts
  ADD COLUMN IF NOT EXISTS avatar_url text;

COMMENT ON COLUMN public.channel_contacts.avatar_url IS 'URL da foto do contato (ex.: da UAZAPI ou Supabase Storage) para exibir na lista de conversas.';
