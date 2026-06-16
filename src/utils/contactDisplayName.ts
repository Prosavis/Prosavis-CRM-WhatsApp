import type { DirectoryEntry } from '@/types/lead';

const EMOJI_RE =
  /[\u2122\u2139\u2190-\u21FF\u2300-\u27BF\u2B00-\u2BFF\uFE00-\uFE0F\u{1F000}-\u{1FAFF}]/u;

export interface ContactNameSources {
  directoryDisplayName?: string | null;
  directoryFullName?: string | null;
  contactName?: string | null;
  whatsappProfileName?: string | null;
  phone?: string | null;
  conversationId?: string | null;
}

function isUsefulName(value: string | null | undefined, minLen = 2): boolean {
  const trimmed = (value ?? '').trim();
  return trimmed.length >= minLen;
}

/** Nombre canónico del directorio (display_name > full_name). */
export function pickDirectoryDisplayName(entry: Pick<DirectoryEntry, 'displayName' | 'fullName'> | null | undefined): string {
  if (!entry) return '';
  const display = (entry.displayName ?? '').trim();
  if (isUsefulName(display)) return display;
  return (entry.fullName ?? '').trim();
}

export function directoryNameHasEmoji(name: string | null | undefined): boolean {
  return EMOJI_RE.test(name ?? '');
}

/**
 * Prioridad: CRM directory > contact_name > whatsapp_profile_name > teléfono/id.
 */
export function resolveContactDisplayName(sources: ContactNameSources): string {
  const dirName = (sources.directoryDisplayName ?? '').trim() || (sources.directoryFullName ?? '').trim();
  if (isUsefulName(dirName)) return dirName;

  const contactName = (sources.contactName ?? '').trim();
  if (isUsefulName(contactName)) return contactName;

  const waProfile = (sources.whatsappProfileName ?? '').trim();
  if (isUsefulName(waProfile)) return waProfile;

  const phone = (sources.phone ?? '').trim();
  if (phone) return phone;

  return (sources.conversationId ?? '').trim() || 'Sin nombre';
}

/**
 * True cuando el directorio tiene nombre válido y contact_name debería alinearse.
 */
export function shouldSyncContactNameFromDirectory(
  dirName: string | null | undefined,
  currentContactName: string | null | undefined,
): boolean {
  const canonical = (dirName ?? '').trim();
  if (!isUsefulName(canonical)) return false;
  const current = (currentContactName ?? '').trim();
  if (!current) return true;
  if (current.toLowerCase() === canonical.toLowerCase()) return false;
  if (directoryNameHasEmoji(current) && !directoryNameHasEmoji(canonical)) return true;
  return current !== canonical;
}
