-- Fuente de verdad de citas: Firestore `appointments`.
-- `crm_appointments` era un snapshot ETL congelado (mayo 2026) sin sync en vivo.
-- Las métricas de servicios completados ahora leen Firestore directamente.

drop table if exists public.crm_appointments cascade;
