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
