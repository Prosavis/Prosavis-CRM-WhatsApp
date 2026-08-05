-- Facturación electrónica manual (UserConsole Agendados)
-- Tabla de historial por cliente + flag en crm_directory + bucket privado

ALTER TABLE public.crm_directory
  ADD COLUMN IF NOT EXISTS requests_electronic_invoice boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.crm_directory.requests_electronic_invoice IS
  'Cliente solicita / usa facturación electrónica (archivo manual en UserConsole)';

CREATE TABLE IF NOT EXISTS public.crm_electronic_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  directory_id uuid NOT NULL REFERENCES public.crm_directory(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  service_id text,
  document_type text NOT NULL CHECK (document_type IN ('CC', 'NIT')),
  document_number text NOT NULL,
  issued_at date NOT NULL,
  amount numeric(14, 2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'COP',
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_content_type text NOT NULL,
  file_size_bytes integer NOT NULL CHECK (file_size_bytes > 0),
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_electronic_invoices_directory_issued
  ON public.crm_electronic_invoices (directory_id, issued_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_electronic_invoices_provider
  ON public.crm_electronic_invoices (provider_id);

COMMENT ON TABLE public.crm_electronic_invoices IS
  'Historial de facturas electrónicas archivadas manualmente por el prosavist (fuera de Alegra)';

ALTER TABLE public.crm_electronic_invoices ENABLE ROW LEVEL SECURITY;
-- Sin policies para anon/authenticated: acceso solo vía service_role (Cloud Functions)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'electronic-invoices',
  'electronic-invoices',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Sin policies de storage para roles cliente: solo service_role
