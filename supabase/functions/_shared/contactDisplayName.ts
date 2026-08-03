const EMOJI_RE = /\p{Extended_Pictographic}/u;

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

export function nameHasEmoji(name: string | null | undefined): boolean {
  return EMOJI_RE.test(name ?? '');
}

/**
 * Decide whether an outbound ensureConversation should write contact_name.
 * Returns the trimmed name to set, or null to leave the existing value alone.
 *
 * - Locked CRM names are never overwritten.
 * - An already-usable contact_name is preserved (prevents clientName stamped
 *   onto a cleaner conversation during professional reminders).
 */
export function resolveOutboundContactName(options: {
  incomingName?: string | null;
  existingContactName?: string | null;
  contactNameLocked?: boolean | null;
}): string | null {
  if (options.contactNameLocked === true) return null;

  const incoming = (options.incomingName ?? '').trim();
  if (!isUsableName(incoming)) return null;

  const existing = (options.existingContactName ?? '').trim();
  if (isUsableName(existing)) return null;

  return incoming;
}

/** Nombre de conversación para recordatorios: solo el cliente aporta identidad. */
export function contactNameForReminderRecipient(
  recipientType: 'client' | 'professional',
  clientName: string | null | undefined,
): string | undefined {
  if (recipientType !== 'client') return undefined;
  const trimmed = (clientName ?? '').trim();
  return trimmed || undefined;
}
