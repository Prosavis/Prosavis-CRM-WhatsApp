import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  INBOX_COMMERCIAL_SOUNDS_KEY,
  PLAYBACK_VOLUME,
  areInboxSoundsEnabled,
  areSoundsEnabled,
  getSoundVolume,
  inboxSoundsKey,
  setInboxSoundsEnabled,
  setSoundsEnabled,
} from './soundPreferences';

const store = new Map<string, string>();

function installLocalStorage() {
  store.clear();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: globalThis,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  });
}

describe('soundPreferences', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  afterEach(() => {
    store.clear();
  });

  it('defaults interface and both inboxes to on', () => {
    expect(areSoundsEnabled()).toBe(true);
    expect(areInboxSoundsEnabled('bot')).toBe(true);
    expect(areInboxSoundsEnabled('commercial')).toBe(true);
  });

  it('stores inbox toggles independently', () => {
    setInboxSoundsEnabled('bot', false);
    setInboxSoundsEnabled('commercial', true);
    expect(areInboxSoundsEnabled('bot')).toBe(false);
    expect(areInboxSoundsEnabled('commercial')).toBe(true);
    expect(areSoundsEnabled()).toBe(true);
  });

  it('keeps interface sounds separate from inbox alerts', () => {
    setSoundsEnabled(false);
    expect(areSoundsEnabled()).toBe(false);
    expect(areInboxSoundsEnabled('bot')).toBe(true);
  });

  it('uses a fixed playback volume', () => {
    expect(getSoundVolume()).toBe(PLAYBACK_VOLUME);
    expect(inboxSoundsKey('commercial')).toBe(INBOX_COMMERCIAL_SOUNDS_KEY);
  });
});
