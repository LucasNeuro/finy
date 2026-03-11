-- Create internal_notes table
CREATE TABLE IF NOT EXISTS public.internal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_internal_notes_conversation_created ON public.internal_notes(conversation_id, created_at);

-- RLS for internal_notes
ALTER TABLE public.internal_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "internal_notes_select_by_company" ON public.internal_notes FOR SELECT
  USING (conversation_id IN (
    SELECT id FROM public.conversations WHERE company_id IN (
      SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "internal_notes_insert_by_company" ON public.internal_notes FOR INSERT
  WITH CHECK (conversation_id IN (
    SELECT id FROM public.conversations WHERE company_id IN (
      SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "internal_notes_update_by_author" ON public.internal_notes FOR UPDATE
  USING (author_id = auth.uid());

CREATE POLICY "internal_notes_delete_by_author" ON public.internal_notes FOR DELETE
  USING (author_id = auth.uid());
