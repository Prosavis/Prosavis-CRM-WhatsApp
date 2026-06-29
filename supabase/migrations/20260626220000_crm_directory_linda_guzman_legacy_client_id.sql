-- Enlaza clientId legacy de Firestore (crmClients) al registro unificado de Linda Guzmán.
-- Citas históricas: appointments.clientId = Lk1bfJMuJQAhVkXI4G0z
-- Citas nuevas:     appointments.clientId = fe339198-0641-4a22-90a9-54b9502521f4
-- Sin este vínculo, Agendados y getClientAppointmentHistory no unifican el historial.

UPDATE crm_directory
SET
  metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{source_ids}',
    COALESCE(metadata->'source_ids', '{}'::jsonb) ||
      jsonb_build_object('firebase_crmClient_docId', 'Lk1bfJMuJQAhVkXI4G0z'),
    true
  ),
  updated_at = now()
WHERE id = 'fe339198-0641-4a22-90a9-54b9502521f4'
  AND COALESCE(metadata->'source_ids'->>'firebase_crmClient_docId', '') = '';
