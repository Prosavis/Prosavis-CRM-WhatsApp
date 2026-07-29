import { describe, expect, it } from 'vitest';
import {
  isUsableName,
  resolveContactDisplayName,
  shouldSyncContactNameFromDirectory,
} from './contactDisplayName';

describe('isUsableName', () => {
  it('rejects emoji-only and short strings', () => {
    expect(isUsableName('😍😍')).toBe(false);
    expect(isUsableName('🤩🥰')).toBe(false);
    expect(isUsableName('a')).toBe(false);
    expect(isUsableName('')).toBe(false);
  });

  it('accepts names with letters, including emoji suffix', () => {
    expect(isUsableName('Roberto Dunoyer')).toBe(true);
    expect(isUsableName('Jules🍉')).toBe(true);
  });
});

describe('resolveContactDisplayName', () => {
  it('prefers locked contact_name over directory (DETEKTOR)', () => {
    expect(
      resolveContactDisplayName({
        directoryDisplayName: 'Jennifer Molina',
        contactName: 'DETEKTOR',
        contactNameLocked: true,
        phone: '+573215565169',
      }),
    ).toBe('DETEKTOR');
  });

  it('skips emoji-only contact_name and uses directory', () => {
    expect(
      resolveContactDisplayName({
        directoryDisplayName: 'Roberto Dunoyer',
        contactName: '😍😍',
        whatsappProfileName: '🤩🥰',
        phone: '+573001234567',
      }),
    ).toBe('Roberto Dunoyer');
  });

  it('falls back to phone when names are not usable', () => {
    expect(
      resolveContactDisplayName({
        contactName: '😍😍',
        whatsappProfileName: '💕',
        phone: '+573001234567',
      }),
    ).toBe('+573001234567');
  });

  it('uses directory over unlocked wrong contact_name', () => {
    expect(
      resolveContactDisplayName({
        directoryDisplayName: 'Johanna Guerra',
        contactName: 'Maria Helena',
        contactNameLocked: false,
      }),
    ).toBe('Johanna Guerra');
  });
});

describe('shouldSyncContactNameFromDirectory', () => {
  it('does not sync when contact name is locked', () => {
    expect(
      shouldSyncContactNameFromDirectory('Jennifer Molina', 'DETEKTOR', {
        contactNameLocked: true,
      }),
    ).toBe(false);
  });

  it('syncs emoji-only toward directory name', () => {
    expect(shouldSyncContactNameFromDirectory('Roberto Dunoyer', '😍😍')).toBe(true);
  });

  it('does not sync when already aligned', () => {
    expect(shouldSyncContactNameFromDirectory('Johanna Guerra', 'Johanna Guerra')).toBe(false);
  });
});
