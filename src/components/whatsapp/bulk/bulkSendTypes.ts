import type { DirectoryEntry } from '@/types/lead';
import type { WhatsAppTemplateSummary } from '@/services/whatsappService';
import {
  buildDisplayMessageBody,
  buildTemplateSendComponents,
  type WhatsAppTemplateSendComponent,
} from '@/utils/whatsappTemplateHelpers';

export const BULK_SEND_MAX_RECIPIENTS = 500;
export const BULK_CONFIRM_PHRASE = 'CONFIRMAR_ENVIO_MASIVO';

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
