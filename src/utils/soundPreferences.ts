export type InboxSoundLine = 'bot' | 'commercial';

export const SOUNDS_ENABLED_KEY = 'prosavis-crm-sounds-enabled';
export const INBOX_BOT_SOUNDS_KEY = 'prosavis-crm-inbox-bot-sounds-enabled';
export const INBOX_COMMERCIAL_SOUNDS_KEY = 'prosavis-crm-inbox-commercial-sounds-enabled';

/** Volumen fijo de reproducción. El slider se quitó: solo on/off. */
export const PLAYBACK_VOLUME = 0.85;

function readFlag(key: string, defaultValue = true): boolean {
  if (typeof window === 'undefined') return defaultValue;
  const saved = localStorage.getItem(key);
  return saved === null ? defaultValue : saved === 'true';
}

function writeFlag(key: string, enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, String(enabled));
}

export function areSoundsEnabled(): boolean {
  return readFlag(SOUNDS_ENABLED_KEY, true);
}

export function setSoundsEnabled(enabled: boolean): void {
  writeFlag(SOUNDS_ENABLED_KEY, enabled);
}

export function inboxSoundsKey(line: InboxSoundLine): string {
  return line === 'commercial' ? INBOX_COMMERCIAL_SOUNDS_KEY : INBOX_BOT_SOUNDS_KEY;
}

export function areInboxSoundsEnabled(line: InboxSoundLine): boolean {
  return readFlag(inboxSoundsKey(line), true);
}

export function setInboxSoundsEnabled(line: InboxSoundLine, enabled: boolean): void {
  writeFlag(inboxSoundsKey(line), enabled);
}

/** @deprecated El slider se eliminó. Sigue existiendo para no romper imports. */
export function getSoundVolume(): number {
  return PLAYBACK_VOLUME;
}

/** @deprecated El slider se eliminó. No-op a propósito. */
export function setSoundVolume(_volume: number): void {
  // El volumen ya no es configurable.
}
