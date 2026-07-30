import { describe, expect, it } from 'vitest';
import { directoryPhonesMatch } from '@/utils/directoryPhone';
import { shouldSyncContactNameFromDirectory } from '@/utils/contactDisplayName';

/**
 * Documents the race that used to cross-write names:
 * stale directory name for phone A must never be applied to conversation phone B.
 */
describe('contact name cross-write guards', () => {
  it('rejects applying Monica directory identity onto Francy phone', () => {
    const monicaPhone = '+573046535806';
    const francyPhone = '+573012030253';
    expect(directoryPhonesMatch(monicaPhone, francyPhone)).toBe(false);
  });

  it('never syncs when contact name is locked (even if directory differs)', () => {
    expect(
      shouldSyncContactNameFromDirectory('Monica Cerritos', 'Francy Olivera', {
        contactNameLocked: true,
      }),
    ).toBe(false);
  });

  it('allows sync only when unlocked and names differ', () => {
    expect(
      shouldSyncContactNameFromDirectory('Francy Olivera', 'Monica Cerritos', {
        contactNameLocked: false,
      }),
    ).toBe(true);
  });
});
