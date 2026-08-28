-- Wrap auth.uid() in (select auth.uid()) on hot RLS helpers / policies.

CREATE OR REPLACE FUNCTION app_private.is_crm_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_profiles
    WHERE id = (SELECT auth.uid())
      AND is_active = true
      AND role IN ('admin', 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION app_private.is_crm_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_profiles
    WHERE id = (SELECT auth.uid())
      AND is_active = true
      AND role = 'super_admin'
  );
$$;

DROP POLICY IF EXISTS whatsapp_coex_health_select_admin ON public.whatsapp_coex_health;
CREATE POLICY whatsapp_coex_health_select_admin
  ON public.whatsapp_coex_health
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.admin_profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.is_active = true
        AND p.role IN ('admin', 'super_admin')
    )
  );

GRANT EXECUTE ON FUNCTION app_private.is_crm_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_crm_super_admin() TO authenticated;
