/**
 * Tags de contactos internos que no cuentan como clientes: TEST (cuentas de
 * prueba) y Equipo Prosavis (números reales del equipo). Se comparan en
 * minúsculas y sin espacios en los extremos.
 *
 * Mantener alineado con app_private.metrics_is_test_contact y
 * public.list_cold_app_user_outreach_eligible (SQL).
 */

export const TEST_TAG_NAME = 'TEST';
export const EQUIPO_PROSAVIS_TAG_NAME = 'Equipo Prosavis';

export const TEST_TAG_TOKEN = 'test';
export const EQUIPO_PROSAVIS_TAG_TOKEN = 'equipo prosavis';

export const INTERNAL_CONTACT_TAG_TOKENS = [
  TEST_TAG_TOKEN,
  EQUIPO_PROSAVIS_TAG_TOKEN,
] as const;
