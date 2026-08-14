import { describe, expect, it } from 'vitest';
import {
  isReservedStoragePrefix,
  isSafeStorageOrphan,
  mediaIdFromStoragePath,
} from './storageMonitorRules';

describe('isReservedStoragePrefix', () => {
  it('rejects the bucket name and unknown folder as chats', () => {
    expect(isReservedStoragePrefix('whatsapp-media')).toBe(true);
    expect(isReservedStoragePrefix('unknown')).toBe(true);
    expect(isReservedStoragePrefix('  whatsapp-media  ')).toBe(true);
  });

  it('allows real conversation keys', () => {
    expect(isReservedStoragePrefix('573207055017')).toBe(false);
    expect(isReservedStoragePrefix('12084881739')).toBe(false);
  });
});

describe('mediaIdFromStoragePath', () => {
  it('reads the filename stem from a legacy bucket-prefixed path', () => {
    expect(mediaIdFromStoragePath('whatsapp-media/997064572654230.ogg')).toBe('997064572654230');
  });

  it('reads the filename stem from a phone-prefixed path', () => {
    expect(mediaIdFromStoragePath('573207055017/984007211189915.jpg')).toBe('984007211189915');
  });

  it('returns null for empty or folder-only paths', () => {
    expect(mediaIdFromStoragePath('')).toBeNull();
    expect(mediaIdFromStoragePath('/')).toBeNull();
  });
});

describe('isSafeStorageOrphan', () => {
  const emptyRefs = {
    indexedPaths: [] as string[],
    messageLogPaths: [] as string[],
    messageLogMediaIds: [] as string[],
  };

  it('allows a file with no index and no message references', () => {
    expect(isSafeStorageOrphan({
      ...emptyRefs,
      storagePath: 'whatsapp-media/111.ogg',
    })).toBe(true);
  });

  it('rejects a file that already has an asset row', () => {
    expect(isSafeStorageOrphan({
      ...emptyRefs,
      storagePath: '573207055017/111.jpg',
      indexedPaths: ['573207055017/111.jpg'],
    })).toBe(false);
  });

  it('rejects a file referenced by message_log.storage_path', () => {
    expect(isSafeStorageOrphan({
      ...emptyRefs,
      storagePath: 'whatsapp-media/222.pdf',
      messageLogPaths: ['whatsapp-media/222.pdf'],
    })).toBe(false);
  });

  it('rejects a file whose name matches a message_log.media_id', () => {
    expect(isSafeStorageOrphan({
      ...emptyRefs,
      storagePath: 'whatsapp-media/333.mp4',
      messageLogMediaIds: ['333'],
    })).toBe(false);
  });
});
