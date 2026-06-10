-- Resumen de duplicados por phone_key (debe ser 0 filas)
WITH dup AS (
  SELECT phone_key, count(*) AS cnt
  FROM crm_directory
  WHERE phone_key IS NOT NULL
  GROUP BY phone_key
  HAVING count(*) > 1
)
SELECT count(*) AS duplicate_groups FROM dup;

-- Detalle si existen
SELECT phone_key, count(*) AS cnt
FROM crm_directory
WHERE phone_key IS NOT NULL
GROUP BY phone_key
HAVING count(*) > 1
ORDER BY cnt DESC
LIMIT 20;
