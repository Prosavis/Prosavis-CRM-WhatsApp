import { describe, expect, it } from 'vitest';
import {
  cleanInboxAiSuggestionText,
  unescapeInboxAiNewlines,
} from '../../supabase/functions/_shared/inboxAiSuggestionText';

describe('unescapeInboxAiNewlines', () => {
  it('converts escaped \\n sequences used by Gemini JSON into real breaks', () => {
    expect(unescapeInboxAiNewlines('a\\nb\\n\\nc')).toBe('a\nb\n\nc');
  });

  it('leaves already-real newlines untouched', () => {
    expect(unescapeInboxAiNewlines('a\nb')).toBe('a\nb');
  });
});

describe('cleanInboxAiSuggestionText', () => {
  it('trims and collapses horizontal spaces without flattening paragraphs', () => {
    expect(cleanInboxAiSuggestionText('  Hola   mundo  \n\n  • 4 horas  ')).toBe(
      'Hola mundo\n\n• 4 horas',
    );
  });
});
