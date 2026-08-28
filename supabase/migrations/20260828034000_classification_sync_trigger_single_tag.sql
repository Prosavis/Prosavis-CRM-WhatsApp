-- Live trigger was still joining every tag into classification on tags UPDATE.
CREATE OR REPLACE FUNCTION public.sync_classification_from_tags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.tags IS NOT NULL AND array_length(NEW.tags, 1) > 0 THEN
    NEW.classification := public.directory_classification_from_tag_names(NEW.tags);
  ELSIF NEW.tags IS NULL OR array_length(NEW.tags, 1) IS NULL OR NEW.tags = '{}' THEN
    IF NEW.classification IS NULL OR NEW.classification = '' THEN
      NEW.classification := 'unknown';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
