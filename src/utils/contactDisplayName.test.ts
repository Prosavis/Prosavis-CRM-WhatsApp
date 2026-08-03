import { describe, expect, it } from 'vitest';
import {
  contactNameForReminderRecipient,
  isUsableName,
  resolveContactDisplayName,
  resolveOutboundContactName,
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

describe('resolveOutboundContactName', () => {
  it('never overwrites a locked contact name', () => {
    expect(
      resolveOutboundContactName({
        incomingName: 'Linda Guzman',
        existingContactName: 'Alexandra Idarraga',
        contactNameLocked: true,
      }),
    ).toBeNull();
  });

  it('preserves an already-usable contact name (cleaner reminder case)', () => {
    expect(
      resolveOutboundContactName({
        incomingName: 'Linda Guzman',
        existingContactName: 'Doris Alexandra Idarraga',
        contactNameLocked: false,
      }),
    ).toBeNull();
  });

  it('sets name when conversation has no usable name yet', () => {
    expect(
      resolveOutboundContactName({
        incomingName: 'Linda Guzman',
        existingContactName: null,
        contactNameLocked: false,
      }),
    ).toBe('Linda Guzman');
  });

  it('rejects unusable incoming names', () => {
    expect(
      resolveOutboundContactName({
        incomingName: '😍😍',
        existingContactName: null,
      }),
    ).toBeNull();
  });
});

describe('contactNameForReminderRecipient', () => {
  it('passes clientName only for client recipients', () => {
    expect(contactNameForReminderRecipient('client', 'Linda Guzman')).toBe('Linda Guzman');
  });

  it('omits name for professional recipients (prevents client→cleaner overwrite)', () => {
    expect(contactNameForReminderRecipient('professional', 'Linda Guzman')).toBeUndefined();
  });
});
