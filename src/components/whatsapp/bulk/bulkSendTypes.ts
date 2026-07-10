import type { DirectoryEntry } from '@/types/lead';
import type { WhatsAppTemplateSummary } from '@/services/whatsappService';
import {
  fetchAllBroadcastRecipients,
  type BroadcastRecipientStatus,
} from '@/services/whatsappService';
import { directoryService } from '@/services/directoryService';
import {
  buildDisplayMessageBody,
  buildTemplateSendComponents,
  type WhatsAppTemplateSendComponent,
} from '@/utils/whatsappTemplateHelpers';

export const BULK_SEND_MAX_RECIPIENTS = 500;
export const BULK_CONFIRM_PHRASE = 'CONFIRMAR_ENVIO_MASIVO';

export type BulkDirectorySortField =
  | 'last_whatsapp_message_at'
  | 'full_name'
  | 'created_at';

export type BulkDirectorySortDirection = 'asc' | 'desc';

export const BULK_DIRECTORY_DEFAULT_SORT_FIELD: BulkDirectorySortField =
  'last_whatsapp_message_at';
export const BULK_DIRECTORY_DEFAULT_SORT_DIRECTION: BulkDirectorySortDirection = 'asc';

export const BULK_DIRECTORY_SORT_LABELS: Record<BulkDirectorySortField, string> = {
  last_whatsapp_message_at: 'Último mensaje (inbox)',
  full_name: 'Nombre',
  created_at: 'Fecha de registro',
};

/** Dirección por defecto al elegir un campo de ordenamiento. */
export function defaultBulkSortDirection(
  field: BulkDirectorySortField,
): BulkDirectorySortDirection {
  if (field === 'created_at') return 'desc';
  return 'asc';
}

/** Modo de filtrado por tags (WhatsApp o directorio). */
export type BulkAudienceTagFilterMode = 'include_any' | 'include_all' | 'exclude_any';

export type BulkAudienceListFilterMode = 'include' | 'exclude';

export const BULK_AUDIENCE_TAG_FILTER_LABELS: Record<BulkAudienceTagFilterMode, string> = {
  include_any: 'Incluir (cualquiera)',
  include_all: 'Incluir (todos)',
  exclude_any: 'Excluir',
};

export const BULK_QUALITY_TAG_LABELS: Record<string, string> = {
  good: 'Buena',
  standard: 'Estándar',
  bad: 'Mala',
};

export const BULK_CLASSIFICATION_OPTIONS = ['user', 'lead', 'unknown'] as const;

export const BULK_CLASSIFICATION_LABELS: Record<string, string> = {
  user: 'Usuario',
  lead: 'Lead',
  unknown: 'Desconocido',
  /** Solo lectura legacy en resúmenes / datos antiguos. */
  company: 'Empresa',
  Empresas: 'Empresas',
};

export interface BulkAudienceAdvancedFilters {
  waTagIds: string[];
  waTagMode: BulkAudienceTagFilterMode;
  directoryTags: string[];
  directoryTagMode: BulkAudienceTagFilterMode;
  classifications: string[];
  classificationMode: BulkAudienceListFilterMode;
  qualityTags: string[];
  qualityTagMode: BulkAudienceListFilterMode;
}

export const DEFAULT_BULK_AUDIENCE_ADVANCED_FILTERS: BulkAudienceAdvancedFilters = {
  waTagIds: [],
  waTagMode: 'include_any',
  directoryTags: [],
  directoryTagMode: 'include_any',
  classifications: [],
  classificationMode: 'include',
  qualityTags: [],
  qualityTagMode: 'include',
};

import type { WhatsAppTag } from '@/services/whatsappService';

export function advancedFiltersToBulkParams(advanced: BulkAudienceAdvancedFilters) {
  const waTags =
    advanced.waTagIds.length > 0
      ? {
          includeWaTagIds:
            advanced.waTagMode === 'exclude_any' ? undefined : advanced.waTagIds,
          excludeWaTagIds:
            advanced.waTagMode === 'exclude_any' ? advanced.waTagIds : undefined,
          waTagMatchAll: advanced.waTagMode === 'include_all',
        }
      : {};

  const directoryTags =
    advanced.directoryTags.length > 0
      ? {
          includeDirectoryTags:
            advanced.directoryTagMode === 'exclude_any'
              ? undefined
              : advanced.directoryTags,
          excludeDirectoryTags:
            advanced.directoryTagMode === 'exclude_any'
              ? advanced.directoryTags
              : undefined,
          directoryTagMatchAll: advanced.directoryTagMode === 'include_all',
        }
      : {};

  const classifications =
    advanced.classifications.length > 0
      ? {
          includeClassifications:
            advanced.classificationMode === 'include'
              ? advanced.classifications
              : undefined,
          excludeClassifications:
            advanced.classificationMode === 'exclude'
              ? advanced.classifications
              : undefined,
        }
      : {};

  const qualityTags =
    advanced.qualityTags.length > 0
      ? {
          includeQualityTags:
            advanced.qualityTagMode === 'include' ? advanced.qualityTags : undefined,
          excludeQualityTags:
            advanced.qualityTagMode === 'exclude' ? advanced.qualityTags : undefined,
        }
      : {};

  return { ...waTags, ...directoryTags, ...classifications, ...qualityTags };
}

export function summarizeBulkAdvancedFilters(
  advanced: BulkAudienceAdvancedFilters,
  waTags: WhatsAppTag[],
): string[] {
  const parts: string[] = [];
  const waTagMap = new Map(waTags.map((t) => [t.id, t.name]));

  if (advanced.waTagIds.length > 0) {
    const names = advanced.waTagIds.map((id) => waTagMap.get(id) ?? id).join(', ');
    const prefix =
      advanced.waTagMode === 'exclude_any'
        ? 'Excluye tags WA'
        : advanced.waTagMode === 'include_all'
          ? 'Tags WA (todos)'
          : 'Tags WA';
    parts.push(`${prefix}: ${names}`);
  }

  if (advanced.directoryTags.length > 0) {
    const prefix =
      advanced.directoryTagMode === 'exclude_any'
        ? 'Excluye etiquetas'
        : advanced.directoryTagMode === 'include_all'
          ? 'Etiquetas (todas)'
          : 'Etiquetas';
    parts.push(`${prefix}: ${advanced.directoryTags.join(', ')}`);
  }

  if (advanced.classifications.length > 0) {
    const labels = advanced.classifications
      .map((c) => BULK_CLASSIFICATION_LABELS[c] ?? c)
      .join(', ');
    const prefix = advanced.classificationMode === 'exclude' ? 'Excluye tipo' : 'Tipo';
    parts.push(`${prefix}: ${labels}`);
  }

  if (advanced.qualityTags.length > 0) {
    const labels = advanced.qualityTags
      .map((q) => BULK_QUALITY_TAG_LABELS[q] ?? q)
      .join(', ');
    const prefix = advanced.qualityTagMode === 'exclude' ? 'Excluye calidad' : 'Calidad';
    parts.push(`${prefix}: ${labels}`);
  }

  return parts;
}

export function hasActiveBulkAdvancedFilters(filters: BulkAudienceAdvancedFilters): boolean {
  return (
    filters.waTagIds.length > 0
    || filters.directoryTags.length > 0
    || filters.classifications.length > 0
    || filters.qualityTags.length > 0
  );
}

export interface BulkRecipient {
  phone: string;
  name?: string;
  entryId?: string;
}

export type BulkMessageMode = 'template' | 'text';

export interface BulkMessageState {
  mode: BulkMessageMode;
  text: string;
  selectedTemplate: WhatsAppTemplateSummary | null;
  headerValues: string[];
  bodyValues: string[];
}

export function parseManualPhones(raw: string): string[] {
  const phones = new Set<string>();
  for (const line of raw.split(/[\n,;]+/)) {
    const digits = line.trim().replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 15) phones.add(digits);
  }
  return [...phones];
}

export function buildBulkRecipients(
  selectedEntries: DirectoryEntry[],
  manualPhones: string[],
): BulkRecipient[] {
  const byPhone = new Map<string, BulkRecipient>();

  for (const entry of selectedEntries) {
    if (!entry.phone) continue;
    const phone = entry.phone.replace(/\D/g, '');
    if (phone.length < 10 || phone.length > 15) continue;
    byPhone.set(phone, {
      phone,
      name: entry.fullName || entry.displayName,
      entryId: entry.id,
    });
  }

  for (const phone of manualPhones) {
    if (!byPhone.has(phone)) {
      byPhone.set(phone, { phone });
    }
  }

  return [...byPhone.values()];
}

export function buildTemplatePayload(message: BulkMessageState): {
  templateName?: string;
  templateLanguage?: string;
  templateComponents?: WhatsAppTemplateSendComponent[];
  displayMessageBody?: string;
} {
  if (message.mode !== 'template' || !message.selectedTemplate) return {};
  const components = buildTemplateSendComponents(
    message.selectedTemplate,
    message.headerValues,
    message.bodyValues,
  );
  return {
    templateName: message.selectedTemplate.name,
    templateLanguage: message.selectedTemplate.language,
    templateComponents: components.length > 0 ? components : undefined,
    displayMessageBody: buildDisplayMessageBody(
      message.selectedTemplate,
      message.headerValues,
      message.bodyValues,
    ),
  };
}

/** Estados que se pueden reintentar desde el wizard de envío masivo. */
export const BULK_RETRY_RECIPIENT_STATUSES: BroadcastRecipientStatus[] = ['failed', 'pending'];

/**
 * Carga destinatarios fallidos/pendientes de un job y los convierte en selección
 * de audiencia (directorio + teléfonos manuales) para reintentar en el mismo flujo.
 */
export async function buildAudienceFromBroadcastJob(jobId: string): Promise<{
  entries: DirectoryEntry[];
  manualPhones: string[];
  total: number;
}> {
  const rows = await fetchAllBroadcastRecipients(jobId, BULK_RETRY_RECIPIENT_STATUSES);
  const byPhone = new Map<string, (typeof rows)[0]>();
  for (const row of rows) {
    const digits = row.phone.replace(/\D/g, '');
    if (digits.length >= 10) byPhone.set(digits, row);
  }

  const entries: DirectoryEntry[] = [];
  const manualPhones: string[] = [];
  const seenEntryIds = new Set<string>();

  const phones = [...byPhone.keys()];
  const CHUNK = 15;
  for (let i = 0; i < phones.length; i += CHUNK) {
    const chunk = phones.slice(i, i + CHUNK);
    const lookups = await Promise.all(
      chunk.map(async (phone) => {
        const row = byPhone.get(phone)!;
        const found = await directoryService.findByPhone(phone);
        return { phone, row, found: found[0] ?? null };
      }),
    );
    for (const { phone, found } of lookups) {
      if (found && !seenEntryIds.has(found.id)) {
        seenEntryIds.add(found.id);
        entries.push(found);
      } else if (!found) {
        manualPhones.push(phone);
      }
    }
  }

  return { entries, manualPhones, total: byPhone.size };
}
