-- Modo de facturación por empresa y citas que cubre cada factura archivada.
-- Una cita solo puede estar en una factura. Borrar la factura devuelve la cita a la cola.

ALTER TABLE public.crm_directory
  ADD COLUMN IF NOT EXISTS billing_invoice_mode text;

ALTER TABLE public.crm_directory
  DROP CONSTRAINT IF EXISTS crm_directory_billing_invoice_mode_check;

ALTER TABLE public.crm_directory
  ADD CONSTRAINT crm_directory_billing_invoice_mode_check
  CHECK (
    billing_invoice_mode IS NULL
    OR billing_invoice_mode IN ('per_service', 'package')
  );

COMMENT ON COLUMN public.crm_directory.billing_invoice_mode IS
  'Modo de facturación de la empresa: per_service (una cita, una factura) o package (varias citas, una factura). Nulo hasta que se elige.';

CREATE TABLE IF NOT EXISTS public.crm_electronic_invoice_appointments (
  appointment_id text PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES public.crm_electronic_invoices(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_eia_invoice
  ON public.crm_electronic_invoice_appointments (invoice_id);

COMMENT ON TABLE public.crm_electronic_invoice_appointments IS
  'Citas cubiertas por una factura electrónica archivada. appointment_id es único.';

ALTER TABLE public.crm_electronic_invoice_appointments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.crm_electronic_invoice_appointments FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crm_electronic_invoice_appointments TO service_role;

DROP POLICY IF EXISTS crm_electronic_invoice_appointments_no_client
  ON public.crm_electronic_invoice_appointments;
CREATE POLICY crm_electronic_invoice_appointments_no_client
ON public.crm_electronic_invoice_appointments
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

-- Empresas actuales: enciende el archivo de facturación electrónica.
UPDATE public.crm_directory AS d
SET
  requests_electronic_invoice = true,
  updated_at = now()
WHERE d.requests_electronic_invoice = false
  AND (
    EXISTS (
      SELECT 1
      FROM unnest(coalesce(d.tags, '{}'::text[])) AS tag(name)
      WHERE lower(btrim(tag.name)) IN ('empresas', 'empresa', 'company')
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(string_to_array(coalesce(d.classification, ''), ',')) AS token(name)
      WHERE lower(btrim(token.name)) IN ('empresas', 'empresa', 'company')
    )
  );
