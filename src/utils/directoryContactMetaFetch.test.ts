import { describe, expect, it } from 'vitest';
import {
  chunkStrings,
  directoryMetaFromRows,
  fetchDirectoryMetaByPhones,
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
