export const SOUNDS_ENABLED_KEY = 'prosavis-crm-sounds-enabled';
export const SOUND_VOLUME_KEY = 'prosavis-crm-sound-volume';

export function areSoundsEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const saved = localStorage.getItem(SOUNDS_ENABLED_KEY);
  return saved === null ? true : saved === 'true';
}

export function getSoundVolume(): number {
  if (typeof window === 'undefined') return 0.3;
  const saved = localStorage.getItem(SOUND_VOLUME_KEY);
  if (saved === null) return 0.3;
  const volume = parseFloat(saved);
  if (Number.isNaN(volume)) return 0.3;
  return Math.max(0, Math.min(1, volume));
}

export function setSoundsEnabled(enabled: boolean): void {
  localStorage.setItem(SOUNDS_ENABLED_KEY, String(enabled));
}

export function setSoundVolume(volume: number): void {
  localStorage.setItem(SOUND_VOLUME_KEY, String(Math.max(0, Math.min(1, volume))));
}
