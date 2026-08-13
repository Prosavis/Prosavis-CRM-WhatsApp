-- Habilitar RLS en tablas internas del directorio / backup expuestas sin políticas.
-- service_role bypassa RLS; el acceso authenticated queda limitado a CRM admins.

ALTER TABLE public.crm_directory_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_directory_ai_suggestions ENABLE ROW LEVEL SECURITY;

do $$
begin
  if to_regclass('public.zz_backup_crm_clients_20260610') is not null then
    execute 'alter table public.zz_backup_crm_clients_20260610 enable row level security';
  end if;
end
$$;

DROP POLICY IF EXISTS "CRM admins manage directory issues" ON public.crm_directory_issues;
CREATE POLICY "CRM admins manage directory issues"
ON public.crm_directory_issues FOR ALL TO authenticated
USING (app_private.is_crm_admin()) WITH CHECK (app_private.is_crm_admin());

DROP POLICY IF EXISTS "CRM admins manage directory AI suggestions" ON public.crm_directory_ai_suggestions;
CREATE POLICY "CRM admins manage directory AI suggestions"
ON public.crm_directory_ai_suggestions FOR ALL TO authenticated
USING (app_private.is_crm_admin()) WITH CHECK (app_private.is_crm_admin());

do $$
begin
  if to_regclass('public.zz_backup_crm_clients_20260610') is not null then
    execute $sql$
      drop policy if exists "CRM admins read clients backup"
        on public.zz_backup_crm_clients_20260610
    $sql$;
    execute $sql$
      create policy "CRM admins read clients backup"
      on public.zz_backup_crm_clients_20260610 for select to authenticated
      using (app_private.is_crm_admin())
    $sql$;
  end if;
end
$$;
