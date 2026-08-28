-- RPC batch directory meta for inbox list (replaces sequential 80-row chunks).

CREATE OR REPLACE FUNCTION public.crm_directory_meta_by_phones(p_phones text[])
RETURNS TABLE (
  phone text,
  phone_key text,
  photo_url text,
  display_name text,
  full_name text,
  tags text[],
  classification text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    d.phone,
    d.phone_key,
    d.photo_url,
    d.display_name,
    d.full_name,
    d.tags,
    d.classification
  FROM public.crm_directory d
  WHERE d.phone = ANY (p_phones)
     OR d.phone_key = ANY (p_phones);
$$;

REVOKE ALL ON FUNCTION public.crm_directory_meta_by_phones(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_directory_meta_by_phones(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_directory_meta_by_phones(text[]) TO service_role;
