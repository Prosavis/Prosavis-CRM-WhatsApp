import type { DirectoryEntry } from '@/types/lead';

export type DirectoryEffectiveStatus = 'active' | 'inactive' | 'opt_out';

type DirectoryStatusFields = Pick<
  DirectoryEntry,
  'status' | 'whatsAppConversationId' | 'optOut'
>;

export function hasWhatsAppInboxConversation(
  entry: Pick<DirectoryEntry, 'whatsAppConversationId'>,
): boolean {
  return Boolean(entry.whatsAppConversationId?.trim());
}

export function isDirectoryOptOut(entry: DirectoryStatusFields): boolean {
  return entry.optOut === true || entry.status === 'opt_out';
}

/** Activo si cumple la lógica CRM habitual o tiene chat en el inbox de WhatsApp. */
export function isDirectoryContactActive(entry: DirectoryStatusFields): boolean {
  if (isDirectoryOptOut(entry)) return false;
  return entry.status === 'active' || hasWhatsAppInboxConversation(entry);
}

export function getDirectoryEffectiveStatus(
  entry: DirectoryStatusFields,
): DirectoryEffectiveStatus {
  if (isDirectoryOptOut(entry)) return 'opt_out';
  return isDirectoryContactActive(entry) ? 'active' : 'inactive';
}

export const DIRECTORY_STATUS_LABELS: Record<DirectoryEffectiveStatus, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
  opt_out: 'Opt-out',
};

export const DIRECTORY_STATUS_SUMMARY: Record<DirectoryEffectiveStatus, string> = {
  active:
    'Contacto vigente: usuario activo en la app, lead o entrada manual, o chat existente en el inbox de WhatsApp.',
  inactive:
    'Sin actividad reciente: usuario desactivado o eliminado en la app, y sin conversación en el inbox de WhatsApp.',
  opt_out: 'Solicitó no recibir mensajes comerciales o de seguimiento.',
};

export function getDirectoryStatusTooltip(entry: DirectoryStatusFields): string {
  const effective = getDirectoryEffectiveStatus(entry);
  const summary = DIRECTORY_STATUS_SUMMARY[effective];
  const hasWhatsApp = hasWhatsAppInboxConversation(entry);

  if (effective === 'opt_out') {
    return summary;
  }

  if (effective === 'active') {
    const reasons: string[] = [];
    if (entry.status === 'active') {
      reasons.push('Marcado activo en el directorio (app, lead o alta manual).');
    }
    if (hasWhatsApp) {
      reasons.push('Tiene conversación en el inbox de WhatsApp.');
    }
    if (reasons.length === 0) {
      return summary;
    }
    return `${summary} ${reasons.join(' ')}`;
  }

  if (hasWhatsApp) {
    return `${summary} Nota: aún hay un ID de conversación residual; puede requerir sincronización.`;
  }

  return summary;
}
