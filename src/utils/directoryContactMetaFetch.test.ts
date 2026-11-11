import { describe, expect, it } from 'vitest';
import {
  chunkStrings,
  createDirectoryChangeBatch,
  directoryMetaFromRows,
  directoryPhoneFromChange,
  fetchDirectoryMetaByPhones,
  mergePhoneMeta,
  type DirectoryMetaSourceRow,
} from './directoryContactMetaFetch';

function row(phoneKey: string, tags: string[]): DirectoryMetaSourceRow {
  return {
    phone: `+57${phoneKey}`,
    phone_key: phoneKey,
    photo_url: null,
    display_name: phoneKey === '3147591461' ? 'Liliana' : 'Otro',
    full_name: null,
    tags,
    classification: tags[0] ?? null,
  };
}

describe('chunkStrings', () => {
  it('splits phone keys into bounded batches', () => {
    expect(chunkStrings(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e'],
    ]);
  });
});

describe('directoryMetaFromRows', () => {
  it('keeps every directory tag, including Cliente Problemática', () => {
    const map = directoryMetaFromRows([
      row('3147591461', ['Cliente Problemática', 'Agendado']),
    ]);
    expect(map.get('3147591461')?.tags).toEqual([
      'Cliente Problemática',
      'Agendado',
    ]);
  });
});

describe('fetchDirectoryMetaByPhones', () => {
  it('loads later chunks so a tag past the first 1000 rows is not dropped', async () => {
    const requested: string[][] = [];
    const map = await fetchDirectoryMetaByPhones(
      ['1111111111', '3147591461'],
      async (phones) => {
        requested.push(phones);
        return phones.map((phone) =>
          row(
            phone,
            phone === '3147591461'
              ? ['Cliente Problemática', 'Agendado']
              : ['Agendado'],
          ),
        );
      },
      { chunkSize: 1, concurrency: 2 },
    );

    expect(requested).toHaveLength(2);
    expect(map.get('3147591461')?.tags).toContain('Cliente Problemática');
    expect(map.get('1111111111')?.tags).toEqual(['Agendado']);
  });
});

describe('directory contact refresh', () => {
  it('replaces one phone and leaves the rest of the bar in place', () => {
    const current = new Map([
      ['3001111111', { displayName: 'Ana', tags: ['Viejo'] }],
      ['3002222222', { displayName: 'Luis', tags: [] }],
    ]);
    const loaded = directoryMetaFromRows([
      {
        phone: '+573001111111',
        phone_key: '3001111111',
        photo_url: null,
        display_name: 'Ana María',
        full_name: null,
        tags: ['Agendado'],
        classification: null,
      },
    ]);
    const next = mergePhoneMeta(current, ['3001111111'], loaded);
    expect(next.get('3001111111')).toMatchObject({ displayName: 'Ana María', tags: ['Agendado'] });
    expect(next.get('3002222222')?.displayName).toBe('Luis');
  });

  it('flushes one refresh per burst and reloads once when a change has no phone', () => {
    const timers: Array<() => void> = [];
    const flushed: Array<{ phones: string[] } | { reloadAll: true }> = [];
    const batch = createDirectoryChangeBatch({
      schedule: (fn) => {
        timers.push(fn);
        return { cancel: () => undefined };
      },
      onFlush: (change) => flushed.push(change),
    });

    batch.push(directoryPhoneFromChange({ phone: '+573001111111' }));
    batch.push(directoryPhoneFromChange({ phone_key: '3002222222' }));
    expect(timers).toHaveLength(1);
    timers[0]?.();
    expect(flushed).toEqual([{ phones: ['3001111111', '3002222222'] }]);

    batch.push(directoryPhoneFromChange({ phone: '+573001111111' }));
    batch.push(directoryPhoneFromChange(null));
    expect(timers).toHaveLength(2);
    timers[1]?.();
    expect(flushed[1]).toEqual({ reloadAll: true });
  });
});
