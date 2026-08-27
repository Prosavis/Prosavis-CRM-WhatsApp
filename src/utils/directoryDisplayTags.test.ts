import { describe, expect, it } from 'vitest';
import {
  catalogColorByTagName,
  directoryDisplayTags,
  directoryTagColor,
} from './directoryDisplayTags';

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

describe('directoryTagColor', () => {
  const catalog = catalogColorByTagName([
    { name: 'Auxiliares', color: '#c62828' },
    { name: 'TEST', color: '#1565c0' },
  ]);

  it('resolves catalog color by name ignoring case', () => {
    expect(directoryTagColor('Auxiliares', catalog)).toBe('#c62828');
    expect(directoryTagColor('auxiliares', catalog)).toBe('#c62828');
  });

  it('returns undefined for a label that is not in the catalog', () => {
    expect(directoryTagColor('Cliente nuevo', catalog)).toBeUndefined();
  });
});
