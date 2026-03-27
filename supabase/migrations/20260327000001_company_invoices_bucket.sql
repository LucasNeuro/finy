-- Bucket para armazenar PDFs dos boletos emitidos via Cora.
-- Privado; o backend gera signed URLs para o Super Admin.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
  'company-invoices',
  'company-invoices',
  false,
  10485760 -- 10 MB por arquivo
)
ON CONFLICT (id) DO NOTHING;
