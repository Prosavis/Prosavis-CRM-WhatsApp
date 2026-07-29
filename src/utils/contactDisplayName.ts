import type { DirectoryEntry } from '@/types/lead';

const EMOJI_RE = /\p{Extended_Pictographic}/u;

export interface ContactNameSources {
  directoryDisplayName?: string | null;
  directoryFullName?: string | null;
  contactName?: string | null;
  whatsappProfileName?: string | null;
  phone?: string | null;
  conversationId?: string | null;
  /** Si true, contact_name bloqueado gana sobre el directorio (p. ej. DETEKTOR). */
  contactNameLocked?: boolean | null;
}

/**
 * True when a string is suitable as CRM directory full_name / display_name.
 * Rejects empty/short, letter-less (emoji-only, symbols, phone-as-name), etc.
 * Names with letters plus emoji (e.g. "Jules🍉") are accepted.
 */
export function isUsableName(value: string | null | undefined): boolean {
  const trimmed = (value ?? '').trim();
  if (trimmed.length < 2) return false;
  if (!/\p{L}/u.test(trimmed)) return false;
  return true;
}

/** Nombre canónico del directorio (display_name > full_name). */
export function pickDirectoryDisplayName(
  entry: Pick<DirectoryEntry, 'displayName' | 'fullName'> | null | undefined,
): string {
  if (!entry) return '';
  const display = (entry.displayName ?? '').trim();
  if (isUsableName(display)) return display;
  const full = (entry.fullName ?? '').trim();
  if (isUsableName(full)) return full;
  return '';
}

export function directoryNameHasEmoji(name: string | null | undefined): boolean {
  return EMOJI_RE.test(name ?? '');
}

/**
 * Prioridad:
 * 1. contact_name usable + locked (nombre CRM manual / marca, p. ej. DETEKTOR)
 * 2. directorio usable
 * 3. contact_name usable
 * 4. whatsapp_profile_name usable
 * 5. teléfono / id
 *
 * Emoji-only y strings sin letras se rechazan (isUsableName).
 */
export function resolveContactDisplayName(sources: ContactNameSources): string {
  const contactName = (sources.contactName ?? '').trim();
  const locked = sources.contactNameLocked === true;

  if (locked && isUsableName(contactName)) return contactName;

  const dirName =
    (sources.directoryDisplayName ?? '').trim() ||
    (sources.directoryFullName ?? '').trim();
  if (isUsableName(dirName)) return dirName;

  if (isUsableName(contactName)) return contactName;

  const waProfile = (sources.whatsappProfileName ?? '').trim();
  if (isUsableName(waProfile)) return waProfile;

  const phone = (sources.phone ?? '').trim();
  if (phone) return phone;

  return (sources.conversationId ?? '').trim() || 'Sin nombre';
}

/**
 * True cuando el directorio tiene nombre válido y contact_name debería alinearse.
 * No aplica si el nombre actual está bloqueado (se preserva, p. ej. DETEKTOR).
 */
export function shouldSyncContactNameFromDirectory(
  dirName: string | null | undefined,
  currentContactName: string | null | undefined,
  options?: { contactNameLocked?: boolean | null },
): boolean {
  if (options?.contactNameLocked === true) return false;

  const canonical = (dirName ?? '').trim();
  if (!isUsableName(canonical)) return false;
  const current = (currentContactName ?? '').trim();
  if (!current) return true;
  if (!isUsableName(current)) return true;
  if (current.toLowerCase() === canonical.toLowerCase()) return false;
  if (directoryNameHasEmoji(current) && !directoryNameHasEmoji(canonical)) return true;
  return current !== canonical;
}
