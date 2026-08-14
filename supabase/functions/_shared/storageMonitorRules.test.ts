import { assertEquals } from 'jsr:@std/assert';
import {
  isReservedStoragePrefix,
  isSafeStorageOrphan,
  mediaIdFromStoragePath,
} from './storageMonitorRules.ts';

Deno.test('reserved prefixes are not treated as chats', () => {
  assertEquals(isReservedStoragePrefix('whatsapp-media'), true);
  assertEquals(isReservedStoragePrefix('unknown'), true);
  assertEquals(isReservedStoragePrefix('573207055017'), false);
});

Deno.test('media id comes from the filename stem', () => {
  assertEquals(mediaIdFromStoragePath('whatsapp-media/997064572654230.ogg'), '997064572654230');
  assertEquals(mediaIdFromStoragePath('573207055017/984007211189915.jpg'), '984007211189915');
});

Deno.test('safe orphan requires no index and no message references', () => {
  assertEquals(isSafeStorageOrphan({
    storagePath: 'whatsapp-media/111.ogg',
    indexedPaths: [],
    messageLogPaths: [],
    messageLogMediaIds: [],
  }), true);
  assertEquals(isSafeStorageOrphan({
    storagePath: 'whatsapp-media/222.pdf',
    indexedPaths: [],
    messageLogPaths: ['whatsapp-media/222.pdf'],
    messageLogMediaIds: [],
  }), false);
  assertEquals(isSafeStorageOrphan({
    storagePath: 'whatsapp-media/333.mp4',
    indexedPaths: [],
    messageLogPaths: [],
    messageLogMediaIds: ['333'],
  }), false);
});
