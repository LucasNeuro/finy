-- Messages: support media types (image, audio, video, document, ptt, sticker) like WhatsApp/UAZAPI.
-- content: kept for text and for caption/fallback; message_type: text | image | video | audio | ptt | document | sticker.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text', 'image', 'video', 'audio', 'ptt', 'document', 'sticker'));

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS media_url text;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS caption text;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS file_name text;

COMMENT ON COLUMN public.messages.message_type IS 'UAZAPI-like: text, image, video, audio, ptt, document, sticker';
COMMENT ON COLUMN public.messages.media_url IS 'URL or storage path for image/audio/video/document';
COMMENT ON COLUMN public.messages.caption IS 'Caption for media messages';
COMMENT ON COLUMN public.messages.file_name IS 'Original file name for documents';
