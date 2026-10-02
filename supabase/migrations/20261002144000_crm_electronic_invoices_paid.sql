-- Estado de pago de la factura electrónica archivada (UserConsole Agendados).
-- Las filas existentes quedan pendientes.

ALTER TABLE public.crm_electronic_invoices
  ADD COLUMN IF NOT EXISTS paid boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.crm_electronic_invoices.paid IS
  'True cuando la factura electrónica archivada ya está pagada';
