import { describe, expect, it } from 'vitest';
import { extractPartialJsonString } from '../../supabase/functions/_shared/inboxAiStream';

describe('extractPartialJsonString', () => {
  it('reads a partial suggestion string', () => {
    const buffer = '{"booking":{},"suggestion":"Hola, te confir';
    expect(extractPartialJsonString(buffer, 'suggestion')).toBe('Hola, te confir');
  });

  it('unescapes a finished string', () => {
    const buffer = '{"suggestion":"Línea 1\\nLínea 2"}';
    expect(extractPartialJsonString(buffer, 'suggestion')).toBe('Línea 1\nLínea 2');
  });
});
