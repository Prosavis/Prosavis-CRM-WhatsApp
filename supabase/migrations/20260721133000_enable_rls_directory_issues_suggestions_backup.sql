-- Habilitar RLS en tablas internas del directorio / backup expuestas sin políticas.
-- service_role bypassa RLS; el acceso authenticated queda limitado a CRM admins.

ALTER TABLE public.crm_directory_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_directory_ai_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zz_backup_crm_clients_20260610 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CRM admins manage directory issues" ON public.crm_directory_issues;
CREATE POLICY "CRM admins manage directory issues"
ON public.crm_directory_issues FOR ALL TO authenticated
USING (app_private.is_crm_admin()) WITH CHECK (app_private.is_crm_admin());

DROP POLICY IF EXISTS "CRM admins manage directory AI suggestions" ON public.crm_directory_ai_suggestions;
CREATE POLICY "CRM admins manage directory AI suggestions"
ON public.crm_directory_ai_suggestions FOR ALL TO authenticated
USING (app_private.is_crm_admin()) WITH CHECK (app_private.is_crm_admin());

DROP POLICY IF EXISTS "CRM admins read clients backup" ON public.zz_backup_crm_clients_20260610;
CREATE POLICY "CRM admins read clients backup"
ON public.zz_backup_crm_clients_20260610 FOR SELECT TO authenticated
USING (app_private.is_crm_admin());
