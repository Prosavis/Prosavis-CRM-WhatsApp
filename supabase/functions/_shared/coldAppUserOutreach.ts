/**
 * Helpers de activación en frío para usuarios app (crm_directory).
 * Plantilla única: promo_general (sin variables / sin nombre).
 */

import { isUsableName } from './contactDisplayName.ts';
import {
  directoryPhoneKey,
  isReactivationPhoneValid,
  normalizeDirectoryPhoneE164,
} from './directoryPhone.ts';
import { normalizePhone } from './whatsappIdentity.ts';

export const COLD_APP_USER_CAMPAIGN_TYPE = 'COLD_APP_USER';
/** @deprecated Solo referencia histórica del piloto; el batch usa siempre promo_general. */
export const COLD_NAMED_TEMPLATE = 'outreach_invitacion_agendar';
export const COLD_GENERIC_TEMPLATE = 'promo_general';
export const COLD_CONFIRM_PHRASE = 'CONFIRMAR_ACTIVACION_FRIO';
export const COLD_JOB_KIND = 'cold_app_user';

const GENERIC_FIRST_NAMES = new Set([
  'cliente',
  'clienta',
  'user',
  'usuario',
  'usuaria',
  'test',
  'prosavis',
  'unknown',
  'n/a',
  'na',
  'sin',
  'nombre',
  'hola',
  'amigo',
  'amiga',
]);

export interface ColdEligibleRow {
  id: string;
  phone: string;
  phone_key: string | null;
  display_name: string | null;
  full_name: string | null;
  app_user_id: string | null;
  tags: string[] | null;
}

export interface ColdRecipientPlan {
  directoryId: string;
  phone: string;
  phoneKey: string;
  /** Solo para fill-only de ficha; no se usa en plantilla. */
  firstName: string | null;
  templateName: string;
  displayName: string | null;
  appUserId: string | null;
}

/** Primer token usable (fill-only directorio); no alimenta la plantilla. */
export function resolveUsableFirstName(
  displayName: string | null | undefined,
  fullName: string | null | undefined,
): string | null {
  const source = (displayName || fullName || '').trim();
  if (!isUsableName(source)) return null;

  const first = source.split(/\s+/)[0]?.trim() ?? '';
  if (first.length < 2) return null;
  if (!/\p{L}/u.test(first)) return null;
  if (/^\d+$/.test(first)) return null;
  if (GENERIC_FIRST_NAMES.has(first.toLowerCase())) return null;
  const cleaned = first.replace(/[^\p{L}\p{N}'-]/gu, '');
  if (cleaned.length < 2 || !isUsableName(cleaned)) return null;
  if (GENERIC_FIRST_NAMES.has(cleaned.toLowerCase())) return null;
  return cleaned;
}

export function planRecipientFromDirectory(row: ColdEligibleRow): ColdRecipientPlan | null {
  if (!isReactivationPhoneValid(row.phone)) return null;
  const phoneKey = directoryPhoneKey(row.phone) ?? row.phone_key;
  if (!phoneKey || phoneKey.length !== 10 || !phoneKey.startsWith('3')) return null;

  const e164 = normalizeDirectoryPhoneE164(row.phone);
  const phone = normalizePhone(e164 ?? row.phone);
  if (!phone || phone.length < 10) return null;

  const firstName = resolveUsableFirstName(row.display_name, row.full_name);

  return {
    directoryId: row.id,
    phone,
    phoneKey,
    firstName,
    templateName: COLD_GENERIC_TEMPLATE,
    displayName: firstName
      ? (row.display_name || row.full_name || firstName).trim()
      : null,
    appUserId: row.app_user_id,
  };
}

/** Texto completo para inbox/CRM (copy de promo_general). */
export function buildColdDisplayBody(): string {
  return (
    '🏠 ¡Limpieza profesional para tu hogar!\n\n' +
    'En Prosavis Limpieza nos encargamos de todo:\n' +
    '✅ Personal verificado y capacitado\n' +
    '✅ Pago seguro por la app\n' +
    '✅ Garantía de satisfacción\n\n' +
    '📋 Desde $88.000\n\n' +
    '¿Quieres agendar? Escríbenos y te damos disponibilidad 👇'
  );
}

/** Tags de Negativos para fallos de cold outreach. */
export const COLD_TAG_UNDELIVERABLE = 'undeliverable Meta';
export const COLD_TAG_UUID_BUG = 'bug UUID log (sin confirmación)';
export const COLD_TAG_FAILED_GENERIC = 'failed to be sent';

export function resolveColdFailureTagName(errorMessage?: string | null): string | null {
  const err = (errorMessage ?? '').toLowerCase();
  if (!err.trim()) return null;
  if (err.includes('undeliverable')) return COLD_TAG_UNDELIVERABLE;
  if (err.includes('invalid input syntax for type uuid') || err.includes('cold-outreach-worker')) {
    return COLD_TAG_UUID_BUG;
  }
  return COLD_TAG_FAILED_GENERIC;
}

/** Aplica tag de Negativos al directorio + conversación WA (append, no reemplaza). */
// deno-lint-ignore no-explicit-any
export async function applyColdFailureTag(
  supabase: any,
  params: {
    directoryId?: string | null;
    phone: string;
    errorMessage?: string | null;
  },
): Promise<string | null> {
  const tagName = resolveColdFailureTagName(params.errorMessage);
  if (!tagName) return null;

  const { data: tagRow } = await supabase
    .from('whatsapp_chat_tags')
    .select('id')
    .eq('name', tagName)
    .eq('archived', false)
    .maybeSingle();

  const tagId = tagRow?.id as string | undefined;
  if (!tagId) {
    console.warn('[cold-outreach] tag no encontrado en catálogo:', tagName);
    return tagName;
  }

  const phoneKey = params.phone.replace(/\D/g, '').slice(-10);

  // Preferir conversación: el trigger sync_tags_to_crm_directory actualiza el directorio.
  let { data: convs } = await supabase
    .from('whatsapp_conversations')
    .select('stable_key, tag_ids')
    .eq('phone_key', phoneKey)
    .limit(5);

  if (!convs?.length) {
    const { data: byStable } = await supabase
      .from('whatsapp_conversations')
      .select('stable_key, tag_ids')
      .ilike('stable_key', `%${phoneKey}`)
      .limit(5);
    convs = byStable;
  }

  let taggedConversation = false;
  for (const conv of convs ?? []) {
    const ids: string[] = Array.isArray(conv.tag_ids) ? conv.tag_ids : [];
    if (ids.includes(tagId)) {
      taggedConversation = true;
      continue;
    }
    const { error } = await supabase
      .from('whatsapp_conversations')
      .update({ tag_ids: [...ids, tagId] })
      .eq('stable_key', conv.stable_key);
    if (!error) taggedConversation = true;
  }

  // Fallback si aún no hay conversación WA: solo directorio.
  if (!taggedConversation && params.directoryId) {
    const { data: dir } = await supabase
      .from('crm_directory')
      .select('tags')
      .eq('id', params.directoryId)
      .maybeSingle();
    const current: string[] = Array.isArray(dir?.tags) ? dir.tags : [];
    if (!current.some((t) => String(t).toLowerCase() === tagName.toLowerCase())) {
      await supabase
        .from('crm_directory')
        .update({ tags: [...current, tagName], updated_at: new Date().toISOString() })
        .eq('id', params.directoryId);
    }
  }

  return tagName;
}

const COLD_FAILURE_TAG_NAMES = [
  COLD_TAG_UNDELIVERABLE,
  COLD_TAG_UUID_BUG,
  COLD_TAG_FAILED_GENERIC,
] as const;

/**
 * Quita tags Negativos de fallo Meta cuando la entrega se recupera
 * (sent/delivered/read) o cuando se detectó un falso positivo.
 */
// deno-lint-ignore no-explicit-any
export async function removeColdFailureTags(
  supabase: any,
  params: {
    directoryId?: string | null;
    phone: string;
  },
): Promise<number> {
  const phone = String(params.phone ?? '').trim();
  if (!phone) return 0;

  const { data: tagRows } = await supabase
    .from('whatsapp_chat_tags')
    .select('id,name')
    .in('name', [...COLD_FAILURE_TAG_NAMES])
    .eq('archived', false);

  const tagIds: string[] = (tagRows ?? []).map((t: { id: string }) => t.id).filter(Boolean);
  if (!tagIds.length) return 0;

  const phoneKey = phone.replace(/\D/g, '').slice(-10);
  let { data: convs } = await supabase
    .from('whatsapp_conversations')
    .select('stable_key, tag_ids')
    .eq('phone_key', phoneKey)
    .limit(5);

  if (!convs?.length) {
    const { data: byStable } = await supabase
      .from('whatsapp_conversations')
      .select('stable_key, tag_ids')
      .ilike('stable_key', `%${phoneKey}`)
      .limit(5);
    convs = byStable;
  }

  let removed = 0;
  for (const conv of convs ?? []) {
    const ids: string[] = Array.isArray(conv.tag_ids) ? conv.tag_ids : [];
    const next = ids.filter((id) => !tagIds.includes(id));
    if (next.length === ids.length) continue;
    const { error } = await supabase
      .from('whatsapp_conversations')
      .update({ tag_ids: next })
      .eq('stable_key', conv.stable_key);
    if (!error) removed += 1;
  }

  if (params.directoryId) {
    const { data: dir } = await supabase
      .from('crm_directory')
      .select('tags')
      .eq('id', params.directoryId)
      .maybeSingle();
    const current: string[] = Array.isArray(dir?.tags) ? dir.tags : [];
    const next = current.filter(
      (t) => !COLD_FAILURE_TAG_NAMES.some((n) => n.toLowerCase() === String(t).toLowerCase()),
    );
    if (next.length !== current.length) {
      await supabase
        .from('crm_directory')
        .update({ tags: next, updated_at: new Date().toISOString() })
        .eq('id', params.directoryId);
    }
  } else if (phoneKey) {
    // Fallback: directorio por phone_key / variantes.
    const { data: dirs } = await supabase
      .from('crm_directory')
      .select('id, tags')
      .or(`phone_key.eq.${phoneKey},phone.eq.+${phone},phone.eq.${phone}`)
      .limit(5);
    for (const dir of dirs ?? []) {
      const current: string[] = Array.isArray(dir.tags) ? dir.tags : [];
      const next = current.filter(
        (t) => !COLD_FAILURE_TAG_NAMES.some((n) => n.toLowerCase() === String(t).toLowerCase()),
      );
      if (next.length === current.length) continue;
      await supabase
        .from('crm_directory')
        .update({ tags: next, updated_at: new Date().toISOString() })
        .eq('id', dir.id);
    }
  }

  return removed;
}

/** Fill-only merge: identidad app + teléfono; no escribe display_name basura. */
export function buildDirectoryUpsertPayload(plan: ColdRecipientPlan): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    phone: plan.phone.startsWith('+') ? plan.phone : `+${plan.phone}`,
    phone_key: plan.phoneKey,
    is_app_user: true,
    status: 'active',
    source: 'APP_USER',
    channels: ['WHATSAPP', 'APP'],
  };
  if (plan.appUserId) {
    entry.app_user_id = plan.appUserId;
  }
  if (plan.firstName && plan.displayName && isUsableName(plan.displayName)) {
    entry.display_name = plan.displayName;
    entry.full_name = plan.displayName;
  }
  return entry;
}
