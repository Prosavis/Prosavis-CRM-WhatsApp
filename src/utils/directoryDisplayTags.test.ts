import { describe, expect, it } from 'vitest';
import { directoryDisplayTags } from './directoryDisplayTags';

describe('directoryDisplayTags', () => {
  it('uses directory tags and skips a duplicate classification', () => {
    expect(directoryDisplayTags({
      tags: ['Auxiliares'],
      classification: 'Auxiliares',
    })).toEqual(['Auxiliares']);
  });

  it('adds classification when it is not already a tag', () => {
    expect(directoryDisplayTags({
      tags: ['TEST'],
      classification: 'Agendado',
    })).toEqual(['TEST', 'Agendado']);
  });

  it('ignores unknown classification and empty tags', () => {
    expect(directoryDisplayTags({
      tags: ['', '  '],
      classification: 'unknown',
    })).toEqual([]);
  });
});
