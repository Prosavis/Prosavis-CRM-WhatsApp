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
    expect(isUsableName('Ana Perez')).toBe(true);
    expect(isUsableName('Lina🍉')).toBe(true);
  });
});

describe('resolveContactDisplayName', () => {
  it('prefers locked contact_name over directory (brand name)', () => {
    expect(
      resolveContactDisplayName({
        directoryDisplayName: 'Marta Lopez',
        contactName: 'ACME',
        contactNameLocked: true,
        phone: '+573001112233',
      }),
    ).toBe('ACME');
  });

  it('skips emoji-only contact_name and uses directory', () => {
    expect(
      resolveContactDisplayName({
        directoryDisplayName: 'Ana Perez',
        contactName: '😍😍',
        whatsappProfileName: '🤩🥰',
        phone: '+573001234567',
      }),
    ).toBe('Ana Perez');
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
        directoryDisplayName: 'Lucia Gomez',
        contactName: 'Maria Helena',
        contactNameLocked: false,
      }),
    ).toBe('Lucia Gomez');
  });
});

describe('shouldSyncContactNameFromDirectory', () => {
  it('does not sync when contact name is locked', () => {
    expect(
      shouldSyncContactNameFromDirectory('Marta Lopez', 'ACME', {
        contactNameLocked: true,
      }),
    ).toBe(false);
  });

  it('syncs emoji-only toward directory name', () => {
    expect(shouldSyncContactNameFromDirectory('Ana Perez', '😍😍')).toBe(true);
  });

  it('does not sync when already aligned', () => {
    expect(shouldSyncContactNameFromDirectory('Lucia Gomez', 'Lucia Gomez')).toBe(false);
  });
});

describe('resolveOutboundContactName', () => {
  it('never overwrites a locked contact name', () => {
    expect(
      resolveOutboundContactName({
        incomingName: 'Carla Ruiz',
        existingContactName: 'Sofia Ramirez',
        contactNameLocked: true,
      }),
    ).toBeNull();
  });

  it('preserves an already-usable contact name (cleaner reminder case)', () => {
    expect(
      resolveOutboundContactName({
        incomingName: 'Carla Ruiz',
        existingContactName: 'Sofia Elena Ramirez',
        contactNameLocked: false,
      }),
    ).toBeNull();
  });

  it('sets name when conversation has no usable name yet', () => {
    expect(
      resolveOutboundContactName({
        incomingName: 'Carla Ruiz',
        existingContactName: null,
        contactNameLocked: false,
      }),
    ).toBe('Carla Ruiz');
  });

  it('fills WhatsApp push name when the stored name is only a phone number', () => {
    expect(
      resolveOutboundContactName({
        incomingName: 'Nati',
        existingContactName: '573001110099',
        contactNameLocked: false,
      }),
    ).toBe('Nati');
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
    expect(contactNameForReminderRecipient('client', 'Carla Ruiz')).toBe('Carla Ruiz');
  });

  it('omits name for professional recipients (prevents client→cleaner overwrite)', () => {
    expect(contactNameForReminderRecipient('professional', 'Carla Ruiz')).toBeUndefined();
  });
});
